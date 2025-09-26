import { XeroClient } from 'xero-node';

// Ensure these env vars are set in .env.local
// XERO_CLIENT_ID=
// XERO_CLIENT_SECRET=
// XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
// XERO_SCOPES=offline_access accounting.transactions accounting.contacts accounting.settings openid profile email

let xero: XeroClient | null = null;

export function getXeroClient() {
  if (!xero) {
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI;
    const scopes = (process.env.XERO_SCOPES || '').split(/[\s,]+/).filter(Boolean);

    if (!clientId || !clientSecret || !redirectUri || scopes.length === 0) {
      throw new Error('Missing Xero environment variables. Please set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, and XERO_SCOPES.');
    }

    xero = new XeroClient({
      clientId,
      clientSecret,
      redirectUris: [redirectUri],
      scopes,
    });
  }
  return xero!;
}
