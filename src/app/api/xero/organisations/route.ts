import { NextResponse } from 'next/server';
import { getXeroClient } from '@/lib/xero';
import { getXeroSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getXeroSession();
    if (!session) {
      console.warn('[orgs] No Xero session found (organisations route).');
      return NextResponse.json({ error: 'Not connected to Xero' }, { status: 401 });
    }

    const xero = getXeroClient();
    // Restore token on the Xero client for this request
    try {
      // @ts-ignore - setTokenSet exists at runtime on xero-node client
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (typeof xero.setTokenSet === 'function') {
        // @ts-ignore
        xero.setTokenSet(session.tokenSet);
        console.log('[orgs] TokenSet restored on Xero client. Tenant:', session.tenantId);
      } else {
        console.warn('[orgs] xero.setTokenSet is not a function. SDK API may differ.');
      }
    } catch (e) {
      console.error('[orgs] Failed to set token on client:', e);
    }

    const { tenantId } = session;
    console.log('[orgs] Fetching organisations for tenant:', tenantId);
    // xero-node v13 expects the first argument to be the tenant id string header
    const res = await xero.accountingApi.getOrganisations(tenantId);
    const organisations = res.body?.organisations ?? [];
    console.log('[orgs] Organisations returned:', organisations.length);
    return NextResponse.json({ organisations });
  } catch (err: any) {
    console.error('Xero organisations error:', err?.response?.body || err?.message || err);
    return NextResponse.json({ error: 'Failed to load organisations', details: err?.message || String(err) }, { status: 500 });
  }
}
