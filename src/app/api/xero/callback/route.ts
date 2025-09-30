import { NextRequest, NextResponse } from 'next/server';
import { getXeroClient } from '@/lib/xero';
import { createXeroSession } from '@/lib/session';

function htmlError(title: string, message: string, reqUrl: string) {
  const home = new URL('/app', reqUrl).toString();
  const reconnect = new URL('/api/xero/connect', reqUrl).toString();
  const styles = `
    body { font-family: Arial, Helvetica, sans-serif; background:#f8fafc; color:#111827; margin:0; }
    .wrap { max-width: 720px; margin: 10vh auto; background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:24px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
    h1 { font-size:22px; margin:0 0 8px; }
    p { margin: 6px 0 16px; color:#374151; }
    .actions { display:flex; gap:12px; margin-top:12px; }
    a.btn { display:inline-block; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:600; }
    .primary { background:#0b5bd3; color:#fff; }
    .secondary { background:#f3f4f6; color:#111827; border:1px solid #e5e7eb; }
    code { background:#f1f5f9; padding:2px 6px; border-radius:6px; }
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${styles}</style></head><body><div class="wrap"><h1>${title}</h1><p>${message}</p><div class="actions"><a class="btn primary" href="${reconnect}">Try connecting again</a><a class="btn secondary" href="${home}">Back to app</a></div></div></body></html>`;
  return new NextResponse(html, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  try {
    const xero = getXeroClient();

    // If Xero redirected with an error (e.g., access_denied), show a friendly page
    const u = new URL(req.url);
    const err = u.searchParams.get('error');
    const errDesc = u.searchParams.get('error_description') || '';
    if (err) {
      const msg = err === 'access_denied'
        ? `Access was denied by Xero. ${errDesc ? `Details: <code>${errDesc}</code>. ` : ''}You may have cancelled or your organisation denied consent.`
        : `Xero returned an error: <code>${err}</code>${errDesc ? ` — ${errDesc}` : ''}.`;
      return htmlError('Xero auth failed', msg, req.url);
    }

    // Exchange code for tokens
    const url = req.url;
    const tokenSet = await xero.apiCallback(url);

    // Load tenants available for this connection
    const tenants = await xero.updateTenants();
    if (!tenants || tenants.length === 0) {
      return htmlError('No Xero tenants available', 'Your Xero connection succeeded but no organisations were returned for this user. Please ensure your user has access to a Xero organisation, then try again.', req.url);
    }

    // Choose the first tenant by default (you can extend UI to select later)
    const tenantId = tenants[0].tenantId;

    const res = NextResponse.redirect(new URL('/app', req.url));
    createXeroSession(res, { tokenSet, tenantId });
    return res;
  } catch (err: any) {
    console.error('Xero callback error:', err);
    const msg = String(err?.message || err || 'Unknown error');
    if (/access_denied|TenantConsent/i.test(msg)) {
      return htmlError('Xero auth failed', `Access was denied by Xero. Details: <code>${msg}</code>. You can try connecting again.`, req.url);
    }
    return htmlError('Xero auth failed', `An unexpected error occurred. Details: <code>${msg}</code>`, req.url);
  }
}
