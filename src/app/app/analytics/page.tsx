import styles from '../page.module.css';
import '@/app/app/analytics/analytics.css';
import { getXeroSession } from '@/lib/session';
import { getXeroAnalytics, type XeroAnalyticsFilters } from './xero-analytics.server';
import DebugTerminal from './DebugTerminal';

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
                {result?.credits ? (
                  <span> · Credits: {result.credits.count} docs, Qty {result.credits.qty}, Sales {fmtMoney(result.credits.sales)}</span>
                ) : null}
              </div>

              {/* Aggregate chart */}
              {chartScope === 'aggregate' && (
                series.length === 0 ? <p>No data in range.</p> : (
                  <div className="analytics-chart-scroll">
                    <svg width={svgW} height={svgH} role="img" aria-label="Chart">
                      <g transform={`translate(${svgPadding.left},${svgPadding.top})`}>
                        <line x1={0} y1={0} x2={0} y2={innerH} stroke="#d0d4d9" />
                        {Array.from({ length: 5 }).map((_, i) => {
                          const v = (maxMetric / 4) * i;
                          const y = yScale(v);
                          return (
                            <g key={i}>
                              <line x1={-4} y1={y} x2={0} y2={y} stroke="#aeb4bb" />
                              <text x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7177">{Math.round(v)}</text>
                              <line x1={0} y1={y} x2={innerW} y2={y} stroke="#f1f3f5" />
                            </g>
                          );
                        })}
                        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#d0d4d9" />
                        {series.map((s, i) => (
                          <text key={s.key} x={xBand(i)} y={innerH + 16} textAnchor="middle" fontSize={10} fill="#6b7177">{s.label}</text>
                        ))}
                        {series.map((s, i) => {
                          const barW = Math.max(12, innerW / Math.max(1, series.length) - 24);
                          const x = xBand(i) - barW / 2;
                          const value = metric === 'sales' ? s.sales : s.quantity;
                          const y = yScale(value);
                          const h = innerH - y;
                          return <rect key={s.key} x={x} y={y} width={barW} height={h} fill="#4facfe" />
                        })}
                      </g>
                    </svg>
                  </div>
                )
              )}

              {/* By product chart: draw up to 5 product series as grouped bars */}
              {chartScope === 'product' && (
                ((result?.seriesProduct?.length ?? 0) === 0) ? <p>No data in range.</p> : (
                  <div className="analytics-chart-scroll">
                    <svg width={svgW} height={svgH} role="img" aria-label="Chart">
                      <g transform={`translate(${svgPadding.left},${svgPadding.top})`}>
                        <line x1={0} y1={0} x2={0} y2={innerH} stroke="#d0d4d9" />
                        {Array.from({ length: 5 }).map((_, i) => {
                          const v = (maxMetric / 4) * i;
                          const y = yScale(v);
                          return (
                            <g key={i}>
                              <line x1={-4} y1={y} x2={0} y2={y} stroke="#aeb4bb" />
                              <text x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7177">{Math.round(v)}</text>
                              <line x1={0} y1={y} x2={innerW} y2={y} stroke="#f1f3f5" />
                            </g>
                          );
                        })}
                        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#d0d4d9" />
                        {(result?.seriesProduct ?? []).map((s, i) => (
                          <text key={s.key} x={xBand(i)} y={innerH + 16} textAnchor="middle" fontSize={10} fill="#6b7177">{s.label}</text>
                        ))}
                        {(result?.seriesProduct ?? []).map((s, i) => {
                          const keys = Object.keys(s.per).slice(0, 5); // top 5 products for chart readability
                          const bandW = Math.max(24, innerW / Math.max(1, (result?.seriesProduct ?? []).length) - 16);
                          const barW = Math.max(6, bandW / Math.max(1, keys.length));
                          return keys.map((pid, j) => {
                            const value = metric === 'sales' ? s.per[pid].sales : s.per[pid].qty;
                            const x = xBand(i) - bandW / 2 + j * barW;
                            const y = yScale(value);
                            const h = innerH - y;
                            const color = ['#4facfe', '#00c6ff', '#9c6ade', '#47c1bf', '#f49342'][j % 5];
                            return <rect key={`${s.key}-${pid}`} x={x} y={y} width={barW - 2} height={h} fill={color} />
                          })
                        })}
                      </g>
                    </svg>
                    <div className="analytics-legend">
                      <div className="analytics-legend-chips">
                        {((result?.productLegend) || []).slice(0,5).map((p, idx) => (
                          <div key={p.id} className="analytics-legend-chip">
                            <span className="analytics-legend-swatch" style={{ background: ['#4facfe', '#00c6ff', '#9c6ade', '#47c1bf', '#f49342'][idx % 5] }} />
                            <span className="text-12">{p.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
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
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Time Period</th>
                      {(result?.productLegend || []).map((p) => (
                        <th key={p.id} style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{p.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result?.seriesProduct || []).map((row) => (
                      <tr key={row.key}>
                        <td style={{ padding: '8px 6px' }}>{row.label}</td>
                        {((result?.productLegend) || []).map((p) => (
                          <td key={p.id} style={{ padding: '8px 6px', textAlign: 'right' }}>{metric === 'sales' ? (row.per[p.id]?.sales ?? 0).toFixed(2) : (row.per[p.id]?.qty ?? 0)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Time Period</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{metric === 'sales' ? 'Sales' : 'Quantity'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result?.series || []).map((s) => (
                      <tr key={s.key}>
                        <td style={{ padding: '8px 6px' }}>{s.label}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{metric === 'sales' ? s.sales.toFixed(2) : s.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.top10ByQty || []).map((p, idx) => (
                    <tr key={p.id}>
                      <td style={{ padding: '8px 6px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 6px' }}>{p.title}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{p.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 className={styles.sectionTitle}>Top 10 products by sales</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.top10BySales || []).map((p, idx) => (
                    <tr key={p.id}>
                      <td style={{ padding: '8px 6px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 6px' }}>{p.title}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(p.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 className={styles.sectionTitle}>Sales by product</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.salesByProduct || []).map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: '8px 6px' }}>{row.title}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{row.qty}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(row.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      if (!a || !b) return null;
                      const rowsMap = new Map<string, { title: string; aQty: number; bQty: number; aSales: number; bSales: number }>();
                      for (const [pid, v] of Object.entries(a.per)) {
                        rowsMap.set(pid, { title: v.title, aQty: v.qty, bQty: 0, aSales: v.sales, bSales: 0 });
                      }
                      for (const [pid, v] of Object.entries(b.per)) {
                        const r = rowsMap.get(pid);
                        if (r) { r.bQty = v.qty; r.bSales = v.sales; }
                        else { rowsMap.set(pid, { title: v.title, aQty: 0, bQty: v.qty, aSales: 0, bSales: v.sales }); }
                      }
                      const rows = Array.from(rowsMap.entries()).map(([pid, r]) => ({ id: pid, ...r, dQty: r.bQty - r.aQty, dSales: r.bSales - r.aSales }));
                      const topSales = rows.sort((x,y) => Math.abs(y.dSales) - Math.abs(x.dSales)).slice(0,10);
                      const topQty = [...rows].sort((x,y) => Math.abs(y.dQty) - Math.abs(x.dQty)).slice(0,10);
                      const aLabel = result?.monthlyDict?.[aKey]?.label || aKey;
                      const bLabel = result?.monthlyDict?.[bKey]?.label || bKey;
                      return (
                        <div style={{ marginTop: 16 }}>
                          <h4 className={styles.sectionTitle}>Top 10 products by Sales Δ ({aLabel} → {bLabel})</h4>
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{aLabel} Sales</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{bLabel} Sales</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Δ Sales</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topSales.map(r => (
                                <tr key={r.id}>
                                  <td style={{ padding: '8px 6px' }}>{r.title}</td>
                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.aSales)}</td>
                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.bSales)}</td>
                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.dSales)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          <h4 className={styles.sectionTitle}>Top 10 products by Qty Δ ({aLabel} → {bLabel})</h4>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{aLabel} Qty</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{bLabel} Qty</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Δ Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topQty.map(r => (
                                <tr key={r.id}>
                                  <td style={{ padding: '8px 6px' }}>{r.title}</td>
                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.aQty}</td>
                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.bQty}</td>
                                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.dQty.toFixed(0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
                        const rowsP = Array.from(new Set([...currMap.keys(), ...prevMap.keys()])).map(pid => {
                          const c = currMap.get(pid) || { title: pid, qty: 0, sales: 0 };
                          const p = prevMap.get(pid) || { title: c.title, qty: 0, sales: 0 };
                          return { id: pid, title: c.title || p.title, cQty: c.qty, pQty: p.qty, cSales: c.sales, pSales: p.sales, dQty: c.qty - p.qty, dSales: c.sales - p.sales };
                        });
                        const topSales = rowsP.sort((a,b) => Math.abs(b.dSales) - Math.abs(a.dSales)).slice(0,10);
                        const topQty = [...rowsP].sort((a,b) => Math.abs(b.dQty) - Math.abs(a.dQty)).slice(0,10);
                        return (
                          <div style={{ marginTop: 16 }}>
                            <h4 className={styles.sectionTitle}>Top 10 products by Sales Δ (YoY)</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                                  <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Curr)</th>
                                  <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Sales (Prev)</th>
                                  <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Δ Sales</th>
                                </tr>
                              </thead>
                              <tbody>
                                {topSales.map(r => (
                                  <tr key={r.id}>
                                    <td style={{ padding: '8px 6px' }}>{r.title}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.cSales)}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.pSales)}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(r.dSales)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <h4 className={styles.sectionTitle}>Top 10 products by Qty Δ (YoY)</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                                  <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Curr)</th>
                                  <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Qty (Prev)</th>
                                  <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>Δ Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {topQty.map(r => (
                                  <tr key={r.id}>
                                    <td style={{ padding: '8px 6px' }}>{r.title}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.cQty}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.pQty}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{r.dQty.toFixed(0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
      <DebugTerminal />
    </div>
  );
}
