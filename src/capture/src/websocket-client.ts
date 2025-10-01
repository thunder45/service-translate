import WebSocket from 'ws';

interface Config {
  endpoint: string;
  token: string;
  deviceId: string;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Config;
  private sequenceNumber = 0;

  constructor(config: Config) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const wsUrl = this.config.endpoint.replace('https://', 'wss://');
    const encodedToken = encodeURIComponent(`Bearer ${this.config.token}`);
    const url = `${wsUrl}?connectionType=admin&deviceId=${encodeURIComponent(this.config.deviceId)}&Authorization=${encodedToken}`;
    
    console.log('Connecting to:', url.replace(this.config.token, '***'));
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        console.log('WebSocket connected');
        resolve();
      });
      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        reject(err);
      });
      this.ws.on('message', (data) => this.handleMessage(data));
    });
  }

  async startSession(config: any): Promise<any> {
    return this.send({
      action: 'startsession',
      sourceLanguage: config.sourceLanguage || 'pt',
      targetLanguages: config.targetLanguages || ['en', 'fr', 'es', 'de', 'it'],
      sessionName: config.sessionName,
      audioConfig: config.audioConfig,
      timestamp: new Date().toISOString(),
    });
  }

  async listSessions(): Promise<any> {
    return this.send({
      action: 'listsessions',
      timestamp: new Date().toISOString(),
    });
  }

  async joinSession(sessionId: string): Promise<any> {
    return this.send({
      action: 'joinsession',
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  sendAudio(sessionId: string, audioData: Buffer): void {
    if (!this.ws) return;
    
    this.ws.send(JSON.stringify({
      action: 'audiostream',
      sessionId,
      sequenceNumber: this.sequenceNumber++,
      audioData: audioData.toString('base64'),
      timestamp: new Date().toISOString(),
    }));
  }

  async endSession(sessionId: string): Promise<any> {
    return this.send({
      action: 'endsession',
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private send(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('Not connected'));
        return;
      }

      const handler = (data: WebSocket.Data) => {
        const response = JSON.parse(data.toString());
        if (response.type === 'error') {
          reject(new Error(response.message));
        } else {
          resolve(response);
        }
        this.ws?.off('message', handler);
      };

      this.ws.on('message', handler);
      this.ws.send(JSON.stringify(message));
      
      setTimeout(() => {
        this.ws?.off('message', handler);
        reject(new Error('Timeout'));
      }, 10000);
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    const message = JSON.parse(data.toString());
    console.log('Received:', message);
  }
}
