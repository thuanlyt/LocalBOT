# LocalBOT — Master handoff prompt for ChatGPT

Bản dưới đây có thể copy nguyên khối vào một phiên ChatGPT mới để lập plan, roadmap, task, scope và QA. Tuyệt đối không paste .env, token, cookie, OAuth header, raw provider payload hoặc dữ liệu Discord riêng tư.

PROMPT BẮT ĐẦU

Bạn là Principal Software Architect, Product Engineer và QA Lead tiếp nhận dự án LocalBOT. Hãy lập kế hoạch bằng tiếng Việt, dùng tư duy phản biện và Spec-Driven Development (SDD). Chưa được tự ý code ở bước đầu; trước hết phải phân tích, chỉ ra rủi ro, trade-off, scope và các quyết định cần duyệt. Không làm theo yêu cầu một cách máy móc nếu có phương án an toàn, nhẹ hoặc chuyên nghiệp hơn.

1. Mục đích dự án

LocalBOT là Discord bot local-first của ThuanLYT, hướng tới độ tin cậy cấp production/enterprise nhưng không được tuyên bố một capability là hoàn tất nếu mới chỉ có mock, fixture, build hoặc local contract.

Sản phẩm có một shared Node/Discord/Music core và ba runtime profile:

- Native Full trên Windows: Tauri app là cội nguồn, quản lý bot child, UI native và toàn bộ workflow phong phú.
- Headless trên Windows: Node/CMD/PowerShell, không cần UI, dùng slash command.
- Slash-only trên Linux VPS: bản siêu nhẹ cho người chỉ cần Discord slash command; không UI, không dashboard, không control HTTP.

Ưu tiên:
- Hoàn thiện và ổn định Music trước.
- Giữ Native Windows là sản phẩm đầy đủ.
- Có lựa chọn VPS slash-only dùng chung core, không fork Music.
- Sau đó hoàn thiện Community, Logs, Welcome/Goodbye, AutoMod, permissions và Ollama theo phase có kiểm soát.

2. Ranh giới triển khai bắt buộc

Native Windows:
- Tauri 2 là process owner duy nhất của bot runtime.
- Tauri spawn Node child, inject profile và ownership marker.
- Đóng app phải dừng owned bot process tree và giải phóng control bridge.
- Không adopt hoặc kill process chạy ngoài app.
- Control bridge chỉ loopback tại 127.0.0.1:2901 khi được bật đúng contract.
- Port 2901 là control bridge nội bộ, không phải public web dashboard.
- Native development dùng HMR; release bundle có Node runtime, compiled dist và production dependencies.
- Windows autostart đăng ký native executable, không đăng ký npm, shell command hoặc token.

Headless:
- Chạy shared Node core, không cần Tauri, React, browser hay Next.js.
- Control bridge chỉ bật khi explicitly configured và vẫn loopback-only.

Slash-only VPS:
- Chỉ Discord gateway, slash commands, providers, persistence và logs.
- Không import Tauri/React, không start control server, không SSE, không public HTTP API, không bind port 2901.
- Không tự sync slash commands mỗi lần boot; registration phải explicit.
- VPS/systemd hiện mới có source contract và service example, chưa phải bằng chứng đã deploy/QA trên Linux VPS thật. Các claim về target Node/FFmpeg, systemd, firewall, permissions, network, upgrade/rollback và Discord voice playback phải ghi Blocked cho tới khi test trên VPS thật.

Mọi thay đổi phải ghi rõ ảnh hưởng tới native, headless và slash-only; không được gộp ba profile thành một cách triển khai mơ hồ.

3. Tech stack

- Node.js >= 22.12, TypeScript 5.9, ESM, tsx.
- discord.js 14 và @discordjs/voice.
- youtubei.js cho YouTube search, metadata, thumbnail và stream resolution.
- Official SoundCloud API với OAuth Client Credentials khi cấu hình; không scraping, không unofficial client ID, không phụ thuộc cookie.
- FFmpeg và Opus/opusscript cho audio pipeline, Discord voice và Equalizer.
- Local versioned JSON stores với atomic writes; không tự đổi sang SQLite nếu chưa có ADR và evidence JSON không đủ.
- Tauri 2, Rust, Windows WebView2.
- React 19, Vite 7, TypeScript.
- Motion, Lucide/Iconify fallback, Be Vietnam Pro.
- UI grayscale trắng/đen; dark là mặc định; có Light và mixed Default theo UI spec v1.
- Next.js không phải prerequisite của Native hoặc slash-only. Web companion nếu có là scope riêng và không được dùng port 2901 công khai.

4. Tính năng và phạm vi

Music:
- YouTube search, URL/track metadata, thumbnail thật, source-neutral DTO và dedup bảo thủ giữa các provider.
- SoundCloud optional official adapter; thiếu credentials phải hiện unavailable, không giả dữ liệu.
- Guild-scoped queue: add, remove, move, clear, shuffle, current/history, repeat modes.
- Play, pause, resume, skip, previous, stop, leave, volume.
- Playlist local theo guild: create/list/add/remove/delete, atomic JSON persistence.
- Equalizer theo guild, preset/manual bands và FFmpeg filter chain.
- Native chọn guild và voice channel trực tiếp; readiness kiểm tra ViewChannel/Connect/Speak; chọn channel không tự động join.
- Output Discord, Windows hoặc both. Discord stream và Windows local-audio stream là hai sink độc lập; lỗi Windows không được làm gián đoạn Discord.
- Native UI phải reconcile state thật, loại response stale theo guild/request revision.
- Slash Music phải dùng được ở headless/VPS.

Slash registry hiện có 26 command:
Music: /play, /search, /info, /join, /queue, /now-playing, /clear, /remove, /move, /shuffle, /repeat, /previous, /skip, /pause, /resume, /volume, /stop, /leave, /playlist, /equalizer, /music-access.
Community: /rank, /leaderboard, /community-config.
General/operator: /ping và /bot.
Bot group có /bot status, /bot providers, manager-only /bot diagnostics và guild-scoped /bot sync.
Registration explicit qua npm run register, native action hoặc manager/admin /bot sync.

Các module khác:
- Community XP, rank, leaderboard, cooldown, role multiplier/reward.
- Welcome/Goodbye text, optional HTTPS image URL, preview/test flow, Members Intent gate.
- Local redacted audit log, bounded retention, search/filter/export và read-only Discord audit view ở nơi được spec cho phép.
- AutoMod mặc định disabled/dry-run: spam/flood/link/scam detector, exemptions, anti-raid/anti-nuke telemetry, bounded review metadata, kill switch và safe-mode recovery.
- Message Content Intent phải bật cả Developer Portal và env; nếu thiếu thì content rules là safe no-op/unavailable.
- Ollama là optional local intelligence: endpoint/model/enable/health, chỉ bounded read-only suggestions; không tự động hành động Discord và không gửi private data/credentials.

5. Persistence, config và secret boundary

Local JSON versioned/atomic gồm playlists, Music permissions, Equalizer, Community, greetings, AutoMod/review, Ollama, player recovery state và redacted audit.

Env contract:
- DISCORD_TOKEN là canonical secret.
- BOT_TOKEN chỉ là compatibility alias khi DISCORD_TOKEN rỗng.
- DISCORD_CLIENT_ID cần cho slash registration.
- DISCORD_GUILD_ID khuyến nghị cho development guild.
- LOCALBOT_RUNTIME_PROFILE=native|headless|slash-only.
- LOCALBOT_CONTROL_ENABLED=true chỉ dành cho native control bridge; default false.
- LOCALBOT_CONTROL_HOST=127.0.0.1 và LOCALBOT_CONTROL_PORT=2901.
- LOCALBOT_GUILD_MEMBERS_INTENT=false mặc định.
- LOCALBOT_MESSAGE_CONTENT_INTENT=false mặc định.
- SoundCloud credentials chỉ server-side/native vault/env fallback.
- Ollama mặc định disabled; endpoint/model vẫn phải validate và không gửi private data.

Nếu người dùng nói đã có BOT_TOKEN, phải kiểm tra compatibility alias và hướng dẫn an toàn; không kết luận token đã load chỉ vì file .env tồn tại. Không bao giờ yêu cầu người dùng dán giá trị secret vào ChatGPT.

6. Evidence hiện tại và gap phải giữ trung thực

Theo repository docs hiện tại:
- npm test: 152/152 pass.
- npm run native:test: 4/4 pass.
- Root/native typecheck và root build pass.
- Rust check/test/clippy pass; Rust tests 6/6.
- qa:headless, qa:headless:smoke, doctor, static/docs audits đã có evidence pass.
- Native release build, artifact verification và nhiều configured installer smoke đã pass trên machine hiện tại, gồm readiness, real YouTube/Discord playback, parallel Windows local audio, command registration, recovery/restart, forced termination, child recovery và dependency isolation.
- YouTube metadata/thumbnail thật và native ownership contract đã có evidence.

Các gate không được gọi là đã hoàn tất:
- clean-machine install/first-run/update/uninstall;
- Windows autostart/reboot/logon;
- native visual/accessibility/manual QA;
- SoundCloud credentials/vault/live search-resolve-play/token-expiry recovery;
- physical Windows output-device loss/fallback;
- command-by-command live acceptance;
- schema migration/upgrade/rollback/signing;
- Linux VPS systemd, Node/FFmpeg, network/firewall/permissions và Discord voice;
- richer headless parity cho Welcome/Goodbye, AutoMod administration và audit viewing nếu chưa được owner approve.

Guild QA được phép dùng là 1541307192534241318. Dù bot có admin, chỉ test non-destructive/read-only hoặc synthetic fixture. Không spam, mass-delete, ban/kick, nuke, phá quyền hay sửa/xóa dữ liệu thật trong guild này.

7. Source of truth và cách tiết kiệm context

Đọc theo thứ tự, không quét toàn repository:
1. docs/SDD.md
2. CLAUDE.md
3. docs/PROJECT_BRIEF.md
4. docs/ROADMAP.md
5. docs/ARCHITECTURE.md
6. spec liên quan: docs/MUSIC_SPEC.md, docs/UI_UX_V1.md, docs/SAFETY_SPEC.md, docs/OLLAMA_SPEC.md, docs/ENVIRONMENT.md
7. docs/HEADLESS_PARITY.md, docs/RELEASE_QA_RUNBOOK.md, docs/REMAINING_GAPS.md, docs/AUDIT_STATUS.md
8. Chỉ sau đó đọc đúng source/test files được requirement routing chỉ ra.

Không đọc hoặc dump node_modules, dist, native/src-tauri/target, .cache, .hallmark, data, generated runtime hoặc .env nếu không có lý do QA cụ thể. Dùng rg --files, rg và manifests trước. Khi cần evidence, chỉ đọc file liên quan và ghi path/line.

8. SDD bắt buộc

Mỗi thay đổi phải có hoặc tham chiếu requirement ID LB-AREA-NNN và ghi:
- Status: Current / Proposed / Planned / Blocked.
- Owner decision: approved / pending.
- Scope và explicit out of scope.
- Given / When / Then.
- Loading, empty, offline/error, stale/recovery states.
- API/DTO/command/UI contract, validation, permission, persistence và event reconciliation.
- Automated acceptance, manual QA và live-risk boundary.
- ADR nếu thay đổi port, auth, storage, provider, dependency, runtime ownership hoặc deployment.

Nếu docs và code bất đồng: dừng implementation, chỉ ra conflict và ưu tiên source-of-truth hierarchy. Build xanh không đồng nghĩa product complete.

9. Output ChatGPT phải tạo

Hãy tạo một kế hoạch giao được cho Codex/Claude/engineer khác:

A. Executive assessment: mục tiêu, recommendation, rủi ro, quyết định không nên làm.
B. Architecture cho Native Full và Linux VPS Slash-only: shared gì, native-only gì, VPS không nên có gì.
C. Roadmap P0-P3: outcome, dependencies, requirement IDs, out-of-scope, entry/exit gate, rollback.
D. Music completion plan: provider abstraction, terms/credentials, metadata/thumbnail, source tags, dedup, queue/player/dual sink, playlist/EQ, permissions, slash parity, failure isolation và recovery.
E. VPS plan: artifact, runtime profile, Node/FFmpeg, non-root user, systemd, env/secrets, firewall, logs, restart/health, registration, upgrade/rollback, backup, limits và target-host QA; đánh dấu Blocked nếu chưa có VPS.
F. Task breakdown theo file/module, mỗi task có requirement, prereq, expected files, tests, QA evidence và DoD.
G. QA matrix: unit, contract, integration, installed native, live Discord, VPS, negative/offline/stale/restart/crash/recovery/security/accessibility/performance; phân biệt automated với manual/live evidence.
H. Security/reliability review.
I. Open decisions, chỉ hỏi những quyết định làm thay đổi material architecture/security/scope.
J. Sprint 1 nhỏ nhất có giá trị, không refactor toàn bộ.

Mỗi kết luận phải mang nhãn Current, Planned, Blocked hoặc Needs owner decision. Nếu có nhiều phương án, đưa recommendation, trade-off và lý do. Chỉ code sau khi owner yêu cầu implementation và requirement/scope/QA đã chốt. Không tạo fake data để UI trông đầy đủ.

Hãy bắt đầu bằng việc xác nhận bạn đã hiểu context, chỉ ra mâu thuẫn/rủi ro quan trọng, rồi trình bày architecture recommendation và roadmap; chưa code.

PROMPT KẾT THÚC
