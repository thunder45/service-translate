import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TERMINOLOGY_TABLE = process.env.TERMINOLOGY_TABLE!;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT!;

const apigw = new ApiGatewayManagementApiClient({
  endpoint: WEBSOCKET_API_ENDPOINT?.replace('wss://', 'https://'),
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

    const { entries } = body;
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 400,
        message: 'Invalid entries',
        timestamp,
      });
      return { statusCode: 200 };
    }

    let added = 0;
    const rejected: Array<{ sourceText: string; reason: string }> = [];

    for (const entry of entries) {
      if (!entry.sourceText || !entry.translations) {
        rejected.push({ sourceText: entry.sourceText || 'unknown', reason: 'Missing required fields' });
        continue;
      }

      try {
        await ddb.send(new PutCommand({
          TableName: TERMINOLOGY_TABLE,
          Item: {
            sourceText: entry.sourceText,
            translations: entry.translations,
            category: entry.category || 'general',
            confidence: entry.confidence || 1.0,
            priority: entry.priority || 5,
            context: entry.context,
            createdAt: timestamp,
            updatedAt: timestamp,
            usageCount: 0,
          },
        }));
        added++;
      } catch (error) {
        rejected.push({ sourceText: entry.sourceText, reason: 'Database error' });
      }
    }

    await sendToConnection(connectionId, {
      type: 'terminology',
      status: rejected.length > 0 ? 'partial' : 'added',
      entriesAdded: added,
      entriesRejected: rejected.length,
      rejectedEntries: rejected,
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
