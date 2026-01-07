import { NextResponse } from "next/server";
import { getXeroSession } from "@/lib/session";
import { getXeroAnalytics, type Granularity, type XeroAnalyticsFilters } from "../xero-analytics.server";

type Money = number;

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyColumns(ws: any, XLSX: any) {
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  if (!range) return;

  const headerRow = 3; // 0-indexed row 3 = row 4 in Excel
  const moneyCols = new Set<number>();

  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = ws[addr];
    const header = String(cell?.v ?? "").toLowerCase();
    if (!header) continue;

    const isPercent = header.includes("%") || header.includes("pct") || header.includes("percent");
    const isMoney =
      (header.includes("sales") || header.includes("revenue") || header.includes("price") || header.includes("amount")) &&
      !isPercent;

    if (isMoney) moneyCols.add(c);
  }

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    for (const c of moneyCols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      if (typeof cell.v === "number") {
        cell.t = "n";
        cell.z = "#,##0.00";
      }
    }
  }
}

function sheetFromAOA(XLSX: any, data: any[][], formatMoney = false) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  if (formatMoney) formatMoneyColumns(ws, XLSX);
  return ws;
}

function pct(delta: number, base: number): number | null {
  if (!base) return null;
  return (delta / base) * 100;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  if (format !== "xlsx") {
    return NextResponse.json({ ok: false, error: "format must be xlsx" }, { status: 400 });
  }

  const session = await getXeroSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const filters: XeroAnalyticsFilters = {
    preset: (searchParams.get("preset") as any) || undefined,
    start: searchParams.get("start") || undefined,
    end: searchParams.get("end") || undefined,
    granularity: (searchParams.get("granularity") as Granularity) || undefined,
    includePurchases: searchParams.get("includePurchases") === "1" || searchParams.get("includePurchases") === "true" || undefined,
    pages: searchParams.get("pages") ? Number(searchParams.get("pages")) : undefined,
    chunk: searchParams.get("chunk") ? Number(searchParams.get("chunk")) : undefined,
  };

  const result = await getXeroAnalytics(filters);

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const now = new Date();
  const generatedAt = now.toISOString();

  // Sheet 1: Export Info
  const exportInfo: any[][] = [
    ["Analytics Export"],
    ["Generated", generatedAt],
    ["Tenant", session.tenantId],
    [],
    ["Filter", "Value"],
    ["Preset", result.filters.preset],
    ["Start", result.filters.start],
    ["End", result.filters.end],
    ["Granularity", result.filters.granularity],
    ["Include Purchases", String(Boolean(filters.includePurchases))],
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, exportInfo, false), "Export Info");

  // Sheet 2: Trends - Qty
  const trendsQty: any[][] = [
    ["Trends - Qty"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    ["Period", "Quantity"],
    ...result.series.map((s) => [s.label, toNum(s.quantity)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, trendsQty, false), "Trends - Qty");

  // Sheet 3: Trends - Sales
  const trendsSales: any[][] = [
    ["Trends - Sales"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    ["Period", "Sales"],
    ...result.series.map((s) => [s.label, toNum(s.sales as Money)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, trendsSales, true), "Trends - Sales");

  // Sheet 4/5: All Products - Qty / Sales
  const byProductQty: any[][] = [
    ["All Products - Qty"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    ["Rank", "Product", "Quantity"],
    ...[...result.salesByProduct]
      .sort((a, b) => toNum(b.qty) - toNum(a.qty))
      .map((p, idx) => [idx + 1, p.title, toNum(p.qty)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, byProductQty, false), "All Products - Qty");

  const byProductSales: any[][] = [
    ["All Products - Sales"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    ["Rank", "Product", "Sales"],
    ...[...result.salesByProduct]
      .sort((a, b) => toNum(b.sales) - toNum(a.sales))
      .map((p, idx) => [idx + 1, p.title, toNum(p.sales)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, byProductSales, true), "All Products - Sales");

  // Sheet 6: Summary
  const topQty = [...result.salesByProduct].sort((a, b) => toNum(b.qty) - toNum(a.qty)).slice(0, 10);
  const bottomQty = [...result.salesByProduct].sort((a, b) => toNum(a.qty) - toNum(b.qty)).slice(0, 10);
  const topSales = [...result.salesByProduct].sort((a, b) => toNum(b.sales) - toNum(a.sales)).slice(0, 10);
  const bottomSales = [...result.salesByProduct].sort((a, b) => toNum(a.sales) - toNum(b.sales)).slice(0, 10);

  const summary: any[][] = [
    ["Summary"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    ["Total Qty", toNum(result.totals.qty)],
    ["Total Sales", toNum(result.totals.sales)],
    [],
    ["Top 10 by Qty"],
    ["Rank", "Product", "Qty"],
    ...topQty.map((p, idx) => [idx + 1, p.title, toNum(p.qty)]),
    [],
    ["Bottom 10 by Qty"],
    ["Rank", "Product", "Qty"],
    ...bottomQty.map((p, idx) => [idx + 1, p.title, toNum(p.qty)]),
    [],
    ["Top 10 by Sales"],
    ["Rank", "Product", "Sales"],
    ...topSales.map((p, idx) => [idx + 1, p.title, toNum(p.sales)]),
    [],
    ["Bottom 10 by Sales"],
    ["Rank", "Product", "Sales"],
    ...bottomSales.map((p, idx) => [idx + 1, p.title, toNum(p.sales)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, summary, true), "Summary");

  // Sheet 7: Compare - MoM (aggregate)
  const momRows = result.mom || [];
  const momSheet: any[][] = [
    ["Compare - MoM"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    [
      "Period",
      "Qty (Curr)",
      "Qty (Prev)",
      "Qty Δ",
      "Qty Δ%",
      "Sales (Curr)",
      "Sales (Prev)",
      "Sales Δ",
      "Sales Δ%",
    ],
    ...momRows.map((r) => {
      const qtyDelta = toNum(r.curr.qty) - toNum(r.prev.qty);
      const salesDelta = toNum(r.curr.sales) - toNum(r.prev.sales);
      return [
        r.period,
        toNum(r.curr.qty),
        toNum(r.prev.qty),
        qtyDelta,
        pct(qtyDelta, toNum(r.prev.qty)),
        toNum(r.curr.sales),
        toNum(r.prev.sales),
        salesDelta,
        pct(salesDelta, toNum(r.prev.sales)),
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, momSheet, true), "Compare - MoM");

  // Sheet 8: Compare - YoY (monthly aggregate)
  const yoyRows = result.yoy || [];
  const yoySheet: any[][] = [
    ["Compare - YoY"],
    [`Range: ${result.filters.start} to ${result.filters.end}`],
    [],
    [
      "Month",
      "Qty (Curr)",
      "Qty (Prev)",
      "Qty Δ",
      "Qty Δ%",
      "Sales (Curr)",
      "Sales (Prev)",
      "Sales Δ",
      "Sales Δ%",
    ],
    ...yoyRows.map((r) => {
      const qtyDelta = toNum(r.curr.qty) - toNum(r.prev.qty);
      const salesDelta = toNum(r.curr.sales) - toNum(r.prev.sales);
      return [
        r.month,
        toNum(r.curr.qty),
        toNum(r.prev.qty),
        qtyDelta,
        pct(qtyDelta, toNum(r.prev.qty)),
        toNum(r.curr.sales),
        toNum(r.prev.sales),
        salesDelta,
        pct(salesDelta, toNum(r.prev.sales)),
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(XLSX, yoySheet, true), "Compare - YoY");

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"analytics-${today}.xlsx\"`,
      "Cache-Control": "no-store",
    },
  });
}
