# Next Claude Code Handoff — LocalBot

Use this as a historical first handoff only. The current implementation already includes the approved native Music and Community first slice; future Claude work must start from the current roadmap and verify before changing existing behavior.

```text
Bạn tiếp nhận dự án LocalBot trong thư mục hiện tại.

## Current product state

LocalBot là Discord bot local-first cho Windows. Music Discord core đã hoàn thành:

- Provider-neutral `MediaTrack` với YouTube mặc định và SoundCloud official API tùy chọn.
- Search, URL/YouTube ID resolve, source tags, all-source deduplication.
- Discord playback qua `@discordjs/voice` + FFmpeg; queue, remove, move, shuffle, repeat off/all/one, previous, skip, pause, resume, stop, volume.
- Playlist local theo guild bằng versioned JSON và atomic write.
- Music permission allow-list/all theo guild.
- Equalizer bass/mid/treble áp dụng ở FFmpeg boundary.
- Community XP/rank/leaderboard theo guild, cooldown chống spam và lưu local.
- Opt-in loopback control API trên `127.0.0.1:2901` cho health, providers, audit log, guilds, search/resolve, play vào Discord voice, player action, queue, voice control, playlists, EQ, Music permissions và SSE player events.
- Native Tauri dev shell tự khởi động và sở hữu child `npm run dev` từ workspace bằng ownership marker; health `2901` chỉ được chấp nhận khi marker khớp. Không nhận hoặc dừng tiến trình bot chạy ngoài native; đóng native sẽ dừng cả cây bot/control server. Release build đã bundle Node runtime + production dependencies; clean-machine/install acceptance vẫn còn phải kiểm tra.

Đọc `docs/MUSIC_SPEC.md` trước khi đụng Music code. Không đổi DTO, queue semantics, provider boundary, port hoặc env contract nếu chưa có lý do và ADR.

## Read only what is relevant

1. `CLAUDE.md`
2. `docs/README.md`
3. `docs/ROADMAP.md` — Phase 1, 2, 3
4. `docs/ARCHITECTURE.md`
5. `docs/MUSIC_SPEC.md`
6. `docs/ENVIRONMENT.md`
7. `docs/UI_UX_V1.md`, `docs/DASHBOARD_SPEC.md`, `docs/DESIGN_SYSTEM.md` cho UI
8. `.claude/skills/localbot-project/SKILL.md` cho workflow

Không đọc hoặc in `.env`; không scan `node_modules/`, `dist/`, `.cache/` nếu không chẩn đoán dependency/build. Dùng `rg` và đọc file/symbol liên quan. Không commit secret.

## Current implementation boundary

Native shell Tauri 2 + React/Vite/TypeScript và native Music đã có trong `native/`, dùng UI/UX v1 đã duyệt. Không re-scaffold hoặc redesign shell nếu không có regression cụ thể. Native window không cần port; bridge gọi loopback `127.0.0.1:2901`. Chạy `npm run native:dev` để dùng Vite HMR; chỉ `npm run native:build` khi cần artifact production.

Khi tiếp tục, implement theo thứ tự nhỏ:

1. Giữ nguyên Tauri shell có native title bar, theme Dark mặc định, ba theme độc lập Default split-tone / Dark / Light, floating navigation, reduced-motion và toggle bot runtime dev đã có.
2. Giữ live SSE player events với polling fallback; không đưa token/provider credential vào client.
3. Chỉ sửa Music khi có regression: queue, source tags, thumbnail, local Windows session queue, playback controls, repeat/shuffle, volume và EQ. Discord progress là read-only theo `LB-MUSIC-014`; chỉ triển khai Discord seek nếu có SDD/ADR mới cho kiến trúc seekable/cache-aware.
4. Hoàn thiện device picker; SoundCloud credential UI đã được tách thành `LB-MUSIC-012` với Windows Credential Manager, còn persistent local-player service vẫn cần requirement riêng.
5. Bổ sung API/contract tests cho route mới trước khi dùng trong UI.

Native Settings cho SoundCloud hiện hiển thị trạng thái, enable/disable, redacted test connection và native vault save/clear theo `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`. Credential không trả về control API/UI/backup/log; `.env` chỉ là fallback server-side. SoundCloud chỉ dùng official API, không scraper/client ID thu thập từ trình duyệt.

## Constraints

- Giữ strict black/white/neutral grayscale, Be Vietnam Pro, modern minimalist, motion có mục đích.
- Playback controls Shuffle, Previous/Next, Play/Pause, Repeat, Volume chỉ animate khi click/state transition; không hover animation trang trí.
- Giữ source/provider trong DTO và queue snapshot để UI hiển thị nguồn đã thêm.
- Community XP/Rank, audit log, Welcome/Goodbye, AutoMod dry-run, anti-raid/anti-nuke telemetry và Ollama configuration/health đã có; destructive AutoMod enforcement, AI actions và live/installed acceptance vẫn chưa hoàn tất.
- Trước mỗi thay đổi: nêu phase, file dự kiến, acceptance criteria và phần không làm.
- Sau mỗi thay đổi: cập nhật docs/ADR nếu behavior, route, env, dependency hoặc boundary đổi; chạy `npm run typecheck`, `npm test`, `npm run build` khi phù hợp.

Bắt đầu bằng audit ngắn của native shell và control API hiện có; chỉ báo blocker cụ thể nếu phát sinh. Không tự thay kiến trúc Tauri bằng web dashboard.
```
