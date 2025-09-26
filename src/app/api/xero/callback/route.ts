import { NextRequest, NextResponse } from 'next/server';
import { getXeroClient } from '@/lib/xero';
import { createXeroSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const xero = getXeroClient();

    // Exchange code for tokens
    const url = req.url;
    const tokenSet = await xero.apiCallback(url);

    // Load tenants available for this connection
    const tenants = await xero.updateTenants();
    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ error: 'No Xero tenants available.' }, { status: 400 });
    }

    // Choose the first tenant by default (you can extend UI to select later)
    const tenantId = tenants[0].tenantId;

    const res = NextResponse.redirect(new URL('/app', req.url));
    createXeroSession(res, { tokenSet, tenantId });
    return res;
  } catch (err: any) {
    console.error('Xero callback error:', err);
    return NextResponse.json({ error: 'Xero auth failed', details: err?.message || String(err) }, { status: 500 });
  }
}
