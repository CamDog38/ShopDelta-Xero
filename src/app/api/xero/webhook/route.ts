import { NextRequest, NextResponse } from 'next/server';
import { verifyXeroSignature, XERO_SIGNATURE_HEADER } from '@/lib/xeroWebhook';
import { getSessionForTenant } from '@/lib/session';
import { getXeroClient } from '@/lib/xero';
import { addWebhookEvents, XeroWebhookEvent } from '@/lib/webhookStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get(XERO_SIGNATURE_HEADER);
  const key = process.env.XERO_WEBHOOK_KEY;

  const check = verifyXeroSignature(rawBody, signature, key);
  if (!check.ok) {
    console.warn('[webhook] Signature verification failed:', check.reason, 'headerPresent:', !!signature);
    return new NextResponse('unauthorized', { status: 401 });
  }

  // Process payload (safe to parse after verifying signature)
  try {
    const payload = JSON.parse(rawBody) as {
      events?: Array<{ resourceId: string; eventCategory: string; eventType: string; tenantId: string; }>
    };
    const events = payload?.events ?? [];
    console.log('[webhook] Events received:', events.length);
    for (const e of events) {
      console.log('[webhook:event]', 'tenantId:', e.tenantId, 'category:', e.eventCategory, 'type:', e.eventType, 'resourceId:', e.resourceId);
    }

    // Try to resolve tenant -> organisation name (best-effort, dev diagnostics)
    const uniqueTenantIds = Array.from(new Set(events.map(e => e.tenantId).filter(Boolean)));
    const resolvedNames = new Map<string, string | undefined>();
    for (const tenantId of uniqueTenantIds) {
      try {
        const sess = getSessionForTenant(tenantId);
        if (!sess) {
          console.log('[webhook] No in-memory session found for tenant', tenantId);
          continue;
        }
        const xero = getXeroClient();
        // @ts-ignore - runtime supports setTokenSet
        if (typeof xero.setTokenSet === 'function') {
          // @ts-ignore
          xero.setTokenSet(sess.tokenSet);
        }
        const orgs = await xero.accountingApi.getOrganisations(tenantId);
        const name = orgs.body?.organisations?.[0]?.name || orgs.body?.organisations?.[0]?.legalName;
        console.log('[webhook] Tenant resolved:', tenantId, '-> Org:', name || '(unknown)');
        resolvedNames.set(tenantId, name);
      } catch (e: any) {
        console.warn('[webhook] Failed to resolve tenant org name:', tenantId, e?.message || e);
      }
    }

    // Store recent events in memory for UI correlation
    const toStore: XeroWebhookEvent[] = events.map(e => ({
      receivedAt: new Date().toISOString(),
      tenantId: e.tenantId,
      eventCategory: e.eventCategory,
      eventType: e.eventType,
      resourceId: e.resourceId,
      organisationName: resolvedNames.get(e.tenantId),
    }));
    addWebhookEvents(toStore);
  } catch (e) {
    console.warn('[webhook] Failed to parse JSON body, continuing with 200');
  }

  // Xero requires a 200 within 5 seconds
  return new NextResponse(null, { status: 200 });
}

// Optional health check
export async function GET() {
  return NextResponse.json({ ok: true });
}
