'use client';

import { useEffect, useMemo, useState } from 'react';

type Endpoint = 'items' | 'invoices' | 'tenants';

export default function XeroDebugPage() {
  const [endpoint, setEndpoint] = useState<Endpoint>('items');
  const [params, setParams] = useState<Record<string, string>>({ all: '1' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);

  const url = useMemo(() => {
    let base = '/api/debug/xero-items';
    if (endpoint === 'invoices') base = '/api/debug/xero-invoices';
    if (endpoint === 'tenants') base = '/api/debug/xero-tenants';
    const qs = new URLSearchParams(params as any).toString();
    return qs ? `${base}?${qs}` : base;
  }, [endpoint, params]);

  useEffect(() => {
    // Defaults per endpoint
    if (endpoint === 'items') setParams({ all: '1' });
    if (endpoint === 'invoices') setParams({ limit: '50' });
    if (endpoint === 'tenants') setParams({});
  }, [endpoint]);

  const fetchNow = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const txt = await res.text();
      const data = (() => { try { return JSON.parse(txt); } catch { return { raw: txt }; } })();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setPayload(data);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
      setPayload(null);
    } finally { setLoading(false); }
  };

  const pretty = useMemo(() => {
    try { return JSON.stringify(payload, null, 2); } catch { return String(payload ?? ''); }
  }, [payload]);

  const copyToClipboard = async () => {
    try { await navigator.clipboard.writeText(pretty); } catch {}
  };

  const downloadJSON = () => {
    const blob = new Blob([pretty], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${endpoint}-debug.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Xero Debug Viewer</h1>
      <p style={{ color: '#4b5563', marginBottom: 16 }}>Select an endpoint and inspect the JSON payload your account can access.</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, color: '#374151' }}>Endpoint</label>
          <select value={endpoint} onChange={(e) => setEndpoint(e.target.value as Endpoint)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}>
            <option value="items">Items</option>
            <option value="invoices">Invoices</option>
            <option value="tenants">Tenants</option>
          </select>
        </div>

        {endpoint === 'invoices' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#374151' }}>Limit</label>
            <input type="number" min={1} max={500} value={params.limit || '50'} onChange={(e) => setParams((p) => ({ ...p, limit: e.target.value }))} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 120 }} />
          </div>
        )}

        <button onClick={fetchNow} style={{ padding: '10px 14px', background: '#0b5bd3', color: '#fff', border: 0, borderRadius: 8, fontWeight: 600 }}>{loading ? 'Loading…' : 'Fetch'}</button>
        <button onClick={copyToClipboard} style={{ padding: '10px 14px', background: '#f3f4f6', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 600 }}>Copy JSON</button>
        <button onClick={downloadJSON} style={{ padding: '10px 14px', background: '#f3f4f6', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 600 }}>Download</button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 12, maxHeight: '70vh', overflow: 'auto' }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>{pretty || 'No data yet. Click Fetch.'}</pre>
      </div>
    </div>
  );
}
