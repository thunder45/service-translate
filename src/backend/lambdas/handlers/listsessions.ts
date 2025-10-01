import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT!;

const apigw = new ApiGatewayManagementApiClient({
  endpoint: WEBSOCKET_API_ENDPOINT.replace('wss://', 'https://'),
});

async function sendToConnection(connectionId: string, data: any) {
  await apigw.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(data)),
  }));
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const timestamp = new Date().toISOString();
  
  try {
    // Verify admin connection
    const connResult = await ddb.send(new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    }));

    if (!connResult.Item || connResult.Item.connectionType !== 'admin') {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 403,
        message: 'Admin connection required',
        timestamp,
      });
      return { statusCode: 200 };
    }

    // Get all sessions
    const result = await ddb.send(new ScanCommand({
      TableName: SESSIONS_TABLE,
    }));

    const sessions = (result.Items || []).map(item => ({
      sessionId: item.sessionId,
      sessionName: item.sessionName,
      status: item.status,
      sourceLanguage: item.sourceLanguage,
      targetLanguages: item.targetLanguages,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      participantCount: item.participants?.length || 0,
    }));

    await sendToConnection(connectionId, {
      type: 'sessions',
      sessions,
      timestamp,
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error('Error:', error);
    try {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 500,
        message: 'Internal server error',
        timestamp,
      });
    } catch {}
    return { statusCode: 500 };
  }
};
