import axios, { AxiosInstance } from 'axios';
import { exotelConfig } from '../../config/exotel.config';
import { logger } from '../../utils/logger';
import { ExotelCallRequest, ExotelCallResponse, ExotelWebhookPayload } from '../../types/workflow';

export class ExotelTelephonyService {
  private client: AxiosInstance;
  private baseUrl: string;
  private accountSid: string;

  constructor() {
    this.accountSid = exotelConfig.sid;
    this.baseUrl = exotelConfig.apiUrl;

    this.client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: exotelConfig.sid,
        password: exotelConfig.token,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Make an outgoing call (Click-to-Call)
   */
  async makeCall(params: {
    from: string;
    to: string;
    virtualNumber: string;
    record?: boolean;
    maxDuration?: number;
    customField?: string;
    statusCallback?: string;
  }): Promise<ExotelCallResponse> {
    try {
      const payload: ExotelCallRequest = {
        from: {
          contact_uri: params.from,
          state_management: true,
        },
        to: {
          contact_uri: params.to,
        },
        virtual_number: params.virtualNumber,
        recording: {
          record: params.record ?? true,
          channels: 'single',
        },
        max_time_limit: params.maxDuration || 3600, // 1 hour default
        attempt_time_out: 45,
        custom_field: params.customField,
      };

      if (params.statusCallback) {
        payload.status_callback = [
          {
            event: 'terminal',
            url: params.statusCallback,
          },
        ];
      }

      const response = await this.client.post(
        `/v3/accounts/${this.accountSid}/calls`,
        payload
      );

      logger.info('Call initiated successfully', {
        callSid: response.data.call_sid,
        from: params.from,
        to: params.to,
      });

      return response.data as ExotelCallResponse;
    } catch (error: any) {
      logger.error('Failed to make call', {
        error: error.message,
        from: params.from,
        to: params.to,
      });
      throw new Error(`Failed to make call: ${error.message}`);
    }
  }

  /**
   * Get call details
   */
  async getCallDetails(callSid: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/v3/accounts/${this.accountSid}/calls/${callSid}`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get call details', {
        error: error.message,
        callSid,
      });
      throw new Error(`Failed to get call details: ${error.message}`);
    }
  }

  /**
   * Get call legs (detailed call flow)
   */
  async getCallLegs(callSid: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/v3/accounts/${this.accountSid}/calls/${callSid}/legs`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get call legs', {
        error: error.message,
        callSid,
      });
      throw new Error(`Failed to get call legs: ${error.message}`);
    }
  }

  /**
   * Process incoming call webhook
   */
  async processCallWebhook(payload: ExotelWebhookPayload): Promise<void> {
    try {
      logger.info('Processing call webhook', {
        callSid: payload.CallSid,
        status: payload.CallStatus,
        direction: payload.Direction,
      });

      // Store call details in database
      // Create communication thread if needed
      // Emit WebSocket event
      // TODO: Implement based on your requirements

      return;
    } catch (error: any) {
      logger.error('Failed to process call webhook', {
        error: error.message,
        payload,
      });
      throw error;
    }
  }

  /**
   * Make a call with IVR flow
   */
  async makeIVRCall(params: {
    from: string;
    to: string;
    virtualNumber: string;
    flowUrl: string;
    customField?: string;
  }): Promise<ExotelCallResponse> {
    try {
      const payload = {
        from: {
          contact_uri: params.from,
        },
        to: {
          contact_uri: params.to,
        },
        virtual_number: params.virtualNumber,
        flow_url: params.flowUrl,
        custom_field: params.customField,
      };

      const response = await this.client.post(
        `/v3/accounts/${this.accountSid}/calls/connect`,
        payload
      );

      logger.info('IVR call initiated', {
        callSid: response.data.call_sid,
        to: params.to,
      });

      return response.data as ExotelCallResponse;
    } catch (error: any) {
      logger.error('Failed to make IVR call', {
        error: error.message,
        to: params.to,
      });
      throw new Error(`Failed to make IVR call: ${error.message}`);
    }
  }

  /**
   * Bulk calls for notifications
   */
  async makeBulkCalls(params: {
    virtualNumber: string;
    contacts: Array<{
      from: string;
      to: string;
      customField?: string;
    }>;
    record?: boolean;
    statusCallback?: string;
  }): Promise<ExotelCallResponse[]> {
    const results: ExotelCallResponse[] = [];

    for (const contact of params.contacts) {
      try {
        const result = await this.makeCall({
          from: contact.from,
          to: contact.to,
          virtualNumber: params.virtualNumber,
          record: params.record,
          customField: contact.customField,
          statusCallback: params.statusCallback,
        });

        results.push(result);

        // Rate limiting: wait 500ms between calls
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        logger.error('Failed to make bulk call', {
          error: error.message,
          contact,
        });
        // Continue with next contact
      }
    }

    return results;
  }

  /**
   * Get call recording URL
   */
  async getCallRecording(callSid: string): Promise<string | null> {
    try {
      const callDetails = await this.getCallDetails(callSid);

      if (callDetails.recording_url) {
        return callDetails.recording_url;
      }

      return null;
    } catch (error: any) {
      logger.error('Failed to get call recording', {
        error: error.message,
        callSid,
      });
      return null;
    }
  }
}

export default new ExotelTelephonyService();
