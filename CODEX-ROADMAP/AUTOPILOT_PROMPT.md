# Prompt kích hoạt Codex — LocalBot Enterprise Autopilot

Dùng cho chính phiên Codex hiện tại hoặc một Codex session đã đọc repository:

```text
Kích hoạt autopilot cho LocalBot theo CODEX-ROADMAP/ROADMAP.md. Mục tiêu là hoàn thiện sản phẩm cấp doanh nghiệp, không chỉ hoàn thiện demo: native Windows app là cội nguồn và sole owner của bot runtime; Music YouTube + SoundCloud dùng dữ liệu thật; quản trị bot/guild/phân quyền; Community; logs/onboarding; AutoMod/anti-raid/anti-nuke; Ollama tùy chọn; QA, production build và cleanup cuối cùng.

Hãy tiếp tục làm việc thực tế qua tất cả phase còn thiếu. Không dừng ở plan, không chờ tôi nhắc từng bước, không gọi build dev là release complete, và không đánh dấu complete nếu còn acceptance gate chưa có evidence.

VAI TRÒ VÀ PHỐI HỢP
- Bạn là Codex integration/release owner. Ưu tiên runtime native/Tauri, cross-feature contracts, security, live QA, installer, release evidence và cleanup gate.
- Claude Code là implementation partner. Trước khi sửa source, kiểm tra `CLAUDE-ROADMAP/ROADMAP.md` và `docs/AGENT_COORDINATION.md`; không ghi đè active Claude claim. Nếu Claude đã claim một package, làm integration/documentation độc lập hoặc ghi blocker.
- Khi Claude chưa chạy hoặc không có claim, bạn có thể triển khai bất kỳ package nào cần thiết, nhưng vẫn phải ghi owner, requirement ID và handoff rõ ràng.
- Sau mỗi slice, cập nhật cả roadmap sản phẩm và roadmap owner liên quan; không biến một slice `Implemented` thành `Current` nếu thiếu acceptance evidence.

ĐỌC VÀ TUÂN THỦ
- docs/SDD.md là quy trình bắt buộc.
- docs/ROADMAP.md là product roadmap.
- CODEX-ROADMAP/ROADMAP.md là execution/release roadmap của Codex.
- CLAUDE-ROADMAP/ROADMAP.md là implementation roadmap để giữ parity khi có Claude.
- docs/ARCHITECTURE.md, docs/MUSIC_SPEC.md, docs/SOUNDCLOUD_CREDENTIALS_SPEC.md khi chạm provider credentials, docs/UI_UX_V1.md, docs/AUDIT_STATUS.md và docs/AGENT_COORDINATION.md là các tài liệu định tuyến.
- Trước mỗi slice: requirement ID, scope/out-of-scope, contract, states, acceptance test, ADR nếu cần. Sau slice: test/build/QA/docs/evidence rồi release claim.

RANH GIỚI KHÔNG ĐƯỢC PHÁ
- Native app đóng thì bot do native sở hữu phải dừng; không adopt hoặc kill process bot bên ngoài.
- Control plane chỉ ở 127.0.0.1:2901.
- Không đọc/ghi/in giá trị .env, token, cookie, OAuth/API key, raw provider response, private member data. Credential SoundCloud native phải đi qua Windows Credential Manager theo `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`, không mở route loopback mới.
- Không fake guild/track/thumbnail/queue/progress/provider status/success. Dữ liệu không có phải có empty/offline/error/stale state.
- Dark là mặc định; giữ đúng 3 theme v1: Default split-tone, Dark, Light.
- Chỉ YouTube và SoundCloud trong scope Music; provider adapter phải độc lập.
- SoundCloud phải tuân theo `LB-MUSIC-017`: refresh token single-use bị từ chối chỉ được xoá khỏi in-memory cache rồi fallback qua HTTP Basic Client Credentials; lỗi mạng không được xoá cache, không dùng cookie/scraper/endpoint undocumented.
- AutoMod content rules phải tuân theo `LB-SAFETY-008`: chỉ yêu cầu `Message Content Intent` khi operator đã bật capability trong Discord Developer Portal và đặt `LOCALBOT_MESSAGE_CONTENT_INTENT=true`; mặc định disabled là safe no-op, không được suy đoán match từ message content thiếu.
- Discord và Windows output chạy như hai sink song song; local failure không được làm gián đoạn Discord.
- Native guild-scoped reads and SSE streams must obey `LB-UI-002`: per-surface last-write-wins revision, selected-guild identity check, bridge-online check, and immediate player refresh after guild change. Never let a late previous-guild response or event overwrite current UI state.
- Guild-scoped action responses must also obey `LB-UI-003`: capture the originating guild and monotonic guild-selection revision, and guard state, loading cleanup, and success/error feedback after a guild switch (including returning to the original guild). Never cancel an accepted Discord operation or report stale action success as current.
- Discord command changes must preserve `LB-COMMANDS-001`: keep command/option names and descriptions Discord-safe, sibling options/choices unique, required scalar options before optional ones, and Music provider/repeat/volume/queue bounds explicit. Run the pure command contract test before registration.
- Slash-command accountability must preserve `LB-LOG-007`: record only bounded actor/guild/command/subcommand/outcome metadata through the redacted local audit store; exclude query text, URLs, playlist names, provider payloads, and credentials; audit write failure must not change the Discord reply, and permission denials must be recorded as `denied`.
- Control-plane mutation audit must preserve `LB-LOG-008`: await the request-scoped redacted audit attempt before committing a successful mutation response; never fall back to the process-global audit store when an isolated store is supplied; audit failure stays isolated and never leaks payloads or creates an unhandled rejection.
- `LB-SECURITY-001` is non-negotiable: the unauthenticated native control bridge must bind exactly to `127.0.0.1:2901`; reject other hosts/ports before listening. Port `0` is test-only. Remote exposure requires a new authenticated SDD requirement and ADR.

QA LIVE
- Dùng guild thật 1541307192534241318 để integration QA. Discover channel thật, ưu tiên fixture/channel test riêng.
- Không spam, mass-delete, gửi tin ngoài ý muốn, ban người thật, phá guild hoặc test anti-nuke bằng destructive action. Dùng dry-run/fixture cô lập.
- Record evidence sanitize.

THỨ TỰ ƯU TIÊN
1. Production native-owned runtime/sidecar, autostart installed build, shutdown/readiness, data migrations/backup/recovery.
2. Music hoàn thiện: first-run context flow; provider contracts; real thumbnails/tags/metadata; search/resolve/stream; queue/player/history/playlists; controls; repeat off/all/one; Equalizer; slash/native parity; dedup; typed errors; retry; independent Discord/Windows sinks.
3. Native UX/control hardening: real-time guild/voice/player/provider reconciliation, stale markers, retry, direct modal, sticky footer dưới navigation, spacing/icon/tag/scrollbar correctness, no-flicker, keyboard/accessibility/reduced motion, Tauri breakpoint QA.
4. Server/guild/permission/audit completion.
5. Community XP/level/rank/leaderboard, searchable redacted logs, welcome/goodbye templates and safe preview/test-send.
6. AutoMod dry-run → enforce, anti-raid, anti-nuke, exemptions, kill switch, audit and recovery.
7. Optional Ollama with explicit settings, privacy, timeout/budget and untrusted AI boundary.
8. Full QA, security, performance, installer/release docs; then cleanup only via docs/CLEANUP_CHECKLIST.md.

AUTOMATED RELEASE GATE
- Include `npm run audit:static` and `npm run audit:docs` with the normal test/typecheck/build checks. The first scans only production source roots so fake/mock/sample/demo records cannot return to runtime; the second checks routed SDD/README/roadmap parity and the current native/Music boundary without scanning the whole repository. Both gates are secret-safe and do not replace installed/manual acceptance.
- Preserve `LB-QA-008`: use the opt-in `npm run native:smoke:configured` only when the operator has configured `.env`; it links that file into a temp-scoped app profile, waits for sanitized health `ready`, and removes the temporary install. Treat it as current-machine configured evidence only, never as clean-machine, playback, autostart/reboot, SoundCloud, visual, or signing proof.
- Preserve `LB-QA-012`: the opt-in `npm run native:smoke:restart` must stop/restart only the exact installed native-owned process tree and verify no automatic QA-guild voice join or player/playback state. Keep it read-only, refuse pre-existing sessions, and do not call it crash recovery, migration, upgrade, autostart, or reboot evidence.
- Preserve `LB-QA-013`: the opt-in `npm run native:smoke:commands` must exercise slash-command registration through the installed native-owned route, confirm the selected QA guild and current command count, and emit sanitized metadata only. Keep command interaction coverage separate and non-destructive.
- Preserve `LB-RUNTIME-016`/`LB-QA-017`: bounded recovery may restart only the exact native-owned child with 1/2/4-second backoff and at most three consecutive attempts; do not adopt external listeners, auto-join, auto-play, or restore active resources. Run `npm run native:smoke:crash-recovery` only in the configured isolated installed profile; it must keep the native root alive, observe a replacement child reach sanitized `ready`, and clean up. Keep `npm run native:smoke:crash` as the separate forced-root orphan-guard test.

AUTOPILOT LOOP
inspect → claim → specify → implement one coherent slice → deterministic tests → typecheck/build → safe live QA → synchronize docs → release claim → next unblocked slice.

Nếu có blocker thật (credential/provider unavailable, manual UI capability unavailable, hoặc cần owner decision), đánh dấu đúng phase bị block, ghi rõ bằng chứng, tiếp tục phase độc lập và không giả vờ pass. Luôn ưu tiên một vertical slice hoàn chỉnh có evidence hơn việc tạo nhiều code chưa kiểm chứng. Khi hoàn thành một phase, cập nhật docs/ROADMAP.md, CODEX-ROADMAP/ROADMAP.md, docs/AUDIT_STATUS.md và release notes tương ứng.
```
## Current deployment boundary

The shared runtime now has `native`, `headless`, and `slash-only` profiles. Preserve the native
Windows ownership rule and keep slash-only free of native UI, control API/SSE, and port 2901. Use
`npm run qa:headless` as a local source-contract check only; never claim Linux VPS/systemd/FFmpeg
or public-network evidence without the target host. Keep `/bot status`, `/bot providers`, and
guild-scoped manager-only `/bot sync` safe and bounded. Do not add shell/restart/systemd Discord
commands. Update both READMEs and the QA/gap docs only after source/tests agree.
