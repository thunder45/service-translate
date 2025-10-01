import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const endpoint = process.env.WEBSOCKET_API_ENDPOINT?.replace('wss://', 'https://').replace('/prod', '');
const client = new ApiGatewayManagementApiClient({ endpoint });

export async function sendMessage(connectionId: string, data: any): Promise<void> {
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(data)),
  }));
}
