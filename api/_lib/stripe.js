/**
 * Stripe integration utilities
 *
 * Handles:
 * - Checkout session creation
 * - Webhook signature verification
 * - Subscription status retrieval
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const PRICE_IDS = {
  artist: process.env.STRIPE_PRICE_ARTIST || '',
  engineer: process.env.STRIPE_PRICE_ENGINEER || '',
  studio: process.env.STRIPE_PRICE_STUDIO || '',
};

const TIER_NAMES = {
  artist: 'Artist - $19/mo',
  engineer: 'Engineer - $49/mo',
  studio: 'Studio - $99/mo',
};

/**
 * Create a checkout session for a subscription tier
 */
export async function createCheckoutSession(tier, { userEmail, userId, successUrl, cancelUrl }) {
  const priceId = PRICE_IDS[tier];

  if (!priceId) {
    throw new Error(`Invalid tier: ${tier}. Price ID not configured.`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer_email: userEmail,
    client_reference_id: userId,
    metadata: {
      tier,
      userId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    return event;
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }
}

/**
 * Handle subscription creation
 */
export async function handleSubscriptionCreated(subscription) {
  const { customer, id: subscriptionId, items, status } = subscription;
  const tier = getTierFromSubscription(subscription);

  return {
    customerId: customer,
    subscriptionId,
    tier,
    status,
    renewalDate: new Date(subscription.current_period_end * 1000),
    eventType: 'subscription.created',
  };
}

/**
 * Handle subscription update (e.g., payment received)
 */
export async function handleSubscriptionUpdated(subscription) {
  const { customer, id: subscriptionId, status } = subscription;
  const tier = getTierFromSubscription(subscription);

  return {
    customerId: customer,
    subscriptionId,
    tier,
    status,
    renewalDate: new Date(subscription.current_period_end * 1000),
    eventType: 'subscription.updated',
  };
}

/**
 * Handle charge succeeded
 */
export async function handleChargeSucceeded(charge) {
  const { customer, amount, currency, payment_intent } = charge;

  return {
    customerId: customer,
    paymentIntentId: payment_intent,
    amount,
    currency,
    status: 'succeeded',
    eventType: 'charge.succeeded',
  };
}

/**
 * Get subscription status for a customer
 */
export async function getSubscriptionStatus(customerId) {
  if (!customerId) return null;

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
    });

    if (subscriptions.data.length === 0) return null;

    const subscription = subscriptions.data[0];
    const tier = getTierFromSubscription(subscription);

    return {
      subscriptionId: subscription.id,
      tier,
      status: subscription.status,
      renewalDate: new Date(subscription.current_period_end * 1000),
      isCanceled: subscription.canceled_at !== null,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    };
  } catch (err) {
    console.error('Failed to get subscription status:', err);
    return null;
  }
}

/**
 * Infer tier from subscription items
 */
function getTierFromSubscription(subscription) {
  if (!subscription.items || !subscription.items.data || subscription.items.data.length === 0) {
    return 'free';
  }

  const priceId = subscription.items.data[0].price.id;

  if (priceId === PRICE_IDS.artist) return 'artist';
  if (priceId === PRICE_IDS.engineer) return 'engineer';
  if (priceId === PRICE_IDS.studio) return 'studio';

  return 'free';
}

/**
 * Get Stripe configuration status
 */
export function getStripeConfig() {
  const hasSecret = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  const configured = hasSecret && hasWebhookSecret;

  return {
    configured,
    hint: !configured ? 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars' : null,
  };
}
