import type { RuntimeProfile } from './runtime-profile.js';

export type DiagnosticStatus = 'pass' | 'info' | 'attention';
export type RuntimeDiagnosticStatus = 'ready' | 'starting' | 'degraded';
export type ProviderDiagnosticState = 'ready' | 'disabled' | 'not_configured';

export type RuntimeDiagnosticProvider = {
  id: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  state: ProviderDiagnosticState;
};

export type RuntimeDiagnosticCheck = {
  id: string;
  status: DiagnosticStatus;
  label: string;
  detail: string;
};

export type RuntimeDiagnostics = {
  status: RuntimeDiagnosticStatus;
  generatedAt: string;
  profile: RuntimeProfile;
  control: {
    enabled: boolean;
    host: string;
    port: number;
    loopbackOnly: boolean;
    ownerPresent: boolean;
  };
  discord: {
    ready: boolean;
    botTag: string | null;
    guildCount: number;
  };
  capabilities: {
    guildMembersIntent: boolean;
    messageContentIntent: boolean;
  };
  providers: RuntimeDiagnosticProvider[];
  checks: RuntimeDiagnosticCheck[];
};

export type RuntimeDiagnosticsProviderInput = Omit<RuntimeDiagnosticProvider, 'state'>;
export type RuntimeDiagnosticsInput = Omit<RuntimeDiagnostics, 'status' | 'generatedAt' | 'checks' | 'providers'> & {
  providers: RuntimeDiagnosticsProviderInput[];
};

function providerState(provider: RuntimeDiagnosticProvider): ProviderDiagnosticState {
  if (!provider.configured) return 'not_configured';
  if (!provider.enabled) return 'disabled';
  return 'ready';
}

function normalizeProviders(providers: RuntimeDiagnosticsProviderInput[]): RuntimeDiagnosticProvider[] {
  return providers.map((provider) => ({ ...provider, state: providerState({ ...provider, state: 'ready' }) }));
}

export function buildRuntimeDiagnostics(input: RuntimeDiagnosticsInput): RuntimeDiagnostics {
  const loopbackOnly = input.control.host === '127.0.0.1';
  const ownerRequired = input.profile === 'native' && input.control.enabled;
  const ownershipValid = !ownerRequired || input.control.ownerPresent;
  const boundaryValid = !input.control.enabled || (loopbackOnly && input.control.port === 2901);
  const coreReady = input.discord.ready;
  const status: RuntimeDiagnosticStatus = !coreReady
    ? 'starting'
    : ownershipValid && boundaryValid
      ? 'ready'
      : 'degraded';

  const providers = normalizeProviders(input.providers);
  const checks: RuntimeDiagnosticCheck[] = [
    {
      id: 'discord-runtime',
      status: input.discord.ready ? 'pass' : 'info',
      label: 'Discord runtime',
      detail: input.discord.ready ? `Gateway sẵn sàng · ${input.discord.guildCount} guild` : 'Đang chờ Discord gateway Ready.'
    },
    {
      id: 'runtime-ownership',
      status: ownershipValid ? (ownerRequired ? 'pass' : 'info') : 'attention',
      label: 'Runtime ownership',
      detail: ownerRequired
        ? ownershipValid ? 'Native ownership marker đang hiện diện.' : 'Native profile chưa xác nhận ownership marker.'
        : 'Profile này không yêu cầu native ownership.'
    },
    {
      id: 'control-boundary',
      status: boundaryValid ? (input.control.enabled ? 'pass' : 'info') : 'attention',
      label: 'Control boundary',
      detail: input.control.enabled
        ? boundaryValid ? `Loopback ${input.control.host}:${input.control.port}` : 'Control endpoint không khớp loopback canonical.'
        : 'Control bridge đang tắt theo profile.'
    },
    {
      id: 'youtube-provider',
      status: providers.some((provider) => provider.id === 'youtube' && provider.state === 'ready') ? 'pass' : 'attention',
      label: 'YouTube',
      detail: providers.some((provider) => provider.id === 'youtube' && provider.state === 'ready') ? 'Provider mặc định đã sẵn sàng.' : 'YouTube provider chưa sẵn sàng.'
    },
    {
      id: 'guild-members-intent',
      status: input.capabilities.guildMembersIntent ? 'pass' : 'info',
      label: 'Members Intent',
      detail: input.capabilities.guildMembersIntent ? 'Đã bật cho Welcome/Goodbye và member discovery.' : 'Đang tắt; member directory có thể chỉ phản ánh cache.'
    },
    {
      id: 'message-content-intent',
      status: input.capabilities.messageContentIntent ? 'pass' : 'info',
      label: 'Message Content Intent',
      detail: input.capabilities.messageContentIntent ? 'Đã bật cho content-based AutoMod.' : 'Đang tắt; AutoMod content rules giữ trạng thái an toàn.'
    }
  ];

  for (const provider of providers) {
    if (provider.id === 'youtube') continue;
    checks.push({
      id: `provider-${provider.id}`,
      status: provider.state === 'ready' ? 'pass' : 'info',
      label: provider.label,
      detail: provider.state === 'ready'
        ? 'Provider đã bật và có cấu hình.'
        : provider.state === 'disabled' ? 'Provider đang tắt theo lựa chọn operator.' : 'Provider chưa có credential; đây không phải lỗi core runtime.'
    });
  }

  return {
    ...input,
    status,
    generatedAt: new Date().toISOString(),
    control: { ...input.control, loopbackOnly },
    providers,
    checks
  };
}
