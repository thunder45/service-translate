"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const apigw = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_API_ENDPOINT.replace('wss://', 'https://'),
});
async function sendToConnection(connectionId, data) {
    await apigw.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
    }));
}
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    const timestamp = new Date().toISOString();
    try {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        }
        catch {
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
        const connResult = await ddb.send(new lib_dynamodb_1.GetCommand({
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
        const sessionResult = await ddb.send(new lib_dynamodb_1.GetCommand({
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
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
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
    }
    catch (error) {
        console.error('Error:', error);
        try {
            await sendToConnection(connectionId, {
                type: 'error',
                code: 500,
                message: 'Internal server error',
                timestamp,
            });
        }
        catch { }
        return { statusCode: 500 };
    }
};
exports.handler = handler;
