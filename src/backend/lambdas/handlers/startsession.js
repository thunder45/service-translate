"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const crypto_1 = require("crypto");
const qrcode_1 = __importDefault(require("qrcode"));
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
                details: { connectionType: 'Only admin connections can start sessions' },
                timestamp,
            });
            return { statusCode: 200 };
        }
        // Validate audio config
        const { audioConfig, sourceLanguage, targetLanguages, sessionName } = body;
        if (!audioConfig || !sourceLanguage || !targetLanguages) {
            await sendToConnection(connectionId, {
                type: 'error',
                code: 400,
                message: 'Missing required fields',
                details: { required: ['audioConfig', 'sourceLanguage', 'targetLanguages'] },
                timestamp,
            });
            return { statusCode: 200 };
        }
        // Validate audio config values
        const validSampleRates = [8000, 16000, 22050, 44100, 48000];
        const validEncodings = ['pcm', 'opus', 'flac'];
        const validChannels = [1, 2];
        if (!validSampleRates.includes(audioConfig.sampleRate) ||
            !validEncodings.includes(audioConfig.encoding) ||
            !validChannels.includes(audioConfig.channels)) {
            await sendToConnection(connectionId, {
                type: 'error',
                code: 400,
                message: 'Invalid audio configuration',
                details: {
                    sampleRate: 'Must be one of: 8000, 16000, 22050, 44100, 48000',
                    encoding: 'Must be one of: pcm, opus, flac',
                    channels: 'Must be 1 or 2',
                },
                timestamp,
            });
            return { statusCode: 200 };
        }
        // Check for session name conflict (only active/paused sessions)
        if (sessionName) {
            const existingSession = await ddb.send(new lib_dynamodb_1.QueryCommand({
                TableName: SESSIONS_TABLE,
                IndexName: 'sessionName-index',
                KeyConditionExpression: 'sessionName = :name',
                FilterExpression: '#status IN (:started, :paused)',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':name': sessionName,
                    ':started': 'started',
                    ':paused': 'paused',
                },
            }));
            if (existingSession.Items && existingSession.Items.length > 0) {
                await sendToConnection(connectionId, {
                    type: 'error',
                    code: 409,
                    message: 'Session name already exists',
                    details: { sessionName: 'A session with this name is already active' },
                    timestamp,
                });
                return { statusCode: 200 };
            }
        }
        // Create session
        const sessionId = (0, crypto_1.randomUUID)();
        const ttl = Math.floor(Date.now() / 1000) + 28800; // 8 hours
        // Generate QR code
        const wsUrl = WEBSOCKET_API_ENDPOINT.replace('https://', 'wss://');
        const joinUrl = `${wsUrl}?action=join&session=${sessionName || sessionId}`;
        const qrCode = await qrcode_1.default.toDataURL(joinUrl);
        // Create short URL (simplified - in production use URL shortener service)
        const shortUrl = `https://translate.example.com/join/${sessionName || sessionId}`;
        await ddb.send(new lib_dynamodb_1.PutCommand({
            TableName: SESSIONS_TABLE,
            Item: {
                sessionId,
                sessionName: sessionName || sessionId,
                adminConnectionId: connectionId,
                status: 'started',
                sourceLanguage,
                targetLanguages,
                audioConfig,
                startedAt: timestamp,
                participants: [],
                ttl,
            },
        }));
        // Update connection with session ID
        await ddb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: CONNECTIONS_TABLE,
            Key: { connectionId },
            UpdateExpression: 'SET sessionId = :sid',
            ExpressionAttributeValues: { ':sid': sessionId },
        }));
        await sendToConnection(connectionId, {
            type: 'session',
            sessionId,
            sessionName: sessionName || sessionId,
            status: 'started',
            timestamp,
            qrCode,
            shortUrl,
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
