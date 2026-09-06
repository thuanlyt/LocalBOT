export const RUNTIME_PROFILES = ['native', 'headless', 'slash-only'] as const;

export type RuntimeProfile = typeof RUNTIME_PROFILES[number];

export function parseRuntimeProfile(value: string | undefined): RuntimeProfile {
  const normalized = value?.trim().toLowerCase() || 'headless';
  if ((RUNTIME_PROFILES as readonly string[]).includes(normalized)) {
    return normalized as RuntimeProfile;
  }
  throw new Error(`INVALID_RUNTIME_PROFILE: ${normalized}`);
}

export function parseAutoRegisterCommands(value: string | undefined, profile: RuntimeProfile): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return profile !== 'slash-only';
}

export function validateRuntimeProfile(
  profile: RuntimeProfile,
  controlEnabled: boolean,
  runtimeOwnerId: string | null
): void {
  if (profile === 'native' && (!controlEnabled || !runtimeOwnerId)) {
    throw new Error('INVALID_RUNTIME_PROFILE: native requires LOCALBOT_CONTROL_ENABLED=true and LOCALBOT_RUNTIME_OWNER_ID.');
  }
  if (profile === 'slash-only' && (controlEnabled || runtimeOwnerId)) {
    throw new Error('INVALID_RUNTIME_PROFILE: slash-only cannot enable the control bridge or runtime ownership.');
  }
}
