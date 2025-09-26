import { NextResponse } from 'next/server';
import { getXeroSession } from '@/lib/session';
import { getXeroClient } from '@/lib/xero';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const session = await getXeroSession();
    if (!session) return NextResponse.json({ ok: false, reason: 'No session' }, { status: 401 });

    const xero = getXeroClient() as any;
    try {
      if (typeof xero.setTokenSet === 'function') xero.setTokenSet(session.tokenSet);
    } catch {}

    const startedAt = Date.now();
    const res = await xero.accountingApi.getInvoices(session.tenantId);
    const raw = res?.body?.invoices ?? [];

    // Light in-memory filtering and projection for debugging
    const invoices = raw
      .map((inv: any) => ({
        invoiceID: inv.invoiceID || inv.InvoiceID,
        invoiceNumber: inv.invoiceNumber || inv.InvoiceNumber,
        date: inv.date || inv.Date,
        status: inv.status || inv.Status,
        type: inv.type || inv.Type,
        total: Number(inv.total ?? inv.Total ?? 0),
        currency: inv.currencyCode || inv.CurrencyCode,
        lineItems: Array.isArray(inv.lineItems)
          ? inv.lineItems.map((li: any) => ({
              itemCode: li.itemCode || li.ItemCode,
              description: li.description || li.Description,
              quantity: Number(li.quantity ?? li.Quantity ?? 0),
              unitAmount: Number(li.unitAmount ?? li.UnitAmount ?? 0),
              lineAmount: Number(li.lineAmount ?? li.LineAmount ?? 0),
            }))
          : [],
      }))
      .filter((inv: any) => {
        if (!start && !end) return true;
        if (!inv.date) return false;
        const dt = new Date(inv.date);
        const sOk = start ? dt >= new Date(start + 'T00:00:00Z') : true;
        const eOk = end ? dt <= new Date(end + 'T00:00:00Z') : true;
        return sOk && eOk;
      });

    const stats = {
      count: invoices.length,
      byStatus: Object.fromEntries(invoices.reduce((m: Map<string, number>, inv: any) => m.set((inv.status || 'unknown').toUpperCase(), (m.get((inv.status || 'unknown').toUpperCase()) || 0) + 1), new Map())) ,
      byType: Object.fromEntries(invoices.reduce((m: Map<string, number>, inv: any) => m.set((inv.type || 'unknown').toUpperCase(), (m.get((inv.type || 'unknown').toUpperCase()) || 0) + 1), new Map())) ,
      withItems: invoices.filter((i: any) => i.lineItems && i.lineItems.length > 0).length,
      emptyItems: invoices.filter((i: any) => !i.lineItems || i.lineItems.length === 0).length,
    };

    const durationMs = Date.now() - startedAt;
    return NextResponse.json({ ok: true, tenantId: session.tenantId, durationMs, stats, sample: invoices.slice(0, 3) });
  } catch (e: any) {
    const status = e?.response?.statusCode || 500;
    return NextResponse.json({ ok: false, error: e?.message, response: e?.response, body: e?.response?.body }, { status });
  }
}
