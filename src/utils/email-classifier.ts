/**
 * Email classifier — detects newsletters, auto-replies, bounces, and internal emails.
 * Uses header analysis (no LLM calls) for fast, free classification.
 */

export type EmailClassification =
  | 'business'       // Normal business email
  | 'newsletter'     // Marketing/newsletter
  | 'auto_reply'     // Out-of-office, auto-response
  | 'bounce'         // Delivery failure
  | 'notification'   // System notification (calendar, ticket system, etc.)
  | 'internal'       // Internal team email
  | 'spam_suspect';  // Likely spam based on headers

export interface ClassificationResult {
  classification: EmailClassification;
  confidence: number;  // 0-1
  reason: string;
  shouldProcess: boolean;  // Whether to run through the full agent pipeline
}

const INTERNAL_DOMAINS = [
  'banxwayglobal.com',
  'banxway.com',
  'chatslytics.com',
];

/**
 * Classify an email based on headers, sender, and content patterns.
 * Returns classification + whether it should go through the agent pipeline.
 */
export function classifyEmail(
  headers: Record<string, string>,
  fromAddress: string,
  subject: string,
  textContent: string
): ClassificationResult {
  // 1. Check for auto-reply headers
  const autoSubmitted = headers['auto-submitted'] || '';
  const xAutoResponse = headers['x-autoresponse'] || headers['x-auto-response-suppress'] || '';
  const precedence = headers['precedence'] || '';

  if (autoSubmitted && autoSubmitted !== 'no') {
    return {
      classification: 'auto_reply',
      confidence: 0.95,
      reason: `Auto-Submitted header: ${autoSubmitted}`,
      shouldProcess: false,
    };
  }

  if (xAutoResponse) {
    return {
      classification: 'auto_reply',
      confidence: 0.9,
      reason: `X-Autoresponse header present`,
      shouldProcess: false,
    };
  }

  // Out of Office patterns in subject
  if (/^(out of office|automatic reply|auto[- ]?reply|abwesenheitsnotiz)/i.test(subject)) {
    return {
      classification: 'auto_reply',
      confidence: 0.85,
      reason: 'Subject matches auto-reply pattern',
      shouldProcess: false,
    };
  }

  // 2. Check for bounce/NDR
  const returnPath = headers['return-path'] || '';
  const xFailedRecipients = headers['x-failed-recipients'] || '';
  const contentType = headers['content-type'] || '';

  if (xFailedRecipients || returnPath === '<>' || returnPath === '') {
    return {
      classification: 'bounce',
      confidence: 0.9,
      reason: xFailedRecipients ? 'X-Failed-Recipients header' : 'Empty return-path (NDR)',
      shouldProcess: false,
    };
  }

  if (contentType.includes('delivery-status') || contentType.includes('report')) {
    return {
      classification: 'bounce',
      confidence: 0.85,
      reason: 'Content-Type indicates delivery report',
      shouldProcess: false,
    };
  }

  if (/^(mail delivery|delivery status|undeliverable|returned mail|failure notice)/i.test(subject)) {
    return {
      classification: 'bounce',
      confidence: 0.8,
      reason: 'Subject matches bounce pattern',
      shouldProcess: false,
    };
  }

  // 3. Check for newsletter/marketing
  const listUnsubscribe = headers['list-unsubscribe'] || '';
  const listId = headers['list-id'] || '';

  if (listUnsubscribe) {
    return {
      classification: 'newsletter',
      confidence: 0.85,
      reason: 'List-Unsubscribe header present',
      shouldProcess: false,
    };
  }

  if (listId) {
    return {
      classification: 'newsletter',
      confidence: 0.8,
      reason: `List-ID: ${listId}`,
      shouldProcess: false,
    };
  }

  if (precedence === 'bulk' || precedence === 'list') {
    return {
      classification: 'newsletter',
      confidence: 0.75,
      reason: `Precedence: ${precedence}`,
      shouldProcess: false,
    };
  }

  // 4. Check for system notifications
  const mailer = headers['x-mailer'] || '';
  if (/noreply|no-reply|donotreply|notifications?@|alerts?@|system@/i.test(fromAddress)) {
    return {
      classification: 'notification',
      confidence: 0.7,
      reason: 'Sender appears to be a system/notification address',
      shouldProcess: false,
    };
  }

  // 5. Check for internal email
  const fromDomain = fromAddress.split('@')[1]?.toLowerCase() || '';
  if (INTERNAL_DOMAINS.includes(fromDomain)) {
    return {
      classification: 'internal',
      confidence: 0.95,
      reason: `Sender domain ${fromDomain} is internal`,
      shouldProcess: true, // Internal emails still matter for CRM/pipeline
    };
  }

  // 6. Default: business email
  return {
    classification: 'business',
    confidence: 0.7,
    reason: 'No non-business indicators found',
    shouldProcess: true,
  };
}

/**
 * Check if an email is likely a duplicate based on content similarity.
 * Uses content fingerprint comparison.
 */
export function isDuplicateContent(
  fingerprint1: string,
  fingerprint2: string
): boolean {
  return fingerprint1 === fingerprint2;
}
