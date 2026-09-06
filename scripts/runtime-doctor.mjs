import process from 'node:process';

let report;
try {
  const [{ config }, { buildRuntimeDoctorReport }, { providerSettingsStore }, { isSoundCloudEnabled }] = await Promise.all([
    import('../src/config.ts'),
    import('../src/runtime-doctor.ts'),
    import('../src/provider-settings.ts'),
    import('../src/soundcloud.ts')
  ]);
  await providerSettingsStore.load();

  report = buildRuntimeDoctorReport({
    profile: config.runtimeProfile,
    control: {
      enabled: config.controlEnabled,
      host: config.controlHost,
      port: config.controlPort,
      ownerPresent: Boolean(config.runtimeOwnerId)
    },
    required: {
      discordTokenPresent: Boolean(config.discordToken),
      discordClientIdPresent: Boolean(config.discordClientId)
    },
    optional: {
      soundCloudConfigured: Boolean(config.soundcloudClientId && config.soundcloudClientSecret),
      soundCloudEnabled: isSoundCloudEnabled()
    },
    autoRegisterCommands: config.autoRegisterCommands
  });
} catch (error) {
  report = {
    status: 'fail',
    checks: [{
      id: 'config-load',
      status: 'fail',
      label: 'Configuration load',
      detail: error instanceof Error ? error.message : 'Unable to load configuration.'
    }]
  };
}

console.log(JSON.stringify(report, null, 2));
if (report.status === 'fail') process.exitCode = 1;
