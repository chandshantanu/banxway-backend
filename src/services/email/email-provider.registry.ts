/**
 * Email Provider Registry
 *
 * Central registry for email provider configurations including:
 * - Zoho Mail (standard and professional)
 * - Gmail
 * - Outlook / Office 365
 * - Custom providers
 */

import { EmailProviderConfig } from '../../types/email-providers';

export class EmailProviderRegistry {
  private static providers: Map<string, EmailProviderConfig> = new Map([
    // NOTE: Zoho Professional is listed BEFORE standard Zoho to prioritize it during MX detection
    // since both use the same MX servers (mx.zoho.in)
    [
      'zoho-professional',
      {
        id: 'zoho-professional',
        name: 'Zoho Mail Professional',
        smtp: { host: 'smtppro.zoho.in', port: 465, secure: true },
        imap: { host: 'imappro.zoho.in', port: 993, tls: true },
        helpUrl: 'https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html',
        mxPatterns: ['zoho.in'], // Only .in for Professional
      },
    ],
    [
      'zoho',
      {
        id: 'zoho',
        name: 'Zoho Mail',
        smtp: { host: 'smtp.zoho.com', port: 587, secure: false },
        imap: { host: 'imap.zoho.com', port: 993, tls: true },
        helpUrl: 'https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html',
        domainPatterns: ['zoho.com', 'zohomail.com'],
        mxPatterns: ['zoho.com'], // Only .com for standard Zoho
      },
    ],
    [
      'gmail',
      {
        id: 'gmail',
        name: 'Gmail',
        smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
        imap: { host: 'imap.gmail.com', port: 993, tls: true },
        helpUrl: 'https://support.google.com/accounts/answer/185833',
        domainPatterns: ['gmail.com', 'googlemail.com'],
        mxPatterns: ['google.com', 'googlemail.com'],
      },
    ],
    [
      'outlook',
      {
        id: 'outlook',
        name: 'Outlook / Office 365',
        smtp: { host: 'smtp.office365.com', port: 587, secure: false },
        imap: { host: 'outlook.office365.com', port: 993, tls: true },
        helpUrl:
          'https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-8361e398-8af4-4e97-b147-6c6c4ac95353',
        domainPatterns: ['outlook.com', 'hotmail.com', 'live.com'],
        mxPatterns: ['outlook.com', 'hotmail.com', 'protection.outlook.com'],
      },
    ],
  ]);

  /**
   * Get provider configuration by ID
   */
  static getProvider(providerId: string): EmailProviderConfig | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all available provider configurations
   */
  static getAllProviders(): EmailProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * Detect provider from email domain
   * Returns provider config if domain matches known pattern
   */
  static detectFromEmail(email: string): EmailProviderConfig | null {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    for (const provider of this.providers.values()) {
      if (provider.domainPatterns?.includes(domain)) {
        return provider;
      }
    }
    return null;
  }
}
