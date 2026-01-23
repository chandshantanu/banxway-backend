import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import axios from 'axios';

const router = Router();

// Only enable in development
if (process.env.NODE_ENV !== 'production') {
  /**
   * List all available test webhook endpoints
   * GET /api/v1/test/webhooks
   */
  router.get('/', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Test Webhook Endpoints - For Local Development Only',
      endpoints: [
        {
          name: 'Test SMS Webhook',
          method: 'POST',
          path: '/api/v1/test/webhooks/sms',
          description: 'Simulate an incoming SMS or SMS status update from Exotel',
          examplePayload: {
            incoming: {
              SmsSid: 'test-sms-' + Date.now(),
              From: '+919876543210',
              To: process.env.EXOTEL_SMS_NUMBER,
              Body: 'Test incoming SMS message',
              Status: 'received',
            },
            statusUpdate: {
              SmsSid: 'test-sms-' + Date.now(),
              Status: 'delivered',
            },
          },
        },
        {
          name: 'Test WhatsApp Webhook',
          method: 'POST',
          path: '/api/v1/test/webhooks/whatsapp',
          description: 'Simulate an incoming WhatsApp message or status update from Exotel',
          examplePayload: {
            incoming: {
              MessageSid: 'test-wa-' + Date.now(),
              From: 'whatsapp:+919876543210',
              To: 'whatsapp:' + process.env.EXOTEL_WHATSAPP_NUMBER,
              Body: 'Test incoming WhatsApp message',
              MessageStatus: 'received',
            },
            statusUpdate: {
              MessageSid: 'test-wa-' + Date.now(),
              MessageStatus: 'delivered',
            },
          },
        },
        {
          name: 'Test Voice Call Webhook',
          method: 'POST',
          path: '/api/v1/test/webhooks/call',
          description: 'Simulate a voice call webhook from Exotel',
          examplePayload: {
            incoming: {
              CallSid: 'test-call-' + Date.now(),
              From: '+919876543210',
              To: process.env.EXOTEL_PHONE_NUMBER,
              Direction: 'inbound',
              CallStatus: 'completed',
              CallDuration: '120',
              RecordingUrl: 'https://example.com/recording.mp3',
            },
            outbound: {
              CallSid: 'test-call-' + Date.now(),
              From: process.env.EXOTEL_PHONE_NUMBER,
              To: '+919876543210',
              Direction: 'outbound',
              CallStatus: 'completed',
              CallDuration: '85',
              RecordingUrl: 'https://example.com/recording.mp3',
            },
          },
        },
      ],
    });
  });

  /**
   * Test SMS Webhook
   * POST /api/v1/test/webhooks/sms
   */
  router.post('/sms', async (req: Request, res: Response) => {
    try {
      const payload = req.body;

      logger.info('Test SMS webhook triggered', { payload });

      // Add default values if not provided
      const webhookPayload = {
        SmsSid: payload.SmsSid || 'test-sms-' + Date.now(),
        MessageSid: payload.MessageSid || payload.SmsSid || 'test-sms-' + Date.now(),
        From: payload.From || '+919876543210',
        To: payload.To || process.env.EXOTEL_SMS_NUMBER,
        Body: payload.Body,
        Status: payload.Status || 'received',
        SmsStatus: payload.SmsStatus || payload.Status || 'received',
      };

      // Forward to actual SMS webhook
      const webhookUrl = `http://localhost:${process.env.PORT || 8000}/api/v1/webhooks/exotel/sms`;
      const response = await axios.post(webhookUrl, webhookPayload);

      res.json({
        success: true,
        message: 'Test SMS webhook processed',
        payload: webhookPayload,
        webhookResponse: response.data,
      });
    } catch (error: any) {
      logger.error('Test SMS webhook failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Test WhatsApp Webhook
   * POST /api/v1/test/webhooks/whatsapp
   */
  router.post('/whatsapp', async (req: Request, res: Response) => {
    try {
      const payload = req.body;

      logger.info('Test WhatsApp webhook triggered', { payload });

      // Add default values if not provided
      const webhookPayload = {
        MessageSid: payload.MessageSid || 'test-wa-' + Date.now(),
        From: payload.From || 'whatsapp:+919876543210',
        To: payload.To || 'whatsapp:' + process.env.EXOTEL_WHATSAPP_NUMBER,
        Body: payload.Body,
        MessageStatus: payload.MessageStatus || 'received',
        MediaUrl: payload.MediaUrl,
      };

      // Forward to actual WhatsApp webhook
      const webhookUrl = `http://localhost:${process.env.PORT || 8000}/api/v1/webhooks/exotel/whatsapp`;
      const response = await axios.post(webhookUrl, webhookPayload);

      res.json({
        success: true,
        message: 'Test WhatsApp webhook processed',
        payload: webhookPayload,
        webhookResponse: response.data,
      });
    } catch (error: any) {
      logger.error('Test WhatsApp webhook failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Test Voice Call Webhook
   * POST /api/v1/test/webhooks/call
   */
  router.post('/call', async (req: Request, res: Response) => {
    try {
      const payload = req.body;

      logger.info('Test call webhook triggered', { payload });

      // Add default values if not provided
      const webhookPayload = {
        CallSid: payload.CallSid || 'test-call-' + Date.now(),
        From: payload.From || '+919876543210',
        To: payload.To || process.env.EXOTEL_PHONE_NUMBER,
        Direction: payload.Direction || 'inbound',
        CallStatus: payload.CallStatus || 'completed',
        CallDuration: payload.CallDuration || '60',
        RecordingUrl: payload.RecordingUrl,
        CustomField: payload.CustomField,
      };

      // Forward to actual call webhook
      const webhookUrl = `http://localhost:${process.env.PORT || 8000}/api/v1/webhooks/exotel/call`;
      const response = await axios.post(webhookUrl, webhookPayload);

      res.json({
        success: true,
        message: 'Test call webhook processed',
        payload: webhookPayload,
        webhookResponse: response.data,
      });
    } catch (error: any) {
      logger.error('Test call webhook failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Batch test webhooks for a complete conversation flow
   * POST /api/v1/test/webhooks/batch
   */
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const { customerPhone = '+919876543210', scenario = 'basic' } = req.body;

      const results: any[] = [];

      if (scenario === 'basic') {
        // Simulate: Incoming SMS -> WhatsApp reply -> Voice call

        // 1. Incoming SMS
        const smsPayload = {
          SmsSid: 'test-sms-' + Date.now(),
          From: customerPhone,
          To: process.env.EXOTEL_SMS_NUMBER,
          Body: 'Hi, I need help with my account',
        };

        const smsResponse = await axios.post(
          `http://localhost:${process.env.PORT || 8000}/api/v1/webhooks/exotel/sms`,
          smsPayload
        );
        results.push({ type: 'SMS', payload: smsPayload, response: smsResponse.data });

        // Wait 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Incoming WhatsApp
        const waPayload = {
          MessageSid: 'test-wa-' + Date.now(),
          From: `whatsapp:${customerPhone}`,
          To: 'whatsapp:' + process.env.EXOTEL_WHATSAPP_NUMBER,
          Body: 'Following up on my SMS',
        };

        const waResponse = await axios.post(
          `http://localhost:${process.env.PORT || 8000}/api/v1/webhooks/exotel/whatsapp`,
          waPayload
        );
        results.push({ type: 'WhatsApp', payload: waPayload, response: waResponse.data });

        // Wait 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Voice call
        const callPayload = {
          CallSid: 'test-call-' + Date.now(),
          From: customerPhone,
          To: process.env.EXOTEL_PHONE_NUMBER,
          Direction: 'inbound',
          CallStatus: 'completed',
          CallDuration: '120',
        };

        const callResponse = await axios.post(
          `http://localhost:${process.env.PORT || 8000}/api/v1/webhooks/exotel/call`,
          callPayload
        );
        results.push({ type: 'Call', payload: callPayload, response: callResponse.data });
      }

      res.json({
        success: true,
        message: 'Batch test webhooks processed',
        scenario,
        results,
      });
    } catch (error: any) {
      logger.error('Batch test webhooks failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
}

export default router;
