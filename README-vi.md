# LocalBOT

> 🚧 **Đang phát triển tích cực / Pre-release**
>
> LocalBOT vẫn đang được phát triển. Tính năng, API, cấu hình và workflow deploy có thể thay đổi.
> Bản public development preview đầu tiên là
> [`v0.1.0-alpha.1`](https://github.com/thuanlyt/LocalBOT/releases/tag/v0.1.0-alpha.1).
> Hiện chưa có beta hoặc stable release.

LocalBOT là Discord bot local-first, gồm native console cho Windows và runtime headless nhẹ cho
trường hợp chỉ cần slash command trên Windows hoặc Linux VPS. Mục tiêu là dùng dữ liệu provider
thật, lưu trữ cục bộ an toàn, vận hành rõ ràng, và không biến dữ liệu giả thành trạng thái “đã hoàn thiện”.

[Đọc README tiếng Anh canonical](README.md)

> Bản VPS chưa được deploy thật. Profile Linux, mẫu systemd, hướng dẫn đóng gói và kiểm tra hợp
> đồng cục bộ đã có; kiểm tra trên host Linux thật, FFmpeg, quyền file, network và phát voice vẫn
> là Blocked cho đến khi có VPS mục tiêu.

## Chọn cách chạy

| Nhu cầu | Profile | Phạm vi | Trạng thái |
| --- | --- | --- | --- |
| Windows Native Full | `native` | Tauri window, HMR, control loopback, quản lý guild/channel, Music UI, loa Windows, autostart | 🧪 Có trong `v0.1.0-alpha.1`; còn gate manual/release |
| Windows CMD / Headless | `headless` | Discord/Music core, slash commands, control bridge tùy chọn; không cần GUI | 🧪 Có trong `v0.1.0-alpha.1`; còn gate chạy dài hạn |
| Linux VPS Slash-only | `slash-only` | Discord gateway, slash commands, provider, persistence, logs; không UI/HTTP | 🧪 Source/local contract đã verify; chờ QA host thật |

Native window là **cội nguồn** của bot trong bản Windows: đóng app sẽ dừng bot child do app sở
hữu. `slash-only` là lựa chọn deploy khác, không mở native UI và không bind `127.0.0.1:2901`.

## Trạng thái phát hành

`v0.1.0-alpha.1` là bản public development preview theo hướng source-first để đánh giá và tiếp
tục phát triển. Đây chưa phải bản production, beta hay stable. Release notes ghi rõ phạm vi đã
verify tại máy hiện tại và các gate còn lại về clean-machine, signing, provider, accessibility
và VPS.

## Tính năng hiện có

- YouTube Music: tìm kiếm, metadata/thumbnail thật, queue, player, playlist, repeat, shuffle, volume, Equalizer và Discord voice.
- SoundCloud tùy chọn qua official API, có bật/tắt/cấu hình rõ ràng, URN identity, `/streams`, HLS AAC và trạng thái unavailable an toàn.
- Chọn guild/kênh voice, join/move/leave, output Discord/Windows/both trong native và realtime reconciliation.
- JSON local atomic cho playlist, queue recovery, quyền Music, Equalizer, Community, greetings, AutoMod, provider, Ollama và audit log đã redacted.
- Community XP/rank/leaderboard, Welcome/Goodbye, AutoMod mặc định tắt, moderation telemetry và phân quyền.
- Ollama chỉ là tùy chọn read-only có giới hạn; không tự chạy lệnh, shell, mutation server hoặc browse ngầm.
- `/bot status`, `/bot providers`, `/bot diagnostics`, `/bot audit local|discord`, `/bot greetings show|set|preview`, `/bot automod show|policy|rule|domain|exempt|review|decide|recover`, và `/bot sync` an toàn; các lệnh quản trị yêu cầu Manage Server/Administrator, còn preview không gửi message.
- Settings native có bảng readiness an toàn, không chứa secret (`LB-OPS-001`), cho ownership runtime, Discord gateway, provider và privileged intent.

Runtime hoạt động không chứa guild, track, queue, progress hay provider placeholder. Khi thiếu
credential/offline/empty, app hiển thị trạng thái rõ ràng.

## Công nghệ

Node.js 22.12+, TypeScript/ESM, discord.js 14, `@discordjs/voice`, `youtubei.js`, official
SoundCloud API, FFmpeg, Tauri 2/Rust, React 19, Vite 7, Motion, Lucide/Iconify fallback và Be
Vietnam Pro. Persistence hiện dùng JSON versioned + atomic write; chưa đổi sang SQLite nếu chưa
có ADR và bằng chứng cần thiết.

## Chạy native Windows dev

```powershell
npm install
npm --prefix native install
npm run native:dev
```

Native sở hữu bot child và frontend có HMR. Không chạy thêm `npm run dev` trong cùng phiên. `.env`
cần token Discord và `DISCORD_CLIENT_ID`; bật Discord privileged intent tương ứng khi dùng tính
năng cần nó. Tauri inject `LOCALBOT_RUNTIME_PROFILE=native`, `LOCALBOT_CONTROL_ENABLED=true`,
`LOCALBOT_CONTROL_HOST=127.0.0.1`, `LOCALBOT_CONTROL_PORT=2901`.

2901 là control bridge loopback, không phải public web dashboard. Tùy chọn `Khởi động cùng
Windows` nằm trong Settings và mặc định tắt.

## Chạy Windows headless / CMD

Dùng mode này khi không cần cửa sổ Native. Nó dùng chung LocalBOT Core và slash commands, không
cần Tauri, React, browser hoặc port `2901`.

```powershell
npm ci
npm run doctor
npm run build
npm start
```

Đặt `LOCALBOT_RUNTIME_PROFILE=headless` và giữ `LOCALBOT_CONTROL_ENABLED=false` cho process tối
giản. `npm run doctor` chỉ báo tên key thiếu và boundary runtime, không in secret. Dùng
`npm run register` khi cần đăng ký slash command rõ ràng; `/bot sync` vẫn dùng được sau khi bot online.

## Chuẩn bị runtime slash-only cho VPS

```powershell
$env:LOCALBOT_RUNTIME_PROFILE = 'slash-only'
$env:LOCALBOT_CONTROL_ENABLED = 'false'
$env:LOCALBOT_AUTO_REGISTER_COMMANDS = 'false'
npm ci
npm run build
npm run register
node dist/index.js
```

Trên server, dùng environment file do operator quản lý, đặt `LOCALBOT_DATA_DIR` và
`YOUTUBE_CACHE_DIR` vào thư mục persistent. `slash-only` không tự overwrite global commands mỗi lần
boot. Mẫu systemd là [`deploy/systemd/localbot.service.example`](deploy/systemd/localbot.service.example);
đó chỉ là reference, chưa phải bằng chứng đã deploy.

## Environment quan trọng

```text
LOCALBOT_RUNTIME_PROFILE=native|headless|slash-only
LOCALBOT_AUTO_REGISTER_COMMANDS=true|false
LOCALBOT_CONTROL_ENABLED=false
LOCALBOT_CONTROL_HOST=127.0.0.1
LOCALBOT_CONTROL_PORT=2901
```

Profile sai, host sai hoặc port sai sẽ fail-closed. Không log/commit token, cookie, SoundCloud
secret, OAuth header hay raw provider payload. `DISCORD_TOKEN` là tên chuẩn; `BOT_TOKEN` chỉ là
alias tương thích.

## QA và trạng thái trung thực

```powershell
npm test
npm run typecheck
npm run build
npm run doctor
npm run qa:headless:smoke
npm run native:typecheck
npm run native:test
npm run qa:headless
npm run audit:static
npm run audit:docs
```

Native release:

```powershell
npm run native:build
npm run native:verify
npm run native:smoke
```

Guild QA được cấp quyền là `1541307192534241318`; phải discover channel thật khi test. Không
mass-message, mass-delete, raid, nuke hoặc bật AutoMod destructive để test. Evidence hiện tại là
evidence trên máy phát triển/installer hiện tại, không thay cho clean-machine, reboot/autostart,
SoundCloud vault, physical device, signing hay Linux VPS.

## Tài liệu

- [`docs/SDD.md`](docs/SDD.md): quy tắc Spec-Driven Development.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): ownership, control boundary, runtime profile.
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md): biến môi trường và VPS preparation.
- [`docs/MUSIC_SPEC.md`](docs/MUSIC_SPEC.md): Music/provider/queue/output contract.
- [`docs/OPS_SPEC.md`](docs/OPS_SPEC.md): contract readiness và diagnostics cho operator.
- [`docs/HEADLESS_PARITY.md`](docs/HEADLESS_PARITY.md): ma trận Native, Windows Headless và slash-only.
- [`docs/RELEASE_QA_RUNBOOK.md`](docs/RELEASE_QA_RUNBOOK.md): QA và release gates.
- [`docs/AUDIT_STATUS.md`](docs/AUDIT_STATUS.md): evidence và distinction historical/current.
- [`docs/REMAINING_GAPS.md`](docs/REMAINING_GAPS.md): gap list và VPS blockers.
- [`CODEX-ROADMAP/ROADMAP.md`](CODEX-ROADMAP/ROADMAP.md), [`CLAUDE-ROADMAP/ROADMAP.md`](CLAUDE-ROADMAP/ROADMAP.md): kế hoạch agent.
- [README tiếng Anh](README.md)

### Milestone

- [x] Public development preview đầu tiên — [`v0.1.0-alpha.1`](https://github.com/thuanlyt/LocalBOT/releases/tag/v0.1.0-alpha.1)
- [ ] Beta release đầu tiên
- [ ] Release candidate đầu tiên
- [ ] Stable release đầu tiên

## 💖 Ủng hộ dự án

LocalBOT là dự án **miễn phí và mã nguồn mở**. Nếu dự án giúp bạn tiết kiệm thời gian, hãy tặng
chúng tôi một ⭐ **Star** — điều đó giúp dự án tiếp tục phát triển và có thêm tính năng.

<a href="https://github.com/thuanlyt/LocalBOT/stargazers">
  <img src="https://img.shields.io/github/stars/thuanlyt/LocalBOT?style=social" alt="GitHub Stars">
</a>

### 🤝 Cộng đồng & hỗ trợ

* 📖 [Đọc tài liệu](https://github.com/thuanlyt/LocalBOT#readme)
* 🐛 [Báo lỗi](https://github.com/thuanlyt/LocalBOT/issues)
* 🌐 [Website ThuanLYT](https://thuanlyt.id.vn)

<p align="center"><em>Được xây dựng bằng ❤️ bởi ThuanLYT</em></p>
