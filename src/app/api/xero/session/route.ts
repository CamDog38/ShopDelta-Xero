import { NextResponse } from 'next/server';
import { getXeroSession } from '@/lib/session';

export async function GET() {
  const sess = await getXeroSession();
  return NextResponse.json({ hasSession: !!sess, session: sess ? { tenantId: sess.tenantId } : null });
}
