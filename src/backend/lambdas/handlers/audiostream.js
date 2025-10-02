"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_translate_1 = require("@aws-sdk/client-translate");
const client_transcribe_streaming_1 = require("@aws-sdk/client-transcribe-streaming");
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const translate = new client_translate_1.TranslateClient({});
const transcribe = new client_transcribe_streaming_1.TranscribeStreamingClient({});
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const TERMINOLOGY_TABLE = process.env.TERMINOLOGY_TABLE;
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
// In-memory buffer for audio chunks per session
const audioBuffers = new Map();
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
                timestamp,
            });
            return { statusCode: 200 };
        }
        const { sessionId, sequenceNumber, audioData, isLastChunk } = body;
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
        // Decode audio data
        const audioChunk = Buffer.from(audioData, 'base64');
        console.log(`Received audio chunk: ${audioChunk.length} bytes, seq: ${sequenceNumber}, isLast: ${isLastChunk}`);
        // Buffer audio chunks
        if (!audioBuffers.has(sessionId)) {
            audioBuffers.set(sessionId, []);
        }
        audioBuffers.get(sessionId).push(audioChunk);
        // Process when buffer reaches threshold or last chunk
        const buffer = audioBuffers.get(sessionId);
        const bufferSize = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
        console.log(`Buffer size: ${bufferSize} bytes, threshold: 8192`);
        if (bufferSize >= 8192 || isLastChunk) {
            const audioBuffer = Buffer.concat(buffer);
            audioBuffers.set(sessionId, []);
            try {
                const transcribedText = await transcribeAudio(audioBuffer, session.audioConfig);
                console.log(`Transcribed: "${transcribedText}"`);
                if (transcribedText) {
                    // Translate to all target languages
                    const translations = await Promise.all(session.targetLanguages.map(async (targetLang) => {
                        const text = await translateText(transcribedText, session.sourceLanguage, targetLang);
                        console.log(`Translated to ${targetLang}: "${text}"`);
                        return { targetLanguage: targetLang, text, confidence: 0.95 };
                    }));
                    // Send grouped translation
                    await broadcastTranslation(sessionId, transcribedText, session.sourceLanguage, translations, sequenceNumber, timestamp);
                }
            }
            catch (error) {
                console.error('Audio processing error:', error);
            }
        }
        return { statusCode: 200 };
    }
    catch (error) {
        console.error('Error:', error);
        try {
            await sendToConnection(connectionId, {
                type: 'error',
                code: 500,
                message: 'Internal server error',
                timestamp: new Date().toISOString(),
            });
        }
        catch { }
        return { statusCode: 500 };
    }
};
exports.handler = handler;
async function transcribeAudio(audioBuffer, audioConfig) {
    const audioStream = async function* () {
        yield { AudioEvent: { AudioChunk: audioBuffer } };
    };
    const command = new client_transcribe_streaming_1.StartStreamTranscriptionCommand({
        LanguageCode: 'pt-BR',
        MediaSampleRateHertz: audioConfig.sampleRate || 16000,
        MediaEncoding: 'pcm',
        AudioStream: audioStream(),
    });
    const response = await transcribe.send(command);
    let transcript = '';
    if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
            if (event.TranscriptEvent?.Transcript?.Results) {
                for (const result of event.TranscriptEvent.Transcript.Results) {
                    console.log(`Transcribe result: IsPartial=${result.IsPartial}, text="${result.Alternatives?.[0]?.Transcript}"`);
                    if (!result.IsPartial && result.Alternatives && result.Alternatives[0]?.Transcript) {
                        transcript += result.Alternatives[0].Transcript + ' ';
                    }
                }
            }
        }
    }
    return transcript.trim();
}
async function translateText(text, sourceLang, targetLang) {
    // Get custom terminology
    const terminology = await getTerminology();
    // Apply terminology replacements
    let processedText = text;
    for (const term of terminology) {
        if (term.translations[targetLang]) {
            const regex = new RegExp(term.sourceText, 'gi');
            processedText = processedText.replace(regex, term.translations[targetLang]);
        }
    }
    // Translate with AWS Translate
    const result = await translate.send(new client_translate_1.TranslateTextCommand({
        Text: processedText,
        SourceLanguageCode: sourceLang,
        TargetLanguageCode: targetLang,
    }));
    return result.TranslatedText || processedText;
}
async function getTerminology() {
    // Get all terminology entries
    const result = await ddb.send(new lib_dynamodb_1.ScanCommand({
        TableName: TERMINOLOGY_TABLE,
        Limit: 100,
    }));
    return result.Items || [];
}
async function broadcastTranslation(sessionId, sourceText, sourceLanguage, translations, sequenceNumber, timestamp) {
    const sessionResult = await ddb.send(new lib_dynamodb_1.GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId },
    }));
    if (!sessionResult.Item)
        return;
    const session = sessionResult.Item;
    const participants = Array.isArray(session.participants)
        ? session.participants
        : Array.from(session.participants || []);
    const translationMessage = {
        type: 'translation',
        sessionId,
        translatedTexts: translations,
        isFinal: true,
        timestamp,
        sequenceNumber,
        metadata: {
            sourceText,
            sourceLanguage,
            processingTime: 0,
            translationMethod: 'aws-translate',
        },
    };
    // Send to admin connection
    if (session.adminConnectionId) {
        try {
            await apigw.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
                ConnectionId: session.adminConnectionId,
                Data: Buffer.from(JSON.stringify(translationMessage)),
            }));
        }
        catch (error) {
            console.error(`Failed to send to admin ${session.adminConnectionId}:`, error);
        }
    }
    // Send to all participants
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
}
