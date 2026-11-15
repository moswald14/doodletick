# Doodle Tick Keeper 0.1b

Doodle Tick is an experimental creator vault, private social arcade, file library and shared mushroom garden. Spirographs help people compare signed creator keys when pairing. Your writing and files remain in your browser; Keepers provide private connections, signed receipts and a shared garden scorekeeper.

## Start

Install [Node.js](https://nodejs.org/) 22 or newer, extract the complete desktop release, and run this command from the Keeper folder:

```sh
node server.mjs
```

Open **http://127.0.0.1:4317** in a modern browser. Keep the server running. There are no application packages to install. The standalone app caches its shell after the first successful load for offline use.

Use the same browser and address for the same saved vault: `localhost` and `127.0.0.1` have separate browser storage. Export and restore backups when moving browsers or devices. For an always-on directory, use the [Home Assistant app](../doodletick/DOCS.md) or the separately packaged [Raspberry Pi OS service](pi/START-HERE.md).

## Create and keep

- **My vault:** choose a creator name and a password of at least 12 characters. Write or import text, then **Seal this moment** to sign an entry and request a Keeper receipt. Names are local labels, not globally reserved identities. Exported text is an unencrypted copy.
- **Mushroom garden:** create or import a Dot Wave recipe, join one shared Keeper and plant with creator credit. Each unique generator earns one in-app Doodle Coin per completed owned UTC hour. Send coins, buy decorations or trade generators. Different Keepers have separate balances; coins have no cash redemption. See [the mushroom guide](MUSHROOMS.md).
- **Doodleverse:** practice with bots, join a private four-player room, or build a world. Games include Stardust Dash, Color Conquest and Four to Orbit. The room's host must remain online. See [the game guide](NETWORK.md).
- **Files & peers:** add a file and choose its content license, then explicitly enable sharing. Pair with another member and compare every group of the spirograph verification code. Received files can be re-shared with their original credits. Keep a holder online and unlocked when others need a copy.
- **Check a receipt:** verify signed writing or garden receipts. Arcade replays are checked in Doodleverse. A historical receipt is not proof of a current balance, independent time, original authorship or legal ownership.

## Private network

Games and file transfers use Keepers on the same private Tailscale network. Each standalone participant runs a local helper. The Home Assistant app contains its own Tailscale device. Read [PRIVATE-NETWORK.md](PRIVATE-NETWORK.md) before inviting people.

The browser service stays on loopback; the separate peer service uses the private VPN interface. Public lobbies and public pairing are disabled. Do not expose the local service through a router port or DMZ. Brief network failures have bounded retries and duplicate protection; long outages or restarts require fresh invitations. There is no automatic host migration.

## Color clock and appearance

The UTC clock visits every one of the 16,777,216 RGB colors once per full pass, beginning red and ending green. One color per hour takes about 1,914 years; subsequent passes change order. The wheel displays 24 hours. The epoch is November 11, 2026, 00:00 UTC. The galaxy countdown is poetic, not an astronomical forecast or a secret key.

Tetrachroma adds a custom focusable-black channel, `tetrachroma:#RRGGBBTT`. `00` preserves the RGB color and `FF` previews full black. This is a display adjustment, not a fourth physical primary or an authentication feature. Eight-digit CSS hex instead uses its fourth pair for transparency; do not treat these formats as interchangeable.

The automatic theme uses muted red and dark backgrounds from **9 PM to 7 AM** in the viewing browser's local time. Adjust the hours in Appearance or restore Automatic after a manual Daylight/Red night choice. Appearance does not change signed colors or saved records.

## Content licenses

The application's included code is GPLv3. A user's writing, sounds, worlds and files have their own content licenses; they are not automatically published or relicensed.

Files & peers supports the six Creative Commons 4.0 licenses and CC0 1.0. Signed records bind content hashes to credits, source links, notices and adaptation history. Exported bundles include the exact file, `ATTRIBUTION.txt` and the signed license record.

Attribution is preserved. The sender rejects declared commercial requests for NonCommercial material. The single-source adaptation tool requires the same supported ShareAlike license, retains upstream records, and does not offer sharing adaptations of NoDerivatives material. CC0 credit is retained as provenance, not described as a CC0 legal requirement. The app supports up to six adaptation generations; compatible-license alternatives and multiple-source remixes are not implemented.

These are checks on metadata and declared use. They cannot establish ownership, detect hidden copying, decide legal exceptions or enforce behavior outside the app. Stopping local sharing does not revoke recipients' existing rights or delete their copies. Read the actual license at [Creative Commons](https://creativecommons.org/share-your-work/cclicenses/).

## Backups and trust

Keep the separate **vault**, **files** and **arcade** backups, plus the vault password. Restore the creator vault first. Browser storage can be evicted or cleared; requesting persistent storage does not replace backups. There is no password-reset or guardian-recovery service.

Keeper state lives in `.doodletick`: the witness key, receipt journal and garden ledger. Back up the whole directory privately while the Keeper is stopped. Restore a garden ledger with its matching witness key, and never run cloned identities concurrently. Home Assistant backups cover its app data, not the browser vault. A stalled lock file may be removed only after confirming no Keeper uses that directory; never remove the identity or ledger as a startup fix.

The vault uses authenticated encryption and creator signatures through Web Crypto. Passwords and writing bodies are not sent to the witness, but receipt metadata is linkable. The local witness and garden operator control their clocks and storage. Signatures cannot prevent a malicious operator, an old-backup rollback or a person with a key from creating another valid history. Unlocked browsers, extensions and local helpers are trusted endpoints.

The current file library allows 20 MiB per file, 100 MiB and 100 files per identity, with up to four connected file peers. Its storage is encrypted in the browser; it is not an unattended shared-disk service. The game economy is not cryptocurrency, real-money payments or independent anti-cheat. There is no global identity registry, screenplay generator or consensus recovery system in this release.

See [VALIDATION.md](VALIDATION.md) for evidence and remaining checks, [RELEASES.md](RELEASES.md) for versioning, and [CONTRIBUTING.md](../CONTRIBUTING.md) for development. This edition has not had an independent security audit.
