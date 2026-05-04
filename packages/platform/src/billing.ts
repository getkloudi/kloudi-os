import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const apiKey = process.env['STRIPE_SECRET_KEY'];
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    _stripe = new Stripe(apiKey, { apiVersion: '2025-02-24.acacia' });
  }
  return _stripe;
}

export async function recordUsage(
  organizationId: string,
  product: 'mcp-gateway' | 'kloudi-machine',
  eventType: string,
  units = 1,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { Database } = await import('@kloudi/infrastructure/database');
  const db = await Database.getInstance().getClient();
  await (db as any).usageEvent.create({
    data: { organizationId, product, eventType, units, metadata },
  });
}
