import Link from 'next/link';
import styles from './layout.module.css';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getXeroSession } from '@/lib/session';

async function getOrganisations() {
  try {
    const res = await fetch('/api/xero/organisations', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { organisations: Array<{ name?: string; legalName?: string; organisationID?: string }> };
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getXeroSession();
  const tenantId = session?.tenantId || null;
  const connected = !!session;
  const data = connected ? await getOrganisations() : null;
  const orgName = data?.organisations?.[0]?.name || data?.organisations?.[0]?.legalName;
  // Server-side diagnostics
  console.log('[layout] connected:', connected, 'tenantId:', tenantId || '(none)', 'orgs:', data?.organisations?.length || 0);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.brand}>ShopDelta</h1>
        <div className={styles.status}>
          {connected ? (
            <>
              <span className={styles.pill}>Connected</span>
              {tenantId ? <span className={styles.pill}>Tenant: {tenantId}</span> : null}
              {orgName ? <span className={styles.pill}>Org: {orgName}</span> : null}
              <a href="/api/xero/disconnect" className={styles.linkLight}>Disconnect</a>
            </>
          ) : (
            <>
              <span className={styles.pill}>Not connected</span>
              <a href="/api/xero/connect" className={styles.linkLight}>Connect</a>
            </>
          )}
        </div>
      </header>
      <aside className={styles.sidebar}>
        <nav className={styles.nav}>
          <ul>
            <li><Link href="/app">Overview</Link></li>
            <li><Link href="/app/analytics">Analytics</Link></li>
          </ul>
        </nav>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
