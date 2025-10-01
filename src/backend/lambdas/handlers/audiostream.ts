import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const translate = new TranslateClient({});

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;
const TERMINOLOGY_TABLE = process.env.TERMINOLOGY_TABLE!;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT!;

const apigw = new ApiGatewayManagementApiClient({
  endpoint: WEBSOCKET_API_ENDPOINT.replace('wss://', 'https://'),
});

async function sendToConnection(connectionId: string, data: any) {
  await apigw.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(data)),
  }));
}

// In-memory buffer for audio chunks per session
const audioBuffers = new Map<string, Buffer[]>();

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const timestamp = new Date().toISOString();
  
  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 400,
        message: 'Invalid JSON',
        timestamp,
      });
      return { statusCode: 200 };
    }

    // Verify admin connection
    const connResult = await ddb.send(new GetCommand({
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
    const sessionResult = await ddb.send(new GetCommand({
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
    
    // Buffer audio chunks
    if (!audioBuffers.has(sessionId)) {
      audioBuffers.set(sessionId, []);
    }
    audioBuffers.get(sessionId)!.push(audioChunk);

    // Process when buffer reaches threshold or last chunk
    const buffer = audioBuffers.get(sessionId)!;
    const bufferSize = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
    
    if (bufferSize >= 64000 || isLastChunk) { // ~4 seconds at 16kHz
      const audioBuffer = Buffer.concat(buffer);
      audioBuffers.set(sessionId, []); // Clear buffer

      try {
        // Transcribe audio (mock for now - implement Transcribe streaming later)
        const transcribedText = await transcribeAudio(audioBuffer, session.audioConfig);
        
        if (transcribedText) {
          // Translate to all target languages
          await Promise.all(
            session.targetLanguages.map(async (targetLang: string) => {
              const translatedText = await translateText(
                transcribedText,
                session.sourceLanguage,
                targetLang
              );

              // Send to all clients with this language preference
              await broadcastTranslation(
                sessionId,
                session.sourceLanguage,
                targetLang,
                translatedText,
                transcribedText,
                sequenceNumber,
                timestamp
              );
            })
          );
        }
      } catch (error) {
        console.error('Audio processing error:', error);
      }
    }

    await sendToConnection(connectionId, {
      type: 'audio_ack',
      status: 'received',
      sequenceNumber,
      timestamp,
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error('Error:', error);
    try {
      await sendToConnection(connectionId, {
        type: 'error',
        code: 500,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    } catch {}
    return { statusCode: 500 };
  }
};

async function transcribeAudio(audioBuffer: Buffer, audioConfig: any): Promise<string> {
  // Mock transcription - TODO: Implement Transcribe streaming
  // For testing, return a sample phrase every few chunks
  const phrases = [
    "Bem-vindos à nossa igreja",
    "Vamos começar com uma oração",
    "Que Deus abençoe a todos",
    "Obrigado por estarem aqui",
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
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
  const result = await translate.send(new TranslateTextCommand({
    Text: processedText,
    SourceLanguageCode: sourceLang,
    TargetLanguageCode: targetLang,
  }));

  return result.TranslatedText || processedText;
}

async function getTerminology(): Promise<any[]> {
  // Get all terminology entries
  const result = await ddb.send(new ScanCommand({
    TableName: TERMINOLOGY_TABLE,
    Limit: 100,
  }));

  return result.Items || [];
}

async function broadcastTranslation(
  sessionId: string,
  sourceLanguage: string,
  targetLanguage: string,
  translatedText: string,
  sourceText: string,
  sequenceNumber: number,
  timestamp: string
) {
  // Get session to find participants
  const sessionResult = await ddb.send(new GetCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
  }));

  if (!sessionResult.Item?.participants) return;

  const participants = Array.isArray(sessionResult.Item.participants) 
    ? sessionResult.Item.participants 
    : Array.from(sessionResult.Item.participants as Set<string>);

  // Send to each participant with matching language preference
  await Promise.all(
    participants.map(async (connId) => {
      const conn = await ddb.send(new GetCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId: connId },
      }));

      if (conn.Item?.preferredLanguage === targetLanguage) {
        try {
          await apigw.send(new PostToConnectionCommand({
            ConnectionId: connId,
            Data: Buffer.from(JSON.stringify({
              type: 'translation',
              sessionId,
              sourceLanguage,
              targetLanguage,
              text: translatedText,
              confidence: 0.95,
              isFinal: true,
              timestamp,
              sequenceNumber,
              metadata: {
                sourceText,
                processingTime: 0,
                translationMethod: 'aws-translate',
              },
            })),
          }));
        } catch (error) {
          console.error(`Failed to send to ${connId}:`, error);
        }
      }
    })
  );
}
