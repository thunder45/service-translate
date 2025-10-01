import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 400,
        message: 'Invalid JSON',
        timestamp,
      });
      return { statusCode: 200 };
    }

    const { sessionId } = body;

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

    // Get session
    const sessionResult = await ddb.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }));

    if (!sessionResult.Item) {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 404,
        message: 'Session not found',
        timestamp,
      });
      return { statusCode: 200 };
    }

    const session = sessionResult.Item;
    const duration = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);

    // Update session status
    await ddb.send(new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
      UpdateExpression: 'SET #status = :ended, endedAt = :timestamp',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':ended': 'ended',
        ':timestamp': timestamp,
      },
    }));

    await sendToConnection(connectionId, {
      type: 'session',
      sessionId,
      status: 'ended',
      timestamp,
      statistics: {
        duration,
        audioProcessed: 0,
        translationsSent: 0,
        connectedUsers: session.participants?.length || 0,
      },
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
