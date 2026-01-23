import axios, { AxiosInstance } from 'axios';
import { exotelConfig } from '../../config/exotel.config';
import { logger } from '../../utils/logger';
import { ExotelWebhookPayload } from '../../types/workflow';

export class ExotelSMSService {
  private client: AxiosInstance;
  private baseUrl: string;
  private accountSid: string;
  private smsNumber: string;

  constructor() {
    this.accountSid = exotelConfig.sid;
    this.baseUrl = exotelConfig.apiUrl;
    this.smsNumber = process.env.EXOTEL_SMS_NUMBER || exotelConfig.whatsappNumber;

    this.client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: exotelConfig.sid,
        password: exotelConfig.token,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Send SMS message
   */
  async sendSMS(params: {
    to: string;
    body: string;
    customData?: string;
    statusCallback?: string;
    priority?: 'high' | 'normal';
  }): Promise<any> {
    try {
      const formData = new URLSearchParams();
      formData.append('From', this.smsNumber);
      formData.append('To', params.to);
      formData.append('Body', params.body);

      if (params.customData) {
        formData.append('CustomField', params.customData);
      }

      if (params.statusCallback) {
        formData.append('StatusCallback', params.statusCallback);
      }

      if (params.priority === 'high') {
        formData.append('Priority', 'high');
      }

      const response = await this.client.post(
        `/v1/Accounts/${this.accountSid}/Sms/send.json`,
        formData.toString()
      );

      logger.info('SMS sent successfully', {
        messageSid: response.data.SMSMessage?.Sid,
        to: params.to,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        error: error.message,
        response: error.response?.data,
        to: params.to,
      });
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulkSMS(params: {
    contacts: Array<{
      to: string;
      body: string;
      customData?: string;
    }>;
    statusCallback?: string;
  }): Promise<any[]> {
    const results: any[] = [];

    for (const contact of params.contacts) {
      try {
        const result = await this.sendSMS({
          to: contact.to,
          body: contact.body,
          customData: contact.customData,
          statusCallback: params.statusCallback,
        });

        results.push(result);

        // Rate limiting: wait 300ms between messages
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error: any) {
        logger.error('Failed to send bulk SMS', {
          error: error.message,
          contact,
        });
        results.push({
          error: error.message,
          contact,
        });
      }
    }

    return results;
  }

  /**
   * Get SMS details
   */
  async getSMSDetails(messageSid: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/v1/Accounts/${this.accountSid}/Sms/Messages/${messageSid}.json`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get SMS details', {
        error: error.message,
        messageSid,
      });
      throw new Error(`Failed to get SMS details: ${error.message}`);
    }
  }

  /**
   * Process incoming SMS webhook
   */
  async processSMSWebhook(payload: ExotelWebhookPayload): Promise<void> {
    try {
      logger.info('Processing SMS webhook', {
        messageSid: payload.SmsSid || payload.MessageSid,
        from: payload.From,
        body: payload.Body,
      });

      // This will be implemented in the webhook handler
      // Store message in database
      // Find or create customer by phone
      // Find or create thread
      // Create message record
      // Emit WebSocket event

      return;
    } catch (error: any) {
      logger.error('Failed to process SMS webhook', {
        error: error.message,
        payload,
      });
      throw error;
    }
  }

  /**
   * Schedule SMS for later delivery
   */
  async scheduleSMS(params: {
    to: string;
    body: string;
    scheduleTime: Date;
    customData?: string;
  }): Promise<any> {
    try {
      const formData = new URLSearchParams();
      formData.append('From', this.smsNumber);
      formData.append('To', params.to);
      formData.append('Body', params.body);
      formData.append('SendAt', params.scheduleTime.toISOString());

      if (params.customData) {
        formData.append('CustomField', params.customData);
      }

      const response = await this.client.post(
        `/v1/Accounts/${this.accountSid}/Sms/send.json`,
        formData.toString()
      );

      logger.info('SMS scheduled successfully', {
        messageSid: response.data.SMSMessage?.Sid,
        to: params.to,
        scheduleTime: params.scheduleTime,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to schedule SMS', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to schedule SMS: ${error.message}`);
    }
  }
}

export default new ExotelSMSService();
