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
        // Remove from session participants
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: SESSIONS_TABLE,
            Key: { sessionId },
            UpdateExpression: 'DELETE participants :conn',
            ExpressionAttributeValues: {
                ':conn': new Set([connectionId]),
            },
        }));
        // Clear session from connection
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: CONNECTIONS_TABLE,
            Key: { connectionId },
            UpdateExpression: 'REMOVE sessionId, preferredLanguage',
        }));
        await sendToConnection(connectionId, {
            type: 'session_membership',
            status: 'left',
            sessionId,
            timestamp,
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
