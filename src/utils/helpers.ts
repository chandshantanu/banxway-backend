import crypto from 'crypto';

export function generateReference(prefix: string = 'BX'): string {
  const year = new Date().getFullYear();
  const random = crypto.randomInt(1000, 9999);
  return `${prefix}-${year}-${random}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function extractEmailDomain(email: string): string {
  return email.split('@')[1];
}

export function parseEmailAddresses(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input;
  }
  return input.split(/[,;]/).map(e => e.trim()).filter(Boolean);
}

export function truncate(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
