import styles from '../page.module.css';
import '@/app/app/analytics/analytics.css';
import { getXeroSession } from '@/lib/session';
import { getXeroAnalytics, type XeroAnalyticsFilters } from './xero-analytics.server';
import { ProductTable } from './ProductTable';
import { ProductComparisonTable } from './ProductComparisonTable';
import { EnhancedTable } from './EnhancedTable';
import { StackedBarChart } from './StackedBarChart';
import { LineChart } from './LineChart';
import { InteractiveBarChart } from './InteractiveBarChart';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams?: Promise<Record<string, string | string[]>> };

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const session = await getXeroSession();
  const connected = !!session;

  const sp = (await searchParams) || {};
  const view = (typeof sp.view === 'string' ? sp.view : 'chart') as 'chart' | 'table' | 'summary' | 'compare';
  const metric = (typeof sp.metric === 'string' ? sp.metric : 'qty') as 'qty' | 'sales';
  const chartScope = (typeof sp.chartScope === 'string' ? sp.chartScope : 'aggregate') as 'aggregate' | 'product';
  const chart = (typeof sp.chart === 'string' ? sp.chart : 'bar') as 'bar' | 'line';
  const compareType = (typeof sp.compareType === 'string' ? sp.compareType : 'mom') as 'mom' | 'yoy';
  const compareScope = (typeof sp.compareScope === 'string' ? sp.compareScope : 'total') as 'total' | 'product';
  const compareA = (typeof sp.compareA === 'string' ? sp.compareA : ''); // YYYY-MM
  const compareB = (typeof sp.compareB === 'string' ? sp.compareB : ''); // YYYY-MM

  const filters: XeroAnalyticsFilters = {
    preset: (typeof sp.preset === 'string' ? sp.preset : 'last30') as any,
    start: typeof sp.start === 'string' ? sp.start : undefined,
    end: typeof sp.end === 'string' ? sp.end : undefined,
    granularity: (typeof sp.granularity === 'string' ? (sp.granularity as any) : 'day'),
  };

  let result: Awaited<ReturnType<typeof getXeroAnalytics>> | null = null;
  let loadError: any = null;
  if (connected) {
    try {
      result = await getXeroAnalytics(filters);
    } catch (e: any) {
      loadError = e;
      console.error('[analytics] failed to load analytics:', e?.response?.body || e?.message || e);
    }
  }

  // Chart precompute
  const series = result?.series ?? [];
  const svgPadding = { top: 16, right: 16, bottom: 32, left: 40 };
  const svgW = Math.max(560, 48 + series.length * 80);
  const svgH = 260;
  const innerW = svgW - svgPadding.left - svgPadding.right;
  const innerH = svgH - svgPadding.top - svgPadding.bottom;
  const maxMetric = Math.max(1, ...series.map((s) => (metric === 'sales' ? s.sales : s.quantity)));
  const yScale = (v: number) => innerH - (v / maxMetric) * innerH;
  const xBand = (i: number) => (innerW / Math.max(1, series.length)) * i + (innerW / Math.max(1, series.length)) / 2;

  // Utilities
  const fmtMoney = (n: number | undefined) => {
    const v = Number(n ?? 0);
    const formatted = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    return result?.totals.currency ? `${result.totals.currency} ${formatted}` : formatted;
  };
  

  return (
    <div className={styles.container}>
      <h1>Analytics</h1>
      {!connected ? (
        <div className={styles.card}>
          <p>Not connected to Xero. Connect to run analytics.</p>
          <a href="/api/xero/connect" className={styles.primaryBtn}>Connect to Xero</a>
        </div>
      ) : loadError ? (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>Unable to load analytics</h3>
          <p>Your Xero session may have expired or the request was unauthorized.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
            {String(loadError?.response?.body?.Detail || loadError?.message || 'Unauthorized')}
          </pre>
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <a href="/api/xero/connect" className={styles.primaryBtn}>Reconnect to Xero</a>
            <a href={typeof window === 'undefined' ? '?' : (typeof location !== 'undefined' ? location.pathname + location.search : '?')} className={styles.secondaryBtn || styles.primaryBtn}>
              Retry
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className={`${styles.card} analytics-card`}>
            <form id="filters-form" method="get" className="analytics-form-row">
              <div className="analytics-select">
                <label className="text-12">Time Period</label>
                <select name="preset" defaultValue={result?.filters.preset || 'last30'}>
                  <option value="last30">Last 30 days</option>
                  <option value="thisMonth">This month</option>
                  <option value="ytd">Year to date</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="analytics-select">
                <label className="text-12">Start Date</label>
                <input name="start" type="date" defaultValue={result?.filters.start} />
              </div>
              <div className="analytics-select">
                <label className="text-12">End Date</label>
                <input name="end" type="date" defaultValue={result?.filters.end} />
              </div>
              <div className="analytics-select">
                <label className="text-12">Group By</label>
                <select name="granularity" defaultValue={result?.filters.granularity || 'day'}>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </div>
              <div className="analytics-apply">
                <button className={styles.primaryBtn} type="submit">Apply Filters</button>
              </div>
              {/* Persist current UI selections */}
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="metric" value={metric} />
              <input type="hidden" name="chart" value={chart} />
              <input type="hidden" name="chartScope" value={chartScope} />
            </form>
          </div>

          {/* View tabs */}
          <div className={`${styles.card} analytics-card`} style={{ padding: 8 }}>
            <div className="analytics-segmented">
              <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart' }).toString()}`} className={view === 'chart' ? '' : 'analytics-muted'}>📊 Charts</a>
              <a href={`?${new URLSearchParams({ ...sp as any, view: 'table' }).toString()}`} className={view === 'table' ? '' : 'analytics-muted'}>📋 Data Table</a>
              <a href={`?${new URLSearchParams({ ...sp as any, view: 'summary' }).toString()}`} className={view === 'summary' ? '' : 'analytics-muted'}>📑 Summary</a>
              <a href={`?${new URLSearchParams({ ...sp as any, view: 'compare' }).toString()}`} className={view === 'compare' ? '' : 'analytics-muted'}>🔄 Compare</a>
            </div>
          </div>

          {/* Charts */}
          {view === 'chart' && (
            <div className={`${styles.card} analytics-card`}>
              <div className="analytics-header">
                <div className="analytics-segmented">
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart', metric: 'qty' }).toString()}`} className={metric === 'qty' ? '' : 'analytics-muted'}>📦 Quantity</a>
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart', metric: 'sales' }).toString()}`} className={metric === 'sales' ? '' : 'analytics-muted'}>💰 Sales</a>
                  <span className="spacer-16" />
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart', chartScope: 'aggregate' }).toString()}`} className={chartScope === 'aggregate' ? '' : 'analytics-muted'}>📊 Total</a>
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart', chartScope: 'product' }).toString()}`} className={chartScope === 'product' ? '' : 'analytics-muted'}>🏷️ By Product</a>
                  <span className="spacer-16" />
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart', chart: 'bar' }).toString()}`} className={chart === 'bar' ? '' : 'analytics-muted'}>📊 Bar</a>
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'chart', chart: 'line' }).toString()}`} className={chart === 'line' ? '' : 'analytics-muted'}>📈 Line</a>
                </div>
                <div className="legend-label">{result?.filters.start} to {result?.filters.end}</div>
              </div>

              <div className="legend-label" style={{ marginBottom: 8 }}>
                Note: values are pre-tax. Credit notes are included as negatives.
                {result?.diagnostics ? (
                  <span> · Data: {result.diagnostics.included}/{result.diagnostics.fetched} invoices (excluded non-sales {result.diagnostics.excludedNonSales}, status {result.diagnostics.excludedStatus})</span>
                ) : null}
                {result?.diagnostics?.productCodeMatches !== undefined ? (
                  <span> · Products: {result.diagnostics.productCodeMatches} exact, {result.diagnostics.productHeuristicMatches} heuristic</span>
                ) : null}
                {result?.diagnostics?.inferredQtyLines ? (
                  <span> · Qty inferred: {result.diagnostics.inferredQtyLines} lines</span>
                ) : null}
                {result?.credits ? (
                  <span> · Credits: {result.credits.count} docs, Qty {result.credits.qty}, Sales {fmtMoney(result.credits.sales)}</span>
                ) : null}
              </div>

              {/* Aggregate chart */}
              {chartScope === 'aggregate' && chart === 'bar' && (
                series.length === 0 ? <p>No data in range.</p> : (
                  <div className="analytics-chart-scroll" style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#ffffff' }}>
                    <InteractiveBarChart 
                      series={series}
                      metric={metric}
                      currency={result?.totals.currency}
                      svgWidth={svgW}
                      svgHeight={svgH}
                      padding={svgPadding}
                    />
                  </div>
                )
              )}
              
              {/* Aggregate line chart */}
              {chartScope === 'aggregate' && chart === 'line' && (
                series.length === 0 ? <p>No data in range.</p> : (
                  <div className="analytics-chart-scroll">
                    <Suspense fallback={<div>Loading line chart...</div>}>
                      <LineChart
                        data={[{
                          key: 'aggregate',
                          label: 'Aggregate',
                          products: series.map(s => ({
                            id: s.key,
                            title: s.label,
                            value: metric === 'sales' ? s.sales : s.quantity
                          }))
                        }]}
                        title={`${metric === 'sales' ? 'Sales' : 'Quantity'} Over Time`}
                        yAxisLabel={metric === 'sales' ? 'Sales' : 'Quantity'}
                        xAxisLabel="Time Period"
                        height={400}
                        formatType={metric === 'sales' ? 'money' : 'number'}
                        currency={result?.totals?.currency}
                      />
                    </Suspense>
                  </div>
                )
              )}

              {/* By product chart: stacked bar chart with interactive legend */}
              {chartScope === 'product' && chart === 'bar' && (
                ((result?.seriesProduct?.length ?? 0) === 0) ? <p>No data in range.</p> : (
                  <div className="analytics-chart-scroll">
                    <Suspense fallback={<div>Loading stacked bar chart...</div>}>
                      <StackedBarChart
                        data={(result?.seriesProduct || []).map(series => ({
                          key: series.key,
                          label: series.label,
                          products: Object.entries(series.per).map(([id, data]) => ({
                            id,
                            title: data.title,
                            value: metric === 'sales' ? data.sales : data.qty
                          }))
                        }))}
                        title={`${metric === 'sales' ? 'Sales' : 'Quantity'} by Product`}
                        yAxisLabel={metric === 'sales' ? 'Sales' : 'Quantity'}
                        xAxisLabel="Time Period"
                        height={400}
                        formatType={metric === 'sales' ? 'money' : 'number'}
                        currency={result?.totals?.currency}
                      />
                    </Suspense>
                  </div>
                )
              )}
              
              {/* By product chart: line chart with interactive legend */}
              {chartScope === 'product' && chart === 'line' && (
                ((result?.seriesProduct?.length ?? 0) === 0) ? <p>No data in range.</p> : (
                  <div className="analytics-chart-scroll">
                    <Suspense fallback={<div>Loading line chart...</div>}>
                      <LineChart
                        data={(result?.seriesProduct || []).map(series => ({
                          key: series.key,
                          label: series.label,
                          products: Object.entries(series.per).map(([id, data]) => ({
                            id,
                            title: data.title,
                            value: metric === 'sales' ? data.sales : data.qty
                          }))
                        }))}
                        title={`${metric === 'sales' ? 'Sales' : 'Quantity'} by Product Over Time`}
                        yAxisLabel={metric === 'sales' ? 'Sales' : 'Quantity'}
                        xAxisLabel="Time Period"
                        height={400}
                        formatType={metric === 'sales' ? 'money' : 'number'}
                        currency={result?.totals?.currency}
                      />
                    </Suspense>
                  </div>
                )
              )}
            </div>
          )}

          {/* Data table view */}
          {view === 'table' && (
            <div className={`${styles.card} analytics-card`}>
              <h3 className={styles.sectionTitle}>Table View</h3>
              {chartScope === 'product' ? (
                <Suspense fallback={<div>Loading product data table...</div>}>
                  <EnhancedTable
                    data={(result?.seriesProduct || []).map(row => {
                      const rowData: Record<string, any> = { timePeriod: row.label };
                      (result?.productLegend || []).forEach(p => {
                        rowData[p.id] = metric === 'sales' 
                          ? (row.per[p.id]?.sales ?? 0) 
                          : (row.per[p.id]?.qty ?? 0);
                      });
                      return rowData;
                    })}
                    columns={[
                      {
                        id: 'timePeriod',
                        header: 'Time Period',
                        accessorKey: 'timePeriod',
                        sortable: true,
                        align: 'left',
                        width: '150px'
                      },
                      ...(result?.productLegend || []).map(p => ({
                        id: p.id,
                        header: p.title,
                        accessorKey: p.id,
                        sortable: true,
                        align: 'right' as const,
                        format: (metric === 'sales' ? 'money' : 'number') as 'money' | 'number'
                      }))
                    ]}
                    keyField="timePeriod"
                    title="Products by Time Period"
                    subtitle={`Showing ${metric === 'sales' ? 'sales' : 'quantity'} for each product across time periods`}
                    searchPlaceholder="Search by time period or product..."
                    maxHeight="600px"
                    currency={result?.totals?.currency}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<div>Loading time series table...</div>}>
                  <EnhancedTable
                    data={(result?.series || []).map(s => ({
                      key: s.key,
                      label: s.label,
                      value: metric === 'sales' ? s.sales : s.quantity
                    }))}
                    columns={[
                      {
                        id: 'label',
                        header: 'Time Period',
                        accessorKey: 'label',
                        sortable: true,
                        align: 'left',
                        width: '150px'
                      },
                      {
                        id: 'value',
                        header: metric === 'sales' ? 'Sales' : 'Quantity',
                        accessorKey: 'value',
                        sortable: true,
                        align: 'right',
                        format: (metric === 'sales' ? 'money' : 'number') as 'money' | 'number'
                      }
                    ]}
                    keyField="key"
                    title={`Time Series ${metric === 'sales' ? 'Sales' : 'Quantity'}`}
                    subtitle={`Showing ${metric === 'sales' ? 'sales' : 'quantity'} across time periods`}
                    searchPlaceholder="Search by time period..."
                    maxHeight="600px"
                    currency={result?.totals?.currency}
                  />
                </Suspense>
              )}
            </div>
          )}

          {/* Summary */}
          {view === 'summary' && (
            <div className={`${styles.card} analytics-card`}>
              <h3 className={styles.sectionTitle}>Summary</h3>
              <p>Total quantity: {result?.totals.qty}</p>
              <p>Total sales (pre-tax): {fmtMoney(result?.totals.sales)}</p>
              <p className="legend-label">Note: values are pre-tax. Credit notes are included as negatives.</p>

              {result?.credits ? (
                <div style={{ margin: '8px 0 16px' }}>
                  <strong>Credits applied</strong>
                  <div className="legend-label">Count {result.credits.count} · Qty {result.credits.qty} · Sales {fmtMoney(result.credits.sales)}</div>
                </div>
              ) : null}

              <h4 className={styles.sectionTitle}>Top 10 products by quantity</h4>
              <Suspense fallback={<div>Loading top products by quantity...</div>}>
                <EnhancedTable
                  data={(result?.top10ByQty || []).map((p, idx) => ({
                    id: p.id,
                    rank: idx + 1,
                    title: p.title,
                    qty: p.qty
                  }))}
                  columns={[
                    {
                      id: 'rank',
                      header: '#',
                      accessorKey: 'rank',
                      sortable: true,
                      align: 'left',
                      width: '50px'
                    },
                    {
                      id: 'title',
                      header: 'Product',
                      accessorKey: 'title',
                      sortable: true,
                      align: 'left'
                    },
                    {
                      id: 'qty',
                      header: 'Qty',
                      accessorKey: 'qty',
                      sortable: true,
                      align: 'right',
                      width: '100px',
                      format: 'number'
                    }
                  ]}
                  keyField="id"
                  searchPlaceholder="Search products..."
                  maxHeight="400px"
                  currency={result?.totals?.currency}
                />
              </Suspense>

              <h4 className={styles.sectionTitle}>Top 10 products by sales</h4>
              <Suspense fallback={<div>Loading top products by sales...</div>}>
                <EnhancedTable
                  data={(result?.top10BySales || []).map((p, idx) => ({
                    id: p.id,
                    rank: idx + 1,
                    title: p.title,
                    sales: p.sales
                  }))}
                  columns={[
                    {
                      id: 'rank',
                      header: '#',
                      accessorKey: 'rank',
                      sortable: true,
                      align: 'left',
                      width: '50px'
                    },
                    {
                      id: 'title',
                      header: 'Product',
                      accessorKey: 'title',
                      sortable: true,
                      align: 'left'
                    },
                    {
                      id: 'sales',
                      header: 'Sales',
                      accessorKey: 'sales',
                      sortable: true,
                      align: 'right',
                      width: '120px',
                      format: 'money'
                    }
                  ]}
                  keyField="id"
                  searchPlaceholder="Search products..."
                  maxHeight="400px"
                  currency={result?.totals?.currency}
                />
              </Suspense>

              <h4 className={styles.sectionTitle}>Sales by product</h4>
              <Suspense fallback={<div>Loading product table...</div>}>
                <ProductTable data={result?.salesByProduct || []} currency={result?.totals?.currency || 'USD'} />
              </Suspense>
            </div>
          )}

          {/* Compare */}
          {view === 'compare' && (
            <div className={`${styles.card} analytics-card`}>
              <div className="analytics-header">
                <div className="analytics-segmented">
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'compare', compareType: 'mom' }).toString()}`} className={compareType === 'mom' ? '' : 'analytics-muted'}>📊 Month-over-Month</a>
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'compare', compareType: 'yoy' }).toString()}`} className={compareType === 'yoy' ? '' : 'analytics-muted'}>📅 Year-over-Year</a>
                  <span className="spacer-16" />
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'compare', compareScope: 'total' }).toString()}`} className={compareScope === 'total' ? '' : 'analytics-muted'}>📈 Overall Totals</a>
                  <a href={`?${new URLSearchParams({ ...sp as any, view: 'compare', compareScope: 'product' }).toString()}`} className={compareScope === 'product' ? '' : 'analytics-muted'}>🏷️ By Product</a>
                </div>
              </div>

              {compareType === 'mom' ? (
                ((result?.mom || []).length === 0) ? <p>No month-over-month data available.</p> : (
                  <>
                  {/* Month selection row */}
                  <div className="analytics-card" style={{ marginBottom: 12 }}>
                    <form method="get" className="analytics-form-row">
                      <div className="analytics-select">
                        <label className="text-12">From Month</label>
                        <select name="compareA" defaultValue={compareA || ''}>
                          <option value="">(auto-select)</option>
                          {(result?.monthlyTotals || []).map((m) => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="analytics-select">
                        <label className="text-12">To Month</label>
                        <select name="compareB" defaultValue={compareB || ''}>
                          <option value="">(auto-select next)</option>
                          {(result?.monthlyTotals || []).map((m) => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      {/* persist other params */}
                      <input type="hidden" name="view" value="compare" />
                      <input type="hidden" name="compareType" value={compareType} />
                      <input type="hidden" name="compareScope" value={compareScope} />
                      <input type="hidden" name="preset" value={result?.filters.preset || ''} />
                      <input type="hidden" name="start" value={result?.filters.start || ''} />
                      <input type="hidden" name="end" value={result?.filters.end || ''} />
                      <input type="hidden" name="granularity" value={result?.filters.granularity || ''} />
                      <div className="analytics-apply">
                        <button className={styles.primaryBtn} type="submit">Update Comparison</button>
                      </div>
                    </form>
                  </div>

                  {/* Custom pair summary (if selected) */}
                  {(compareA && compareB && result?.monthlyDict) ? (() => {
                    const a = result.monthlyDict[compareA];
                    const b = result.monthlyDict[compareB];
                    if (!a || !b) return null;
                    const qtyDelta = (b.qty - a.qty);
                    const salesDelta = (b.sales - a.sales);
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Period</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Curr)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Prev)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty Δ</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Curr)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Prev)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '8px 6px' }}>{a.label} → {b.label}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>{b.qty}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>{a.qty}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>{qtyDelta.toFixed(0)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(b.sales)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(a.sales)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(salesDelta)}</td>
                          </tr>
                        </tbody>
                      </table>
                    );
                  })() : null}

                  {/* Auto consecutive list */}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Period</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Curr)</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Prev)</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty Δ</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Curr)</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Prev)</th>
                        <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result?.mom ?? []).map((r) => (
                        <tr key={r.period}>
                          <td style={{ padding: '8px 6px' }}>{(() => {
                            const [aKey, , bKey] = r.period.split(' ');
                            const a = result?.monthlyDict?.[aKey];
                            const b = result?.monthlyDict?.[bKey];
                            return a && b ? `${a.label} → ${b.label}` : r.period;
                          })()}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.curr.qty}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.prev.qty}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{(r.curr.qty - r.prev.qty).toFixed(0)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.curr.sales)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.prev.sales)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.curr.sales - r.prev.sales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* By Product tables */}
                  {compareScope === 'product' && (
                    (() => {
                      const months = (result?.monthlyProduct || []).map(mp => mp.key);
                      let aKey = compareA || '';
                      let bKey = compareB || '';
                      if (!aKey || !bKey) {
                        if (months.length >= 2) { aKey = months[months.length-2]; bKey = months[months.length-1]; }
                      }
                      const a = (result?.monthlyProduct || []).find(mp => mp.key === aKey);
                      const b = (result?.monthlyProduct || []).find(mp => mp.key === bKey);
                      
                      // If no data is available, show a message
                      if (!a || !b) {
                        return (
                          <div style={{ marginTop: 16, padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center' }}>
                            <p>No product comparison data available for the selected months.</p>
                            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Try selecting different months or check that your data contains product information.</p>
                          </div>
                        );
                      }
                      
                      // Process the data for comparison
                      const rowsMap = new Map<string, { title: string; aQty: number; bQty: number; aSales: number; bSales: number }>();
                      
                      // Add products from first month
                      for (const [pid, v] of Object.entries(a.per)) {
                        rowsMap.set(pid, { title: v.title, aQty: v.qty, bQty: 0, aSales: v.sales, bSales: 0 });
                      }
                      
                      // Add or update products from second month
                      for (const [pid, v] of Object.entries(b.per)) {
                        const r = rowsMap.get(pid);
                        if (r) { r.bQty = v.qty; r.bSales = v.sales; }
                        else { rowsMap.set(pid, { title: v.title, aQty: 0, bQty: v.qty, aSales: 0, bSales: v.sales }); }
                      }
                      
                      // Convert to array format expected by ProductComparisonTable
                      const rows = Array.from(rowsMap.entries())
                        .map(([pid, r]) => ({ 
                          id: pid, 
                          title: r.title, 
                          currQty: r.bQty, 
                          prevQty: r.aQty, 
                          currSales: r.bSales, 
                          prevSales: r.aSales 
                        }))
                        // Filter out rows with no data
                        .filter(row => row.currQty > 0 || row.prevQty > 0 || row.currSales > 0 || row.prevSales > 0);
                      
                      // If no rows after filtering, show a message
                      if (rows.length === 0) {
                        return (
                          <div style={{ marginTop: 16, padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center' }}>
                            <p>No product comparison data available for the selected months.</p>
                            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Try selecting different months or check that your data contains product information.</p>
                          </div>
                        );
                      }
                      
                      const aLabel = result?.monthlyDict?.[aKey]?.label || aKey;
                      const bLabel = result?.monthlyDict?.[bKey]?.label || bKey;
                      const periodLabel = `${aLabel} → ${bLabel}`;
                      
                      return (
                        <div style={{ marginTop: 16 }}>
                          <Suspense fallback={<div>Loading product comparison...</div>}>
                            <ProductComparisonTable 
                              data={rows} 
                              currency={result?.totals?.currency || 'USD'} 
                              periodLabel={periodLabel} 
                            />
                          </Suspense>
                        </div>
                      );
                    })()
                  )}
                  </>
                )
              ) : (
                (() => {
                  const rows = result?.yoy ?? [];
                  if (rows.length === 0) return <p>No year-over-year data available.</p>;
                  const totals = rows.reduce((acc, r) => {
                    acc.currQty += r.curr.qty; acc.prevQty += r.prev.qty;
                    acc.currSales += r.curr.sales; acc.prevSales += r.prev.sales;
                    return acc;
                  }, { currQty: 0, prevQty: 0, currSales: 0, prevSales: 0 });
                  const qtyDelta = totals.currQty - totals.prevQty;
                  const salesDelta = totals.currSales - totals.prevSales;
                  return (
                    <>
                      {/* Summary cards */}
                      <div className="analytics-card" style={{ marginBottom: 12, background: 'linear-gradient(90deg,#6d28d9,#06b6d4)', color: '#fff' }}>
                        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(220px,1fr))', gap: 12 }}>
                          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12 }}>
                            <div className="legend-label" style={{ color: '#e5e7eb' }}>Total Quantity</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{totals.currQty}</div>
                            <div className="legend-label">vs {totals.prevQty} last year</div>
                            <div style={{ marginTop: 6, fontSize: 12 }}>{qtyDelta >= 0 ? '▲' : '▼'} {Math.abs(qtyDelta).toFixed(0)}</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 12 }}>
                            <div className="legend-label" style={{ color: '#e5e7eb' }}>Total Sales (pre-tax)</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(totals.currSales)}</div>
                            <div className="legend-label">vs {fmtMoney(totals.prevSales)} last year</div>
                            <div style={{ marginTop: 6, fontSize: 12 }}>{salesDelta >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(salesDelta))}</div>
                          </div>
                        </div>
                      </div>

                      {/* YoY table (Totals) */}
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Month</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Curr)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Prev)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty Δ</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Curr)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Prev)</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.month}>
                              <td style={{ padding: '8px 6px' }}>{(() => {
                                const md = result?.monthlyDict?.[r.month];
                                if (md) return md.label;
                                const [y, m] = r.month.split('-').map((n) => Number(n));
                                const dt = new Date(Date.UTC(y, (m-1), 1));
                                return dt.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                              })()}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.curr.qty}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.prev.qty}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{(r.curr.qty - r.prev.qty).toFixed(0)}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.curr.sales)}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.prev.sales)}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.curr.sales - r.prev.sales)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td style={{ padding: '8px 6px', fontWeight: 600 }}>Totals</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{totals.currQty}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{totals.prevQty}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{qtyDelta.toFixed(0)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(totals.currSales)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(totals.prevSales)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(salesDelta)}</td>
                          </tr>
                        </tfoot>
                      </table>

                      {/* YoY By Product aggregated over period */}
                      {compareScope === 'product' && (() => {
                        const months = (result?.monthlyTotals || []).map(m => m.key);
                        const currMonths = months;
                        const prevMonths = months.map(k => {
                          const [y,m] = k.split('-').map(n=>Number(n));
                          return `${y-1}-${String(m).padStart(2,'0')}`;
                        });
                        const sumPer = (keys: string[]) => {
                          const acc = new Map<string, { title: string; qty: number; sales: number }>();
                          for (const k of keys) {
                            const mp = (result?.monthlyProduct || []).find(x => x.key === k);
                            if (!mp) continue;
                            for (const [pid, v] of Object.entries(mp.per)) {
                              const r = acc.get(pid) || { title: v.title, qty: 0, sales: 0 };
                              r.qty += v.qty; r.sales += v.sales; acc.set(pid, r);
                            }
                          }
                          return acc;
                        };
                        const currMap = sumPer(currMonths);
                        const prevMap = sumPer(prevMonths);
                        
                        // If no data is available, show a message
                        if (currMap.size === 0 && prevMap.size === 0) {
                          return (
                            <div style={{ marginTop: 16, padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center' }}>
                              <p>No product comparison data available for year-over-year analysis.</p>
                              <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Check that your data contains product information for both current and previous year periods.</p>
                            </div>
                          );
                        }
                        
                        const rows = Array.from(new Set([...currMap.keys(), ...prevMap.keys()]))
                          .map(pid => {
                            const c = currMap.get(pid) || { title: pid, qty: 0, sales: 0 };
                            const p = prevMap.get(pid) || { title: c.title, qty: 0, sales: 0 };
                            return { 
                              id: pid, 
                              title: c.title || p.title, 
                              currQty: c.qty, 
                              prevQty: p.qty, 
                              currSales: c.sales, 
                              prevSales: p.sales 
                            };
                          })
                          // Filter out rows with no meaningful data
                          .filter(row => row.currQty > 0 || row.prevQty > 0 || row.currSales > 0 || row.prevSales > 0);
                        
                        // If no rows after filtering, show a message
                        if (rows.length === 0) {
                          return (
                            <div style={{ marginTop: 16, padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', textAlign: 'center' }}>
                              <p>No product comparison data available for year-over-year analysis.</p>
                              <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>Check that your data contains product information for both current and previous year periods.</p>
                            </div>
                          );
                        }
                        
                        return (
                          <div style={{ marginTop: 16 }}>
                            <Suspense fallback={<div>Loading product comparison...</div>}>
                              <ProductComparisonTable 
                                data={rows} 
                                currency={result?.totals?.currency || 'USD'} 
                                periodLabel="Comparing each product's performance in your selected period vs the same period last year" 
                              />
                            </Suspense>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
