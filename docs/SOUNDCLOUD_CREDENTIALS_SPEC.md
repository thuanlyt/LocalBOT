# SoundCloud credential boundary — `LB-MUSIC-012` / `LB-MUSIC-017`

Status: Implemented native-first slice; installed-build and live provider acceptance remain release gates.

## Official API reference checked 2026-09-04

- [SoundCloud API Guide](https://developers.soundcloud.com/docs/api/) is the source of truth for the current base/auth URLs, OAuth 2.1 flows, client-credentials limits, public search, URL resolution, and stream/transcoding behavior.
- [SoundCloud API OpenAPI specification](https://github.com/soundcloud/api/blob/master/openapi/api.yaml) is the endpoint/schema reference used when the adapter contract changes.
- [SoundCloud streaming migration](https://developers.soundcloud.com/blog/api-streaming-urls/) is the playback source reference: prefer the current HLS AAC URLs and do not reintroduce the retired progressive-stream path.
- [SoundCloud URN migration](https://developers.soundcloud.com/blog/urn-num-to-string/) is the identity reference: track URNs are canonical and numeric-only track records are rejected by LocalBot.
- LocalBot uses only the documented server-side Client Credentials flow for public search, resolve, and playback. The official API also documents Authorization Code/PKCE for user-scoped actions; that flow is intentionally not part of the current LocalBot scope because Music only needs public resources. It does not use harvested browser client IDs, undocumented API-v2 calls, or user cookies.
- SoundCloud track metadata may include a creator-facing `metadata_artist` distinct from the uploader profile. The adapter prefers that field and falls back to the public uploader name; the normalized DTO still exposes only `channel`.
- Playback requests use `/tracks/{track_urn}/streams`, prefer `hls_aac_160_url`, and fall back to `hls_aac_96_url`; the signed HLS URL stays inside the Node runtime and is consumed by the sink's own FFmpeg process. Public tracks may be streamed without a user session; blocked/private/geo-restricted content is not made playable by adding cookies.
- If a cached single-use refresh token is rejected as invalid/expired, `LB-MUSIC-017` clears only the in-memory token cache and obtains a fresh app token through HTTP Basic Client Credentials; transient network errors do not clear the cache. The deterministic suite exercises this recovery through a mocked HTTP boundary without real credentials or network access.

## Intent

SoundCloud remains an optional official-API provider. Operators may configure its official Client ID and Client secret from the native Windows Settings surface without putting secrets into React state persistence, the loopback control API, local JSON backups, screenshots, or runtime logs.

## Contract

- Native commands:
  - `soundcloud_credentials_status() -> boolean`: returns only whether a valid Windows Credential Manager entry exists.
  - `set_soundcloud_credentials({ clientId, clientSecret })`: validates bounded, non-empty, non-control-character values and writes a generic credential under the fixed LocalBot target.
  - `clear_soundcloud_credentials()`: removes that entry; deleting an already-missing entry is idempotent.
- The native shell reads the entry only while starting the native-owned Node child and injects the values into that child process environment.
- Precedence is native vault values over inherited/process `.env` values. If no vault entry exists, the existing `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET` environment contract remains the fallback.
- The running Node module loads configuration at process startup. Saving or clearing a credential therefore requires a native-owned bot restart before provider readiness changes.
- No SoundCloud credential route exists on `127.0.0.1:2901`; the control API continues to expose only redacted provider readiness and enable/test operations.

## State matrix

| State | Native UI | Runtime behavior |
| --- | --- | --- |
| Native vault unavailable | Shows `Native only` and disables vault actions | `.env` fallback may still work |
| Vault empty | Shows `Chưa lưu` | Uses `.env` fallback if configured |
| Vault populated | Shows `Đã lưu an toàn`; never reveals values | Uses vault values after the next native-owned start |
| Save/clear completed while bot is running | Shows a restart reminder | Current Node process keeps its existing configuration until restart |
| Invalid or unreadable vault entry | Shows a safe error without payload | Native start fails closed for the vault read; operator can clear/reconfigure |

## Security and privacy rules

- Windows Credential Manager is the storage boundary for the native Settings path; the UI receives only a boolean status.
- The client secret is accepted transiently by the native WebView, then passed directly to the Tauri command. It is not sent to the loopback API and is cleared from the form after the operation.
- Credential values are bounded and control characters are rejected. Raw values, Windows error payloads, OAuth tokens, and provider responses must not be logged or returned.
- The credential-free backup intentionally excludes the vault. Clearing/recovery of the vault is an explicit operator action, not an import/export side effect.
- This requirement does not add user OAuth, cookies, private/geo-restricted content access, unofficial SoundCloud scraping, or remote administration.

## Acceptance

- Rust unit tests cover normalization, bounds, control-character rejection, and encoded credential round-trip without exposing real values.
- `cargo check` and native TypeScript checks pass.
- Manual Windows acceptance: save dummy/approved official credentials, confirm only status is visible, restart the native-owned bot, verify provider readiness/test/search/resolve/play, clear the entry, restart, and verify safe unconfigured behavior.
- Verify the running bot remains native-owned and that closing the native app still terminates the bot process tree.
