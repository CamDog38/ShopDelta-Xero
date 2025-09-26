import { NextResponse } from 'next/server';
import { clearXeroSessionCookie } from '@/lib/session';

export async function GET() {
  const res = NextResponse.redirect('/xero');
  clearXeroSessionCookie(res);
  return res;
}
