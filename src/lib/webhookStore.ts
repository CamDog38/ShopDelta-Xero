export type XeroWebhookEvent = {
  receivedAt: string; // ISO timestamp
  tenantId: string;
  eventCategory: string;
  eventType: string;
  resourceId: string;
  organisationName?: string;
};

const MAX_EVENTS = 100;
const buffer: XeroWebhookEvent[] = [];

export function addWebhookEvents(events: XeroWebhookEvent[]) {
  for (const e of events) {
    buffer.push(e);
    if (buffer.length > MAX_EVENTS) {
      buffer.shift();
    }
  }
}

export function getRecentWebhookEvents(limit = 25): XeroWebhookEvent[] {
  return buffer.slice(-limit).reverse();
}
