/**
 * MX Record Lookup Service
 *
 * Performs DNS MX record lookups to detect email providers
 * for custom domains
 */

import dns from 'dns/promises';
import { logger } from '../../utils/logger';
import { EmailProviderRegistry } from './email-provider.registry';
import { EmailProviderDetectionResult } from '../../types/email-providers';

export class MXLookupService {
  /**
   * Detect email provider from MX records
   *
   * Performs DNS MX lookup and matches against known provider patterns
   * Returns provider configuration with confidence level
   */
  static async detectProvider(email: string): Promise<EmailProviderDetectionResult> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return { provider: null, confidence: 'low', config: null };
    }

    try {
      logger.debug('Looking up MX records', { domain });

      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        logger.warn('No MX records found', { domain });
        return { provider: null, confidence: 'low', config: null };
      }

      logger.debug('MX records found', {
        domain,
        count: mxRecords.length,
        records: mxRecords.map((r) => r.exchange),
      });

      // Check each provider's MX patterns
      const providers = EmailProviderRegistry.getAllProviders();

      for (const provider of providers) {
        if (!provider.mxPatterns) continue;

        for (const mxRecord of mxRecords) {
          const exchange = mxRecord.exchange.toLowerCase();

          for (const pattern of provider.mxPatterns) {
            if (exchange.includes(pattern)) {
              logger.info('Provider detected from MX', {
                domain,
                provider: provider.id,
                mxRecord: exchange,
                pattern,
              });

              return {
                provider: provider.id,
                confidence: 'high',
                config: provider,
              };
            }
          }
        }
      }

      logger.info('No provider matched MX records', { domain });
      return { provider: null, confidence: 'low', config: null };
    } catch (error: any) {
      logger.error('MX lookup failed', { domain, error: error.message });
      return { provider: null, confidence: 'low', config: null };
    }
  }
}
