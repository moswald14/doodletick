# Move a local Keeper to the repository app

This is an administrator-operated migration using an offline Home Assistant backup and a one-time Doodle Tick import. It is not a Supervisor feature that changes an app's identifier. Normal backup restore selects the app slugs in the backup; it does not offer a source-to-destination slug mapping. The new repository app has its own persistent data. [Backup API](https://contributors.home-assistant.io/apps/supervisor-api/backups/), [persistent app storage](https://contributors.home-assistant.io/apps/reference/environment/)

The transfer preserves `keeper/`: the witness identity, garden ledger and receipts. If an older source contains `tailscale/`, those private files are copied unchanged and remain **inert for rollback**; version 0.3b never starts a VPN. New Keeper-only snapshots are accepted. An empty compatibility directory may be created, but no VPN identity is generated. The transfer does not move browser vaults or overwrite the target's `options.json`. The legacy hostname option is accepted for upgrades but no longer configures a network device.

## Prepare a reversible cutover

1. Pause player activity. Record the old app's public witness fingerprint, receipt count and garden balances/ownership privately. Retain any older VPN backup for rollback. Export browser backups separately.
2. Turn off the old app's watchdog and startup, then stop it. Keep the old installation intact. Install the repository app but leave it stopped, with startup and watchdog off until cutover is verified. Never run two copies of the same witness or VPN identity.
3. Create an unencrypted partial Home Assistant backup containing the stopped old app. Keep it on the Home Assistant machine with restricted access. It contains private keys. Preserve an independently protected backup for recovery.
4. Using the authorized administrative helper, inspect archive **member names only** to confirm the exact nested app archive and its data-directory prefix. Do not print files containing keys, ledgers or VPN state. Do not rewrite Home Assistant backup metadata.
5. Place the reviewed `scripts/migrate-stage.py` on Home Assistant. It requires Python 3.11 or later and only the standard library. If the helper needs Python, use its signed operating-system package repository. Do not grant Doodle Tick Docker or Supervisor administrator access for this migration.

The staging command needs the actual backup filename, app member and target app configuration folder. The symbolic names below must be replaced with observed values; they are not deployment paths:

```sh
python3 migrate-stage.py \
  --backup /backup/OBSERVED_BACKUP.tar \
  --member OBSERVED_OLD_APP.tar.gz \
  --data-prefix data \
  --destination /app_configs/OBSERVED_TARGET_APP/doodletick-migration \
  --offline
```

`--data-prefix` must match the inspected nested archive; `data` is only the common layout. The current official helper mounts app configuration folders at `/app_configs`; older helpers may use `/addon_configs`. Verify the actual mount before choosing a destination. The target configuration folder must exist and its `doodletick-migration` child must not exist. The tool selects only `keeper/` and any optional older `tailscale/` tree. It rejects links, traversal, duplicate files, a missing witness identity and input larger than 2 GiB or 10,000 files. It hashes and rereads the copied files, writes restrictive permissions and publishes the completed stage only after verification. Output contains counts, never keys or hashes. Any failed temporary stage remains private on Home Assistant for deliberate cleanup. Keep the unchanged old installation and a protected offline copy of the original backup available throughout cutover.

## First start and verification

The repository app mounts its own app configuration read-only at `/config`. Before creating data folders or starting the Keeper, `importMigration()` checks `/config/doodletick-migration`. It requires a completed manifest and verifies all staged file hashes. Initial `/data` may contain **only** Supervisor's regular `options.json`; any other existing data stops the import without replacing it. No tunnel device, network-administration capability, Docker access or Supervisor administrator permission is needed by Doodle Tick.

After a successful copy and read-back, the app records completion in its private data directory. Linux file and directory writes are flushed before the completion is reported. Interrupted copies fail closed on restart. Later starts never reapply the old ledger or VPN snapshot; the retained witness must still match the imported identity. Removing the completed staging folder after cutover does not reset the completion record.

Start only the target app. Before reopening player activity, compare its witness fingerprint and receipt count with the recorded values and check existing garden ownership and balances using the original browser identity. Confirm that legacy VPN state remains preserved but unused. Check the new HTTPS frontend separately, then test a fresh signed browser invitation and spirograph comparison over a reachable direct route. Restart the target once and repeat identity and garden checks. Keep private keys out of screenshots and logs.

After successful verification, enable startup, watchdog and the requested automatic updates **on the repository app**. Keep the old app stopped and its startup/watchdog disabled. Remove the temporary stage and failed staging folders from the app configuration directory, the temporary plaintext backup and any extracted copies according to the retained-backup plan. Stop the administrative helper. Retain a protected backup and the old installation for the agreed rollback window.

## Rollback and limits

Before players make new transactions, a failed cutover can be rolled back by stopping the target, keeping it disabled, and starting the unchanged old app. Do not delete target data to hide a failed import; preserve it for inspection. After new transactions occur on the target, simply starting the older source would lose those changes. Stop both apps, preserve both current snapshots and plan a compatible recovery instead.

The app's `backup: cold` setting stops it for consistent future backups. An older local version may not have that setting, which is why this migration explicitly stops the source before backing up. [Backup configuration](https://contributors.home-assistant.io/apps/reference/configuration/#backups)

Disposable tests exercise archive staging with and without legacy VPN state, an actual signed Keeper receipt and garden balance/ownership transfer, restart behavior, tampering, linked files and existing-target refusal. Legacy VPN fixtures are opaque dummy files, never enrolled devices. These tests do not prove Supervisor backup compatibility on every version, physical migration, rollback to older VPN software or power-loss recovery. The actual 0.3b cutover has not yet been completed; the operator must inspect the real backup layout and record cutover/rollback evidence separately.

For developers, `node --test doodletick/tests/migration*.test.mjs` runs the rehearsal. `scripts/migrate-offline.mjs copy|verify` also works on explicitly named offline data directories; it never stops services or converts Supervisor metadata. The source and destination must be distinct, and existing destination data is never replaced.
