import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from "react";
import { Icon } from "@iconify/react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  AudioLines,
  BrainCircuit,
  CircleAlert,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Download,
  FolderOpen,
  Headphones,
  Home,
  Info,
  Library,
  ListMusic,
  ListPlus,
  LogOut,
  LoaderCircle,
  Menu,
  Mic,
  Moon,
  Music2,
  Pause,
  Play,
  Plus,
  Power,
  PowerOff,
  Radio,
  RefreshCw,
  RotateCcw,
  Repeat,
  Repeat1,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sun,
  SunMoon,
  Terminal,
  Trophy,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./App.css";
import { canApplyMusicReadiness, reconcileSelectedVoiceChannel, resetMusicContextForGuildChange } from "./music-context";

type ThemeMode = "default" | "dark" | "light";
type Page = "overview" | "music" | "community" | "settings";
type MusicTab = "discover" | "now-playing" | "queue" | "playlists" | "equalizer";
type Provider = "youtube" | "soundcloud";
type SearchSource = Provider | "all";
type OutputMode = { discord: boolean; windows: boolean };

type VoiceChannelSummary = {
  id: string;
  name: string;
  type: "voice" | "stage";
  category: string | null;
  position: number;
  canConnect: boolean | null;
  canSpeak: boolean | null;
  botJoined: boolean;
};

type TextChannelSummary = {
  id: string;
  name: string;
  category: string | null;
  position: number;
  canSend: boolean | null;
  canEmbed: boolean | null;
};

type GuildRoleSummary = {
  id: string;
  name: string;
  color: string;
  position: number;
  managed: boolean;
  mentionable: boolean;
};

type GuildMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
};

type GuildMemberDirectory = {
  members: GuildMemberSummary[];
  intentEnabled: boolean;
  complete: boolean;
  source: "discord" | "cache";
};

type GuildPermissionSummary = {
  botMemberPresent: boolean;
  botUserId: string | null;
  highestRole: { id: string; name: string; position: number; managed: boolean } | null;
  permissions: {
    viewChannel: boolean | null;
    sendMessages: boolean | null;
    embedLinks: boolean | null;
    connect: boolean | null;
    speak: boolean | null;
    moveMembers: boolean | null;
    manageMessages: boolean | null;
    moderateMembers: boolean | null;
    manageRoles: boolean | null;
    manageGuild: boolean | null;
    viewAuditLog: boolean | null;
    useApplicationCommands: boolean | null;
  };
};

type MusicReadinessPermission = "ViewChannel" | "Connect" | "Speak";
type MusicReadiness = {
  channel: { id: string; name: string; type: "voice" | "stage"; category: string | null; position: number };
  channelExists: true;
  botMemberKnown: boolean;
  effectivePermissions: { viewChannel: boolean | null; connect: boolean | null; speak: boolean | null };
  readiness: "ready" | "missing_permission" | "unknown" | "unsupported";
  missing: MusicReadinessPermission[];
  reasons: string[];
};

type GuildSummary = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  botVoiceChannel: VoiceChannelSummary | null;
};

type Track = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  provider: Provider;
  art: "orbit" | "mono" | "grid" | "wave";
  thumbnail?: string | null;
  url?: string;
};

type BackendTrack = {
  provider: Provider;
  id: string;
  title: string;
  url: string;
  duration: number | null;
  durationText: string;
  channel: string;
  channelId: string | null;
  thumbnail: string | null;
};

type BackendPlayer = {
  current: BackendTrack | null;
  queue: BackendTrack[];
  history: BackendTrack[];
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
  guildId: string;
  voiceChannelId: string;
  status: "idle" | "buffering" | "playing" | "paused";
  volumePercent: number;
  positionSeconds: number;
  durationSeconds: number | null;
  stateVersion: number;
};

type BackendPlaylist = {
  id: string;
  guildId: string;
  name: string;
  description: string;
  tracks: BackendTrack[];
  createdAt: string;
  updatedAt: string;
};

type EqualizerSettings = { bass: number; mid: number; treble: number };
type BotRecoveryState = "stable" | "restarting" | "exhausted";
type BotRuntimeStatus = { managed: boolean; pid: number | null; ownerId: string | null; desiredRunning: boolean; recoveryState: BotRecoveryState; restartAttempt: number };
type NativeRuntimeInfo = { packaged: boolean; dataDir: string; envFilePresent: boolean };
type AudioOutputDevice = { deviceId: string; label: string };
type AudioOutputElement = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };
type MusicAccess = { mode: "allowlist" | "all"; userIds: string[] };
type CommunityRank = { userId: string; username: string; xp: number; level: number; messages: number; rank: number; progress: number; nextLevelXp: number };
type CommunityRoleReward = { roleId: string; level: number };
type CommunitySettings = { ignoredChannelIds: string[]; ignoredRoleIds: string[]; cooldownSeconds: number | null; xpMultiplier: number; roleMultipliers: Record<string, number>; roleRewards: CommunityRoleReward[] };
type AutoModRuleKind = "spam" | "flood" | "link" | "scam" | "antiRaid" | "antiNuke";
type AutoModProposedAction = "alert" | "delete" | "timeout" | "quarantine";
type AutoModThresholdRule = { enabled: boolean; proposedAction: AutoModProposedAction; threshold: number; windowSeconds: number; cooldownSeconds: number };
type AutoModLinkRule = { enabled: boolean; proposedAction: AutoModProposedAction; blockedDomains: string[]; cooldownSeconds: number };
type AutoModScamRule = { enabled: boolean; proposedAction: AutoModProposedAction; cooldownSeconds: number };
type AutoModSettings = { enabled: boolean; mode: "dry-run" | "enforce"; rules: { spam: AutoModThresholdRule; flood: AutoModThresholdRule; link: AutoModLinkRule; scam: AutoModScamRule; antiRaid: AutoModThresholdRule; antiNuke: AutoModThresholdRule }; exemptUserIds: string[]; exemptRoleIds: string[] };
type AutoModCapabilities = { messageContentIntentEnabled: boolean };
type AutoModReviewStatus = "open" | "confirmed" | "dismissed";
type AutoModReviewOutcome = "alerted" | "deleted" | "timed_out" | "unsupported" | "permission_denied" | "rate_limited" | "failed" | "coalesced";
type AutoModReviewEntry = { id: string; guildId: string; channelId: string | null; userId: string | null; rule: AutoModRuleKind; reason: string; proposedAction: AutoModProposedAction; outcome: AutoModReviewOutcome; enforced: boolean; createdAt: string; status: AutoModReviewStatus; reviewedAt: string | null; note: string };
type GreetingKind = "welcome" | "goodbye";
type GreetingTemplate = { enabled: boolean; channelId: string | null; message: string; imageUrl: string | null };
type GreetingSettings = { welcome: GreetingTemplate; goodbye: GreetingTemplate };
type GreetingPreview = { text: string; imageUrl: string | null };
type ProviderStatus = { id: Provider; label: string; enabled: boolean; configured: boolean; auth: string };
type RuntimeDiagnosticCheck = { id: string; status: "pass" | "info" | "attention"; label: string; detail: string };
type RuntimeDiagnostics = {
  status: "ready" | "starting" | "degraded";
  generatedAt: string;
  profile: "native" | "headless" | "slash-only";
  control: { enabled: boolean; host: string; port: number; loopbackOnly: boolean; ownerPresent: boolean };
  discord: { ready: boolean; botTag: string | null; guildCount: number };
  capabilities: { guildMembersIntent: boolean; messageContentIntent: boolean };
  providers: Array<{ id: string; label: string; enabled: boolean; configured: boolean; state: "ready" | "disabled" | "not_configured" }>;
  checks: RuntimeDiagnosticCheck[];
};
type OllamaSettings = { enabled: boolean; baseUrl: string; model: string; timeoutMs: number };
type OllamaHealth = { status: "disabled" | "not_configured" | "ready" | "model_unavailable" | "offline"; reachable: boolean; modelAvailable: boolean | null };
type OllamaSuggestionSurface = "help" | "music" | "community";
type OllamaSuggestion = { suggestion: string; surface: OllamaSuggestionSurface; generatedAt: string };
type AuditEntry = { id: string; timestamp: string; actor: string; action: string; guildId: string | null; detail: string };
type AuditLogSettings = { retentionDays: number | null; maxEntries: number };
type DiscordAuditEntry = { id: string; createdAt: string; actionType: string; targetType: string; targetId: string | null; actorId: string | null; actorTag: string | null };
type FreshnessSurface = "guilds" | "voice" | "player" | "providers";
type FreshnessState = { updatedAt: number | null; error: string | null };
type FreshnessMap = Record<FreshnessSurface, FreshnessState>;
type SyncToken = { key: string; revision: number; guildId?: string; selectionRevision: number };

const defaultAutoModSettings: AutoModSettings = {
  enabled: false,
  mode: "dry-run",
  rules: {
    spam: { enabled: false, proposedAction: "delete", threshold: 3, windowSeconds: 30, cooldownSeconds: 10 },
    flood: { enabled: false, proposedAction: "timeout", threshold: 6, windowSeconds: 10, cooldownSeconds: 10 },
    link: { enabled: false, proposedAction: "delete", blockedDomains: [], cooldownSeconds: 60 },
    scam: { enabled: false, proposedAction: "quarantine", cooldownSeconds: 60 },
    antiRaid: { enabled: false, proposedAction: "alert", threshold: 5, windowSeconds: 60, cooldownSeconds: 60 },
    antiNuke: { enabled: false, proposedAction: "quarantine", threshold: 3, windowSeconds: 30, cooldownSeconds: 60 },
  },
  exemptUserIds: [],
  exemptRoleIds: [],
};

const defaultOllamaSettings: OllamaSettings = { enabled: false, baseUrl: "http://127.0.0.1:11434", model: "", timeoutMs: 5_000 };
const defaultOllamaHealth: OllamaHealth = { status: "disabled", reachable: false, modelAvailable: null };

const initialFreshness: FreshnessMap = {
  guilds: { updatedAt: null, error: null },
  voice: { updatedAt: null, error: null },
  player: { updatedAt: null, error: null },
  providers: { updatedAt: null, error: null },
};

type PlayerAction = "pause" | "resume" | "skip" | "previous" | "stop" | "volume" | "shuffle" | "repeat";
type QueueAction = "remove" | "move" | "clear";
type PlayerActionResult = { ok: boolean; discord: BackendPlayer | null; windows: boolean };

function toUiTrack(track: BackendTrack, index = 0): Track {
  const artVariants: Track["art"][] = ["orbit", "mono", "grid", "wave"];
  return {
    id: `${track.provider}-${track.id}`,
    title: track.title,
    artist: track.channel,
    duration: track.durationText,
    provider: track.provider,
    art: artVariants[index % artVariants.length]!,
    thumbnail: track.thumbnail,
    url: track.url,
  };
}

function durationToSeconds(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatPlaybackTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const total = Math.floor(value);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function readStoredGuildId(): string {
  const stored = window.localStorage.getItem("localbot-guild-id") || "";
  return stored === "demo-guild" ? "" : stored;
}

function readStoredOutputMode(): OutputMode {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("localbot-output-mode") || "null") as Partial<OutputMode> | null;
    if (parsed && typeof parsed.discord === "boolean" && typeof parsed.windows === "boolean" && (parsed.discord || parsed.windows)) {
      return { discord: parsed.discord, windows: parsed.windows };
    }
  } catch {
    // Fall back to the safe Discord-first default.
  }
  return { discord: true, windows: false };
}

function readStoredAudioOutputId(): string {
  return window.localStorage.getItem("localbot-audio-output-device") || "default";
}

type NavItem = {
  id: Page;
  label: string;
  icon: LucideIcon;
};

type ContextItem = {
  id: MusicTab;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { id: "overview", label: "Tổng quan", icon: Home },
  { id: "music", label: "Âm nhạc", icon: Music2 },
  { id: "community", label: "Cộng đồng", icon: UsersRound },
  { id: "settings", label: "Cài đặt", icon: Settings2 },
];

const contextItems: ContextItem[] = [
  { id: "discover", label: "Khám phá", icon: Search },
  { id: "now-playing", label: "Đang phát", icon: Play },
  { id: "queue", label: "Hàng đợi", icon: ListMusic },
  { id: "playlists", label: "Danh sách phát", icon: ListPlus },
  { id: "equalizer", label: "Equalizer", icon: SlidersHorizontal },
];

const themeOptions: Array<{ id: ThemeMode; label: string; icon: LucideIcon }> = [
  { id: "default", label: "Default", icon: SunMoon },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
];

const CONTROL_BASE = "http://127.0.0.1:2901/api/v1";

async function controlRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CONTROL_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* empty response */ }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? (payload.error as { message?: string })?.message
      : undefined;
    throw new Error(message || "Control API không thể hoàn thành thao tác.");
  }
  return payload as T;
}

async function downloadControlFile(path: string, filename: string): Promise<void> {
  const response = await fetch(`${CONTROL_BASE}${path}`, { headers: { accept: "application/json, text/csv" } });
  if (!response.ok) {
    let message: string | undefined;
    try {
      const payload = await response.json() as { error?: { message?: string } };
      message = payload.error?.message;
    } catch {
      // Keep the safe fallback below for non-JSON failures.
    }
    throw new Error(message || "Không thể tải file export từ Control API.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function readTheme(): ThemeMode {
  const stored = window.localStorage.getItem("localbot-theme");
  return stored === "default" || stored === "light" || stored === "dark" ? stored : "dark";
}

function ProviderMark({ provider }: { provider: Provider }) {
  const icon = provider === "youtube" ? "simple-icons:youtube" : "simple-icons:soundcloud";
  return (
    <span className="provider-mark" aria-hidden="true">
      <Icon icon={icon} fallback={<Music2 size={13} strokeWidth={1.8} />} />
    </span>
  );
}

function SourceTag({ provider }: { provider: Provider }) {
  const label = provider === "youtube" ? "YouTube" : "SoundCloud";
  return (
    <span className={`source-tag source-tag-${provider}`} data-provider={provider} title={label}>
      <ProviderMark provider={provider} />
      <span className="source-tag-label">{label}</span>
    </span>
  );
}

function Artwork({ track, large = false }: { track: Track | null; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [track?.thumbnail]);
  const hasImage = Boolean(track?.thumbnail) && !imageFailed;
  return (
    <div className={`artwork artwork-${track?.art ?? "mono"} ${hasImage ? "artwork-has-image" : ""} ${large ? "artwork-large" : ""}`} aria-label={track ? `Artwork ${track.title}` : "Chưa có artwork"} role="img">
      {hasImage ? <img className="artwork-image" src={track!.thumbnail!} alt="" loading="lazy" width={large ? 270 : 72} height={large ? 270 : 72} onError={() => setImageFailed(true)} /> : <>
        <span className="artwork-line artwork-line-one" />
        <span className="artwork-line artwork-line-two" />
        <Music2 size={large ? 30 : 18} strokeWidth={1.25} />
      </>}
    </div>
  );
}

function IconButton({ label, children, className = "", onClick, animated = true, disabled = false }: { label: string; children: React.ReactNode; className?: string; onClick?: () => void; animated?: boolean; disabled?: boolean }) {
  return (
    <motion.button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      whileTap={animated && !disabled ? { scale: 0.94 } : undefined}
      transition={animated ? { duration: 0.16 } : undefined}
    >
      {children}
    </motion.button>
  );
}

function BotRuntimeToggle({
  bridgeOnline,
  bridgeReachable,
  managed,
  recoveryState,
  restartAttempt,
  busy,
  supported,
  onToggle,
}: {
  bridgeOnline: boolean;
  bridgeReachable: boolean;
  managed: boolean;
  recoveryState: BotRecoveryState;
  restartAttempt: number;
  busy: "start" | "stop" | null;
  supported: boolean;
  onToggle: () => void;
}) {
  const externallyRunning = bridgeReachable && !managed;
  const active = managed;
  const recovering = !active && recoveryState === "restarting";
  const exhausted = !active && recoveryState === "exhausted";
  const label = busy === "start" ? "Đang bật bot…" : busy === "stop" ? "Đang dừng bot…" : externallyRunning ? "Runtime ngoài native" : recovering ? "Đang tự khôi phục…" : exhausted ? "Cần bật lại bot" : active ? bridgeOnline ? "Bot đang chạy" : "Đang kết nối bot" : "Bật bot";
  const detail = externallyRunning ? "Port 2901 do tiến trình khác sở hữu" : recovering ? `Native supervisor · lần thử ${restartAttempt}/3` : exhausted ? "Native supervisor · bấm để thử lại" : bridgeOnline ? "Discord · Control online" : active ? "Native process · đang khởi động" : "Native runtime · bấm để chạy";
  const StatusIcon = busy || recovering ? RefreshCw : active ? Power : PowerOff;

  return (
    <motion.button
      type="button"
      className={`bot-runtime-toggle ${active ? "is-active" : ""} ${externallyRunning ? "is-external" : ""}`}
      onClick={onToggle}
      disabled={!supported || busy !== null || externallyRunning}
      aria-pressed={active}
      aria-busy={busy !== null}
      title={externallyRunning ? "Port 2901 đang do tiến trình ngoài native sử dụng. Hãy dừng tiến trình đó rồi khởi động LocalBot từ đây." : supported ? `${label}. ${detail}` : "Điều khiển bot chỉ khả dụng trong native app."}
      whileTap={supported && !busy && !externallyRunning ? { scale: 0.97 } : undefined}
      transition={{ duration: 0.16 }}
    >
      <span className="bot-runtime-icon"><StatusIcon size={16} strokeWidth={1.8} className={busy || recovering ? "is-spinning" : ""} /></span>
      <span className="bot-runtime-copy"><strong>{label}</strong><small>{detail}</small></span>
    </motion.button>
  );
}

function Panel({ title, icon: PanelIcon, action, children, className = "" }: { title: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div className="panel-title"><PanelIcon size={16} strokeWidth={1.8} /><span>{title}</span></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function App() {
  const reduceMotion = useReducedMotion();
  const [theme, setTheme] = useState<ThemeMode>(readTheme);
  const [page, setPage] = useState<Page>("overview");
  const [musicTab, setMusicTab] = useState<MusicTab>("discover");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [searchSource, setSearchSource] = useState<SearchSource>("all");
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [toast, setToast] = useState<string | null>(null);
  const [bridgeReachable, setBridgeReachable] = useState(false);
  const [bridgeOwnerId, setBridgeOwnerId] = useState<string | null>(null);
  const [botManaged, setBotManaged] = useState(false);
  const [botOwnerId, setBotOwnerId] = useState<string | null>(null);
  const [botRecoveryState, setBotRecoveryState] = useState<BotRecoveryState>("stable");
  const [botRestartAttempt, setBotRestartAttempt] = useState(0);
  const [botBusy, setBotBusy] = useState<"start" | "stop" | null>(null);
  const [restorePending, setRestorePending] = useState(false);
  const [botProcessSupported, setBotProcessSupported] = useState(true);
  const [nativeRuntimeInfo, setNativeRuntimeInfo] = useState<NativeRuntimeInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [musicContextOpen, setMusicContextOpen] = useState(false);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState(readStoredGuildId);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannelSummary[]>([]);
  const [selectedVoiceChannelId, setSelectedVoiceChannelId] = useState("");
  const [musicReadiness, setMusicReadiness] = useState<MusicReadiness | null>(null);
  const [musicReadinessLoading, setMusicReadinessLoading] = useState(false);
  const [musicReadinessError, setMusicReadinessError] = useState<string | null>(null);
  const [textChannels, setTextChannels] = useState<TextChannelSummary[]>([]);
  const [guildRoles, setGuildRoles] = useState<GuildRoleSummary[]>([]);
  const [guildRolesLoading, setGuildRolesLoading] = useState(false);
  const [guildPermissions, setGuildPermissions] = useState<GuildPermissionSummary | null>(null);
  const [guildPermissionsLoading, setGuildPermissionsLoading] = useState(false);
  const [memberDirectory, setMemberDirectory] = useState<GuildMemberDirectory>({ members: [], intentEnabled: false, complete: false, source: "cache" });
  const [memberDirectoryLoading, setMemberDirectoryLoading] = useState(false);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null);
  const [nativePlayer, setNativePlayer] = useState<BackendPlayer | null>(null);
  const [searchResults, setSearchResults] = useState<Track[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [commandsBusy, setCommandsBusy] = useState(false);
  const [playlists, setPlaylists] = useState<BackendPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [equalizer, setEqualizer] = useState<EqualizerSettings>({ bass: 0, mid: 0, treble: 0 });
  const [equalizerLoading, setEqualizerLoading] = useState(false);
  const [musicAccess, setMusicAccess] = useState<MusicAccess>({ mode: "allowlist", userIds: [] });
  const [musicAccessLoading, setMusicAccessLoading] = useState(false);
  const [communityLeaderboard, setCommunityLeaderboard] = useState<CommunityRank[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communitySettings, setCommunitySettings] = useState<CommunitySettings>({ ignoredChannelIds: [], ignoredRoleIds: [], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });
  const [communityOffset, setCommunityOffset] = useState(0);
  const [communityHasMore, setCommunityHasMore] = useState(false);
  const [communityMember, setCommunityMember] = useState<CommunityRank | null>(null);
  const [communityMemberLoading, setCommunityMemberLoading] = useState(false);
  const [greetingSettings, setGreetingSettings] = useState<GreetingSettings>({
    welcome: { enabled: false, channelId: null, message: "Chào mừng {user} đến với {guild}!", imageUrl: null },
    goodbye: { enabled: false, channelId: null, message: "Tạm biệt {username}. Chúc bạn một ngày tốt lành!", imageUrl: null },
  });
  const [greetingsIntentEnabled, setGreetingsIntentEnabled] = useState(false);
  const [greetingsLoading, setGreetingsLoading] = useState(false);
  const [automodSettings, setAutomodSettings] = useState<AutoModSettings>(defaultAutoModSettings);
  const [automodCapabilities, setAutomodCapabilities] = useState<AutoModCapabilities>({ messageContentIntentEnabled: false });
  const [automodLoading, setAutomodLoading] = useState(false);
  const [automodReviews, setAutomodReviews] = useState<AutoModReviewEntry[]>([]);
  const [automodReviewLoading, setAutomodReviewLoading] = useState(false);
  const [automodReviewError, setAutomodReviewError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [runtimeDiagnosticsLoading, setRuntimeDiagnosticsLoading] = useState(false);
  const [soundCloudCredentialsStored, setSoundCloudCredentialsStored] = useState<boolean | null>(null);
  const [soundCloudCredentialsLoading, setSoundCloudCredentialsLoading] = useState(false);
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettings>(defaultOllamaSettings);
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealth>(defaultOllamaHealth);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaSuggestion, setOllamaSuggestion] = useState<OllamaSuggestion | null>(null);
  const [ollamaSuggestionQuery, setOllamaSuggestionQuery] = useState("");
  const [ollamaSuggestionSurface, setOllamaSuggestionSurface] = useState<OllamaSuggestionSurface>("help");
  const [ollamaSuggestionLoading, setOllamaSuggestionLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [discordAuditEntries, setDiscordAuditEntries] = useState<DiscordAuditEntry[] | null>(null);
  const [discordAuditLoading, setDiscordAuditLoading] = useState(false);
  const [discordAuditError, setDiscordAuditError] = useState<string | null>(null);
  const [auditSettings, setAuditSettings] = useState<AuditLogSettings>({ retentionDays: null, maxEntries: 2_000 });
  const [auditSettingsLoading, setAuditSettingsLoading] = useState(false);
  const [auditExportLoading, setAuditExportLoading] = useState(false);
  const [freshness, setFreshness] = useState<FreshnessMap>(initialFreshness);
  const [outputMode, setOutputMode] = useState<OutputMode>(readStoredOutputMode);
  const [localCurrentTrack, setLocalCurrentTrack] = useState<Track | null>(null);
  const [localHistory, setLocalHistory] = useState<Track[]>([]);
  const [localQueue, setLocalQueue] = useState<Track[]>([]);
  const [localPosition, setLocalPosition] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioOutputDevice[]>([{ deviceId: "default", label: "Thiết bị mặc định của Windows" }]);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(readStoredAudioOutputId);
  const [audioOutputSupported, setAudioOutputSupported] = useState<boolean | null>(null);
  const [audioOutputLoading, setAudioOutputLoading] = useState(false);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const localTrackKeyRef = useRef<string | null>(null);
  const localSessionRef = useRef(0);
  const playbackAvailableRef = useRef(false);
  const musicActionRef = useRef<(action: PlayerAction, body?: Record<string, unknown>) => Promise<PlayerActionResult>>(() => Promise.resolve({ ok: false, discord: null, windows: false }));
  const bridgeOnline = botManaged && bridgeReachable && Boolean(botOwnerId) && bridgeOwnerId === botOwnerId;
  const bridgeOnlineRef = useRef(bridgeOnline);
  bridgeOnlineRef.current = bridgeOnline;
  const selectedGuildIdRef = useRef(selectedGuildId);
  selectedGuildIdRef.current = selectedGuildId;
  const selectedVoiceChannelIdRef = useRef(selectedVoiceChannelId);
  selectedVoiceChannelIdRef.current = selectedVoiceChannelId;
  const guildSelectionRevisionRef = useRef(0);
  const selectGuild = useCallback((guildId: string) => {
    if (selectedGuildIdRef.current === guildId) return;
    const nextContext = resetMusicContextForGuildChange(guildId);
    guildSelectionRevisionRef.current += 1;
    selectedGuildIdRef.current = nextContext.selectedGuildId;
    selectedVoiceChannelIdRef.current = nextContext.selectedVoiceChannelId;
    setSelectedGuildId(nextContext.selectedGuildId);
    setSelectedVoiceChannelId(nextContext.selectedVoiceChannelId);
    setMusicReadiness(null);
    setMusicReadinessError(nextContext.readinessError);
  }, []);
  const syncRevisionsRef = useRef(new Map<string, number>());
  const beginSync = (surface: string, guildId?: string): SyncToken => {
    const key = `${surface}:${guildId ?? "global"}`;
    const revision = (syncRevisionsRef.current.get(key) ?? 0) + 1;
    syncRevisionsRef.current.set(key, revision);
    return { key, revision, guildId, selectionRevision: guildSelectionRevisionRef.current };
  };
  const isCurrentSync = (token: SyncToken): boolean => syncRevisionsRef.current.get(token.key) === token.revision
    && token.selectionRevision === guildSelectionRevisionRef.current
    && (token.guildId === undefined || selectedGuildIdRef.current === token.guildId);
  const canCommitSync = (token: SyncToken): boolean => isCurrentSync(token) && bridgeOnlineRef.current;
  const isCurrentGuild = (guildId: string): boolean => selectedGuildIdRef.current === guildId;
  const canCommitGuild = (guildId: string): boolean => isCurrentGuild(guildId) && bridgeOnlineRef.current;
  const markFresh = useCallback((surface: FreshnessSurface) => {
    setFreshness((current) => ({ ...current, [surface]: { updatedAt: Date.now(), error: null } }));
  }, []);
  const markFreshnessError = useCallback((surface: FreshnessSurface, error: unknown) => {
    setFreshness((current) => ({ ...current, [surface]: { ...current[surface], error: error instanceof Error ? error.message : "Không thể đồng bộ dữ liệu." } }));
  }, []);

  const refreshGuilds = useCallback(async (silent = false) => {
    const sync = beginSync("guilds");
    if (!bridgeOnline) return;
    if (!silent) setGuildsLoading(true);
    try {
      const payload = await controlRequest<{ guilds: GuildSummary[] }>("/guilds");
      if (!canCommitSync(sync)) return;
      setGuilds(payload.guilds);
      const nextGuildId = payload.guilds.some((guild) => guild.id === selectedGuildIdRef.current)
        ? selectedGuildIdRef.current
        : payload.guilds[0]?.id ?? "";
      selectGuild(nextGuildId);
      markFresh("guilds");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      markFreshnessError("guilds", error);
      if (!silent) showToast(error instanceof Error ? error.message : "Không thể tải danh sách guild.");
    } finally {
      if (!silent && isCurrentSync(sync)) setGuildsLoading(false);
    }
  }, [bridgeOnline, markFresh, markFreshnessError, selectGuild]);

  const refreshVoiceChannels = useCallback(async (guildId: string, silent = false) => {
    if (!guildId) {
      setVoiceChannels([]);
      return;
    }
    if (!bridgeOnline) {
      setVoiceChannels([]);
      return;
    }
    const sync = beginSync("voice", guildId);
    if (!silent) setChannelsLoading(true);
    try {
      const payload = await controlRequest<{ channels: VoiceChannelSummary[] }>(`/guilds/${encodeURIComponent(guildId)}/channels`);
      if (!canCommitSync(sync)) return;
      setVoiceChannels(payload.channels);
      setSelectedVoiceChannelId((current) => {
        const nextChannelId = reconcileSelectedVoiceChannel(current, payload.channels);
        selectedVoiceChannelIdRef.current = nextChannelId;
        return nextChannelId;
      });
      markFresh("voice");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      markFreshnessError("voice", error);
      if (!silent) setVoiceChannels([]);
      if (!silent) showToast(error instanceof Error ? error.message : "Không thể tải voice channel.");
    } finally {
      if (!silent && isCurrentSync(sync)) setChannelsLoading(false);
    }
  }, [bridgeOnline, markFresh, markFreshnessError]);

  const refreshMusicReadiness = useCallback(async (guildId: string, channelId: string, silent = false) => {
    if (!guildId || !channelId || !bridgeOnline) {
      setMusicReadiness(null);
      setMusicReadinessError(null);
      return;
    }
    const sync = beginSync("music-readiness", guildId);
    if (!silent) setMusicReadinessLoading(true);
    try {
      const payload = await controlRequest<{ readiness: MusicReadiness }>(`/guilds/${encodeURIComponent(guildId)}/channels/${encodeURIComponent(channelId)}/music-readiness`);
      if (!canCommitSync(sync)) return;
      if (!canApplyMusicReadiness({ guildId, channelId }, { guildId: selectedGuildIdRef.current, channelId: selectedVoiceChannelIdRef.current }, payload.readiness)) return;
      setMusicReadiness(payload.readiness);
      setMusicReadinessError(null);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setMusicReadiness(null);
      setMusicReadinessError(error instanceof Error ? error.message : "Không thể kiểm tra readiness của voice channel.");
    } finally {
      if (!silent && isCurrentSync(sync)) setMusicReadinessLoading(false);
    }
  }, [bridgeOnline]);

  const refreshTextChannels = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setTextChannels([]);
      return;
    }
    const sync = beginSync("text-channels", guildId);
    try {
      const payload = await controlRequest<{ channels: TextChannelSummary[] }>(`/guilds/${encodeURIComponent(guildId)}/text-channels`);
      if (!canCommitSync(sync)) return;
      setTextChannels(payload.channels);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setTextChannels([]);
      showToast(error instanceof Error ? error.message : "Không thể tải text channel.");
    }
  }, [bridgeOnline]);

  const refreshGuildRoles = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setGuildRoles([]);
      return;
    }
    const sync = beginSync("roles", guildId);
    setGuildRoles([]);
    setGuildRolesLoading(true);
    try {
      const payload = await controlRequest<{ roles: GuildRoleSummary[] }>(`/guilds/${encodeURIComponent(guildId)}/roles`);
      if (!canCommitSync(sync)) return;
      setGuildRoles(payload.roles);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setGuildRoles([]);
      showToast(error instanceof Error ? error.message : "Không thể tải danh sách role của guild.");
    } finally {
      if (isCurrentSync(sync)) setGuildRolesLoading(false);
    }
  }, [bridgeOnline]);

  const refreshGuildPermissions = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setGuildPermissions(null);
      return;
    }
    const sync = beginSync("permissions", guildId);
    setGuildPermissionsLoading(true);
    try {
      const payload = await controlRequest<{ permissions: GuildPermissionSummary }>(`/guilds/${encodeURIComponent(guildId)}/permissions`);
      if (!canCommitSync(sync)) return;
      setGuildPermissions(payload.permissions);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setGuildPermissions(null);
      showToast(error instanceof Error ? error.message : "Không thể tải quyền của bot trong guild.");
    } finally {
      if (isCurrentSync(sync)) setGuildPermissionsLoading(false);
    }
  }, [bridgeOnline]);

  const searchGuildMembers = useCallback(async (guildId: string, query: string) => {
    if (!bridgeOnline || !guildId) {
      setMemberDirectory({ members: [], intentEnabled: false, complete: false, source: "cache" });
      return;
    }
    const sync = beginSync("members", guildId);
    setMemberDirectoryLoading(true);
    try {
      const params = new URLSearchParams({ query: query.trim(), limit: "10" });
      const payload = await controlRequest<GuildMemberDirectory>(`/guilds/${encodeURIComponent(guildId)}/members?${params.toString()}`);
      if (!canCommitSync(sync)) return;
      setMemberDirectory(payload);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setMemberDirectory({ members: [], intentEnabled: false, complete: false, source: "cache" });
      showToast(error instanceof Error ? error.message : "Không thể tìm thành viên trong guild.");
    } finally {
      if (isCurrentSync(sync)) setMemberDirectoryLoading(false);
    }
  }, [bridgeOnline]);

  const refreshPlayer = useCallback(async (guildId: string, silent = false) => {
    if (!bridgeOnline || !guildId) {
      setNativePlayer(null);
      return;
    }
    const sync = beginSync("player", guildId);
    try {
      const payload = await controlRequest<{ player: BackendPlayer | null }>(`/guilds/${encodeURIComponent(guildId)}/player`);
      if (!canCommitSync(sync)) return;
      setNativePlayer(payload.player);
      markFresh("player");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      markFreshnessError("player", error);
      setNativePlayer(null);
      if (!silent) showToast(error instanceof Error ? error.message : "Không thể tải trạng thái player.");
    }
  }, [bridgeOnline, markFresh, markFreshnessError]);

  const refreshPlaylists = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setPlaylists([]);
      return;
    }
    const sync = beginSync("playlists", guildId);
    setPlaylistsLoading(true);
    try {
      const payload = await controlRequest<{ playlists: BackendPlaylist[] }>(`/guilds/${encodeURIComponent(guildId)}/playlists`);
      if (!canCommitSync(sync)) return;
      setPlaylists(payload.playlists);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải playlist local.");
    } finally {
      if (isCurrentSync(sync)) setPlaylistsLoading(false);
    }
  }, [bridgeOnline]);

  const refreshEqualizer = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setEqualizer({ bass: 0, mid: 0, treble: 0 });
      return;
    }
    const sync = beginSync("equalizer", guildId);
    setEqualizerLoading(true);
    try {
      const payload = await controlRequest<{ settings: EqualizerSettings }>(`/guilds/${encodeURIComponent(guildId)}/equalizer`);
      if (!canCommitSync(sync)) return;
      setEqualizer(payload.settings);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setEqualizer({ bass: 0, mid: 0, treble: 0 });
      showToast(error instanceof Error ? error.message : "Không thể tải Equalizer.");
    } finally {
      if (isCurrentSync(sync)) setEqualizerLoading(false);
    }
  }, [bridgeOnline]);

  const refreshMusicAccess = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setMusicAccess({ mode: "allowlist", userIds: [] });
      return;
    }
    const sync = beginSync("music-access", guildId);
    setMusicAccessLoading(true);
    try {
      const payload = await controlRequest<{ permissions: MusicAccess }>(`/guilds/${encodeURIComponent(guildId)}/music-access`);
      if (!canCommitSync(sync)) return;
      setMusicAccess(payload.permissions);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải cấu hình quyền Music.");
    } finally {
      if (isCurrentSync(sync)) setMusicAccessLoading(false);
    }
  }, [bridgeOnline]);

  const refreshCommunity = useCallback(async (guildId: string, offset = 0) => {
    if (!bridgeOnline || !guildId) {
      setCommunityLeaderboard([]);
      setCommunitySettings({ ignoredChannelIds: [], ignoredRoleIds: [], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });
      setCommunityHasMore(false);
      return;
    }
    const sync = beginSync("community", guildId);
    setCommunityLoading(true);
    try {
      const [leaderboardPayload, settingsPayload] = await Promise.all([
        controlRequest<{ leaderboard: CommunityRank[]; hasMore: boolean }>(`/guilds/${encodeURIComponent(guildId)}/community/leaderboard?limit=10&offset=${offset}`),
        controlRequest<{ settings: CommunitySettings }>(`/guilds/${encodeURIComponent(guildId)}/community/settings`)
      ]);
      if (!canCommitSync(sync)) return;
      setCommunityLeaderboard(leaderboardPayload.leaderboard);
      setCommunityHasMore(leaderboardPayload.hasMore);
      setCommunitySettings(settingsPayload.settings);
      setCommunityOffset(offset);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải bảng xếp hạng Community.");
    } finally {
      if (isCurrentSync(sync)) setCommunityLoading(false);
    }
  }, [bridgeOnline]);

  const refreshGreetings = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setGreetingSettings({
        welcome: { enabled: false, channelId: null, message: "Chào mừng {user} đến với {guild}!", imageUrl: null },
        goodbye: { enabled: false, channelId: null, message: "Tạm biệt {username}. Chúc bạn một ngày tốt lành!", imageUrl: null },
      });
      setGreetingsIntentEnabled(false);
      return;
    }
    const sync = beginSync("greetings", guildId);
    setGreetingsLoading(true);
    try {
      const payload = await controlRequest<{ settings: GreetingSettings; intentEnabled: boolean }>(`/guilds/${encodeURIComponent(guildId)}/greetings`);
      if (!canCommitSync(sync)) return;
      setGreetingSettings(payload.settings);
      setGreetingsIntentEnabled(payload.intentEnabled);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải cấu hình Welcome/Goodbye.");
    } finally {
      if (isCurrentSync(sync)) setGreetingsLoading(false);
    }
  }, [bridgeOnline]);

  const refreshAutoModReview = useCallback(async (guildId: string, status: AutoModReviewStatus = "open") => {
    if (!bridgeOnline || !guildId) {
      setAutomodReviews([]);
      setAutomodReviewError(null);
      setAutomodReviewLoading(false);
      return;
    }
    const sync = beginSync("automod-review", guildId);
    setAutomodReviewLoading(true);
    try {
      const payload = await controlRequest<{ guildId: string; entries: AutoModReviewEntry[] }>(`/guilds/${encodeURIComponent(guildId)}/automod/review?status=${status}&limit=50`);
      if (!canCommitSync(sync)) return;
      setAutomodReviews(payload.entries);
      setAutomodReviewError(null);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setAutomodReviews([]);
      setAutomodReviewError(error instanceof Error ? error.message : "Không thể tải hàng chờ AutoMod.");
    } finally {
      if (isCurrentSync(sync)) setAutomodReviewLoading(false);
    }
  }, [bridgeOnline]);

  const refreshAutoMod = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setAutomodSettings(defaultAutoModSettings);
      setAutomodCapabilities({ messageContentIntentEnabled: false });
      setAutomodReviews([]);
      setAutomodReviewError(null);
      setAutomodReviewLoading(false);
      return;
    }
    const sync = beginSync("automod", guildId);
    setAutomodLoading(true);
    try {
      const payload = await controlRequest<{ settings: AutoModSettings; capabilities?: AutoModCapabilities }>(`/guilds/${encodeURIComponent(guildId)}/automod`);
      if (!canCommitSync(sync)) return;
      setAutomodSettings(payload.settings);
      setAutomodCapabilities(payload.capabilities ?? { messageContentIntentEnabled: false });
      void refreshAutoModReview(guildId);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      setAutomodSettings(defaultAutoModSettings);
      setAutomodCapabilities({ messageContentIntentEnabled: false });
      showToast(error instanceof Error ? error.message : "Không thể tải cấu hình AutoMod.");
    } finally {
      if (isCurrentSync(sync)) setAutomodLoading(false);
    }
  }, [bridgeOnline, refreshAutoModReview]);

  const updateGreeting = useCallback(async (kind: GreetingKind, template: GreetingTemplate) => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi lưu Welcome/Goodbye.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:greetings", guildId);
    setGreetingsLoading(true);
    try {
      const payload = await controlRequest<{ settings: GreetingSettings; intentEnabled: boolean }>(`/guilds/${encodeURIComponent(guildId)}/greetings`, {
        method: "POST",
        body: JSON.stringify({ kind, template }),
      });
      if (!canCommitSync(sync)) return;
      setGreetingSettings(payload.settings);
      setGreetingsIntentEnabled(payload.intentEnabled);
      showToast(`Đã lưu ${kind === "welcome" ? "Welcome" : "Goodbye"}.`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể lưu cấu hình Welcome/Goodbye.");
    } finally {
      if (isCurrentSync(sync)) setGreetingsLoading(false);
    }
  }, [bridgeOnline, selectedGuildId]);


  const previewGreeting = useCallback(async (kind: GreetingKind, username: string): Promise<GreetingPreview | null> => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi xem preview.");
      return null;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:greeting-preview", guildId);
    try {
      const payload = await controlRequest<{ preview: GreetingPreview }>(`/guilds/${encodeURIComponent(guildId)}/greetings/preview`, {
        method: "POST",
        body: JSON.stringify({ kind, username }),
      });
      return canCommitSync(sync) ? payload.preview : null;
    } catch (error) {
      if (!canCommitSync(sync)) return null;
      showToast(error instanceof Error ? error.message : "Không thể tạo preview.");
      return null;
    }
  }, [bridgeOnline, selectedGuildId]);

  const testSendGreeting = useCallback(async (kind: GreetingKind) => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi gửi thử.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:greeting-test-send", guildId);
    try {
      await controlRequest<{ kind: GreetingKind; sent: boolean }>(`/guilds/${encodeURIComponent(guildId)}/greetings/test-send`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      if (!canCommitSync(sync)) return;
      showToast(`Đã gửi thử ${kind === "welcome" ? "Welcome" : "Goodbye"} vào channel đã chọn.`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể gửi thử Welcome/Goodbye.");
    }
  }, [bridgeOnline, selectedGuildId]);

  const updateAutoMod = useCallback(async (settings: AutoModSettings) => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi lưu AutoMod.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:automod", guildId);
    setAutomodLoading(true);
    try {
      const payload = await controlRequest<{ settings: AutoModSettings; capabilities?: AutoModCapabilities }>(`/guilds/${encodeURIComponent(guildId)}/automod`, {
        method: "POST",
        body: JSON.stringify({ settings }),
      });
      if (!canCommitSync(sync)) return;
      setAutomodSettings(payload.settings);
      setAutomodCapabilities(payload.capabilities ?? { messageContentIntentEnabled: false });
      showToast(payload.settings.mode === "enforce" ? "Đã lưu AutoMod enforce có giới hạn." : "Đã lưu policy AutoMod dry-run.");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể lưu cấu hình AutoMod.");
    } finally {
      if (isCurrentSync(sync)) setAutomodLoading(false);
    }
  }, [bridgeOnline, selectedGuildId]);

  const recoverAutoMod = useCallback(async () => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi recovery AutoMod.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:automod-recover", guildId);
    setAutomodLoading(true);
    try {
      const payload = await controlRequest<{ recovered: boolean; settings: AutoModSettings }>(
        `/guilds/${encodeURIComponent(guildId)}/automod/recover`,
        { method: "POST", body: JSON.stringify({ confirm: true }) }
      );
      if (!canCommitSync(sync)) return;
      setAutomodSettings(payload.settings);
      showToast("AutoMod đã về trạng thái an toàn: tắt và dry-run.");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể recovery AutoMod.");
    } finally {
      if (isCurrentSync(sync)) setAutomodLoading(false);
    }
  }, [bridgeOnline, selectedGuildId]);

  const decideAutoModReview = useCallback(async (reviewId: string, decision: "confirm" | "dismiss", note: string) => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi quyết định review AutoMod.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:automod-review", guildId);
    setAutomodReviewLoading(true);
    try {
      const payload = await controlRequest<{ entry: AutoModReviewEntry }>(`/guilds/${encodeURIComponent(guildId)}/automod/review/${encodeURIComponent(reviewId)}`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      });
      if (!canCommitSync(sync)) return;
      setAutomodReviews((current) => current.map((entry) => entry.id === reviewId ? payload.entry : entry));
      showToast(decision === "confirm" ? "Đã xác nhận tín hiệu AutoMod." : "Đã bỏ qua tín hiệu AutoMod.");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể cập nhật review AutoMod.");
    } finally {
      if (isCurrentSync(sync)) setAutomodReviewLoading(false);
    }
  }, [bridgeOnline, selectedGuildId]);

  const updateCommunitySettings = useCallback(async (patch: Record<string, unknown>, successMessage = "Đã lưu cấu hình Community.") => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi lưu cấu hình Community.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:community-settings", guildId);
    try {
      const payload = await controlRequest<{ settings: CommunitySettings }>(`/guilds/${encodeURIComponent(guildId)}/community/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!canCommitSync(sync)) return;
      setCommunitySettings(payload.settings);
      showToast(successMessage);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể lưu cấu hình Community.");
    }
  }, [bridgeOnline, selectedGuildId]);

  const moveCommunityPage = useCallback((offset: number) => {
    const safeOffset = Math.max(0, offset);
    setCommunityOffset(safeOffset);
    if (selectedGuildId) void refreshCommunity(selectedGuildId, safeOffset);
  }, [refreshCommunity, selectedGuildId]);

  const inspectCommunityMember = useCallback(async (userId: string) => {
    if (!bridgeOnline || !selectedGuildId) return;
    const guildId = selectedGuildId;
    const sync = beginSync("action:community-member", guildId);
    setCommunityMemberLoading(true);
    try {
      const payload = await controlRequest<{ member: CommunityRank | null }>(`/guilds/${encodeURIComponent(guildId)}/community/member/${encodeURIComponent(userId)}`);
      if (!canCommitSync(sync)) return;
      setCommunityMember(payload.member);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải thông tin thành viên.");
    } finally {
      if (isCurrentSync(sync)) setCommunityMemberLoading(false);
    }
  }, [bridgeOnline, selectedGuildId]);

  const resetCommunity = useCallback(async () => {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Bật bot runtime và chọn guild trước khi reset Community.");
      return;
    }
    if (!window.confirm("Reset toàn bộ XP và rank của guild này? Cấu hình cooldown, kênh và role bỏ qua sẽ được giữ nguyên.")) return;
    const guildId = selectedGuildId;
    const sync = beginSync("action:community-reset", guildId);
    try {
      const payload = await controlRequest<{ removedMembers: number; settings: CommunitySettings }>(`/guilds/${encodeURIComponent(guildId)}/community/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true })
      });
      if (!canCommitSync(sync)) return;
      setCommunityMember(null);
      setCommunitySettings(payload.settings);
      await refreshCommunity(guildId, 0);
      if (!canCommitGuild(guildId)) return;
      showToast(`Đã reset Community cho ${payload.removedMembers} thành viên.`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể reset Community.");
    }
  }, [bridgeOnline, refreshCommunity, selectedGuildId]);

  const refreshProviders = useCallback(async () => {
    if (!bridgeOnline) {
      setProviders([]);
      return;
    }
    const sync = beginSync("providers");
    setProvidersLoading(true);
    try {
      const payload = await controlRequest<{ providers: ProviderStatus[] }>("/providers");
      if (!canCommitSync(sync)) return;
      setProviders(payload.providers);
      markFresh("providers");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      markFreshnessError("providers", error);
      setProviders([]);
      showToast(error instanceof Error ? error.message : "Không thể tải trạng thái nguồn nhạc.");
    } finally {
      if (isCurrentSync(sync)) setProvidersLoading(false);
    }
  }, [bridgeOnline, markFresh, markFreshnessError]);

  const refreshRuntimeDiagnostics = useCallback(async () => {
    if (!bridgeOnline) {
      setRuntimeDiagnostics(null);
      return;
    }
    const sync = beginSync("runtime-diagnostics");
    setRuntimeDiagnosticsLoading(true);
    try {
      const payload = await controlRequest<RuntimeDiagnostics>("/diagnostics");
      if (!canCommitSync(sync)) return;
      setRuntimeDiagnostics(payload);
    } catch {
      if (!canCommitSync(sync)) return;
      setRuntimeDiagnostics(null);
    } finally {
      if (isCurrentSync(sync)) setRuntimeDiagnosticsLoading(false);
    }
  }, [beginSync, bridgeOnline, canCommitSync, isCurrentSync]);

  const refreshSoundCloudCredentials = useCallback(async () => {
    try {
      setSoundCloudCredentialsStored(await invoke<boolean>("soundcloud_credentials_status"));
    } catch {
      // Browser preview and non-native hosts do not expose the OS vault.
      setSoundCloudCredentialsStored(null);
    }
  }, []);

  useEffect(() => {
    void refreshSoundCloudCredentials();
  }, [refreshSoundCloudCredentials]);

  const saveSoundCloudCredentials = useCallback(async (clientId: string, clientSecret: string) => {
    setSoundCloudCredentialsLoading(true);
    try {
      await invoke("set_soundcloud_credentials", { clientId, clientSecret });
      setSoundCloudCredentialsStored(true);
      showToast("Đã lưu credential SoundCloud trong Windows Credential Manager. Khởi động lại bot để áp dụng.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể lưu credential SoundCloud an toàn.");
    } finally {
      setSoundCloudCredentialsLoading(false);
    }
  }, []);

  const clearSoundCloudCredentials = useCallback(async () => {
    setSoundCloudCredentialsLoading(true);
    try {
      await invoke("clear_soundcloud_credentials");
      setSoundCloudCredentialsStored(false);
      showToast("Đã xoá credential SoundCloud khỏi Windows Credential Manager.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể xoá credential SoundCloud.");
    } finally {
      setSoundCloudCredentialsLoading(false);
    }
  }, []);

  const toggleSoundCloud = useCallback(async (enabled: boolean) => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi đổi trạng thái SoundCloud.");
      return;
    }
    try {
      await controlRequest<{ provider: string; enabled: boolean; configured: boolean }>("/providers/soundcloud", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      await refreshProviders();
      showToast(enabled ? "Đã bật SoundCloud" : "Đã tắt SoundCloud");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể đổi trạng thái SoundCloud.");
    }
  }, [bridgeOnline, refreshProviders]);

  const testSoundCloud = useCallback(async () => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi kiểm tra SoundCloud.");
      return;
    }
    try {
      await controlRequest<{ provider: string; enabled: boolean; configured: boolean; connected: boolean }>("/providers/soundcloud/test", {
        method: "POST",
      });
      showToast("Kết nối SoundCloud official thành công.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể kiểm tra kết nối SoundCloud.");
    }
  }, [bridgeOnline]);

  const refreshOllama = useCallback(async () => {
    if (!bridgeOnline) {
      setOllamaSettings(defaultOllamaSettings);
      setOllamaHealth(defaultOllamaHealth);
      return;
    }
    setOllamaLoading(true);
    try {
      const payload = await controlRequest<{ settings: OllamaSettings; health: OllamaHealth }>("/ollama");
      setOllamaSettings(payload.settings);
      setOllamaHealth(payload.health);
    } catch (error) {
      setOllamaSettings(defaultOllamaSettings);
      setOllamaHealth({ status: "offline", reachable: false, modelAvailable: null });
      showToast(error instanceof Error ? error.message : "Không thể tải cấu hình Ollama.");
    } finally {
      setOllamaLoading(false);
    }
  }, [bridgeOnline]);

  const updateOllama = useCallback(async (patch: Partial<OllamaSettings>) => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi đổi cấu hình Ollama.");
      return;
    }
    setOllamaLoading(true);
    try {
      const payload = await controlRequest<{ settings: OllamaSettings; health: OllamaHealth }>("/ollama/settings", {
        method: "POST",
        body: JSON.stringify(patch),
      });
      setOllamaSettings(payload.settings);
      setOllamaHealth(payload.health);
      showToast("Đã lưu cấu hình Ollama.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể lưu cấu hình Ollama.");
    } finally {
      setOllamaLoading(false);
    }
  }, [bridgeOnline]);

  const checkOllama = useCallback(async () => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi kiểm tra Ollama.");
      return;
    }
    setOllamaLoading(true);
    try {
      const payload = await controlRequest<{ health: OllamaHealth }>("/ollama/health", { method: "POST" });
      setOllamaHealth(payload.health);
      showToast(payload.health.status === "ready" ? "Ollama sẵn sàng với model đã chọn." : `Ollama: ${payload.health.status}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể kiểm tra Ollama.");
    } finally {
      setOllamaLoading(false);
    }
  }, [bridgeOnline]);

  const requestOllamaSuggestion = useCallback(async () => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi yêu cầu gợi ý Ollama.");
      return;
    }
    if (!ollamaSuggestionQuery.trim()) {
      showToast("Nhập câu hỏi ngắn trước khi yêu cầu gợi ý.");
      return;
    }
    setOllamaSuggestionLoading(true);
    setOllamaSuggestion(null);
    try {
      const payload = await controlRequest<OllamaSuggestion>("/ollama/suggest", {
        method: "POST",
        body: JSON.stringify({ query: ollamaSuggestionQuery.trim(), surface: ollamaSuggestionSurface }),
      });
      setOllamaSuggestion(payload);
      showToast("Đã nhận gợi ý đọc-only từ Ollama.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể nhận gợi ý Ollama.");
    } finally {
      setOllamaSuggestionLoading(false);
    }
  }, [bridgeOnline, ollamaSuggestionQuery, ollamaSuggestionSurface]);

  const exportBackup = useCallback(async () => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi tạo backup local.");
      return;
    }
    try {
      const response = await fetch(`${CONTROL_BASE}/data/export`, { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể tạo backup từ dữ liệu local hiện tại.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `localbot-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      showToast("Đã tạo backup local không chứa credential.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tạo backup local.");
    }
  }, [bridgeOnline]);

  const restoreBackup = useCallback(async (file: File) => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi khôi phục backup local.");
      return;
    }
    let backup: unknown;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      showToast("File backup không phải JSON hợp lệ.");
      return;
    }
    if (!window.confirm("Khôi phục backup sẽ thay thế 9 kho dữ liệu local hiện tại. LocalBot sẽ giữ một recovery copy và cần khởi động lại bot. Tiếp tục?")) return;
    try {
      const result = await controlRequest<{ stores: string[]; restartRequired: boolean; recoveryFile: string }>("/data/restore", {
        method: "POST",
        body: JSON.stringify({ confirm: true, backup }),
      });
      setRestorePending(result.restartRequired);
      showToast(`Đã khôi phục ${result.stores.length} kho dữ liệu. Nhấn khởi động lại bot để áp dụng.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể khôi phục backup local.");
    }
  }, [bridgeOnline]);

  const refreshAuditLog = useCallback(async (guildId: string, filters: { action?: string; search?: string } = {}) => {
    if (!bridgeOnline || !guildId) {
      setAuditEntries([]);
      return;
    }
    const sync = beginSync("audit", guildId);
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ limit: "12", guildId });
      if (filters.action) params.set("action", filters.action);
      if (filters.search) params.set("search", filters.search);
      const payload = await controlRequest<{ entries: AuditEntry[] }>(`/audit-log?${params.toString()}`);
      if (!canCommitSync(sync)) return;
      setAuditEntries(payload.entries);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải audit log.");
    } finally {
      if (isCurrentSync(sync)) setAuditLoading(false);
    }
  }, [bridgeOnline]);

  const refreshDiscordAuditLog = useCallback(async (guildId: string) => {
    if (!bridgeOnline || !guildId) {
      setDiscordAuditEntries(null);
      setDiscordAuditError(null);
      return;
    }
    const sync = beginSync("discord-audit", guildId);
    setDiscordAuditLoading(true);
    setDiscordAuditError(null);
    try {
      const payload = await controlRequest<{ entries: DiscordAuditEntry[] }>(`/guilds/${encodeURIComponent(guildId)}/audit-log/discord?limit=30`);
      if (!canCommitSync(sync)) return;
      setDiscordAuditEntries(payload.entries);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      const message = error instanceof Error ? error.message : "Không thể tải audit log Discord.";
      setDiscordAuditEntries(null);
      setDiscordAuditError(message);
      showToast(message);
    } finally {
      if (isCurrentSync(sync)) setDiscordAuditLoading(false);
    }
  }, [bridgeOnline]);

  const refreshAuditSettings = useCallback(async () => {
    if (!bridgeOnline) {
      setAuditSettings({ retentionDays: null, maxEntries: 2_000 });
      return;
    }
    const sync = beginSync("audit-settings");
    setAuditSettingsLoading(true);
    try {
      const payload = await controlRequest<AuditLogSettings>("/audit-log/settings");
      if (!canCommitSync(sync)) return;
      setAuditSettings(payload);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tải policy audit log.");
    } finally {
      if (isCurrentSync(sync)) setAuditSettingsLoading(false);
    }
  }, [bridgeOnline]);

  const updateAuditSettings = useCallback(async (retentionDays: number | null) => {
    if (!bridgeOnline) {
      showToast("Hãy bật bot runtime trước khi đổi policy audit log.");
      return;
    }
    setAuditSettingsLoading(true);
    try {
      const payload = await controlRequest<AuditLogSettings>("/audit-log/settings", {
        method: "POST",
        body: JSON.stringify({ retentionDays }),
      });
      setAuditSettings(payload);
      if (selectedGuildId) await refreshAuditLog(selectedGuildId);
      showToast(retentionDays === null ? "Đã tắt giới hạn theo ngày cho audit log." : `Đã lưu policy giữ audit log ${retentionDays} ngày.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể lưu policy audit log.");
    } finally {
      setAuditSettingsLoading(false);
    }
  }, [bridgeOnline, refreshAuditLog, selectedGuildId]);

  const exportAuditLog = useCallback(async (guildId: string, filters: { action?: string; search?: string }, format: "json" | "csv") => {
    if (!bridgeOnline || !guildId) {
      showToast("Hãy bật bot runtime và chọn guild trước khi xuất audit log.");
      return;
    }
    setAuditExportLoading(true);
    try {
      const params = new URLSearchParams({ guildId, limit: "100", format });
      if (filters.action) params.set("action", filters.action);
      if (filters.search) params.set("search", filters.search);
      await downloadControlFile(`/audit-log/export?${params.toString()}`, `localbot-audit-log.${format}`);
      showToast(`Đã xuất audit log local dạng ${format.toUpperCase()}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể xuất audit log local.");
    } finally {
      setAuditExportLoading(false);
    }
  }, [bridgeOnline]);

  const playerAction = useCallback(async (action: PlayerAction, body: Record<string, unknown> = {}) => {
    if (!bridgeOnline || !selectedGuildId) return null;
    const guildId = selectedGuildId;
    const sync = beginSync("action:player", guildId);
    try {
      const payload = await controlRequest<{ player: BackendPlayer | null }>(`/guilds/${encodeURIComponent(guildId)}/player/action`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      });
      if (!canCommitSync(sync)) return null;
      setNativePlayer(payload.player);
      return payload.player;
    } catch (error) {
      if (!canCommitSync(sync)) return null;
      showToast(error instanceof Error ? error.message : "Không thể điều khiển player.");
      return null;
    }
  }, [bridgeOnline, selectedGuildId]);

  const queueAction = useCallback(async (action: QueueAction, body: Record<string, unknown> = {}) => {
    if (!bridgeOnline || !selectedGuildId) return null;
    const guildId = selectedGuildId;
    const sync = beginSync("action:queue", guildId);
    const route = action === "remove" ? "remove" : action === "move" ? "move" : "clear";
    try {
      const payload = await controlRequest<{ player: BackendPlayer | null }>(`/guilds/${encodeURIComponent(guildId)}/player/queue/${route}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!canCommitSync(sync)) return null;
      setNativePlayer(payload.player);
      return payload.player;
    } catch (error) {
      if (!canCommitSync(sync)) return null;
      showToast(error instanceof Error ? error.message : "Không thể cập nhật hàng đợi.");
      return null;
    }
  }, [bridgeOnline, selectedGuildId]);

  const localQueueAction = useCallback(async (action: QueueAction, body: Record<string, unknown> = {}) => {
    if (action === "remove") {
      const position = typeof body.position === "number" ? body.position : 0;
      setLocalQueue((current) => current.filter((_, index) => index !== position - 1));
    } else if (action === "move") {
      const from = typeof body.from === "number" ? body.from - 1 : -1;
      const to = typeof body.to === "number" ? body.to - 1 : -1;
      setLocalQueue((current) => {
        if (from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
        const next = [...current];
        const [track] = next.splice(from, 1);
        if (!track) return current;
        next.splice(to, 0, track);
        return next;
      });
    } else {
      setLocalQueue([]);
    }
    return null;
  }, []);

  const refreshBotStatus = useCallback(async () => {
    try {
      const status = await invoke<BotRuntimeStatus>("bot_status");
      setBotManaged(status.managed);
      setBotOwnerId(status.ownerId);
      setBotRecoveryState(status.recoveryState);
      setBotRestartAttempt(status.restartAttempt);
      setBotProcessSupported(true);
    } catch {
      // Tauri IPC is available only in the native window. The browser
      // companion can show control state, but it must never own the bot
      // process or receive credentials.
      setBotProcessSupported(false);
      setBotRecoveryState("stable");
      setBotRestartAttempt(0);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("localbot-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (selectedGuildId) window.localStorage.setItem("localbot-guild-id", selectedGuildId);
  }, [selectedGuildId]);

  useEffect(() => {
    window.localStorage.setItem("localbot-output-mode", JSON.stringify(outputMode));
  }, [outputMode]);

  useEffect(() => {
    let active = true;
    const probe = async () => {
      try {
        const response = await fetch(`${CONTROL_BASE}/health`, { cache: "no-store" });
        const payload = response.ok ? await response.json() as { status?: string; runtimeOwnerId?: string | null } : null;
        if (active) {
          setBridgeReachable(response.ok && payload?.status === "ready");
          setBridgeOwnerId(payload?.runtimeOwnerId ?? null);
        }
      } catch {
        if (active) {
          setBridgeReachable(false);
          setBridgeOwnerId(null);
        }
      }
    };
    void probe();
    const interval = window.setInterval(() => { void probe(); }, 5_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    void refreshBotStatus();
    const interval = window.setInterval(() => { void refreshBotStatus(); }, 2_000);
    return () => window.clearInterval(interval);
  }, [refreshBotStatus]);

  useEffect(() => {
    void invoke<NativeRuntimeInfo>("native_runtime_info")
      .then(setNativeRuntimeInfo)
      .catch(() => setNativeRuntimeInfo(null));
  }, []);

  useEffect(() => {
    if (bridgeOnline) void refreshProviders();
  }, [bridgeOnline, refreshProviders]);

  useEffect(() => {
    void refreshRuntimeDiagnostics();
    if (!bridgeOnline) return;
    const interval = window.setInterval(() => { void refreshRuntimeDiagnostics(); }, 10_000);
    return () => window.clearInterval(interval);
  }, [bridgeOnline, refreshRuntimeDiagnostics]);

  useEffect(() => {
    void refreshOllama();
  }, [refreshOllama]);

  useEffect(() => {
    if (!bridgeOnline) {
      setGuilds([]);
      selectGuild("");
      setVoiceChannels([]);
      setSelectedVoiceChannelId("");
      setMusicReadiness(null);
      setMusicReadinessError(null);
      return;
    }
    void refreshGuilds();
    const interval = window.setInterval(() => { void refreshGuilds(true); }, 3_000);
    return () => window.clearInterval(interval);
  }, [bridgeOnline, refreshGuilds]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId) {
      setVoiceChannels([]);
      return;
    }
    void refreshVoiceChannels(selectedGuildId);
    const interval = window.setInterval(() => { void refreshVoiceChannels(selectedGuildId, true); }, 2_500);
    return () => window.clearInterval(interval);
  }, [bridgeOnline, refreshVoiceChannels, selectedGuildId]);

  useEffect(() => {
    const connectedVoiceChannelId = guilds.find((guild) => guild.id === selectedGuildId)?.botVoiceChannel?.id;
    if (!selectedGuildId || !connectedVoiceChannelId || selectedVoiceChannelId) return;
    setSelectedVoiceChannelId(connectedVoiceChannelId);
  }, [guilds, selectedGuildId, selectedVoiceChannelId]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId || !selectedVoiceChannelId) {
      setMusicReadiness(null);
      setMusicReadinessError(null);
      setMusicReadinessLoading(false);
      return;
    }
    void refreshMusicReadiness(selectedGuildId, selectedVoiceChannelId);
    const interval = window.setInterval(() => { void refreshMusicReadiness(selectedGuildId, selectedVoiceChannelId, true); }, 2_500);
    return () => window.clearInterval(interval);
  }, [bridgeOnline, refreshMusicReadiness, selectedGuildId, selectedVoiceChannelId]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId) {
      setNativePlayer(null);
      setPlaying(false);
      return;
    }
    void refreshPlayer(selectedGuildId);
    const interval = window.setInterval(() => { void refreshPlayer(selectedGuildId, true); }, 4_000);
    return () => window.clearInterval(interval);
  }, [bridgeOnline, refreshPlayer, selectedGuildId]);

  useEffect(() => {
    if (bridgeOnline) return;
    const audio = localAudioRef.current;
    localSessionRef.current += 1;
    audio?.pause();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    localTrackKeyRef.current = null;
    setLocalCurrentTrack(null);
    setLocalHistory([]);
    setLocalQueue([]);
    setLocalPosition(0);
    setLocalDuration(0);
    setPlaying(false);
  }, [bridgeOnline]);

  useEffect(() => {
    const audio = localAudioRef.current;
    if (!audio) return;
    const onError = () => {
      if (!localTrackKeyRef.current) return;
      localSessionRef.current += 1;
      localTrackKeyRef.current = null;
      setLocalCurrentTrack(null);
      setLocalPosition(0);
      setLocalDuration(0);
      setOutputMode((current) => current.windows ? { ...current, windows: false } : current);
      setToast("Windows output gặp lỗi; Discord vẫn tiếp tục phát độc lập.");
    };
    audio.addEventListener("error", onError);
    return () => audio.removeEventListener("error", onError);
  }, []);

  useEffect(() => {
    let active = true;
    const audio = localAudioRef.current as AudioOutputElement | null;
    const mediaDevices = navigator.mediaDevices;
    const syncOutputDevices = async () => {
      if (!audio?.setSinkId || !mediaDevices?.enumerateDevices) {
        if (active) {
          setAudioOutputSupported(false);
          setAudioOutputDevices([{ deviceId: "default", label: "Thiết bị mặc định của Windows" }]);
        }
        return;
      }
      setAudioOutputLoading(true);
      try {
        const devices = await mediaDevices.enumerateDevices();
        const listed: AudioOutputDevice[] = [{ deviceId: "default", label: "Thiết bị mặc định của Windows" }];
        const seen = new Set(listed.map((device) => device.deviceId));
        for (const device of devices) {
          if (device.kind !== "audiooutput" || seen.has(device.deviceId)) continue;
          seen.add(device.deviceId);
          listed.push({ deviceId: device.deviceId, label: device.label.trim() || "Thiết bị âm thanh" });
        }
        if (!active) return;
        setAudioOutputSupported(true);
        setAudioOutputDevices(listed);
        const storedId = window.localStorage.getItem("localbot-audio-output-device") || "default";
        if (listed.some((device) => device.deviceId === storedId)) {
          await audio!.setSinkId!(storedId);
        } else {
          await audio!.setSinkId!("default");
          setAudioOutputDeviceId("default");
          window.localStorage.setItem("localbot-audio-output-device", "default");
        }
      } catch {
        if (active) {
          setAudioOutputSupported(true);
          setAudioOutputDevices([{ deviceId: "default", label: "Thiết bị mặc định của Windows" }]);
          setAudioOutputDeviceId("default");
          window.localStorage.setItem("localbot-audio-output-device", "default");
        }
      } finally {
        if (active) setAudioOutputLoading(false);
      }
    };
    void syncOutputDevices();
    const onDeviceChange = () => { void syncOutputDevices(); };
    mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => {
      active = false;
      mediaDevices?.removeEventListener("devicechange", onDeviceChange);
    };
  }, []);

  const changeAudioOutput = useCallback(async (deviceId: string) => {
    const audio = localAudioRef.current as AudioOutputElement | null;
    if (!audio?.setSinkId || audioOutputSupported !== true) {
      showToast("WebView hiện tại không hỗ trợ chọn thiết bị Windows; đang dùng thiết bị mặc định.");
      return;
    }
    try {
      await audio.setSinkId(deviceId);
      setAudioOutputDeviceId(deviceId);
      window.localStorage.setItem("localbot-audio-output-device", deviceId);
      showToast(deviceId === "default" ? "Đã dùng thiết bị mặc định của Windows" : "Đã đổi thiết bị Windows");
    } catch {
      showToast("Không thể dùng thiết bị này; Windows output vẫn giữ thiết bị hiện tại.");
    }
  }, [audioOutputSupported]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId) return;
    const streamGuildId = selectedGuildId;
    const source = new EventSource(`${CONTROL_BASE}/guilds/${encodeURIComponent(streamGuildId)}/player/events`);
    source.onmessage = (event) => {
      if (!bridgeOnlineRef.current || selectedGuildIdRef.current !== streamGuildId) return;
      try {
        const payload = JSON.parse(event.data) as { player?: BackendPlayer | null };
        if (payload.player !== undefined) {
          setNativePlayer(payload.player);
          markFresh("player");
        }
      } catch {
        // Ignore malformed event frames; polling remains the safety net.
      }
    };
    return () => source.close();
  }, [bridgeOnline, markFresh, selectedGuildId]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId) return;
    const streamGuildId = selectedGuildId;
    const source = new EventSource(`${CONTROL_BASE}/guilds/${encodeURIComponent(streamGuildId)}/events`);
    source.onmessage = (event) => {
      if (!bridgeOnlineRef.current || selectedGuildIdRef.current !== streamGuildId) return;
      try {
        const payload = JSON.parse(event.data) as { guild?: GuildSummary; channels?: VoiceChannelSummary[] };
        if (payload.guild) {
          setGuilds((current) => current.map((guild) => guild.id === payload.guild!.id ? payload.guild! : guild));
          markFresh("guilds");
        }
        if (payload.channels) {
          setVoiceChannels(payload.channels);
          markFresh("voice");
        }
      } catch {
        // Ignore malformed event frames; polling remains the safety net.
      }
    };
    return () => source.close();
  }, [bridgeOnline, markFresh, selectedGuildId]);

  useEffect(() => {
    if (!selectedGuildId) return;
    setCommunityOffset(0);
    setCommunityMember(null);
    setNativePlayer(null);
    void refreshPlayer(selectedGuildId, true);
    void refreshPlaylists(selectedGuildId);
    void refreshEqualizer(selectedGuildId);
    void refreshMusicAccess(selectedGuildId);
    void refreshCommunity(selectedGuildId, 0);
    void refreshGreetings(selectedGuildId);
    void refreshTextChannels(selectedGuildId);
    void refreshGuildRoles(selectedGuildId);
    void refreshGuildPermissions(selectedGuildId);
    setMemberDirectory({ members: [], intentEnabled: false, complete: false, source: "cache" });
    setMemberDirectoryLoading(false);
    void refreshAutoMod(selectedGuildId);
    void refreshAuditLog(selectedGuildId);
    void refreshAuditSettings();
  }, [refreshAuditLog, refreshAuditSettings, refreshAutoMod, refreshCommunity, refreshEqualizer, refreshGuildPermissions, refreshGuildRoles, refreshGreetings, refreshMusicAccess, refreshPlayer, refreshPlaylists, refreshTextChannels, selectedGuildId]);

  useEffect(() => {
    setDiscordAuditEntries(null);
    setDiscordAuditError(null);
  }, [bridgeOnline, selectedGuildId]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId) return;
    const interval = window.setInterval(() => { void refreshCommunity(selectedGuildId, communityOffset); void refreshAuditLog(selectedGuildId); void refreshAuditSettings(); }, 15_000);
    return () => window.clearInterval(interval);
  }, [bridgeOnline, communityOffset, refreshAuditLog, refreshAuditSettings, refreshCommunity, selectedGuildId]);

  useEffect(() => {
    if (!bridgeOnline || !selectedGuildId) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchResults(null);
    setSearchLoading(false);
  }, [bridgeOnline, selectedGuildId]);

  useEffect(() => {
    if (!nativePlayer) return;
    setPlaying(nativePlayer.status === "playing" || nativePlayer.status === "buffering");
    setVolume(nativePlayer.volumePercent);
    setMuted(nativePlayer.volumePercent === 0);
    setShuffle(nativePlayer.shuffle);
    setRepeatMode(nativePlayer.repeatMode);
  }, [nativePlayer]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (!playbackAvailableRef.current) return;
      if (event.code === "Space" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPlaying((value) => !value);
        void musicActionRef.current(playing ? "pause" : "resume");
        setToast(playing ? "Đã tạm dừng" : "Đang tiếp tục phát");
      } else if (event.key.toLowerCase() === "n") {
        void musicActionRef.current("skip");
        setToast("Đã chuyển bài tiếp theo");
      } else if (event.key.toLowerCase() === "p") {
        void musicActionRef.current("previous");
        setToast("Đã phát bài trước");
      } else if (event.key.toLowerCase() === "s") {
        setShuffle((value) => !value);
        void musicActionRef.current("shuffle");
        setToast("Đã đổi chế độ phát ngẫu nhiên");
      } else if (event.key.toLowerCase() === "r") {
        const nextRepeat = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
        setRepeatMode(nextRepeat);
        void musicActionRef.current("repeat", { mode: nextRepeat });
        setToast("Đã đổi chế độ lặp");
      } else if (event.key.toLowerCase() === "m") {
        setMuted((value) => !value);
        void musicActionRef.current("volume", { percent: muted ? volume : 0 });
        setToast(muted ? "Đã bật âm lượng" : "Đã tắt âm lượng");
      } else if (event.key === "[" || event.key === "]") {
        const nextVolume = Math.min(100, Math.max(0, volume + (event.key === "]" ? 5 : -5)));
        setVolume(nextVolume);
        setMuted(false);
        void musicActionRef.current("volume", { percent: nextVolume });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [muted, playing, playerAction, repeatMode, volume]);

  const currentTrack = nativePlayer?.current ? toUiTrack(nativePlayer.current) : null;
  playbackAvailableRef.current = Boolean(currentTrack || localCurrentTrack);
  const displayedCurrentTrack = outputMode.windows && !outputMode.discord && localCurrentTrack ? localCurrentTrack : currentTrack;
  const queueTracks = outputMode.windows && !outputMode.discord ? localQueue : nativePlayer ? nativePlayer.queue.map((track, index) => toUiTrack(track, index)) : [];
  const displayedPosition = outputMode.windows && !outputMode.discord && localCurrentTrack
    ? localPosition
    : nativePlayer?.positionSeconds ?? 0;
  const displayedDuration = outputMode.windows && !outputMode.discord && localCurrentTrack && localDuration > 0
    ? localDuration
    : nativePlayer?.durationSeconds ?? (displayedCurrentTrack ? durationToSeconds(displayedCurrentTrack.duration) : 0);
  const recentTracks = useMemo(() => {
    const tracks = [
      ...localHistory,
      ...(nativePlayer?.history ?? []).map((track, index) => toUiTrack(track, index)),
      ...(nativePlayer?.current ? [toUiTrack(nativePlayer.current)] : []),
    ];
    const seen = new Set<string>();
    return tracks.filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    }).slice(0, 8);
  }, [localHistory, nativePlayer]);
  const playLocalTrack = useCallback(async (track: Track): Promise<boolean> => {
    if (!bridgeOnline || !track.url) {
      throw new Error("Windows output cần bot runtime online và track có URL hợp lệ.");
    }
    const audio = localAudioRef.current;
    if (!audio) throw new Error("Native audio element chưa sẵn sàng.");
    const sessionId = ++localSessionRef.current;
    const audioPath = selectedGuildId
      ? `/guilds/${encodeURIComponent(selectedGuildId)}/local-audio`
      : "/local-audio";
    const guildQuery = selectedGuildId ? `&guildId=${encodeURIComponent(selectedGuildId)}` : "";
    audio.src = `${CONTROL_BASE}${audioPath}?url=${encodeURIComponent(track.url)}${guildQuery}`;
    audio.volume = (muted ? 0 : volume) / 100;
    setLocalPosition(0);
    setLocalDuration(0);
    try {
      await audio.play();
    } catch (error) {
      if (sessionId === localSessionRef.current) {
        localTrackKeyRef.current = null;
        setLocalCurrentTrack(null);
        setLocalPosition(0);
        setLocalDuration(0);
      }
      throw error;
    }
    if (sessionId !== localSessionRef.current) return false;
    localTrackKeyRef.current = `${track.provider}:${track.id}`;
    setLocalCurrentTrack(track);
    setLocalHistory((current) => [track, ...current.filter((item) => item.id !== track.id)].slice(0, 8));
    return true;
  }, [bridgeOnline, muted, selectedGuildId, volume]);

  const localPlayerAction = useCallback(async (action: PlayerAction, body: Record<string, unknown> = {}) => {
    const audio = localAudioRef.current;
    if (!audio) return;
    if (action === "pause") {
      audio.pause();
      return;
    }
    if (action === "resume") {
      try { await audio.play(); } catch { showToast("Windows audio chưa được trình phát cho phép."); }
      return;
    }
    if (action === "stop") {
      localSessionRef.current += 1;
      audio.pause();
      audio.currentTime = 0;
      localTrackKeyRef.current = null;
      setLocalCurrentTrack(null);
      setLocalQueue([]);
      setLocalPosition(0);
      setLocalDuration(0);
      return;
    }
    if (action === "volume") {
      const percent = typeof body.percent === "number" ? body.percent : volume;
      audio.volume = Math.min(1, Math.max(0, percent / 100));
      return;
    }
    if (action === "previous") {
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
        setLocalPosition(0);
      } else if (localCurrentTrack) {
        await playLocalTrack(localCurrentTrack);
      }
      return;
    }
    if (action === "skip") {
      const candidates = [...localQueue];
      if (candidates.length > 0) {
        const nextIndex = shuffle && candidates.length > 1 ? Math.floor(Math.random() * candidates.length) : 0;
        const [next] = candidates.splice(nextIndex, 1);
        if (next) {
          setLocalQueue(repeatMode === "all" && localCurrentTrack ? [...candidates, localCurrentTrack] : candidates);
          await playLocalTrack(next);
          setPlaying(true);
        }
      } else if (repeatMode === "one" && localCurrentTrack) {
        await playLocalTrack(localCurrentTrack);
      } else if (repeatMode === "all" && localCurrentTrack) {
        await playLocalTrack(localCurrentTrack);
      } else {
        audio.pause();
        setPlaying(false);
      }
    }
  }, [localCurrentTrack, localQueue, playLocalTrack, repeatMode, showToast, shuffle, volume]);

  useEffect(() => {
    const audio = localAudioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setLocalPosition(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const onLoadedMetadata = () => setLocalDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => {
      if (repeatMode === "one" && localCurrentTrack) {
        audio.currentTime = 0;
        void audio.play().catch(() => setPlaying(false));
        return;
      }
      const candidates = [...localQueue];
      if (candidates.length > 0) {
        const nextIndex = shuffle && candidates.length > 1 ? Math.floor(Math.random() * candidates.length) : 0;
        const [next] = candidates.splice(nextIndex, 1);
        if (!next) return;
        setLocalQueue(repeatMode === "all" && localCurrentTrack ? [...candidates, localCurrentTrack] : candidates);
        void playLocalTrack(next).catch((error) => showToast(error instanceof Error ? error.message : "Không thể phát bài tiếp theo."));
        return;
      }
      if (repeatMode === "all" && localCurrentTrack) {
        void playLocalTrack(localCurrentTrack).catch(() => setPlaying(false));
        return;
      }
      setPlaying(false);
      setLocalPosition(0);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [localCurrentTrack, localQueue, playLocalTrack, repeatMode, showToast, shuffle]);

  const seekLocal = useCallback((seconds: number) => {
    const audio = localAudioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || seconds, seconds));
    setLocalPosition(audio.currentTime);
  }, []);
  const musicAction = useCallback(async (action: PlayerAction, body: Record<string, unknown> = {}): Promise<PlayerActionResult> => {
    const discordPromise = outputMode.discord ? playerAction(action, body) : Promise.resolve(null);
    const localPromise = outputMode.windows ? localPlayerAction(action, body) : Promise.resolve();
    const [discordResult, localResult] = await Promise.allSettled([discordPromise, localPromise]);
    const discordPlayer = discordResult.status === "fulfilled" ? discordResult.value : null;
    const discordOk = !outputMode.discord || Boolean(discordPlayer);
    let windowsOk = !outputMode.windows || localResult.status === "fulfilled";

    if (outputMode.windows && (action === "skip" || action === "previous") && discordPlayer?.current && localResult.status === "fulfilled") {
      try {
        windowsOk = await playLocalTrack(toUiTrack(discordPlayer.current));
      } catch {
        windowsOk = false;
      }
    }

    if (localResult.status === "rejected" || !windowsOk) {
      setOutputMode((current) => current.windows ? { ...current, windows: false } : current);
      setToast("Windows output gặp lỗi; Discord vẫn tiếp tục phát độc lập.");
    }
    if (discordResult.status === "rejected") {
      setToast("Discord output gặp lỗi; Windows vẫn tiếp tục phát độc lập.");
    }

    return { ok: discordOk || windowsOk, discord: discordPlayer, windows: windowsOk };
  }, [localPlayerAction, outputMode.discord, outputMode.windows, playLocalTrack, playerAction]);
  musicActionRef.current = musicAction;
  const pageTitle = page === "overview" ? "Tổng quan" : page === "music" ? "Âm nhạc" : page === "community" ? "Cộng đồng" : "Cài đặt";
  const activeContext = page === "music" ? musicTab : "discover";
  const motionTransition = { duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] as const };

  function showToast(message: string) {
    setToast(message);
  }

  const toggleBot = useCallback(async () => {
    if (!botProcessSupported) {
      showToast("Điều khiển bot chỉ khả dụng trong cửa sổ native Tauri.");
      return;
    }
    if (bridgeReachable && !botManaged) {
      showToast("Port 2901 đang do tiến trình ngoài native sử dụng; hãy dừng tiến trình đó rồi bật LocalBot từ đây.");
      return;
    }

    const action = botManaged ? "stop_bot" : "start_bot";
    setBotBusy(botManaged ? "stop" : "start");
    try {
      const status = await invoke<BotRuntimeStatus>(action);
      setBotManaged(status.managed);
      setBotRecoveryState(status.recoveryState);
      setBotRestartAttempt(status.restartAttempt);
      showToast(status.managed ? "Đã bật bot · đang chờ Discord và Control API" : "Đã dừng bot runtime");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể thay đổi trạng thái bot runtime.");
      await refreshBotStatus();
    } finally {
      setBotBusy(null);
    }
  }, [botManaged, botProcessSupported, bridgeReachable, refreshBotStatus]);

  const restartBotForRestore = useCallback(async () => {
    if (!botProcessSupported || !botManaged) {
      showToast("Hãy bật bot runtime native trước khi áp dụng backup.");
      return;
    }
    setBotBusy("stop");
    try {
      await invoke<BotRuntimeStatus>("stop_bot");
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      setBotBusy("start");
      const status = await invoke<BotRuntimeStatus>("start_bot");
      setBotManaged(status.managed);
      setBotRecoveryState(status.recoveryState);
      setBotRestartAttempt(status.restartAttempt);
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          const response = await fetch(`${CONTROL_BASE}/health`, { cache: "no-store" });
          const payload = response.ok ? await response.json() as { status?: string } : null;
          if (payload?.status === "ready") {
            ready = true;
            break;
          }
        } catch {
          // The bridge is expected to be briefly unavailable during restart.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      await refreshBotStatus();
      if (ready) {
        setRestorePending(false);
        showToast("Bot đã khởi động lại và nạp backup local thành công.");
      } else {
        showToast("Bot đã được khởi động lại nhưng chưa báo Ready; dữ liệu sẽ được đồng bộ khi runtime sẵn sàng.");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể khởi động lại bot để áp dụng backup.");
      await refreshBotStatus();
    } finally {
      setBotBusy(null);
    }
  }, [botManaged, botProcessSupported, refreshBotStatus]);

  function navigate(nextPage: Page) {
    setPage(nextPage);
    if (nextPage !== "music") setMusicTab("discover");
    setMenuOpen(false);
  }

  function navigateMusic(tab: MusicTab) {
    setPage("music");
    setMusicTab(tab);
    setMenuOpen(false);
  }

  const visibleGuilds = bridgeOnline ? guilds : [];
  const selectedGuild = visibleGuilds.find((guild) => guild.id === selectedGuildId) ?? visibleGuilds[0] ?? null;
  const connectedVoiceChannel = selectedGuild?.botVoiceChannel ?? null;
  const musicTargetChannelId = selectedVoiceChannelId || connectedVoiceChannel?.id || "";
  const selectVoiceChannel = useCallback((channelId: string) => {
    selectedVoiceChannelIdRef.current = channelId;
    setSelectedVoiceChannelId(channelId);
    setMusicReadiness(null);
    setMusicReadinessError(null);
  }, []);

  const runNativeSearch = useCallback(async (query: string, source: SearchSource = searchSource) => {
    if (!bridgeOnline) return false;
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setSearchResults([]);
      showToast("Hãy nhập từ khóa tìm nhạc.");
      return false;
    }
    const guildId = selectedGuildId || undefined;
    const sync = beginSync("search", guildId);
    setSearchLoading(true);
    try {
      const searchPath = guildId
        ? `/guilds/${encodeURIComponent(guildId)}/media/search`
        : "/media/search";
      const payload = await controlRequest<{ tracks: BackendTrack[] }>(searchPath, {
        method: "POST",
        body: JSON.stringify({ query: cleanQuery, source }),
      });
      if (!canCommitSync(sync)) return false;
      setSearchResults(payload.tracks.map((track, index) => toUiTrack(track, index)));
      setSearchSubmitted(cleanQuery);
      const sourceLabel = source === "all" ? "các nguồn đã bật" : source === "youtube" ? "YouTube" : "SoundCloud";
      showToast(`Đã tải ${payload.tracks.length} kết quả từ ${sourceLabel}`);
      return true;
    } catch (error) {
      if (!canCommitSync(sync)) return false;
      setSearchResults([]);
      showToast(error instanceof Error ? error.message : "Không thể tìm nhạc từ các nguồn đã bật.");
      return false;
    } finally {
      if (isCurrentSync(sync)) setSearchLoading(false);
    }
  }, [bridgeOnline, searchSource, selectedGuildId]);

  useEffect(() => {
    if (bridgeOnline && selectedGuildId && searchSubmitted) {
      void runNativeSearch(searchSubmitted, searchSource);
    }
  }, [bridgeOnline, runNativeSearch, searchSource, selectedGuildId]);

  const enqueueDiscordTrack = useCallback(async (track: Track) => {
    if (!bridgeOnline || !selectedGuild || !musicTargetChannelId) {
      throw new Error("Discord output cần Control API online và voice channel đã chọn.");
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:player-play", guildId);
    const payload = await controlRequest<{ player: BackendPlayer | null }>(`/guilds/${encodeURIComponent(guildId)}/player/play`, {
      method: "POST",
      body: JSON.stringify({ voiceChannelId: musicTargetChannelId, query: track.url ?? track.title, source: track.provider }),
    });
    if (!canCommitSync(sync)) return null;
    setNativePlayer(payload.player);
    return payload.player;
  }, [bridgeOnline, musicTargetChannelId, selectedGuild]);

  const playTrack = useCallback(async (track: Track) => {
    if (!outputMode.discord && !outputMode.windows) {
      showToast("Hãy chọn ít nhất một đích phát.");
      return;
    }
    if (outputMode.discord && (!bridgeOnline || !selectedGuild)) {
      setMusicContextOpen(true);
      showToast("Discord output cần Control API đang online.");
      return;
    }
    const channelId = musicTargetChannelId;
    if (outputMode.discord && !channelId) {
      setMusicContextOpen(true);
      showToast("Hãy chọn guild và voice channel trong Music trước khi phát Discord.");
      return;
    }
    if (outputMode.discord) {
      const readiness = musicReadiness;
      if (!readiness || readiness.channel.id !== channelId || musicReadinessLoading) {
        setMusicContextOpen(true);
        showToast("Đang kiểm tra readiness của voice channel; hãy xác nhận lại trước khi phát.");
        return;
      }
      if (readiness.readiness !== "ready") {
        setMusicContextOpen(true);
        showToast(readiness.readiness === "missing_permission"
          ? `Voice channel đang thiếu quyền: ${readiness.missing.join(", ")}.`
          : readiness.readiness === "unsupported" ? "Stage channel chưa được hỗ trợ cho Music." : "Chưa xác định được quyền voice channel; hãy thử làm mới.");
        return;
      }
    }
    const guildId = outputMode.discord ? selectedGuild?.id : undefined;
    const sync = guildId ? beginSync("action:play-track", guildId) : null;
    const discordPromise = outputMode.discord && selectedGuild && channelId
      ? enqueueDiscordTrack(track)
      : Promise.resolve(null);
    const windowsPromise = outputMode.windows
      ? playLocalTrack(track)
      : Promise.resolve();
    const [discordResult, windowsResult] = await Promise.allSettled([discordPromise, windowsPromise]);
    if (sync && !canCommitSync(sync)) return;
    const discordOk = !outputMode.discord || (discordResult.status === "fulfilled" && Boolean(discordResult.value));
    const windowsOk = !outputMode.windows || (windowsResult.status === "fulfilled" && windowsResult.value === true);

    if (discordResult.status === "rejected") {
      setOutputMode((current) => current.discord ? { ...current, discord: false } : current);
    }
    if (windowsResult.status === "rejected") {
      setOutputMode((current) => current.windows ? { ...current, windows: false } : current);
    }

    if (discordOk || windowsOk) {
      setPlaying(true);
      if (discordOk && windowsOk) {
        showToast(`Đã phát ${track.title} trên ${outputMode.discord && outputMode.windows ? "Discord + Windows" : outputMode.discord ? "Discord" : "Windows"}`);
      } else if (discordOk) {
        showToast(`Đã phát ${track.title} trên Discord · Windows output gặp lỗi`);
      } else {
        showToast(`Đã phát ${track.title} trên Windows · Discord output gặp lỗi`);
      }
      return;
    }
    showToast("Không thể phát track trên các output đã chọn.");
  }, [bridgeOnline, enqueueDiscordTrack, musicReadiness, musicReadinessLoading, musicTargetChannelId, outputMode.discord, outputMode.windows, playLocalTrack, selectedGuild]);

  const queueTrack = useCallback(async (track: Track) => {
    if (outputMode.windows && !outputMode.discord) {
      if (!localCurrentTrack) {
        await playLocalTrack(track);
      } else {
        setLocalQueue((current) => [...current, track]);
        showToast(`Đã thêm ${track.title} vào hàng đợi Windows`);
      }
      return;
    }
    await playTrack(track);
  }, [localCurrentTrack, outputMode.discord, outputMode.windows, playLocalTrack, playTrack]);

  const toggleOutput = useCallback((target: keyof OutputMode) => {
    if (!outputMode[target]) {
      if (target === "discord" && (!bridgeOnline || !selectedGuild || !musicTargetChannelId)) {
        setMusicContextOpen(true);
        showToast("Hãy bật bot runtime và chọn voice channel trước khi bật Discord output.");
        return;
      }
      if (target === "discord" && (!musicReadiness || musicReadiness.channel.id !== musicTargetChannelId || musicReadiness.readiness !== "ready")) {
        setMusicContextOpen(true);
        showToast("Hãy chọn một voice channel có readiness Sẵn sàng trước khi bật Discord output.");
        return;
      }
      const guildId = target === "discord" ? selectedGuild?.id : undefined;
      const sync = beginSync("action:output-toggle", guildId);
      void (async () => {
        try {
          if (target === "windows" && currentTrack?.url && !await playLocalTrack(currentTrack)) throw new Error("Windows output đã bị thay thế bởi một phiên phát mới.");
          if (target === "discord" && localCurrentTrack) {
            const player = await enqueueDiscordTrack(localCurrentTrack);
            if (!player) return;
          }
          if (!isCurrentSync(sync) || (target === "discord" && !bridgeOnlineRef.current)) return;
          setOutputMode((current) => ({ ...current, [target]: true }));
        } catch (error) {
          if (!isCurrentSync(sync) || (target === "discord" && !bridgeOnlineRef.current)) return;
          showToast(error instanceof Error ? error.message : `Không thể bật ${target === "discord" ? "Discord" : "Windows"} output.`);
        }
      })();
      return;
    }
    if (outputMode.discord && outputMode.windows) {
      setOutputMode((current) => ({ ...current, [target]: false }));
      if (target === "windows") {
        void localPlayerAction("stop");
      } else {
        void playerAction("stop");
      }
      return;
    }
    showToast("Hãy giữ lại ít nhất một đích phát.");
  }, [bridgeOnline, currentTrack, enqueueDiscordTrack, localCurrentTrack, musicReadiness, musicTargetChannelId, outputMode, playLocalTrack, playerAction, selectedGuild]);

  useEffect(() => {
    if (!outputMode.windows || !nativePlayer?.current) return;
    const key = `${nativePlayer.current.provider}:${nativePlayer.current.id}`;
    if (localTrackKeyRef.current === key) return;
    void playLocalTrack(toUiTrack(nativePlayer.current)).catch(() => {
      setOutputMode((current) => current.windows ? { ...current, windows: false } : current);
      setToast("Không thể đồng bộ Windows output; Discord vẫn tiếp tục phát độc lập.");
    });
  }, [nativePlayer, outputMode.windows, playLocalTrack]);

  const updateMusicAccess = useCallback(async (action: "mode" | "add" | "remove", body: Record<string, unknown>) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi cấu hình quyền Music.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:music-access", guildId);
    try {
      const payload = await controlRequest<{ permissions: MusicAccess }>(`/guilds/${encodeURIComponent(guildId)}/music-access`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      });
      if (!canCommitSync(sync)) return;
      setMusicAccess(payload.permissions);
      showToast(action === "mode" ? "Đã cập nhật chế độ quyền Music" : action === "add" ? "Đã thêm user vào allow-list" : "Đã thu hồi quyền Music");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể cập nhật quyền Music.");
    }
  }, [bridgeOnline, selectedGuild]);

  const registerCommands = useCallback(async () => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Control API chưa online · hãy khởi động bot runtime trước.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:register-commands", guildId);
    setCommandsBusy(true);
    try {
      const result = await controlRequest<{ message: string; count: number }>("/commands/register", {
        method: "POST",
        body: JSON.stringify({ guildId }),
      });
      if (!canCommitSync(sync)) return;
      showToast(`${result.message} (${result.count} lệnh)`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể đăng ký slash command.");
    } finally {
      if (isCurrentSync(sync)) setCommandsBusy(false);
    }
  }, [bridgeOnline, selectedGuild]);

  const createPlaylist = useCallback(async (name: string, description: string) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi tạo playlist.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-create", guildId);
    try {
      await controlRequest(`/guilds/${encodeURIComponent(guildId)}/playlists/create`, { method: "POST", body: JSON.stringify({ name, description }) });
      if (!canCommitSync(sync)) return;
      await refreshPlaylists(guildId);
      if (!canCommitGuild(guildId)) return;
      showToast(`Đã tạo playlist ${name}`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tạo playlist.");
    }
  }, [bridgeOnline, refreshPlaylists, selectedGuild]);

  const deletePlaylist = useCallback(async (name: string) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi xóa playlist.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-delete", guildId);
    try {
      await controlRequest(`/guilds/${encodeURIComponent(guildId)}/playlists/delete`, { method: "POST", body: JSON.stringify({ name }) });
      if (!canCommitSync(sync)) return;
      await refreshPlaylists(guildId);
      if (!canCommitGuild(guildId)) return;
      showToast(`Đã xóa playlist ${name}`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể xóa playlist.");
    }
  }, [bridgeOnline, refreshPlaylists, selectedGuild]);

  const updatePlaylist = useCallback(async (currentName: string, name: string, description: string): Promise<BackendPlaylist | null> => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi sửa playlist.");
      return null;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-update", guildId);
    try {
      const payload = await controlRequest<{ playlist: BackendPlaylist }>(`/guilds/${encodeURIComponent(guildId)}/playlists/update`, {
        method: "POST",
        body: JSON.stringify({ currentName, name, description }),
      });
      if (!canCommitSync(sync)) return null;
      await refreshPlaylists(guildId);
      if (!canCommitGuild(guildId)) return null;
      showToast(`Đã cập nhật playlist ${name}`);
      return payload.playlist;
    } catch (error) {
      if (!canCommitSync(sync)) return null;
      showToast(error instanceof Error ? error.message : "Không thể cập nhật playlist.");
      return null;
    }
  }, [bridgeOnline, refreshPlaylists, selectedGuild]);

  const addTrackToPlaylist = useCallback(async (name: string, query: string, source: Provider) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi thêm track vào playlist.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-add", guildId);
    try {
      await controlRequest(`/guilds/${encodeURIComponent(guildId)}/playlists/add`, {
        method: "POST",
        body: JSON.stringify({ name, query, source }),
      });
      if (!canCommitSync(sync)) return;
      await refreshPlaylists(guildId);
      if (!canCommitGuild(guildId)) return;
      showToast("Đã thêm track vào playlist");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể thêm track vào playlist.");
    }
  }, [bridgeOnline, refreshPlaylists, selectedGuild]);

  const removeTrackFromPlaylist = useCallback(async (name: string, position: number) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi sửa playlist.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-remove", guildId);
    try {
      await controlRequest(`/guilds/${encodeURIComponent(guildId)}/playlists/remove`, {
        method: "POST",
        body: JSON.stringify({ name, position }),
      });
      if (!canCommitSync(sync)) return;
      await refreshPlaylists(guildId);
      if (!canCommitGuild(guildId)) return;
      showToast("Đã xóa track khỏi playlist");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể xóa track khỏi playlist.");
    }
  }, [bridgeOnline, refreshPlaylists, selectedGuild]);

  const moveTrackInPlaylist = useCallback(async (name: string, from: number, to: number) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi sắp xếp playlist.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-move", guildId);
    try {
      await controlRequest(`/guilds/${encodeURIComponent(guildId)}/playlists/move`, {
        method: "POST",
        body: JSON.stringify({ name, from, to }),
      });
      if (!canCommitSync(sync)) return;
      await refreshPlaylists(guildId);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể sắp xếp track trong playlist.");
    }
  }, [bridgeOnline, refreshPlaylists, selectedGuild]);

  const playPlaylist = useCallback(async (name: string) => {
    const channelId = musicTargetChannelId;
    if (!bridgeOnline || !selectedGuild || !channelId) {
      setMusicContextOpen(true);
      showToast("Hãy bật Control API và chọn voice channel trước khi phát playlist.");
      return;
    }
    if (!musicReadiness || musicReadiness.channel.id !== channelId || musicReadiness.readiness !== "ready") {
      setMusicContextOpen(true);
      showToast("Voice channel chưa sẵn sàng để phát playlist.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:playlist-play", guildId);
    try {
      const payload = await controlRequest<{ player: BackendPlayer | null }>(`/guilds/${encodeURIComponent(guildId)}/playlists/play`, { method: "POST", body: JSON.stringify({ name, voiceChannelId: channelId }) });
      if (!canCommitSync(sync)) return;
      setNativePlayer(payload.player);
      showToast(`Đã xếp playlist ${name} vào hàng đợi`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể phát playlist.");
    }
  }, [bridgeOnline, musicReadiness, musicTargetChannelId, selectedGuild]);

  const saveEqualizer = useCallback(async (settings: EqualizerSettings) => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi lưu Equalizer.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:equalizer", guildId);
    try {
      const payload = await controlRequest<{ settings: EqualizerSettings }>(`/guilds/${encodeURIComponent(guildId)}/equalizer`, { method: "POST", body: JSON.stringify(settings) });
      if (!canCommitSync(sync)) return;
      setEqualizer(payload.settings);
      showToast("Đã lưu Equalizer cho guild");
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể lưu Equalizer.");
    }
  }, [bridgeOnline, selectedGuild]);

  const applyEqualizerPreset = useCallback(async (preset: "flat" | "focus" | "warm") => {
    if (!bridgeOnline || !selectedGuild) {
      showToast("Hãy bật bot runtime và chọn guild trước khi áp dụng preset.");
      return;
    }
    const guildId = selectedGuild.id;
    const sync = beginSync("action:equalizer-preset", guildId);
    try {
      const payload = await controlRequest<{ settings: EqualizerSettings }>(`/guilds/${encodeURIComponent(guildId)}/equalizer`, { method: "POST", body: JSON.stringify({ preset }) });
      if (!canCommitSync(sync)) return;
      setEqualizer(payload.settings);
      showToast(`Đã áp dụng preset ${preset}`);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể áp dụng preset Equalizer.");
    }
  }, [bridgeOnline, selectedGuild]);

  async function joinVoiceChannel(channel: VoiceChannelSummary) {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Hãy bật bot runtime và chọn guild trước khi tham gia voice channel.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:voice-join", guildId);
    setVoiceBusy(channel.id);
    try {
      const payload = await controlRequest<{ guild: GuildSummary; channel: VoiceChannelSummary; player: BackendPlayer | null }>(`/guilds/${encodeURIComponent(guildId)}/voice/join`, {
        method: "POST",
        body: JSON.stringify({ channelId: channel.id }),
      });
      if (!canCommitSync(sync)) return;
      setGuilds((current) => current.map((guild) => guild.id === payload.guild.id ? payload.guild : guild));
      selectGuild(payload.guild.id);
      setSelectedVoiceChannelId(payload.channel.id);
      setVoiceChannels((current) => current.map((voiceChannel) => ({ ...voiceChannel, botJoined: voiceChannel.id === payload.channel.id })));
      setNativePlayer(payload.player);
      showToast(`Đã tham gia ${channel.name}`);
      void Promise.all([refreshGuilds(true), refreshVoiceChannels(guildId, true)]);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể tham gia voice channel.");
    } finally {
      if (isCurrentSync(sync)) setVoiceBusy(null);
    }
  }

  async function leaveVoiceChannel() {
    if (!bridgeOnline || !selectedGuildId) {
      showToast("Hãy bật bot runtime và chọn guild trước khi rời voice channel.");
      return;
    }
    const guildId = selectedGuildId;
    const sync = beginSync("action:voice-leave", guildId);
    setVoiceBusy("leave");
    try {
      const payload = await controlRequest<{ guild: GuildSummary; player: null }>(`/guilds/${encodeURIComponent(guildId)}/voice/leave`, { method: "POST" });
      if (!canCommitSync(sync)) return;
      setGuilds((current) => current.map((guild) => guild.id === payload.guild.id ? payload.guild : guild));
      setVoiceChannels((current) => current.map((channel) => ({ ...channel, botJoined: false })));
      setSelectedVoiceChannelId("");
      setMusicReadiness(null);
      setNativePlayer(null);
      showToast("LocalBot đã rời voice channel");
      void Promise.all([refreshGuilds(true), refreshVoiceChannels(guildId, true)]);
    } catch (error) {
      if (!canCommitSync(sync)) return;
      showToast(error instanceof Error ? error.message : "Không thể rời voice channel.");
    } finally {
      if (isCurrentSync(sync)) setVoiceBusy(null);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      setSearchResults([]);
      showToast("Hãy nhập từ khóa tìm nhạc.");
      return;
    }
    setSearchSubmitted(query);
    if (await runNativeSearch(query)) return;
    setSearchResults(null);
    if (!bridgeOnline) showToast("Hãy bật bot runtime để tìm nhạc thật.");
  }

  return (
    <div className="app-shell">
      <audio ref={localAudioRef} className="native-audio" preload="none" aria-hidden="true" />
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand-lockup">
          <img className="brand-logo brand-logo-dark" src="/logo-white.png" alt="LocalBot" />
          <img className="brand-logo brand-logo-light" src="/logo-black.png" alt="LocalBot" />
          <span className="brand-name">LocalBot</span>
          <span className="dev-badge">Native dev</span>
        </div>
        <div className="titlebar-meta">
          <span className={`bridge-state ${bridgeOnline ? "is-online" : ""}`}><span className="state-dot" />{bridgeOnline ? "Control online" : "Control offline"}</span>
          <span className="shortcut-hint"><span className="keycap">?</span> Phím tắt</span>
        </div>
      </header>

      <div className="workspace">
        <div className={`floating-navigation ${menuOpen ? "is-open" : ""}`} onMouseEnter={() => setMenuOpen(true)} onMouseLeave={() => setMenuOpen(false)}>
          <IconButton label={menuOpen ? "Đóng menu chính" : "Mở menu chính"} className="menu-trigger" onClick={() => setMenuOpen((value) => !value)}><Menu size={21} strokeWidth={1.6} /></IconButton>
          <AnimatePresence>
            {menuOpen && (
              <motion.nav className="primary-menu" aria-label="Điều hướng chính" initial={{ opacity: 0, x: -10, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -10, scale: 0.98 }} transition={motionTransition}>
                <div className="menu-brand"><img src="/logo-white.png" alt="" /><span>LocalBot</span></div>
                {navItems.map((item) => {
                  const ItemIcon = item.icon;
                  return <button key={item.id} type="button" className={`primary-menu-item ${page === item.id ? "is-active" : ""}`} onClick={() => navigate(item.id)}><ItemIcon size={16} strokeWidth={1.7} /><span>{item.label}</span>{item.id === "music" && <span className="menu-live-mark">Live</span>}</button>;
                })}
                <span className="menu-separator" />
                <button type="button" className="primary-menu-item" onClick={() => navigate("settings")}><Settings2 size={16} strokeWidth={1.7} /><span>Cài đặt</span></button>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>

        <div className="navigation-rail">
          <motion.div className="context-navigation" animate={{ y: menuOpen ? 68 : 0 }} transition={motionTransition}>
            <div className="context-page-label"><span className="context-kicker">LOCALBOT</span><strong>{pageTitle}</strong></div>
            {page === "music" && <nav className="context-tabs" aria-label="Điều hướng Âm nhạc">
              {contextItems.map((item) => {
                const ItemIcon = item.icon;
                return <button key={item.id} type="button" className={`context-tab ${activeContext === item.id ? "is-active" : ""}`} onClick={() => navigateMusic(item.id)}><ItemIcon size={15} strokeWidth={1.7} /><span>{item.label}</span></button>;
              })}
            </nav>}
          </motion.div>

           <div className="top-actions">
             <span className={`bridge-state compact ${bridgeOnline ? "is-online" : ""}`}><span className="state-dot" />Local</span>
             <ThemeToggle theme={theme} setTheme={setTheme} />
             <IconButton label="Mở cài đặt" onClick={() => navigate("settings")}><Settings2 size={18} strokeWidth={1.7} /></IconButton>
           </div>
         </div>

         <div className="freshness-bar" aria-label="Trạng thái đồng bộ dữ liệu">
           <span className="freshness-caption"><Activity size={13} strokeWidth={1.8} /> Đồng bộ</span>
           <FreshnessBadge label="Guild" state={freshness.guilds} available={bridgeOnline} busy={guildsLoading} onRetry={() => { void refreshGuilds(); }} />
           <FreshnessBadge label="Voice" state={freshness.voice} available={bridgeOnline && Boolean(selectedGuildId)} busy={channelsLoading} onRetry={() => { if (selectedGuildId) void refreshVoiceChannels(selectedGuildId); }} />
           <FreshnessBadge label="Player" state={freshness.player} available={bridgeOnline && Boolean(selectedGuildId)} busy={false} onRetry={() => { if (selectedGuildId) void refreshPlayer(selectedGuildId); }} />
           <FreshnessBadge label="Nguồn" state={freshness.providers} available={bridgeOnline} busy={providersLoading} onRetry={() => { void refreshProviders(); }} />
         </div>

         <main className="content" id="main-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${page}-${musicTab}`} initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }} transition={motionTransition}>
              {page === "overview" && <Overview search={search} setSearch={setSearch} submitSearch={submitSearch} currentTrack={currentTrack} selectedGuild={selectedGuild} recentTracks={recentTracks} queueTracks={queueTracks} playlists={playlists} playlistsLoading={playlistsLoading} navigateMusic={navigateMusic} bridgeOnline={bridgeOnline} playing={playing} positionSeconds={displayedPosition} durationSeconds={displayedDuration} onPlayTrack={playTrack} />}
              {page === "music" && <MusicPage tab={musicTab} search={search} setSearch={setSearch} searchSubmitted={searchSubmitted} searchSource={searchSource} setSearchSource={setSearchSource} submitSearch={submitSearch} currentTrack={displayedCurrentTrack} queueTracks={queueTracks} searchResults={searchResults} searchLoading={searchLoading} playing={playing} setPlaying={setPlaying} volume={volume} setVolume={setVolume} muted={muted} setMuted={setMuted} shuffle={shuffle} setShuffle={setShuffle} repeatMode={repeatMode} setRepeatMode={setRepeatMode} showToast={showToast} navigateMusic={navigateMusic} onPlayTrack={playTrack} onQueueTrack={queueTrack} playerAction={musicAction} queueAction={queueAction} localMode={outputMode.windows && !outputMode.discord} localQueueAction={localQueueAction} onRefreshQueue={() => selectedGuild && !(outputMode.windows && !outputMode.discord) ? refreshPlayer(selectedGuild.id) : Promise.resolve()} guilds={visibleGuilds} selectedGuildId={selectedGuildId} selectedGuild={selectedGuild} voiceChannels={voiceChannels} selectedVoiceChannelId={selectedVoiceChannelId} musicReadiness={musicReadiness} musicReadinessLoading={musicReadinessLoading} musicReadinessError={musicReadinessError} onOpenContext={() => setMusicContextOpen(true)} outputMode={outputMode} onToggleOutput={toggleOutput} audioOutputDevices={audioOutputDevices} audioOutputDeviceId={audioOutputDeviceId} audioOutputSupported={audioOutputSupported} audioOutputLoading={audioOutputLoading} onAudioOutputChange={changeAudioOutput} playlists={playlists} playlistsLoading={playlistsLoading} onCreatePlaylist={createPlaylist} onDeletePlaylist={deletePlaylist} onUpdatePlaylist={updatePlaylist} onAddTrackToPlaylist={addTrackToPlaylist} onRemoveTrackFromPlaylist={removeTrackFromPlaylist} onMoveTrackInPlaylist={moveTrackInPlaylist} onPlayPlaylist={playPlaylist} equalizer={equalizer} equalizerLoading={equalizerLoading} onSaveEqualizer={saveEqualizer} onApplyEqualizerPreset={applyEqualizerPreset} localPlayback={outputMode.windows && !outputMode.discord && Boolean(localCurrentTrack)} positionSeconds={displayedPosition} durationSeconds={displayedDuration} onSeek={seekLocal} providers={providers} providersLoading={providersLoading} />}
              {page === "community" && <CommunityPage guilds={visibleGuilds} selectedGuildId={selectedGuild?.id ?? ""} setSelectedGuildId={selectGuild} selectedGuild={selectedGuild} voiceChannels={voiceChannels} textChannels={textChannels} guildRoles={guildRoles} guildRolesLoading={guildRolesLoading} guildPermissions={guildPermissions} guildPermissionsLoading={guildPermissionsLoading} onRefreshGuildPermissions={() => { if (selectedGuild) void refreshGuildPermissions(selectedGuild.id); }} memberDirectory={memberDirectory} memberDirectoryLoading={memberDirectoryLoading} onSearchMembers={(query) => { if (selectedGuild) void searchGuildMembers(selectedGuild.id, query); }} guildsLoading={guildsLoading} channelsLoading={channelsLoading} voiceBusy={voiceBusy} commandsBusy={commandsBusy} bridgeOnline={bridgeOnline} refresh={() => { void Promise.all([refreshGuilds(), refreshAuditSettings(), selectedGuild ? refreshVoiceChannels(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshTextChannels(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshGuildRoles(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshGuildPermissions(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshCommunity(selectedGuild.id, communityOffset) : Promise.resolve(), selectedGuild ? refreshGreetings(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshAutoMod(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshMusicAccess(selectedGuild.id) : Promise.resolve(), selectedGuild ? refreshAuditLog(selectedGuild.id) : Promise.resolve()]); }} onJoin={joinVoiceChannel} onLeave={leaveVoiceChannel} onRegisterCommands={registerCommands} leaderboard={communityLeaderboard} communityLoading={communityLoading} communitySettings={communitySettings} communityOffset={communityOffset} communityHasMore={communityHasMore} onUpdateCommunitySettings={updateCommunitySettings} onLeaderboardPage={moveCommunityPage} communityMember={communityMember} communityMemberLoading={communityMemberLoading} onInspectCommunityMember={inspectCommunityMember} onResetCommunity={resetCommunity} musicAccess={musicAccess} musicAccessLoading={musicAccessLoading} onUpdateMusicAccess={updateMusicAccess} auditEntries={auditEntries} auditLoading={auditLoading} onRefreshAudit={(filters) => { if (selectedGuild) void refreshAuditLog(selectedGuild.id, filters); }} discordAuditEntries={discordAuditEntries} discordAuditLoading={discordAuditLoading} discordAuditError={discordAuditError} onRefreshDiscordAudit={() => { if (selectedGuild) void refreshDiscordAuditLog(selectedGuild.id); }} auditSettings={auditSettings} auditSettingsLoading={auditSettingsLoading} onUpdateAuditSettings={updateAuditSettings} auditExportLoading={auditExportLoading} onExportAudit={(filters, format) => { if (selectedGuild) void exportAuditLog(selectedGuild.id, filters, format); }} greetingSettings={greetingSettings} greetingsIntentEnabled={greetingsIntentEnabled} greetingsLoading={greetingsLoading} onUpdateGreeting={updateGreeting} onPreviewGreeting={previewGreeting} onTestSendGreeting={testSendGreeting} automodSettings={automodSettings} automodCapabilities={automodCapabilities} automodLoading={automodLoading} onRefreshAutoMod={() => { if (selectedGuild) void refreshAutoMod(selectedGuild.id); }} onUpdateAutoMod={updateAutoMod} onRecoverAutoMod={recoverAutoMod} automodReviews={automodReviews} automodReviewLoading={automodReviewLoading} automodReviewError={automodReviewError} onRefreshAutoModReview={(status) => { if (selectedGuild) void refreshAutoModReview(selectedGuild.id, status); }} onDecideAutoModReview={decideAutoModReview} />}
              {page === "settings" && <SettingsPageWithVault theme={theme} setTheme={setTheme} bridgeOnline={bridgeOnline} botProcessSupported={botProcessSupported} showToast={showToast} nativeRuntimeInfo={nativeRuntimeInfo} runtimeDiagnostics={runtimeDiagnostics} runtimeDiagnosticsLoading={runtimeDiagnosticsLoading} onRefreshRuntimeDiagnostics={refreshRuntimeDiagnostics} providers={providers} providersLoading={providersLoading} soundCloudCredentialsStored={soundCloudCredentialsStored} soundCloudCredentialsLoading={soundCloudCredentialsLoading} onRefreshSoundCloudCredentials={refreshSoundCloudCredentials} onSaveSoundCloudCredentials={saveSoundCloudCredentials} onClearSoundCloudCredentials={clearSoundCloudCredentials} ollamaSettings={ollamaSettings} ollamaHealth={ollamaHealth} ollamaLoading={ollamaLoading} onUpdateOllama={updateOllama} onCheckOllama={checkOllama} ollamaSuggestion={ollamaSuggestion} ollamaSuggestionQuery={ollamaSuggestionQuery} setOllamaSuggestionQuery={setOllamaSuggestionQuery} ollamaSuggestionSurface={ollamaSuggestionSurface} setOllamaSuggestionSurface={setOllamaSuggestionSurface} ollamaSuggestionLoading={ollamaSuggestionLoading} onRequestOllamaSuggestion={requestOllamaSuggestion} onExportBackup={exportBackup} onRestoreBackup={restoreBackup} restorePending={restorePending} onRestartBot={restartBotForRestore} restartBusy={botBusy !== null} onToggleSoundCloud={toggleSoundCloud} onTestSoundCloud={testSoundCloud} />}
            </motion.div>
         </AnimatePresence>
       </main>

       <footer className="sticky-footer" aria-label="Điều khiển LocalBot">
         <div className="sticky-footer-inner">
           <button type="button" className="server-context-trigger" onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label="Chọn guild và phòng nghe" title="Chọn guild và phòng nghe">
             <span className="server-context-icon"><Server size={15} strokeWidth={1.8} /></span>
             <span className="server-context-copy"><strong>{selectedGuild?.name ?? "Chọn guild"}</strong><small>{selectedGuild?.botVoiceChannel?.name ?? "Chọn phòng nghe"}</small></span>
             <ChevronDown size={14} strokeWidth={1.8} />
           </button>
           <BotRuntimeToggle bridgeOnline={bridgeOnline} bridgeReachable={bridgeReachable} managed={botManaged} recoveryState={botRecoveryState} restartAttempt={botRestartAttempt} busy={botBusy} supported={botProcessSupported} onToggle={() => { void toggleBot(); }} />
         </div>
       </footer>

       <AnimatePresence>
           {toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={motionTransition}><span className="toast-icon"><Check size={16} strokeWidth={2} /></span><span>{toast}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setToast(null)}><X size={15} /></button></motion.div>}
           <GuildVoicePicker open={pickerOpen} onClose={() => setPickerOpen(false)} guilds={visibleGuilds} selectedGuildId={selectedGuild?.id ?? ""} setSelectedGuildId={selectGuild} selectedGuild={selectedGuild} voiceChannels={voiceChannels} guildsLoading={guildsLoading} channelsLoading={channelsLoading} voiceBusy={voiceBusy} bridgeOnline={bridgeOnline} onJoin={joinVoiceChannel} onLeave={leaveVoiceChannel} />
           <MusicContextPicker open={musicContextOpen} onClose={() => setMusicContextOpen(false)} guilds={visibleGuilds} selectedGuildId={selectedGuildId} setSelectedGuildId={selectGuild} selectedGuild={selectedGuild} voiceChannels={voiceChannels} selectedVoiceChannelId={selectedVoiceChannelId} onSelectVoiceChannel={selectVoiceChannel} readiness={musicReadiness} readinessLoading={musicReadinessLoading} readinessError={musicReadinessError} onRefreshReadiness={() => { if (selectedGuildId && selectedVoiceChannelId) void refreshMusicReadiness(selectedGuildId, selectedVoiceChannelId); }} guildsLoading={guildsLoading} channelsLoading={channelsLoading} bridgeOnline={bridgeOnline} />
        </AnimatePresence>
      </div>
    </div>
  );
}

function ThemeToggle({ theme, setTheme }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void }) {
  return <div className="theme-toggle" role="group" aria-label="Chọn giao diện">
    {themeOptions.map((option) => {
      const ThemeIcon = option.icon;
      return <button key={option.id} type="button" className={theme === option.id ? "is-active" : ""} aria-label={`Giao diện ${option.label}`} title={option.label} onClick={() => setTheme(option.id)}><ThemeIcon size={16} strokeWidth={1.7} /></button>;
    })}
  </div>;
}

function FreshnessBadge({ label, state, available, busy, onRetry }: { label: string; state: FreshnessState; available: boolean; busy?: boolean; onRetry: () => void }) {
  if (!available) {
    return <span className="freshness-item is-muted"><span className="state-dot" />{label}: offline</span>;
  }
  const age = state.updatedAt === null ? Number.POSITIVE_INFINITY : Date.now() - state.updatedAt;
  const stale = age > 12_000;
  const status = state.error ? "Lỗi đồng bộ" : state.updatedAt === null ? "Chờ đồng bộ" : stale ? "Dữ liệu cũ" : "Đã đồng bộ";
  const detail = state.error ?? (state.updatedAt ? `lúc ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(state.updatedAt)}` : "chưa có lần cập nhật thành công");
  return <span className={`freshness-item ${state.error ? "is-error" : stale ? "is-stale" : "is-fresh"}`} title={`${label}: ${detail}`} aria-live="polite"><span className="state-dot" />{label}: {status}{(state.error || stale || state.updatedAt === null) && <button type="button" className="freshness-retry" onClick={onRetry} disabled={busy} aria-label={`Làm mới ${label}`} title={`Làm mới ${label}`}><RefreshCw size={12} className={busy ? "is-spinning" : ""} /></button>}</span>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function SearchBar({ value, setValue, onSubmit, compact = false }: { value: string; setValue: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; compact?: boolean }) {
  return <form className={`search-bar ${compact ? "search-bar-compact" : ""}`} onSubmit={onSubmit}><Search size={18} strokeWidth={1.7} /><input aria-label="Tìm kiếm nhạc" value={value} onChange={(event) => setValue(event.currentTarget.value)} placeholder="Tìm track, album, nghệ sĩ..." /><button type="submit">Tìm nhạc</button></form>;
}

type CommunityPageProps = {
  guilds: GuildSummary[];
  selectedGuildId: string;
  setSelectedGuildId: (id: string) => void;
  selectedGuild: GuildSummary | null;
  voiceChannels: VoiceChannelSummary[];
  textChannels: TextChannelSummary[];
  guildRoles: GuildRoleSummary[];
  guildRolesLoading: boolean;
  guildPermissions: GuildPermissionSummary | null;
  guildPermissionsLoading: boolean;
  onRefreshGuildPermissions: () => void;
  memberDirectory: GuildMemberDirectory;
  memberDirectoryLoading: boolean;
  onSearchMembers: (query: string) => void | Promise<void>;
  guildsLoading: boolean;
  channelsLoading: boolean;
  voiceBusy: string | null;
  commandsBusy: boolean;
  bridgeOnline: boolean;
  refresh: () => void;
  onJoin: (channel: VoiceChannelSummary) => void;
  onLeave: () => void;
  onRegisterCommands: () => void;
  leaderboard: CommunityRank[];
  communityLoading: boolean;
  communitySettings: CommunitySettings;
  communityOffset: number;
  communityHasMore: boolean;
  onUpdateCommunitySettings: (patch: Record<string, unknown>, successMessage?: string) => void | Promise<void>;
  onLeaderboardPage: (offset: number) => void;
  communityMember: CommunityRank | null;
  communityMemberLoading: boolean;
  onInspectCommunityMember: (userId: string) => void | Promise<void>;
  onResetCommunity: () => void | Promise<void>;
  musicAccess: MusicAccess;
  musicAccessLoading: boolean;
  onUpdateMusicAccess: (action: "mode" | "add" | "remove", body: Record<string, unknown>) => void | Promise<void>;
  auditEntries: AuditEntry[];
  auditLoading: boolean;
  onRefreshAudit: (filters: { action?: string; search?: string }) => void;
  discordAuditEntries: DiscordAuditEntry[] | null;
  discordAuditLoading: boolean;
  discordAuditError: string | null;
  onRefreshDiscordAudit: () => void;
  auditSettings: AuditLogSettings;
  auditSettingsLoading: boolean;
  onUpdateAuditSettings: (retentionDays: number | null) => void | Promise<void>;
  auditExportLoading: boolean;
  onExportAudit: (filters: { action?: string; search?: string }, format: "json" | "csv") => void | Promise<void>;
  greetingSettings: GreetingSettings;
  greetingsIntentEnabled: boolean;
  greetingsLoading: boolean;
  onUpdateGreeting: (kind: GreetingKind, template: GreetingTemplate) => void | Promise<void>;
  onPreviewGreeting: (kind: GreetingKind, username: string) => Promise<GreetingPreview | null>;
  onTestSendGreeting: (kind: GreetingKind) => void | Promise<void>;
  automodSettings: AutoModSettings;
  automodCapabilities: AutoModCapabilities;
  automodLoading: boolean;
  onRefreshAutoMod: () => void;
  onUpdateAutoMod: (settings: AutoModSettings) => void | Promise<void>;
  onRecoverAutoMod: () => void | Promise<void>;
  automodReviews: AutoModReviewEntry[];
  automodReviewLoading: boolean;
  automodReviewError: string | null;
  onRefreshAutoModReview: (status: AutoModReviewStatus) => void;
  onDecideAutoModReview: (reviewId: string, decision: "confirm" | "dismiss", note: string) => void | Promise<void>;
};

function GuildPermissionsPanel({ selectedGuild, summary, loading, bridgeOnline, onRefresh }: { selectedGuild: GuildSummary | null; summary: GuildPermissionSummary | null; loading: boolean; bridgeOnline: boolean; onRefresh: () => void }) {
  const checks: Array<{ key: keyof GuildPermissionSummary["permissions"]; label: string }> = [
    { key: "viewChannel", label: "Xem kênh" },
    { key: "sendMessages", label: "Gửi tin nhắn" },
    { key: "embedLinks", label: "Nhúng link" },
    { key: "connect", label: "Kết nối voice" },
    { key: "speak", label: "Phát âm thanh" },
    { key: "moveMembers", label: "Di chuyển thành viên" },
    { key: "manageMessages", label: "Quản lý tin nhắn" },
    { key: "moderateMembers", label: "Timeout thành viên" },
    { key: "manageRoles", label: "Quản lý role" },
    { key: "manageGuild", label: "Quản lý guild" },
    { key: "viewAuditLog", label: "Xem audit log" },
    { key: "useApplicationCommands", label: "Dùng slash commands" },
  ];
  const granted = summary ? checks.filter(({ key }) => summary.permissions[key] === true).length : 0;
  return <Panel title="Quyền bot trong guild" icon={ShieldCheck} action={<div className="panel-actions"><span className={`status-pill ${summary?.botMemberPresent ? "is-good" : ""}`}>{loading ? "Đang tải…" : summary?.botMemberPresent ? `${granted}/${checks.length} quyền` : "Chưa xác định"}</span><button type="button" className="button button-secondary button-small" onClick={onRefresh} disabled={!bridgeOnline || loading || !selectedGuild}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Kiểm tra</button></div>} className="guild-permissions-panel">
    {!bridgeOnline && <div className="panel-note"><CircleAlert size={14} /> Bật bot runtime để đọc quyền thật từ Discord.</div>}
    {bridgeOnline && !selectedGuild && <EmptyState title="Chưa chọn guild" detail="Chọn một guild để kiểm tra quyền của LocalBot." action="Làm mới" onClick={onRefresh} />}
    {bridgeOnline && selectedGuild && loading && <div className="guild-permissions-grid"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>}
    {bridgeOnline && selectedGuild && !loading && !summary?.botMemberPresent && <EmptyState title="Chưa đọc được bot member" detail="Discord chưa trả về cache thành viên của LocalBot; trạng thái quyền chưa được suy đoán." action="Thử lại" onClick={onRefresh} />}
    {bridgeOnline && selectedGuild && !loading && summary?.botMemberPresent && <>
      <div className="guild-permission-role"><span className="overline">ROLE CAO NHẤT</span><strong>{summary.highestRole?.name ?? "@everyone"}</strong><small>{summary.highestRole ? `Position ${summary.highestRole.position} · ID ${summary.highestRole.id}` : "Không có role quản lý riêng"}</small></div>
      <div className="guild-permissions-grid">{checks.map(({ key, label }) => { const value = summary.permissions[key]; return <div className="guild-permission-item" key={key}><span><strong>{label}</strong><small>{value === true ? "Được cấp" : value === false ? "Thiếu quyền" : "Chưa xác định"}</small></span><span className={`permission-state ${value === true ? "is-granted" : value === false ? "is-denied" : "is-unknown"}`} aria-label={`${label}: ${value === true ? "được cấp" : value === false ? "thiếu quyền" : "chưa xác định"}`}>{value === true ? <Check size={14} /> : <CircleAlert size={14} />}</span></div>; })}</div>
      <p className="panel-note"><ShieldCheck size={14} /> Đây là quyền hiệu lực hiện tại của bot, chỉ đọc. Quyền theo từng voice/text channel vẫn được kiểm tra riêng khi chọn channel.</p>
    </>}
  </Panel>;
}

function CommunityPage({ guilds, selectedGuildId, setSelectedGuildId, selectedGuild, voiceChannels, textChannels, guildRoles, guildRolesLoading, guildPermissions, guildPermissionsLoading, onRefreshGuildPermissions, memberDirectory, memberDirectoryLoading, onSearchMembers, guildsLoading, channelsLoading, voiceBusy, commandsBusy, bridgeOnline, refresh, onJoin, onLeave, onRegisterCommands, leaderboard, communityLoading, communitySettings, communityOffset, communityHasMore, onUpdateCommunitySettings, onLeaderboardPage, communityMember, communityMemberLoading, onInspectCommunityMember, onResetCommunity, musicAccess, musicAccessLoading, onUpdateMusicAccess, auditEntries, auditLoading, onRefreshAudit, discordAuditEntries, discordAuditLoading, discordAuditError, onRefreshDiscordAudit, auditSettings, auditSettingsLoading, onUpdateAuditSettings, auditExportLoading, onExportAudit, greetingSettings, greetingsIntentEnabled, greetingsLoading, onUpdateGreeting, onPreviewGreeting, onTestSendGreeting, automodSettings, automodCapabilities, automodLoading, onRefreshAutoMod, onUpdateAutoMod, onRecoverAutoMod, automodReviews, automodReviewLoading, automodReviewError, onRefreshAutoModReview, onDecideAutoModReview }: CommunityPageProps) {
  const currentChannelId = selectedGuild?.botVoiceChannel?.id ?? null;
  const [auditSearch, setAuditSearch] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditSource, setAuditSource] = useState<"local" | "discord">("local");
  const [auditRetentionDraft, setAuditRetentionDraft] = useState("");
  const [cooldownDraft, setCooldownDraft] = useState("");
  const [xpMultiplierDraft, setXpMultiplierDraft] = useState("1");
  const [roleMultiplierId, setRoleMultiplierId] = useState("");
  const [roleMultiplierValue, setRoleMultiplierValue] = useState("2");
  const [roleRewardId, setRoleRewardId] = useState("");
  const [roleRewardLevel, setRoleRewardLevel] = useState("2");
  const [ignoredChannelId, setIgnoredChannelId] = useState("");
  const [ignoredRoleId, setIgnoredRoleId] = useState("");
  const [exclusionsBusy, setExclusionsBusy] = useState(false);
  useEffect(() => {
    setAuditSearch("");
    setAuditAction("");
    setAuditSource("local");
    setAuditRetentionDraft(auditSettings.retentionDays === null ? "" : String(auditSettings.retentionDays));
    setCooldownDraft(communitySettings.cooldownSeconds === null ? "" : String(communitySettings.cooldownSeconds));
    setXpMultiplierDraft(String(communitySettings.xpMultiplier));
    setRoleMultiplierId("");
    setRoleRewardId("");
    setIgnoredChannelId("");
    setIgnoredRoleId("");
  }, [auditSettings.retentionDays, communitySettings.cooldownSeconds, communitySettings.xpMultiplier, selectedGuildId]);
  const applyAuditFilters = () => onRefreshAudit({ action: auditAction || undefined, search: auditSearch.trim() || undefined });
  const clearAuditFilters = () => {
    setAuditSearch("");
    setAuditAction("");
    onRefreshAudit({});
  };
  const auditCount = auditSource === "local" ? auditEntries.length : discordAuditEntries?.length ?? 0;
  const auditBusy = auditSource === "local" ? auditLoading : discordAuditLoading;
  const updateExclusions = async (patch: Record<string, unknown>, successMessage: string) => {
    setExclusionsBusy(true);
    try {
      await onUpdateCommunitySettings(patch, successMessage);
    } finally {
      setExclusionsBusy(false);
    }
  };
  const addIgnoredChannel = () => {
    const id = ignoredChannelId.trim();
    if (exclusionsBusy || !id || communitySettings.ignoredChannelIds.includes(id)) return;
    void updateExclusions({ ignoredChannelIds: [...communitySettings.ignoredChannelIds, id] }, "Đã thêm channel khỏi tính XP.");
    setIgnoredChannelId("");
  };
  const removeIgnoredChannel = (id: string) => {
    if (exclusionsBusy) return;
    void updateExclusions({ ignoredChannelIds: communitySettings.ignoredChannelIds.filter((value) => value !== id) }, "Đã bỏ channel khỏi danh sách loại trừ.");
  };
  const addIgnoredRole = () => {
    const id = ignoredRoleId.trim();
    if (exclusionsBusy || !id || communitySettings.ignoredRoleIds.includes(id)) return;
    void updateExclusions({ ignoredRoleIds: [...communitySettings.ignoredRoleIds, id] }, "Đã thêm role khỏi tính XP.");
    setIgnoredRoleId("");
  };
  const removeIgnoredRole = (id: string) => {
    if (exclusionsBusy) return;
    void updateExclusions({ ignoredRoleIds: communitySettings.ignoredRoleIds.filter((value) => value !== id) }, "Đã bỏ role khỏi danh sách loại trừ.");
  };
  return <>
    <SectionHeading eyebrow="LOCALBOT · COMMUNITY" title="Guild & voice" description="Xem LocalBot đang ở đâu, chọn một guild và tham gia voice channel trực tiếp từ native app." action={<div className="heading-actions"><button type="button" className="button button-secondary" onClick={refresh} disabled={guildsLoading || channelsLoading || commandsBusy}><RefreshCw size={16} className={guildsLoading || channelsLoading ? "is-spinning" : ""} /> Làm mới</button><button type="button" className="button button-primary" onClick={onRegisterCommands} disabled={!bridgeOnline || !selectedGuild || commandsBusy}><Terminal size={16} className={commandsBusy ? "is-spinning" : ""} /> {commandsBusy ? "Đang đăng ký…" : "Đăng ký slash commands"}</button></div>} />
    {!bridgeOnline && <div className="offline-notice"><CircleAlert size={16} /><span><strong>Control API đang offline.</strong> Bật bot runtime ở sticky footer để tải guild, voice channel và dữ liệu Community thật.</span></div>}
    <div className="community-grid">
      <Panel title="Guild của LocalBot" icon={UsersRound} action={<span className="status-pill">{guilds.length} guild</span>}>
        <div className="guild-list">
          {guildsLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
          {!guildsLoading && guilds.map((guild) => <button type="button" key={guild.id} className={`guild-card ${guild.id === selectedGuildId ? "is-active" : ""}`} aria-pressed={guild.id === selectedGuildId} onClick={() => setSelectedGuildId(guild.id)}>
            <span className="guild-avatar">{guild.icon ? <img src={guild.icon} alt="" width="34" height="34" loading="lazy" /> : <Server size={17} />}</span>
            <span className="guild-card-copy"><strong>{guild.name}</strong><small>{guild.memberCount.toLocaleString("vi-VN")} thành viên</small></span>
            <span className={`guild-voice-state ${guild.botVoiceChannel ? "is-connected" : ""}`}>{guild.botVoiceChannel ? guild.botVoiceChannel.name : "Không ở voice"}</span>
            <ChevronRight size={16} />
          </button>)}
          {!guildsLoading && guilds.length === 0 && <EmptyState title="Chưa có guild" detail="Bot chưa tham gia guild nào hoặc control API chưa sẵn sàng." action="Thử lại" onClick={refresh} />}
        </div>
      </Panel>

      <Panel title="Voice channel" icon={Radio} action={<span className={`status-pill ${currentChannelId ? "is-good" : ""}`}>{currentChannelId ? "Đang tham gia" : "Chưa tham gia"}</span>}>
        {selectedGuild && <div className="voice-panel-intro"><div><span className="overline">GUILD ĐANG CHỌN</span><strong>{selectedGuild.name}</strong></div>{currentChannelId && <button type="button" className="button button-secondary button-small" disabled={voiceBusy !== null} onClick={onLeave}><LogOut size={14} /> Rời kênh</button>}</div>}
        <div className="voice-channel-list">
          {channelsLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
          {!channelsLoading && voiceChannels.map((channel) => {
            const isCurrent = channel.botJoined || channel.id === currentChannelId;
            const unavailable = channel.canConnect === false || channel.canSpeak === false;
            return <button type="button" key={channel.id} className={`voice-channel-card ${isCurrent ? "is-active" : ""}`} disabled={voiceBusy !== null || unavailable} onClick={() => isCurrent ? onLeave() : onJoin(channel)}>
              <span className="voice-channel-icon">{channel.type === "stage" ? <Headphones size={17} /> : <Mic size={17} />}</span>
              <span className="voice-channel-copy"><strong>{channel.name}</strong><small>{channel.category ?? "Không phân loại"} · {channel.type === "stage" ? "Stage" : "Voice"}</small></span>
              <span className="voice-channel-action">{voiceBusy === channel.id ? "Đang kết nối…" : isCurrent ? "Rời kênh" : unavailable ? "Thiếu quyền" : "Tham gia"}</span>
              {isCurrent ? <Check size={16} /> : <ChevronRight size={16} />}
            </button>;
          })}
          {!channelsLoading && voiceChannels.length === 0 && <EmptyState title="Không có voice channel" detail="Guild này chưa có kênh thoại khả dụng cho LocalBot." action="Làm mới" onClick={refresh} />}
        </div>
        <p className="panel-note"><ShieldCheck size={14} /> Quyền Connect và Speak được kiểm tra trước khi tham gia.</p>
      </Panel>
    </div>
    <GuildPermissionsPanel selectedGuild={selectedGuild} summary={guildPermissions} loading={guildPermissionsLoading} bridgeOnline={bridgeOnline} onRefresh={onRefreshGuildPermissions} />
    <div className="community-insights">
      <Panel title="Bảng xếp hạng" icon={Trophy} action={<div className="panel-actions"><span className="status-pill">{communityLoading ? "Đang tải…" : `${leaderboard.length} thành viên`}</span><button type="button" className="button button-secondary button-small" onClick={() => { void onResetCommunity(); }} disabled={!bridgeOnline || communityLoading}><Trash2 size={14} /> Reset XP</button></div>}>
        <div className="community-settings-inline">
          <label><span>Cooldown XP (giây)</span><input type="number" min="0" max="86400" step="1" value={cooldownDraft} onChange={(event) => setCooldownDraft(event.currentTarget.value)} placeholder="Mặc định global" /></label>
          <button type="button" className="button button-primary button-small" onClick={() => { const value = cooldownDraft.trim() === "" ? null : Number(cooldownDraft); void onUpdateCommunitySettings({ cooldownSeconds: value }, value === null ? "Đã dùng cooldown mặc định toàn cục." : `Đã đặt cooldown XP ${value} giây.`); }} disabled={!bridgeOnline || communityLoading}><Check size={14} /> Lưu</button>
          <button type="button" className="button button-secondary button-small" onClick={() => { setCooldownDraft(""); void onUpdateCommunitySettings({ cooldownSeconds: null }, "Đã dùng cooldown mặc định toàn cục."); }} disabled={!bridgeOnline || communityLoading}>Mặc định</button>
        </div>
        <p className="panel-note community-settings-note"><Activity size={14} /> Để trống để dùng cooldown global; nhập 0 để trao XP ở mỗi tin nhắn đủ điều kiện.</p>
        <div className="community-advanced-settings">
          <div className="community-config-card">
            <div className="detail-section-heading"><div><span className="overline">XP BASE</span><strong>Hệ số XP cơ bản</strong></div><span className="status-pill">x{communitySettings.xpMultiplier}</span></div>
            <div className="community-config-form"><input aria-label="Hệ số XP cơ bản" type="number" min="1" max="5" step="1" value={xpMultiplierDraft} onChange={(event) => setXpMultiplierDraft(event.currentTarget.value)} /><button type="button" className="button button-secondary button-small" onClick={() => void onUpdateCommunitySettings({ xpMultiplier: Number(xpMultiplierDraft) }, `Đã đặt XP multiplier x${xpMultiplierDraft}.`)} disabled={!bridgeOnline || communityLoading}><Check size={14} /> Lưu</button></div>
            <small className="field-hint">Giới hạn x1–x5 để tránh tăng XP ngoài kiểm soát.</small>
          </div>
          <div className="community-config-card">
            <div className="detail-section-heading"><div><span className="overline">ROLE MULTIPLIERS</span><strong>Hệ số theo role</strong></div><span className="status-pill">{Object.keys(communitySettings.roleMultipliers).length}/25</span></div>
            <div className="community-config-form community-config-form-wide"><select aria-label="Role cho multiplier" value={roleMultiplierId} onChange={(event) => setRoleMultiplierId(event.currentTarget.value)} disabled={guildRolesLoading}><option value="">{guildRolesLoading ? "Đang tải role…" : "Chọn role"}</option>{guildRoles.map((role) => <option value={role.id} key={role.id}>{role.name} · {role.id}</option>)}</select><input aria-label="Multiplier theo role" type="number" min="1" max="5" step="1" value={roleMultiplierValue} onChange={(event) => setRoleMultiplierValue(event.currentTarget.value)} /><button type="button" className="button button-secondary button-small" onClick={() => { const next = { ...communitySettings.roleMultipliers, [roleMultiplierId.trim()]: Number(roleMultiplierValue) }; void onUpdateCommunitySettings({ roleMultipliers: next }, "Đã lưu role multiplier."); setRoleMultiplierId(""); }} disabled={!bridgeOnline || communityLoading || !roleMultiplierId.trim()}><Plus size={14} /> Lưu</button></div>
            <div className="community-rule-list">{Object.entries(communitySettings.roleMultipliers).map(([roleId, multiplier]) => <div className="community-rule-row" key={roleId}><span><strong>{guildRoles.find((role) => role.id === roleId)?.name ?? "Role không còn trong cache"}</strong><code>{roleId}</code></span><span>x{multiplier}</span><IconButton label={`Xóa role multiplier ${roleId}`} className="small-action danger-action" onClick={() => { const next = { ...communitySettings.roleMultipliers }; delete next[roleId]; void onUpdateCommunitySettings({ roleMultipliers: next }, "Đã xóa role multiplier."); }}><X size={14} /></IconButton></div>)}{Object.keys(communitySettings.roleMultipliers).length === 0 && <small className="field-hint">Chưa cấu hình role multiplier.</small>}</div>
          </div>
          <div className="community-config-card">
            <div className="detail-section-heading"><div><span className="overline">ROLE REWARDS</span><strong>Role theo level</strong></div><span className="status-pill">{communitySettings.roleRewards.length}/25</span></div>
            <div className="community-config-form community-config-form-wide"><select aria-label="Role cho reward" value={roleRewardId} onChange={(event) => setRoleRewardId(event.currentTarget.value)} disabled={guildRolesLoading}><option value="">{guildRolesLoading ? "Đang tải role…" : "Chọn role"}</option>{guildRoles.map((role) => <option value={role.id} key={role.id}>{role.name} · {role.id}</option>)}</select><input aria-label="Level nhận role" type="number" min="2" max="100" step="1" value={roleRewardLevel} onChange={(event) => setRoleRewardLevel(event.currentTarget.value)} /><button type="button" className="button button-secondary button-small" onClick={() => { const next = [...communitySettings.roleRewards.filter((reward) => reward.roleId !== roleRewardId.trim()), { roleId: roleRewardId.trim(), level: Number(roleRewardLevel) }]; void onUpdateCommunitySettings({ roleRewards: next }, "Đã lưu role reward."); setRoleRewardId(""); }} disabled={!bridgeOnline || communityLoading || !roleRewardId.trim()}><Plus size={14} /> Lưu</button></div>
            <div className="community-rule-list">{communitySettings.roleRewards.map((reward) => <div className="community-rule-row" key={reward.roleId}><span><strong>{guildRoles.find((role) => role.id === reward.roleId)?.name ?? "Role không còn trong cache"}</strong><code>{reward.roleId}</code></span><span>Level {reward.level}</span><IconButton label={`Xóa role reward ${reward.roleId}`} className="small-action danger-action" onClick={() => void onUpdateCommunitySettings({ roleRewards: communitySettings.roleRewards.filter((item) => item.roleId !== reward.roleId) }, "Đã xóa role reward.")}><X size={14} /></IconButton></div>)}{communitySettings.roleRewards.length === 0 && <small className="field-hint">Chưa cấu hình role reward.</small>}</div>
          </div>
          <div className="community-config-card community-exclusions-card">
            <div className="detail-section-heading"><div><span className="overline">XP EXCLUSIONS</span><strong>Kênh và role bỏ qua</strong></div><span className="status-pill">{communitySettings.ignoredChannelIds.length}/50 kênh · {communitySettings.ignoredRoleIds.length}/50 role</span></div>
            <p className="field-hint">Tin nhắn trong các channel hoặc từ thành viên có role này sẽ không tạo XP và không tăng message count.</p>
            <div className="community-config-form community-config-form-wide"><select aria-label="Channel bỏ qua XP" value={ignoredChannelId} onChange={(event) => setIgnoredChannelId(event.currentTarget.value)} disabled={!bridgeOnline || communityLoading || exclusionsBusy}><option value="">{textChannels.length ? "Chọn text channel" : "Chưa có text channel"}</option>{textChannels.map((channel) => <option value={channel.id} key={channel.id}>#{channel.name}{channel.category ? ` · ${channel.category}` : ""}</option>)}</select><button type="button" className="button button-secondary button-small" onClick={addIgnoredChannel} disabled={!bridgeOnline || communityLoading || exclusionsBusy || !ignoredChannelId}><Plus size={14} /> {exclusionsBusy ? "Đang lưu…" : "Bỏ qua kênh"}</button></div>
            <div className="community-rule-list">{communitySettings.ignoredChannelIds.map((id) => { const channel = textChannels.find((item) => item.id === id); return <div className="community-rule-row" key={`channel-${id}`}><span><strong>{channel ? `#${channel.name}` : "Channel không còn trong cache"}</strong><code>{id}</code></span><IconButton label={`Xóa channel loại trừ ${id}`} className="small-action danger-action" onClick={() => removeIgnoredChannel(id)} disabled={exclusionsBusy}><X size={14} /></IconButton></div>; })}{communitySettings.ignoredChannelIds.length === 0 && <small className="field-hint">Chưa có channel bị bỏ qua.</small>}</div>
            <div className="community-config-form community-config-form-wide"><select aria-label="Role bỏ qua XP" value={ignoredRoleId} onChange={(event) => setIgnoredRoleId(event.currentTarget.value)} disabled={!bridgeOnline || communityLoading || guildRolesLoading || exclusionsBusy}><option value="">{guildRolesLoading ? "Đang tải role…" : "Chọn role"}</option>{guildRoles.map((role) => <option value={role.id} key={role.id}>{role.name} · {role.id}</option>)}</select><button type="button" className="button button-secondary button-small" onClick={addIgnoredRole} disabled={!bridgeOnline || communityLoading || exclusionsBusy || !ignoredRoleId}><Plus size={14} /> {exclusionsBusy ? "Đang lưu…" : "Bỏ qua role"}</button></div>
            <div className="community-rule-list">{communitySettings.ignoredRoleIds.map((id) => <div className="community-rule-row" key={`role-${id}`}><span><strong>{guildRoles.find((role) => role.id === id)?.name ?? "Role không còn trong cache"}</strong><code>{id}</code></span><IconButton label={`Xóa role loại trừ ${id}`} className="small-action danger-action" onClick={() => removeIgnoredRole(id)}><X size={14} /></IconButton></div>)}{communitySettings.ignoredRoleIds.length === 0 && <small className="field-hint">Chưa có role bị bỏ qua.</small>}</div>
          </div>
        </div>
        <div className="leaderboard-list">
          {communityLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
          {!communityLoading && leaderboard.map((member) => <button type="button" className={`leaderboard-row leaderboard-row-button ${communityMember?.userId === member.userId ? "is-selected" : ""}`} key={member.userId} onClick={() => { void onInspectCommunityMember(member.userId); }} aria-label={`Xem chi tiết ${member.username}`}>
            <span className="leaderboard-rank">#{String(member.rank).padStart(2, "0")}</span>
            <span className="leaderboard-avatar"><Trophy size={16} /></span>
            <span className="leaderboard-copy"><strong>{member.username}</strong><small>Level {member.level} · {member.xp.toLocaleString("vi-VN")} XP · {member.messages} tin nhắn</small><span className="leaderboard-progress"><span style={{ width: `${Math.max(0, Math.min(100, member.progress))}%` }} /></span></span>
            <span className="leaderboard-percent">{member.progress}%</span>
          </button>)}
          {!communityLoading && leaderboard.length === 0 && <EmptyState title="Chưa có hoạt động" detail="XP sẽ xuất hiện khi thành viên trò chuyện trong guild." action="Làm mới" onClick={refresh} />}
        </div>
        {(leaderboard.length > 0 || communityOffset > 0) && <div className="leaderboard-pagination">
          <button type="button" className="button button-secondary button-small" onClick={() => onLeaderboardPage(communityOffset - 10)} disabled={communityOffset === 0 || communityLoading}><ChevronLeft size={14} /> Trước</button>
          <span>Trang {Math.floor(communityOffset / 10) + 1}</span>
          <button type="button" className="button button-secondary button-small" onClick={() => onLeaderboardPage(communityOffset + 10)} disabled={!communityHasMore || communityLoading}>Sau <ChevronRight size={14} /></button>
        </div>}
        {communityMemberLoading && <div className="community-member-detail"><RefreshCw size={14} className="is-spinning" /> Đang tải chi tiết…</div>}
        {!communityMemberLoading && communityMember && <div className="community-member-detail"><div><span className="overline">THÀNH VIÊN ĐANG CHỌN</span><strong>{communityMember.username}</strong><small>Hạng #{communityMember.rank} · Level {communityMember.level} · {communityMember.xp.toLocaleString("vi-VN")} XP · {communityMember.messages} tin nhắn</small></div><span className="status-pill">{communityMember.progress}% level</span></div>}
      </Panel>
      <MusicAccessPanel permissions={musicAccess} loading={musicAccessLoading} bridgeOnline={bridgeOnline} directory={memberDirectory} directoryLoading={memberDirectoryLoading} onSearchMembers={onSearchMembers} onUpdate={onUpdateMusicAccess} />
    </div>
    <GreetingPanel settings={greetingSettings} intentEnabled={greetingsIntentEnabled} loading={greetingsLoading} bridgeOnline={bridgeOnline} selectedGuild={selectedGuild} textChannels={textChannels} onUpdate={onUpdateGreeting} onPreview={onPreviewGreeting} onTestSend={onTestSendGreeting} />
      <AutoModPanel settings={automodSettings} capabilities={automodCapabilities} loading={automodLoading} bridgeOnline={bridgeOnline} selectedGuild={selectedGuild} onRefresh={onRefreshAutoMod} onUpdate={onUpdateAutoMod} onRecover={onRecoverAutoMod} />
      <AutoModReviewPanel entries={automodReviews} loading={automodReviewLoading} error={automodReviewError} bridgeOnline={bridgeOnline} selectedGuildId={selectedGuildId} onRefresh={onRefreshAutoModReview} onDecide={onDecideAutoModReview} />
    <Panel title="Hoạt động gần đây" icon={Activity} action={<div className="panel-actions"><span className="status-pill">{auditBusy ? "Đang tải…" : `${auditCount} sự kiện`}</span><button type="button" className={`button button-small ${auditSource === "local" ? "button-primary" : "button-secondary"}`} onClick={() => setAuditSource("local")} aria-pressed={auditSource === "local"}>Local</button><button type="button" className={`button button-small ${auditSource === "discord" ? "button-primary" : "button-secondary"}`} onClick={() => { setAuditSource("discord"); if (selectedGuildId && discordAuditEntries === null) onRefreshDiscordAudit(); }} aria-pressed={auditSource === "discord"} disabled={!bridgeOnline || !selectedGuildId}>Discord</button></div>} className="community-audit-panel">
      {auditSource === "local" && <>
        <div className="audit-toolbar">
          <label className="audit-filter-field"><Search size={14} /><span className="sr-only">Tìm trong hoạt động</span><input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyAuditFilters(); }} placeholder="Tìm actor, action, chi tiết…" maxLength={100} /></label>
          <label className="audit-filter-select"><span className="sr-only">Lọc theo nhóm hành động</span><select value={auditAction} onChange={(event) => setAuditAction(event.target.value)}><option value="">Tất cả nhóm</option><option value="player">Player</option><option value="queue">Queue</option><option value="playlist">Playlist</option><option value="voice">Voice</option><option value="commands">Commands</option><option value="music-access">Music access</option><option value="data">Data</option><option value="community">Community</option></select></label>
          <button type="button" className="button button-secondary button-small" onClick={applyAuditFilters} disabled={auditLoading}><Search size={14} /> Lọc</button>
          {(auditSearch || auditAction) && <button type="button" className="button button-ghost button-small" onClick={clearAuditFilters} disabled={auditLoading}>Đặt lại</button>}
          <div className="audit-export-actions" aria-label="Xuất audit log">
            <button type="button" className="button button-secondary button-small" onClick={() => { void onExportAudit({ action: auditAction || undefined, search: auditSearch.trim() || undefined }, "json"); }} disabled={!bridgeOnline || !selectedGuildId || auditExportLoading}><Download size={14} /> JSON</button>
            <button type="button" className="button button-secondary button-small" onClick={() => { void onExportAudit({ action: auditAction || undefined, search: auditSearch.trim() || undefined }, "csv"); }} disabled={!bridgeOnline || !selectedGuildId || auditExportLoading}><Download size={14} /> CSV</button>
          </div>
        </div>
      </>}
      {auditSource === "discord" && <div className="discord-audit-toolbar"><div><span className="overline">DISCORD REMOTE AUDIT</span><small>Đọc trực tiếp từ Discord; không lưu vào audit store local và không trả về reason/changes.</small></div><button type="button" className="button button-secondary button-small" onClick={onRefreshDiscordAudit} disabled={!bridgeOnline || !selectedGuildId || discordAuditLoading}><RefreshCw size={14} className={discordAuditLoading ? "is-spinning" : ""} /> Làm mới</button></div>}
      {auditSource === "local" && <div className="audit-policy-row">
        <div><span className="overline">RETENTION POLICY · LOCAL</span><strong>Giữ hoạt động trong bao lâu?</strong><small>Để trống để chỉ áp dụng giới hạn tối đa {auditSettings.maxEntries.toLocaleString("vi-VN")} sự kiện. Không có xoá thủ công tuỳ ý.</small></div>
        <div className="audit-policy-actions"><label><span className="sr-only">Số ngày lưu audit log</span><input type="number" min="1" max="3650" step="1" value={auditRetentionDraft} onChange={(event) => setAuditRetentionDraft(event.currentTarget.value)} placeholder="Không giới hạn ngày" disabled={!bridgeOnline || auditSettingsLoading} /></label><button type="button" className="button button-primary button-small" onClick={() => { const raw = auditRetentionDraft.trim(); void onUpdateAuditSettings(raw === "" ? null : Number(raw)); }} disabled={!bridgeOnline || auditSettingsLoading}>{auditSettingsLoading ? <RefreshCw size={14} className="is-spinning" /> : <Check size={14} />} Lưu</button><button type="button" className="button button-secondary button-small" onClick={() => { setAuditRetentionDraft(""); void onUpdateAuditSettings(null); }} disabled={!bridgeOnline || auditSettingsLoading}>Mặc định</button></div>
      </div>}
      <div className="audit-list">
        {auditSource === "local" && auditLoading && <><SkeletonRow /><SkeletonRow /></>}
        {auditSource === "local" && !auditLoading && auditEntries.map((entry) => <div className="audit-row" key={entry.id}><span className="audit-time">{new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.timestamp))}</span><span className="audit-copy"><strong>{entry.action}</strong><small>{entry.detail || "Không có chi tiết"}</small></span><span className="audit-actor">{entry.actor}</span></div>)}
        {auditSource === "local" && !auditLoading && auditEntries.length === 0 && <EmptyState title={auditSearch || auditAction ? "Không có kết quả phù hợp" : "Chưa có hoạt động"} detail={auditSearch || auditAction ? "Thử từ khóa khác hoặc đặt lại bộ lọc." : "Chưa có hoạt động quản trị trong guild này."} action={auditSearch || auditAction ? "Đặt lại" : "Làm mới"} onClick={auditSearch || auditAction ? clearAuditFilters : refresh} />}
        {auditSource === "discord" && discordAuditLoading && <><SkeletonRow /><SkeletonRow /></>}
        {auditSource === "discord" && !discordAuditLoading && discordAuditError && <div className="inline-note is-error"><CircleAlert size={14} /><span>{discordAuditError}</span></div>}
        {auditSource === "discord" && !discordAuditLoading && !discordAuditError && discordAuditEntries === null && <EmptyState title="Chưa tải audit Discord" detail="Nhấn Làm mới để đọc dữ liệu trực tiếp từ Discord." action="Làm mới" onClick={onRefreshDiscordAudit} />}
        {auditSource === "discord" && !discordAuditLoading && !discordAuditError && discordAuditEntries !== null && discordAuditEntries.map((entry) => <div className="audit-row" key={entry.id}><span className="audit-time">{new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}</span><span className="audit-copy"><strong>{entry.actionType} · {entry.targetType}</strong><small>{entry.targetId ? `Target ${entry.targetId}` : "Không có target ID"}</small></span><span className="audit-actor">{entry.actorTag ?? (entry.actorId ? `user:${entry.actorId}` : "Không rõ actor")}</span></div>)}
        {auditSource === "discord" && !discordAuditLoading && !discordAuditError && discordAuditEntries?.length === 0 && <EmptyState title="Discord chưa có audit event" detail="Guild không trả về sự kiện trong giới hạn đọc hiện tại." action="Làm mới" onClick={onRefreshDiscordAudit} />}
      </div>
    </Panel>
  </>;
}

function GreetingPanel({ settings, intentEnabled, loading, bridgeOnline, selectedGuild, textChannels, onUpdate, onPreview, onTestSend }: { settings: GreetingSettings; intentEnabled: boolean; loading: boolean; bridgeOnline: boolean; selectedGuild: GuildSummary | null; textChannels: TextChannelSummary[]; onUpdate: (kind: GreetingKind, template: GreetingTemplate) => void | Promise<void>; onPreview: (kind: GreetingKind, username: string) => Promise<GreetingPreview | null>; onTestSend: (kind: GreetingKind) => void | Promise<void> }) {
  const [kind, setKind] = useState<GreetingKind>("welcome");
  const [draft, setDraft] = useState<GreetingTemplate>(settings.welcome);
  const [preview, setPreview] = useState<GreetingPreview | null>(null);
  const [previewName, setPreviewName] = useState("Thành viên xem trước");
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    setDraft(settings[kind]);
    setPreview(null);
  }, [kind, settings]);

  const updateDraft = (patch: Partial<GreetingTemplate>) => setDraft((current) => ({ ...current, ...patch }));
  const runPreview = async () => {
    setPreviewBusy(true);
    try {
      setPreview(await onPreview(kind, previewName.trim() || "Thành viên xem trước"));
    } finally {
      setPreviewBusy(false);
    }
  };

  return <Panel title="Welcome / Goodbye" icon={UserPlus} action={<span className={`status-pill ${intentEnabled ? "is-good" : ""}`}>{intentEnabled ? "Members Intent bật" : "Members Intent tắt"}</span>} className="greeting-panel">
    <div className="greeting-panel-body">
      {!selectedGuild && <div className="inline-note"><CircleAlert size={14} /> Chọn guild trong nút context ở sticky footer để cấu hình theo từng server.</div>}
      {selectedGuild && !intentEnabled && <div className="inline-note"><ShieldCheck size={14} /> Preview và test-send dùng được; sự kiện thành viên tự động chỉ chạy sau khi bật Server Members Intent trong Discord Developer Portal và đặt <code>LOCALBOT_GUILD_MEMBERS_INTENT=true</code>.</div>}
      <div className="greeting-kind-tabs" role="tablist" aria-label="Loại thông báo">
        <button type="button" className={`button button-small ${kind === "welcome" ? "button-primary" : "button-secondary"}`} onClick={() => setKind("welcome")} role="tab" aria-selected={kind === "welcome"}>Welcome</button>
        <button type="button" className={`button button-small ${kind === "goodbye" ? "button-primary" : "button-secondary"}`} onClick={() => setKind("goodbye")} role="tab" aria-selected={kind === "goodbye"}>Goodbye</button>
      </div>
      <div className="greeting-form-grid">
        <label className="greeting-field greeting-field-wide"><span>Nội dung <small>Token: {"{user}"}, {"{username}"}, {"{guild}"}, {"{memberCount}"}</small></span><textarea value={draft.message} maxLength={1000} onChange={(event) => updateDraft({ message: event.currentTarget.value })} placeholder="Nhập nội dung thông báo…" disabled={!bridgeOnline || loading} /></label>
        <label className="greeting-field"><span>Text channel</span><select value={draft.channelId ?? ""} onChange={(event) => updateDraft({ channelId: event.currentTarget.value || null })} disabled={!bridgeOnline || loading || !selectedGuild}><option value="">Chọn channel nhận thông báo…</option>{draft.channelId && !textChannels.some((channel) => channel.id === draft.channelId) && <option value={draft.channelId}>ID đã lưu · {draft.channelId}</option>}{textChannels.map((channel) => <option key={channel.id} value={channel.id} disabled={channel.canSend === false}>{`#${channel.name}${channel.category ? ` · ${channel.category}` : ""}${channel.canSend === false ? " · thiếu quyền" : ""}`}</option>)}</select><small className="field-hint">{textChannels.length > 0 ? "Chỉ channel bot nhìn thấy; channel thiếu Send Messages không chọn được." : "Chưa có channel khả dụng; hãy làm mới hoặc kiểm tra quyền bot."}</small></label>
        <label className="greeting-field"><span>Ảnh HTTPS <small>Không bắt buộc</small></span><input type="url" value={draft.imageUrl ?? ""} maxLength={2048} onChange={(event) => updateDraft({ imageUrl: event.currentTarget.value || null })} placeholder="https://…" disabled={!bridgeOnline || loading} /></label>
      </div>
      <div className="greeting-toggle-row"><span className="setting-icon"><Power size={16} /></span><span><strong>{kind === "welcome" ? "Bật Welcome tự động" : "Bật Goodbye tự động"}</strong><small>Tin chỉ được gửi vào channel ID đã chọn khi event được Discord cung cấp.</small></span><button type="button" className={`switch-control ${draft.enabled ? "is-active" : ""}`} role="switch" aria-checked={draft.enabled} onClick={() => updateDraft({ enabled: !draft.enabled })} disabled={!bridgeOnline || loading}><span /></button></div>
      <div className="greeting-actions"><button type="button" className="button button-primary" onClick={() => { void onUpdate(kind, draft); }} disabled={!bridgeOnline || loading || !selectedGuild}><Check size={15} /> {loading ? "Đang lưu…" : "Lưu cấu hình"}</button><button type="button" className="button button-secondary" onClick={() => { void runPreview(); }} disabled={!bridgeOnline || loading || !selectedGuild || previewBusy}><Search size={15} /> {previewBusy ? "Đang tạo…" : "Preview"}</button><button type="button" className="button button-secondary" onClick={() => { void onTestSend(kind); }} disabled={!bridgeOnline || loading || !selectedGuild || !draft.enabled || !draft.channelId}><Activity size={15} /> Gửi thử</button></div>
      <div className="greeting-preview"><div className="greeting-preview-head"><strong>Preview không gửi tin</strong><label><span className="sr-only">Tên thành viên xem trước</span><input value={previewName} maxLength={80} onChange={(event) => setPreviewName(event.currentTarget.value)} placeholder="Tên thành viên" /></label></div>{preview ? <div className="greeting-preview-content"><p>{preview.text}</p>{preview.imageUrl && <a href={preview.imageUrl} target="_blank" rel="noreferrer">Mở ảnh HTTPS</a>}</div> : <p className="panel-note">Nhấn Preview để render token bằng dữ liệu guild đang chọn.</p>}</div>
    </div>
  </Panel>;
}

const autoModRuleLabels: Record<AutoModRuleKind, { title: string; detail: string }> = {
  spam: { title: "Spam lặp lại", detail: "Cùng một nội dung trong cùng channel." },
  flood: { title: "Flood", detail: "Tần suất tin nhắn của một user trong guild." },
  link: { title: "Link bị chặn", detail: "Chỉ match hostname có trong danh sách block." },
  scam: { title: "Mẫu scam", detail: "Heuristic cho bait Nitro, reward, verify và crypto." },
  antiRaid: { title: "Anti-raid", detail: "Tín hiệu nhiều member join trong thời gian ngắn." },
  antiNuke: { title: "Anti-nuke", detail: "Tín hiệu nhiều channel/role bị xoá trong thời gian ngắn." },
};

const autoModActionLabels: Record<AutoModProposedAction, string> = {
  alert: "Chỉ cảnh báo",
  delete: "Xoá message nếu đủ quyền",
  timeout: "Timeout 60 giây nếu đủ quyền",
  quarantine: "Đề xuất quarantine",
};

const autoModModeLabels: Record<AutoModSettings["mode"], string> = {
  "dry-run": "Dry-run · chỉ audit",
  enforce: "Enforce · có giới hạn",
};

const autoModReviewOutcomeLabels: Record<AutoModReviewOutcome, string> = {
  alerted: "Đã ghi cảnh báo",
  deleted: "Đã xoá message",
  timed_out: "Đã timeout 60 giây",
  unsupported: "Chưa hỗ trợ mutation",
  permission_denied: "Thiếu quyền Discord",
  rate_limited: "Đã chạm giới hạn",
  failed: "Mutation thất bại",
  coalesced: "Gộp cùng chu kỳ",
};

const autoModReviewStatusLabels: Record<AutoModReviewStatus, string> = {
  open: "Chưa xử lý",
  confirmed: "Đã xác nhận",
  dismissed: "Đã bỏ qua",
};

function AutoModReviewPanel({ entries, loading, error, bridgeOnline, selectedGuildId, onRefresh, onDecide }: { entries: AutoModReviewEntry[]; loading: boolean; error: string | null; bridgeOnline: boolean; selectedGuildId: string; onRefresh: (status: AutoModReviewStatus) => void; onDecide: (reviewId: string, decision: "confirm" | "dismiss", note: string) => void | Promise<void> }) {
  const [status, setStatus] = useState<AutoModReviewStatus>("open");
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedGuildId) onRefresh(status);
  }, [selectedGuildId, status]);

  const visibleEntries = entries.filter((entry) => entry.status === status);
  const disabled = !bridgeOnline || !selectedGuildId || loading;
  return <Panel title="Review AutoMod" icon={ShieldCheck} action={<div className="panel-actions"><select className="review-status-select" aria-label="Lọc trạng thái review AutoMod" value={status} onChange={(event) => setStatus(event.currentTarget.value as AutoModReviewStatus)} disabled={loading}>{(Object.keys(autoModReviewStatusLabels) as AutoModReviewStatus[]).map((value) => <option value={value} key={value}>{autoModReviewStatusLabels[value]}</option>)}</select><button type="button" className="button button-secondary button-small" onClick={() => onRefresh(status)} disabled={disabled}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Làm mới</button></div>} className="automod-review-panel">
    <div className="automod-review-body">
      {!selectedGuildId && <div className="inline-note"><CircleAlert size={14} /> Chọn guild trong sticky footer để xem review AutoMod.</div>}
      {selectedGuildId && !bridgeOnline && <div className="inline-note"><CircleAlert size={14} /> Control API đang offline; không thể tải review.</div>}
      {error && <div className="inline-note is-error"><CircleAlert size={14} /><span>{error}</span><button type="button" className="button button-ghost button-small" onClick={() => onRefresh(status)} disabled={disabled}>Thử lại</button></div>}
      {loading && <div className="automod-review-list"><SkeletonRow /><SkeletonRow /></div>}
      {!loading && !error && visibleEntries.length === 0 && <EmptyState title={status === "open" ? "Không có tín hiệu chờ review" : "Chưa có bản ghi"} detail={status === "open" ? "AutoMod chỉ tạo bản ghi khi detector match dữ liệu thật của guild." : "Các quyết định review được giữ local và không thay đổi Discord."} action="Làm mới" onClick={() => onRefresh(status)} />}
      {!loading && visibleEntries.length > 0 && <div className="automod-review-list">{visibleEntries.map((entry) => <motion.div layout key={entry.id} className="automod-review-row">
        <div className="automod-review-copy"><div className="automod-review-head"><strong>{autoModRuleLabels[entry.rule].title}</strong><span className="status-pill">{autoModReviewOutcomeLabels[entry.outcome]}</span></div><small>{entry.reason} · đề xuất: {autoModActionLabels[entry.proposedAction]} · {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))}</small><small>{entry.channelId ? `Channel ${entry.channelId}` : "Không có channel ID"} · {entry.userId ? `User ${entry.userId}` : "Không có user ID"} · {entry.enforced ? "đã enforce" : "dry-run"}</small></div>
        {status === "open" && <div className="automod-review-actions"><input aria-label={`Ghi chú cho review ${entry.id}`} maxLength={240} value={notes[entry.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [entry.id]: event.currentTarget.value }))} placeholder="Ghi chú tùy chọn" disabled={disabled} /><button type="button" className="button button-primary button-small" onClick={() => { void onDecide(entry.id, "confirm", notes[entry.id] ?? ""); }} disabled={disabled}><Check size={14} /> Xác nhận</button><button type="button" className="button button-secondary button-small" onClick={() => { void onDecide(entry.id, "dismiss", notes[entry.id] ?? ""); }} disabled={disabled}>Bỏ qua</button></div>}
      </motion.div>)}</div>}
    </div>
  </Panel>;
}

function AutoModPanel({ settings, capabilities, loading, bridgeOnline, selectedGuild, onRefresh, onUpdate, onRecover }: { settings: AutoModSettings; capabilities: AutoModCapabilities; loading: boolean; bridgeOnline: boolean; selectedGuild: GuildSummary | null; onRefresh: () => void; onUpdate: (settings: AutoModSettings) => void | Promise<void>; onRecover: () => void | Promise<void> }) {
  const [draft, setDraft] = useState<AutoModSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const disabled = !bridgeOnline || !selectedGuild || loading;
  const updateRule = (kind: AutoModRuleKind, patch: Partial<AutoModSettings["rules"][AutoModRuleKind]>) => {
    setDraft((current) => ({ ...current, rules: { ...current.rules, [kind]: { ...current.rules[kind], ...patch } } }));
  };
  const updateList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 100);

  const updateMode = (mode: AutoModSettings["mode"]) => {
    if (mode === "enforce" && draft.mode !== "enforce" && !window.confirm("Bật enforce cho guild này? LocalBot chỉ xoá message trigger hoặc timeout 60 giây khi Discord xác nhận đủ quyền; anti-raid/anti-nuke vẫn chỉ cảnh báo.")) return;
    setDraft((current) => ({ ...current, mode }));
  };

  return <Panel title="AutoMod" icon={ShieldCheck} action={<div className="panel-actions"><span className={`status-pill ${draft.mode === "enforce" ? "is-warning" : ""}`}>{autoModModeLabels[draft.mode]}</span><button type="button" className="button button-secondary button-small" onClick={onRefresh} disabled={disabled}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Làm mới</button></div>} className="automod-panel">
    <div className="automod-panel-body">
      {!selectedGuild && <div className="inline-note"><CircleAlert size={14} /> Chọn guild trong sticky footer để cấu hình AutoMod theo server.</div>}
      {selectedGuild && !bridgeOnline && <div className="inline-note"><CircleAlert size={14} /> Control API đang offline; policy không được suy đoán hoặc chạy giả.</div>}
      {selectedGuild && bridgeOnline && !capabilities.messageContentIntentEnabled && <div className="inline-note"><CircleAlert size={14} /> Message Content Intent đang tắt: AutoMod không thể đọc nội dung để phát hiện Spam, Flood, Link hoặc Scam. Bật Message Content Intent trong Discord Developer Portal và đặt <code>LOCALBOT_MESSAGE_CONTENT_INTENT=true</code>, sau đó khởi động lại bot.</div>}
      <div className={`automod-warning ${draft.mode === "enforce" ? "is-enforce" : ""}`}><ShieldCheck size={15} /><span>{draft.mode === "enforce" ? <><strong>Enforce có giới hạn.</strong> Chỉ xoá message trigger hoặc timeout 60 giây khi Discord xác nhận đủ quyền; mỗi message tối đa một mutation, tối đa 20 mutation/guild/phút. Anti-raid, anti-nuke và quarantine vẫn không tự động thay đổi Discord.</> : <><strong>Chỉ dry-run.</strong> LocalBot chỉ ghi audit match và không xoá tin, timeout, ban, lockdown hay đổi quyền Discord.</>}</span></div>
      <div className="automod-master-row"><div><span className="overline">POLICY GUILD</span><strong>{selectedGuild?.name ?? "Chưa chọn guild"}</strong><small>Phân tích message thật chỉ chạy khi policy được bật và bot runtime online.</small></div><div className="automod-master-controls"><label className="automod-field"><span>Chế độ xử lý</span><select value={draft.mode} onChange={(event) => updateMode(event.currentTarget.value as AutoModSettings["mode"])} disabled={disabled}>{(Object.keys(autoModModeLabels) as AutoModSettings["mode"][]).map((mode) => <option value={mode} key={mode}>{autoModModeLabels[mode]}</option>)}</select></label><button type="button" className={`switch-control ${draft.enabled ? "is-active" : ""}`} role="switch" aria-checked={draft.enabled} aria-label="Bật policy AutoMod" onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))} disabled={disabled}><span /></button></div></div>
      <div className="automod-rule-grid">
        {(Object.keys(autoModRuleLabels) as AutoModRuleKind[]).map((kind) => {
          const rule = draft.rules[kind];
          const thresholdRule = kind === "spam" || kind === "flood" || kind === "antiRaid" || kind === "antiNuke" ? rule as AutoModThresholdRule : null;
          const linkRule = kind === "link" ? rule as AutoModLinkRule : null;
          return <div className={`automod-rule-card ${rule.enabled ? "is-enabled" : ""}`} key={kind}>
            <div className="automod-rule-head"><div><strong>{autoModRuleLabels[kind].title}</strong><small>{autoModRuleLabels[kind].detail}</small></div><button type="button" className={`switch-control ${rule.enabled ? "is-active" : ""}`} role="switch" aria-checked={rule.enabled} aria-label={`Bật ${autoModRuleLabels[kind].title}`} onClick={() => updateRule(kind, { enabled: !rule.enabled })} disabled={disabled}><span /></button></div>
            <label className="automod-field"><span>Hành động đề xuất</span><select value={rule.proposedAction} onChange={(event) => updateRule(kind, { proposedAction: event.currentTarget.value as AutoModProposedAction })} disabled={disabled}>{(Object.keys(autoModActionLabels) as AutoModProposedAction[]).map((action) => <option value={action} key={action}>{autoModActionLabels[action]}</option>)}</select></label>
            {thresholdRule && <div className="automod-number-grid"><label className="automod-field"><span>{kind === "antiRaid" || kind === "antiNuke" ? "Ngưỡng sự kiện" : "Ngưỡng"}</span><input type="number" min="2" max="100" value={thresholdRule.threshold} onChange={(event) => updateRule(kind, { threshold: Number(event.currentTarget.value) })} disabled={disabled} /></label><label className="automod-field"><span>Cửa sổ (giây)</span><input type="number" min="1" max="86400" value={thresholdRule.windowSeconds} onChange={(event) => updateRule(kind, { windowSeconds: Number(event.currentTarget.value) })} disabled={disabled} /></label><label className="automod-field"><span>Cooldown (giây)</span><input type="number" min="0" max="86400" value={thresholdRule.cooldownSeconds} onChange={(event) => updateRule(kind, { cooldownSeconds: Number(event.currentTarget.value) })} disabled={disabled} /></label></div>}
            {linkRule && <><label className="automod-field"><span>Blocked domains <small>mỗi dòng hoặc dấu phẩy</small></span><textarea className="automod-list-input" value={linkRule.blockedDomains.join("\n")} maxLength={26_000} onChange={(event) => updateRule(kind, { blockedDomains: updateList(event.currentTarget.value) })} disabled={disabled} placeholder="example.com" /></label><label className="automod-field"><span>Cooldown (giây)</span><input type="number" min="0" max="86400" value={linkRule.cooldownSeconds} onChange={(event) => updateRule(kind, { cooldownSeconds: Number(event.currentTarget.value) })} disabled={disabled} /></label></>}
            {!thresholdRule && !linkRule && <label className="automod-field"><span>Cooldown (giây)</span><input type="number" min="0" max="86400" value={(rule as AutoModScamRule).cooldownSeconds} onChange={(event) => updateRule(kind, { cooldownSeconds: Number(event.currentTarget.value) })} disabled={disabled} /></label>}
          </div>;
        })}
      </div>
      <div className="automod-exemption-grid"><label className="automod-field"><span>Miễn trừ user ID <small>mỗi dòng hoặc dấu phẩy</small></span><textarea className="automod-list-input" value={draft.exemptUserIds.join("\n")} maxLength={6_500} onChange={(event) => setDraft((current) => ({ ...current, exemptUserIds: updateList(event.currentTarget.value) }))} disabled={disabled} placeholder="Discord user ID" /></label><label className="automod-field"><span>Miễn trừ role ID <small>mỗi dòng hoặc dấu phẩy</small></span><textarea className="automod-list-input" value={draft.exemptRoleIds.join("\n")} maxLength={6_500} onChange={(event) => setDraft((current) => ({ ...current, exemptRoleIds: updateList(event.currentTarget.value) }))} disabled={disabled} placeholder="Discord role ID" /></label></div>
      <div className="automod-actions"><button type="button" className="button button-primary" onClick={() => { void onUpdate(draft); }} disabled={disabled}><Check size={15} /> {loading ? "Đang lưu…" : "Lưu policy"}</button>{draft.enabled && <button type="button" className="button button-danger" onClick={() => { void onUpdate({ ...draft, enabled: false }); }} disabled={disabled}><PowerOff size={15} /> Tắt ngay</button>}{(draft.enabled || draft.mode === "enforce") && <button type="button" className="button button-secondary" onClick={() => { if (window.confirm("Đưa AutoMod về trạng thái an toàn? Policy sẽ tắt, mode về dry-run và giữ nguyên rule.")) void onRecover(); }} disabled={disabled}><ShieldCheck size={15} /> Khôi phục an toàn</button>}</div>
    </div>
  </Panel>;
}

type GuildVoicePickerProps = {
  open: boolean;
  onClose: () => void;
  guilds: GuildSummary[];
  selectedGuildId: string;
  setSelectedGuildId: (id: string) => void;
  selectedGuild: GuildSummary | null;
  voiceChannels: VoiceChannelSummary[];
  guildsLoading: boolean;
  channelsLoading: boolean;
  voiceBusy: string | null;
  bridgeOnline: boolean;
  onJoin: (channel: VoiceChannelSummary) => void | Promise<void>;
  onLeave: () => void | Promise<void>;
};

function GuildVoicePicker({ open, onClose, guilds, selectedGuildId, setSelectedGuildId, selectedGuild, voiceChannels, guildsLoading, channelsLoading, voiceBusy, bridgeOnline, onJoin, onLeave }: GuildVoicePickerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return <AnimatePresence>
    {open && <motion.div className="modal-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <motion.section className="picker-dialog" role="dialog" aria-modal="true" aria-labelledby="guild-picker-title" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.2 }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="picker-head"><div><span className="eyebrow">CONTROL PLANE</span><h2 id="guild-picker-title">Chọn guild & phòng nghe</h2><p>{bridgeOnline ? "Chọn nhanh nơi LocalBot sẽ tham gia và phát nhạc." : "Control API đang offline · bật bot để tải dữ liệu Discord thật."}</p></div><IconButton label="Đóng bộ chọn guild" className="picker-close" onClick={onClose}><X size={17} /></IconButton></header>
        <div className="picker-body">
          <div className="picker-column"><div className="picker-column-head"><strong>Guild</strong><span>{guilds.length}</span></div><div className="picker-list">
            {guildsLoading && <><SkeletonRow /><SkeletonRow /></>}
            {!guildsLoading && guilds.map((guild) => <button type="button" key={guild.id} className={`picker-item ${guild.id === selectedGuildId ? "is-active" : ""}`} aria-pressed={guild.id === selectedGuildId} onClick={() => setSelectedGuildId(guild.id)}><span className="picker-item-icon">{guild.icon ? <img src={guild.icon} alt="" width="34" height="34" loading="lazy" /> : <Server size={17} />}</span><span className="picker-item-copy"><strong>{guild.name}</strong><small>{guild.memberCount.toLocaleString("vi-VN")} thành viên</small></span>{guild.id === selectedGuildId ? <Check size={16} /> : <ChevronRight size={16} />}</button>)}
            {!guildsLoading && guilds.length === 0 && <p className="picker-empty">Chưa có guild khả dụng.</p>}
          </div></div>
          <div className="picker-column"><div className="picker-column-head"><div><strong>Phòng nghe</strong><small>{selectedGuild?.name ?? "Chưa chọn guild"}</small></div>{selectedGuild?.botVoiceChannel && <button type="button" className="button button-secondary button-small" disabled={voiceBusy !== null} onClick={() => void onLeave()}><LogOut size={14} /> Rời kênh</button>}</div><div className="picker-list">
            {channelsLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
            {!channelsLoading && voiceChannels.map((channel) => { const isCurrent = channel.botJoined || channel.id === selectedGuild?.botVoiceChannel?.id; const unavailable = channel.canConnect === false || channel.canSpeak === false; return <button type="button" key={channel.id} className={`picker-item ${isCurrent ? "is-active" : ""}`} disabled={voiceBusy !== null || unavailable} onClick={() => isCurrent ? void onLeave() : void onJoin(channel)}><span className="picker-item-icon">{channel.type === "stage" ? <Headphones size={17} /> : <Mic size={17} />}</span><span className="picker-item-copy"><strong>{channel.name}</strong><small>{channel.category ?? "Không phân loại"} · {channel.type === "stage" ? "Stage" : "Voice"}</small></span><span className="picker-item-action">{voiceBusy === channel.id ? "Đang kết nối…" : isCurrent ? "Đang ở đây" : unavailable ? "Thiếu quyền" : "Tham gia"}</span>{isCurrent ? <Check size={16} /> : <ChevronRight size={16} />}</button>; })}
            {!channelsLoading && voiceChannels.length === 0 && <p className="picker-empty">Guild này chưa có phòng voice khả dụng.</p>}
          </div></div>
        </div>
        <footer className="picker-foot"><span><ShieldCheck size={14} /> Quyền Connect và Speak được kiểm tra trước khi tham gia.</span><button type="button" className="button button-secondary" onClick={onClose}>Xong</button></footer>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}

function MusicContextPicker({ open, onClose, guilds, selectedGuildId, setSelectedGuildId, selectedGuild, voiceChannels, selectedVoiceChannelId, onSelectVoiceChannel, readiness, readinessLoading, readinessError, onRefreshReadiness, guildsLoading, channelsLoading, bridgeOnline }: { open: boolean; onClose: () => void; guilds: GuildSummary[]; selectedGuildId: string; setSelectedGuildId: (id: string) => void; selectedGuild: GuildSummary | null; voiceChannels: VoiceChannelSummary[]; selectedVoiceChannelId: string; onSelectVoiceChannel: (id: string) => void; readiness: MusicReadiness | null; readinessLoading: boolean; readinessError: string | null; onRefreshReadiness: () => void; guildsLoading: boolean; channelsLoading: boolean; bridgeOnline: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const readinessLabel = readinessLoading ? "Đang kiểm tra quyền hiệu lực…" : readiness?.readiness === "ready" ? "Sẵn sàng phát Discord" : readiness?.readiness === "missing_permission" ? `Thiếu quyền ${readiness.missing.join(", ")}` : readiness?.readiness === "unknown" ? "Chưa xác định quyền hiệu lực" : readiness?.readiness === "unsupported" ? "Stage channel chưa được hỗ trợ" : readinessError ? "Không đọc được readiness" : "Chọn một voice channel";
  const readinessDetail = readiness?.readiness === "missing_permission"
    ? readiness.missing.includes("ViewChannel") ? "Bot không thể nhìn channel này. Chọn channel khác hoặc cấp đúng quyền theo channel overwrite." : readiness.missing.includes("Connect") ? "Bot không thể tham gia channel này. Chọn channel khác hoặc cấp đúng quyền theo channel overwrite." : "Bot có thể nhìn/tham gia nhưng chưa thể truyền âm thanh vào channel này."
    : readiness?.readiness === "unknown" ? "Discord chưa trả về đủ cache member/quyền. Hãy thử lại; LocalBot không suy đoán thành thiếu quyền."
      : readiness?.readiness === "unsupported" ? "Runtime Music hiện chỉ xác nhận voice channel thường; Stage cần semantics speaker riêng."
        : readiness?.readiness === "ready" ? "Permission được tính trên chính channel đã chọn, không chỉ ở cấp guild."
          : "Chọn channel để kiểm tra View Channel, Connect và Speak.";

  return <AnimatePresence>
    {open && <motion.div className="modal-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <motion.section className="picker-dialog music-context-dialog" role="dialog" aria-modal="true" aria-labelledby="music-context-title" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.2 }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="picker-head"><div><span className="eyebrow">MUSIC · DISCORD CONTEXT</span><h2 id="music-context-title">Chọn nơi phát nhạc</h2><p>Chọn guild và phòng nghe trực tiếp. Chưa có thao tác join cho đến khi bạn bấm phát hoặc tham gia rõ ràng.</p></div><IconButton label="Đóng bộ chọn Music" className="picker-close" onClick={onClose}><X size={17} /></IconButton></header>
        <div className="picker-body">
          <div className="picker-column"><div className="picker-column-head"><strong>Guild</strong><span>{guilds.length}</span></div><div className="picker-list">
            {!bridgeOnline && <p className="picker-empty">Control API đang offline. Bật bot runtime để đọc guild thật.</p>}
            {guildsLoading && <><SkeletonRow /><SkeletonRow /></>}
            {!guildsLoading && guilds.map((guild) => <button type="button" key={guild.id} className={`picker-item ${guild.id === selectedGuildId ? "is-active" : ""}`} aria-pressed={guild.id === selectedGuildId} onClick={() => setSelectedGuildId(guild.id)}><span className="picker-item-icon">{guild.icon ? <img src={guild.icon} alt="" width="34" height="34" loading="lazy" /> : <Server size={17} />}</span><span className="picker-item-copy"><strong>{guild.name}</strong><small>{guild.memberCount.toLocaleString("vi-VN")} thành viên</small></span>{guild.id === selectedGuildId ? <Check size={16} /> : <ChevronRight size={16} />}</button>)}
            {!guildsLoading && bridgeOnline && guilds.length === 0 && <p className="picker-empty">Chưa có guild khả dụng.</p>}
          </div></div>
          <div className="picker-column"><div className="picker-column-head"><div><strong>Voice channel</strong><small>{selectedGuild?.name ?? "Chưa chọn guild"}</small></div><span>{voiceChannels.length}</span></div><div className="picker-list">
            {channelsLoading && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}
            {!channelsLoading && voiceChannels.map((channel) => {
              const selected = channel.id === selectedVoiceChannelId;
              const unsupported = channel.type === "stage";
              const cachedDenied = channel.canConnect === false || channel.canSpeak === false;
              return <button type="button" key={channel.id} className={`picker-item ${selected ? "is-active" : ""}`} disabled={unsupported} aria-pressed={selected} onClick={() => onSelectVoiceChannel(channel.id)}><span className="picker-item-icon">{unsupported ? <Headphones size={17} /> : <Mic size={17} />}</span><span className="picker-item-copy"><strong>{channel.name}</strong><small>{channel.category ?? "Không phân loại"} · {unsupported ? "Stage · chưa hỗ trợ" : "Voice"}</small></span><span className="picker-item-action">{unsupported ? "Chưa hỗ trợ" : cachedDenied ? "Kiểm tra readiness" : selected ? "Đã chọn" : "Chọn"}</span>{selected ? <Check size={16} /> : <ChevronRight size={16} />}</button>;
            })}
            {!channelsLoading && voiceChannels.length === 0 && <p className="picker-empty">Guild này chưa có voice channel khả dụng.</p>}
            <div className={`music-readiness-card ${readiness?.readiness === "ready" ? "is-ready" : readiness?.readiness === "missing_permission" || readiness?.readiness === "unsupported" ? "is-warning" : ""}`} role="status"><span className="music-readiness-icon">{readiness?.readiness === "ready" ? <Check size={16} /> : <CircleAlert size={16} />}</span><span><strong>{readinessLabel}</strong><small>{readinessDetail}</small></span>{readinessError && <button type="button" className="button button-ghost button-small" onClick={onRefreshReadiness} disabled={readinessLoading}>Thử lại</button>}</div>
          </div></div>
        </div>
        <footer className="picker-foot"><span><ShieldCheck size={14} /> Readiness dùng effective permission của chính voice channel và không tự join.</span><button type="button" className="button button-primary" onClick={onClose}>Dùng context này</button></footer>
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}

function MusicAccessPanel({ permissions, loading, bridgeOnline, directory, directoryLoading, onSearchMembers, onUpdate }: { permissions: MusicAccess; loading: boolean; bridgeOnline: boolean; directory: GuildMemberDirectory; directoryLoading: boolean; onSearchMembers: (query: string) => void | Promise<void>; onUpdate: (action: "mode" | "add" | "remove", body: Record<string, unknown>) => void | Promise<void> }) {
  const [userId, setUserId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const addUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanId = userId.trim();
    if (!/^\d{5,25}$/.test(cleanId)) return;
    void onUpdate("add", { userId: cleanId });
    setUserId("");
  };
  const searchMembers = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = memberQuery.trim();
    if (!query) return;
    void onSearchMembers(query);
  };
  return <Panel title="Quyền dùng Music" icon={ShieldCheck} action={<span className={`status-pill ${permissions.mode === "all" ? "is-good" : ""}`}>{permissions.mode === "all" ? "Mọi thành viên" : "Allow-list"}</span>}>
    <div className="access-panel">
      {!bridgeOnline && <div className="inline-note"><CircleAlert size={14} /> Control API offline · bật bot runtime để tải và lưu quyền thật.</div>}
      <div className="access-mode-grid" role="group" aria-label="Chế độ quyền Music">
        <button type="button" className={`access-mode-button ${permissions.mode === "allowlist" ? "is-active" : ""}`} disabled={loading} onClick={() => void onUpdate("mode", { mode: "allowlist" })}><UserPlus size={16} /><span><strong>Allow-list</strong><small>Chỉ user được cấp quyền</small></span></button>
        <button type="button" className={`access-mode-button ${permissions.mode === "all" ? "is-active" : ""}`} disabled={loading} onClick={() => void onUpdate("mode", { mode: "all" })}><UsersRound size={16} /><span><strong>Tất cả</strong><small>Mọi thành viên được dùng Music</small></span></button>
      </div>
      <form className="access-member-search" onSubmit={searchMembers}><label htmlFor="music-access-member-search">Tìm thành viên trong guild</label><div><input id="music-access-member-search" value={memberQuery} maxLength={64} onChange={(event) => setMemberQuery(event.currentTarget.value)} placeholder="Tên hiển thị, username hoặc user ID" disabled={loading || permissions.mode === "all"} /><button type="submit" className="button button-secondary" disabled={loading || directoryLoading || permissions.mode === "all" || !memberQuery.trim()}><Search size={15} /> {directoryLoading ? "Đang tìm…" : "Tìm"}</button></div></form>
      <p className="access-directory-note"><UsersRound size={13} /> {directory.intentEnabled ? directory.complete ? "Đang tìm bằng Discord Members Intent." : "Members Intent đã bật nhưng kết quả hiện tại chỉ xác nhận được một phần; kiểm tra lại nếu cần." : "Members Intent đang tắt · chỉ tìm được thành viên đã có trong cache. Bạn vẫn có thể nhập ID thủ công."}</p>
      {directoryLoading && <div className="access-member-results"><SkeletonRow /><SkeletonRow /></div>}
      {!directoryLoading && directory.members.length > 0 && <div className="access-member-results">{directory.members.map((member) => { const alreadyAllowed = permissions.userIds.includes(member.id); return <button type="button" key={member.id} className="access-member-result" disabled={loading || permissions.mode === "all" || alreadyAllowed} onClick={() => void onUpdate("add", { userId: member.id })}><span className="access-member-avatar"><UsersRound size={14} /></span><span><strong>{member.displayName}</strong><small>@{member.username} · {member.id}</small></span><span>{alreadyAllowed ? "Đã cấp" : "Cấp quyền"}</span></button>; })}</div>}
      {!directoryLoading && memberQuery.trim() && directory.members.length === 0 && <p className="panel-note">Không tìm thấy thành viên trong dữ liệu hiện có. Bật Members Intent hoặc nhập ID thủ công.</p>}
      <form className="access-add-form" onSubmit={addUser}><label htmlFor="music-access-user-id">Discord user ID</label><div><input id="music-access-user-id" inputMode="numeric" pattern="[0-9]{5,25}" value={userId} onChange={(event) => setUserId(event.currentTarget.value)} placeholder="Ví dụ: 123456789012345678" disabled={loading || permissions.mode === "all"} /><button type="submit" className="button button-secondary" disabled={loading || permissions.mode === "all" || !/^\d{5,25}$/.test(userId.trim())}><Plus size={15} /> Thêm</button></div></form>
      <div className="access-user-list">{permissions.userIds.map((id) => <div className="access-user-row" key={id}><span className="access-user-dot" /><code>{id}</code><IconButton label={`Thu hồi quyền Music của ${id}`} className="small-action danger-action" onClick={() => void onUpdate("remove", { userId: id })}><X size={14} /></IconButton></div>)}{permissions.mode === "allowlist" && permissions.userIds.length === 0 && <p className="panel-note">Chưa có user trong allow-list.</p>}</div>
    </div>
  </Panel>;
}

function SkeletonRow() {
  return <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>;
}

function Overview({ search, setSearch, submitSearch, currentTrack, selectedGuild, recentTracks, queueTracks, playlists, playlistsLoading, navigateMusic, bridgeOnline, playing, positionSeconds, durationSeconds, onPlayTrack }: { search: string; setSearch: (value: string) => void; submitSearch: (event: FormEvent<HTMLFormElement>) => void | Promise<void>; currentTrack: Track | null; selectedGuild: GuildSummary | null; recentTracks: Track[]; queueTracks: Track[]; playlists: BackendPlaylist[]; playlistsLoading: boolean; navigateMusic: (tab: MusicTab) => void; bridgeOnline: boolean; playing: boolean; positionSeconds: number; durationSeconds: number; onPlayTrack: (track: Track) => void | Promise<void> }) {
  const duration = durationSeconds || (currentTrack ? durationToSeconds(currentTrack.duration) : 0);
  const progress = duration > 0 ? Math.max(0, Math.min(100, positionSeconds / duration * 100)) : 0;
  return <>
    <SectionHeading eyebrow="DISCOVERY · LOCAL-FIRST" title="Âm nhạc, ở đúng nơi bạn muốn" description="Khám phá những track mới, điều khiển phiên nghe và giữ mọi thứ trong tầm tay." />
    <div className="overview-search-row"><SearchBar value={search} setValue={setSearch} onSubmit={(event) => { void submitSearch(event); navigateMusic("discover"); }} compact /><button type="button" className="text-action" onClick={() => navigateMusic("discover")}>Mở khám phá <ChevronRight size={16} /></button></div>

    <div className="overview-feature-grid">
      <motion.section className={`feature-card ${currentTrack ? "" : "feature-card-empty"}`} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
        <div className="feature-copy">{currentTrack ? <><span className="eyebrow">ĐANG PHÁT · {currentTrack.provider === "youtube" ? "YOUTUBE" : "SOUNDCLOUD"}</span><h2>{currentTrack.title}</h2><p>{currentTrack.artist}</p><div className="feature-meta"><SourceTag provider={currentTrack.provider} /><span>{formatPlaybackTime(positionSeconds)} / {duration > 0 ? formatPlaybackTime(duration) : currentTrack.duration}</span></div><div className="mini-progress" aria-label={`Tiến trình ${progress}%`}><span style={{ width: `${progress}%` }} /></div><button type="button" className="button button-inverse" onClick={() => navigateMusic("now-playing")}><Play size={16} fill="currentColor" /> {playing ? "Mở player" : "Xem player"}</button></> : <><span className="eyebrow">PHIÊN NGHE</span><h2>Chưa có bài đang phát</h2><p>Tìm một track từ YouTube hoặc SoundCloud để bắt đầu.</p><button type="button" className="button button-inverse" onClick={() => navigateMusic("discover")}><Search size={16} /> Khám phá nhạc</button></>}</div>
        <Artwork track={currentTrack} large />
      </motion.section>
      <Panel title="Trạng thái LocalBot" icon={Activity} action={<span className="status-pill"><span className="state-dot" />{bridgeOnline ? "Sẵn sàng" : "Offline"}</span>} className="health-panel">
        <div className="health-hero"><div className="health-icon">{bridgeOnline ? <Check size={23} /> : <PowerOff size={23} />}</div><div><span className="overline">CONTROL PLANE</span><strong>{bridgeOnline ? "LocalBot đang hoạt động" : "Control API chưa online"}</strong><small>{bridgeOnline ? "Loopback 127.0.0.1:2901 · native runtime" : "Bật bot runtime để đồng bộ Discord và dữ liệu local."}</small></div></div>
        <div className="health-list"><HealthRow icon={AudioLines} label="Control runtime" value={bridgeOnline ? "Sẵn sàng" : "Offline"} detail="Vùng điều khiển local-first" /><HealthRow icon={Music2} label="Music engine" value={bridgeOnline ? "Đã kết nối" : "Chưa kết nối"} detail="YouTube + SoundCloud nếu đã cấu hình" /><HealthRow icon={Server} label="Guild đang chọn" value={selectedGuild ? `${selectedGuild.memberCount.toLocaleString("vi-VN")} thành viên` : "Chưa chọn"} detail={selectedGuild?.name ?? "Chọn guild và voice channel ở footer"} /></div>
      </Panel>
    </div>

    <Panel title="Nghe gần đây" icon={Headphones} action={<button type="button" className="panel-link" onClick={() => navigateMusic("discover")}>Xem khám phá <ChevronRight size={15} /></button>} className="recent-panel"><div className="recent-grid">{recentTracks.map((track) => <TrackCard key={track.id} track={track} onPlay={() => void onPlayTrack(track)} />)}</div>{recentTracks.length === 0 && <EmptyState title="Chưa có lịch sử nghe" detail="Các track đã phát sẽ xuất hiện ở đây sau khi bạn bắt đầu một phiên nghe." action="Khám phá nhạc" onClick={() => navigateMusic("discover")} />}</Panel>

    <div className="lower-grid"><Panel title="Hàng đợi tiếp theo" icon={ListMusic} action={<button type="button" className="panel-link" onClick={() => navigateMusic("queue")}>Mở hàng đợi <ChevronRight size={15} /></button>}><div className="trending-list">{queueTracks.slice(0, 4).map((track, index) => <TrackRow key={track.id} track={track} index={index + 1} onPlay={() => void onPlayTrack(track)} />)}</div>{queueTracks.length === 0 && <EmptyState title="Hàng đợi trống" detail="Thêm track từ trang Khám phá để xây dựng phiên nghe." action="Thêm nhạc" onClick={() => navigateMusic("discover")} />}</Panel><Panel title="Playlist của bạn" icon={Library} action={<button type="button" className="panel-link" onClick={() => navigateMusic("playlists")}>Quản lý <ChevronRight size={15} /></button>}><div className="playlist-grid">{playlists.slice(0, 3).map((playlist, index) => <PlaylistCard key={playlist.id} title={playlist.name} detail={`${playlist.tracks.length} bài${playlist.description ? ` · ${playlist.description}` : ""}`} art={(["orbit", "grid", "wave"] as Track["art"][])[index % 3]!} thumbnail={playlist.tracks[0]?.thumbnail} onClick={() => navigateMusic("playlists")} />)}</div>{playlistsLoading && <div className="inline-note"><RefreshCw size={14} className="is-spinning" /> Đang tải playlist…</div>}{!playlistsLoading && playlists.length === 0 && <EmptyState title="Chưa có playlist" detail="Tạo playlist local để lưu các track yêu thích." action="Tạo playlist" onClick={() => navigateMusic("playlists")} />}</Panel></div>
  </>;
}

function HealthRow({ icon: RowIcon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <div className="health-row"><span className="row-icon"><RowIcon size={17} strokeWidth={1.7} /></span><span className="row-copy"><strong>{label}</strong><small>{detail}</small></span><span className="row-value">{value}</span></div>;
}

function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  return <motion.button type="button" className="track-card" onClick={onPlay} whileHover={{ y: -3 }} transition={{ duration: 0.18 }}><Artwork track={track} /><span className="track-card-title">{track.title}</span><span className="track-card-artist">{track.artist}</span><SourceTag provider={track.provider} /></motion.button>;
}

function TrackRow({ track, index, onPlay, onAdd, onRemove, onMoveUp, onMoveDown, queue = false }: { track: Track; index: number; onPlay: () => void; onAdd?: () => void; onRemove?: () => void; onMoveUp?: () => void; onMoveDown?: () => void; queue?: boolean }) {
  return <motion.div className={`track-row ${queue ? "track-row-queue" : ""}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.025 }}><span className="track-index">{String(index).padStart(2, "0")}</span><Artwork track={track} /><span className="track-row-copy"><strong>{track.title}</strong><small>{track.artist}</small></span><SourceTag provider={track.provider} /><span className="track-duration">{track.duration}</span>{queue && (onMoveUp || onMoveDown) && <span className="queue-reorder-actions">{onMoveUp && <IconButton label={`Đưa ${track.title} lên`} className="small-action" onClick={onMoveUp}><ChevronUp size={15} /></IconButton>}{onMoveDown && <IconButton label={`Đưa ${track.title} xuống`} className="small-action" onClick={onMoveDown}><ChevronDown size={15} /></IconButton>}</span>}{onAdd && <IconButton label={`Thêm ${track.title} vào hàng đợi`} className="small-action" onClick={onAdd}><Plus size={15} /></IconButton>}<IconButton label={`Phát ${track.title}`} className="small-action" onClick={onPlay}><Play size={15} fill="currentColor" /></IconButton>{queue && onRemove && <IconButton label={`Xóa ${track.title}`} className="small-action danger-action" onClick={onRemove}><Trash2 size={15} /></IconButton>}</motion.div>;
}

function PlaylistCard({ title, detail, art, thumbnail, onClick }: { title: string; detail: string; art: Track["art"]; thumbnail?: string | null; onClick: () => void }) {
  return <motion.button type="button" className="playlist-card" onClick={onClick} whileHover={{ y: -3 }} transition={{ duration: 0.18 }}><Artwork track={{ id: title, title, artist: "", duration: "", provider: "youtube", art, thumbnail }} /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={17} /></motion.button>;
}

type MusicPageProps = {
  tab: MusicTab;
  search: string;
  setSearch: (value: string) => void;
  searchSubmitted: string;
  searchSource: SearchSource;
  setSearchSource: (value: SearchSource) => void;
  submitSearch: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  currentTrack: Track | null;
  queueTracks: Track[];
  searchResults: Track[] | null;
  searchLoading: boolean;
  playing: boolean;
  setPlaying: (value: boolean | ((value: boolean) => boolean)) => void;
  volume: number;
  setVolume: (value: number | ((value: number) => number)) => void;
  muted: boolean;
  setMuted: (value: boolean | ((value: boolean) => boolean)) => void;
  shuffle: boolean;
  setShuffle: (value: boolean | ((value: boolean) => boolean)) => void;
  repeatMode: "off" | "all" | "one";
  setRepeatMode: (value: "off" | "all" | "one" | ((value: "off" | "all" | "one") => "off" | "all" | "one")) => void;
  showToast: (message: string) => void;
  navigateMusic: (tab: MusicTab) => void;
  onPlayTrack: (track: Track) => void | Promise<void>;
  onQueueTrack: (track: Track) => void | Promise<void>;
  positionSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
  localPlayback: boolean;
  playerAction: (action: PlayerAction, body?: Record<string, unknown>) => Promise<PlayerActionResult>;
  queueAction: (action: QueueAction, body?: Record<string, unknown>) => Promise<BackendPlayer | null>;
  localMode: boolean;
  localQueueAction: (action: QueueAction, body?: Record<string, unknown>) => Promise<BackendPlayer | null>;
  onRefreshQueue: () => void | Promise<void>;
  guilds: GuildSummary[];
  selectedGuildId: string;
  selectedGuild: GuildSummary | null;
  voiceChannels: VoiceChannelSummary[];
  selectedVoiceChannelId: string;
  musicReadiness: MusicReadiness | null;
  musicReadinessLoading: boolean;
  musicReadinessError: string | null;
  onOpenContext: () => void;
  outputMode: OutputMode;
  onToggleOutput: (target: keyof OutputMode) => void;
  audioOutputDevices: AudioOutputDevice[];
  audioOutputDeviceId: string;
  audioOutputSupported: boolean | null;
  audioOutputLoading: boolean;
  onAudioOutputChange: (deviceId: string) => void | Promise<void>;
  playlists: BackendPlaylist[];
  playlistsLoading: boolean;
  onCreatePlaylist: (name: string, description: string) => void | Promise<void>;
  onDeletePlaylist: (name: string) => void | Promise<void>;
  onUpdatePlaylist: (currentName: string, name: string, description: string) => void | Promise<BackendPlaylist | null>;
  onAddTrackToPlaylist: (name: string, query: string, source: Provider) => void | Promise<void>;
  onRemoveTrackFromPlaylist: (name: string, position: number) => void | Promise<void>;
  onMoveTrackInPlaylist: (name: string, from: number, to: number) => void | Promise<void>;
  onPlayPlaylist: (name: string) => void | Promise<void>;
  equalizer: EqualizerSettings;
  equalizerLoading: boolean;
  onSaveEqualizer: (settings: EqualizerSettings) => void | Promise<void>;
  onApplyEqualizerPreset: (preset: "flat" | "focus" | "warm") => void | Promise<void>;
  providers: ProviderStatus[];
  providersLoading: boolean;
};

function MusicPage({ tab, search, setSearch, searchSubmitted, searchSource, setSearchSource, submitSearch, currentTrack, queueTracks, searchResults, searchLoading, playing, setPlaying, volume, setVolume, muted, setMuted, shuffle, setShuffle, repeatMode, setRepeatMode, showToast, navigateMusic, onPlayTrack, onQueueTrack, playerAction, queueAction, localMode, localQueueAction, onRefreshQueue, selectedGuildId, selectedGuild, voiceChannels, selectedVoiceChannelId, musicReadiness, musicReadinessLoading, musicReadinessError, onOpenContext, outputMode, onToggleOutput, audioOutputDevices, audioOutputDeviceId, audioOutputSupported, audioOutputLoading, onAudioOutputChange, playlists, playlistsLoading, onCreatePlaylist, onDeletePlaylist, onUpdatePlaylist, onAddTrackToPlaylist, onRemoveTrackFromPlaylist, onMoveTrackInPlaylist, onPlayPlaylist, equalizer, equalizerLoading, onSaveEqualizer, onApplyEqualizerPreset, localPlayback, positionSeconds, durationSeconds, onSeek, providers, providersLoading }: MusicPageProps) {
  const content = tab === "now-playing"
    ? <NowPlaying currentTrack={currentTrack} queueTracks={queueTracks} playing={playing} setPlaying={setPlaying} volume={volume} setVolume={setVolume} muted={muted} setMuted={setMuted} shuffle={shuffle} setShuffle={setShuffle} repeatMode={repeatMode} setRepeatMode={setRepeatMode} showToast={showToast} navigateMusic={navigateMusic} onPlayTrack={onPlayTrack} playerAction={playerAction} selectedGuild={selectedGuild} outputMode={outputMode} onToggleOutput={onToggleOutput} audioOutputDevices={audioOutputDevices} audioOutputDeviceId={audioOutputDeviceId} audioOutputSupported={audioOutputSupported} audioOutputLoading={audioOutputLoading} onAudioOutputChange={onAudioOutputChange} localPlayback={localPlayback} positionSeconds={positionSeconds} durationSeconds={durationSeconds} onSeek={onSeek} />
    : tab === "queue"
      ? <QueuePage currentTrack={currentTrack} queueTracks={queueTracks} showToast={showToast} navigateMusic={navigateMusic} onPlayTrack={onPlayTrack} queueAction={queueAction} localMode={localMode} localQueueAction={localQueueAction} onRefresh={onRefreshQueue} />
      : tab === "playlists"
        ? <PlaylistsPage playlists={playlists} loading={playlistsLoading} bridgeOnline={Boolean(selectedGuild)} showToast={showToast} onCreate={onCreatePlaylist} onDelete={onDeletePlaylist} onUpdate={onUpdatePlaylist} onAddTrack={onAddTrackToPlaylist} onRemoveTrack={onRemoveTrackFromPlaylist} onMoveTrack={onMoveTrackInPlaylist} onPlay={onPlayPlaylist} onPlayTrack={onPlayTrack} providers={providers} providersLoading={providersLoading} />
        : tab === "equalizer"
          ? <EqualizerPage settings={equalizer} loading={equalizerLoading} onSave={onSaveEqualizer} onPreset={onApplyEqualizerPreset} />
          : <DiscoverPage search={search} setSearch={setSearch} searchSubmitted={searchSubmitted} searchSource={searchSource} setSearchSource={setSearchSource} submitSearch={submitSearch} searchResults={searchResults} searchLoading={searchLoading} navigateMusic={navigateMusic} onPlayTrack={onPlayTrack} onQueueTrack={onQueueTrack} providers={providers} providersLoading={providersLoading} />;
  return <><MusicContextBar selectedGuild={selectedGuild} selectedGuildId={selectedGuildId} selectedVoiceChannelId={selectedVoiceChannelId} selectedVoiceChannel={voiceChannels.find((channel) => channel.id === selectedVoiceChannelId) ?? null} readiness={musicReadiness} readinessLoading={musicReadinessLoading} readinessError={musicReadinessError} onOpen={onOpenContext} />{content}</>;
}

function MusicContextBar({ selectedGuild, selectedGuildId, selectedVoiceChannelId, selectedVoiceChannel, readiness, readinessLoading, readinessError, onOpen }: { selectedGuild: GuildSummary | null; selectedGuildId: string; selectedVoiceChannelId: string; selectedVoiceChannel: VoiceChannelSummary | null; readiness: MusicReadiness | null; readinessLoading: boolean; readinessError: string | null; onOpen: () => void }) {
  const status = !selectedGuildId ? "Chưa chọn guild" : readinessLoading ? "Đang kiểm tra…" : readiness?.readiness === "ready" ? "Sẵn sàng phát" : readiness?.readiness === "missing_permission" ? `Thiếu ${readiness.missing.join(", ")}` : readiness?.readiness === "unknown" ? "Chưa xác định" : readiness?.readiness === "unsupported" ? "Stage chưa hỗ trợ" : readinessError ? "Không kiểm tra được" : "Chọn phòng nghe";
  const statusClass = readiness?.readiness === "ready" ? "is-good" : readiness?.readiness === "missing_permission" || readiness?.readiness === "unsupported" ? "is-warning" : "";
  return <section className="music-context-bar" aria-label="Bối cảnh phát Discord"><div className="music-context-heading"><span className="context-icon"><Radio size={16} /></span><span><span className="overline">DISCORD OUTPUT CONTEXT</span><strong>{selectedGuild?.name ?? "Chưa chọn guild"}</strong></span></div><div className="music-context-selection"><span><small>Voice channel</small><strong>{selectedVoiceChannel?.name ?? (selectedVoiceChannelId ? "Đang làm mới…" : "Chưa chọn")}</strong></span><span className={`status-pill ${statusClass}`}><span className="state-dot" />{status}</span><button type="button" className="button button-secondary button-small" onClick={onOpen}><Settings2 size={14} /> Chọn guild & phòng</button></div></section>;
}

function DiscoverPage({ search, setSearch, searchSubmitted, searchSource, setSearchSource, submitSearch, searchResults, searchLoading, navigateMusic, onPlayTrack, onQueueTrack, providers, providersLoading }: { search: string; setSearch: (value: string) => void; searchSubmitted: string; searchSource: SearchSource; setSearchSource: (value: SearchSource) => void; submitSearch: (event: FormEvent<HTMLFormElement>) => void | Promise<void>; searchResults: Track[] | null; searchLoading: boolean; navigateMusic: (tab: MusicTab) => void; onPlayTrack: (track: Track) => void | Promise<void>; onQueueTrack: (track: Track) => void | Promise<void>; providers: ProviderStatus[]; providersLoading: boolean }) {
  const results = searchResults ?? [];
  const youtubeReady = providers.find((provider) => provider.id === "youtube")?.enabled === true;
  const soundcloudReady = providers.find((provider) => provider.id === "soundcloud")?.enabled === true;
  const canSearchAll = youtubeReady;
  const sourceButton = (source: SearchSource, label: string, content: React.ReactNode, disabled = false, title?: string) => <button type="button" className={`filter-chip ${searchSource === source ? "is-active" : ""}`} onClick={() => setSearchSource(source)} disabled={disabled} title={title}>{content}{label}</button>;

  useEffect(() => {
    if (!providersLoading && searchSource === "soundcloud" && !soundcloudReady) setSearchSource("youtube");
  }, [providersLoading, searchSource, setSearchSource, soundcloudReady]);

  return <><SectionHeading eyebrow="ÂM NHẠC · KHÁM PHÁ" title="Khám phá" description="Tìm và gom nhạc từ YouTube và SoundCloud trong một không gian local-first." /><section className="search-panel"><SearchBar value={search} setValue={setSearch} onSubmit={submitSearch} /><div className="search-controls"><span className="search-caption">Nguồn tìm kiếm</span>{sourceButton("all", "Tất cả", <span className="state-dot" />, !canSearchAll, providersLoading ? "Đang kiểm tra nguồn nhạc" : "YouTube chưa sẵn sàng")}{sourceButton("youtube", "YouTube", <ProviderMark provider="youtube" />, !youtubeReady, providersLoading ? "Đang kiểm tra nguồn nhạc" : "YouTube chưa sẵn sàng")}{sourceButton("soundcloud", "SoundCloud", <ProviderMark provider="soundcloud" />, providersLoading || !soundcloudReady, providersLoading ? "Đang kiểm tra nguồn nhạc" : "SoundCloud chưa cấu hình credential official")}<span className="search-caption search-caption-end">{searchLoading ? "Đang tải…" : searchResults === null ? (providersLoading ? "Đang kiểm tra nguồn" : "Chưa tìm kiếm") : `${results.length} kết quả · đã lọc trùng`}</span></div>{!providersLoading && !soundcloudReady && <p className="provider-hint">SoundCloud đang tắt vì chưa có credential official ở Node runtime. YouTube vẫn sẵn sàng.</p>}</section><div className="music-discover-grid"><Panel title={searchSubmitted ? `Kết quả cho “${searchSubmitted}”` : "Tìm kiếm nhạc"} icon={Search} action={<span className="status-pill">{searchResults ? "Control API" : "Chưa tìm"}</span>} className="results-panel"><div className="results-list">{searchLoading ? <><SearchResultSkeleton /><SearchResultSkeleton /><SearchResultSkeleton /></> : results.map((track, index) => <TrackRow key={track.id} track={track} index={index + 1} onPlay={() => onPlayTrack(track)} onAdd={() => void onQueueTrack(track)} />)}</div>{!searchLoading && results.length === 0 && <EmptyState title={searchSubmitted ? "Chưa có kết quả" : "Chưa tìm kiếm"} detail={searchSubmitted ? "Thử một từ khóa khác hoặc đổi nguồn tìm kiếm." : "Nhập tên bài hát, nghệ sĩ hoặc URL rồi bắt đầu tìm."} action="Nhập từ khóa" onClick={() => document.querySelector<HTMLInputElement>(".search-bar input")?.focus()} />}</Panel><Panel title="Lối tắt âm nhạc" icon={AudioLines} action={<span className="status-pill">3 module</span>}><div className="shortcut-list"><ShortcutRow icon={Radio} title="Đang phát" detail="Điều khiển track và output đang hoạt động" action="Mở player" onClick={() => navigateMusic("now-playing")} /><ShortcutRow icon={ListMusic} title="Hàng đợi" detail="Xếp thứ tự, đổi chế độ và quản lý nguồn" action="Xem hàng đợi" onClick={() => navigateMusic("queue")} /><ShortcutRow icon={SlidersHorizontal} title="Equalizer" detail="Điều chỉnh chất lượng âm thanh theo thiết bị" action="Mở Equalizer" onClick={() => navigateMusic("equalizer")} /></div></Panel></div></>;
}

function SearchResultSkeleton() {
  return <div className="search-result-skeleton" aria-hidden="true"><span /><span /><span /></div>;
}

function ShortcutRow({ icon: RowIcon, title, detail, action, onClick }: { icon: LucideIcon; title: string; detail: string; action: string; onClick: () => void }) {
  return <button type="button" className="shortcut-row" onClick={onClick}><span className="shortcut-icon"><RowIcon size={17} /></span><span><strong>{title}</strong><small>{detail}</small></span><span className="shortcut-action">{action}<ChevronRight size={16} /></span></button>;
}

type NowPlayingProps = Pick<MusicPageProps, "currentTrack" | "queueTracks" | "playing" | "setPlaying" | "volume" | "setVolume" | "muted" | "setMuted" | "shuffle" | "setShuffle" | "repeatMode" | "setRepeatMode" | "showToast" | "navigateMusic" | "onPlayTrack" | "playerAction" | "selectedGuild" | "outputMode" | "onToggleOutput" | "audioOutputDevices" | "audioOutputDeviceId" | "audioOutputSupported" | "audioOutputLoading" | "onAudioOutputChange"> & { localPlayback: boolean; positionSeconds: number; durationSeconds: number; onSeek: (seconds: number) => void };

function NowPlaying({ currentTrack, queueTracks, playing, setPlaying, volume, setVolume, muted, setMuted, shuffle, setShuffle, repeatMode, setRepeatMode, showToast, navigateMusic, onPlayTrack, playerAction, selectedGuild, outputMode, onToggleOutput, audioOutputDevices, audioOutputDeviceId, audioOutputSupported, audioOutputLoading, onAudioOutputChange, localPlayback, positionSeconds, durationSeconds, onSeek }: NowPlayingProps) {
  const repeatLabel = repeatMode === "off" ? "Lặp tắt" : repeatMode === "all" ? "Lặp hàng đợi" : "Lặp một bài";
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const currentChannel = selectedGuild?.botVoiceChannel?.name ?? "Chưa chọn voice channel";
  const togglePlay = () => {
    if (!currentTrack) {
      showToast("Chưa có track để phát.");
      return;
    }
    const nextPlaying = !playing;
    setPlaying(nextPlaying);
    void playerAction(nextPlaying ? "resume" : "pause").then((result) => {
      if (!result.ok) {
        setPlaying(playing);
        return;
      }
      showToast(nextPlaying ? "Đang tiếp tục phát" : "Đã tạm dừng");
    });
  };
  const toggleShuffle = () => {
    if (!currentTrack) {
      showToast("Chưa có track để đổi chế độ phát.");
      return;
    }
    const nextShuffle = !shuffle;
    setShuffle(nextShuffle);
    void playerAction("shuffle").then((result) => {
      if (!result.ok) {
        setShuffle(!nextShuffle);
        return;
      }
      showToast("Đã đổi chế độ phát ngẫu nhiên");
    });
  };
  const cycleRepeat = () => {
    if (!currentTrack) {
      showToast("Chưa có track để đổi chế độ lặp.");
      return;
    }
    const nextRepeat = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    setRepeatMode(nextRepeat);
    void playerAction("repeat", { mode: nextRepeat }).then((result) => {
      if (!result.ok) {
        setRepeatMode(repeatMode);
        return;
      }
      showToast(nextRepeat === "off" ? "Đã tắt lặp" : nextRepeat === "all" ? "Lặp toàn bộ hàng đợi" : "Lặp một bài");
    });
  };
  const changeVolume = (nextVolume: number) => {
    if (!currentTrack) {
      showToast("Chưa có track để điều chỉnh âm lượng.");
      return;
    }
    setMuted(false);
    setVolume(nextVolume);
    void playerAction("volume", { percent: nextVolume }).then((result) => {
      if (!result.ok) {
        setVolume(volume);
        setMuted(muted);
      }
    });
  };
  const outputCount = Number(outputMode.discord) + Number(outputMode.windows);
  const duration = durationSeconds || (currentTrack ? durationToSeconds(currentTrack.duration) : 0);
  const progress = duration > 0 ? Math.max(0, Math.min(100, positionSeconds / duration * 100)) : 0;
  return <><SectionHeading eyebrow="ÂM NHẠC · PLAYER" title="Đang phát" description="Điều khiển track hiện tại và theo dõi hàng đợi trong một nơi."/><div className="now-playing-grid"><Panel title="Đang phát" icon={Play} action={<span className="status-pill"><span className="state-dot" />{currentTrack ? playing ? "Đang phát" : "Tạm dừng" : "Chưa có track"}</span>} className="now-card"><div className="now-track"><Artwork track={currentTrack} large /><div className="now-details"><span className="overline">{currentTrack ? `NOW PLAYING · ${currentTrack.provider === "youtube" ? "YOUTUBE" : "SOUNDCLOUD"}` : "CHƯA CÓ TRACK"}</span><h2>{currentTrack?.title ?? "Chưa có bài đang phát"}</h2><p>{currentTrack?.artist ?? "Tìm một track để bắt đầu phiên nghe."}</p>{currentTrack && <SourceTag provider={currentTrack.provider} />}</div></div><div className="progress-area"><div className="progress-labels"><span>{formatPlaybackTime(positionSeconds)}</span><span>{duration > 0 ? formatPlaybackTime(duration) : currentTrack?.duration ?? "00:00"}</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /><input type="range" min="0" max={duration || 1} step="1" value={Math.min(positionSeconds, duration || 1)} disabled={!localPlayback || !currentTrack || duration <= 0} aria-label="Vị trí phát hiện tại" onChange={(event) => onSeek(Number(event.currentTarget.value))} /></div></div><div className="transport-controls"><div className="transport-actions"><IconButton label="Phát ngẫu nhiên" disabled={!currentTrack} className={shuffle ? "is-toggled" : ""} onClick={toggleShuffle}><Shuffle size={18} /></IconButton><IconButton label="Bài trước" disabled={!currentTrack} onClick={() => { void playerAction("previous"); showToast("Đã phát bài trước"); }}><SkipBack size={18} /></IconButton><motion.button type="button" className="play-toggle" aria-label={playing ? "Tạm dừng" : "Tiếp tục phát"} onClick={togglePlay} disabled={!currentTrack} whileTap={{ scale: currentTrack ? 0.92 : 1 }}><AnimatePresence mode="wait" initial={false}><motion.span key={playing ? "pause" : "play"} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.16 }}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</motion.span></AnimatePresence></motion.button><IconButton label="Bài tiếp theo" disabled={!currentTrack} onClick={() => { void playerAction("skip"); showToast("Đã chuyển bài tiếp theo"); }}><SkipForward size={18} /></IconButton><IconButton label={repeatLabel} disabled={!currentTrack} className={repeatMode !== "off" ? "is-toggled" : ""} onClick={cycleRepeat}><RepeatIcon size={18} /></IconButton></div><div className="volume-control"><IconButton label={muted ? "Bật âm lượng" : "Tắt âm lượng"} disabled={!currentTrack} animated={false} onClick={() => { const nextMuted = !muted; setMuted(nextMuted); void playerAction("volume", { percent: nextMuted ? 0 : volume }); }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</IconButton><div className="volume-popover" role="group" aria-label="Điều chỉnh âm lượng"><div className="volume-popover-head"><strong>Âm lượng</strong><span>{muted ? 0 : volume}%</span></div><label htmlFor="volume-slider" className="sr-only">Âm lượng {muted ? 0 : volume}%</label><input id="volume-slider" type="range" min="0" max="100" value={muted ? 0 : volume} disabled={!currentTrack} onChange={(event) => changeVolume(Number(event.currentTarget.value))} /></div></div></div><div className="output-section"><div className="output-heading"><div><span className="overline">PHÁT ĐẾN</span><strong>Chọn một hoặc cả hai đích cùng lúc</strong></div><span className="output-count">{outputCount}/2</span></div><div className="output-grid"><OutputTarget icon={Radio} title="Discord" detail={currentChannel} active={outputMode.discord} onClick={() => onToggleOutput("discord")} /><OutputTarget icon={Volume2} title="Windows" detail="Loa Windows · local" active={outputMode.windows} onClick={() => onToggleOutput("windows")} /></div><div className="output-device-row"><span className="output-device-icon"><Volume2 size={16} /></span><span className="output-device-copy"><strong>Thiết bị Windows</strong><small>{audioOutputLoading ? "Đang kiểm tra thiết bị…" : audioOutputSupported === true ? `${Math.max(audioOutputDevices.length - 1, 0)} thiết bị khả dụng` : audioOutputSupported === false ? "WebView không hỗ trợ routing · dùng mặc định" : "Đang kiểm tra khả năng routing…"}</small></span><select aria-label="Thiết bị phát Windows" value={audioOutputDeviceId} disabled={audioOutputSupported !== true || audioOutputLoading} onChange={(event) => { void onAudioOutputChange(event.currentTarget.value); }}>{audioOutputDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></div></div></Panel><Panel title="Hàng đợi" icon={ListMusic} action={<button type="button" className="panel-link" onClick={() => navigateMusic("queue")}>Xem tất cả <ChevronRight size={15} /></button>} className="now-queue-panel"><div className="queue-preview">{queueTracks.slice(0, 3).map((track, index) => <TrackRow key={track.id} track={track} index={index + 1} onPlay={() => void onPlayTrack(track)} queue />)}</div>{queueTracks.length === 0 && <EmptyState title="Hàng đợi trống" detail="Thêm track từ trang Khám phá để xây dựng phiên nghe." action="Khám phá nhạc" onClick={() => navigateMusic("discover")} />}<div className="queue-footer"><span>{queueTracks.length} bài · {selectedGuild ? "Control API" : localPlayback ? "Local output" : "Chưa kết nối"}</span><button type="button" className="text-action" onClick={() => navigateMusic("queue")}>Mở hàng đợi <ChevronRight size={15} /></button></div></Panel></div></>;
}

function OutputTarget({ icon: TargetIcon, title, detail, active, onClick }: { icon: LucideIcon; title: string; detail: string; active?: boolean; onClick: () => void }) {
  return <button type="button" className={`output-target ${active ? "is-active" : ""}`} onClick={onClick}><span className="output-icon"><TargetIcon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><span className="output-check">{active && <Check size={15} />}</span></button>;
}

function QueuePage({ currentTrack, queueTracks, showToast, navigateMusic, onPlayTrack, queueAction, localMode, localQueueAction, onRefresh }: { currentTrack: Track | null; queueTracks: Track[]; showToast: (message: string) => void; navigateMusic: (tab: MusicTab) => void; onPlayTrack: (track: Track) => void | Promise<void>; queueAction: (action: QueueAction, body?: Record<string, unknown>) => Promise<BackendPlayer | null>; localMode: boolean; localQueueAction: (action: QueueAction, body?: Record<string, unknown>) => Promise<BackendPlayer | null>; onRefresh: () => void | Promise<void> }) {
  const activeQueueAction = localMode ? localQueueAction : queueAction;
  const removeTrack = (track: Track, position: number) => { void activeQueueAction("remove", { position }).then((result) => { if (localMode || result) showToast(`Đã xóa ${track.title} khỏi hàng đợi`); }); };
  const moveTrack = (from: number, to: number) => { void activeQueueAction("move", { from, to }).then((result) => { if (localMode || result) showToast("Đã sắp xếp lại hàng đợi"); }); };
  const clearPending = () => { void activeQueueAction("clear").then((result) => { if (localMode || result) showToast("Đã xóa các bài đang chờ"); }); };
  const refresh = () => { void Promise.resolve(onRefresh()).then(() => showToast(localMode ? "Hàng đợi Windows đã được cập nhật." : "Hàng đợi đã được làm mới.")); };
  return <><SectionHeading eyebrow="ÂM NHẠC · HÀNG ĐỢI" title="Hàng đợi" description="Xem nguồn đã thêm, đổi thứ tự hoặc xóa track trước khi phát." action={<div className="heading-actions"><button type="button" className="button button-secondary" onClick={refresh}><RefreshCw size={16} /> Làm mới</button><button type="button" className="button button-primary" onClick={() => navigateMusic("discover")}><Plus size={16} /> Thêm nhạc</button></div>} /><div className="queue-layout"><Panel title="Đang phát" icon={Play} action={currentTrack ? <SourceTag provider={currentTrack.provider} /> : <span className="status-pill">Chưa có track</span>}>{currentTrack ? <div className="queue-current"><Artwork track={currentTrack} /><div><span className="overline">NOW PLAYING</span><h2>{currentTrack.title}</h2><p>{currentTrack.artist}</p><SourceTag provider={currentTrack.provider} /></div><button type="button" className="text-action" onClick={() => navigateMusic("now-playing")}>Mở player <ChevronRight size={15} /></button></div> : <EmptyState title="Chưa có bài đang phát" detail="Tìm một track và bấm Phát để bắt đầu phiên nghe." action="Khám phá nhạc" onClick={() => navigateMusic("discover")} />}</Panel><Panel title="Hàng đợi tiếp theo" icon={ListMusic} action={<button type="button" className="button button-secondary button-small" onClick={clearPending} disabled={queueTracks.length === 0}><Trash2 size={14} /> Xóa hàng đợi</button>}><div className="full-queue-list">{queueTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index + 1} onPlay={() => onPlayTrack(track)} onMoveUp={index > 0 ? () => moveTrack(index + 1, index) : undefined} onMoveDown={index < queueTracks.length - 1 ? () => moveTrack(index + 1, index + 2) : undefined} onRemove={() => removeTrack(track, index + 1)} queue />)}</div>{queueTracks.length === 0 && <EmptyState title="Hàng đợi trống" detail="Tìm một track rồi thêm vào phiên nghe hiện tại." action="Khám phá nhạc" onClick={() => navigateMusic("discover")} />}</Panel></div></>;
}

type PlaylistPageProps = {
  playlists: BackendPlaylist[];
  loading: boolean;
  bridgeOnline: boolean;
  showToast: (message: string) => void;
  onCreate: (name: string, description: string) => void | Promise<void>;
  onDelete: (name: string) => void | Promise<void>;
  onUpdate: (currentName: string, name: string, description: string) => void | Promise<BackendPlaylist | null>;
  onAddTrack: (name: string, query: string, source: Provider) => void | Promise<void>;
  onRemoveTrack: (name: string, position: number) => void | Promise<void>;
  onMoveTrack: (name: string, from: number, to: number) => void | Promise<void>;
  onPlay: (name: string) => void | Promise<void>;
  onPlayTrack: (track: Track) => void | Promise<void>;
  providers: ProviderStatus[];
  providersLoading: boolean;
};

function PlaylistsPage({ playlists, loading, bridgeOnline, showToast, onCreate, onDelete, onUpdate, onAddTrack, onRemoveTrack, onMoveTrack, onPlay, onPlayTrack, providers, providersLoading }: PlaylistPageProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addSource, setAddSource] = useState<Provider>("youtube");
  const [detailBusy, setDetailBusy] = useState(false);
  const soundcloudReady = providers.find((provider) => provider.id === "soundcloud")?.enabled === true;
  const items = playlists.map((playlist, index) => ({ name: playlist.name, detail: `${playlist.tracks.length} bài${playlist.description ? ` · ${playlist.description}` : ""}`, art: (["orbit", "grid", "wave"] as Track["art"][])[index % 3]!, thumbnail: playlist.tracks[0]?.thumbnail ?? null, provider: playlist.tracks[0]?.provider ?? "youtube" as Provider }));
  const selectedPlaylist = playlists.find((playlist) => playlist.name === selectedName) ?? null;

  useEffect(() => {
    if (!providersLoading && addSource === "soundcloud" && !soundcloudReady) setAddSource("youtube");
  }, [addSource, providersLoading, setAddSource, soundcloudReady]);

  useEffect(() => {
    if (!selectedName) return;
    if (!selectedPlaylist) {
      setSelectedName(null);
      return;
    }
    setEditName(selectedPlaylist.name);
    setEditDescription(selectedPlaylist.description);
  }, [bridgeOnline, selectedName, selectedPlaylist?.id, selectedPlaylist?.updatedAt]);

  const submit = () => {
    const cleanName = name.trim();
    if (!cleanName) { showToast("Hãy nhập tên playlist."); return; }
    void onCreate(cleanName, description.trim());
    setName("");
    setDescription("");
  };

  const openPlaylist = (playlistName: string) => {
    setSelectedName(playlistName);
  };

  const confirmDelete = (playlistName: string) => {
    if (!window.confirm(`Xóa playlist “${playlistName}”? Các track trong playlist cũng sẽ bị xóa khỏi thư viện local.`)) return;
    if (selectedName === playlistName) setSelectedName(null);
    void onDelete(playlistName);
  };

  const saveDetails = async () => {
    if (!selectedPlaylist) return;
    const cleanName = editName.trim();
    if (!cleanName) {
      showToast("Tên playlist không được để trống.");
      return;
    }
    setDetailBusy(true);
    try {
      const updated = await onUpdate(selectedPlaylist.name, cleanName, editDescription.trim());
      if (updated) setSelectedName(updated.name);
    } finally {
      setDetailBusy(false);
    }
  };

  const addTrack = async () => {
    if (!selectedPlaylist) return;
    const cleanQuery = addQuery.trim();
    if (!cleanQuery) {
      showToast("Nhập tên bài hát hoặc dán URL trước.");
      return;
    }
    setDetailBusy(true);
    try {
      await onAddTrack(selectedPlaylist.name, cleanQuery, addSource);
      setAddQuery("");
    } finally {
      setDetailBusy(false);
    }
  };

  const detailPanel = selectedPlaylist ? <PlaylistDetail playlist={selectedPlaylist} editName={editName} editDescription={editDescription} addQuery={addQuery} addSource={addSource} soundcloudReady={soundcloudReady} providersLoading={providersLoading} busy={detailBusy} setEditName={setEditName} setEditDescription={setEditDescription} setAddQuery={setAddQuery} setAddSource={setAddSource} onSave={() => void saveDetails()} onAdd={() => void addTrack()} onPlay={() => void onPlay(selectedPlaylist.name)} onPlayTrack={onPlayTrack} onRemove={(position) => void onRemoveTrack(selectedPlaylist.name, position)} onMove={(from, to) => void onMoveTrack(selectedPlaylist.name, from, to)} /> : <Panel title="Tạo playlist" icon={Plus}><div className="playlist-form"><label htmlFor="playlist-name">Tên playlist</label><input id="playlist-name" value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Ví dụ: Làm việc buổi tối" /><label htmlFor="playlist-description">Mô tả ngắn</label><textarea id="playlist-description" value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Playlist này dùng cho..." /><button type="button" className="button button-primary" onClick={submit}><Check size={16} /> Lưu playlist</button><small className="form-hint">Tạo xong, chọn playlist bên trái để sửa, thêm track, đổi thứ tự hoặc phát ngay.</small></div></Panel>;

  return <><SectionHeading eyebrow="ÂM NHẠC · LOCAL LIBRARY" title="Danh sách phát" description="Lưu playlist local, chỉnh sửa nhanh và giữ trải nghiệm riêng tư trên máy bạn." action={<button type="button" className="button button-primary" onClick={submit} disabled={!bridgeOnline}><Plus size={16} /> Tạo playlist</button>} /><div className="library-grid"><Panel title="Playlist local" icon={Library} action={<span className="status-pill">{loading ? "Đang tải…" : `${playlists.length} playlist`}</span>}><div className="playlist-list">{loading && <><SkeletonRow /><SkeletonRow /></>}{!loading && items.map((playlist) => <PlaylistLarge key={playlist.name} title={playlist.name} detail={playlist.detail} art={playlist.art} thumbnail={playlist.thumbnail} provider={playlist.provider} selected={playlist.name === selectedName} onClick={() => openPlaylist(playlist.name)} onPlay={() => void onPlay(playlist.name)} onDelete={() => confirmDelete(playlist.name)} />)}</div>{!loading && items.length === 0 && <EmptyState title="Chưa có playlist" detail={bridgeOnline ? "Tạo playlist đầu tiên để lưu các track yêu thích." : "Bật bot runtime và chọn guild để tải thư viện playlist local."} action={bridgeOnline ? "Tạo playlist" : "Bật bot runtime"} onClick={() => bridgeOnline ? showToast("Nhập tên rồi bấm Tạo playlist") : showToast("Bật bot runtime bằng nút ở sticky footer")} />}</Panel><AnimatePresence mode="wait" initial={false}><motion.div key={selectedPlaylist?.id ?? "create-playlist"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>{detailPanel}</motion.div></AnimatePresence></div></>;
}

function PlaylistLarge({ title, detail, art, thumbnail, provider = "youtube", selected = false, onClick, onPlay, onDelete }: { title: string; detail: string; art: Track["art"]; thumbnail?: string | null; provider?: Provider; selected?: boolean; onClick: () => void; onPlay?: () => void; onDelete?: () => void }) {
  return <motion.div className={`playlist-large ${selected ? "is-selected" : ""}`} animate={{ opacity: 1 }} whileHover={{ y: -1 }} transition={{ duration: 0.16 }}><button type="button" className="playlist-large-main" onClick={onClick} aria-current={selected ? "true" : undefined}><Artwork track={{ id: title, title, artist: "", duration: "", provider, art, thumbnail }} /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={15} className="playlist-open-icon" /></button>{onPlay && <IconButton label={`Phát playlist ${title}`} className="small-action" onClick={onPlay}><Play size={14} fill="currentColor" /></IconButton>}{onDelete && <IconButton label={`Xóa playlist ${title}`} className="small-action danger-action" onClick={onDelete}><Trash2 size={15} /></IconButton>}</motion.div>;
}

function PlaylistDetail({ playlist, editName, editDescription, addQuery, addSource, soundcloudReady, providersLoading, busy, setEditName, setEditDescription, setAddQuery, setAddSource, onSave, onAdd, onPlay, onPlayTrack, onRemove, onMove }: { playlist: BackendPlaylist; editName: string; editDescription: string; addQuery: string; addSource: Provider; soundcloudReady: boolean; providersLoading: boolean; busy: boolean; setEditName: (value: string) => void; setEditDescription: (value: string) => void; setAddQuery: (value: string) => void; setAddSource: (value: Provider) => void; onSave: () => void; onAdd: () => void; onPlay: () => void; onPlayTrack: (track: Track) => void | Promise<void>; onRemove: (position: number) => void; onMove: (from: number, to: number) => void }) {
  return <Panel title="Chi tiết playlist" icon={ListMusic} action={<button type="button" className="button button-primary button-small" onClick={onPlay} disabled={busy || playlist.tracks.length === 0}><Play size={14} fill="currentColor" /> Phát playlist</button>}><div className="playlist-detail"><div className="playlist-edit-form"><div className="form-field"><label htmlFor="playlist-edit-name">Tên playlist</label><input id="playlist-edit-name" value={editName} onChange={(event) => setEditName(event.currentTarget.value)} maxLength={80} /></div><div className="form-field"><label htmlFor="playlist-edit-description">Mô tả ngắn</label><textarea id="playlist-edit-description" value={editDescription} onChange={(event) => setEditDescription(event.currentTarget.value)} maxLength={500} placeholder="Playlist này dùng cho..." /></div><button type="button" className="button button-secondary" onClick={onSave} disabled={busy}><Check size={15} /> Lưu thay đổi</button></div><div className="playlist-add-section"><div className="detail-section-heading"><div><span className="overline">THÊM TRACK</span><strong>Tên bài hát hoặc URL</strong></div><span className="status-pill">{playlist.tracks.length} track</span></div><div className="playlist-add-form"><input id="playlist-add-query" aria-label="Tên bài hát hoặc URL" value={addQuery} onChange={(event) => setAddQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") onAdd(); }} placeholder="Ví dụ: Nơi này có anh hoặc URL YouTube" /><select aria-label="Nguồn nhạc" value={addSource} onChange={(event) => setAddSource(event.currentTarget.value as Provider)}><option value="youtube">YouTube</option><option value="soundcloud" disabled={!providersLoading && !soundcloudReady}>SoundCloud{!providersLoading && !soundcloudReady ? " · chưa cấu hình" : ""}</option></select><button type="button" className="button button-primary" onClick={onAdd} disabled={busy}><Plus size={15} /> Thêm</button></div>{!providersLoading && !soundcloudReady && <p className="provider-hint">SoundCloud chưa sẵn sàng; hãy cấu hình credential official ở Node trước khi thêm bằng từ khóa.</p>}</div><div className="playlist-detail-tracks">{playlist.tracks.map((track, index) => <PlaylistTrackRow key={`${track.provider}-${track.id}`} track={toUiTrack(track, index)} position={index + 1} first={index === 0} last={index === playlist.tracks.length - 1} onPlay={() => void onPlayTrack(toUiTrack(track, index))} onRemove={() => onRemove(index + 1)} onMoveUp={() => onMove(index + 1, index)} onMoveDown={() => onMove(index + 1, index + 2)} />)}{playlist.tracks.length === 0 && <EmptyState title="Playlist đang trống" detail="Thêm tên bài hát hoặc dán URL để lưu track vào playlist này." action="Nhập track" onClick={() => document.getElementById("playlist-add-query")?.focus()} />}</div></div></Panel>;
}

function PlaylistTrackRow({ track, position, first, last, onPlay, onRemove, onMoveUp, onMoveDown }: { track: Track; position: number; first: boolean; last: boolean; onPlay: () => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void }) {
  return <motion.div className="playlist-track-row" layout initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, delay: position * 0.02 }}><span className="track-index">{String(position).padStart(2, "0")}</span><button type="button" className="playlist-track-main" onClick={onPlay}><Artwork track={track} /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><SourceTag provider={track.provider} /><span className="track-duration">{track.duration}</span><span className="playlist-track-actions">{!first && <IconButton label={`Đưa ${track.title} lên`} className="small-action" onClick={onMoveUp}><ChevronUp size={14} /></IconButton>}{!last && <IconButton label={`Đưa ${track.title} xuống`} className="small-action" onClick={onMoveDown}><ChevronDown size={14} /></IconButton>}<IconButton label={`Xóa ${track.title} khỏi playlist`} className="small-action danger-action" onClick={onRemove}><Trash2 size={14} /></IconButton></span></motion.div>;
}

function EqualizerPage({ settings, loading, onSave, onPreset }: { settings: EqualizerSettings; loading: boolean; onSave: (settings: EqualizerSettings) => void | Promise<void>; onPreset: (preset: "flat" | "focus" | "warm") => void | Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const update = (band: keyof EqualizerSettings, value: number) => setDraft((current) => ({ ...current, [band]: value }));
  const reset = () => { const flat = { bass: 0, mid: 0, treble: 0 }; setDraft(flat); void onSave(flat); };
  return <><SectionHeading eyebrow="ÂM NHẠC · AUDIO" title="Equalizer" description="Tinh chỉnh trải nghiệm nghe theo thiết bị và gu của bạn." action={<span className="status-pill">{loading ? "Đang lưu…" : "-12 → +12 dB"}</span>} /><div className="equalizer-grid"><Panel title="Cấu hình âm thanh" icon={SlidersHorizontal} action={<span className="status-pill">{settings.bass >= 0 ? "+" : ""}{settings.bass} / {settings.mid >= 0 ? "+" : ""}{settings.mid} / {settings.treble >= 0 ? "+" : ""}{settings.treble} dB</span>}><div className="eq-controls"><EqSlider label="Bass" value={draft.bass} onChange={(value) => update("bass", value)} /><EqSlider label="Mid" value={draft.mid} onChange={(value) => update("mid", value)} /><EqSlider label="Treble" value={draft.treble} onChange={(value) => update("treble", value)} /></div><div className="form-actions"><button type="button" className="button button-secondary" onClick={reset}><RotateCcwIcon /> Đặt lại</button><button type="button" className="button button-primary" onClick={() => void onSave(draft)}><Check size={16} /> Lưu cấu hình</button></div></Panel><Panel title="Preset" icon={AudioLines}><div className="preset-list"><PresetRow title="Flat" detail="Âm thanh cân bằng, giữ nguyên bản gốc." icon={<SlidersHorizontal size={16} />} onClick={() => void onPreset("flat")} /><PresetRow title="Focus" detail="Rõ giọng và chi tiết khi làm việc." icon={<Headphones size={16} />} onClick={() => void onPreset("focus")} /><PresetRow title="Warm" detail="Âm trầm mềm cho nghe thư giãn." icon={<AudioLines size={16} />} onClick={() => void onPreset("warm")} /></div></Panel></div></>;
}

function RotateCcwIcon() {
  return <RotateCcw size={16} />;
}

function EqSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="eq-slider"><span><strong>{label}</strong><em>{value >= 0 ? "+" : ""}{value} dB</em></span><input type="range" min="-12" max="12" value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /></label>;
}

function PresetRow({ title, detail, icon, onClick }: { title: string; detail: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" className="preset-row" onClick={onClick}><span className="preset-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={17} /></button>;
}

function SettingsPage({ theme, setTheme, bridgeOnline, botProcessSupported, showToast, providers, providersLoading, ollamaSettings, ollamaHealth, ollamaLoading, onUpdateOllama, onCheckOllama, ollamaSuggestion, ollamaSuggestionQuery, setOllamaSuggestionQuery, ollamaSuggestionSurface, setOllamaSuggestionSurface, ollamaSuggestionLoading, onRequestOllamaSuggestion, onExportBackup, onRestoreBackup, restorePending, onRestartBot, restartBusy, onToggleSoundCloud, onTestSoundCloud }: { theme: ThemeMode; setTheme: (theme: ThemeMode) => void; bridgeOnline: boolean; botProcessSupported: boolean; showToast: (message: string) => void; providers: ProviderStatus[]; providersLoading: boolean; ollamaSettings: OllamaSettings; ollamaHealth: OllamaHealth; ollamaLoading: boolean; onUpdateOllama: (patch: Partial<OllamaSettings>) => void | Promise<void>; onCheckOllama: () => void | Promise<void>; ollamaSuggestion: OllamaSuggestion | null; ollamaSuggestionQuery: string; setOllamaSuggestionQuery: (value: string) => void; ollamaSuggestionSurface: OllamaSuggestionSurface; setOllamaSuggestionSurface: (value: OllamaSuggestionSurface) => void; ollamaSuggestionLoading: boolean; onRequestOllamaSuggestion: () => void | Promise<void>; onExportBackup: () => void | Promise<void>; onRestoreBackup: (file: File) => void | Promise<void>; restorePending: boolean; onRestartBot: () => void | Promise<void>; restartBusy: boolean; onToggleSoundCloud: (enabled: boolean) => void | Promise<void>; onTestSoundCloud: () => void | Promise<void> }) {
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const provider = (id: Provider) => providers.find((item) => item.id === id);
  const youtube = provider("youtube");
  const soundcloud = provider("soundcloud");
  const [ollamaBaseUrlDraft, setOllamaBaseUrlDraft] = useState(ollamaSettings.baseUrl);
  const [ollamaModelDraft, setOllamaModelDraft] = useState(ollamaSettings.model);
  useEffect(() => {
    setOllamaBaseUrlDraft(ollamaSettings.baseUrl);
    setOllamaModelDraft(ollamaSettings.model);
  }, [ollamaSettings.baseUrl, ollamaSettings.model]);
  useEffect(() => {
    let active = true;
    void isAutostartEnabled()
      .then((enabled) => { if (active) setAutostartEnabled(enabled); })
      .catch(() => { if (active) setAutostartEnabled(null); });
    return () => { active = false; };
  }, []);
  const toggleAutostart = async () => {
    if (autostartEnabled === null || autostartBusy) return;
    const next = !autostartEnabled;
    setAutostartBusy(true);
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
      const confirmed = await isAutostartEnabled();
      setAutostartEnabled(confirmed);
      showToast(confirmed ? "LocalBot sẽ khởi động cùng Windows" : "Đã tắt khởi động cùng Windows");
    } catch {
      showToast("Không thể cập nhật khởi động cùng Windows trên máy này");
    } finally {
      setAutostartBusy(false);
    }
  };
  return <><SectionHeading eyebrow="LOCALBOT · PREFERENCES" title="Cài đặt" description="Tuỳ chỉnh giao diện, kết nối local và nguồn nhạc theo cách bạn muốn." /><div className="settings-grid"><Panel title="Giao diện" icon={SunMoon} action={<span className="status-pill">{themeOptions.find((item) => item.id === theme)?.label}</span>}><div className="theme-cards">{themeOptions.map((option) => { const ThemeIcon = option.icon; return <button type="button" key={option.id} className={`theme-card ${theme === option.id ? "is-active" : ""}`} onClick={() => { setTheme(option.id); showToast(`Đã chuyển sang ${option.label}`); }}><span className={`theme-preview theme-preview-${option.id}`}><span /></span><span><strong>{option.label}</strong><small>{option.id === "default" ? "Pha trộn sáng · tối" : option.id === "dark" ? "Tối hoàn toàn" : "Sáng hoàn toàn"}</small></span><span className="theme-card-icon"><ThemeIcon size={17} />{theme === option.id && <Check size={14} />}</span></button>; })}</div></Panel><Panel title="Control runtime" icon={Radio} action={<span className={`status-pill ${bridgeOnline ? "is-good" : ""}`}><span className="state-dot" />{bridgeOnline ? "Online" : "Offline"}</span>}><div className="settings-detail"><SettingRow icon={Server} label="Loopback" detail="127.0.0.1:2901 · chỉ chạy local" value="Port 2901" /><SettingRow icon={ShieldCheck} label="Bảo mật" detail="Token và credential không rời Node runtime" value="Server-side" /><SettingRow icon={Activity} label="Trạng thái" detail={bridgeOnline ? "Control API đang phản hồi" : "Bật bot runtime để kết nối"} value={bridgeOnline ? "Sẵn sàng" : "Offline"} /><div className="startup-setting"><span className="setting-icon"><Power size={17} strokeWidth={1.7} /></span><span><strong>Khởi động cùng Windows</strong><small>{autostartEnabled === null ? "Không thể đọc trạng thái Windows startup" : "Mở native app khi bạn đăng nhập Windows"}</small></span><button type="button" className={`switch-control ${autostartEnabled ? "is-active" : ""}`} role="switch" aria-checked={autostartEnabled === true} aria-label="Khởi động LocalBot cùng Windows" disabled={autostartEnabled === null || autostartBusy} onClick={() => { void toggleAutostart(); }}><span /></button></div><div className="backup-actions"><button type="button" className="button button-secondary" onClick={() => { void onExportBackup(); }} disabled={!bridgeOnline}><Download size={16} /> Xuất backup local</button><button type="button" className="button button-secondary" onClick={() => restoreInputRef.current?.click()} disabled={!bridgeOnline}><Upload size={16} /> Nhập backup local</button><input ref={restoreInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onRestoreBackup(file); }} /></div>{restorePending && <div className="restore-pending"><CircleAlert size={16} /><span><strong>Backup đã ghi vào local.</strong><small>Runtime hiện tại chưa nạp dữ liệu mới; khởi động lại bot để áp dụng đồng bộ.</small></span><button type="button" className="button button-primary button-small" onClick={() => { void onRestartBot(); }} disabled={!botProcessSupported || !bridgeOnline || restartBusy}><RefreshCw size={14} className={restartBusy ? "is-spinning" : ""} /> {restartBusy ? "Đang khởi động lại…" : "Áp dụng ngay"}</button></div>}<p className="provider-hint">Backup gồm dữ liệu playlist, quyền Music, Equalizer, Community, audit, Welcome/Goodbye, AutoMod và Ollama; không gồm token hoặc credential. Trước khi thay thế, LocalBot giữ một recovery copy.</p></div></Panel><OllamaSettingsPanel settings={ollamaSettings} health={ollamaHealth} loading={ollamaLoading} bridgeOnline={bridgeOnline} baseUrlDraft={ollamaBaseUrlDraft} modelDraft={ollamaModelDraft} setBaseUrlDraft={setOllamaBaseUrlDraft} setModelDraft={setOllamaModelDraft} ollamaSuggestion={ollamaSuggestion} ollamaSuggestionQuery={ollamaSuggestionQuery} setOllamaSuggestionQuery={setOllamaSuggestionQuery} ollamaSuggestionSurface={ollamaSuggestionSurface} setOllamaSuggestionSurface={setOllamaSuggestionSurface} ollamaSuggestionLoading={ollamaSuggestionLoading} onRequestOllamaSuggestion={onRequestOllamaSuggestion} onUpdate={onUpdateOllama} onCheck={onCheckOllama} /><Panel title="Nguồn nhạc" icon={Music2} action={<span className="status-pill">{providersLoading ? "Đang tải…" : bridgeOnline ? `${providers.length} nguồn đã kiểm tra` : "Chưa kiểm tra"}</span>}><div className="settings-detail"><SettingRow icon={ProviderYoutubeIcon} label="YouTube" detail="Nguồn mặc định · youtubei.js" value={youtube ? youtube.configured ? "Sẵn sàng" : "Chưa sẵn sàng" : "Chưa kiểm tra"} /><SettingRow icon={ProviderSoundcloudIcon} label="SoundCloud" detail="Official OAuth · credential chỉ ở Node/env" value={soundcloud ? soundcloud.configured ? soundcloud.enabled ? "Đang bật" : "Đã tắt" : "Chưa cấu hình" : "Chưa kiểm tra"} /><div className="provider-control-row"><span><strong>Cho phép tìm và phát SoundCloud</strong><small>{soundcloud?.configured ? "Chỉ lưu trạng thái bật/tắt ở local; credential vẫn ở Node/env." : "Cấu hình credential official ở Node/env trước khi bật."}</small></span><button type="button" className={`switch-control ${soundcloud?.enabled ? "is-active" : ""}`} role="switch" aria-checked={soundcloud?.enabled === true} aria-label="Bật hoặc tắt SoundCloud" disabled={!soundcloud?.configured || providersLoading} onClick={() => { void onToggleSoundCloud(!soundcloud?.enabled); }}><span /></button></div><div className="provider-actions"><button type="button" className="button button-secondary" onClick={() => { void onTestSoundCloud(); }} disabled={!soundcloud?.configured || !soundcloud.enabled || providersLoading}><RefreshCw size={15} /> Kiểm tra kết nối</button><button type="button" className="button button-secondary" onClick={() => showToast(soundcloud?.configured ? "SoundCloud dùng official OAuth; credential không nhập trong native app ở phiên bản này." : "Thêm SOUNDCLOUD_CLIENT_ID và SOUNDCLOUD_CLIENT_SECRET trong env rồi khởi động lại bot")}><Settings2 size={15} /> {soundcloud?.configured ? "Hướng dẫn" : "Cấu hình env"}</button></div></div></Panel></div></>;
}

function RuntimeDiagnosticsPanel({ diagnostics, loading, bridgeOnline, onRefresh }: { diagnostics: RuntimeDiagnostics | null; loading: boolean; bridgeOnline: boolean; onRefresh: () => void | Promise<void> }) {
  const statusLabel = diagnostics?.status === "ready" ? "Sẵn sàng" : diagnostics?.status === "starting" ? "Đang khởi động" : diagnostics?.status === "degraded" ? "Cần chú ý" : bridgeOnline ? "Chưa có snapshot" : "Offline";
  const statusGood = diagnostics?.status === "ready";
  return <div className="settings-diagnostics"><Panel title="Readiness của LocalBot" icon={Activity} action={<div className="panel-actions"><span className={`status-pill ${statusGood ? "is-good" : ""}`}><span className="state-dot" />{loading ? "Đang kiểm tra…" : statusLabel}</span><button type="button" className="button button-secondary button-small" onClick={() => { void onRefresh(); }} disabled={loading || !bridgeOnline}><RefreshCw size={14} className={loading ? "is-spinning" : ""} /> Kiểm tra</button></div>}>
    {!bridgeOnline && <div className="diagnostics-empty"><CircleAlert size={17} /><span><strong>Control API đang offline</strong><small>Bật bot runtime ở sticky footer để đọc readiness thật; LocalBot không hiển thị snapshot giả.</small></span></div>}
    {bridgeOnline && !diagnostics && <div className="diagnostics-empty"><LoaderCircle size={17} className={loading ? "is-spinning" : ""} /><span><strong>Đang chờ diagnostics</strong><small>Runtime chưa trả về snapshot; hãy thử lại nếu trạng thái không đổi.</small></span></div>}
    {diagnostics && <div className="diagnostics-body"><div className="diagnostics-summary"><div><span className="overline">PROFILE</span><strong>{diagnostics.profile}</strong><small>{diagnostics.discord.ready ? `${diagnostics.discord.guildCount} guild · ${diagnostics.discord.botTag ?? "bot chưa có tag"}` : "Discord gateway chưa Ready"}</small></div><div><span className="overline">CONTROL</span><strong>{diagnostics.control.enabled ? `${diagnostics.control.host}:${diagnostics.control.port}` : "Tắt theo profile"}</strong><small>{diagnostics.control.ownerPresent ? "Ownership đã xác nhận" : "Không yêu cầu hoặc chưa có ownership"}</small></div></div><div className="diagnostics-check-list">{diagnostics.checks.map((check) => <div className="diagnostics-check" key={check.id}><span className={`diagnostics-check-icon is-${check.status}`}>{check.status === "pass" ? <Check size={13} /> : check.status === "attention" ? <CircleAlert size={13} /> : <Info size={13} />}</span><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div><p className="provider-hint">Snapshot tạo lúc {new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(diagnostics.generatedAt))}. Optional provider hoặc privileged intent tắt sẽ hiện là thông tin, không bị hiểu nhầm thành lỗi core.</p></div>}
  </Panel></div>;
}

type SoundCloudCredentialSettingsProps = {
  bridgeOnline: boolean;
  providers: ProviderStatus[];
  providersLoading: boolean;
  soundCloudCredentialsStored: boolean | null;
  soundCloudCredentialsLoading: boolean;
  onRefreshSoundCloudCredentials: () => void | Promise<void>;
  onSaveSoundCloudCredentials: (clientId: string, clientSecret: string) => void | Promise<void>;
  onClearSoundCloudCredentials: () => void | Promise<void>;
  onToggleSoundCloud: (enabled: boolean) => void | Promise<void>;
  onTestSoundCloud: () => void | Promise<void>;
};

function SettingsPageWithVault({ soundCloudCredentialsStored, soundCloudCredentialsLoading, onRefreshSoundCloudCredentials, onSaveSoundCloudCredentials, onClearSoundCloudCredentials, nativeRuntimeInfo, runtimeDiagnostics, runtimeDiagnosticsLoading, onRefreshRuntimeDiagnostics, ...legacyProps }: Parameters<typeof SettingsPage>[0] & SoundCloudCredentialSettingsProps & { nativeRuntimeInfo: NativeRuntimeInfo | null; runtimeDiagnostics: RuntimeDiagnostics | null; runtimeDiagnosticsLoading: boolean; onRefreshRuntimeDiagnostics: () => void | Promise<void> }) {
  const { bridgeOnline, providers, providersLoading, onToggleSoundCloud, onTestSoundCloud } = legacyProps;
  return <><SettingsPage {...legacyProps} /><RuntimeDiagnosticsPanel diagnostics={runtimeDiagnostics} loading={runtimeDiagnosticsLoading} bridgeOnline={bridgeOnline} onRefresh={onRefreshRuntimeDiagnostics} />{!bridgeOnline && nativeRuntimeInfo?.packaged && <div className="settings-grid settings-runtime-guidance"><NativeRuntimeSetupPanel info={nativeRuntimeInfo} /></div>}<div className="settings-grid settings-vault-grid"><SoundCloudCredentialPanel bridgeOnline={bridgeOnline} providers={providers} providersLoading={providersLoading} soundCloudCredentialsStored={soundCloudCredentialsStored} soundCloudCredentialsLoading={soundCloudCredentialsLoading} onRefreshSoundCloudCredentials={onRefreshSoundCloudCredentials} onSaveSoundCloudCredentials={onSaveSoundCloudCredentials} onClearSoundCloudCredentials={onClearSoundCloudCredentials} onToggleSoundCloud={onToggleSoundCloud} onTestSoundCloud={onTestSoundCloud} /></div></>;
}

function NativeRuntimeSetupPanel({ info }: { info: NativeRuntimeInfo }) {
  const [openBusy, setOpenBusy] = useState(false);
  const [openError, setOpenError] = useState(false);
  const openDataDirectory = async () => {
    if (openBusy) return;
    setOpenBusy(true);
    setOpenError(false);
    try {
      const dataDir = await invoke<string>("prepare_native_data_dir");
      await openPath(dataDir);
    } catch {
      setOpenError(true);
    } finally {
      setOpenBusy(false);
    }
  };
  return <Panel title="Thiết lập bản cài đặt" icon={Terminal} action={<span className={`status-pill ${info.envFilePresent ? "is-good" : ""}`}>{info.envFilePresent ? ".env đã tìm thấy" : "Chưa có .env"}</span>}><div className="settings-detail runtime-setup"><div className="runtime-setup-heading"><CircleAlert size={17} /><span><strong>Bot chưa sẵn sàng</strong><small>Đặt file `.env` vào thư mục dữ liệu dưới đây, sau đó khởi động lại bot từ native app.</small></span></div><div className="runtime-path"><span>Thư mục dữ liệu app</span><code>{info.dataDir}</code></div><div className="runtime-setup-actions"><button type="button" className="button button-secondary button-small" onClick={() => { void openDataDirectory(); }} disabled={openBusy}><FolderOpen size={15} /> {openBusy ? "Đang mở…" : "Mở thư mục dữ liệu"}</button>{openError && <span className="form-hint" role="status">Không thể mở thư mục. Hãy mở thủ công theo đường dẫn ở trên.</span>}</div><p className="provider-hint">Tên biến cần có: <code>DISCORD_TOKEN</code> hoặc <code>BOT_TOKEN</code>, <code>DISCORD_CLIENT_ID</code>; <code>DISCORD_GUILD_ID</code> là tùy chọn và <code>LOCALBOT_CONTROL_ENABLED=true</code> để bật control bridge. LocalBot chỉ báo Ready sau khi child native-owned và control API cùng xác nhận.</p></div></Panel>;
}

function SoundCloudCredentialPanel({ bridgeOnline, providers, providersLoading, soundCloudCredentialsStored, soundCloudCredentialsLoading, onRefreshSoundCloudCredentials, onSaveSoundCloudCredentials, onClearSoundCloudCredentials, onToggleSoundCloud, onTestSoundCloud }: SoundCloudCredentialSettingsProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const supported = soundCloudCredentialsStored !== null;
  const soundcloud = providers.find((provider) => provider.id === "soundcloud");
  const submit = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    await onSaveSoundCloudCredentials(clientId, clientSecret);
    setClientId("");
    setClientSecret("");
  };
  return <Panel title="Nguồn nhạc & credential" icon={Music2} action={<span className={`status-pill ${soundCloudCredentialsStored ? "is-good" : ""}`}>{soundCloudCredentialsStored === null ? "Native only" : soundCloudCredentialsStored ? "Đã lưu an toàn" : "Chưa lưu"}</span>}><div className="settings-detail credential-settings"><SettingRow icon={ProviderYoutubeIcon} label="YouTube" detail="Nguồn mặc định · youtubei.js" value={providers.find((provider) => provider.id === "youtube")?.configured ? "Sẵn sàng" : "Chưa kiểm tra"} /><SettingRow icon={ProviderSoundcloudIcon} label="SoundCloud" detail="Official OAuth · trạng thái provider nằm trong local runtime" value={soundcloud ? soundcloud.configured ? soundcloud.enabled ? "Đang bật" : "Đã tắt" : "Chưa cấu hình" : "Chưa kiểm tra"} /><div className="provider-control-row"><span><strong>Cho phép tìm và phát SoundCloud</strong><small>{soundcloud?.configured ? "Chỉ lưu bật/tắt ở local; credential có thể dùng Windows Credential Manager." : "Lưu credential bên dưới rồi khởi động lại bot để provider nhận cấu hình."}</small></span><button type="button" className={`switch-control ${soundcloud?.enabled ? "is-active" : ""}`} role="switch" aria-checked={soundcloud?.enabled === true} aria-label="Bật hoặc tắt SoundCloud" disabled={!bridgeOnline || !soundcloud?.configured || providersLoading} onClick={() => { void onToggleSoundCloud(!soundcloud?.enabled); }}><span /></button></div><div className="provider-actions"><button type="button" className="button button-secondary" onClick={() => { void onTestSoundCloud(); }} disabled={!bridgeOnline || !soundcloud?.configured || !soundcloud.enabled || providersLoading}><RefreshCw size={15} /> Kiểm tra kết nối</button></div><p className="provider-hint credential-boundary-note">Nhập một lần để lưu vào Windows Credential Manager. Secret không được đọc lại, lưu vào giao diện, backup hoặc gửi qua Control API. Runtime chỉ nạp chúng khi native khởi động bot.</p><div className="credential-form"><label><span>SoundCloud Client ID</span><input value={clientId} maxLength={256} autoComplete="off" onChange={(event) => setClientId(event.currentTarget.value)} placeholder="Client ID official" disabled={!supported || soundCloudCredentialsLoading} /></label><label><span>SoundCloud Client secret</span><input type="password" value={clientSecret} maxLength={2048} autoComplete="new-password" onChange={(event) => setClientSecret(event.currentTarget.value)} placeholder="Client secret official" disabled={!supported || soundCloudCredentialsLoading} /></label></div><div className="provider-actions credential-actions"><button type="button" className="button button-secondary" onClick={() => { void submit(); }} disabled={!supported || soundCloudCredentialsLoading || !clientId.trim() || !clientSecret.trim()}><Check size={15} /> {soundCloudCredentialsLoading ? "Đang lưu…" : "Lưu credential"}</button><button type="button" className="button button-secondary" onClick={() => { void onRefreshSoundCloudCredentials(); }} disabled={!supported || soundCloudCredentialsLoading}><RefreshCw size={15} /> Kiểm tra trạng thái</button>{soundCloudCredentialsStored && <button type="button" className="button button-secondary danger-button" onClick={() => { void onClearSoundCloudCredentials(); }} disabled={soundCloudCredentialsLoading}><Trash2 size={15} /> Xoá credential</button>}</div><p className="provider-hint">Sau khi lưu hoặc xoá, hãy khởi động lại bot runtime để áp dụng cho phiên Node hiện tại. Env <code>SOUNDCLOUD_CLIENT_ID</code>/<code>SOUNDCLOUD_CLIENT_SECRET</code> vẫn là fallback cho người dùng không dùng vault.</p></div></Panel>;
}

function OllamaSettingsPanel({ settings, health, loading, bridgeOnline, baseUrlDraft, modelDraft, setBaseUrlDraft, setModelDraft, ollamaSuggestion, ollamaSuggestionQuery, setOllamaSuggestionQuery, ollamaSuggestionSurface, setOllamaSuggestionSurface, ollamaSuggestionLoading, onRequestOllamaSuggestion, onUpdate, onCheck }: { settings: OllamaSettings; health: OllamaHealth; loading: boolean; bridgeOnline: boolean; baseUrlDraft: string; modelDraft: string; setBaseUrlDraft: (value: string) => void; setModelDraft: (value: string) => void; ollamaSuggestion: OllamaSuggestion | null; ollamaSuggestionQuery: string; setOllamaSuggestionQuery: (value: string) => void; ollamaSuggestionSurface: OllamaSuggestionSurface; setOllamaSuggestionSurface: (value: OllamaSuggestionSurface) => void; ollamaSuggestionLoading: boolean; onRequestOllamaSuggestion: () => void | Promise<void>; onUpdate: (patch: Partial<OllamaSettings>) => void | Promise<void>; onCheck: () => void | Promise<void> }) {
  const [timeoutDraft, setTimeoutDraft] = useState(String(settings.timeoutMs));
  useEffect(() => {
    setTimeoutDraft(String(settings.timeoutMs));
  }, [settings.timeoutMs]);
  const healthLabel = { disabled: "Đã tắt", not_configured: "Chưa cấu hình model", ready: "Sẵn sàng", model_unavailable: "Không thấy model", offline: "Offline" }[health.status];
  const suggestionDisabled = !bridgeOnline || !settings.enabled || health.status !== "ready" || ollamaSuggestionLoading;
  return <Panel title="AI local · Ollama" icon={BrainCircuit} action={<span className={`status-pill ${health.status === "ready" ? "is-good" : ""}`}>{loading ? "Đang xử lý…" : healthLabel}</span>}><div className="settings-detail ollama-settings"><div className="provider-control-row"><span><strong>Cho phép Ollama hỗ trợ gợi ý</strong><small>Tuỳ chọn; AI chỉ được dùng cho gợi ý/hướng dẫn, không tự đổi quyền, queue hay policy.</small></span><button type="button" className={`switch-control ${settings.enabled ? "is-active" : ""}`} role="switch" aria-checked={settings.enabled} aria-label="Bật hoặc tắt Ollama" disabled={!bridgeOnline || loading} onClick={() => { void onUpdate({ enabled: !settings.enabled }); }}><span /></button></div><div className="ollama-form"><label><span>Endpoint HTTP(S)</span><input value={baseUrlDraft} onChange={(event) => setBaseUrlDraft(event.currentTarget.value)} placeholder="http://127.0.0.1:11434" disabled={!bridgeOnline || loading} /></label><label><span>Model</span><input value={modelDraft} onChange={(event) => setModelDraft(event.currentTarget.value)} placeholder="qwen2.5:7b" disabled={!bridgeOnline || loading} /></label><label><span>Timeout (ms)</span><input type="number" min="1000" max="30000" step="1000" value={timeoutDraft} onChange={(event) => setTimeoutDraft(event.currentTarget.value)} aria-label="Timeout Ollama" disabled={!bridgeOnline || loading} /></label></div><div className="provider-actions"><button type="button" className="button button-secondary" disabled={!bridgeOnline || loading} onClick={() => { void onUpdate({ baseUrl: baseUrlDraft, model: modelDraft, timeoutMs: Number(timeoutDraft) }); }}><Check size={15} /> Lưu cấu hình</button><button type="button" className="button button-secondary" disabled={!bridgeOnline || loading} onClick={() => { void onCheck(); }}><RefreshCw size={15} /> Kiểm tra health</button></div><div className="ollama-suggestion"><div className="detail-section-heading"><div><span className="overline">READ-ONLY SUGGESTION</span><strong>Hỏi LocalBot</strong></div><span className="status-pill">Không thực thi</span></div><div className="ollama-suggestion-form"><select aria-label="Bối cảnh gợi ý" value={ollamaSuggestionSurface} onChange={(event) => setOllamaSuggestionSurface(event.currentTarget.value as OllamaSuggestionSurface)} disabled={suggestionDisabled}><option value="help">Hướng dẫn chung</option><option value="music">Âm nhạc</option><option value="community">Community</option></select><textarea value={ollamaSuggestionQuery} maxLength={512} onChange={(event) => setOllamaSuggestionQuery(event.currentTarget.value)} placeholder={settings.enabled ? "Ví dụ: Làm sao thêm bài vào hàng đợi?" : "Bật Ollama và kiểm tra health để dùng gợi ý"} disabled={suggestionDisabled} /></div><button type="button" className="button button-secondary" onClick={() => { void onRequestOllamaSuggestion(); }} disabled={suggestionDisabled || !ollamaSuggestionQuery.trim()}><BrainCircuit size={15} /> {ollamaSuggestionLoading ? "Đang suy nghĩ…" : "Nhận gợi ý"}</button>{ollamaSuggestion && <div className="ollama-suggestion-result"><small>Gợi ý không có quyền thực thi · {new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(ollamaSuggestion.generatedAt))}</small><p>{ollamaSuggestion.suggestion}</p></div>}</div><p className="provider-hint">Mặc định Ollama tắt. LocalBot không gửi token, cookie hay dữ liệu riêng tư; khi Ollama offline các tính năng cốt lõi vẫn hoạt động bình thường. Nội dung AI chỉ là gợi ý, không phải trạng thái đã thực hiện.</p></div></Panel>;
}

function ProviderYoutubeIcon() {
  return <Icon icon="simple-icons:youtube" fallback={<Music2 size={17} />} />;
}

function ProviderSoundcloudIcon() {
  return <Icon icon="simple-icons:soundcloud" fallback={<Music2 size={17} />} />;
}

function SettingRow({ icon: RowIcon, label, detail, value }: { icon: ComponentType<{ size?: number; strokeWidth?: number }>; label: string; detail: string; value: string }) {
  return <div className="setting-row"><span className="setting-icon"><RowIcon size={17} strokeWidth={1.7} /></span><span><strong>{label}</strong><small>{detail}</small></span><em>{value}</em></div>;
}

function EmptyState({ title, detail, action, onClick }: { title: string; detail: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Search size={19} /></span><strong>{title}</strong><p>{detail}</p><button type="button" className="button button-secondary" onClick={onClick}>{action}</button></div>;
}

export default App;
