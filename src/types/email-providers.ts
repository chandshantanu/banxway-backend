/**
 * Email Provider Configuration Types
 *
 * Defines types for email provider templates and auto-detection
 */

export interface EmailProviderConfig {
  id: string;
  name: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
  imap: {
    host: string;
    port: number;
    tls: boolean;
  };
  helpUrl?: string;
  domainPatterns?: string[];  // e.g., ["gmail.com", "googlemail.com"]
  mxPatterns?: string[];      // e.g., ["google.com", "googlemail.com"]
}

export interface EmailProviderDetectionResult {
  provider: string | null;
  confidence: 'high' | 'medium' | 'low';
  config: EmailProviderConfig | null;
}
