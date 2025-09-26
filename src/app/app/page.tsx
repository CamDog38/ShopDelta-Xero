import styles from './page.module.css';
import { getXeroSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function getOrganisations() {
  try {
    const res = await fetch('/api/xero/organisations', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { organisations: Array<{ name?: string; legalName?: string; organisationID?: string }> };
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  const session = await getXeroSession();
  const connected = !!session;
  const data = connected ? await getOrganisations() : null;
  // Server-side diagnostics
  console.log('[overview] connected:', connected, 'tenantId:', session?.tenantId || '(none)', 'orgs:', data?.organisations?.length || 0);

  return (
    <div className={styles.container}>
      <h1>Overview</h1>
      {!connected ? (
        <div className={styles.card}>
          <p>Not connected to Xero yet.</p>
          <a href="/api/xero/connect" className={styles.primaryBtn}>Connect to Xero</a>
        </div>
      ) : (
        <div className={styles.card}>
          <p>Connected to Xero.</p>
          <p>Tenant: <strong>{session.tenantId}</strong></p>
          {data?.organisations?.length ? (
            <p>Organisation: <strong>{data.organisations[0].name || data.organisations[0].legalName || 'Unnamed Org'}</strong></p>
          ) : null}
        </div>
      )}
    </div>
  );
}
