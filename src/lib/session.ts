import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

const COOKIE_NAME = 'xero_auth'; // legacy id cookie (dev file store)
const COOKIE_SESSION = 'xero_auth_session'; // cookie session payload (vercel)
const TENANT_COOKIE = 'xero_tenant';

function isCookieMode() {
  // Use cookie store on Vercel/serverless (no writable FS)
  return process.env.VERCEL === '1' || process.env.USE_COOKIE_SESSION === 'true';
}

export type XeroSession = {
  tokenSet: Record<string, unknown>;
  tenantId: string;
};

// File-backed store for dev to survive HMR/process changes. Replace with DB/redis in production.
const storeDir = path.join(process.cwd(), '.next', 'xero-sessions');
function ensureStoreDir() {
  try {
    fs.mkdirSync(storeDir, { recursive: true });
  } catch {}
}

function sessionPath(id: string) {
  return path.join(storeDir, `${id}.json`);
}

function writeSession(id: string, sess: XeroSession) {
  if (isCookieMode()) {
    // no-op in cookie mode; handled by createXeroSession/updateCurrentSessionTokenSet
    return;
  }
  ensureStoreDir();
  fs.writeFileSync(sessionPath(id), JSON.stringify(sess), 'utf8');
}

function readSession(id: string): XeroSession | null {
  if (isCookieMode()) {
    // not used in cookie mode
    return null;
  }
  try {
    const file = sessionPath(id);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as XeroSession;
  } catch (e) {
    console.warn('[session] Failed to read session file:', e);
    return null;
  }
}

function deleteSession(id: string) {
  try {
    const file = sessionPath(id);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {
    console.warn('[session] Failed to delete session file:', e);
  }
}

function newSessionId() {
  return randomBytes(16).toString('hex');
}

// Read-only helper for server components and route handlers
export async function getXeroSession(): Promise<XeroSession | null> {
  const store = await cookies();
  if (isCookieMode()) {
    const raw = store.get(COOKIE_SESSION)?.value;
    if (!raw) return null;
    try {
      // value is URI-encoded JSON
      const decoded = decodeURIComponent(raw);
      const sess = JSON.parse(decoded) as XeroSession;
      return sess;
    } catch (e) {
      console.warn('[session] Failed to parse cookie session:', e);
      return null;
    }
  }
  const sessionId = store.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const sess = readSession(sessionId);
  return sess ?? null;
}

export function createXeroSession(res: NextResponse, session: XeroSession) {
  // Always set tenant cookie for UI hints
  res.cookies.set({
    name: TENANT_COOKIE,
    value: session.tenantId,
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  if (isCookieMode()) {
    // Store whole session JSON in an HTTP-only cookie (<=4KB)
    const value = encodeURIComponent(JSON.stringify(session));
    res.cookies.set({
      name: COOKIE_SESSION,
      value,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return 'cookie-mode';
  }

  const id = newSessionId();
  writeSession(id, session);
  // legacy id cookie for dev file-backed store
  res.cookies.set({
    name: COOKIE_NAME,
    value: id,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return id;
}

export async function clearXeroSessionCookie(res: NextResponse) {
  const store = await cookies();
  if (isCookieMode()) {
    res.cookies.delete(COOKIE_SESSION);
  } else {
    const sessionId = store.get(COOKIE_NAME)?.value;
    if (sessionId) deleteSession(sessionId);
    res.cookies.delete(COOKIE_NAME);
  }
  res.cookies.delete(TENANT_COOKIE);
}

export async function getTenantId(): Promise<string | null> {
  const store = await cookies();
  if (isCookieMode()) {
    const raw = store.get(COOKIE_SESSION)?.value;
    if (!raw) return null;
    const sess = JSON.parse(decodeURIComponent(raw)) as XeroSession;
    return sess.tenantId;
  } else {
    const sessionId = store.get(COOKIE_NAME)?.value;
    if (!sessionId) return null;
    const sess = readSession(sessionId);
    return sess?.tenantId || null;
  }
}

// DEV ONLY: find a session in the in-memory store by tenantId
export function getSessionForTenant(tenantId: string): XeroSession | null {
  // Scan the store directory to find a matching tenant. For dev diagnostics only.
  try {
    ensureStoreDir();
    const files = fs.readdirSync(storeDir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const raw = fs.readFileSync(path.join(storeDir, f), 'utf8');
      const sess = JSON.parse(raw) as XeroSession;
      if (sess.tenantId === tenantId) return sess;
    }
  } catch (e) {
    console.warn('[session] Failed scanning sessions for tenant:', e);
  }
  return null;
}

// Persist an updated tokenSet into the current session file (when tokens are refreshed)
export async function updateCurrentSessionTokenSet(tokenSet: Record<string, unknown>): Promise<void> {
  try {
    const store = await cookies();
    if (isCookieMode()) {
      const raw = store.get(COOKIE_SESSION)?.value;
      if (!raw) return;
      const sess = JSON.parse(decodeURIComponent(raw)) as XeroSession;
      const updated: XeroSession = { ...sess, tokenSet };
      // We cannot use NextResponse here, so rely on callers that have a response to set cookie.
      // For server functions without a response, we can't mutate cookies; skip persist.
      // Prefer updating when we can during the OAuth callback flow.
      return;
    } else {
      const sessionId = store.get(COOKIE_NAME)?.value;
      if (!sessionId) return;
      const sess = readSession(sessionId);
      if (!sess) return;
      const updated: XeroSession = { ...sess, tokenSet };
      writeSession(sessionId, updated);
    }
  } catch (e) {
    console.warn('[session] Failed to update tokenSet for current session:', e);
  }
}
