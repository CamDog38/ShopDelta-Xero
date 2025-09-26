import Link from 'next/link';
import styles from './page.module.css';

async function getOrganisations() {
  try {
    const res = await fetch(`/api/xero/organisations`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as { organisations: Array<{ name?: string; legalName?: string; organisationID?: string }> };
  } catch {
    return null;
  }
}

export default async function XeroPage() {
  const data = await getOrganisations();
  const connected = !!data && Array.isArray(data.organisations) && data.organisations.length > 0;

  return (
    <div className={styles.container}>
      <h1>ShopDelta – Xero Integration</h1>
      {!connected && (
        <div>
          <p>Connect your Xero account to begin.</p>
          <a href="/api/xero/connect" className={styles.primaryBtn}>Connect to Xero</a>
        </div>
      )}

      {connected && (
        <div>
          <h2>Organisations</h2>
          <ul>
            {data!.organisations.map((org, idx) => (
              <li key={org.organisationID || idx}>
                <strong>{org.name || org.legalName || 'Unnamed Org'}</strong>
              </li>
            ))}
          </ul>
          <div className={styles.actionsRow}>
            <a href="/api/xero/disconnect" className={styles.secondaryBtn}>Disconnect</a>
          </div>
          <p className={styles.helpText}>
            You are connected. You can now extend this page to list contacts, invoices, etc.
          </p>
        </div>
      )}

      <p className={styles.footerLink}>
        <Link href="/">Back to Home</Link>
      </p>
    </div>
  );
}
