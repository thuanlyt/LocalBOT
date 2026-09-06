# Ollama integration specification

Requirement: `LB-AI-001`

Status: Current through `LB-AI-002`; AI-assisted product actions remain out of scope.

## Intent

Ollama is an optional local intelligence layer. LocalBot must remain fully usable when Ollama is not installed, disabled, offline, or missing the selected model. Deterministic Discord permissions, queue state, moderation policy, and confirmation flows remain authoritative.

## Scope

- Persist a small, non-secret Ollama configuration in `data/ollama.json`.
- Allow the native Settings screen to enable/disable the integration, set an HTTP(S) endpoint, choose a model, and inspect health.
- Probe only the Ollama-compatible `GET /api/tags` endpoint with a bounded timeout.
- Return a minimal status DTO; never return the raw response, model metadata, prompt, token, cookie, or API key.
- Include the non-secret settings in the credential-free local backup and transactional restore.

## Out of scope for this requirement

- Sending Discord messages, member data, audit content, provider payloads, or private prompts to an AI service.
- AI-controlled queue, permission, moderation, role, guild, or filesystem actions.
- Remote administration, API-key storage, user OAuth, autonomous agents, or prompt execution.
- Claiming that a model is usable when the health probe cannot verify it.

## Behavior and state contract

### Settings

Given native control is online, when the operator saves a partial settings patch, then the server validates and atomically persists the complete settings object.

- `enabled`: boolean, default `false`.
- `baseUrl`: HTTP or HTTPS URL, no username/password/query/fragment, at most 240 characters. Default `http://127.0.0.1:11434`.
- `model`: optional string, at most 120 characters. An empty model is allowed only to represent not configured.
- `timeoutMs`: integer `1000..30000`, default `5000`.

Invalid input returns `400 INVALID_OLLAMA_SETTINGS` and leaves the previous settings unchanged.

### Health

`POST /api/v1/ollama/health` probes only when `enabled=true` and a model is selected. The DTO is:

```json
{
  "health": {
    "status": "disabled | not_configured | ready | model_unavailable | offline",
    "reachable": true,
    "modelAvailable": true
  }
}
```

The `GET /api/v1/ollama` route returns the same health snapshot together with settings for native hydration. `ready` requires a successful `/api/tags` response containing the selected model (base name matching a tagged variant is accepted). Timeout, network failure, non-2xx response, malformed JSON, or missing model metadata must not throw raw provider data through the control plane.

### Native UX

The Settings screen must expose explicit offline, disabled, not-configured, model-unavailable, and ready states. Saving reports success only after the server response. The UI must say that AI is optional and suggestion-only; no feature may imply that Ollama can override deterministic permissions or safety policies.

## Contracts

- `GET /api/v1/ollama` — implemented settings + health hydration.
- `POST /api/v1/ollama/settings` — implemented partial non-secret settings update.
- `POST /api/v1/ollama/health` — implemented bounded health probe.
- `data/ollama.json` — implemented version-one local store.
- Backup store `ollama` — implemented as a non-secret version-one store.

## Acceptance

- Unit tests cover defaults, persistence, invalid endpoint/timeout rejection without mutation, health states, and corruption quarantine.
- Control tests cover settings hydration/update, safe offline response, stable error behavior, and absence of credential-like fields.
- Root typecheck, full deterministic tests, root build, native typecheck, native build, and release packaging pass.
- With Ollama absent, LocalBot startup and every non-AI feature remain unaffected.
- Live Ollama acceptance is optional until the operator supplies a local model; absence must be recorded as `offline` or `not_configured`, never as failure of LocalBot itself.

## Next requirement

The current read-only suggestion slice is deliberately non-authoritative. Any future action suggestion must be previewed and confirmed by a deterministic LocalBot handler.

## LB-AI-002 — Bounded read-only suggestions

Status: Implemented bounded adapter/control/native slice; autonomous actions remain out of scope.

Scope:

- Accept a short operator-provided question from native Settings for `help`, `music`, or `community` context.
- Send only that question plus a fixed safety instruction to the explicitly configured Ollama endpoint when the operator has enabled Ollama and selected a model.
- Bound input to 512 characters, output to 2,000 characters, generation budget to 256 tokens, and reuse the configured timeout.
- Return only a plain suggestion DTO; never return the raw Ollama response, prompt, private Discord state, member data, queue data, credentials, or provider payloads.
- Treat the model response as untrusted text. It may explain or suggest a next step, but it cannot invoke tools, mutate LocalBot state, or bypass deterministic validation.

Out of scope:

- Autonomous commands, queue/player actions, role/permission changes, moderation, filesystem access, web browsing, remote administration, or hidden context injection.
- Sending guild messages or using Discord content as model context.
- Claiming that a suggestion is correct, safe, or authoritative.

Contract:

- `POST /api/v1/ollama/suggest` accepts `{ query: string, surface?: "help" | "music" | "community" }`.
- Success returns `{ suggestion: string, surface: string, generatedAt: string }`.
- Disabled, unconfigured, unavailable, malformed, or timed-out providers return a stable safe error and never raw provider text.
- Every successful request records only the surface and outcome in the local audit log; the query and model response are not persisted.

Acceptance:

- Unit tests prove bounded input/output, disabled/unconfigured behavior, timeout/error mapping, safe extraction from a valid response, and no prompt/query leakage in the returned DTO or audit detail.
- Control tests prove the route validates surface/query, rejects unsafe state without mutation, and never exposes raw provider fields.
- Native Settings exposes an explicit suggestion-only surface with loading/error/empty states and no action button.
- Root tests/typecheck/build, native typecheck/build, and release packaging remain green; an unavailable Ollama service does not affect core LocalBot features.
