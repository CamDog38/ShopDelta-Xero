import { NextRequest, NextResponse } from 'next/server';
import { getXeroSession } from '@/lib/session';
import { getXeroClient } from '@/lib/xero';

/**
 * GET /api/debug/cash-weighted-items?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Computes cash-weighted quantities per item per day based on:
 *  - Invoices (ACCREC and ACCRECCREDIT) with line items (itemCode, qty, net)
 *  - Payments applied to those invoices
 *
 * Rules implemented (from user spec):
 *  - Exclude drafts and voids
 *  - Include credit notes as negative invoices (affects apportioning sign)
 *  - For invoice-level total net we use sum of line net values (exclusive of tax)
 *  - For each line L with quantity qL and net tL, and each payment p with amount Ap on same invoice:
 *      cash_qty(L,p) = qL * (Ap / invoice_totalNet)
 *      cash_net(L,p) = tL * (Ap / invoice_totalNet)
 *  - Output rows grouped by payment date and item code: sum apportioned qty and net
 *  - cash_qty rounded to 2 decimals at output; we keep full precision internally to avoid leakage
 *  - We ensure that for each payment, the apportioned cash_net sums exactly to Ap by fixing tiny residuals
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getXeroSession();
    if (!session) return NextResponse.json({ ok: false, reason: 'No session' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const startStr = searchParams.get('start');
    const endStr = searchParams.get('end');
    const start = startStr ? new Date(startStr + 'T00:00:00Z') : null;
    const end = endStr ? new Date(endStr + 'T23:59:59Z') : null;

    const xero = getXeroClient() as any;
    try { if (typeof xero.setTokenSet === 'function') xero.setTokenSet(session.tokenSet); } catch {}

    // 1) Fetch invoices and payments
    const [invRes, payRes] = await Promise.all([
      xero.accountingApi.getInvoices(session.tenantId),
      typeof xero.accountingApi.getPayments === 'function' ? xero.accountingApi.getPayments(session.tenantId) : Promise.resolve({ body: { payments: [] } })
    ]);

    const rawInvoices = (invRes?.body?.invoices ?? []) as any[];
    const payments = (payRes?.body?.payments ?? []) as any[];

    // Build invoice map with net totals and lines
    type Line = { itemCode?: string; qty: number; net: number };
    type Inv = {
      id: string;
      type: string; // ACCREC or ACCRECCREDIT
      status: string;
      date?: string;
      lines: Line[];
      totalNet: number; // sum of line net (exclusive of tax)
    };

    const invoices: Record<string, Inv> = {};
    for (const inv of rawInvoices) {
      const status = String(inv.status || inv.Status || '').toUpperCase();
      if (status === 'DRAFT' || status === 'VOIDED') continue; // exclude
      const type = String(inv.type || inv.Type || '').toUpperCase();
      // Only sales side; include credit notes as negatives
      if (type !== 'ACCREC' && type !== 'ACCRECCREDIT') continue;

      const id = String(inv.invoiceID || inv.InvoiceID || inv.invoiceNumber || inv.InvoiceNumber || '');
      const lineItems = (inv.lineItems || inv.LineItems || []) as any[];
      const lines: Line[] = [];
      for (const li of lineItems) {
        const itemCode = li.itemCode || li.ItemCode;
        const qty = Number(li.quantity ?? li.Quantity ?? 0) || 0;
        const lineAmount = Number(li.lineAmount ?? li.LineAmount ?? 0) || 0;
        const taxAmount = Number(li.taxAmount ?? li.TaxAmount ?? 0) || 0;
        const net = lineAmount - taxAmount; // net of tax
        // If no explicit lineAmount but unit*qty exists
        const unit = Number(li.unitAmount ?? li.UnitAmount ?? 0) || 0;
        const derivedNet = unit * qty - taxAmount;
        const finalNet = (lineAmount !== 0 ? net : derivedNet);
        if (!itemCode && qty === 0 && finalNet === 0) continue;
        lines.push({ itemCode, qty, net: finalNet });
      }
      // If invoice has no lines but has a total, infer a single pseudo-line with qty=1, itemCode undefined
      if (lines.length === 0) {
        const totalGross = Number(inv.total ?? inv.Total ?? 0) || 0;
        const totalTax = Number(inv.totalTax ?? inv.TotalTax ?? 0) || 0;
        const net = totalGross - totalTax;
        if (net !== 0) lines.push({ itemCode: undefined, qty: 1, net });
      }
      // Sum line net
      const totalNet = lines.reduce((s, l) => s + l.net, 0);
      invoices[id] = { id, type, status, date: inv.date || inv.Date, lines, totalNet };
    }

    // Helper: date -> 'YYYY-MM-DD'
    const ymd = (d: Date) => d.toISOString().slice(0, 10);

    // 2) Apportion payments to lines and aggregate by payment date + itemCode
    type Agg = { qty: number; net: number };
    const agg = new Map<string, Agg>(); // key = `${date}|${itemCode || 'UNKNOWN'}`

    for (const p of payments) {
      const pDateRaw = p.date || p.Date;
      const pDate = pDateRaw ? new Date(pDateRaw) : null;
      if (!pDate) continue;
      if (start && pDate < start) continue;
      if (end && pDate > end) continue;

      const invId = String(p?.invoice?.invoiceID || p?.Invoice?.InvoiceID || '');
      if (!invId) continue;
      const inv = invoices[invId];
      if (!inv) continue; // payment for an invoice outside our filtered set

      const Ap = Number(p.amount ?? p.Amount ?? 0) || 0;
      if (Ap === 0) continue;

      // Treat credit notes (ACCRECCREDIT) as negative invoices -> flip sign for proportions
      const sign = inv.type === 'ACCRECCREDIT' ? -1 : 1;
      const totalNet = inv.totalNet * sign;
      if (totalNet === 0) continue; // avoid division by zero

      // Compute proportions with full precision
      const weight = Ap / Math.abs(totalNet);
      let sumCashNet = 0;
      let lastKey: string | null = null;
      let lastIdx = -1;

      inv.lines.forEach((L, idx) => {
        const item = (L.itemCode ? String(L.itemCode) : 'UNKNOWN').toUpperCase();
        const key = `${ymd(pDate)}|${item}`;
        const qL = L.qty * sign;
        const tL = L.net * sign;

        const cashQty = qL * weight; // keep full precision; round later
        const cashNet = tL * weight;

        const cur = agg.get(key) || { qty: 0, net: 0 };
        cur.qty += cashQty;
        cur.net += cashNet;
        agg.set(key, cur);

        sumCashNet += cashNet;
        lastKey = key; lastIdx = idx;
      });

      // Reconcile any rounding residual on cash_net to ensure sum(cash_net) == Ap
      const residual = Ap - sumCashNet;
      if (lastKey && Math.abs(residual) > 1e-8) {
        const fix = agg.get(lastKey)!;
        fix.net += residual;
        agg.set(lastKey, fix);
      }
    }

    // 3) Emit rows with rounding for cash_qty to 2 decimals
    const rows = Array.from(agg.entries()).map(([k, v]) => {
      const [date, itemCode] = k.split('|');
      return {
        date,
        itemCode: itemCode === 'UNKNOWN' ? null : itemCode,
        cash_qty: Math.round(v.qty * 100) / 100, // 2 decimals
        cash_net: Math.round((v.net + Number.EPSILON) * 100) / 100,
      };
    }).sort((a, b) => (a.date === b.date ? (a.itemCode || '').localeCompare(b.itemCode || '') : a.date.localeCompare(b.date)));

    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (e: any) {
    const status = e?.response?.statusCode || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'Request failed', response: e?.response, body: e?.response?.body }, { status });
  }
}
