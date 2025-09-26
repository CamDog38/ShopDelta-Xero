import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "./shopify.server";

// Keep server-only helpers here to avoid importing client module
// Fetch recent orders and compute top products by quantity sold
// Types match client file

type Granularity = "day" | "week" | "month";

function startOfWeek(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7; // make Monday=0
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt;
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function fmtYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const DEBUG = process.env.DEBUG_ANALYTICS === "1";
  const dlog = (...args: any[]) => {
    if (DEBUG) console.log("[analytics]", ...args);
  };
  const { admin, session } = await authenticate.admin(request);

  // Parse filters
  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const granParam = (url.searchParams.get("granularity") as Granularity) || "day";
  const preset = url.searchParams.get("preset") || "last30";
  const view = url.searchParams.get("view") || "chart"; // chart | table | summary | compare
  const compareMode = url.searchParams.get("compare") || "none"; // none | mom | yoy
  const compareScope = url.searchParams.get("compareScope") || "aggregate"; // aggregate | product
  const momA = url.searchParams.get("momA");
  const momB = url.searchParams.get("momB");
  const chartType = url.searchParams.get("chart") || "bar"; // bar | line
  const chartMetric = (url.searchParams.get("metric") || "qty").toLowerCase(); // qty | sales
  const chartScope = (url.searchParams.get("chartScope") || "aggregate").toLowerCase(); // aggregate | product
  const productFocus = url.searchParams.get("productFocus") || "all"; // all | productId

  // Determine default range based on preset
  const now = new Date();
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start = startParam ? new Date(startParam + "T00:00:00.000Z") : undefined;
  let end = endParam ? new Date(endParam + "T23:59:59.999Z") : undefined;

  if (!start || !end) {
    switch (preset) {
      case "last7":
        end = utcNow;
        start = new Date(utcNow);
        start.setUTCDate(start.getUTCDate() - 6);
        break;
      case "thisMonth":
        start = startOfMonth(utcNow);
        end = utcNow;
        break;
      case "lastMonth": {
        const firstThis = startOfMonth(utcNow);
        const firstLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth() - 1, 1));
        const endLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth(), 0));
        start = firstLast;
        end = endLast;
        break;
      }
      case "ytd": {
        start = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1));
        end = utcNow;
        break;
      }
      default: // last30
        end = utcNow;
        start = new Date(utcNow);
        start.setUTCDate(start.getUTCDate() - 29);
    }
  }

  // Query recent orders in a window and pull line items (quantity + discounted totals)
  const query = `#graphql
    query AnalyticsRecentOrders($first: Int!, $search: String, $after: String) {
      orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true, query: $search) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            name
            processedAt
            lineItems(first: 100) {
              edges {
                node {
                  quantity
                  title
                  discountedTotalSet { shopMoney { amount currencyCode } }
                  product { id title }
                  variant { sku }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    // For MoM UI
    let momMonths: Array<{ key: string; label: string }> | undefined = undefined;
    // Build search term for processedAt range
    const search = `processed_at:>='${start!.toISOString()}' processed_at:<='${end!.toISOString()}'`;
    dlog("Fetching recent orders... shop=", session.shop, "range=", start, end, "gran=", granParam);
    // Paginate through all orders within the date range
    let after: string | null = null;
    const edges: any[] = [];
    while (true) {
      const response: Response = await admin.graphql(query, { variables: { first: 250, search, after } });
      const data = await response.json();
      dlog("GraphQL status:", response.status, "keys:", Object.keys(data || {}));
      const gqlErrors = (data && (data as any).errors) || (data && (data as any).data && (data as any).data.errors);
      if (gqlErrors && Array.isArray(gqlErrors) && gqlErrors.length > 0) {
        dlog("GraphQL errors:", gqlErrors);
        return json(
          { error: "GRAPHQL_ERROR", message: gqlErrors[0]?.message || "GraphQL error", details: gqlErrors, shop: session.shop },
          { status: 200 },
        );
      }
      const page = (data as any)?.data?.orders;
      const newEdges = page?.edges ?? [];
      edges.push(...newEdges);
      if (page?.pageInfo?.hasNextPage) {
        after = newEdges.length ? (newEdges[newEdges.length - 1]?.cursor as string) : null;
      } else {
        break;
      }
    }

    const counts = new Map<string, { title: string; quantity: number }>();
    const buckets = new Map<string, { label: string; quantity: number }>();
    const bucketSales = new Map<string, number>();
    let totalQty = 0;
    let totalSales = 0;
    let currencyCode: string | null = null;

    const productSet = new Map<string, { title: string; sku: string }>();
    const pivot = new Map<string, Map<string, number>>();

    function bucketKey(dateStr: string): { key: string; label: string } {
      const d = new Date(dateStr);
      if (granParam === "month") {
        const startM = startOfMonth(d);
        const key = `${startM.getUTCFullYear()}-${String(startM.getUTCMonth() + 1).padStart(2, "0")}`;
        const label = `${startM.toLocaleString("en-US", { month: "short" })} ${startM.getUTCFullYear()}`;
        return { key, label };
      }
      if (granParam === "week") {
        const ws = startOfWeek(d);
        const key = `W:${fmtYMD(ws)}`;
        const label = `Week of ${ws.toLocaleDateString("en-CA")}`;
        return { key, label };
      }
      const key = fmtYMD(d);
      const label = d.toLocaleDateString("en-CA");
      return { key, label };
    }

    if (granParam === "month") {
      const mStart = startOfMonth(start!);
      const mEnd = startOfMonth(end!);
      const cur = new Date(mStart);
      while (cur <= mEnd) {
        const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`;
        const label = `${cur.toLocaleString("en-US", { month: "short" })} ${cur.getUTCFullYear()}`;
        if (!buckets.has(key)) buckets.set(key, { label, quantity: 0 });
        if (!bucketSales.has(key)) bucketSales.set(key, 0);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }

    for (const edge of edges) {
      const processedAt: string = edge?.node?.processedAt;
      const { key, label } = bucketKey(processedAt);
      if (!buckets.has(key)) buckets.set(key, { label, quantity: 0 });
      if (!bucketSales.has(key)) bucketSales.set(key, 0);
      if (!pivot.has(key)) pivot.set(key, new Map());

      const lineItemEdges = edge?.node?.lineItems?.edges ?? [];
      for (const liEdge of lineItemEdges) {
        const qty: number = liEdge?.node?.quantity ?? 0;
        const product = liEdge?.node?.product;
        const fallbackTitle: string = liEdge?.node?.title ?? "Unknown product";
        const id: string = product?.id ?? `li:${fallbackTitle}`;
        const title: string = product?.title ?? fallbackTitle;
        const sku: string = product?.sku ?? "";
        if (!counts.has(id)) counts.set(id, { title, quantity: 0 });
        counts.get(id)!.quantity += qty;
        buckets.get(key)!.quantity += qty;
        productSet.set(id, { title, sku });
        const row = pivot.get(key)!;
        row.set(id, (row.get(id) || 0) + qty);

        const amountStr: string | undefined = liEdge?.node?.discountedTotalSet?.shopMoney?.amount as any;
        const curr: string | undefined = liEdge?.node?.discountedTotalSet?.shopMoney?.currencyCode as any;
        const amount = amountStr ? parseFloat(amountStr) : 0;
        if (!currencyCode && curr) currencyCode = curr;
        totalSales += amount;
        bucketSales.set(key, (bucketSales.get(key) || 0) + amount);
        totalQty += qty;
      }
    }

    const topProducts = Array.from(counts.entries())
      .map(([id, { title, quantity }]) => ({ id, title, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const salesByProduct = new Map<string, number>();
    for (const [bKey] of pivot.entries()) {
      const row = pivot.get(bKey)!;
      for (const [pid, q] of row.entries()) {
        const bucketQty = buckets.get(bKey)!.quantity || 1;
        const bucketAmt = bucketSales.get(bKey) || 0;
        const alloc = (q / bucketQty) * bucketAmt;
        salesByProduct.set(pid, (salesByProduct.get(pid) || 0) + alloc);
      }
    }
    const topProductsBySales = Array.from(salesByProduct.entries())
      .map(([id, sales]) => ({ id, title: productSet.get(id)?.title || id, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    const series = Array.from(buckets.entries())
      .map(([key, v]) => ({ key, label: v.label, quantity: v.quantity, sales: bucketSales.get(key) || 0 }))
      .sort((a, b) => (a.key > b.key ? 1 : -1));

    const top5Ids = topProducts.slice(0, 5).map((p) => p.id);
    const seriesProduct = series.map((s) => {
      const row = pivot.get(s.key) || new Map<string, number>();
      const bucketQty = buckets.get(s.key)?.quantity || 1;
      const bucketAmt = bucketSales.get(s.key) || 0;
      const per: Record<string, { qty: number; sales: number; title: string }> = {};
      for (const pid of top5Ids) {
        const q = row.get(pid) || 0;
        const alloc = (q / bucketQty) * bucketAmt;
        per[pid] = { qty: q, sales: alloc, title: productSet.get(pid)?.title || pid };
      }
      return { key: s.key, label: s.label, per };
    });

    const seriesProductLines = top5Ids.map((pid) => ({
      id: pid,
      title: productSet.get(pid)?.title || pid,
      points: series.map((s) => {
        const row = pivot.get(s.key) || new Map<string, number>();
        const q = row.get(pid) || 0;
        const bucketQty = buckets.get(s.key)?.quantity || 1;
        const bucketAmt = bucketSales.get(s.key) || 0;
        const sales = (q / bucketQty) * bucketAmt;
        return { key: s.key, label: s.label, qty: q, sales };
      })
    }));

    const top20Ids = topProducts.slice(0, 20).map((p) => p.id);
    const table = series.map((s) => {
      const row: Record<string, any> = { key: s.key, label: s.label };
      for (const pid of top20Ids) {
        const qty = pivot.get(s.key)?.get(pid) || 0;
        row[pid] = qty;
      }
      return row;
    });

    let comparison: any = null;
    let comparisonTable: Array<Record<string, any>> | null = null;
    let comparisonHeaders: string[] | null = null;
    if (compareMode === "mom" || compareMode === "yoy") {
      let prevStart: Date, prevEnd: Date;
      if (compareMode === "yoy") {
        prevStart = new Date(start!); prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1);
        prevEnd = new Date(end!); prevEnd.setUTCFullYear(prevEnd.getUTCFullYear() - 1);
      } else {
        const days = Math.ceil((+end! - +start!) / (1000 * 60 * 60 * 24)) + 1;
        prevEnd = new Date(start!); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
        prevStart = new Date(prevEnd); prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
      }
      const prevSearch = `processed_at:>='${prevStart.toISOString()}' processed_at:<='${prevEnd.toISOString()}'`;
      const prevRes = await admin.graphql(query, { variables: { first: 250, search: prevSearch } });
      const prevData = await prevRes.json();
      const prevEdges = (prevData as any)?.data?.orders?.edges ?? [];
      let prevQty = 0; let prevSales = 0;
      const prevCounts = new Map<string, { title: string; quantity: number }>();
      const prevSalesByProduct = new Map<string, number>();
      for (const e of prevEdges) {
        const liEdges = e?.node?.lineItems?.edges ?? [];
        for (const li of liEdges) {
          const qty = li?.node?.quantity ?? 0; prevQty += qty;
          const amountStr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.amount as any;
          prevSales += amountStr ? parseFloat(amountStr) : 0;
          const p = li?.node?.product;
          const fallbackTitle: string = li?.node?.title ?? "Unknown product";
          const pid: string = p?.id ?? `li:${fallbackTitle}`;
          const ptitle: string = p?.title ?? fallbackTitle;
          if (!prevCounts.has(pid)) prevCounts.set(pid, { title: ptitle, quantity: 0 });
          prevCounts.get(pid)!.quantity += qty;
          const amt = amountStr ? parseFloat(amountStr) : 0;
          prevSalesByProduct.set(pid, (prevSalesByProduct.get(pid) || 0) + amt);
        }
      }
      comparison = {
        mode: compareMode,
        current: { qty: totalQty, sales: totalSales },
        previous: { qty: prevQty, sales: prevSales },
        deltas: {
          qty: totalQty - prevQty,
          qtyPct: prevQty ? ((totalQty - prevQty) / prevQty) * 100 : null,
          sales: totalSales - prevSales,
          salesPct: prevSales ? ((totalSales - prevSales) / prevSales) * 100 : null,
        },
        prevRange: { start: fmtYMD(prevStart), end: fmtYMD(prevEnd) },
      };

      if (compareScope === "aggregate") {
        if (compareMode === "mom") {
          const monthly = new Map<string, { label: string; qty: number; sales: number }>();
          for (const [key, info] of buckets.entries()) {
            let mKey = key;
            if (!/^\d{4}-\d{2}$/.test(mKey)) {
              const m = (key.match(/^(\d{4})-(\d{2})/) || info.label.match(/(\d{4})-(\d{2})/));
              if (m) mKey = `${m[1]}-${m[2]}`; else continue;
            }
            const [y, mm] = mKey.split('-').map((x) => parseInt(x, 10));
            const d = new Date(Date.UTC(y, mm - 1, 1));
            const label = `${d.toLocaleString("en-US", { month: "short" })} ${y}`;
            if (!monthly.has(mKey)) monthly.set(mKey, { label, qty: 0, sales: 0 });
            const acc = monthly.get(mKey)!;
            acc.qty += info.quantity;
            acc.sales += (bucketSales.get(key) || 0);
          }

          const ordered = Array.from(monthly.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1));
          momMonths = ordered.map(([key, v]) => ({ key, label: v.label }));
          const rows: Array<Record<string, any>> = [];
          if (momA && momB) {
            const a = monthly.get(momA);
            const b = monthly.get(momB);
            if (a && b) {
              rows.push({
                period: `${a.label} → ${b.label}`,
                qtyCurr: b.qty,
                qtyPrev: a.qty,
                qtyDelta: b.qty - a.qty,
                qtyDeltaPct: a.qty ? (((b.qty - a.qty) / a.qty) * 100) : null,
                salesCurr: b.sales,
                salesPrev: a.sales,
                salesDelta: b.sales - a.sales,
                salesDeltaPct: a.sales ? (((b.sales - a.sales) / a.sales) * 100) : null,
              });
            }
          } else {
            for (let i = 1; i < ordered.length; i++) {
              const prev = ordered[i - 1][1];
              const curr = ordered[i][1];
              rows.push({
                period: `${prev.label} → ${curr.label}`,
                qtyCurr: curr.qty,
                qtyPrev: prev.qty,
                qtyDelta: curr.qty - prev.qty,
                qtyDeltaPct: prev.qty ? (((curr.qty - prev.qty) / prev.qty) * 100) : null,
                salesCurr: curr.sales,
                salesPrev: prev.sales,
                salesDelta: curr.sales - prev.sales,
                salesDeltaPct: prev.sales ? (((curr.sales - prev.sales) / prev.sales) * 100) : null,
              });
            }
          }
          comparisonTable = rows;
          comparisonHeaders = ["Period", "Qty (Curr)", "Qty (Prev)", "Qty Δ", "Qty Δ%", "Sales (Curr)", "Sales (Prev)", "Sales Δ", "Sales Δ%"]; 
        } else {
          const monthlyCurr = new Map<string, { label: string; qty: number; sales: number }>();
          for (const [key, info] of buckets.entries()) {
            let mKey = key;
            if (!/^\d{4}-\d{2}$/.test(mKey)) {
              const m = (key.match(/^(\d{4})-(\d{2})/) || info.label.match(/(\d{4})-(\d{2})/));
              if (m) mKey = `${m[1]}-${m[2]}`; else continue;
            }
            const [y, mm] = mKey.split('-').map((x)=>parseInt(x,10));
            const d = new Date(Date.UTC(y, mm-1, 1));
            const label = `${d.toLocaleString("en-US", { month: "short" })} ${y}`;
            if (!monthlyCurr.has(mKey)) monthlyCurr.set(mKey, { label, qty: 0, sales: 0 });
            const acc = monthlyCurr.get(mKey)!;
            acc.qty += info.quantity;
            acc.sales += (bucketSales.get(key) || 0);
          }

          const monthlyPrev = new Map<string, { qty: number; sales: number }>();
          // Note: We only have prevEdges inside the earlier block; for brevity in this split file,
          // we recompute prevEdges similarly to above when needed.
          const prevStart = new Date(start!); prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1);
          const prevEnd = new Date(end!); prevEnd.setUTCFullYear(prevEnd.getUTCFullYear() - 1);
          const prevSearch = `processed_at:>='${prevStart.toISOString()}' processed_at:<='${prevEnd.toISOString()}'`;
          const prevRes = await admin.graphql(query, { variables: { first: 250, search: prevSearch } });
          const prevData = await prevRes.json();
          const prevEdges = (prevData as any)?.data?.orders?.edges ?? [];
          for (const e of prevEdges) {
            const d = new Date(e?.node?.processedAt);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
            if (!monthlyPrev.has(mKey)) monthlyPrev.set(mKey, { qty: 0, sales: 0 });
            const liEdges = e?.node?.lineItems?.edges ?? [];
            for (const li of liEdges) {
              const q = li?.node?.quantity ?? 0;
              const amountStr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.amount as any;
              const amt = amountStr ? parseFloat(amountStr) : 0;
              const acc = monthlyPrev.get(mKey)!;
              acc.qty += q; acc.sales += amt;
            }
          }

          const ordered = Array.from(monthlyCurr.entries()).sort((a,b)=> (a[0] > b[0] ? 1 : -1));
          comparisonHeaders = ["Period","Qty (Curr)","Qty (Prev)","Qty Δ","Qty Δ%","Sales (Curr)","Sales (Prev)","Sales Δ","Sales Δ%"]; 
          const rows: Array<Record<string, any>> = [];
          for (const [mKey, curr] of ordered) {
            const [y, mm] = mKey.split('-').map((x)=>parseInt(x,10));
            const prevKey = `${y-1}-${String(mm).padStart(2,'0')}`;
            const prev = monthlyPrev.get(prevKey) || { qty: 0, sales: 0 };
            rows.push({
              period: curr.label,
              qtyCurr: curr.qty,
              qtyPrev: prev.qty,
              qtyDelta: curr.qty - prev.qty,
              qtyDeltaPct: prev.qty ? (((curr.qty - prev.qty) / prev.qty) * 100) : null,
              salesCurr: curr.sales,
              salesPrev: prev.sales,
              salesDelta: curr.sales - prev.sales,
              salesDeltaPct: prev.sales ? (((curr.sales - prev.sales) / prev.sales) * 100) : null,
            });
          }
          comparisonTable = rows;
        }
      } else {
        if (compareMode === "mom") {
          const monthlyProduct = new Map<string, Map<string, { title: string; qty: number; sales: number }>>();
          for (const [key, info] of buckets.entries()) {
            let mKey = key;
            if (!/^\d{4}-\d{2}$/.test(mKey)) {
              const m = (key.match(/^(\d{4})-(\d{2})/) || info.label.match(/(\d{4})-(\d{2})/));
              if (m) mKey = `${m[1]}-${m[2]}`; else continue;
            }
            if (!monthlyProduct.has(mKey)) monthlyProduct.set(mKey, new Map());
            const row = pivot.get(key) || new Map<string, number>();
            const bucketQty = buckets.get(key)?.quantity || 1;
            const bucketAmt = bucketSales.get(key) || 0;
            for (const [pid, q] of row.entries()) {
              const alloc = (q / bucketQty) * bucketAmt;
              const title = productSet.get(pid)?.title || pid;
              const mp = monthlyProduct.get(mKey)!;
              if (!mp.has(pid)) mp.set(pid, { title, qty: 0, sales: 0 });
              const acc = mp.get(pid)!;
              acc.qty += q;
              acc.sales += alloc;
            }
          }
          const orderedMonths = Array.from(monthlyProduct.keys()).sort();
          let aKey = momA && monthlyProduct.has(momA) ? momA : undefined;
          let bKey = momB && monthlyProduct.has(momB) ? momB : undefined;
          if (!aKey || !bKey) {
            if (orderedMonths.length >= 2) {
              aKey = orderedMonths[orderedMonths.length - 2];
              bKey = orderedMonths[orderedMonths.length - 1];
            }
          }
          const aMap = (aKey ? monthlyProduct.get(aKey) : undefined) || new Map<string, { title: string; qty: number; sales: number }>();
          const bMap = (bKey ? monthlyProduct.get(bKey) : undefined) || new Map<string, { title: string; qty: number; sales: number }>();
          const monthLabel = (k?: string) => {
            if (!k) return "";
            const [y, mm] = k.split('-').map((x) => parseInt(x, 10));
            const d = new Date(Date.UTC(y, mm - 1, 1));
            return `${d.toLocaleString("en-US", { month: "short" })} ${y}`;
          };
          const keys = new Set<string>([...Array.from(aMap.keys()), ...Array.from(bMap.keys())]);
          const rows: Array<Record<string, any>> = [];
          for (const pid of keys) {
            const title = (bMap.get(pid)?.title) || (aMap.get(pid)?.title) || productSet.get(pid)?.title || pid;
            const a = aMap.get(pid) || { title, qty: 0, sales: 0 };
            const b = bMap.get(pid) || { title, qty: 0, sales: 0 };
            rows.push({
              product: title,
              productSku: productSet.get(pid)?.sku || "",
              qtyCurr: b.qty,
              qtyPrev: a.qty,
              qtyDelta: b.qty - a.qty,
              qtyDeltaPct: a.qty ? (((b.qty - a.qty) / a.qty) * 100) : null,
              salesCurr: b.sales,
              salesPrev: a.sales,
              salesDelta: b.sales - a.sales,
              salesDeltaPct: a.sales ? (((b.sales - a.sales) / a.sales) * 100) : null,
            });
          }
          rows.sort((x, y) => (y.salesDelta as number) - (x.salesDelta as number));
          comparisonTable = rows.slice(0, 100);
          comparisonHeaders = [
            `Product (${monthLabel(aKey)} → ${monthLabel(bKey)})`,
            "Qty (Curr)", "Qty (Prev)", "Qty Δ", "Qty Δ%",
            "Sales (Curr)", "Sales (Prev)", "Sales Δ", "Sales Δ%",
          ];
        } else {
          comparisonHeaders = ["Product", "Qty (Curr)", "Qty (Prev)", "Qty Δ", "Qty Δ%", "Sales (Curr)", "Sales (Prev)", "Sales Δ", "Sales Δ%"];
          const prevStart2 = new Date(start!); prevStart2.setUTCFullYear(prevStart2.getUTCFullYear() - 1);
          const prevEnd2 = new Date(end!); prevEnd2.setUTCFullYear(prevEnd2.getUTCFullYear() - 1);
          const prevSearch2 = `processed_at:>='${prevStart2.toISOString()}' processed_at:<='${prevEnd2.toISOString()}'`;
          const prevRes2 = await admin.graphql(query, { variables: { first: 250, search: prevSearch2 } });
          const prevData2 = await prevRes2.json();
          const prevEdges2 = (prevData2 as any)?.data?.orders?.edges ?? [];
          const prevCounts = new Map<string, { title: string; quantity: number }>();
          const prevSalesByProduct = new Map<string, number>();
          for (const e of prevEdges2) {
            const liEdges = e?.node?.lineItems?.edges ?? [];
            for (const li of liEdges) {
              const qty = li?.node?.quantity ?? 0;
              const amountStr: string | undefined = li?.node?.discountedTotalSet?.shopMoney?.amount as any;
              const amt = amountStr ? parseFloat(amountStr) : 0;
              const p = li?.node?.product;
              const fallbackTitle: string = li?.node?.title ?? "Unknown product";
              const pid: string = p?.id ?? `li:${fallbackTitle}`;
              const ptitle: string = p?.title ?? fallbackTitle;
              if (!prevCounts.has(pid)) prevCounts.set(pid, { title: ptitle, quantity: 0 });
              prevCounts.get(pid)!.quantity += qty;
              prevSalesByProduct.set(pid, (prevSalesByProduct.get(pid) || 0) + amt);
            }
          }
          const keys = new Set<string>([...productSet.keys(), ...prevCounts.keys()]);
          const rows: Array<Record<string, any>> = [];
          for (const pid of keys) {
            const title = productSet.get(pid)?.title || prevCounts.get(pid)?.title || pid;
            const qCurr = pivot.get(keys as any)?.get(pid as any) || 0; // pivot used per bucket; keep current via counts
            const qPrev = prevCounts.get(pid)?.quantity || 0;
            const sCurr = salesByProduct.get(pid) || 0;
            const sPrev = prevSalesByProduct.get(pid) || 0;
            rows.push({
              product: title,
              productSku: productSet.get(pid)?.sku || "",
              qtyCurr: (counts.get(pid)?.quantity || 0),
              qtyPrev: qPrev,
              qtyDelta: (counts.get(pid)?.quantity || 0) - qPrev,
              qtyDeltaPct: qPrev ? ((((counts.get(pid)?.quantity || 0) - qPrev) / qPrev) * 100) : null,
              salesCurr: sCurr,
              salesPrev: sPrev,
              salesDelta: sCurr - sPrev,
              salesDeltaPct: sPrev ? (((sCurr - sPrev) / sPrev) * 100) : null,
            });
          }
          rows.sort((a, b) => (b.salesDelta as number) - (a.salesDelta as number));
          comparisonTable = rows.slice(0, 50);
        }
      }
    }

    return json({
      topProducts: Array.from(counts.entries())
        .map(([id, { title, quantity }]) => ({ id, title, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
      topProductsBySales,
      series,
      table,
      // Align headers with the same top-20-by-quantity list used to build table rows
      headers: top20Ids.map((id) => ({
        id,
        title: productSet.get(id)?.title || counts.get(id)?.title || id,
      })),
      totals: { qty: totalQty, sales: totalSales, currency: currencyCode },
      comparison,
      comparisonTable,
      comparisonHeaders,
      seriesProduct,
      seriesProductLines,
      productLegend: top5Ids.map((id) => ({ id, title: productSet.get(id)?.title || id, sku: productSet.get(id)?.sku || "" })),
      momMonths,
      filters: { start: fmtYMD(start!), end: fmtYMD(end!), granularity: granParam, preset, view, compare: compareMode, chart: chartType, metric: chartMetric, chartScope, compareScope, productFocus, momA: momA || undefined, momB: momB || undefined },
      shop: session.shop,
    });
  } catch (err: any) {
    dlog("Loader error:", err?.message, (err as any)?.response?.errors || err);
    return json(
      {
        error: "REQUEST_FAILED",
        message: err?.message || "Failed to load orders",
        shop: session.shop,
      },
      { status: 200 },
    );
  }
};
