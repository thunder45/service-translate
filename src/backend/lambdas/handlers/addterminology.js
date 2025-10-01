"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const TERMINOLOGY_TABLE = process.env.TERMINOLOGY_TABLE;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const apigw = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_API_ENDPOINT?.replace('wss://', 'https://'),
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
        const rejected = [];
        for (const entry of entries) {
            if (!entry.sourceText || !entry.translations) {
                rejected.push({ sourceText: entry.sourceText || 'unknown', reason: 'Missing required fields' });
                continue;
            }
            try {
                await ddb.send(new lib_dynamodb_1.PutCommand({
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
            }
            catch (error) {
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
