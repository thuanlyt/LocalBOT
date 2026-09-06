# Changelog

## 0.1.0-alpha.1 — 2026-09-07

First public development preview. This release is intended for development,
testing, and early self-hosting; APIs, configuration, UI, and workflows may
change before stable release.

### Added

- Windows Headless/CMD runtime with doctor, slash control, runtime diagnostics,
  Music access, Community controls, bounded audit, Welcome/Goodbye configuration,
  and AutoMod configuration/review/recovery.
- Windows Native Tauri runtime with owned Node lifecycle, Music playback,
  Discord/Windows dual output, guild/voice controls, Community and diagnostics
  foundations.
- Lightweight Linux slash-only source/runtime contract and systemd reference.
- YouTube Music search/playback and optional official SoundCloud adapter.

### Known limitations

- Native and Headless remain in Active Development; this is not a stable release.
- Clean-machine installation, autostart/reboot, signing, physical device-loss,
  configured SoundCloud playback, and target-host Linux/VPS QA remain pending.
- The public release is source-first. MSI/NSIS were built and smoke-tested locally,
  but unsigned installers are not attached to this preview.
