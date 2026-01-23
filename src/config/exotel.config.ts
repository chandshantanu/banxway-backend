import dotenv from 'dotenv';

dotenv.config();

export const exotelConfig = {
  sid: process.env.EXOTEL_SID || '',
  token: process.env.EXOTEL_TOKEN || '',
  whatsappNumber: process.env.EXOTEL_WHATSAPP_NUMBER || '',
  smsNumber: process.env.EXOTEL_SMS_NUMBER || '',
  phoneNumber: process.env.EXOTEL_PHONE_NUMBER || '',
  apiUrl: process.env.EXOTEL_API_URL || 'https://api.exotel.com/v1',
};

export const EXOTEL_WEBHOOK_BASE_URL = process.env.EXOTEL_WEBHOOK_BASE_URL || '';
