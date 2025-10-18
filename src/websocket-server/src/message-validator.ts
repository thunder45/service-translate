import { 
  StartSessionMessage, 
  JoinSessionMessage, 
  LeaveSessionMessage, 
  LanguageChangeMessage,
  ConfigUpdateMessage,
  TranslationBroadcast,
  TargetLanguage
} from './types';

export class MessageValidator {
  
  /**
   * Validate target language
   */
  static isValidTargetLanguage(language: any): language is TargetLanguage {
    return typeof language === 'string' && 
           ['en', 'fr', 'es', 'de', 'it'].includes(language);
  }

  /**
   * Validate TTS mode
   */
  static isValidTTSMode(mode: any): mode is 'neural' | 'standard' | 'local' | 'disabled' {
    return typeof mode === 'string' && 
           ['neural', 'standard', 'local', 'disabled'].includes(mode);
  }

  /**
   * Validate audio quality
   */
  static isValidAudioQuality(quality: any): quality is 'high' | 'medium' | 'low' {
    return typeof quality === 'string' && 
           ['high', 'medium', 'low'].includes(quality);
  }


  /**
   * Validate start session message
   */
  static validateStartSession(data: any): { valid: boolean; error?: string; message?: StartSessionMessage } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (data.type !== 'start-session') {
      return { valid: false, error: 'Invalid message type' };
    }

    if (!data.config || typeof data.config !== 'object') {
      return { valid: false, error: 'Missing or invalid config' };
    }

    const { config } = data;

    if (!Array.isArray(config.enabledLanguages) || 
        !config.enabledLanguages.every(this.isValidTargetLanguage)) {
      return { valid: false, error: 'Invalid enabled languages' };
    }

    if (!this.isValidTTSMode(config.ttsMode)) {
      return { valid: false, error: 'Invalid TTS mode' };
    }

    if (!this.isValidAudioQuality(config.audioQuality)) {
      return { valid: false, error: 'Invalid audio quality' };
    }

    return { 
      valid: true, 
      message: data as StartSessionMessage 
    };
  }

  /**
   * Validate join session message
   */
  static validateJoinSession(data: any): { valid: boolean; error?: string; message?: JoinSessionMessage } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (data.type !== 'join-session') {
      return { valid: false, error: 'Invalid message type' };
    }

    if (!this.isValidTargetLanguage(data.preferredLanguage)) {
      return { valid: false, error: 'Invalid preferred language' };
    }

    // Audio capabilities are optional
    if (data.audioCapabilities && typeof data.audioCapabilities === 'object') {
      const caps = data.audioCapabilities;
      if (typeof caps.supportsPolly !== 'boolean' ||
          !Array.isArray(caps.localTTSLanguages) ||
          !Array.isArray(caps.audioFormats)) {
        return { valid: false, error: 'Invalid audio capabilities format' };
      }
    }

    return { 
      valid: true, 
      message: data as JoinSessionMessage 
    };
  }

  /**
   * Validate leave session message
   */
  static validateLeaveSession(data: any): { valid: boolean; error?: string; message?: LeaveSessionMessage } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (data.type !== 'leave-session') {
      return { valid: false, error: 'Invalid message type' };
    }

    return {
      valid: true, 
      message: data as LeaveSessionMessage 
    };
  }

  /**
   * Validate language change message
   */
  static validateLanguageChange(data: any): { valid: boolean; error?: string; message?: LanguageChangeMessage } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (data.type !== 'change-language') {
      return { valid: false, error: 'Invalid message type' };
    }

    if (!this.isValidTargetLanguage(data.newLanguage)) {
      return { valid: false, error: 'Invalid new language' };
    }

    return { 
      valid: true, 
      message: data as LanguageChangeMessage 
    };
  }

  /**
   * Validate config update message
   */
  static validateConfigUpdate(data: any): { valid: boolean; error?: string; message?: ConfigUpdateMessage } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (data.type !== 'config-update') {
      return { valid: false, error: 'Invalid message type' };
    }

    // Reuse the config validation from start session
    const configValidation = this.validateStartSession({ 
      type: 'start-session', 
      sessionId: data.sessionId, 
      config: data.config 
    });

    if (!configValidation.valid) {
      return { valid: false, error: configValidation.error };
    }

    return { 
      valid: true, 
      message: data as ConfigUpdateMessage 
    };
  }

  /**
   * Validate translation broadcast message
   */
  static validateTranslationBroadcast(data: any): { valid: boolean; error?: string; message?: TranslationBroadcast } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    if (data.type !== 'translation') {
      return { valid: false, error: 'Invalid message type' };
    }

    if (typeof data.text !== 'string' || data.text.trim().length === 0) {
      return { valid: false, error: 'Invalid or empty translation text' };
    }

    if (!this.isValidTargetLanguage(data.language)) {
      return { valid: false, error: 'Invalid target language' };
    }

    if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
      return { valid: false, error: 'Invalid timestamp' };
    }

    // Audio URL and useLocalTTS are optional
    if (data.audioUrl && typeof data.audioUrl !== 'string') {
      return { valid: false, error: 'Invalid audio URL format' };
    }

    if (data.useLocalTTS && typeof data.useLocalTTS !== 'boolean') {
      return { valid: false, error: 'Invalid useLocalTTS format' };
    }

    return { 
      valid: true, 
      message: data as TranslationBroadcast 
    };
  }
}
