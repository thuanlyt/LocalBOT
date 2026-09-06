# LocalBot Persistence and Migration Spec

Status: `LB-RUNTIME-007` implemented as a shared migration runner; concrete schema migrations are added only with the store-specific SDD task that changes a schema.

## Objective

Keep local JSON data recoverable across application upgrades without silently accepting a future or incompatible schema. A migration must be deterministic, bounded, atomic, and safe to retry.

## Scope

- `src/persistence.ts` provides one migration runner for every local JSON store.
- A store may declare a `currentVersion` and one-step migrations (`N -> N+1`).
- A successful chain is validated by the store's existing type guard, then persisted through `saveJsonStoreAtomic` before it is returned.
- `loadJsonStore` reports `migrated: true` only after the new file is on disk.
- A future version, missing migration step, thrown migration, invalid migrated output, or failed migration write is never accepted as current data.
- The current credential-free stores include playlists, Music permissions, Equalizer, Community, audit log, player state, Welcome/Goodbye, AutoMod policy, bounded AutoMod review metadata, and Ollama settings. The review store is version `1`, capped at 1,000 redacted entries, and is isolated from message content and provider credentials.

## Contract

```ts
type JsonStoreMigration = {
  from: number;
  to: number; // exactly from + 1
  migrate: (parsed: unknown) => unknown;
};

loadJsonStore(path, isValid, createDefault, readError, {
  currentVersion,
  migrations,
  migrationWriteError?,
  onMigration?
})
```

The result is `{ data, recoveredFromCorruption, migrated }`. Existing callers that do not declare migrations retain the current behavior. The migration hook receives only numeric versions; payloads, paths, and secrets are never logged by the persistence layer.

## State matrix

| Input | Result | File effect |
| --- | --- | --- |
| missing file | empty default | no file created |
| valid current version | current data | unchanged |
| older version with complete valid chain | migrated data | atomically replaced with current version |
| older version with no/partial/invalid chain | empty default, recovered | original quarantined as `.corrupt-<timestamp>.json` |
| current/future version rejected by validator | empty default, recovered | original quarantined; never downgraded |
| migration write fails | typed read/write error | caller does not receive migrated data |

## Rules for future store migrations

1. Add a store-specific requirement and ADR when changing a persisted shape.
2. Keep each step one-way and one-version only; do not make a migration depend on network, Discord, provider credentials, current time, or UI state.
3. Validate the migrated result with the current store guard and preserve unknown fields only when the store contract explicitly allows them.
4. Add tests for the legacy fixture, the final serialized shape, retry after restart, invalid migration output, and future-version quarantine.
5. Update backup/restore compatibility and release notes. A backup envelope version is independent from an individual store version.

## Acceptance evidence

- `src/persistence.test.ts` covers missing/current/corrupt/future data, a two-step `v0 -> v1 -> v2` migration, atomic persistence, and the `migrated` signal.
- Current stores remain version `1` because no concrete schema change has been approved yet; their multi-version migration functions remain a planned, store-specific follow-up. `automod-review.json` uses the shared corruption boundary and is included in the version-one backup/restore set.
- The shared runner is intentionally not used to reinterpret unknown legacy data.
