import { describe, it, expect } from 'vitest';
import { effectiveTier } from './stripeCheckout';
import type { User } from '../shared/schema';

describe('effectiveTier', () => {
  it('returns the base tier when there is no trial data', () => {
    const user = {
      tier: 'free',
    } as User;
    expect(effectiveTier(user)).toBe('free');
  });

  it('returns the base tier when the trial has expired', () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);

    const user = {
      tier: 'free',
      trialTier: 'dealer',
      trialEndsAt: pastDate.toISOString(),
    } as User;

    expect(effectiveTier(user)).toBe('free');
  });

  it('returns the trial tier when the trial is currently active', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);

    const user = {
      tier: 'free',
      trialTier: 'dealer',
      trialEndsAt: futureDate.toISOString(),
    } as User;

    expect(effectiveTier(user)).toBe('dealer');
  });

  it('returns the base tier when trialTier is null', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);

    const user = {
      tier: 'pro',
      trialTier: null,
      trialEndsAt: futureDate.toISOString(),
    } as User;

    expect(effectiveTier(user)).toBe('pro');
  });

  it('returns the base tier when trialEndsAt is null', () => {
    const user = {
      tier: 'pro',
      trialTier: 'dealer',
      trialEndsAt: null,
    } as User;

    expect(effectiveTier(user)).toBe('pro');
  });
});
