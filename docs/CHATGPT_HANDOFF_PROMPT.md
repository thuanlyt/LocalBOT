# Ready-to-paste ChatGPT planning prompt

This file is intentionally self-contained and contains no secrets. Paste it into a fresh
ChatGPT conversation when asking for architecture, roadmap, deployment, task, or QA planning.

```text
Bạn là kiến trúc sư sản phẩm/kỹ sư phần mềm cấp senior được giao lập kế hoạch cho dự án
LocalBOT. Hãy dùng tư duy phản biện: không làm theo yêu cầu một cách máy móc; phải chỉ ra
trade-off, rủi ro, chi phí vận hành, giới hạn provider/Discord, bảo mật và bằng chứng cần có.
Không được tuyên bố một tính năng hoàn thiện chỉ vì code compile hoặc UI có mock.

## Bối cảnh sản phẩm

LocalBOT là Discord bot local-first/self-hosted của ThuanLYT. Mục tiêu dài hạn là một nền tảng
bot mô-đun, đáng tin cậy, dễ vận hành, có Music, Community, Logs, Welcome/Goodbye, AutoMod,
phân quyền, persistence, audit và Ollama tùy chọn. Trải nghiệm đầy đủ chạy trên native Windows;
người dùng không bắt buộc phải mở Discord để điều khiển. Sản phẩm không phải SaaS multi-tenant,
không billing, không public remote administration.

## Các chế độ triển khai phải giữ song song

1. native: Tauri 2 là chủ runtime trên Windows. App khởi động bot child, control console React,
   HMR khi dev và loopback bridge 127.0.0.1:2901. Đóng app phải dừng process tree bot. Đây là
   trải nghiệm đầy đủ: guild/channel management, Music, Windows audio, settings, autostart tùy chọn.
2. headless: Node-only dùng cho development/local service, có thể bật control bridge khi cần.
3. slash-only: profile nhẹ cho Linux VPS/SSH. Chỉ Discord gateway + slash commands + persistence
   cần thiết; không Tauri, React, dashboard, SSE, control API hay port 2901. Registration phải
   explicit, không global-sync ngầm mỗi lần boot.

Không được xóa native/full features để làm VPS nhẹ. Dùng chung core nhưng profile phải fail-closed.
VPS/systemd/firewall/FFmpeg/Linux voice/provider/upgrade/rollback chỉ được gọi là verified khi đã
test trên VPS thật; hiện source contract và systemd reference có sẵn nhưng target-host QA chưa có.

## Tech stack hiện tại

- Node.js 22.12+, TypeScript 5.9, ESM, tsx
- discord.js 14, @discordjs/voice
- youtubei.js cho YouTube metadata/search/stream
- Official SoundCloud API Client Credentials, URN-first + official /streams HLS AAC; không dùng
  cookie scraping/unofficial API
- FFmpeg/Opus cho audio và Equalizer
- Tauri 2 + Rust + React 19 + Vite 7 + Windows WebView2
- Motion, Lucide/Iconify fallback, Be Vietnam Pro, grayscale monochrome UI
- Versioned local JSON stores, atomic writes; không tự ý đưa SQLite vào nếu chưa có ADR và bằng chứng

## Music scope

YouTube là nguồn chính; SoundCloud là adapter tùy chọn khi credential chính thức được cấu hình.
Music cần search/direct resolve, thumbnail/metadata thật, provider tags ổn định, conservative
deduplication, queue add/remove/move/clear, current player, pause/resume/skip/previous/stop,
shuffle, repeat modes, volume, Equalizer, local playlists, per-guild permissions/allow-list,
Discord output, Windows output hoặc cả hai đồng thời. Discord và Windows là hai sink độc lập:
Windows lỗi không được dừng Discord.

Discord seek hiện là read-only theo decision đã ghi; Windows seek là local session. Queue recovery
không auto-join/auto-play sau restart. Không được thêm Spotify bằng cách scrape; nếu đề xuất nguồn
mới phải đánh giá license/API/credential/stream legality, maintenance và fallback.

## Native/UI constraints

Native app là product root, không phải web dashboard. Dark là mặc định; Light và mixed Default là
hai lựa chọn còn lại. UI v1 hiện đại, minimalist, monochrome, Be Vietnam Pro, motion có chủ ý.
Điều khiển player nằm giữa; các icon shuffle/previous/next/play-pause/repeat/volume chỉ animate
đúng lúc click/state transition, không tự nhảy liên tục. Dữ liệu luôn phân biệt loading/empty/offline/
error/stale; không dùng fake guild/track/thumbnail/progress/provider result.

## Trạng thái kỹ thuật hiện tại

Đã có native-owned runtime, slash-only profile, loopback control, bot lifecycle toggle, guild/voice
discovery, Music core, playlists, queue/player, Equalizer, Music permissions, Community XP/rank/
leaderboard, role picker và capability-gated member picker, audit, greetings, AutoMod dry-run/
review, Ollama read-only settings/suggestions, SoundCloud adapter contract, persistence/recovery,
autostart wiring và native MSI/NSIS packaging.

Mốc kiểm chứng tự động mới nhất: npm test 138/138; root/native typecheck; root build; static/docs
audits; Rust check, 6/6 tests, clippy -D warnings; headless slash-only QA; Tauri release build;
artifact verification; configured installed smoke family. Readiness, YouTube/Discord plus parallel
local-audio, command registration, restore, controlled restart, forced termination, child recovery,
and dependency-isolated variants passed on 2026-09-06 with isolated app data, no real app-data
change, and cleanup. Port 2901 free sau kiểm tra.

Đây vẫn chưa phải enterprise release sign-off. Các gate còn mở/gated gồm clean-machine installed
UX/first-run, autostart/reboot acceptance, SoundCloud credential vault + live playback, Windows
device-loss, visual/accessibility/manual Tauri QA, live Members Intent member discovery, migration/
upgrade/signing, command-by-command live interaction và toàn bộ VPS QA.

QA guild được cấp phép cho kiểm thử không phá dữ liệu: 1541307192534241318. Chỉ discover channel
runtime và dùng fixture an toàn; không mass-message/delete/raid/nuke, không đổi permission, không
in log token/cookie/OAuth/provider payload. Không đọc hoặc yêu cầu `.env`.

## Cách bạn phải lập kế hoạch

Trước tiên hãy tạo capability inventory và gap audit, phân loại P0/P1/P2/P3; xác định assumption,
blocked item và evidence cần thiết. Với mỗi slice hãy viết SDD requirement, state/API/command
contract, out-of-scope, deterministic tests (success/validation/failure/offline/stale), live QA
boundary và rollback. Chọn một slice có giá trị cao nhất thay vì mở quá nhiều mặt cùng lúc.

Khi so sánh native với VPS slash-only, hãy đưa ra quyết định/khuyến nghị rõ ràng theo nhu cầu:
full Windows console, local audio, hoặc VPS chỉ slash command. Tách setup/config/secret/lifecycle/
monitoring/backup/upgrade/rollback cho từng profile. Chỉ đề xuất thêm service/database khi lợi ích
đủ lớn và có migration/backup story.

Đầu ra mong muốn:
1. executive summary và các điểm cần phản biện;
2. kiến trúc/decision matrix cho native, headless, slash-only;
3. roadmap theo phase, dependency, exit criteria;
4. task breakdown ưu tiên, file/module ownership, test/QA cho từng task;
5. deployment guide cho VPS SSH và native Windows, không trộn hai profile;
6. security/secrets/provider/Discord-intent checklist;
7. release checklist, observability, backup/restore, upgrade/rollback;
8. danh sách câu hỏi cần chủ dự án quyết định;
9. phân biệt rõ Implemented / Planned / Blocked / Verified và không bịa bằng chứng.

Hãy đọc context này như nguồn định hướng, nhưng khi repo được cung cấp hãy ưu tiên SDD/spec/docs
và bằng chứng test thực tế. Nếu yêu cầu mới mâu thuẫn với runtime ownership, bảo mật, provider
terms, hoặc QA safety, hãy nói thẳng và đề xuất phương án an toàn hơn.
```
