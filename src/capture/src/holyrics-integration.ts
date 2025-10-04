import axios from 'axios';

export interface HolyricsConfig {
  host: string;
  port: number;
  token: string;
  enabled: boolean;
  language: string; // Which language to display on big screen
  maxLines: number; // Maximum lines to show
}

export class HolyricsIntegration {
  private config: HolyricsConfig;
  private displayedText: string = '';
  private sentences: string[] = [];

  constructor(config: HolyricsConfig) {
    this.config = config;
  }

  async sendText(text: string, show: boolean = true): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const url = `http://${this.config.host}:${this.config.port}/api/SetTextCP?token=${this.config.token}`;
      
      console.log(`[Holyrics] Sending to ${this.config.host}:${this.config.port}...`);
      
      const response = await axios.post(url, {
        text: text,
        show: show,
        display_ahead: true
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      console.log(`[Holyrics] ✅ Success (${response.status}):`, text.substring(0, 50));
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`[Holyrics] ❌ Connection refused - is Holyrics running at ${this.config.host}:${this.config.port}?`);
      } else if (error.code === 'ETIMEDOUT') {
        console.error(`[Holyrics] ❌ Timeout - check network connection to ${this.config.host}`);
      } else if (error.response) {
        console.error(`[Holyrics] ❌ HTTP ${error.response.status}:`, error.response.data);
      } else {
        console.error('[Holyrics] ❌ Error:', error.message);
      }
      throw error;
    }
  }

  async addTranslation(newText: string): Promise<void> {
    if (!this.config.enabled || !newText.trim()) return;

    // Add new sentence
    this.sentences.push(newText.trim());

    // Keep only last N sentences
    if (this.sentences.length > this.config.maxLines) {
      this.sentences = this.sentences.slice(-this.config.maxLines);
    }

    // Join sentences for display
    this.displayedText = this.sentences.join('. ');
    if (this.displayedText && !this.displayedText.endsWith('.')) {
      this.displayedText += '.';
    }

    console.log(`[Holyrics] Displaying (${this.config.language}):`, this.displayedText.substring(0, 50));
    await this.sendText(this.displayedText);
  }

  async clear(): Promise<void> {
    if (!this.config.enabled) return;

    this.displayedText = '';
    this.sentences = [];
    await this.sendText('', false);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.sendText('Test connection', true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.clear();
      return true;
    } catch (error) {
      console.error('Holyrics connection test failed:', error);
      return false;
    }
  }

  updateConfig(newConfig: Partial<HolyricsConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Static method for testing without instance
  static async testConnectionStatic(config: HolyricsConfig): Promise<boolean> {
    try {
      const url = `http://${config.host}:${config.port}/api/SetTextCP?token=${config.token}`;
      
      console.log('[Holyrics Test] Sending test message to:', url);
      console.log('[Holyrics Test] Payload:', { text: 'Teste de conexão com Holyrics', show: true, display_ahead: true });
      
      await axios.post(url, {
        text: 'Teste de conexão com Holyrics',
        show: true,
        display_ahead: true
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      console.log('[Holyrics Test] ✅ Test message sent successfully');
      return true;
    } catch (error) {
      console.error('[Holyrics Test] ❌ Failed:', error);
      return false;
    }
  }
}
