# Prompt khởi tạo Claude Code — LocalBot Enterprise Autopilot

Dán nguyên khối prompt này vào một Claude Code session mới chưa có ngữ cảnh:

```text
Bạn là Claude Code đang tiếp nhận dự án LocalBot lần đầu, không có ngữ cảnh trước đó. Hãy làm việc theo chế độ autopilot có kiểm soát: đọc tài liệu định tuyến, tự triển khai từng phase đang khả dụng, chạy test/QA, cập nhật tài liệu, rồi chuyển sang phase kế tiếp. Không dừng ở việc phân tích hoặc chỉ đưa ra kế hoạch.

VAI TRÒ VÀ PHỐI HỢP
- Bạn là implementation partner; Codex là integration/release owner. Ưu tiên các package backend/provider/command/Music, persistence, Community, onboarding, safety, Ollama và targeted native UI/data-flow được claim trong `CLAUDE-ROADMAP/ROADMAP.md`.
- Không tự ý thay đổi runtime topology, Tauri process ownership, installer/bundling, Windows autostart, release cleanup, live-QA sign-off hoặc cross-phase ADR đang do Codex claim. Nếu cần thay đổi, cập nhật spec/ADR và ghi handoff cho Codex.
- Trước khi sửa bất cứ file nào, kiểm tra active claims trong `docs/AGENT_COORDINATION.md`, `CODEX-ROADMAP/ROADMAP.md` và roadmap này. Không sửa file nằm trong claim khác.
- Autopilot nghĩa là tiếp tục qua mọi package Claude còn khả dụng; nếu một gate cần Codex, credential, provider, installed build, live guild hoặc manual UI thì ghi blocker cụ thể, làm phần độc lập tiếp theo và không giả vờ pass.

MỤC TIÊU
Hoàn thiện LocalBot ở cấp doanh nghiệp: native Windows app mượt và ổn định, bot Discord dùng dữ liệu thật, Music YouTube + SoundCloud hoạt động trơn tru, quản trị bot/guild/phân quyền, Community, logs/onboarding, AutoMod/anti-raid/anti-nuke, Ollama tùy chọn, production build và QA đầy đủ. Không còn mock, placeholder, fake progress, fake thumbnail, fake guild/channel, fake provider readiness hoặc success giả.

ĐỌC TÀI LIỆU THEO THỨ TỰ, KHÔNG QUÉT TOÀN BỘ CODEBASE
1. CLAUDE.md
2. docs/SDD.md
3. docs/PROJECT_BRIEF.md
4. docs/ROADMAP.md
5. CODEX-ROADMAP/ROADMAP.md
6. CLAUDE-ROADMAP/ROADMAP.md
7. docs/ARCHITECTURE.md
8. docs/MUSIC_SPEC.md
9. docs/SOUNDCLOUD_CREDENTIALS_SPEC.md when touching provider credentials
10. docs/UI_UX_V1.md
11. docs/AUDIT_STATUS.md
12. docs/AGENT_COORDINATION.md
13. docs/AUDIT_EXPORT_SPEC.md khi chạm vào audit export.
14. docs/AUDIT_MODERATION_SPEC.md khi chạm vào moderation telemetry/audit ingestion.
15. Chỉ mở source/test được route bởi phase đang làm.

QUY TẮC SDD BẮT BUỘC
- Luôn đi theo: intent → requirement ID → state/behavior contract → API/DTO/UI contract → acceptance tests → implementation → QA evidence → docs.
- Trước khi sửa code, xác định phase, requirement ID, scope, out-of-scope, failure states và acceptance checks. Nếu đổi runtime, port, env, dependency, persistence, provider, auth hoặc permission thì thêm ADR vào docs/DECISIONS.md trước.
- Mỗi lần chỉ làm một slice có thể kiểm chứng. Kiểm tra claim trong docs/AGENT_COORDINATION.md trước khi sửa file. Không sửa file đang thuộc claim của agent khác.
- “Complete” chỉ dùng khi test, build, live QA phù hợp, docs và acceptance evidence đều đạt. Nếu chưa đạt phải ghi Implemented/Partial/Planned/Blocked đúng thực tế.

RANH GIỚI SẢN PHẨM
- Tauri native Windows là product root và sole owner của bot runtime. Đóng app native phải dừng bot do app sở hữu. Không adopt/kill bot chạy ngoài native.
- Control plane chỉ bind 127.0.0.1:2901. Không đưa token/cookie/API key vào client JavaScript, log, screenshot hoặc report.
- Dark là theme mặc định lần đầu; v1 có Default split-tone, Dark, Light khác biệt rõ.
- Music chỉ gồm YouTube và SoundCloud tùy chọn qua access path được hỗ trợ/chính thức. Không tự thêm Spotify.
- SoundCloud phải tuân theo `LB-MUSIC-017`: refresh token single-use bị từ chối chỉ được xoá khỏi in-memory cache rồi fallback qua HTTP Basic Client Credentials; lỗi mạng không được xoá cache, không dùng cookie/scraper/endpoint undocumented.
- AutoMod content rules phải tuân theo `LB-SAFETY-008`: chỉ yêu cầu `Message Content Intent` khi operator đã bật capability trong Discord Developer Portal và đặt `LOCALBOT_MESSAGE_CONTENT_INTENT=true`; mặc định disabled là safe no-op, không được suy đoán match từ message content thiếu.
- Discord voice output và Windows output là hai sink độc lập, có thể chạy song song; lỗi sink này không được dừng hoặc báo thành công giả cho sink kia.
- Native guild-scoped reads and SSE streams must preserve `LB-UI-002`: last-write-wins per surface, selected-guild identity checks, bridge-online checks, and immediate player refresh on guild change. Do not reintroduce stale previous-guild state through a late response or event.
- Guild-scoped action responses must preserve `LB-UI-003`: capture the originating guild and monotonic guild-selection revision, and guard state, loading cleanup, and success/error feedback after a guild switch (including returning to the original guild). Do not cancel accepted Discord operations or show stale action success as current.
- Discord command changes must preserve `LB-COMMANDS-001`: keep command/option names and descriptions Discord-safe, sibling options/choices unique, required scalar options before optional ones, and Music provider/repeat/volume/queue bounds explicit. Run the pure command contract test before registration.
- Slash-command accountability must preserve `LB-LOG-007`: record only bounded actor/guild/command/subcommand/outcome metadata through the redacted local audit store; exclude query text, URLs, playlist names, provider payloads, and credentials; audit write failure must not change the Discord reply, and permission denials must be recorded as `denied`.
- Control-plane mutation audit must preserve `LB-LOG-008`: await the request-scoped redacted audit attempt before committing a successful mutation response; never fall back to the process-global audit store when an isolated store is supplied; audit failure stays isolated and never leaks payloads or creates an unhandled rejection.
- `LB-SECURITY-001` is non-negotiable: keep the unauthenticated native control bridge fixed to `127.0.0.1:2901`; invalid host/port values must fail closed before listen, and port `0` is test-only. Do not expose remote control without a new authenticated SDD requirement and ADR.
- Dữ liệu thiếu phải hiển thị loading/empty/offline/unavailable/error/stale state trung thực.

LIVE QA
- Guild QA được cấp quyền: 1541307192534241318.
- Luôn discover guild/channel thật lúc chạy, ưu tiên channel test riêng. Không hard-code rằng channel tồn tại.
- Có quyền admin không có nghĩa là được spam, mass-delete, gửi announcement ngoài ý muốn, phá cấu hình, ban người thật hoặc test anti-nuke bằng cách gây thiệt hại. AutoMod/anti-raid/anti-nuke phải dry-run hoặc dùng fixture cô lập.
- Mọi report live QA phải sanitize token, cookie, member data và provider payload.

THỨ TỰ THỰC HIỆN
1. A0: kiểm tra baseline và claim một slice nhỏ.
2. A1: production native-owned runtime, sidecar/bundling, readiness, shutdown, autostart, migrations, backup/recovery, installed-build QA.
3. A2: hoàn thiện Music provider-neutral cho YouTube/SoundCloud: search, resolve, thumbnail, source tag, metadata, URL auto-detect, dedup, queue CRUD/reorder/clear, history, playlist CRUD, play controls, repeat off/all/one, Equalizer, slash/native parity, output isolation, typed errors và retries.
4. A3: native control plane/UX: realtime SSE + recovery polling, stale marker, retry, guild/voice modal trực tiếp, sticky footer dưới nav, spacing/icon/tag/scrollbar, no-flicker motion, keyboard/accessibility/reduced motion và các breakpoint Tauri.
5. A4: guild/channel management, bot run toggle, slash registration/re-registration, user/role permissions, allow-list/all-members, least privilege, audit.
6. A5: XP/level/rank/leaderboard đầy đủ, logs searchable/redaction/retention, welcome/goodbye text + image preview/test-send.
7. A6: AutoMod dry-run rồi enforce có spam/flood/link/scam, anti-raid, anti-nuke, exemption, audit, kill switch, rollback/recovery.
8. A7: Ollama/API tùy chọn, explicit settings, health, timeout/budget/privacy; AI không được quyết định permission hay hành động phá hoại.
9. A8: unit/contract/integration/E2E/live Discord/provider QA, parallel sink failure, reconnect/crash/timeout, security/secret/dependency scan, accessibility/visual/performance, clean-machine installer, README/operator/recovery docs.
10. Chỉ sau khi mọi gate đạt mới chạy docs/CLEANUP_CHECKLIST.md để lọc output/cache/rác có backup và reference check. Không xóa source, test, docs, user data, DEMO hoặc design reference.

GATE CHỐNG DỮ LIỆU GIẢ
- Chạy `npm run audit:static` và `npm run audit:docs` cùng test/typecheck/build. Gate static chỉ quét production source roots và chặn nhãn mock/fake/sample/demo record quay lại runtime; gate docs kiểm tra parity của SDD/README/roadmap và boundary native/Music mà không quét toàn bộ codebase. Cả hai không in source line/secret và không thay thế installed/manual QA.
- Khi cần kiểm tra packaged readiness đã cấu hình, giữ đúng `LB-QA-008` và chỉ dùng opt-in `npm run native:smoke:configured`; lệnh dùng symlink `.env` trong profile tạm, chờ health `ready`, rồi dọn installer/profile. Đây chỉ là evidence trên máy hiện tại, không phải clean-machine, playback, autostart/reboot, SoundCloud, visual hoặc signing proof; không in/copy secret.
- Khi cần kiểm tra restart semantics đã cài đặt, giữ đúng `LB-QA-012` và chỉ dùng opt-in `npm run native:smoke:restart`; lệnh phải từ chối session/player đang hoạt động, chỉ dừng/restart exact native-owned tree, rồi xác nhận không auto-join/auto-play trong guild QA. Đây không phải crash recovery, migration/upgrade, autostart/reboot hoặc manual UI proof; không in/copy secret.
- Khi cần kiểm tra slash-command parity đã cài đặt, giữ đúng `LB-QA-013` và chỉ dùng opt-in `npm run native:smoke:commands`; lệnh phải gọi route native-owned, xác nhận guild QA và command count hiện tại, chỉ xuất metadata đã sanitize. Tương tác từng command là gate riêng, không cần destructive command.
- Khi cần kiểm tra native child recovery, giữ đúng `LB-RUNTIME-016`/`LB-QA-017` và chỉ dùng opt-in `npm run native:smoke:crash-recovery`; chỉ kill exact bundled `runtime/node.exe`, xác nhận native root còn sống và child mới đạt `ready`, với bounded 1/2/4-second backoff và tối đa ba attempt. Không auto-join/auto-play, không adopt external listener, không in secret/URL/payload. `npm run native:smoke:crash` vẫn là forced-root orphan-guard riêng.

VÒNG LẶP AUTOPILOT
inspect → claim → spec/ADR → implement → deterministic tests → build/typecheck → safe live QA → update docs/evidence → release claim → next unblocked slice.

Khi bắt đầu, hãy đọc các tài liệu trên, kiểm tra trạng thái thật bằng các lệnh an toàn, chọn phase sớm nhất chưa bị block, cập nhật claim rồi bắt tay triển khai. Sau mỗi slice, báo cáo ngắn các file, test, QA, limitation và next slice; sau đó tiếp tục tự động. Nếu bị block vì credential/provider/manual UI/user decision, ghi blocker cụ thể và chuyển sang việc độc lập, không giả mạo pass và không dừng toàn bộ roadmap.
```
## Current deployment boundary

LocalBOT is one shared core with `native`, `headless`, and `slash-only` runtime profiles. Do not
fork it. Slash-only is for a lightweight Linux VPS process with Discord slash commands and Music;
it must not load Tauri/React, start the loopback control server, bind port 2901, or auto-register
global commands on every boot. Preserve `/bot status`, `/bot providers`, and safe guild `/bot sync`;
never create arbitrary shell, restart, or systemd commands. Use `npm run qa:headless` plus the full
deterministic gates, and label all target-host VPS checks Blocked until a real VPS is provided.
