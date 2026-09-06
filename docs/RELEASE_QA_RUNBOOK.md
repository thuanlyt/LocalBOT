# LocalBot — Enterprise Release QA Runbook

Status: Current release gate · Updated: 2026-09-04

Tài liệu này là checklist ngắn để Codex/Claude chạy QA theo SDD mà không phải quét lại toàn bộ codebase. Không được gọi LocalBot là release-ready khi còn một gate bắt buộc ở trạng thái `Planned`, `Blocked` hoặc chưa có evidence.

## 1. Bất biến trước khi test

- Native Tauri Windows là cội nguồn và owner duy nhất của bot runtime. Đóng native phải dừng đúng child process do native tạo.
- Không adopt hoặc terminate bot được khởi động từ terminal/tác vụ ngoài. Nếu `127.0.0.1:2901` đã bị process khác chiếm, ghi nhận conflict và không đụng vào process đó.
- `LB-SECURITY-001`: runtime control bridge phải bind đúng `127.0.0.1:2901`; host/port sai phải fail-closed trước khi listen. `port 0` chỉ xuất hiện trong in-process tests.
- Discord sink và Windows sink là hai session độc lập; lỗi một sink không được dừng hoặc báo thành công giả cho sink còn lại.
- Chỉ dùng dữ liệu Discord/provider thật hoặc trạng thái `loading`/`empty`/`offline`/`unavailable`/`error`. Không thêm fixture vào production runtime.
- Guild live QA được chủ sở hữu cho phép là `1541307192534241318`. Chỉ dùng thao tác an toàn, không mass-message, mass-delete, raid, nuke, timeout thật hoặc bật AutoMod enforce trên guild này.
- Không in `.env`, token, cookie, OAuth/API secret, raw provider payload, member private data hoặc audio URL vào terminal, log, screenshot hay tài liệu.

## 2. SDD loop cho mỗi thay đổi

1. Đọc `docs/SDD.md`, roadmap và spec đúng module.
2. Chọn hoặc tạo requirement ID `LB-*`; ghi rõ scope, out-of-scope, failure states, contract và acceptance.
3. Claim file/area trong `docs/AGENT_COORDINATION.md` trước khi sửa.
4. Viết test deterministic trước hoặc cùng slice implementation.
5. Chạy targeted test → full test/typecheck → build → QA phù hợp.
6. Cập nhật spec/ADR/roadmap/audit evidence trong cùng thay đổi.
7. Chỉ chuyển `Planned` thành `Current` khi evidence đủ; nếu thiếu manual/installed evidence thì giữ nguyên gap.

## 3. Gate tự động từ workspace

Chạy tại `F:\dev\LocalBot`:

```powershell
npm install
npm test
npm run audit:static
npm run audit:docs
npm run typecheck
npm run build
npm run native:typecheck
npm run native:test
cargo check --manifest-path native/src-tauri/Cargo.toml
cargo test --manifest-path native/src-tauri/Cargo.toml
npm audit --omit=dev --audit-level=high
npm --prefix native audit --omit=dev --audit-level=high
npm run native:build
npm run native:verify
npm run native:smoke
```

`native:smoke` chỉ chứng minh installer có thể cài/chạy/gỡ trong profile cô lập và không làm đổi app-data thật. Cleanup của profile tạm có retry hữu hạn để hấp thụ race file-lock của WebView2 rồi mới fail; nó không nuốt lỗi hoặc xóa ngoài thư mục temp đã tạo. Smoke không thay cho bot-ready, provider credentials, reboot/autostart, playback, accessibility hoặc clean-machine acceptance.

### Configured installed readiness (opt-in)

```powershell
npm run native:smoke:configured
```

Lệnh này dùng khi workspace đã có `.env` hợp lệ. Nó cài NSIS vào thư mục tạm, tạo symlink `.env` vào app-local Tauri profile tạm, chờ control health `ready`, rồi dừng đúng native process tree, gỡ cài đặt và xoá profile tạm. Secret không được copy thành file thứ hai, in ra output hoặc đưa vào log. Đây là bằng chứng packaged runtime đã sẵn sàng trên máy hiện tại; không thay thế clean-machine, playback, SoundCloud/vault, Windows sink, autostart/reboot, restore/upgrade, accessibility hay signing acceptance.

### Dependency-isolated packaged runtime (opt-in)

```powershell
npm run native:smoke:isolated
npm run native:smoke:music:isolated
```

Hai lệnh này chạy configured installer smoke với `PATH` của native child chỉ còn
`C:\\Windows\\System32;C:\\Windows` và loại các biến dò Node/npm. Bản cài phải tự dùng
`runtime/node.exe` đã bundle; Node của host chỉ điều phối harness. Lệnh Music vẫn kiểm tra
YouTube/Discord playback và local-audio pipeline độc lập. Đây là evidence dependency isolation
trên máy hiện tại, không thay thế máy sạch vật lý, reboot/autostart, SoundCloud/vault,
visual/accessibility hoặc signing.

### Configured installed YouTube playback (opt-in)

`npm run native:smoke:music` dùng cùng profile cô lập của configured smoke, discover voice
channel thật trong guild QA, kiểm tra thumbnail HTTPS, play/pause/resume/stop/leave qua Control API,
rồi dọn session trước khi gỡ installer. Lệnh phải tự từ chối nếu đã có voice session hoạt động và
không được in track title, URL, provider payload, member data hoặc credential. Lần chạy 2026-09-04
đã pass và được ghi nhận là `LB-QA-009`; nó không thay cho SoundCloud, Windows sink, autostart/reboot,
clean-machine, restore, accessibility hoặc signing. Evidence gần nhất (2026-09-04) đã pass
play/pause/resume/stop/leave và cleanup; xem `LB-QA-009` trong `docs/AUDIT_STATUS.md`.

`npm run native:smoke:soundcloud` là acceptance opt-in riêng cho SoundCloud official khi profile
đã có credential qua vault hoặc env fallback. Nó chỉ tìm source `soundcloud`, yêu cầu thumbnail
HTTPS/identity thật, play/pause/resume/stop/leave qua Discord rồi dọn session. Thiếu credential,
provider disabled, auth failure hoặc không có kết quả phải fail với lỗi unavailable/configuration;
không được fallback sang YouTube hay in token/URL/payload. Chưa chạy nếu profile chưa được người
dùng cấp credential official.

`LB-QA-010` bổ sung một bước cài đặt: trong lúc Discord player đang `playing`, mở
`local-audio`, yêu cầu `audio/mpeg`, đọc một chunk rồi huỷ riêng request và kiểm tra Discord vẫn
`playing`. Đây chỉ là pipeline-isolation evidence; không thay thế kiểm tra Tauri WebView, thiết bị
Windows, device loss/fallback hoặc nghe được hai output thực tế. Lần chạy 2026-09-04 đã pass và
được ghi nhận trong `docs/AUDIT_STATUS.md`.

`LB-QA-011` dùng `npm run native:smoke:recovery` để export rồi restore backup credential-free
trong profile installed tạm, yêu cầu `confirm:true`, xác nhận đủ stores và `restartRequired:true`.
Không in nội dung backup/secret; đây không thay thế file-picker UX, crash recovery, migration hay
upgrade compatibility. Lần chạy 2026-09-04 đã pass và được ghi nhận trong `docs/AUDIT_STATUS.md`.

`LB-QA-012` dùng `npm run native:smoke:restart` để dừng rồi khởi động lại đúng native-owned process
tree trong cùng profile installed đã cấu hình. Trước và sau restart, test từ chối voice session/player
đang hoạt động và xác nhận guild QA không tự join voice, không tự tạo player hoặc tự phát lại. Đây là
controlled restart evidence trên máy hiện tại; không thay thế crash recovery, migration/upgrade,
autostart/reboot hoặc manual native UI acceptance.

`LB-QA-013` dùng `npm run native:smoke:commands` để gọi route đăng ký slash commands từ installed
native bridge, xác nhận kết quả guild-scoped và đủ 26 command hiện tại cho guild QA. Smoke dành
timeout 60 giây riêng cho Discord REST registration vì đây là thao tác mạng có thể chậm hơn các
route local. Đây là kiểm tra parity/idempotency của nút trong native app, không phải chạy toàn bộ
command tương tác và không cần thực hiện lệnh phá hoại.

`LB-QA-015` dùng `npm run native:smoke:crash` để kiểm tra Job Object trên bản cài đã cấu hình:
smoke chờ health `ready`, force-terminate đúng native root PID bằng `/F` không dùng `/T`, rồi
xác nhận control port không còn reachable. Lệnh không tự restart, không join/phát lại và không
đụng process ngoài native PID; vẫn gỡ installer/profile tạm và kiểm tra `realAppDataChanged:false`.
Đây là bằng chứng orphan-guard sau native termination, không thay thế crash-recovery policy,
clean-machine, autostart/reboot, SoundCloud, Windows device, visual/accessibility hay signing.

`LB-QA-017` dùng `npm run native:smoke:crash-recovery` để kiểm tra bounded recovery của child:
smoke chờ health `ready`, từ chối session/player đang hoạt động, xác định đúng bundled
`runtime/node.exe` có parent là native PID rồi kill child bằng `/F` không dùng `/T`. Native root
phải còn sống, tạo child mới và đưa health về `ready`; sau đó harness dừng root, dọn profile/install
tạm và xác nhận `realAppDataChanged:false`. Đây không phải auto-join/auto-play, migration/upgrade,
autostart/reboot, SoundCloud, device, visual/accessibility hay signing proof. `LB-QA-015` vẫn là
test riêng cho forced native termination/orphan guard.

Secret scan phải chỉ xuất tên file, không xuất dòng hoặc giá trị. Loại `.env`, dữ liệu người dùng, dependency tree, build output và runtime staging khỏi phạm vi:

```powershell
rg -l --hidden -g '!.env' -g '!node_modules/**' -g '!native/node_modules/**' -g '!dist/**' -g '!native/dist/**' -g '!native/src-tauri/target/**' -g '!native/src-tauri/resources/**' -g '!data/**' -g '!.git/**' '(DISCORD_TOKEN|BOT_TOKEN|SOUNDCLOUD_CLIENT_SECRET|client_secret|Authorization: Bearer)' .
```

Kết quả chỉ là danh sách file cần review; không được dùng `rg` không có `-l` trên vùng có secret.

## 4. Native ownership và dev HMR

### Dev

```powershell
npm run native:dev
```

Sửa `native/src/` phải hot reload. Backend phải do Tauri khởi động; không chạy thêm `npm run dev` bên ngoài native trong cùng phiên. Bấm toggle runtime trong app để start/stop bot; đóng native và xác nhận child owner dừng.

### Release

```powershell
npm run native:build
npm run native:verify
npm run native:smoke
```

Kiểm tra artifact có runtime Node đã bundle, compiled entry và production dependencies; không phụ thuộc repo, npm hoặc Node cài riêng. Ghi checksum/size vào `docs/AUDIT_STATUS.md`.

## 5. Manual installed-build gate

Thực hiện trên máy hoặc profile không có repo, `node` và `npm`:

1. Cài MSI/NSIS vào đường dẫn sạch.
2. Mở app lần đầu; xác nhận UI không hiển thị dữ liệu giả.
3. Mở `Cài đặt` → `Control runtime` → `Mở thư mục dữ liệu`; tạo app-local `.env` theo hướng dẫn, không đặt secret vào resource installer.
4. Khởi động bot bằng toggle trong native; xác nhận `ready`, guild thật và provider state thật.
5. Đóng app; xác nhận bot child và listener `2901` do app tạo đã dừng.
6. Mở lại; xác nhận trạng thái offline/loading/error rõ ràng khi credential thiếu hoặc provider không khả dụng.
7. Kiểm tra upgrade/restart/restore backup không làm mất playlist, quyền, Community, audit hoặc settings; credential không xuất hiện trong backup.
8. Với artifact phân phối, xác nhận chữ ký Windows hợp lệ theo policy của dự án; checksum chỉ chứng minh tính toàn vẹn của file hiện tại, không thay cho code signing hoặc nguồn phát hành tin cậy.

## 6. Windows startup acceptance

Trong bản đã cài:

1. Bật `Khởi động cùng Windows`.
2. Đóng app, đăng xuất/đăng nhập hoặc reboot.
3. Xác nhận executable native tự mở, bot do native sở hữu và đạt `ready`.
4. Tắt toggle, đóng app, đăng xuất/đăng nhập lần nữa.
5. Xác nhận app không tự mở; không có Task Scheduler/npm/bot process riêng được đăng ký.
6. Gỡ cài đặt sau khi tắt autostart; kiểm tra app không còn process owner chạy.

## 7. Live QA và source-contract QA

### 7.1 Headless and slash-only readiness gate (`LB-RUNTIME-017`)

Run the local source contract before preparing a Linux VPS:

```powershell
npm run qa:headless
npm run typecheck
npm run build
```

`npm run qa:headless` verifies the fail-closed profile policy, the dynamic control-server import,
the absence of a static control import in the slash-only path, graceful signal hooks, and the
non-root systemd reference markers. It does not load `.env`, connect to Discord, bind port 2901,
or claim Linux/VPS readiness. On the target VPS, separately verify Node, FFmpeg, `dist/`, file
permissions, `systemctl stop`/SIGTERM, journald, restart policy, upgrade/rollback, and real Discord
voice playback. Those checks are Blocked until that host is available.

The current command set is 26 commands. `npm run register` remains the explicit registration path;
`slash-only` does not register global commands on every boot. The guild-scoped `/bot sync` action
is available only after the bot is online and requires Manage Server or Administrator.

Probe chỉ-đọc có thể chạy nhanh bằng:

```powershell
npm run qa:live
```

Probe dùng `LOCALBOT_CONTROL_URL` tùy chọn, mặc định loopback `2901`; `LOCALBOT_QA_GUILD_ID` và `LOCALBOT_QA_SEARCH` cũng có thể override. Nó chỉ ghi method/path/status, không đọc hoặc in response body. Search dùng `POST /media/search` nhưng không tạo queue/playback hay thay đổi dữ liệu. HTTP `4xx`, `5xx`, network hoặc timeout đều làm probe fail để không che giấu lỗi route/quyền. Probe không thay cho installed native ownership hoặc live playback acceptance.

`npm run audit:static` quét riêng production source roots (`src/`, `native/src/` và
`native/src-tauri/src/`) để chặn việc đưa lại nhãn mock/fake/sample, trạng thái demo hoặc
track demo cũ vào runtime. Lệnh chỉ in rule và vị trí, không in source line hay secret; test,
generated runtime, build output, local data, placeholder nhập liệu và migration compatibility
`demo-guild` được loại khỏi phạm vi theo chủ đích.

Dependency audit phải được ghi theo đúng trạng thái: HTTP `503` từ npm registry là
`Infrastructure blocked`, không phải `0 vulnerabilities`. Audit `--offline --json` chỉ là bằng chứng
tạm từ cache; phải rerun online trước khi phát hành.

Discover guild/channels từ API tại thời điểm test; không hardcode voice channel. Các contract chính phải trả response thật và không lộ body nhạy cảm:

- guild/channel discovery, bot status, join/move/leave;
- slash-command registration lại nhiều lần và command parity với native;
- search/resolve thumbnail thật, source tag YouTube/SoundCloud, deduplicate;
- add/remove/move/shuffle/repeat/clear queue, playlist CRUD, permission allow-list/all;
- play Discord, play Windows, bật cả hai, tắt/chuyển từng sink; cố ý làm Windows sink lỗi và xác nhận Discord vẫn chạy;
- pause/resume/skip/previous/volume/equalizer và hotkeys; Discord progress phải read-only theo `LB-MUSIC-014`, seek chỉ áp dụng cho Windows local session; không dùng animation click để che lỗi state;
- Community read-only: XP/rank/leaderboard, settings, audit local/Discord theo quyền;
- AutoMod policy/review queue chỉ đọc hoặc dry-run, kiểm tra kill switch/recovery và confirm/dismiss local; không tạo hành vi phá hoại thật;
- AutoMod content capability: chỉ xác nhận `capabilities.messageContentIntentEnabled` và trạng thái cảnh báo native; chỉ bật `LOCALBOT_MESSAGE_CONTENT_INTENT=true` sau khi đã bật Message Content Intent trong Discord Developer Portal và khởi động lại native-owned runtime. Không gửi spam/link/scam fixture vào guild thật.
- Ollama chỉ health/suggestion read-only, offline state an toàn.

Với SoundCloud, chỉ test khi operator đã cấu hình credential official qua Windows Credential Manager hoặc env fallback. Xác nhận track dùng URN, playback đi qua `/tracks/{track_urn}/streams` và HLS AAC; không dùng scraper, cookie người dùng, progressive-stream fallback hoặc credential của nguồn không được phê duyệt.

## 8. Native visual/accessibility gate

Kiểm tra ở logical width `320`, `375`, `768`, `1024`, `1440` và cả dark mặc định, Light, Default hybrid:

- floating primary menu không đè navigation; feature navigation và sticky footer không làm layout jump;
- player controls nằm giữa card; volume popover chỉ mở khi hover/focus, không che queue và không tràn viewport;
- icon Lucide/Iconify có box kích thước thống nhất, không méo/lệch; tag nguồn có spacing và contrast nhất quán;
- progress/equalizer chỉ dùng token trắng-đen đã chốt; không tự sinh accent màu;
- keyboard-only: menu, modal guild/voice, popover, toggles, dialogs có focus rõ, Escape đóng đúng, focus quay về trigger;
- `prefers-reduced-motion` giảm transition; motion chỉ phản hồi thao tác/state, không làm mất nội dung;
- scrollbar custom không làm thay đổi chiều rộng nội dung hoặc che control.

Nếu môi trường không chụp được native window/accessibility tree, ghi rõ lỗi môi trường và giữ gate chưa đạt; không suy luận visual pass từ compile hoặc browser mock.

## 9. Evidence format

Mỗi gate ghi vào `docs/AUDIT_STATUS.md`:

```md
### YYYY-MM-DD — LB-... / Gate ...
- Environment: installed/dev, OS, build identity
- Commands/checks: ...
- Observable result: ...
- Data safety: secrets/raw payloads excluded; destructive actions not run
- Status: Current | Planned | Blocked
- Remaining limitation: ...
```

Chỉ ghi status code hoặc summary đã redacted cho live probe. Không copy response body, user IDs ngoài scope, URLs stream, credential hay screenshot có secret.

## 10. Cleanup gate

Không lọc `dist/`, `native/dist/`, `native/src-tauri/target/`, cache, screenshot hay log trước khi tất cả P0/P1 trong `docs/REMAINING_GAPS.md` có evidence, backup local data đã tạo, và release artifact đã được hash. Khi đủ điều kiện, làm đúng `docs/CLEANUP_CHECKLIST.md`, ưu tiên move vào thư mục backup/trash có ngày thay vì xoá thẳng. Giữ `src/`, `native/src/`, tests, `docs/`, `DEMO/`, `DESIGN/` và `design-system/`.
