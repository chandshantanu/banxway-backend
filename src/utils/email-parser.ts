import { simpleParser, ParsedMail } from 'mailparser';
import { ParsedEmail, EmailAddress, Attachment } from '../types';

export async function parseEmailBuffer(buffer: Buffer): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(buffer);

  return {
    messageId: parsed.messageId || '',
    from: parseAddress(parsed.from),
    to: parseAddresses(parsed.to),
    cc: parseAddresses(parsed.cc),
    subject: parsed.subject || '',
    text: parsed.text || '',
    html: parsed.html || undefined,
    date: parsed.date || new Date(),
    headers: parseHeaders(parsed.headers),
    attachments: parseAttachments(parsed.attachments),
    inReplyTo: parsed.inReplyTo || undefined,
    references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : undefined,
  };
}

function parseAddress(address: any): EmailAddress {
  if (!address) {
    return { address: '' };
  }

  if (typeof address === 'string') {
    return { address };
  }

  if (address.value && Array.isArray(address.value) && address.value[0]) {
    return {
      address: address.value[0].address || '',
      name: address.value[0].name || undefined,
    };
  }

  return { address: '' };
}

function parseAddresses(addresses: any): EmailAddress[] {
  if (!addresses) {
    return [];
  }

  if (Array.isArray(addresses)) {
    return addresses.map(parseAddress);
  }

  if (addresses.value && Array.isArray(addresses.value)) {
    return addresses.value.map((addr: any) => ({
      address: addr.address || '',
      name: addr.name || undefined,
    }));
  }

  return [parseAddress(addresses)];
}

function parseHeaders(headers: Map<string, any>): Record<string, string> {
  const result: Record<string, string> = {};

  if (!headers) {
    return result;
  }

  headers.forEach((value, key) => {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.join(', ');
    } else {
      result[key] = String(value);
    }
  });

  return result;
}

function parseAttachments(attachments: any[]): Attachment[] {
  if (!attachments || !Array.isArray(attachments)) {
    return [];
  }

  return attachments.map(att => ({
    filename: att.filename || 'unknown',
    content_type: att.contentType || 'application/octet-stream',
    size: att.size || 0,
    url: '', // Will be populated after uploading to storage
  }));
}

export function extractReferences(headers: Record<string, string>): string[] {
  const references = headers['references'] || '';
  if (!references) {
    return [];
  }

  return references
    .split(/\s+/)
    .map(ref => ref.trim())
    .filter(ref => ref.startsWith('<') && ref.endsWith('>'))
    .map(ref => ref.slice(1, -1));
}

export function findReferenceInSubject(subject: string): string | null {
  const match = subject.match(/BX-\d{4}-\d{4}/);
  return match ? match[0] : null;
}
