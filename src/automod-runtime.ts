import { AutoModActionLimiter, AUTO_MOD_TIMEOUT_MS, type AutoModEnforcementAction } from './automod-enforcement.js';

export type AutoModMessageTarget = {
  deletable: boolean;
  delete: () => Promise<unknown>;
  member: {
    moderatable: boolean;
    timeout: (timeoutMs: number, reason?: string) => Promise<unknown>;
  } | null;
};

export type AutoModExecutionOutcome = 'deleted' | 'timed_out' | 'permission_denied' | 'rate_limited' | 'failed';

export async function executeAutoModMessageAction(
  action: AutoModEnforcementAction,
  target: AutoModMessageTarget,
  limiter: AutoModActionLimiter,
  guildId: string,
  now = Date.now()
): Promise<{ outcome: AutoModExecutionOutcome; enforced: boolean }> {
  if (action === 'delete') {
    if (!target.deletable) return { outcome: 'permission_denied', enforced: false };
    if (!limiter.tryAcquire(guildId, now)) return { outcome: 'rate_limited', enforced: false };
    try {
      await target.delete();
      return { outcome: 'deleted', enforced: true };
    } catch {
      return { outcome: 'failed', enforced: false };
    }
  }

  if (!target.member?.moderatable) return { outcome: 'permission_denied', enforced: false };
  if (!limiter.tryAcquire(guildId, now)) return { outcome: 'rate_limited', enforced: false };
  try {
    await target.member.timeout(AUTO_MOD_TIMEOUT_MS, 'LocalBot AutoMod');
    return { outcome: 'timed_out', enforced: true };
  } catch {
    return { outcome: 'failed', enforced: false };
  }
}
