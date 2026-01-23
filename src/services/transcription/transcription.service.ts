import axios from 'axios';
import FormData from 'form-data';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export interface TranscriptionResult {
  text: string;
  language?: string;
  confidence?: number;
  duration?: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export class TranscriptionService {
  private openAIKey: string;
  private provider: 'openai' | 'assemblyai' | 'deepgram';

  constructor() {
    this.openAIKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '';
    this.provider = (process.env.TRANSCRIPTION_PROVIDER as any) || 'openai';
  }

  /**
   * Transcribe audio file using OpenAI Whisper
   */
  async transcribeWithOpenAI(audioUrl: string): Promise<TranscriptionResult> {
    try {
      // Download audio file
      const audioBuffer = await this.downloadAudio(audioUrl);

      // Create temp file
      const tempFilePath = path.join('/tmp', `audio-${Date.now()}.mp3`);
      fs.writeFileSync(tempFilePath, audioBuffer);

      // Create form data
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempFilePath));
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // Auto-detect or specify
      formData.append('response_format', 'verbose_json');

      // Call OpenAI Whisper API
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.openAIKey}`,
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      // Clean up temp file
      fs.unlinkSync(tempFilePath);

      logger.info('Audio transcribed successfully', {
        audioUrl,
        textLength: response.data.text?.length,
      });

      return {
        text: response.data.text,
        language: response.data.language,
        duration: response.data.duration,
        segments: response.data.segments,
        confidence: 0.9, // OpenAI doesn't provide confidence, use default
      };
    } catch (error: any) {
      logger.error('Failed to transcribe audio with OpenAI', {
        error: error.message,
        audioUrl,
      });

      // Clean up temp file on error
      try {
        const tempFiles = fs.readdirSync('/tmp').filter(f => f.startsWith('audio-'));
        tempFiles.forEach(f => fs.unlinkSync(path.join('/tmp', f)));
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  /**
   * Transcribe audio file using AssemblyAI (alternative provider)
   */
  async transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptionResult> {
    try {
      const assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;

      if (!assemblyAIKey) {
        throw new Error('AssemblyAI API key not configured');
      }

      // Upload audio to AssemblyAI
      const uploadResponse = await axios.post(
        'https://api.assemblyai.com/v2/upload',
        await this.downloadAudio(audioUrl),
        {
          headers: {
            'authorization': assemblyAIKey,
            'content-type': 'application/octet-stream',
          },
        }
      );

      const audioUploadUrl = uploadResponse.data.upload_url;

      // Request transcription
      const transcriptResponse = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
          audio_url: audioUploadUrl,
          language_detection: true,
        },
        {
          headers: {
            'authorization': assemblyAIKey,
            'content-type': 'application/json',
          },
        }
      );

      const transcriptId = transcriptResponse.data.id;

      // Poll for completion
      let transcript;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while (attempts < maxAttempts) {
        const statusResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: {
              'authorization': assemblyAIKey,
            },
          }
        );

        transcript = statusResponse.data;

        if (transcript.status === 'completed') {
          break;
        } else if (transcript.status === 'error') {
          throw new Error(transcript.error);
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      if (!transcript || transcript.status !== 'completed') {
        throw new Error('Transcription timed out');
      }

      logger.info('Audio transcribed successfully with AssemblyAI', {
        audioUrl,
        textLength: transcript.text?.length,
      });

      return {
        text: transcript.text,
        language: transcript.language_code,
        confidence: transcript.confidence,
        duration: transcript.audio_duration,
      };
    } catch (error: any) {
      logger.error('Failed to transcribe audio with AssemblyAI', {
        error: error.message,
        audioUrl,
      });
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  /**
   * Download audio file from URL
   */
  private async downloadAudio(url: string): Promise<Buffer> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error('Failed to download audio', {
        error: error.message,
        url,
      });
      throw new Error(`Failed to download audio: ${error.message}`);
    }
  }

  /**
   * Main transcription method - uses configured provider
   */
  async transcribe(audioUrl: string): Promise<TranscriptionResult> {
    try {
      switch (this.provider) {
        case 'openai':
          return await this.transcribeWithOpenAI(audioUrl);
        case 'assemblyai':
          return await this.transcribeWithAssemblyAI(audioUrl);
        default:
          return await this.transcribeWithOpenAI(audioUrl);
      }
    } catch (error: any) {
      logger.error('Transcription failed', {
        error: error.message,
        provider: this.provider,
        audioUrl,
      });
      throw error;
    }
  }

  /**
   * Test transcription service
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with a minimal request
      if (this.provider === 'openai' && this.openAIKey) {
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error('Transcription service test failed', { error: error.message });
      return false;
    }
  }
}

export default new TranscriptionService();
