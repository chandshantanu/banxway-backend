import dotenv from 'dotenv';
import { EmailConfig } from '../types';

dotenv.config();

export const emailConfig: EmailConfig = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASS || '',
    tls: process.env.IMAP_TLS !== 'false',
  },
};

export const EMAIL_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || '';
export const EMAIL_POLL_INTERVAL = parseInt(process.env.EMAIL_POLL_INTERVAL || '30000');
