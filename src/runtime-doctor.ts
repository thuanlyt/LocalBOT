import { validateControlBinding } from './config.js';
import { validateRuntimeProfile, type RuntimeProfile } from './runtime-profile.js';

export type RuntimeDoctorStatus = 'pass' | 'warn' | 'fail';

export type RuntimeDoctorCheck = {
  id: string;
  status: RuntimeDoctorStatus;
  label: string;
  detail: string;
};

export type RuntimeDoctorInput = {
  profile: RuntimeProfile;
  control: {
    enabled: boolean;
    host: string;
    port: number;
    ownerPresent: boolean;
  };
  required: {
    discordTokenPresent: boolean;
    discordClientIdPresent: boolean;
  };
  optional: {
    soundCloudConfigured: boolean;
    soundCloudEnabled: boolean;
  };
  autoRegisterCommands: boolean;
};

export type RuntimeDoctorReport = {
  status: RuntimeDoctorStatus;
  profile: RuntimeProfile;
  control: RuntimeDoctorInput['control'];
  checks: RuntimeDoctorCheck[];
};

function check(
  id: string,
  status: RuntimeDoctorStatus,
  label: string,
  detail: string
): RuntimeDoctorCheck {
  return { id, status, label, detail };
}

export function buildRuntimeDoctorReport(input: RuntimeDoctorInput): RuntimeDoctorReport {
  const checks: RuntimeDoctorCheck[] = [];

  checks.push(
    check(
      'discord-token',
      input.required.discordTokenPresent ? 'pass' : 'fail',
      'Discord token',
      input.required.discordTokenPresent ? 'A bot token is present.' : 'Missing DISCORD_TOKEN or BOT_TOKEN.'
    ),
    check(
      'discord-client-id',
      input.required.discordClientIdPresent ? 'pass' : 'fail',
      'Discord application',
      input.required.discordClientIdPresent ? 'DISCORD_CLIENT_ID is present.' : 'Missing DISCORD_CLIENT_ID.'
    )
  );

  try {
    validateRuntimeProfile(input.profile, input.control.enabled, input.control.ownerPresent ? 'present' : null);
    checks.push(check('runtime-profile', 'pass', 'Runtime profile', `${input.profile} profile constraints are valid.`));
  } catch (error) {
    checks.push(check(
      'runtime-profile',
      'fail',
      'Runtime profile',
      error instanceof Error ? error.message : 'Runtime profile constraints are invalid.'
    ));
  }

  if (!input.control.enabled) {
    checks.push(check(
      'control-bridge',
      'pass',
      'Control bridge',
      'Disabled; this runtime does not require port 2901.'
    ));
  } else {
    try {
      validateControlBinding(input.control.host, input.control.port);
      checks.push(check(
        'control-bridge',
        'pass',
        'Control bridge',
        `Enabled on ${input.control.host}:${input.control.port}.`
      ));
    } catch (error) {
      checks.push(check(
        'control-bridge',
        'fail',
        'Control bridge',
        error instanceof Error ? error.message : 'Control bridge binding is invalid.'
      ));
    }
  }

  checks.push(check(
    'command-registration',
    input.autoRegisterCommands ? 'pass' : 'warn',
    'Slash registration',
    input.autoRegisterCommands
      ? 'Commands register during the Discord Ready event.'
      : 'Automatic registration is disabled; use npm run register or /bot sync intentionally.'
  ));

  checks.push(check(
    'soundcloud',
    input.optional.soundCloudConfigured && input.optional.soundCloudEnabled ? 'pass' : 'warn',
    'SoundCloud',
    input.optional.soundCloudConfigured && input.optional.soundCloudEnabled
      ? 'Official provider credentials are configured and the provider is enabled.'
      : input.optional.soundCloudEnabled
        ? 'Enabled but not configured; YouTube remains the core provider.'
        : 'Optional provider is disabled or not configured; this is not a Discord core failure.'
  ));

  const status = checks.some((item) => item.status === 'fail')
    ? 'fail'
    : checks.some((item) => item.status === 'warn')
      ? 'warn'
      : 'pass';

  return {
    status,
    profile: input.profile,
    control: input.control,
    checks
  };
}
