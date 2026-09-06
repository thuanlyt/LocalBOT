import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import {
  clearQueue,
  destroyGuildPlayer,
  enqueue,
  getOrCreatePlayer,
  getPlayerSnapshot,
  getQueue,
  isVoiceChannel,
  joinOrMovePlayer,
  moveInQueue,
  pause,
  removeFromQueue,
  resume,
  setVolume,
  setRepeatMode,
  previous,
  skip,
  stop,
  toggleShuffle,
  type RepeatMode
} from './player.js';
import {
  resolveMedia,
  searchMedia,
  sourceLabel,
  type MediaProvider,
  type MediaSearchSource,
  type MediaTrack
} from './media.js';
import { playlistStore } from './playlists.js';
import { musicPermissionStore, type MusicPermissionMode } from './music-permissions.js';
import { equalizerStore, type EqualizerPreset } from './equalizer.js';
import { communityStore, MAX_COMMUNITY_XP_MULTIPLIER, MAX_COMMUNITY_REWARD_LEVEL } from './community.js';
import { buildCommandAuditRecord, type CommandAuditOutcome } from './command-audit.js';
import { auditLogStore, type AuditEntry } from './audit-log.js';
import { config } from './config.js';
import { registerSlashCommands } from './command-registration.js';
import { isSoundCloudAvailable, isSoundCloudConfigured, isSoundCloudEnabled } from './soundcloud.js';
import { buildRuntimeDiagnostics } from './runtime-diagnostics.js';
import { fetchDiscordAuditLog } from './discord-audit-log.js';
import { greetingStore, normalizeGreetingKind, previewGreeting, type GreetingKind, type GreetingTemplate } from './greetings.js';
import { AUTO_MOD_ACTIONS, AUTO_MOD_MODES, AUTO_MOD_RULES, automodStore, normalizeDomain, runtimeAutoModEngine, type AutoModRuleKind, type AutoModSettings } from './automod.js';
import { AUTO_MOD_REVIEW_STATUSES, automodReviewStore, type AutoModReviewStatus } from './automod-review.js';

export const commandDefinitions = [
  new SlashCommandBuilder().setName('ping').setDescription('Kiểm tra LocalBot.'),
  new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Kiểm tra và đồng bộ runtime LocalBot trong server.')
    .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Xem trạng thái runtime và player hiện tại.'))
    .addSubcommand((subcommand) => subcommand.setName('providers').setDescription('Xem trạng thái các nguồn nhạc.'))
    .addSubcommand((subcommand) => subcommand.setName('diagnostics').setDescription('Xem readiness an toàn của runtime và capability.'))
    .addSubcommand((subcommand) => subcommand.setName('sync').setDescription('Đăng ký lại slash commands cho server này.'))
    .addSubcommandGroup((group) => group
      .setName('audit')
      .setDescription('Đọc audit an toàn, có giới hạn.')
      .addSubcommand((subcommand) => subcommand
        .setName('local')
        .setDescription('Xem audit LocalBot theo guild.')
        .addIntegerOption((option) => option
          .setName('limit')
          .setDescription('Số bản ghi tối đa.')
          .setMinValue(1)
          .setMaxValue(10))
        .addStringOption((option) => option
          .setName('action')
          .setDescription('Lọc theo action hoặc prefix action.')
          .setMaxLength(64))
        .addStringOption((option) => option
          .setName('search')
          .setDescription('Tìm trong actor, action và detail đã redacted.')
          .setMaxLength(64)))
      .addSubcommand((subcommand) => subcommand
        .setName('discord')
        .setDescription('Xem audit Discord ở chế độ chỉ đọc.')
        .addIntegerOption((option) => option
          .setName('limit')
          .setDescription('Số bản ghi tối đa.')
          .setMinValue(1)
          .setMaxValue(10))))
    .addSubcommandGroup((group) => group
      .setName('greetings')
      .setDescription('Quản lý Welcome/Goodbye an toàn.')
      .addSubcommand((subcommand) => subcommand.setName('show').setDescription('Xem cấu hình Welcome/Goodbye.'))
      .addSubcommand((subcommand) => subcommand
        .setName('set')
        .setDescription('Cập nhật template và trạng thái Welcome/Goodbye.')
        .addStringOption((option) => option
          .setName('kind')
          .setDescription('Loại template.')
          .addChoices({ name: 'Welcome', value: 'welcome' }, { name: 'Goodbye', value: 'goodbye' })
          .setRequired(true))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt template.'))
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Kênh text/announcement nhận message.')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((option) => option
          .setName('message')
          .setDescription('Template; token: {user}, {username}, {guild}, {memberCount}.')
          .setMaxLength(1_000))
        .addStringOption((option) => option
          .setName('image_url')
          .setDescription('Ảnh HTTPS tùy chọn.')
          .setMaxLength(2_048))
        .addBooleanOption((option) => option.setName('clear_channel').setDescription('Xóa kênh đích hiện tại.'))
        .addBooleanOption((option) => option.setName('clear_image').setDescription('Xóa ảnh hiện tại.')))
      .addSubcommand((subcommand) => subcommand
        .setName('preview')
        .setDescription('Xem preview local, không gửi message.')
        .addStringOption((option) => option
          .setName('kind')
          .setDescription('Loại template.')
          .addChoices({ name: 'Welcome', value: 'welcome' }, { name: 'Goodbye', value: 'goodbye' })
          .setRequired(true))))
    .addSubcommandGroup((group) => group
      .setName('automod')
      .setDescription('Quản lý AutoMod theo hướng an toàn.')
      .addSubcommand((subcommand) => subcommand.setName('show').setDescription('Xem policy AutoMod và capability.'))
      .addSubcommand((subcommand) => subcommand
        .setName('policy')
        .setDescription('Bật/tắt policy và chọn dry-run hoặc enforce.')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật policy AutoMod.').setRequired(true))
        .addStringOption((option) => option
          .setName('mode')
          .setDescription('Chế độ xử lý.')
          .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Enforce giới hạn', value: 'enforce' })
          .setRequired(true))
        .addBooleanOption((option) => option.setName('confirm').setDescription('Xác nhận thay đổi policy.').setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('rule')
        .setDescription('Cập nhật một rule AutoMod.')
        .addStringOption((option) => option
          .setName('rule')
          .setDescription('Rule cần cập nhật.')
          .addChoices(...AUTO_MOD_RULES.map((rule) => ({ name: rule, value: rule })))
          .setRequired(true))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật/tắt rule.').setRequired(true))
        .addStringOption((option) => option
          .setName('action')
          .setDescription('Hành động đề xuất; enforce vẫn bị giới hạn bởi safety policy.')
          .addChoices(...AUTO_MOD_ACTIONS.map((action) => ({ name: action, value: action }))))
        .addIntegerOption((option) => option.setName('threshold').setDescription('Ngưỡng cho spam/flood/anti-raid/anti-nuke.').setMinValue(2).setMaxValue(100))
        .addIntegerOption((option) => option.setName('window').setDescription('Cửa sổ giây cho threshold rule.').setMinValue(1).setMaxValue(86_400))
        .addIntegerOption((option) => option.setName('cooldown').setDescription('Cooldown giây cho rule.').setMinValue(0).setMaxValue(86_400)))
      .addSubcommand((subcommand) => subcommand
        .setName('domain')
        .setDescription('Thêm hoặc xóa blocked domain của rule link.')
        .addStringOption((option) => option
          .setName('action')
          .setDescription('Thao tác.')
          .addChoices({ name: 'Thêm', value: 'add' }, { name: 'Xóa', value: 'remove' })
          .setRequired(true))
        .addStringOption((option) => option.setName('domain').setDescription('Hostname, không gồm scheme/path.').setMaxLength(253).setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('exempt')
        .setDescription('Thêm hoặc xóa user/role khỏi exemption list.')
        .addStringOption((option) => option
          .setName('action')
          .setDescription('Thao tác.')
          .addChoices({ name: 'Thêm', value: 'add' }, { name: 'Xóa', value: 'remove' })
          .setRequired(true))
        .addUserOption((option) => option.setName('user').setDescription('User được exemption.'))
        .addRoleOption((option) => option.setName('role').setDescription('Role được exemption.')))
      .addSubcommand((subcommand) => subcommand
        .setName('review')
        .setDescription('Xem review queue redacted.')
        .addStringOption((option) => option
          .setName('status')
          .setDescription('Lọc trạng thái.')
          .addChoices(...AUTO_MOD_REVIEW_STATUSES.map((status) => ({ name: status, value: status }))))
        .addIntegerOption((option) => option.setName('limit').setDescription('Số bản ghi tối đa.').setMinValue(1).setMaxValue(10)))
      .addSubcommand((subcommand) => subcommand
        .setName('decide')
        .setDescription('Ghi nhận quyết định local cho một review entry.')
        .addStringOption((option) => option.setName('review_id').setDescription('ID review entry.').setMaxLength(64).setRequired(true))
        .addStringOption((option) => option
          .setName('decision')
          .setDescription('Kết luận local.')
          .addChoices({ name: 'Xác nhận', value: 'confirm' }, { name: 'Bỏ qua', value: 'dismiss' })
          .setRequired(true))
        .addStringOption((option) => option.setName('note').setDescription('Ghi chú local, tối đa 240 ký tự.').setMaxLength(240)))
      .addSubcommand((subcommand) => subcommand
        .setName('recover')
        .setDescription('Tắt AutoMod và reset detector memory an toàn.')
        .addBooleanOption((option) => option.setName('confirm').setDescription('Bắt buộc chọn Có.').setRequired(true)))),
  new SlashCommandBuilder().setName('rank').setDescription('Xem cấp độ và XP của bạn.'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Xem bảng xếp hạng Community.')
    .addIntegerOption((option) => option
      .setName('page')
      .setDescription('Trang bảng xếp hạng, mỗi trang 10 thành viên.')
      .setMinValue(1)
      .setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('community-config')
    .setDescription('Quản lý kênh và role được bỏ qua khi tính XP Community.')
    .addSubcommand((subcommand) => subcommand
      .setName('ignore-channel')
      .setDescription('Thêm hoặc bỏ một kênh khỏi danh sách bỏ qua XP.')
      .addStringOption((option) => option
        .setName('action')
        .setDescription('Thêm hay xóa')
        .addChoices({ name: 'Thêm', value: 'add' }, { name: 'Xóa', value: 'remove' })
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Kênh cần bỏ qua')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('ignore-role')
      .setDescription('Thêm hoặc bỏ một role khỏi danh sách bỏ qua XP.')
      .addStringOption((option) => option
        .setName('action')
        .setDescription('Thêm hay xóa')
        .addChoices({ name: 'Thêm', value: 'add' }, { name: 'Xóa', value: 'remove' })
        .setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role cần bỏ qua').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('show').setDescription('Xem danh sách kênh/role đang bị bỏ qua.'))
    .addSubcommand((subcommand) => subcommand
      .setName('cooldown')
      .setDescription('Đặt cooldown XP; -1 để dùng mặc định global.')
      .addIntegerOption((option) => option
        .setName('seconds')
        .setDescription('0..86400 giây, hoặc -1 để reset về mặc định global.')
        .setMinValue(-1)
        .setMaxValue(86400)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('xp-multiplier')
      .setDescription('Đặt hệ số XP cơ bản cho guild.')
      .addIntegerOption((option) => option
        .setName('multiplier')
        .setDescription(`Hệ số XP từ 1 đến ${MAX_COMMUNITY_XP_MULTIPLIER}.`)
        .setMinValue(1)
        .setMaxValue(MAX_COMMUNITY_XP_MULTIPLIER)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('role-multiplier')
      .setDescription('Đặt hoặc xóa hệ số XP theo role.')
      .addStringOption((option) => option
        .setName('action')
        .setDescription('Thêm hay xóa')
        .addChoices({ name: 'Thêm/cập nhật', value: 'add' }, { name: 'Xóa', value: 'remove' })
        .setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role áp dụng hệ số').setRequired(true))
      .addIntegerOption((option) => option
        .setName('multiplier')
        .setDescription(`Hệ số từ 1 đến ${MAX_COMMUNITY_XP_MULTIPLIER}; bỏ qua khi xóa.`)
        .setMinValue(1)
        .setMaxValue(MAX_COMMUNITY_XP_MULTIPLIER)))
    .addSubcommand((subcommand) => subcommand
      .setName('role-reward')
      .setDescription('Đặt hoặc xóa role nhận khi đạt level.')
      .addStringOption((option) => option
        .setName('action')
        .setDescription('Thêm/cập nhật hay xóa')
        .addChoices({ name: 'Thêm/cập nhật', value: 'add' }, { name: 'Xóa', value: 'remove' })
        .setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role nhận thưởng').setRequired(true))
      .addIntegerOption((option) => option
        .setName('level')
        .setDescription(`Level từ 2 đến ${MAX_COMMUNITY_REWARD_LEVEL}; bỏ qua khi xóa.`)
        .setMinValue(2)
        .setMaxValue(MAX_COMMUNITY_REWARD_LEVEL)))
    .addSubcommand((subcommand) => subcommand
      .setName('reset')
      .setDescription('Xóa toàn bộ XP Community của guild sau khi xác nhận.')
      .addBooleanOption((option) => option
        .setName('confirm')
        .setDescription('Bắt buộc chọn Có để xác nhận thao tác xóa.')
        .setRequired(true))),
  new SlashCommandBuilder().setName('join').setDescription('Tham gia voice channel của bạn hoặc chuyển kênh.'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Phát hoặc xếp nhạc vào hàng đợi.')
    .addStringOption((option) => option.setName('query').setDescription('URL hoặc từ khóa tìm kiếm').setRequired(true))
    .addStringOption((option) => option
      .setName('source')
      .setDescription('Nguồn tìm kiếm khi nhập từ khóa')
      .addChoices({ name: 'YouTube', value: 'youtube' }, { name: 'SoundCloud', value: 'soundcloud' })),
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Tìm nhạc trên một hoặc nhiều nguồn.')
    .addStringOption((option) => option.setName('query').setDescription('Từ khóa tìm kiếm').setRequired(true))
    .addStringOption((option) => option
      .setName('source')
      .setDescription('Nguồn tìm kiếm')
      .addChoices(
        { name: 'YouTube', value: 'youtube' },
        { name: 'SoundCloud', value: 'soundcloud' },
        { name: 'Tất cả nguồn', value: 'all' }
      )),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Xem thông tin một track.')
    .addStringOption((option) => option.setName('url').setDescription('URL YouTube/SoundCloud hoặc YouTube video ID').setRequired(true)),
  new SlashCommandBuilder().setName('queue').setDescription('Xem hàng đợi phát nhạc.'),
  new SlashCommandBuilder().setName('now-playing').setDescription('Xem bài đang phát và voice channel hiện tại.'),
  new SlashCommandBuilder().setName('clear').setDescription('Xóa các bài đang chờ trong hàng đợi.'),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Xóa một bài khỏi hàng đợi.')
    .addIntegerOption((option) => option.setName('position').setDescription('Vị trí trong hàng đợi').setMinValue(1).setRequired(true)),
  new SlashCommandBuilder()
    .setName('move')
    .setDescription('Di chuyển một bài trong hàng đợi.')
    .addIntegerOption((option) => option.setName('from').setDescription('Vị trí hiện tại').setMinValue(1).setRequired(true))
    .addIntegerOption((option) => option.setName('to').setDescription('Vị trí mới').setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName('shuffle').setDescription('Bật hoặc tắt phát ngẫu nhiên.'),
  new SlashCommandBuilder()
    .setName('repeat')
    .setDescription('Đổi chế độ lặp bài.')
    .addStringOption((option) => option
      .setName('mode')
      .setDescription('Chế độ lặp')
      .addChoices(
        { name: 'Tắt lặp', value: 'off' },
        { name: 'Lặp hàng đợi', value: 'all' },
        { name: 'Lặp một bài', value: 'one' }
      )
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName('equalizer')
    .setDescription('Điều chỉnh bass, mid và treble.')
    .addSubcommand((subcommand) => subcommand.setName('show').setDescription('Xem cấu hình Equalizer hiện tại.'))
    .addSubcommand((subcommand) => subcommand
      .setName('preset')
      .setDescription('Chọn preset Equalizer.')
      .addStringOption((option) => option
        .setName('name')
        .setDescription('Preset')
        .addChoices(
          { name: 'Flat', value: 'flat' },
          { name: 'Focus', value: 'focus' },
          { name: 'Warm', value: 'warm' }
        )
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('set')
      .setDescription('Đặt gain từng band từ -12 đến +12 dB.')
      .addIntegerOption((option) => option.setName('bass').setDescription('Bass dB').setMinValue(-12).setMaxValue(12).setRequired(true))
      .addIntegerOption((option) => option.setName('mid').setDescription('Mid dB').setMinValue(-12).setMaxValue(12).setRequired(true))
      .addIntegerOption((option) => option.setName('treble').setDescription('Treble dB').setMinValue(-12).setMaxValue(12).setRequired(true))),
  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Quản lý playlist local của server.')
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('Liệt kê playlist local.'))
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Tạo playlist mới.')
      .addStringOption((option) => option.setName('name').setDescription('Tên playlist').setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('Mô tả ngắn')))
    .addSubcommand((subcommand) => subcommand
      .setName('edit')
      .setDescription('Đổi tên hoặc mô tả playlist.')
      .addStringOption((option) => option.setName('name').setDescription('Tên hiện tại').setRequired(true))
      .addStringOption((option) => option.setName('new_name').setDescription('Tên mới'))
      .addStringOption((option) => option.setName('description').setDescription('Mô tả mới')))
    .addSubcommand((subcommand) => subcommand
      .setName('delete')
      .setDescription('Xóa playlist.')
      .addStringOption((option) => option.setName('name').setDescription('Tên playlist').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Thêm track vào playlist.')
      .addStringOption((option) => option.setName('name').setDescription('Tên playlist').setRequired(true))
      .addStringOption((option) => option.setName('query').setDescription('URL hoặc từ khóa tìm kiếm').setRequired(true))
      .addStringOption((option) => option
        .setName('source')
        .setDescription('Nguồn tìm kiếm khi nhập từ khóa')
        .addChoices({ name: 'YouTube', value: 'youtube' }, { name: 'SoundCloud', value: 'soundcloud' })))
     .addSubcommand((subcommand) => subcommand
       .setName('remove')
       .setDescription('Xóa track khỏi playlist.')
       .addStringOption((option) => option.setName('name').setDescription('Tên playlist').setRequired(true))
       .addIntegerOption((option) => option.setName('position').setDescription('Vị trí track').setMinValue(1).setRequired(true)))
     .addSubcommand((subcommand) => subcommand
       .setName('move')
       .setDescription('Sắp xếp lại track trong playlist.')
       .addStringOption((option) => option.setName('name').setDescription('Tên playlist').setRequired(true))
       .addIntegerOption((option) => option.setName('from').setDescription('Vị trí hiện tại').setMinValue(1).setRequired(true))
       .addIntegerOption((option) => option.setName('to').setDescription('Vị trí mới').setMinValue(1).setRequired(true)))
     .addSubcommand((subcommand) => subcommand
      .setName('play')
      .setDescription('Xếp toàn bộ playlist vào hàng đợi.')
      .addStringOption((option) => option.setName('name').setDescription('Tên playlist').setRequired(true))),
  new SlashCommandBuilder()
    .setName('music-access')
    .setDescription('Quản lý quyền sử dụng lệnh Music.')
    .addSubcommand((subcommand) => subcommand
      .setName('mode')
      .setDescription('Đổi giữa allow-list và cho phép tất cả.')
      .addStringOption((option) => option
        .setName('value')
        .setDescription('Chế độ quyền')
        .addChoices({ name: 'Allow-list', value: 'allowlist' }, { name: 'Cho phép tất cả', value: 'all' })
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Cấp quyền Music cho một thành viên.')
      .addUserOption((option) => option.setName('user').setDescription('Thành viên được cấp quyền').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Thu hồi quyền Music của một thành viên.')
      .addUserOption((option) => option.setName('user').setDescription('Thành viên bị thu hồi').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('Xem cấu hình quyền Music.')),
  new SlashCommandBuilder().setName('previous').setDescription('Phát lại bài trước.'),
  new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài đang phát.'),
  new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng bài đang phát.'),
  new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục bài đang tạm dừng.'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Điều chỉnh âm lượng Discord player.')
    .addIntegerOption((option) => option.setName('percent').setDescription('Phần trăm âm lượng').setMinValue(0).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('stop').setDescription('Dừng và xóa hàng đợi.'),
  new SlashCommandBuilder().setName('leave').setDescription('Rời voice channel.')
].map((command) => command.toJSON());

const MUSIC_COMMANDS = new Set([
  'join', 'play', 'search', 'info', 'queue', 'now-playing', 'clear', 'remove', 'move', 'shuffle', 'repeat',
  'equalizer', 'playlist', 'previous', 'skip', 'pause', 'resume', 'volume', 'stop', 'leave'
]);

function isGuildManager(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

function formatTrack(track: MediaTrack): string {
  return `**${track.title}** · ${track.channel} · ${track.durationText} · ${sourceLabel(track.provider)}\n${track.url}`;
}

function getMemberVoiceChannel(interaction: ChatInputCommandInteraction) {
  const channel = interaction.guild?.members.cache.get(interaction.user.id)?.voice.channel;
  if (!isVoiceChannel(channel)) {
    throw new Error('Bạn cần vào voice channel trước.');
  }
  return channel;
}

function embedForTrack(track: MediaTrack): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x0a0a0a)
    .setTitle(track.title)
    .setURL(track.url)
    .setDescription(`Nguồn: **${sourceLabel(track.provider)}**\nKênh: **${track.channel}**\nThời lượng: **${track.durationText}**`);
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

function formatOperatorDiagnostics(interaction: ChatInputCommandInteraction): string {
  const diagnostics = buildRuntimeDiagnostics({
    profile: config.runtimeProfile,
    control: {
      enabled: config.controlEnabled,
      host: config.controlHost,
      port: config.controlPort,
      loopbackOnly: config.controlHost === '127.0.0.1',
      ownerPresent: Boolean(config.runtimeOwnerId)
    },
    discord: {
      ready: interaction.client.isReady(),
      botTag: interaction.client.user?.tag ?? null,
      guildCount: interaction.client.guilds.cache.size
    },
    capabilities: {
      guildMembersIntent: config.guildMembersIntentEnabled,
      messageContentIntent: config.messageContentIntentEnabled
    },
    providers: [
      { id: 'youtube', label: 'YouTube', enabled: true, configured: true },
      { id: 'soundcloud', label: 'SoundCloud', enabled: isSoundCloudEnabled(), configured: isSoundCloudConfigured() }
    ]
  });
  const checkLines = diagnostics.checks.map((item) => {
    const icon = item.status === 'pass' ? '✅' : item.status === 'attention' ? '⚠️' : 'ℹ️';
    return `${icon} ${item.label}: ${item.detail}`;
  });
  return [
    `Runtime diagnostics · status=**${diagnostics.status}** · profile=**${diagnostics.profile}**`,
    `Discord: **${diagnostics.discord.ready ? 'ready' : 'starting'}** · guilds=${diagnostics.discord.guildCount}`,
    `Control bridge: **${diagnostics.control.enabled ? `${diagnostics.control.host}:${diagnostics.control.port}` : 'disabled'}**`,
    ...checkLines
  ].join('\n');
}

const OPERATOR_REPLY_LIMIT = 1_900;

function safeDiscordText(value: unknown, maxLength = 240): string {
  return String(value ?? '')
    .replace(/[`]/g, 'ˋ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function boundedOperatorReply(header: string, lines: string[]): string {
  let content = header;
  let included = 0;
  for (const line of lines) {
    const next = `${content}\n${line}`;
    if (next.length > OPERATOR_REPLY_LIMIT) break;
    content = next;
    included += 1;
  }
  if (included < lines.length) content += `\n… và ${lines.length - included} bản ghi khác không hiển thị vì giới hạn Discord.`;
  return content.slice(0, OPERATOR_REPLY_LIMIT);
}

function formatLocalAudit(entries: AuditEntry[]): string {
  const lines = entries.map((entry) => `${entry.timestamp} · ${safeDiscordText(entry.action, 96)} · ${safeDiscordText(entry.actor, 96)} · ${safeDiscordText(entry.detail, 300)}`);
  return boundedOperatorReply(`Local audit · ${entries.length} bản ghi gần nhất`, lines);
}

function formatDiscordAudit(entries: Awaited<ReturnType<typeof fetchDiscordAuditLog>>): string {
  const lines = entries.map((entry) => `${entry.createdAt} · ${safeDiscordText(entry.actionType, 96)} · actor=${safeDiscordText(entry.actorTag ?? entry.actorId ?? 'unknown', 128)} · target=${safeDiscordText(entry.targetId ?? 'none', 80)}`);
  return boundedOperatorReply(`Discord audit · ${entries.length} bản ghi gần nhất`, lines);
}

function greetingLabel(kind: GreetingKind): string {
  return kind === 'welcome' ? 'Welcome' : 'Goodbye';
}

function formatGreetingTemplate(kind: GreetingKind, template: GreetingTemplate): string {
  return [
    `${greetingLabel(kind)}: ${template.enabled ? 'bật' : 'tắt'}`,
    `Kênh: ${template.channelId ? `<#${template.channelId}>` : 'chưa chọn'}`,
    `Message: ${safeDiscordText(template.message, 500)}`,
    `Image: ${template.imageUrl ? safeDiscordText(template.imageUrl, 240) : 'không có'}`
  ].join('\n');
}

function formatGreetingSettings(settings: Awaited<ReturnType<typeof greetingStore.get>>, intentEnabled: boolean): string {
  return [
    `Welcome/Goodbye · Members Intent: **${intentEnabled ? 'bật' : 'tắt'}**`,
    '```',
    formatGreetingTemplate('welcome', settings.welcome),
    '',
    formatGreetingTemplate('goodbye', settings.goodbye),
    '```',
    intentEnabled
      ? 'Sự kiện join/leave sẽ dùng template khi runtime nhận được event.'
      : 'Đang tắt Members Intent; template được lưu nhưng event join/leave chưa hoạt động.'
  ].join('\n');
}

function formatAutoModSettings(settings: AutoModSettings, messageContentIntentEnabled: boolean): string {
  const rules = AUTO_MOD_RULES.map((rule) => {
    const value = settings.rules[rule];
    const details = [
      `${rule}: ${value.enabled ? 'bật' : 'tắt'}`,
      `action=${value.proposedAction}`,
      'threshold' in value ? `threshold=${value.threshold};window=${value.windowSeconds}s` : '',
      `cooldown=${value.cooldownSeconds}s`,
      'blockedDomains' in value ? `domains=${value.blockedDomains.length}` : ''
    ].filter(Boolean).join(' · ');
    return details;
  });
  return boundedOperatorReply(
    `AutoMod · enabled=${settings.enabled ? 'true' : 'false'} · mode=${settings.mode} · Message Content Intent=${messageContentIntentEnabled ? 'enabled' : 'disabled'}`,
    [
      ...rules,
      `Exempt users: ${settings.exemptUserIds.length} · exempt roles: ${settings.exemptRoleIds.length}`,
      messageContentIntentEnabled
        ? 'Content rules có thể được evaluate khi policy/rule được bật.'
        : 'Content rules là safe no-op cho tới khi bật cả Developer Portal và LOCALBOT_MESSAGE_CONTENT_INTENT=true.'
    ]
  );
}

function formatAutoModReview(entries: Awaited<ReturnType<typeof automodReviewStore.list>>): string {
  const lines = entries.map((entry) => [
    `${entry.createdAt} · id=${safeDiscordText(entry.id, 64)}`,
    `rule=${entry.rule};reason=${entry.reason};outcome=${entry.outcome};status=${entry.status};enforced=${entry.enforced}`,
    `channel=${safeDiscordText(entry.channelId ?? 'none', 64)};user=${safeDiscordText(entry.userId ?? 'none', 64)}`
  ].join(' · '));
  return boundedOperatorReply(`AutoMod review · ${entries.length} bản ghi · không chứa message content`, lines);
}

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  let outcome: CommandAuditOutcome = 'success';
  let subcommand: string | null = null;
  let subcommandGroup: string | null = null;
  try {
    subcommandGroup = interaction.options.getSubcommandGroup(false);
    subcommand = interaction.options.getSubcommand(false);
    if (subcommandGroup && subcommand) subcommand = `${subcommandGroup}.${subcommand}`;
  } catch {
    subcommandGroup = null;
    subcommand = null;
  }
  try {
    if (interaction.commandName !== 'ping' && !interaction.guildId) {
      outcome = 'error';
      throw new Error('Lệnh này chỉ dùng được trong server Discord.');
    }
    if (MUSIC_COMMANDS.has(interaction.commandName) && !await musicPermissionStore.canUse(
      interaction.guildId!,
      interaction.user.id,
      isGuildManager(interaction)
    )) {
      outcome = 'denied';
      await interaction.reply('Bạn chưa được cấp quyền dùng Music. Hãy liên hệ quản trị viên để được thêm vào allow-list.');
      return;
    }

    switch (interaction.commandName) {
      case 'ping':
        await interaction.reply(`Pong! ${interaction.client.ws.ping}ms`);
        return;
      case 'bot': {
        if (!isGuildManager(interaction)) {
          outcome = 'denied';
          await interaction.reply('Bạn cần quyền Manage Server hoặc Administrator để dùng lệnh quản trị Bot.');
          return;
        }
        const operatorGroup = interaction.options.getSubcommandGroup(false);
        const operatorSubcommand = interaction.options.getSubcommand();
        if (operatorGroup === 'audit') {
          await interaction.deferReply({ ephemeral: true });
          const limit = interaction.options.getInteger('limit') ?? 10;
          if (operatorSubcommand === 'local') {
            const entries = await auditLogStore.list(limit, interaction.guildId!, {
              action: interaction.options.getString('action') ?? undefined,
              search: interaction.options.getString('search') ?? undefined
            });
            await interaction.editReply({ content: formatLocalAudit(entries), allowedMentions: { parse: [] } });
            return;
          }
          if (!interaction.guild) throw new Error('Không thể đọc audit Discord khi guild chưa sẵn sàng.');
          const entries = await fetchDiscordAuditLog(interaction.guild!, limit);
          await interaction.editReply({ content: formatDiscordAudit(entries), allowedMentions: { parse: [] } });
          return;
        }
        if (operatorGroup === 'greetings') {
          const guildId = interaction.guildId!;
          if (operatorSubcommand === 'show') {
            const settings = await greetingStore.get(guildId);
            await interaction.reply({ content: formatGreetingSettings(settings, config.guildMembersIntentEnabled), ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          const kind = normalizeGreetingKind(interaction.options.getString('kind', true));
          if (operatorSubcommand === 'preview') {
            const settings = await greetingStore.get(guildId);
            const preview = previewGreeting(settings[kind], interaction.guild?.name ?? 'server', interaction.guild?.memberCount ?? 0, interaction.user.username);
            await interaction.reply({
              content: [
                `Preview ${greetingLabel(kind)} · enabled=${settings[kind].enabled ? 'true' : 'false'}`,
                safeDiscordText(preview.text, 1_000),
                `Image: ${preview.imageUrl ? safeDiscordText(preview.imageUrl, 240) : 'không có'}`,
                config.guildMembersIntentEnabled ? 'Preview local, không gửi message.' : 'Preview local; Members Intent đang tắt nên event join/leave chưa chạy.'
              ].join('\n'),
              ephemeral: true,
              allowedMentions: { parse: [] }
            });
            return;
          }

          const current = await greetingStore.get(guildId);
          const targetChannel = interaction.options.getChannel('channel');
          const clearChannel = interaction.options.getBoolean('clear_channel') ?? false;
          const clearImage = interaction.options.getBoolean('clear_image') ?? false;
          if (targetChannel && clearChannel) throw new Error('Chỉ chọn channel hoặc clear_channel, không chọn cả hai.');
          if (targetChannel && ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(targetChannel.type)) {
            throw new Error('Kênh Welcome/Goodbye phải là text hoặc announcement channel.');
          }
          if (clearImage && interaction.options.getString('image_url')) throw new Error('Chỉ chọn image_url hoặc clear_image, không chọn cả hai.');

          const enabled = interaction.options.getBoolean('enabled');
          const message = interaction.options.getString('message');
          const imageUrl = interaction.options.getString('image_url');
          const nextChannelId = clearChannel ? null : targetChannel?.id ?? current[kind].channelId;
          const nextEnabled = enabled ?? current[kind].enabled;
          if (nextEnabled && !nextChannelId) throw new Error('Không thể bật template khi chưa có channel đích.');
          const patch: Record<string, unknown> = {};
          if (enabled !== null) patch.enabled = enabled;
          if (targetChannel) patch.channelId = targetChannel.id;
          if (clearChannel) patch.channelId = null;
          if (message !== null) patch.message = message;
          if (imageUrl !== null) patch.imageUrl = imageUrl;
          if (clearImage) patch.imageUrl = null;
          if (Object.keys(patch).length === 0) throw new Error('Cần truyền ít nhất một thay đổi cho template.');

          await interaction.deferReply({ ephemeral: true });
          const settings = await greetingStore.update(guildId, kind, patch);
          await interaction.editReply({ content: `${greetingLabel(kind)} đã được cập nhật.\n${formatGreetingTemplate(kind, settings[kind])}\nMembers Intent: ${config.guildMembersIntentEnabled ? 'bật' : 'tắt'}`, allowedMentions: { parse: [] } });
          return;
        }
        if (operatorGroup === 'automod') {
          const guildId = interaction.guildId!;
          if (operatorSubcommand === 'show') {
            const settings = await automodStore.get(guildId);
            await interaction.reply({ content: formatAutoModSettings(settings, config.messageContentIntentEnabled), ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'policy') {
            const enabled = interaction.options.getBoolean('enabled', true);
            const mode = interaction.options.getString('mode', true);
            const confirm = interaction.options.getBoolean('confirm', true);
            if (!AUTO_MOD_MODES.includes(mode as (typeof AUTO_MOD_MODES)[number])) throw new Error('mode AutoMod không hợp lệ.');
            if (confirm !== true) throw new Error('Cần confirm: Có để thay đổi policy AutoMod.');
            const current = await automodStore.get(guildId);
            const settings = await automodStore.update(guildId, { ...current, enabled, mode });
            const safetyNote = mode === 'enforce'
              ? '\nEnforce vẫn bị giới hạn bởi permission, limiter và safety policy; anti-raid/anti-nuke chỉ alert-only.'
              : '';
            await interaction.reply({ content: `AutoMod policy đã cập nhật.${safetyNote}\n${formatAutoModSettings(settings, config.messageContentIntentEnabled)}`, ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'rule') {
            const rule = interaction.options.getString('rule', true) as AutoModRuleKind;
            if (!AUTO_MOD_RULES.includes(rule)) throw new Error('Rule AutoMod không hợp lệ.');
            const enabled = interaction.options.getBoolean('enabled', true);
            const action = interaction.options.getString('action');
            if (action !== null && !AUTO_MOD_ACTIONS.includes(action as (typeof AUTO_MOD_ACTIONS)[number])) throw new Error('Action AutoMod không hợp lệ.');
            const threshold = interaction.options.getInteger('threshold');
            const windowSeconds = interaction.options.getInteger('window');
            const cooldownSeconds = interaction.options.getInteger('cooldown');
            const current = await automodStore.get(guildId);
            const currentRule = current.rules[rule];
            if ((threshold !== null || windowSeconds !== null) && !('threshold' in currentRule)) {
              throw new Error('Rule này không hỗ trợ threshold/window.');
            }
            const nextRule: Record<string, unknown> = { ...currentRule, enabled };
            if (action !== null) nextRule.proposedAction = action;
            if (threshold !== null) nextRule.threshold = threshold;
            if (windowSeconds !== null) nextRule.windowSeconds = windowSeconds;
            if (cooldownSeconds !== null) nextRule.cooldownSeconds = cooldownSeconds;
            const settings = await automodStore.update(guildId, { ...current, rules: { ...current.rules, [rule]: nextRule } });
            await interaction.reply({ content: `Rule **${rule}** đã cập nhật.\n${formatAutoModSettings(settings, config.messageContentIntentEnabled)}`, ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'domain') {
            const action = interaction.options.getString('action', true);
            if (action !== 'add' && action !== 'remove') throw new Error('Action domain không hợp lệ.');
            const domain = normalizeDomain(interaction.options.getString('domain', true));
            const current = await automodStore.get(guildId);
            const domains = action === 'add'
              ? [...new Set([...current.rules.link.blockedDomains, domain])]
              : current.rules.link.blockedDomains.filter((item) => item !== domain);
            const settings = await automodStore.update(guildId, { ...current, rules: { ...current.rules, link: { ...current.rules.link, blockedDomains: domains } } });
            await interaction.reply({ content: `Blocked domain đã ${action === 'add' ? 'thêm' : 'xóa'}: **${domain}**.\n${formatAutoModSettings(settings, config.messageContentIntentEnabled)}`, ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'exempt') {
            const action = interaction.options.getString('action', true);
            if (action !== 'add' && action !== 'remove') throw new Error('Action exemption không hợp lệ.');
            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');
            if ((user ? 1 : 0) + (role ? 1 : 0) !== 1) throw new Error('Chọn đúng một user hoặc role để exemption.');
            const id = user?.id ?? role?.id;
            const field = user ? 'exemptUserIds' : 'exemptRoleIds';
            const current = await automodStore.get(guildId);
            const values = current[field];
            const nextValues = action === 'add'
              ? [...new Set([...values, id!])]
              : values.filter((value) => value !== id);
            const settings = await automodStore.update(guildId, { ...current, [field]: nextValues });
            await interaction.reply({ content: `Exemption đã ${action === 'add' ? 'thêm' : 'xóa'} cho ${user ? 'user' : 'role'} **${id}**.\n${formatAutoModSettings(settings, config.messageContentIntentEnabled)}`, ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'review') {
            const status = interaction.options.getString('status') as AutoModReviewStatus | null;
            if (status !== null && !AUTO_MOD_REVIEW_STATUSES.includes(status)) throw new Error('Status AutoMod review không hợp lệ.');
            const limit = interaction.options.getInteger('limit') ?? 10;
            await interaction.deferReply({ ephemeral: true });
            const entries = await automodReviewStore.list(guildId, status ?? undefined, limit);
            await interaction.editReply({ content: formatAutoModReview(entries), allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'decide') {
            const reviewId = interaction.options.getString('review_id', true);
            const decision = interaction.options.getString('decision', true);
            if (decision !== 'confirm' && decision !== 'dismiss') throw new Error('Decision AutoMod review không hợp lệ.');
            const entry = await automodReviewStore.decide(guildId, reviewId, decision, interaction.options.getString('note') ?? undefined);
            await interaction.reply({ content: `Review **${entry.id}** đã được ghi nhận: **${entry.status}**. Đây chỉ là quyết định local, không đảo ngược hay thực hiện mutation Discord.`, ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          if (operatorSubcommand === 'recover') {
            if (interaction.options.getBoolean('confirm', true) !== true) throw new Error('Cần confirm: Có để recovery AutoMod.');
            const current = await automodStore.get(guildId);
            const settings = await automodStore.update(guildId, { ...current, enabled: false, mode: 'dry-run' });
            runtimeAutoModEngine.resetGuild(guildId);
            await interaction.reply({ content: `AutoMod đã chuyển về safe mode và detector memory của guild đã được reset.\n${formatAutoModSettings(settings, config.messageContentIntentEnabled)}`, ephemeral: true, allowedMentions: { parse: [] } });
            return;
          }
          throw new Error('Subcommand AutoMod không được hỗ trợ.');
        }
        if (operatorSubcommand === 'status') {
          const player = getPlayerSnapshot(interaction.guildId!);
          await interaction.reply(
            `Runtime: **${config.runtimeProfile}** · Discord: **${interaction.client.isReady() ? 'ready' : 'not ready'}** · Guilds: **${interaction.client.guilds.cache.size}**\n` +
            `Control bridge: **${config.controlEnabled ? `${config.controlHost}:${config.controlPort}` : 'disabled'}**\n` +
            `Player: **${player ? `${player.status} · <#${player.voiceChannelId}>` : 'idle'}**`
          );
          return;
        }
        if (operatorSubcommand === 'providers') {
          await interaction.reply(
            `YouTube: **ready**\n` +
            `SoundCloud: **${isSoundCloudAvailable() ? 'ready' : 'unavailable'}** · enabled=${isSoundCloudEnabled()} · configured=${isSoundCloudConfigured()}`
          );
          return;
        }
        if (operatorSubcommand === 'diagnostics') {
          await interaction.reply({ content: formatOperatorDiagnostics(interaction), ephemeral: true });
          return;
        }
        if (operatorGroup) throw new Error('Nhóm subcommand Bot không được hỗ trợ.');
        await interaction.deferReply();
        const result = await registerSlashCommands(interaction.guildId!);
        await interaction.editReply(`Đã đồng bộ **${result.count}** slash commands cho server này.`);
        return;
      }
      case 'rank': {
        const rank = await communityStore.member(interaction.guildId!, interaction.user.id);
        if (!rank) {
          await interaction.reply('Bạn chưa có XP. Hãy trò chuyện trong server để bắt đầu.');
          return;
        }
        await interaction.reply(`**${rank.username}** · Level ${rank.level} · ${rank.xp} XP · hạng #${rank.rank}\nTiến trình level: ${rank.progress}% · ${rank.nextLevelXp} XP để lên level tiếp theo.`);
        return;
      }
      case 'leaderboard': {
        const page = interaction.options.getInteger('page') ?? 1;
        const leaderboard = await communityStore.leaderboard(interaction.guildId!, 10, (page - 1) * 10);
        if (leaderboard.length === 0) {
          await interaction.reply(page === 1 ? 'Bảng xếp hạng chưa có dữ liệu.' : `Trang ${page} chưa có dữ liệu.`);
          return;
        }
        await interaction.reply(`Bảng xếp hạng · trang ${page}\n` + leaderboard.map((member) => `${member.rank}. **${member.username}** · Level ${member.level} · ${member.xp} XP`).join('\n'));
        return;
      }
      case 'join': {
        const voiceChannel = getMemberVoiceChannel(interaction);
        const existing = getPlayerSnapshot(interaction.guildId!);
        joinOrMovePlayer(voiceChannel);
        await interaction.reply(existing && existing.voiceChannelId !== voiceChannel.id
          ? `Đã chuyển LocalBot sang voice channel **${voiceChannel.name}** và giữ nguyên hàng đợi.`
          : `LocalBot đã tham gia voice channel **${voiceChannel.name}**.`);
        return;
      }
      case 'search': {
        const query = interaction.options.getString('query', true);
        const source = (interaction.options.getString('source') ?? 'youtube') as MediaSearchSource;
        await interaction.deferReply();
        const results = await searchMedia(query, source);
        if (results.length === 0) {
          await interaction.editReply('Không tìm thấy track phù hợp.');
          return;
        }
        await interaction.editReply(results.map((track, index) => `${index + 1}. ${formatTrack(track)}`).join('\n\n'));
        return;
      }
      case 'info': {
        const url = interaction.options.getString('url', true);
        await interaction.deferReply();
        const track = await resolveMedia(url);
        await interaction.editReply({ embeds: [embedForTrack(track)] });
        return;
      }
      case 'play': {
        const query = interaction.options.getString('query', true);
        const source = (interaction.options.getString('source') ?? 'youtube') as MediaProvider;
        const voiceChannel = getMemberVoiceChannel(interaction);
        await interaction.deferReply();
        const track = await resolveMedia(query, source);
        getOrCreatePlayer(voiceChannel);
        const wasIdle = !getQueue(interaction.guildId!).current;
        const position = enqueue(interaction.guildId!, track);
        await interaction.editReply({
          content: position === 1 && wasIdle
            ? `Đang chuẩn bị phát: **${track.title}** · ${sourceLabel(track.provider)}`
            : `Đã thêm vào vị trí #${position}: **${track.title}** · ${sourceLabel(track.provider)}`,
          embeds: [embedForTrack(track)]
        });
        return;
      }
      case 'queue': {
        const { current, queue, shuffle, repeatMode } = getQueue(interaction.guildId!);
        if (!current && queue.length === 0) {
          await interaction.reply('Hàng đợi đang trống.');
          return;
        }
        const repeatLabel = repeatMode === 'off' ? 'Tắt lặp' : repeatMode === 'all' ? 'Lặp hàng đợi' : 'Lặp một bài';
        const lines = [current ? `**Đang phát:** ${current.title} · ${sourceLabel(current.provider)}` : 'Không có bài đang phát.', `Chế độ: ${shuffle ? 'Ngẫu nhiên' : 'Tuần tự'} · ${repeatLabel}`];
        queue.forEach((track, index) => lines.push(`${index + 1}. ${track.title} · ${track.durationText} · ${sourceLabel(track.provider)}`));
        await interaction.reply(lines.join('\n'));
        return;
      }
      case 'now-playing': {
        const snapshot = getPlayerSnapshot(interaction.guildId!);
        if (!snapshot?.current) {
          await interaction.reply('Hiện chưa có bài nào đang phát.');
          return;
        }
        await interaction.reply({
          content: `Voice channel: <#${snapshot.voiceChannelId}> · Trạng thái: **${snapshot.status}** · Âm lượng: **${snapshot.volumePercent}%**`,
          embeds: [embedForTrack(snapshot.current)]
        });
        return;
      }
      case 'clear': {
        await interaction.reply(clearQueue(interaction.guildId!)
          ? 'Đã xóa các bài đang chờ. Bài hiện tại vẫn được giữ.'
          : 'Chưa có player đang hoạt động.');
        return;
      }
      case 'remove': {
        const position = interaction.options.getInteger('position', true);
        const removed = removeFromQueue(interaction.guildId!, position);
        await interaction.reply(removed ? `Đã xóa #${position}: **${removed.title}**.` : 'Vị trí không hợp lệ hoặc hàng đợi đang trống.');
        return;
      }
      case 'move': {
        const from = interaction.options.getInteger('from', true);
        const to = interaction.options.getInteger('to', true);
        await interaction.reply(moveInQueue(interaction.guildId!, from, to)
          ? `Đã chuyển bài từ #${from} sang #${to}.`
          : 'Không thể di chuyển: hãy kiểm tra vị trí trong hàng đợi.');
        return;
      }
      case 'shuffle': {
        const enabled = toggleShuffle(interaction.guildId!);
        await interaction.reply(enabled == null ? 'Chưa có player đang hoạt động.' : `Phát ngẫu nhiên: ${enabled ? 'bật' : 'tắt'}.`);
        return;
      }
      case 'repeat': {
        const mode = interaction.options.getString('mode', true) as RepeatMode;
        const repeatMode = setRepeatMode(interaction.guildId!, mode);
        const label = mode === 'off' ? 'tắt' : mode === 'all' ? 'hàng đợi' : 'một bài';
        await interaction.reply(repeatMode == null ? 'Chưa có player đang hoạt động.' : `Đã đặt lặp ${label}.`);
        return;
      }
      case 'equalizer': {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;
        if (subcommand === 'show') {
          const settings = await equalizerStore.getAsync(guildId);
          await interaction.reply(`Equalizer hiện tại: bass ${settings.bass >= 0 ? '+' : ''}${settings.bass} dB · mid ${settings.mid >= 0 ? '+' : ''}${settings.mid} dB · treble ${settings.treble >= 0 ? '+' : ''}${settings.treble} dB.`);
          return;
        }
        if (subcommand === 'preset') {
          const preset = interaction.options.getString('name', true) as EqualizerPreset;
          const settings = await equalizerStore.setPreset(guildId, preset);
          await interaction.reply(`Đã áp dụng preset **${preset}**: bass ${settings.bass} dB · mid ${settings.mid} dB · treble ${settings.treble} dB.`);
          return;
        }
        const settings = await equalizerStore.set(guildId, {
          bass: interaction.options.getInteger('bass', true),
          mid: interaction.options.getInteger('mid', true),
          treble: interaction.options.getInteger('treble', true)
        });
        await interaction.reply(`Đã lưu Equalizer: bass ${settings.bass} dB · mid ${settings.mid} dB · treble ${settings.treble} dB.`);
        return;
      }
      case 'playlist': {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;

        if (subcommand === 'list') {
          const playlists = await playlistStore.list(guildId);
          if (playlists.length === 0) {
            await interaction.reply('Server chưa có playlist local. Dùng `/playlist create` để tạo playlist đầu tiên.');
            return;
          }
          const lines = playlists.slice(0, 20).map((playlist, index) => {
            const description = playlist.description ? ` — ${playlist.description}` : '';
            return `${index + 1}. **${playlist.name}** · ${playlist.tracks.length} track${description}`;
          });
          await interaction.reply(lines.join('\n'));
          return;
        }

        const name = interaction.options.getString('name', true);
        if (subcommand === 'create') {
          const playlist = await playlistStore.create(guildId, name, interaction.options.getString('description') ?? undefined);
          await interaction.reply(`Đã tạo playlist **${playlist.name}**.`);
          return;
        }
        if (subcommand === 'edit') {
          const playlist = await playlistStore.update(guildId, name, {
            name: interaction.options.getString('new_name') ?? undefined,
            description: interaction.options.getString('description') ?? undefined
          });
          await interaction.reply(playlist ? `Đã cập nhật playlist **${playlist.name}**.` : 'Không tìm thấy playlist.');
          return;
        }
        if (subcommand === 'delete') {
          const playlist = await playlistStore.remove(guildId, name);
          await interaction.reply(playlist ? `Đã xóa playlist **${playlist.name}**.` : 'Không tìm thấy playlist.');
          return;
        }
        if (subcommand === 'add') {
          const query = interaction.options.getString('query', true);
          const source = (interaction.options.getString('source') ?? 'youtube') as MediaProvider;
          await interaction.deferReply();
          const track = await resolveMedia(query, source);
          const playlist = await playlistStore.addTrack(guildId, name, track);
          await interaction.editReply(playlist
            ? `Đã thêm **${track.title}** · ${sourceLabel(track.provider)} vào playlist **${playlist.name}**.`
            : 'Không tìm thấy playlist.');
          return;
        }
        if (subcommand === 'remove') {
          const position = interaction.options.getInteger('position', true);
          const removed = await playlistStore.removeTrack(guildId, name, position);
          await interaction.reply(removed ? `Đã xóa track #${position}: **${removed.title}**.` : 'Không tìm thấy playlist hoặc vị trí track không hợp lệ.');
          return;
        }
        if (subcommand === 'move') {
          const playlist = await playlistStore.moveTrack(guildId, name, interaction.options.getInteger('from', true), interaction.options.getInteger('to', true));
          await interaction.reply(playlist ? `Đã sắp xếp playlist **${playlist.name}**.` : 'Không tìm thấy playlist hoặc vị trí track không hợp lệ.');
          return;
        }
        if (subcommand === 'play') {
          const voiceChannel = getMemberVoiceChannel(interaction);
          const playlist = await playlistStore.find(guildId, name);
          if (!playlist) {
            await interaction.reply('Không tìm thấy playlist.');
            return;
          }
          if (playlist.tracks.length === 0) {
            await interaction.reply('Playlist đang trống.');
            return;
          }
          getOrCreatePlayer(voiceChannel);
          playlist.tracks.forEach((track) => enqueue(guildId, track));
          await interaction.reply(`Đã xếp ${playlist.tracks.length} track từ playlist **${playlist.name}** vào hàng đợi.`);
          return;
        }
        return;
      }
      case 'music-access': {
        if (!isGuildManager(interaction)) {
          outcome = 'denied';
          await interaction.reply('Bạn cần quyền Manage Server hoặc Administrator để quản lý quyền Music.');
          return;
        }
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;
        if (subcommand === 'mode') {
          const mode = interaction.options.getString('value', true) as MusicPermissionMode;
          await musicPermissionStore.setMode(guildId, mode);
          await interaction.reply(`Chế độ quyền Music: ${mode === 'all' ? 'cho phép tất cả' : 'allow-list'}.`);
          return;
        }
        if (subcommand === 'add') {
          const user = interaction.options.getUser('user', true);
          await musicPermissionStore.addUser(guildId, user.id);
          await interaction.reply(`Đã cấp quyền Music cho **${user.username}**.`);
          return;
        }
        if (subcommand === 'remove') {
          const user = interaction.options.getUser('user', true);
          const removed = await musicPermissionStore.removeUser(guildId, user.id);
          await interaction.reply(removed ? `Đã thu hồi quyền Music của **${user.username}**.` : 'User này chưa có trong allow-list.');
          return;
        }
        const permissions = await musicPermissionStore.get(guildId);
        await interaction.reply(`Chế độ: **${permissions.mode === 'all' ? 'cho phép tất cả' : 'allow-list'}**\nUser được cấp: ${permissions.userIds.length}`);
        return;
      }
      case 'community-config': {
        if (!isGuildManager(interaction)) {
          outcome = 'denied';
          await interaction.reply('Bạn cần quyền Manage Server hoặc Administrator để cấu hình Community.');
          return;
        }
        const guildId = interaction.guildId!;
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'ignore-channel') {
          const action = interaction.options.getString('action', true);
          const channel = interaction.options.getChannel('channel', true);
          const settings = action === 'add'
            ? await communityStore.addIgnoredChannel(guildId, channel.id)
            : await communityStore.removeIgnoredChannel(guildId, channel.id);
          await interaction.reply(`Đã ${action === 'add' ? 'thêm' : 'xóa'} kênh **${channel.name}** khỏi tính XP. Hiện có ${settings.ignoredChannelIds.length} kênh bị bỏ qua.`);
          return;
        }
        if (subcommand === 'ignore-role') {
          const action = interaction.options.getString('action', true);
          const role = interaction.options.getRole('role', true);
          const settings = action === 'add'
            ? await communityStore.addIgnoredRole(guildId, role.id)
            : await communityStore.removeIgnoredRole(guildId, role.id);
          await interaction.reply(`Đã ${action === 'add' ? 'thêm' : 'xóa'} role **${role.name}** khỏi tính XP. Hiện có ${settings.ignoredRoleIds.length} role bị bỏ qua.`);
          return;
        }
        if (subcommand === 'cooldown') {
          const seconds = interaction.options.getInteger('seconds', true);
          const settings = await communityStore.setCooldownSeconds(guildId, seconds === -1 ? null : seconds);
          await interaction.reply(settings.cooldownSeconds === null
            ? 'Đã reset cooldown XP về mặc định global.'
            : `Đã đặt cooldown XP của guild là ${settings.cooldownSeconds} giây.`);
          return;
        }
        if (subcommand === 'xp-multiplier') {
          const multiplier = interaction.options.getInteger('multiplier', true);
          const settings = await communityStore.setXpMultiplier(guildId, multiplier);
          await interaction.reply(`Đã đặt XP multiplier của guild là x${settings.xpMultiplier}.`);
          return;
        }
        if (subcommand === 'role-multiplier') {
          const action = interaction.options.getString('action', true);
          const role = interaction.options.getRole('role', true);
          const multiplier = interaction.options.getInteger('multiplier');
          const settings = action === 'add'
            ? await communityStore.setRoleMultiplier(guildId, role.id, multiplier ?? 1)
            : await communityStore.removeRoleMultiplier(guildId, role.id);
          await interaction.reply(action === 'add'
            ? `Đã đặt role multiplier **${role.name}** là x${settings.roleMultipliers[role.id]}.`
            : `Đã xóa role multiplier của **${role.name}**.`);
          return;
        }
        if (subcommand === 'role-reward') {
          const action = interaction.options.getString('action', true);
          const role = interaction.options.getRole('role', true);
          const level = interaction.options.getInteger('level');
          const settings = action === 'add'
            ? await communityStore.setRoleReward(guildId, role.id, level ?? 2)
            : await communityStore.removeRoleReward(guildId, role.id);
          const reward = settings.roleRewards.find((entry) => entry.roleId === role.id);
          await interaction.reply(action === 'add'
            ? `Đã đặt role reward **${role.name}** từ level ${reward?.level}.`
            : `Đã xóa role reward của **${role.name}**.`);
          return;
        }
        if (subcommand === 'reset') {
          if (!interaction.options.getBoolean('confirm', true)) {
            await interaction.reply('Chưa xác nhận. Chọn `confirm: Có` nếu thực sự muốn xóa XP của guild.');
            return;
          }
          const result = await communityStore.resetProgress(guildId);
          await interaction.reply(`Đã reset tiến trình Community của guild: ${result.removedMembers} thành viên. Cấu hình cooldown/kênh/role được giữ nguyên.`);
          return;
        }
        const settings = await communityStore.getSettings(guildId);
        await interaction.reply(
          `Kênh bị bỏ qua: ${settings.ignoredChannelIds.length ? settings.ignoredChannelIds.map((id) => `<#${id}>`).join(', ') : 'không có'}\n` +
          `Role bị bỏ qua: ${settings.ignoredRoleIds.length ? settings.ignoredRoleIds.map((id) => `<@&${id}>`).join(', ') : 'không có'}\n` +
          `Cooldown: ${settings.cooldownSeconds === null ? 'mặc định global' : `${settings.cooldownSeconds} giây`}\n` +
          `XP multiplier: x${settings.xpMultiplier}\n` +
          `Role multiplier: ${Object.keys(settings.roleMultipliers).length ? Object.entries(settings.roleMultipliers).map(([id, value]) => `<@&${id}> x${value}`).join(', ') : 'không có'}\n` +
          `Role reward: ${settings.roleRewards.length ? settings.roleRewards.map((reward) => `<@&${reward.roleId}> từ level ${reward.level}`).join(', ') : 'không có'}`
        );
        return;
      }
      case 'skip': {
        const skipped = skip(interaction.guildId!);
        await interaction.reply(skipped ? `Đã bỏ qua: **${skipped.title}**` : 'Không có bài đang phát.');
        return;
      }
      case 'previous': {
        const previousTrack = previous(interaction.guildId!);
        await interaction.reply(previousTrack ? `Đang phát lại: **${previousTrack.title}**` : 'Chưa có bài trước trong lịch sử phát.');
        return;
      }
      case 'pause':
        await interaction.reply(pause(interaction.guildId!) ? 'Đã tạm dừng.' : 'Không có bài đang phát để tạm dừng.');
        return;
      case 'resume':
        await interaction.reply(resume(interaction.guildId!) ? 'Đã tiếp tục phát.' : 'Không có bài đang tạm dừng.');
        return;
      case 'volume': {
        const percent = interaction.options.getInteger('percent', true);
        const volume = setVolume(interaction.guildId!, percent);
        await interaction.reply(volume == null ? 'Chưa có player đang hoạt động.' : `Âm lượng Discord: ${volume}%.`);
        return;
      }
      case 'stop':
        stop(interaction.guildId!);
        await interaction.reply('Đã dừng phát và xóa hàng đợi.');
        return;
      case 'leave':
        destroyGuildPlayer(interaction.guildId!);
        await interaction.reply('LocalBot đã rời voice channel.');
        return;
      default:
        return;
    }
  } catch (error) {
    outcome = 'error';
    const message = error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`⚠️ ${message}`);
    } else {
      await interaction.reply(`⚠️ ${message}`);
    }
  } finally {
    try {
      await auditLogStore.record(buildCommandAuditRecord({
        commandName: interaction.commandName,
        subcommand,
        actorId: interaction.user?.id ?? null,
        guildId: interaction.guildId ?? null,
        outcome
      }));
    } catch (auditError) {
      // Accountability telemetry must never turn a completed Discord command
      // into a failed interaction when local storage is unavailable.
      console.error('[audit] slash command record failed:', auditError instanceof Error ? auditError.message : 'unknown error');
    }
  }
}
