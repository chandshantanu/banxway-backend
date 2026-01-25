import axios, { AxiosInstance } from 'axios';
import { exotelConfig } from '../../config/exotel.config';
import { logger } from '../../utils/logger';
import { ExotelWhatsAppMessage, ExotelWebhookPayload } from '../../types/workflow';

export class ExotelWhatsAppService {
  private client: AxiosInstance;
  private baseUrl: string;
  private accountSid: string;
  private whatsappNumber: string;

  constructor() {
    this.accountSid = exotelConfig.sid;
    this.baseUrl = exotelConfig.apiUrl;
    this.whatsappNumber = exotelConfig.whatsappNumber;

    this.client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: exotelConfig.apiKey,
        password: exotelConfig.token,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send text message via WhatsApp
   */
  async sendTextMessage(params: {
    to: string;
    text: string;
    customData?: string;
    statusCallback?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        status_callback: params.statusCallback,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'text',
                text: {
                  body: params.text,
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp text message sent', {
        messageSid: response.data.sid,
        to: params.to,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp text message', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }

  /**
   * Send image via WhatsApp
   */
  async sendImage(params: {
    to: string;
    imageUrl: string;
    caption?: string;
    customData?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'image',
                image: {
                  link: params.imageUrl,
                  caption: params.caption,
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp image sent', {
        messageSid: response.data.sid,
        to: params.to,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp image', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp image: ${error.message}`);
    }
  }

  /**
   * Send document via WhatsApp
   */
  async sendDocument(params: {
    to: string;
    documentUrl: string;
    filename: string;
    caption?: string;
    customData?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'document',
                document: {
                  link: params.documentUrl,
                  filename: params.filename,
                  caption: params.caption,
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp document sent', {
        messageSid: response.data.sid,
        to: params.to,
        filename: params.filename,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp document', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp document: ${error.message}`);
    }
  }

  /**
   * Send audio via WhatsApp
   */
  async sendAudio(params: {
    to: string;
    audioUrl: string;
    customData?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'audio',
                audio: {
                  link: params.audioUrl,
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp audio sent', {
        messageSid: response.data.sid,
        to: params.to,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp audio', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp audio: ${error.message}`);
    }
  }

  /**
   * Send video via WhatsApp
   */
  async sendVideo(params: {
    to: string;
    videoUrl: string;
    caption?: string;
    customData?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'video',
                video: {
                  link: params.videoUrl,
                  caption: params.caption,
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp video sent', {
        messageSid: response.data.sid,
        to: params.to,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp video', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp video: ${error.message}`);
    }
  }

  /**
   * Send location via WhatsApp
   */
  async sendLocation(params: {
    to: string;
    latitude: string;
    longitude: string;
    name?: string;
    address?: string;
    customData?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'location',
                location: {
                  latitude: params.latitude,
                  longitude: params.longitude,
                  name: params.name,
                  address: params.address,
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp location sent', {
        messageSid: response.data.sid,
        to: params.to,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp location', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp location: ${error.message}`);
    }
  }

  /**
   * Send template message via WhatsApp
   */
  async sendTemplate(params: {
    to: string;
    templateName: string;
    language: string;
    components?: any[];
    customData?: string;
  }): Promise<any> {
    try {
      const payload = {
        custom_data: params.customData,
        whatsapp: {
          messages: [
            {
              from: this.whatsappNumber,
              to: params.to,
              content: {
                type: 'template',
                template: {
                  name: params.templateName,
                  language: params.language,
                  components: params.components || [],
                },
              },
            },
          ],
        },
      };

      const response = await this.client.post(
        `/v2/accounts/${this.accountSid}/messages`,
        payload
      );

      logger.info('WhatsApp template sent', {
        messageSid: response.data.sid,
        to: params.to,
        template: params.templateName,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send WhatsApp template', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to send WhatsApp template: ${error.message}`);
    }
  }

  /**
   * Process incoming WhatsApp webhook
   */
  async processWhatsAppWebhook(payload: ExotelWebhookPayload): Promise<void> {
    try {
      logger.info('Processing WhatsApp webhook', {
        messageSid: payload.MessageSid,
        status: payload.MessageStatus,
        from: payload.From,
      });

      // Store message in database
      // Find or create customer by phone
      // Find or create thread
      // Create message record
      // Emit WebSocket event
      // TODO: Implement based on your requirements

      return;
    } catch (error: any) {
      logger.error('Failed to process WhatsApp webhook', {
        error: error.message,
        payload,
      });
      throw error;
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/v2/accounts/${this.accountSid}/messages/${messageSid}`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get message status', {
        error: error.message,
        messageSid,
      });
      throw new Error(`Failed to get message status: ${error.message}`);
    }
  }

  /**
   * Send bulk WhatsApp messages
   */
  async sendBulkMessages(params: {
    contacts: Array<{
      to: string;
      text: string;
      customData?: string;
    }>;
    statusCallback?: string;
  }): Promise<any[]> {
    const results: any[] = [];

    for (const contact of params.contacts) {
      try {
        const result = await this.sendTextMessage({
          to: contact.to,
          text: contact.text,
          customData: contact.customData,
          statusCallback: params.statusCallback,
        });

        results.push(result);

        // Rate limiting: wait 300ms between messages
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error: any) {
        logger.error('Failed to send bulk WhatsApp message', {
          error: error.message,
          contact,
        });
        // Continue with next contact
      }
    }

    return results;
  }
}

export default new ExotelWhatsAppService();
