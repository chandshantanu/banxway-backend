import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../../utils/logger';

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  inReplyTo?: string;
  references?: string[];
  replyTo?: string;
}

export class EmailSenderService {
  private transporter: Transporter;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.fromEmail = process.env.SMTP_USER || '';
    this.fromName = process.env.SMTP_FROM_NAME || 'Banxway Support';

    // Create transporter with SMTP configuration
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        // Do not fail on invalid certs (for development)
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });

    // Verify connection configuration
    this.verifyConnection();
  }

  /**
   * Verify SMTP connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
    } catch (error: any) {
      logger.error('Failed to verify SMTP connection', {
        error: error.message,
        host: process.env.SMTP_HOST,
      });
    }
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<any> {
    try {
      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        inReplyTo: options.inReplyTo,
        references: options.references,
        replyTo: options.replyTo || this.fromEmail,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
      });

      return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      };
    } catch (error: any) {
      logger.error('Failed to send email', {
        error: error.message,
        to: options.to,
        subject: options.subject,
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send threaded email (reply to existing email)
   */
  async sendThreadedEmail(options: EmailOptions & { threadId: string }): Promise<any> {
    try {
      // Generate Message-ID for threading
      const messageId = `<${Date.now()}.${Math.random().toString(36).substring(7)}@${process.env.SMTP_HOST || 'banxway.com'}>`;

      // Build References header for proper threading
      const references = options.references || [];
      if (options.inReplyTo && !references.includes(options.inReplyTo)) {
        references.push(options.inReplyTo);
      }

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        messageId: messageId,
        inReplyTo: options.inReplyTo,
        references: references.length > 0 ? references.join(' ') : undefined,
        replyTo: options.replyTo || this.fromEmail,
        headers: {
          'X-Thread-ID': options.threadId,
        },
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Threaded email sent successfully', {
        messageId: info.messageId,
        threadId: options.threadId,
        to: options.to,
        subject: options.subject,
      });

      return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      };
    } catch (error: any) {
      logger.error('Failed to send threaded email', {
        error: error.message,
        threadId: options.threadId,
        to: options.to,
      });
      throw new Error(`Failed to send threaded email: ${error.message}`);
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(
    emails: EmailOptions[],
    delayMs: number = 100
  ): Promise<any[]> {
    const results: any[] = [];

    for (const email of emails) {
      try {
        const result = await this.sendEmail(email);
        results.push({ success: true, ...result });

        // Rate limiting
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error: any) {
        logger.error('Failed to send bulk email', {
          error: error.message,
          email,
        });
        results.push({
          success: false,
          error: error.message,
          to: email.to,
        });
      }
    }

    return results;
  }

  /**
   * Convert plain text to simple HTML
   */
  textToHtml(text: string): string {
    return text
      .split('\n')
      .map(line => `<p>${line}</p>`)
      .join('');
  }

  /**
   * Generate email preview text
   */
  generatePreview(html: string, maxLength: number = 100): string {
    // Strip HTML tags
    const text = html.replace(/<[^>]*>/g, '');
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * Validate email address
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Test SMTP connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error: any) {
      logger.error('SMTP connection test failed', { error: error.message });
      return false;
    }
  }
}

export default new EmailSenderService();
