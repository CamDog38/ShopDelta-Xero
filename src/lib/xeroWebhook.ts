import crypto from 'crypto';

// Header Xero sends with each webhook request
export const XERO_SIGNATURE_HEADER = 'x-xero-signature';

// Compute HMAC-SHA256 of the raw request body using your webhook signing key
export function computeXeroSignature(rawBody: string, signingKey: string) {
  return crypto
    .createHmac('sha256', signingKey)
    .update(rawBody, 'utf8')
    .digest('base64');
}

export function verifyXeroSignature(rawBody: string, signatureFromHeader: string | null, signingKey?: string) {
  if (!signingKey) return { ok: false, reason: 'Missing XERO_WEBHOOK_KEY env' };
  if (!signatureFromHeader) return { ok: false, reason: 'Missing x-xero-signature header' };

  const expected = computeXeroSignature(rawBody, signingKey);
  // Use timing-safe compare
  const a = Buffer.from(signatureFromHeader);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return ok ? { ok: true as const } : { ok: false as const, reason: 'Invalid signature' };
}
