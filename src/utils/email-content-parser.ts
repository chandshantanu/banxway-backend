import crypto from 'crypto';

/**
 * Strip quoted text from email content, returning only the new/original content.
 * Handles common quoting patterns from Gmail, Outlook, Yahoo, Apple Mail, and Thunderbird.
 */
export function stripQuotedText(text: string): { newContent: string; quotedContent: string } {
  if (!text) return { newContent: '', quotedContent: '' };

  const lines = text.split('\n');
  let cutIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Gmail/standard: "On <date>, <name> wrote:"
    if (/^On\s+.{10,80}\s+wrote:\s*$/i.test(line)) {
      cutIndex = i;
      break;
    }

    // Outlook: "From: ..." or "-----Original Message-----"
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(line)) {
      cutIndex = i;
      break;
    }

    // Outlook: "From: name@email.com" after a blank line
    if (/^From:\s+\S+@\S+/i.test(line) && i > 0 && lines[i - 1].trim() === '') {
      cutIndex = i;
      break;
    }

    // Apple Mail / generic: "Begin forwarded message:"
    if (/^Begin forwarded message:/i.test(line)) {
      cutIndex = i;
      break;
    }

    // Quoted lines starting with >
    if (/^>/.test(line)) {
      // Check if this is the start of a quoted block (not a single > in middle of text)
      let quotedCount = 0;
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        if (/^>/.test(lines[j].trim())) quotedCount++;
      }
      if (quotedCount >= 3) {
        cutIndex = i;
        break;
      }
    }

    // "Sent from my iPhone/iPad" etc.
    if (/^Sent from my (iPhone|iPad|Galaxy|Android|BlackBerry)/i.test(line)) {
      cutIndex = i;
      break;
    }
  }

  const newContent = lines.slice(0, cutIndex).join('\n').trim();
  const quotedContent = lines.slice(cutIndex).join('\n').trim();

  return { newContent: newContent || text.trim(), quotedContent };
}

/**
 * Strip quoted HTML content. Removes blockquote elements and common reply markers.
 */
export function stripQuotedHtml(html: string): { newContent: string; quotedContent: string } {
  if (!html) return { newContent: '', quotedContent: '' };

  // Remove Gmail-style quoted content (div.gmail_quote)
  let cleaned = html.replace(/<div\s+class="gmail_quote"[\s\S]*$/i, '');

  // Remove Outlook-style quoted content
  cleaned = cleaned.replace(/<div\s+id="divRplyFwdMsg"[\s\S]*$/i, '');

  // Remove blockquote elements
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');

  // Remove "Original Message" separator
  cleaned = cleaned.replace(/<hr[\s/>]*[\s\S]*$/i, (match) => {
    if (/original\s+message/i.test(match)) return '';
    return match;
  });

  const quotedContent = html.replace(cleaned, '').trim();

  return { newContent: cleaned.trim(), quotedContent };
}

/**
 * Remove email signatures from text content.
 * Common patterns: "-- \n", "Best regards,", "Thanks,", etc.
 */
export function stripSignature(text: string): { content: string; signature: string } {
  if (!text) return { content: '', signature: '' };

  const lines = text.split('\n');
  let sigIndex = lines.length;

  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
    const line = lines[i].trim();

    // Standard signature delimiter: "-- " (with trailing space) or "--"
    if (line === '--' || line === '-- ') {
      sigIndex = i;
      break;
    }

    // Common sign-offs at end of email
    if (i >= lines.length - 8) {
      if (/^(Best\s+regards|Kind\s+regards|Warm\s+regards|Regards|Thanks|Thank\s+you|Cheers|Sincerely|With\s+thanks),?\s*$/i.test(line)) {
        sigIndex = i;
        break;
      }
    }
  }

  const content = lines.slice(0, sigIndex).join('\n').trim();
  const signature = lines.slice(sigIndex).join('\n').trim();

  return { content: content || text.trim(), signature };
}

/**
 * Generate a content fingerprint for deduplication beyond Message-ID.
 * Uses normalized subject + stripped content to detect same email processed from different sources.
 */
export function generateContentFingerprint(subject: string, textContent: string): string {
  const normalizedSubject = (subject || '')
    .replace(/^(re|fw|fwd|aw|wg):\s*/gi, '')
    .trim()
    .toLowerCase();

  const normalizedContent = (textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .substring(0, 500); // First 500 chars to avoid hash differences from trailing content

  return crypto
    .createHash('sha256')
    .update(`${normalizedSubject}|${normalizedContent}`)
    .digest('hex');
}

/**
 * Full email content processing pipeline.
 * Returns parsed content ready for storage and agent processing.
 */
export function processEmailContent(
  text: string,
  html: string | undefined,
  subject: string
): {
  newTextContent: string;
  newHtmlContent: string | undefined;
  quotedText: string;
  signature: string;
  contentFingerprint: string;
  fullText: string;
  fullHtml: string | undefined;
} {
  // Step 1: Strip quoted text
  const { newContent: strippedText, quotedContent: quotedText } = stripQuotedText(text);
  const htmlResult = html ? stripQuotedHtml(html) : undefined;

  // Step 2: Strip signature from new content
  const { content: cleanText, signature } = stripSignature(strippedText);

  // Step 3: Generate fingerprint from clean content
  const contentFingerprint = generateContentFingerprint(subject, cleanText);

  return {
    newTextContent: cleanText,
    newHtmlContent: htmlResult?.newContent || undefined,
    quotedText,
    signature,
    contentFingerprint,
    fullText: text,
    fullHtml: html,
  };
}
