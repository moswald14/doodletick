# Validation — Doodle Tick 0.1b

This document records evidence for the archived 0.1b baseline, not a blanket guarantee for every environment. Fresh checks for this public repository are recorded separately by its publication workflow and CI results.

## Verified for the baseline

- All **82 combined Keeper and Home Assistant tests** passed for the numbered release. After the HTTP recipe-preview correction, all **14 targeted mushroom and ingress tests** passed again.
- The full RGB sequence was checked for range and uniqueness across the first two complete passes, with red/green endpoints, hour boundaries and compatibility with older signed records.
- Garden tests cover original Dot Wave audio, recipe normalization, hourly earnings, restart persistence, duplicate prevention, concurrent purchases, signed requests, idempotent payments, coin conservation, failed writes and tampered ledgers. Private routing tests use simulated adapters with real local HTTP.
- Ingress tests cover source restrictions, spoofed headers, protected mutations, relative frontend URLs, served assets, witness identity retention and signed garden operations.
- The extracted desktop release started independently, served all 40 published assets and the garden endpoint, and blocked private file paths. Archive contents and checksums were read back against source, with private runtime state excluded.
- The Home Assistant container built and ran on an actual **aarch64 Raspberry Pi**. An update and rebuild preserved the existing witness identity and receipt count. Its Web UI showed 0.1b, the garden and the corrected HTTPS explanation. The temporary installation helper and transfer services were stopped afterward.
- Browser checks with disposable players exercised planting, coin transfers, decorations, mushroom purchases, reload persistence, recipe import, a narrow layout and the red night theme. Recipe-export download completion was not captured by automation; format round-trips and original audio were checked programmatically.

## Not yet verified

Real multi-device VPN gameplay, file sharing and trading; Home Assistant HTTPS garden transactions; a complete Home Assistant backup restore; migration from a local app to a repository app; Raspberry Pi OS service installation and recovery; prolonged uptime, adversarial load and independent security review remain unverified.

An actual Home Assistant ARM64 deployment does not verify the separate Raspberry Pi OS installer. Simulated private adapters do not prove a physical VPN connection. Passing signature checks does not establish authorship, unique humans, independent time, honest operators or compliance with content licenses outside the app.

## Reproduce checks

From the repository root:

```sh
node scripts/sync-ha.mjs --check
node scripts/check-repository.mjs
node --test keeper/tests/*.test.mjs doodletick/tests/*.test.mjs
```

Use disposable identities, controlled fixtures and temporary data directories. Report commands, version or commit, observed results and untested steps. Keep keys, backups, authentication links, private deployment identifiers and personal logs out of public evidence.
