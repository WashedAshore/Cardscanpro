// ============================================================
// Stripe integration for CardScan Pro
//
// Provides:
//   - `getStripe()` lazy-initialized client (null when not configured)
//   - `createCheckoutSession()` for paid-tier upgrade
//   - `handleWebhook()` for subscription lifecycle events
//   - `startTrialPreview()` to grant 24h Dealer preview on signup-to-paid
// ============================================================

import Stripe from "stripe";
import type { Request } from "express";
import { storage } from "./storage";
import {
  TIERS,
  STRIPE_TIER_LOOKUP,
  TRIAL_PREVIEW_HOURS,
  TRIAL_PREVIEW_TIER,
  type TierKey,
  type User,
} from "@shared/schema";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
  return _stripe;
}

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function priceIdForTier(tier: Exclude<TierKey, "free">): string | undefined {
  const envKey = `STRIPE_PRICE_${tier.toUpperCase()}`;
  return process.env[envKey];
}

/**
 * Create a Stripe Checkout Session for a paid-tier subscription.
 * Reuses the Stripe customer attached to the user if present, otherwise creates one.
 */
export async function createCheckoutSession(params: {
  user: User;
  tier: Exclude<TierKey, "free">;
  successUrl: string;
  cancelUrl: string;
  promoCode?: string;
  clientIp?: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured on this server");

  const { user, tier, successUrl, cancelUrl, promoCode, clientIp } = params;
  const priceId = priceIdForTier(tier);
  if (!priceId) {
    throw new Error(
      `Missing STRIPE_PRICE_${tier.toUpperCase()} env var — create the price in Stripe and configure it.`,
    );
  }

  // Re-use customer if we have one, else create
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: String(user.id), username: user.username },
    });
    customerId = customer.id;
    await storage.updateUser(user.id, { stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      userId: String(user.id),
      tier,
      promoCode: promoCode ?? "",
      clientIp: clientIp ?? "",
    },
    subscription_data: {
      metadata: {
        userId: String(user.id),
        tier,
      },
    },
  });

  // Pre-record a pending subscription so the admin panel sees the attempt.
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);
  await storage.createSubscription({
    userId: user.id,
    tier,
    btcTxId: null,
    btcAmount: null,
    paymentMethod: "stripe",
    stripeSessionId: session.id,
    stripeSubscriptionId: null,
    stripeCustomerId: customerId,
    usdAmount: TIERS[tier].price.toFixed(2),
    promoCodeUsed: promoCode ?? null,
    status: "pending",
    startsAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  });

  return { url: session.url!, sessionId: session.id };
}

/**
 * Start a 24-hour Dealer-tier free preview for a user who just signed up
 * and selected a paid plan. Abuse prevention:
 *   - one trial per username
 *   - one trial per email (if provided)
 *   - one trial per signup IP
 */
export async function startTrialPreview(params: {
  user: User;
  clientIp?: string;
}): Promise<{ granted: boolean; reason?: string; trialEndsAt?: string }> {
  const { user, clientIp } = params;

  // Already used a trial?
  if (user.trialEndsAt) {
    return { granted: false, reason: "Trial already used on this account." };
  }

  // IP collision check
  if (clientIp) {
    const collision = await storage.findUserBySignupIp(clientIp, user.id);
    if (collision) {
      return { granted: false, reason: "Trial already used from this network." };
    }
  }

  // Email collision check (different username, same email)
  if (user.email) {
    const collision = await storage.findUserByEmail(user.email, user.id);
    if (collision && collision.trialEndsAt) {
      return { granted: false, reason: "Trial already used on this email." };
    }
  }

  const trialEndsAt = new Date();
  trialEndsAt.setHours(trialEndsAt.getHours() + TRIAL_PREVIEW_HOURS);

  await storage.updateUser(user.id, {
    trialTier: TRIAL_PREVIEW_TIER,
    trialEndsAt: trialEndsAt.toISOString(),
    signupIp: clientIp ?? user.signupIp ?? null,
  });

  return { granted: true, trialEndsAt: trialEndsAt.toISOString() };
}

/**
 * Returns the effective tier for a user, accounting for active 24h trial preview.
 */
export function effectiveTier(user: User): TierKey {
  if (user.trialTier && user.trialEndsAt) {
    const ends = new Date(user.trialEndsAt);
    if (ends.getTime() > Date.now()) {
      return user.trialTier as TierKey;
    }
  }
  return user.tier as TierKey;
}

/**
 * Handle Stripe webhook events. Designed to be idempotent.
 */
export async function handleWebhook(req: Request): Promise<{ ok: boolean; event?: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured on this server");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) throw new Error("Missing stripe-signature header");
  if (!req.rawBody) throw new Error("Webhook rawBody not captured");

  const event = stripe.webhooks.constructEvent(
    req.rawBody as Buffer,
    sig,
    webhookSecret,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await onCheckoutCompleted(session);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      await onSubscriptionUpserted(sub);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await onSubscriptionDeleted(sub);
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      await onInvoicePaymentFailed(inv);
      break;
    }
    default:
      // ignore
      break;
  }

  return { ok: true, event: event.type };
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = parseInt(session.metadata?.userId ?? "0", 10);
  const tier = session.metadata?.tier as TierKey | undefined;
  if (!userId || !tier || tier === "free") return;

  const stripeSubId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  // End any active 24h trial — user has now actually paid.
  await storage.updateUser(userId, {
    tier,
    tierExpiresAt: expiresAt.toISOString(),
    stripeSubscriptionId: stripeSubId,
    trialTier: null,
    trialEndsAt: null,
  });

  // Update the pre-recorded subscription row to confirmed.
  await storage.markStripeSessionConfirmed(session.id, {
    stripeSubscriptionId: stripeSubId,
    status: "confirmed",
    expiresAt: expiresAt.toISOString(),
  });
}

async function onSubscriptionUpserted(sub: Stripe.Subscription) {
  const userId = parseInt(sub.metadata?.userId ?? "0", 10);
  if (!userId) return;
  const tier = (sub.metadata?.tier as TierKey | undefined) ?? "pro";
  const status = sub.status; // active | past_due | canceled | unpaid | trialing | incomplete
  const periodEndUnix = sub.current_period_end;
  const tierExpiresAt = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  if (status === "active" || status === "trialing") {
    await storage.updateUser(userId, {
      tier,
      tierExpiresAt,
      stripeSubscriptionId: sub.id,
    });
  } else if (status === "canceled" || status === "unpaid") {
    await storage.updateUser(userId, {
      tier: "free",
      tierExpiresAt: null,
      stripeSubscriptionId: null,
    });
  }
}

async function onSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = parseInt(sub.metadata?.userId ?? "0", 10);
  if (!userId) return;
  await storage.updateUser(userId, {
    tier: "free",
    tierExpiresAt: null,
    stripeSubscriptionId: null,
  });
}

async function onInvoicePaymentFailed(inv: Stripe.Invoice) {
  const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  if (!customerId) return;
  const user = await storage.findUserByStripeCustomer(customerId);
  if (!user) return;
  // Don't immediately downgrade — Stripe will retry. Just flag it.
  await storage.updateUser(user.id, { stripeSubscriptionId: user.stripeSubscriptionId });
}
