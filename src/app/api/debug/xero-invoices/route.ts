import { NextResponse } from 'next/server';
import { getXeroSession } from '@/lib/session';
import { getXeroClient } from '@/lib/xero';

type AnyInv = Record<string, any>;

// Typed shape for the projected invoice we return from `project()`
type ProjectedLineItem = {
  itemCode: string | undefined;
  description: string | undefined;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  taxAmount: number;
  accountCode: string | undefined;
  tracking?: any[] | undefined;
};

type ProjectedInvoice = {
  invoiceID: string | undefined;
  invoiceNumber: string | undefined;
  date: string | undefined;
  status: string | undefined;
  type: string | undefined;
  total: number;
  currency: string | undefined;
  lineItems: ProjectedLineItem[];
};

const asArray = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const getId = (inv: AnyInv) => inv.InvoiceID || inv.invoiceID;
const norm = (obj: AnyInv): AnyInv[] => obj?.body?.invoices ?? obj?.body?.Invoices ?? [];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');            // ISO yyyy mm dd
    const end = searchParams.get('end');                // ISO yyyy mm dd
    const singleId = searchParams.get('id');            // invoice guid
    const raw = searchParams.get('raw');                // 1 or true
    const pageParam = Number(searchParams.get('page') || '1');
    const maxPages = Number(searchParams.get('maxPages') || '1'); // increase if you want more pages
    const hydrate = searchParams.get('hydrate') !== '0';          // set hydrate=0 to skip second pass
    const chunkSize = Number(searchParams.get('chunk') || '50');  // ids per hydrate call

    const session = await getXeroSession();
    if (!session) {
      return NextResponse.json({ ok: false, reason: 'No session' }, { status: 401 });
    }

    const xero = getXeroClient() as any;
    try {
      if (typeof xero.setTokenSet === 'function') xero.setTokenSet(session.tokenSet);
    } catch {}

    const startedAt = Date.now();

    // helpers
    const inRange = (iso: string | undefined) => {
      if (!start && !end) return true;
      if (!iso) return false;
      const dt = new Date(iso);
      const sOk = start ? dt >= new Date(start + 'T00:00:00Z') : true;
      const eOk = end ? dt <= new Date(end + 'T23:59:59Z') : true;
      return sOk && eOk;
    };

    const project = (inv: AnyInv): ProjectedInvoice => ({
      invoiceID: inv.invoiceID || inv.InvoiceID,
      invoiceNumber: inv.invoiceNumber || inv.InvoiceNumber,
      date: inv.date || inv.Date,
      status: inv.status || inv.Status,
      type: inv.type || inv.Type,
      total: Number(inv.total ?? inv.Total ?? 0),
      currency: inv.currencyCode || inv.CurrencyCode,
      lineItems: (() => {
        const lines = (inv.lineItems ?? inv.LineItems) as any[] | undefined;
        if (!Array.isArray(lines)) return [];
        return lines.map((li: any) => ({
          itemCode: li.itemCode || li.ItemCode,
          description: li.description || li.Description,
          quantity: Number(li.quantity ?? li.Quantity ?? 0),
          unitAmount: Number(li.unitAmount ?? li.UnitAmount ?? 0),
          lineAmount: Number(li.lineAmount ?? li.LineAmount ?? 0),
          taxAmount: Number(li.taxAmount ?? li.TaxAmount ?? 0),
          accountCode: li.accountCode || li.AccountCode,
          tracking: Array.isArray(li.tracking || li.Tracking) ? (li.tracking || li.Tracking) : undefined,
        }));
      })(),
    });

    // single invoice path returns full detail already
    if (singleId) {
      const one = await xero.accountingApi.getInvoice(session.tenantId, singleId);
      if (raw === '1' || raw === 'true') {
        return NextResponse.json(one?.body ?? { ok: false }, { status: 200 });
      }
      const list = norm(one).map(project).filter((i) => inRange(i.date));
      const durationMs = Date.now() - startedAt;
      return NextResponse.json({
        ok: true,
        tenantId: session.tenantId,
        durationMs,
        stats: {
          count: list.length,
          byStatus: Object.fromEntries(list.reduce((m: Map<string, number>, x) => m.set(String(x.status).toUpperCase(), (m.get(String(x.status).toUpperCase()) || 0) + 1), new Map())),
          byType: Object.fromEntries(list.reduce((m: Map<string, number>, x) => m.set(String(x.type).toUpperCase(), (m.get(String(x.type).toUpperCase()) || 0) + 1), new Map())),
          withItems: list.filter((x) => x.lineItems?.length).length,
          emptyItems: list.filter((x) => !x.lineItems?.length).length,
        },
        invoices: list,
      });
    }

    // list invoices first page…N pages as headers
    const headers: AnyInv[] = [];
    let page = Math.max(1, pageParam);
    for (let p = 0; p < Math.max(1, maxPages); p++) {
      const res = await xero.accountingApi.getInvoices(
        session.tenantId,
        undefined,               // ifModifiedSince
        undefined,               // where
        undefined,               // order
        undefined,               // iDs
        undefined,               // invoiceNumbers
        undefined,               // contactIDs
        undefined,               // statuses
        page                     // page
      );
      const list = norm(res);
      if (!list.length) break;
      headers.push(...list);
      page += 1;
    }

    if (raw === '1' || raw === 'true') {
      // Return exactly what Xero sent for the last page fetched
      return NextResponse.json({ ok: true, pagesFetched: page - pageParam, lastPage: page - 1, body: { invoices: headers } }, { status: 200 });
    }

    // hydrate full invoices using iDs filter in chunks
    let full: AnyInv[] = headers;
    if (hydrate && headers.length) {
      const ids = headers.map(getId).filter(Boolean);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

      const hydrated: AnyInv[] = [];
      for (const c of chunks) {
        // important the param is iDs exactly as per SDK typing
        try {
          // The Xero SDK expects iDs as a string[] (GUIDs), not a CSV string
          const resp = await xero.accountingApi.getInvoices(
            session.tenantId,
            undefined,
            undefined,
            undefined,
            c,                    // iDs as string[]
            undefined,
            undefined,
            undefined,
            undefined
          );
          const n = norm(resp);
          // lightweight debug signal in server logs
          console.log(`[xero-invoices] hydrated chunk size=${c.length} received=${n.length}`);
          hydrated.push(...n);
        } catch (err: any) {
          console.error('[xero-invoices] hydrate chunk failed', { size: c.length, err: err?.message, status: err?.response?.statusCode });
          throw err; // bubble up so the API reports the failure
        }
      }

      // merge hydrated back over headers
      const byId = new Map(hydrated.map(x => [getId(x), x]));
      full = headers.map(h => byId.get(getId(h)) || h);
    }

    // project and filter dates
    const projected = full.map(project).filter((i) => inRange(i.date));

    const stats = {
      count: projected.length,
      byStatus: Object.fromEntries(projected.reduce((m: Map<string, number>, x) => m.set(String(x.status).toUpperCase(), (m.get(String(x.status).toUpperCase()) || 0) + 1), new Map())),
      byType: Object.fromEntries(projected.reduce((m: Map<string, number>, x) => m.set(String(x.type).toUpperCase(), (m.get(String(x.type).toUpperCase()) || 0) + 1), new Map())),
      withItems: projected.filter((x) => x.lineItems?.length).length,
      emptyItems: projected.filter((x) => !x.lineItems?.length).length,
    };

    const durationMs = Date.now() - startedAt;
    const sample = searchParams.get('sample');
    if (sample) {
      const n = Math.max(0, Math.min(projected.length, Number(sample) || 3));
      return NextResponse.json({ ok: true, tenantId: session.tenantId, durationMs, stats, sample: projected.slice(0, n) });
    }

    return NextResponse.json({ ok: true, tenantId: session.tenantId, durationMs, stats, invoices: projected });
  } catch (e: any) {
    const status = e?.response?.statusCode || 500;
    return NextResponse.json({ ok: false, error: e?.message, response: e?.response, body: e?.response?.body }, { status });
  }
}
