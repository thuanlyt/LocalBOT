import type { AutoModMatch } from './automod.js';

export const AUTO_MOD_TIMEOUT_MS = 60_000;
export const AUTO_MOD_ACTION_WINDOW_MS = 60_000;
export const MAX_AUTO_MOD_ACTIONS_PER_GUILD = 20;

export type AutoModEnforcementAction = 'delete' | 'timeout';
export type AutoModDecisionReason = 'alert-only' | 'unsupported' | 'none';

export type AutoModEnforcementDecision = {
  action: AutoModEnforcementAction | null;
  matchIndex: number | null;
  reason: AutoModDecisionReason;
};

const ENFORCEABLE_RULES = new Set(['spam', 'flood', 'link', 'scam']);

/**
 * Selects one bounded action for one message. The detector can return several
 * matches, but Discord must never receive more than one mutation for that
 * message. Timeout is intentionally stronger than delete.
 */
export function chooseAutoModEnforcement(matches: readonly AutoModMatch[]): AutoModEnforcementDecision {
  const timeoutIndex = matches.findIndex((match) => ENFORCEABLE_RULES.has(match.rule) && match.proposedAction === 'timeout');
  if (timeoutIndex >= 0) return { action: 'timeout', matchIndex: timeoutIndex, reason: 'none' };

  const deleteIndex = matches.findIndex((match) => ENFORCEABLE_RULES.has(match.rule) && match.proposedAction === 'delete');
  if (deleteIndex >= 0) return { action: 'delete', matchIndex: deleteIndex, reason: 'none' };

  if (matches.length === 0) return { action: null, matchIndex: null, reason: 'none' };
  return {
    action: null,
    matchIndex: null,
    reason: matches.some((match) => match.proposedAction === 'quarantine' || !ENFORCEABLE_RULES.has(match.rule)) ? 'unsupported' : 'alert-only'
  };
}

export class AutoModActionLimiter {
  private readonly timestamps = new Map<string, number[]>();

  constructor(
    private readonly maxActions = MAX_AUTO_MOD_ACTIONS_PER_GUILD,
    private readonly windowMs = AUTO_MOD_ACTION_WINDOW_MS
  ) {}

  tryAcquire(guildId: string, now = Date.now()): boolean {
    const active = (this.timestamps.get(guildId) ?? []).filter((timestamp) => timestamp <= now && now - timestamp < this.windowMs);
    if (active.length >= this.maxActions) {
      this.timestamps.set(guildId, active);
      return false;
    }
    active.push(now);
    this.timestamps.set(guildId, active);
    return true;
  }

  reset(): void {
    this.timestamps.clear();
  }
}
