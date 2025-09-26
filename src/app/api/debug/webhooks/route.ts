import { NextResponse } from 'next/server';
import { getRecentWebhookEvents } from '@/lib/webhookStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = getRecentWebhookEvents(50);
  return NextResponse.json({ events });
}
