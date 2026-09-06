# LocalBot UI/UX v1 Prototype

Đây là prototype UI-only để trải nghiệm hướng native app của LocalBot trước khi Claude Code triển khai backend. Prototype dùng dữ liệu mock; chưa kết nối Discord, YouTube, audio engine, Ollama hay control plane.

## Chạy local

Từ thư mục gốc `F:\dev\LocalBot`:

```powershell
python -m http.server 2901 --directory DEMO/uiux-prototype
```

Nếu lệnh `python` chưa có trong PATH, có thể dùng Python runtime đã có trên máy Codex:

```powershell
C:\Users\THUANLYT\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 2901 --directory DEMO/uiux-prototype
```

Mở [http://127.0.0.1:2901](http://127.0.0.1:2901).

> Trong prototype, port `2901` chỉ là static preview server. Khi Claude triển khai native app, Tauri window sẽ render local asset và không cần bind port; `2901` sẽ dành cho local control/runtime bridge. Không chạy hai dịch vụ cùng bind port.

## Luồng nên thử

- Hover, focus hoặc click nút ba gạch: primary navigation nổi ra với motion; nhấn `Escape` để đóng.
- Chuyển ba theme theo thứ tự SunMoon = `Default`, Moon = `Dark`, Sun = `Light`.
- Ở Music: Discover, Now Playing, Queue, Playlists và Equalizer.
- Tìm kiếm mock, thêm bài vào queue, xoá bài, xoá toàn bộ queue, đổi output Windows/Discord.
- Tạo/xoá playlist và thử preset Equalizer.
- Settings: Permissions và AI & Brain chỉ là form trải nghiệm, chưa lưu backend.
- Thu nhỏ cửa sổ để kiểm tra reflow; không có nút ép tỉ lệ. Native window sẽ dùng layout fluid và breakpoint compact.

## Source of truth

- [Approved UI/UX v1](../../docs/UI_UX_V1.md)
- [Native UI specification](../../docs/DASHBOARD_SPEC.md)
- [Design system](../../docs/DESIGN_SYSTEM.md)
- [Dashboard page override](../../design-system/localbot/pages/dashboard.md)
- [Claude workflow](../../docs/CLAUDE_WORKFLOW.md)

## Quy ước prototype

- Tông màu chỉ đen, trắng và grayscale; không dùng accent màu.
- Font chính là Be Vietnam Pro, có fallback system-ui khi chưa tải được Google Font.
- `Default` là split-tone độc lập: header/card header đen, body sáng; không phải system auto.
- `Dark` là theme mặc định khi mở lần đầu.
- Không có sidebar cố định; primary menu nổi theo hamburger và context navigation của module luôn nằm cạnh/bên dưới vùng điều hướng.
- Logo lấy từ `DESIGN/BLACK_TRANSPARENT.png` và `DESIGN/WHITE_TRANSPARENT.png`.
