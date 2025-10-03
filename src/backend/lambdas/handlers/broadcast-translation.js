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
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    const timestamp = new Date().toISOString();
    try {
        const body = JSON.parse(event.body || '{}');
        const { sessionId, translatedTexts, isFinal, metadata } = body;
        // Verify admin connection
        const connResult = await ddb.send(new lib_dynamodb_1.GetCommand({
            TableName: CONNECTIONS_TABLE,
            Key: { connectionId },
        }));
        if (!connResult.Item || connResult.Item.connectionType !== 'admin') {
            return { statusCode: 403 };
        }
        // Get session participants
        const sessionResult = await ddb.send(new lib_dynamodb_1.GetCommand({
            TableName: SESSIONS_TABLE,
            Key: { sessionId },
        }));
        if (!sessionResult.Item) {
            return { statusCode: 404 };
        }
        const session = sessionResult.Item;
        const participants = Array.isArray(session.participants)
            ? session.participants
            : Array.from(session.participants || []);
        const translationMessage = {
            type: 'translation',
            sessionId,
            translatedTexts,
            isFinal,
            timestamp,
            metadata,
        };
        // Broadcast to all participants
        await Promise.all(participants.map(async (connId) => {
            try {
                await apigw.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
                    ConnectionId: connId,
                    Data: Buffer.from(JSON.stringify(translationMessage)),
                }));
            }
            catch (error) {
                console.error(`Failed to send to ${connId}:`, error);
            }
        }));
        return { statusCode: 200 };
    }
    catch (error) {
        console.error('Error:', error);
        return { statusCode: 500 };
    }
};
exports.handler = handler;
