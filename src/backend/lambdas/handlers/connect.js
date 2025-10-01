"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_jwt_verify_1 = require("aws-jwt-verify");
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const USER_POOL_ID = process.env.USER_POOL_ID;
const verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId: USER_POOL_ID,
    tokenUse: 'access',
    clientId: null,
});
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    const queryParams = event.queryStringParameters || {};
    const timestamp = new Date().toISOString();
    const connectionType = queryParams.connectionType;
    const deviceId = queryParams.deviceId;
    const authHeader = queryParams.Authorization;
    // Validate connection type
    if (!connectionType || !['admin', 'client'].includes(connectionType)) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                type: 'error',
                code: 400,
                message: 'Invalid connection type',
                details: { connectionType: "Must be 'admin' or 'client'" },
                timestamp,
            }),
        };
    }
    // Validate device ID
    if (!deviceId) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                type: 'error',
                code: 400,
                message: 'Device ID required',
                details: { deviceId: 'Device ID must be provided' },
                timestamp,
            }),
        };
    }
    let userId;
    // Admin connections require JWT authentication
    if (connectionType === 'admin') {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    type: 'error',
                    code: 401,
                    message: 'Authentication required',
                    details: { connectionType: 'Admin connections require valid JWT token' },
                    timestamp,
                }),
            };
        }
        const token = authHeader.substring(7); // Remove "Bearer "
        try {
            const payload = await verifier.verify(token);
            userId = payload.sub;
        }
        catch (error) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    type: 'error',
                    code: 403,
                    message: 'Invalid authentication token',
                    details: { token: 'JWT token is expired or invalid' },
                    timestamp,
                }),
            };
        }
    }
    // Store connection
    const ttl = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    await ddb.send(new lib_dynamodb_1.PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
            connectionId,
            connectionType,
            deviceId,
            userId,
            connectedAt: timestamp,
            lastActivity: timestamp,
            ttl,
        },
    }));
    return {
        statusCode: 200,
        body: JSON.stringify({
            type: 'connection',
            connectionId,
            status: 'connected',
            timestamp,
        }),
    };
};
exports.handler = handler;
