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
    
    // Fetch items
    const itemsRes = await xero.accountingApi.getItems(session.tenantId);
    const items = itemsRes?.body?.items ?? [];
    const itemsIndex = new Map();
    const itemsNameIndex = new Map();
    
    function normalizeText(s: string | undefined): string {
      return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    for (const it of items) {
      if (it.code) itemsIndex.set(String(it.code).toUpperCase(), { code: it.code, name: it.name });
      if (it.name) itemsNameIndex.set(normalizeText(it.name), { code: it.code, name: it.name });
    }

    // Fetch invoices
    const invRes = await xero.accountingApi.getInvoices(session.tenantId);
    const raw = invRes?.body?.invoices ?? [];

    // Filter invoices
    const invoices = raw.filter((inv: any) => {
      if (!start && !end) return true;
      if (!inv.date) return false;
      const dt = new Date(inv.date);
      const sOk = start ? dt >= new Date(start + 'T00:00:00Z') : true;
      const eOk = end ? dt <= new Date(end + 'T00:00:00Z') : true;
      const t = (inv.type || '').toUpperCase();
      const isSales = t === 'ACCREC' || t === 'ACCRECCREDIT' || !inv.type;
      const status = (inv.status || '').toUpperCase();
      const isGoodStatus = status === 'AUTHORISED' || status === 'PAID' || status === '';
      return sOk && eOk && isSales && isGoodStatus;
    });

    // Analyze line items
    let totalLines = 0;
    let linesWithItemCode = 0;
    let linesWithoutItemCode = 0;
    let linesWithQty = 0;
    let linesWithoutQty = 0;
    let linesWithAmount = 0;
    let linesWithoutAmount = 0;
    let exactMatches = 0;
    let heuristicMatches = 0;
    let noMatches = 0;
    let inferredQty = 0;

    const sampleLines = [];

    for (const inv of invoices) {
      if (!Array.isArray(inv.lineItems)) continue;
      for (const li of inv.lineItems) {
        totalLines++;
        
        const hasItemCode = !!(li.itemCode || li.ItemCode);
        const hasQty = !!(li.quantity || li.Quantity);
        const hasAmount = !!(li.lineAmount || li.LineAmount || li.unitAmount || li.UnitAmount);
        
        if (hasItemCode) linesWithItemCode++;
        else linesWithoutItemCode++;
        
        if (hasQty) linesWithQty++;
        else linesWithoutQty++;
        
        if (hasAmount) linesWithAmount++;
        else linesWithoutAmount++;

        // Check matching
        const rawCode = hasItemCode ? String(li.itemCode || li.ItemCode).toUpperCase() : '';
        let matchType = 'none';
        
        if (rawCode && itemsIndex.has(rawCode)) {
          exactMatches++;
          matchType = 'exact';
        } else if (li.description || li.Description) {
          const norm = normalizeText(li.description || li.Description);
          if (norm && itemsNameIndex.has(norm)) {
            heuristicMatches++;
            matchType = 'heuristic';
          } else {
            noMatches++;
          }
        } else {
          noMatches++;
        }

        // Check qty inference
        if (!hasQty && hasAmount) {
          inferredQty++;
        }

        // Sample for debugging
        if (sampleLines.length < 10) {
          sampleLines.push({
            itemCode: li.itemCode || li.ItemCode || null,
            description: li.description || li.Description || null,
            quantity: li.quantity || li.Quantity || 0,
            unitAmount: li.unitAmount || li.UnitAmount || 0,
            lineAmount: li.lineAmount || li.LineAmount || 0,
            matchType,
            qtyInferred: !hasQty && hasAmount
          });
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    
    return NextResponse.json({
      ok: true,
      tenantId: session.tenantId,
      durationMs,
      items: { count: items.length, withCode: itemsIndex.size, withName: itemsNameIndex.size },
      invoices: { count: invoices.length },
      lines: {
        total: totalLines,
        withItemCode: linesWithItemCode,
        withoutItemCode: linesWithoutItemCode,
        withQty: linesWithQty,
        withoutQty: linesWithoutQty,
        withAmount: linesWithAmount,
        withoutAmount: linesWithoutAmount,
        exactMatches,
        heuristicMatches,
        noMatches,
        inferredQty
      },
      sampleLines
    });
  } catch (e: any) {
    const status = e?.response?.statusCode || 500;
    return NextResponse.json({ ok: false, error: e?.message, response: e?.response, body: e?.response?.body }, { status });
  }
}
