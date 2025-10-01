"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    // Get connection info
    const connResult = await ddb.send(new lib_dynamodb_1.GetCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
    }));
    if (!connResult.Item) {
        return { statusCode: 200 };
    }
    const connection = connResult.Item;
    // If admin connection, pause active session
    if (connection.connectionType === 'admin' && connection.sessionId) {
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
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
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: SESSIONS_TABLE,
            Key: { sessionId: connection.sessionId },
            UpdateExpression: 'DELETE participants :conn',
            ExpressionAttributeValues: {
                ':conn': new Set([connectionId]),
            },
        }));
    }
    // Delete connection
    await ddb.send(new lib_dynamodb_1.DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
    }));
    return { statusCode: 200 };
};
exports.handler = handler;
