import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  // Get connection info
  const connResult = await ddb.send(new GetCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));

  if (!connResult.Item) {
    return { statusCode: 200 };
  }

  const connection = connResult.Item;

  // If admin connection, pause active session
  if (connection.connectionType === 'admin' && connection.sessionId) {
    await ddb.send(new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId: connection.sessionId },
      UpdateExpression: 'SET #status = :paused, pausedAt = :timestamp',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':paused': 'paused',
        ':timestamp': new Date().toISOString(),
      },
    }));
  }

  // If client connection, remove from session participants
  if (connection.connectionType === 'client' && connection.sessionId) {
    await ddb.send(new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId: connection.sessionId },
      UpdateExpression: 'DELETE participants :conn',
      ExpressionAttributeValues: {
        ':conn': new Set([connectionId]),
      },
    }));
  }

  // Delete connection
  await ddb.send(new DeleteCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));

  return { statusCode: 200 };
};
