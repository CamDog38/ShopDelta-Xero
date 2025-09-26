"use client";

import React from 'react';

type Result =
  | { ok: true; tenantId: string; count: number; sample: any[]; durationMs: number }
  | { ok: false; error?: string; response?: unknown; body?: unknown; reason?: string };

export default function DebugTerminal() {
  const [open, setOpen] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const [ts, setTs] = React.useState<string>("");
  const [auto, setAuto] = React.useState(false);

  const run = React.useCallback(async () => {
    setLoading(true);
    setTs(new Date().toISOString());
    try {
      const res = await fetch("/api/debug/xero-items", { cache: "no-store" });
      const json = (await res.json()) as Result;
      setResult(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    run();
  }, [run]);

  React.useEffect(() => {
    if (!auto) return;
    const id = setInterval(run, 10000);
    return () => clearInterval(id);
  }, [auto, run]);

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <div style={{ margin: '0 12px 12px', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', maxHeight: '40vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111827', color: '#e5e7eb', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong>Live Terminal</strong>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Xero Items Test · {ts || '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh
            </label>
            <button onClick={run} disabled={loading} style={{ background: '#10b981', color: '#042f2e', padding: '6px 10px', borderRadius: 6 }}>
              {loading ? 'Running…' : 'Run Test'}
            </button>
            <button onClick={() => setOpen((o) => !o)} style={{ background: '#374151', color: '#e5e7eb', padding: '6px 10px', borderRadius: 6 }}>
              {open ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {open && (
          <pre style={{ margin: 0, maxHeight: '35vh', overflow: 'auto', background: '#0b1220', color: '#cbd5e1', fontSize: 12, padding: 12 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
