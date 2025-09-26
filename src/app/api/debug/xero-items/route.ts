import { NextResponse } from 'next/server';
import { getXeroSession } from '@/lib/session';
import { getXeroClient } from '@/lib/xero';

export async function GET() {
  try {
    const session = await getXeroSession();
    if (!session) {
      return NextResponse.json({ ok: false, reason: 'No session' }, { status: 401 });
    }
    const xero = getXeroClient() as any;
    try {
      if (typeof xero.setTokenSet === 'function') {
        xero.setTokenSet(session.tokenSet);
      }
    } catch {}

    const startedAt = Date.now();
    const res = await xero.accountingApi.getItems(session.tenantId);
    const items = (res?.body?.items ?? []) as Array<{
      code?: string; name?: string; isTrackedAsInventory?: boolean;
    }>;
    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      tenantId: session.tenantId,
      count: items.length,
      sample: items.slice(0, 5),
      durationMs,
    });
  } catch (e: any) {
    const status = e?.response?.statusCode || 500;
    return NextResponse.json({
      ok: false,
      error: e?.message || 'Request failed',
      response: e?.response,
      body: e?.response?.body,
    }, { status });
  }
}
