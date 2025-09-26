import styles from '../page.module.css';
import '@/app/app/analytics/analytics.css';
import { getXeroSession } from '@/lib/session';
import { getXeroAnalytics, type XeroAnalyticsFilters } from './xero-analytics.server';

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
              <p>Total sales: {fmtMoney(result?.totals.sales)}</p>

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
              <h3 className={styles.sectionTitle}>Month-over-Month</h3>
              {((result?.mom || []).length === 0) ? <p>No month-over-month data available.</p> : (
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
                        <td style={{ padding: '8px 6px' }}>{r.period}</td>
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
              )}

              <h3 className={styles.sectionTitle}>Year-over-Year</h3>
              {((result?.yoy || []).length === 0) ? <p>No year-over-year data available.</p> : (
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
                    {(result?.yoy ?? []).map((r) => (
                      <tr key={r.month}>
                        <td style={{ padding: '8px 6px' }}>{r.month}</td>
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
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
