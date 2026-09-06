import type { MediaProvider } from './media-types.js';

export type MediaRateLimitDecision = {
  allowed: boolean;
  retryAfterMs: number;
};

/**
 * Bounds provider metadata requests made by the local control plane. This is
 * deliberately in-memory: it protects a running bot from accidental UI
 * loops/double submits without pretending to be a distributed quota system.
 */
export class MediaRequestLimiter {
  private readonly requests = new Map<MediaProvider, number[]>();

  constructor(
    private readonly maxRequests = 30,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error('maxRequests must be a positive integer.');
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('windowMs must be positive.');
  }

  consume(provider: MediaProvider): MediaRateLimitDecision {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const active = (this.requests.get(provider) ?? []).filter((timestamp) => timestamp > cutoff);
    if (active.length >= this.maxRequests) {
      const oldest = active[0] ?? now;
      return { allowed: false, retryAfterMs: Math.max(1, oldest + this.windowMs - now) };
    }
    active.push(now);
    this.requests.set(provider, active);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(): void {
    this.requests.clear();
  }
}

export const mediaRequestLimiter = new MediaRequestLimiter();
