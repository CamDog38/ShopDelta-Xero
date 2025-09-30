import { getXeroSession, updateCurrentSessionTokenSet } from '@/lib/session';
import { getXeroClient } from '@/lib/xero';

export type Granularity = 'day' | 'week' | 'month';

export type Preset = 'last30' | 'thisMonth' | 'ytd' | 'custom';
export type Basis = 'accrual' | 'cash';
export type XeroAnalyticsFilters = {
  preset?: Preset;
  start?: string; // YYYY-MM-DD UTC
  end?: string;   // YYYY-MM-DD UTC
  granularity?: Granularity;
  basis?: Basis;
};

// Lightweight internal types limited to fields we actually use from the Xero SDK
type LineItemLite = {
  itemCode?: string;
  description?: string;
  quantity?: number;
  lineAmount?: number;
  unitAmount?: number;
  taxAmount?: number;
};
type InvoiceLite = {
  date?: string;
  lineItems?: LineItemLite[];
  total?: number;
  currencyCode?: string;
  invoiceID?: string;
  invoiceNumber?: string;
  status?: string;
  type?: string;
  lineAmountTypes?: string; // 'Exclusive' | 'Inclusive' | 'NoTax'
};
type ItemLite = {
  code?: string;
  name?: string;
  isTrackedAsInventory?: boolean;
};

// Minimal Xero client shape used by this module
type XeroClientLike = {
  setTokenSet?: (tokenSet: Record<string, unknown>) => void;
  refreshToken?: () => Promise<unknown> | unknown;
  refreshTokenSet?: () => Promise<unknown> | unknown;
  readTokenSet?: () => Record<string, unknown> | Promise<Record<string, unknown> | undefined> | undefined;
  tokenSet?: Record<string, unknown>;
  accountingApi: {
    getInvoices: (tenantId: string) => Promise<{ body?: { invoices?: unknown[] } }>;
    getItems: (tenantId: string) => Promise<{ body?: { items?: unknown[] } }>;
    // Optional methods depending on SDK version
    getPayments?: (tenantId: string) => Promise<{ body?: { payments?: unknown[] } }>;
    getBankTransactions?: (tenantId: string) => Promise<{ body?: { bankTransactions?: unknown[] } }>;
  };
};

export type XeroAnalyticsResult = {
  filters: { preset: Preset; start: string; end: string; granularity: Granularity; basis: Basis };
  totals: { qty: number; sales: number; currency?: string };
  series: Array<{ key: string; label: string; quantity: number; sales: number }>;
  recentInvoices: Array<{ id: string; number?: string; status?: string; total?: number; currency?: string; date?: string }>;
  topItems: Array<{ code?: string; name?: string; isTracked?: boolean }>; // metadata only
  // Product breakdown
  productLegend: Array<{ id: string; title: string }>; // id=itemCode or description fallback
  seriesProduct: Array<{ key: string; label: string; per: Record<string, { qty: number; sales: number; title: string }> }>;
  // Summary tables
  top10ByQty: Array<{ id: string; title: string; qty: number }>;
  top10BySales: Array<{ id: string; title: string; sales: number }>;
  salesByProduct: Array<{ id: string; title: string; qty: number; sales: number }>;
  // Comparisons
  mom: Array<{ period: string; curr: { qty: number; sales: number }; prev: { qty: number; sales: number } }>;
  yoy: Array<{ month: string; curr: { qty: number; sales: number }; prev: { qty: number; sales: number } }>;
  diagnostics: { fetched: number; included: number; excludedNonSales: number; excludedStatus: number; inferredQtyLines: number; productCodeMatches?: number; productHeuristicMatches?: number };
  monthlyTotals: Array<{ key: string; label: string; qty: number; sales: number }>;
  monthlyDict: Record<string, { label: string; qty: number; sales: number }>;
  credits: { count: number; qty: number; sales: number };
  monthlyProduct: Array<{ key: string; per: Record<string, { title: string; qty: number; sales: number }> }>;
};

function startOfWeekUTC(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay();
  const diff = (dow + 6) % 7; // Monday index 0
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function fmtYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function normalizeRange(filters: XeroAnalyticsFilters) {
  const now = new Date();
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const preset = filters.preset ?? 'last30';
  let start: Date;
  let end: Date = filters.end ? new Date(filters.end + 'T00:00:00Z') : utcNow;
  if (preset === 'thisMonth') {
    start = startOfMonthUTC(utcNow);
  } else if (preset === 'ytd') {
    start = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1));
  } else if (preset === 'custom') {
    start = filters.start ? new Date(filters.start + 'T00:00:00Z') : new Date(utcNow.getTime() - 29 * 86400000);
  } else {
    // last30
    start = filters.start ? new Date(filters.start + 'T00:00:00Z') : new Date(utcNow.getTime() - 29 * 86400000);
  }
  const granularity: Granularity = filters.granularity ?? 'day';
  return { start, end, granularity, preset };
}

function bucketKey(d: Date, g: Granularity) {
  if (g === 'day') return fmtYMD(d);
  if (g === 'week') return fmtYMD(startOfWeekUTC(d));
  return fmtYMD(startOfMonthUTC(d));
}

export async function getXeroAnalytics(input: XeroAnalyticsFilters): Promise<XeroAnalyticsResult> {
  console.log('🔍 [ANALYTICS START]', JSON.stringify(input, null, 2));
  const session = await getXeroSession();
  if (!session) throw new Error('No Xero session');
  const xero = (getXeroClient() as unknown) as XeroClientLike;
  try {
    // @ts-ignore
    if (typeof xero.setTokenSet === 'function') {
      // @ts-ignore
      xero.setTokenSet(session.tokenSet);
    }
  } catch {}

  async function requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e: unknown) {
      const err = e as { response?: { statusCode?: number; status?: number; body?: { Title?: string } } };
      const status = err?.response?.statusCode || err?.response?.status;
      const unauthorized = status === 401 || String(err?.response?.body?.Title || '').toLowerCase().includes('unauthorized');
      if (unauthorized) {
        try {
          // Attempt token refresh if SDK exposes it
          if (typeof xero.refreshToken === 'function') {
            await xero.refreshToken();
          } else if (typeof xero.refreshTokenSet === 'function') {
            await xero.refreshTokenSet();
          }
          // Persist refreshed tokenSet if accessible
          const ts = xero.tokenSet || (typeof xero.readTokenSet === 'function' ? await xero.readTokenSet() : undefined);
          if (ts) await updateCurrentSessionTokenSet(ts);
        } catch {}
        // Retry once after refresh attempt
        return await fn();
      }
      throw e;
    }
  }

  const { start, end, granularity, preset } = normalizeRange(input);
  const basis: Basis = (input.basis as Basis) || 'accrual';
  console.log('📅 [DATE RANGE]', { preset, start: start.toISOString(), end: end.toISOString(), granularity });

  // Fetch invoices within a broad range
  console.log('📋 [FETCHING INVOICES]');
  const invRes = await requestWithRetry(() => xero.accountingApi.getInvoices(session.tenantId));
  const fetchedAll = ((invRes.body?.invoices ?? []) as unknown as InvoiceLite[]);
  console.log('📋 [INVOICES FETCHED]', fetchedAll.length);
  let excludedNonSales = 0;
  let excludedStatus = 0;
  const invoices = fetchedAll.filter((inv) => {
    const d = inv.date;
    const dt = d ? new Date(d) : null;
    if (!dt) return false;
    // Only include sales invoices and credit notes (Accounts Receivable)
    const t = (inv.type || '').toUpperCase();
    const isSales = t === 'ACCREC' || t === 'ACCRECCREDIT' || !inv.type;
    if (!isSales) { excludedNonSales++; return false; }
    const status = (inv.status || '').toUpperCase();
    const isGoodStatus = status === 'AUTHORISED' || status === 'PAID' || status === '';
    if (!isGoodStatus) { excludedStatus++; return false; }
    return dt >= start && dt <= end;
  });
  console.log('✅ [INVOICES FILTERED]', { included: invoices.length, excludedNonSales, excludedStatus });

  const currency = invoices[0]?.currencyCode;
  let inferredQtyLines = 0;
  let creditCount = 0;
  let creditQty = 0;
  let creditSales = 0;

  // Aggregate by bucket (accrual basis)
  const map = new Map<string, { quantity: number; sales: number }>();
  for (const inv of invoices) {
    const sign = (inv.type || '').toUpperCase() === 'ACCRECCREDIT' ? -1 : 1;
    if (sign === -1) creditCount++;
    const dt = new Date(inv.date ?? Date.now());
    const key = bucketKey(dt, granularity);
    const current = map.get(key) || { quantity: 0, sales: 0 };
    // Use both lowercase and PascalCase variants from the Xero SDK
    const items = ((inv as any).lineItems || (inv as any).LineItems || []) as LineItemLite[];
    let qty = Array.isArray(items)
      ? items.reduce((s: number, li: LineItemLite) => {
          const hasAmount = typeof li.lineAmount === 'number' || typeof li.unitAmount === 'number';
          let q = li.quantity;
          if ((q == null || q === 0) && hasAmount) { inferredQtyLines++; q = 1; }
          return s + sign * Number(q ?? 0);
        }, 0)
      : 0;
    // Mirror product logic: when there are no line items, infer qty = 1 if invoice has an amount
    if ((!Array.isArray(items) || items.length === 0) && (typeof inv.total === 'number')) {
      inferredQtyLines++;
      qty += sign * 1;
    }
    // Pre-tax line amount: (lineAmount or unit*qty) minus taxAmount if present
    const totalLinesPretax = Array.isArray(items)
      ? items.reduce((s: number, li: LineItemLite) => {
          const gross = li.lineAmount ?? ((li.unitAmount ?? 0) * (li.quantity ?? 0));
          const pretax = Number((gross ?? 0)) - Number(li.taxAmount ?? 0);
          return s + sign * pretax;
        }, 0)
      : 0;
    // Prefer invoice total, but adjust to pre-tax if we can infer tax: when Inclusive, subtract sum of tax amounts
    let total = totalLinesPretax;
    if (typeof inv.total === 'number') {
      if (inv.lineAmountTypes && inv.lineAmountTypes.toLowerCase() === 'inclusive' && Array.isArray(items)) {
        const taxSum = items.reduce((s: number, li) => s + Number(li.taxAmount ?? 0), 0);
        total = sign * (Number(inv.total) - taxSum);
      } else {
        // assume invoice total already exclusive or no tax; still apply sign
        total = sign * Number(inv.total);
      }
    }
    current.quantity += qty;
    current.sales += total;
    map.set(key, current);
    if (sign === -1) {
      creditQty += qty; // qty already carries sign
      creditSales += total; // total already carries sign
    }
  }
  // Cash-basis aggregation
  const cashMap = new Map<string, { quantity: number; sales: number }>();
  if (basis === 'cash') {
    // Payments linked to ACCREC invoices
    try {
      if (typeof xero.accountingApi.getPayments === 'function') {
        console.log('💵 [FETCHING PAYMENTS]');
        const payRes = await requestWithRetry(() => xero.accountingApi.getPayments!(session.tenantId));
        const payments = (payRes?.body?.payments ?? []) as any[];
        for (const p of payments) {
          const dtRaw = p.date || p.Date; const dt = dtRaw ? new Date(dtRaw) : null;
          if (!dt || dt < start || dt > end) continue;
          const invType = (p?.invoice?.type || p?.Invoice?.Type || '').toUpperCase();
          if (invType && invType !== 'ACCREC' && invType !== 'ACCRECCREDIT') continue;
          const amount = Number(p.amount ?? p.Amount ?? 0);
          const sign = invType === 'ACCRECCREDIT' ? -1 : 1; // refund against credit note treated negative
          const key = bucketKey(dt, granularity);
          const cur = cashMap.get(key) || { quantity: 0, sales: 0 };
          cur.quantity += 0; // payments do not change qty
          cur.sales += sign * amount;
          cashMap.set(key, cur);
        }
      }
    } catch (e) {
      console.warn('Payments fetch failed/skipped', e);
    }
    // Receive-money bank transactions not linked to invoices
    try {
      if (typeof xero.accountingApi.getBankTransactions === 'function') {
        console.log('🏦 [FETCHING BANK TRANSACTIONS]');
        const btRes = await requestWithRetry(() => xero.accountingApi.getBankTransactions!(session.tenantId));
        const bankTxns = (btRes?.body?.bankTransactions ?? []) as any[];
        for (const bt of bankTxns) {
          const dtRaw = bt.date || bt.Date; const dt = dtRaw ? new Date(dtRaw) : null;
          if (!dt || dt < start || dt > end) continue;
          const type = (bt.type || bt.Type || '').toUpperCase();
          const isReceive = type.includes('RECEIVE');
          if (!isReceive) continue; // cash in only
          // Skip if directly linked to an invoice
          const hasInvoiceLink = !!(bt?.invoice?.invoiceID || bt?.Invoice?.InvoiceID);
          if (hasInvoiceLink) continue;
          const amount = Number(bt.total ?? bt.Total ?? bt.amount ?? bt.Amount ?? 0);
          const key = bucketKey(dt, granularity);
          const cur = cashMap.get(key) || { quantity: 0, sales: 0 };
          cur.sales += amount;
          cashMap.set(key, cur);
        }
      }
    } catch (e) {
      console.warn('Bank transactions fetch failed/skipped', e);
    }
  }

  // Build series sorted by key using chosen basis
  const mapToUse = basis === 'cash' ? cashMap : map;
  const keys = Array.from(mapToUse.keys()).sort();
  const series = keys.map((k) => ({ key: k, label: k, quantity: mapToUse.get(k)!.quantity, sales: mapToUse.get(k)!.sales }));

  const totals = series.reduce((acc, s) => ({ qty: acc.qty + s.quantity, sales: acc.sales + s.sales }), { qty: 0, sales: 0 });
  console.log(`📊 [PERIOD AGGREGATION DONE ${basis.toUpperCase()}]`, { periods: keys.length, totals });

  // Recent invoices (all in range, newest first)
  const recentInvoices = invoices
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    .map((inv) => ({
      id: String(inv.invoiceID || inv.invoiceNumber || ''),
      number: inv.invoiceNumber,
      status: inv.status,
      total: Number(inv.total ?? 0),
      currency: inv.currencyCode,
      date: inv.date ? fmtYMD(new Date(inv.date)) : undefined,
    }));

  // Items (products)
  let topItems: Array<{ code?: string; name?: string; isTracked?: boolean }> = [];
  const itemsIndex = new Map<string, { code?: string; name?: string; isTracked?: boolean }>();
  try {
    const itemsRes = await requestWithRetry(() => xero.accountingApi.getItems(session.tenantId));
    const allItems = ((itemsRes.body?.items ?? []) as unknown as ItemLite[]);
    topItems = allItems.map((it) => ({
      code: it.code,
      name: it.name,
      isTracked: Boolean(it.isTrackedAsInventory),
    }));
    for (const it of allItems) {
      if (it.code) itemsIndex.set(String(it.code).toUpperCase(), { code: it.code, name: it.name, isTracked: Boolean(it.isTrackedAsInventory) });
    }
    console.log('🏷️ [ITEMS FETCHED]', { count: allItems.length });
  } catch {}

  // Product breakdown from invoices/line items within range
  const productMap = new Map<string, { title: string; qty: number; sales: number }>();
  const seriesProductMap = new Map<string, Map<string, { qty: number; sales: number; title: string }>>();
  let productItemMatches = 0;
  let productHeuristicMatches = 0;
  
  console.log('🔍 [STARTING PRODUCT BREAKDOWN] Processing', invoices.length, 'invoices');

  function normalizeText(s?: string) {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Build name index for heuristic matching when itemCode is missing
  const itemsNameIndex = new Map<string, { code?: string; name?: string; isTracked?: boolean }>();
  for (const [codeUpper, it] of itemsIndex.entries()) {
    if (it.name) itemsNameIndex.set(normalizeText(it.name), it);
  }
  for (const inv of invoices) {
    const sign = (inv.type || '').toUpperCase() === 'ACCRECCREDIT' ? -1 : 1;
    const dt = new Date(inv.date ?? Date.now());
    const key = bucketKey(dt, granularity);
    let perBucket = seriesProductMap.get(key);
    if (!perBucket) { perBucket = new Map(); seriesProductMap.set(key, perBucket); }
    // Check for line items in different properties (case sensitivity issues)
    const lineItems = inv.lineItems || (inv as any).LineItems || [];
    
    // Debug the raw invoice structure
    console.log('📋 [PROCESSING INVOICE]', { 
      id: inv.invoiceID || inv.invoiceNumber, 
      date: inv.date, 
      type: inv.type,
      total: inv.total,
      rawInvoice: JSON.stringify(inv).substring(0, 500), // Show first 500 chars of raw invoice
      lineItemsCount: Array.isArray(lineItems) ? lineItems.length : 0,
      sampleLineItems: Array.isArray(lineItems) ? lineItems.slice(0, 2).map(li => ({
        itemCode: li.itemCode || li.ItemCode,
        description: li.description || li.Description,
        quantity: li.quantity || li.Quantity,
        unitAmount: li.unitAmount || li.UnitAmount,
        lineAmount: li.lineAmount || li.LineAmount
      })) : []
    });
    
    // If line items exist, process them normally
    if (Array.isArray(lineItems) && lineItems.length > 0) {
      for (const li of lineItems as LineItemLite[]) {
        // Handle case-insensitive property names
        const itemCode = li.itemCode || (li as any).ItemCode;
        const description = li.description || (li as any).Description;
        
        const rawCode = (itemCode ? String(itemCode) : '').toUpperCase();
        let pid = rawCode || String(description || 'unknown');
        let itemInfo = rawCode ? itemsIndex.get(rawCode) : undefined;
        let title = itemInfo?.name || String(description || itemCode || 'Item');
        if (itemInfo) {
          productItemMatches++;
        } else {
          // Heuristic by normalized description to item name
          const normDesc = normalizeText(description || '');
          if (normDesc) {
            const nameHit = itemsNameIndex.get(normDesc);
            if (nameHit) {
              productHeuristicMatches++;
              itemInfo = nameHit;
              title = nameHit.name || title;
              pid = String(nameHit.code || title);
            }
          }
        }
        // Handle case-insensitive property names for quantity and amounts
        const quantity = li.quantity !== undefined ? li.quantity : (li as any).Quantity;
        const lineAmount = li.lineAmount !== undefined ? li.lineAmount : (li as any).LineAmount;
        const unitAmount = li.unitAmount !== undefined ? li.unitAmount : (li as any).UnitAmount;
        const taxAmount = li.taxAmount !== undefined ? li.taxAmount : (li as any).TaxAmount;
        
        const hasAmount = typeof lineAmount === 'number' || typeof unitAmount === 'number';
        let q = quantity;
        if ((q == null || q === 0) && hasAmount) { inferredQtyLines++; q = 1; }
        const liQty = sign * Number(q ?? 0);
        
        console.log('🔍 [LINE ITEM PROCESSING]', {
          itemCode,
          description,
          originalQty: quantity,
          inferredQty: q,
          lineAmount,
          unitAmount,
          hasAmount,
          liQty,
          pid,
          title,
          matchType: itemInfo ? 'exact' : 'none'
        });
        const fallbackAmt = (unitAmount ?? 0) * (quantity ?? 0);
        const chosenAmt = lineAmount ?? fallbackAmt;
        const liSales = sign * (Number(chosenAmt || 0) - Number(taxAmount ?? 0));
        // totals per product
        const agg = productMap.get(pid) || { title, qty: 0, sales: 0 };
        agg.qty += liQty;
        agg.sales += liSales;
        productMap.set(pid, agg);
        // per-bucket per-product
        const pb = perBucket.get(pid) || { qty: 0, sales: 0, title };
        pb.qty += liQty;
        pb.sales += liSales;
        perBucket.set(pid, pb);
      }
    }
    // Use invoice reference as fallback product when line items are empty
    else {
      console.log('📦 [USING INVOICE AS PRODUCT]', { 
        reference: (inv as any).reference,
        total: inv.total
      });
      
      // Try to match reference to an item code
      const reference = String((inv as any).reference || '');
      const normalizedRef = normalizeText(reference);
      let pid = reference;
      let title = reference || 'Invoice ' + (inv.invoiceNumber || inv.invoiceID);
      let itemInfo;
      
      // Try exact match by code
      if (reference) {
        const upperRef = reference.toUpperCase();
        itemInfo = itemsIndex.get(upperRef);
        if (itemInfo) {
          productItemMatches++;
          pid = upperRef;
          title = itemInfo.name || title;
        } 
        // Try heuristic match by name
        else if (normalizedRef) {
          const nameHit = itemsNameIndex.get(normalizedRef);
          if (nameHit) {
            productHeuristicMatches++;
            itemInfo = nameHit;
            title = nameHit.name || title;
            pid = String(nameHit.code || title);
          }
        }
      }
      
      // Use invoice total as sales amount and infer quantity = 1
      const liQty = sign * 1;  // Infer quantity = 1
      const liSales = sign * (Number(inv.total || 0) - Number((inv as any).totalTax || 0));
      
      // Add to product map
      const agg = productMap.get(pid) || { title, qty: 0, sales: 0 };
      agg.qty += liQty;
      agg.sales += liSales;
      productMap.set(pid, agg);
      
      // Add to per-bucket per-product
      const pb = perBucket.get(pid) || { qty: 0, sales: 0, title };
      pb.qty += liQty;
      pb.sales += liSales;
      perBucket.set(pid, pb);
      
      inferredQtyLines++; // Count as inferred quantity
    }
  }

  const productLegend = Array.from(productMap.entries()).map(([id, v]) => ({ id, title: v.title }));
  console.log('🛍️ [PRODUCT BREAKDOWN DONE]', { products: productMap.size, productItemMatches, productHeuristicMatches });
  const seriesProduct = Array.from(seriesProductMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, mp]) => {
    const per: Record<string, { qty: number; sales: number; title: string }> = {};
    for (const [id, v] of mp.entries()) per[id] = { qty: v.qty, sales: v.sales, title: v.title };
    return { key, label: key, per };
  });

  // Monthly per-product matrix for comparisons (MoM/YoY)
  const monthlyProductMap = new Map<string, Map<string, { title: string; qty: number; sales: number }>>();
  for (const inv of invoices) {
    const sign = (inv.type || '').toUpperCase() === 'ACCRECCREDIT' ? -1 : 1;
    const mk = monthKey(new Date(inv.date ?? Date.now()));
    let per = monthlyProductMap.get(mk);
    if (!per) { per = new Map(); monthlyProductMap.set(mk, per); }
    const lineItemsMP = ((inv as any).lineItems || (inv as any).LineItems || []) as LineItemLite[];
    if (Array.isArray(lineItemsMP) && lineItemsMP.length > 0) {
      for (const li of lineItemsMP) {
        const rawCode = (li.itemCode ? String(li.itemCode) : '').toUpperCase();
        let pid = rawCode || String(li.description || 'unknown');
        let title = (rawCode && itemsIndex.get(rawCode)?.name) || String(li.description || li.itemCode || 'Item');
        if (!rawCode && li.description) {
          const norm = normalizeText(li.description);
          const hit = norm ? itemsNameIndex.get(norm) : undefined;
          if (hit) { title = hit.name || title; pid = String(hit.code || title); }
        }
        const hasAmount = typeof li.lineAmount === 'number' || typeof li.unitAmount === 'number';
        let q = li.quantity; if ((q == null || q === 0) && hasAmount) q = 1;
        const fb = (li.unitAmount ?? 0) * (li.quantity ?? 0);
        const amt = (li.lineAmount ?? fb) - Number(li.taxAmount ?? 0);
        const agg = per.get(pid) || { title, qty: 0, sales: 0 };
        agg.qty += sign * Number(q ?? 0);
        agg.sales += sign * Number(amt || 0);
        per.set(pid, agg);
      }
    } else {
      // Fallback: treat invoice as a single product based on reference/number when no line items
      const reference = String((inv as any).reference || '');
      const normalizedRef = normalizeText(reference);
      let pid = reference || String(inv.invoiceNumber || inv.invoiceID || 'invoice');
      let title = reference || 'Invoice ' + (inv.invoiceNumber || inv.invoiceID || '');
      if (reference) {
        const upperRef = reference.toUpperCase();
        const itemInfo = itemsIndex.get(upperRef);
        if (itemInfo) {
          title = itemInfo.name || title;
          pid = upperRef;
        } else if (normalizedRef) {
          const nameHit = itemsNameIndex.get(normalizedRef);
          if (nameHit) {
            title = nameHit.name || title;
            pid = String(nameHit.code || title);
          }
        }
      }
      const liQty = sign * 1;
      const liSales = sign * (Number(inv.total || 0) - Number((inv as any).totalTax || 0));
      const agg = per.get(pid) || { title, qty: 0, sales: 0 };
      agg.qty += liQty;
      agg.sales += liSales;
      per.set(pid, agg);
    }
  }
  const monthlyProduct = Array.from(monthlyProductMap.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([key, mp]) => {
    const per: Record<string, { title: string; qty: number; sales: number }> = {};
    for (const [id, v] of mp.entries()) per[id] = { title: v.title, qty: v.qty, sales: v.sales };
    return { key, per };
  });
  console.log('📊 [MONTHLY PRODUCT MATRIX DONE]', { months: monthlyProduct.length });

  // Summary tables
  const salesByProduct = Array.from(productMap.entries())
    .map(([id, v]) => ({ id, title: v.title, qty: v.qty, sales: v.sales }))
    .sort((a, b) => b.sales - a.sales);
  const top10BySales = salesByProduct.slice(0, 10);
  const top10ByQty = Array.from(productMap.entries())
    .map(([id, v]) => ({ id, title: v.title, qty: v.qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Comparisons: compute monthly totals over a wider window
  function monthKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }
  const monthlyMap = new Map<string, { qty: number; sales: number }>();
  for (const inv of invoices) {
    const sign = (inv.type || '').toUpperCase() === 'ACCRECCREDIT' ? -1 : 1;
    const d = new Date(inv.date ?? Date.now());
    const mk = monthKey(d);
    const cur = monthlyMap.get(mk) || { qty: 0, sales: 0 };
    const itemsM = ((inv as any).lineItems || (inv as any).LineItems || []) as LineItemLite[];
    let q = 0;
    if (Array.isArray(itemsM)) {
      q = itemsM.reduce((s, li) => {
        const hasAmount = typeof li.lineAmount === 'number' || typeof li.unitAmount === 'number';
        let qq = li.quantity;
        if ((qq == null || qq === 0) && hasAmount) { inferredQtyLines++; qq = 1; }
        return s + sign * Number(qq ?? 0);
      }, 0);
      // If items exist but the array is empty and invoice has amount, infer qty = 1
      if (itemsM.length === 0 && typeof inv.total === 'number') {
        inferredQtyLines++;
        q += sign * 1;
      }
    } else if (typeof inv.total === 'number') {
      inferredQtyLines++;
      q += sign * 1;
    }
    cur.qty += q;
    const sumLines = Array.isArray(itemsM)
      ? itemsM.reduce((s, li) => {
          const fb = (li.unitAmount ?? 0) * (li.quantity ?? 0);
          const chosen = (li.lineAmount ?? fb) - Number(li.taxAmount ?? 0);
          return s + sign * Number(chosen || 0);
        }, 0)
      : 0;
    let chosenTotal = sumLines;
    if (typeof inv.total === 'number') {
      if (inv.lineAmountTypes && inv.lineAmountTypes.toLowerCase() === 'inclusive' && Array.isArray(itemsM)) {
        const taxSum = itemsM.reduce((s, li) => s + Number(li.taxAmount ?? 0), 0);
        chosenTotal = sign * (Number(inv.total) - taxSum);
      } else {
        chosenTotal = sign * Number(inv.total);
      }
    }
    cur.sales += Number(chosenTotal ?? 0);
    monthlyMap.set(mk, cur);
  }
  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  console.log('📅 [MONTHLY MAP DONE]', { months: sortedMonths.length });
  function monthLabel(ym: string) {
    const [y, m] = ym.split('-').map((v) => Number(v));
    const dt = new Date(Date.UTC(y, (m-1), 1));
    return dt.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const mom = [] as XeroAnalyticsResult['mom'];
  for (let i = 1; i < sortedMonths.length; i++) {
    const a = sortedMonths[i-1];
    const b = sortedMonths[i];
    mom.push({ period: `${a} → ${b}`, prev: monthlyMap.get(a)!, curr: monthlyMap.get(b)! });
  }
  const yoy = [] as XeroAnalyticsResult['yoy'];
  for (const mk of sortedMonths) {
    const [y, m] = mk.split('-').map((v) => Number(v));
    const prevK = `${y-1}-${String(m).padStart(2,'0')}`;
    const curr = monthlyMap.get(mk)!;
    const prev = monthlyMap.get(prevK) ?? { qty: 0, sales: 0 };
    yoy.push({ month: `${mk}`, curr, prev });
  }

  // Monthly totals array and dictionary for UI selections
  const monthlyTotals = sortedMonths.map((k) => {
    const t = monthlyMap.get(k)!;
    return { key: k, label: monthLabel(k), qty: t.qty, sales: t.sales };
  });
  const monthlyDict = monthlyTotals.reduce<Record<string, { label: string; qty: number; sales: number }>>((acc, m) => {
    acc[m.key] = { label: m.label, qty: m.qty, sales: m.sales };
    return acc;
  }, {});

  return {
    filters: { preset, start: fmtYMD(start), end: fmtYMD(end), granularity, basis },
    totals: { qty: totals.qty, sales: totals.sales, currency },
    series,
    recentInvoices,
    topItems,
    productLegend,
    seriesProduct,
    top10ByQty,
    top10BySales,
    salesByProduct,
    mom,
    yoy,
    diagnostics: { fetched: fetchedAll.length, included: invoices.length, excludedNonSales, excludedStatus, inferredQtyLines, productCodeMatches: productItemMatches, productHeuristicMatches },
    monthlyTotals,
    monthlyDict,
    credits: { count: creditCount, qty: creditQty, sales: creditSales },
    monthlyProduct,
  };
}
