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
        const { sessionId, sessionName, preferredLanguage = 'en' } = body;
        // Get connection info
        const connResult = await ddb.send(new lib_dynamodb_1.GetCommand({
            TableName: CONNECTIONS_TABLE,
            Key: { connectionId },
        }));
        if (!connResult.Item) {
            await sendToConnection(connectionId, {
                type: 'error',
                code: 404,
                message: 'Connection not found',
                timestamp,
            });
            return { statusCode: 200 };
        }
        const connectionType = connResult.Item.connectionType;
        let session;
        // Find session by ID or name
        if (sessionId) {
            const result = await ddb.send(new lib_dynamodb_1.GetCommand({
                TableName: SESSIONS_TABLE,
                Key: { sessionId },
            }));
            session = result.Item;
        }
        else if (sessionName) {
            const result = await ddb.send(new lib_dynamodb_1.QueryCommand({
                TableName: SESSIONS_TABLE,
                IndexName: 'sessionName-index',
                KeyConditionExpression: 'sessionName = :name',
                ExpressionAttributeValues: { ':name': sessionName },
            }));
            session = result.Items?.[0];
        }
        if (!session) {
            await sendToConnection(connectionId, {
                type: 'error',
                code: 404,
                message: 'Session not found',
                timestamp,
            });
            return { statusCode: 200 };
        }
        // For admin rejoin, resume session
        if (connectionType === 'admin') {
            await ddb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: SESSIONS_TABLE,
                Key: { sessionId: session.sessionId },
                UpdateExpression: 'SET #status = :started, adminConnectionId = :conn',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':started': 'started',
                    ':conn': connectionId,
                },
            }));
        }
        else {
            // Add client to participants
            await ddb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: SESSIONS_TABLE,
                Key: { sessionId: session.sessionId },
                UpdateExpression: 'ADD participants :conn',
                ExpressionAttributeValues: {
                    ':conn': new Set([connectionId]),
                },
            }));
        }
        // Update connection
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: CONNECTIONS_TABLE,
            Key: { connectionId },
            UpdateExpression: 'SET sessionId = :sid, preferredLanguage = :lang',
            ExpressionAttributeValues: {
                ':sid': session.sessionId,
                ':lang': preferredLanguage,
            },
        }));
        await sendToConnection(connectionId, {
            type: 'session_membership',
            status: 'joined',
            sessionId: session.sessionId,
            sessionName: session.sessionName,
            audioConfig: session.audioConfig,
            availableLanguages: session.targetLanguages,
            currentLanguage: preferredLanguage,
            startTime: session.startedAt,
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
