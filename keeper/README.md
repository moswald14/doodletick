# Doodle Tick Keeper 0.6b

Doodle Tick is an experimental creator vault, social arcade, file library and shared mushroom garden. Spirographs help people compare signed creator keys when pairing. Your writing and files remain in your browser; Keepers provide signed receipts, a local directory and a shared garden scorekeeper.

The 0.6b update adds independent native DVC mining and signed payments. Use **Doodleverse Coin** for the red MINE NOW button, algorithm choice, balances, sending, receiving and peer sync. Read [NATIVE-DVC.md](NATIVE-DVC.md) for the fixed 21-million supply, disclosed founder allocation, mining maturity and experimental network limits. Existing vaults, garden coins and founder certificates retain their formats. See [validation](VALIDATION.md) for evidence.

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

## Weather and music

Open **Weather & music** below the top bar from any app view. Weather is off until you search for a city and select a result. **Degrees** switches C/F, **Change city** replaces the choice, **Refresh weather** requests a new report, and **Clear location** removes the saved city and forecast. Current conditions, feels-like temperature, wind and three forecast days are shown with fetch/model times; stale reports stay labeled when a refresh fails.

Search sends your city query directly to Open-Meteo. Selecting a result sends its coordinates for forecasts and saves the city, units and latest report in this browser, outside the encrypted vault. There is no automatic geolocation. Weather refreshes about every 30 minutes while the panel is open and the tab is visible; closing/hiding it stops pending requests and scheduled refreshes. Clearing the saved location turns weather off. Storage failures are shown rather than silently promising persistence or deletion.

Keep [Open-Meteo](https://open-meteo.com/) and GeoNames attribution beside the weather. API data use [CC BY 4.0](https://open-meteo.com/en/licence), distinct from the application's GPL license. The included free endpoint is for personal, non-commercial use; commercial deployment needs a separate compliant service plan/integration before enabling it. See [provider terms](https://open-meteo.com/en/terms). This is forecast data, not a local sensor or emergency-alert service.

**Play music** starts original local synthesis: Phone cord, Mushroom grove or Afterglow. Use Pause, Mute and volume as needed. Music continues between Doodle Tick views and when this panel is collapsed, pauses when the tab is hidden, and releases its audio resources on page exit. It never autoplays or automatically resumes. Sound preferences are saved locally; no music is streamed and no third-party recording rights, subscription or health benefit is supplied.

## Link a founder recipient

The Coin page preserves the original signed founder proof and can add a wallet recipient record. Connect a compatible browser extension, review the exact account and chain, sign the fixed recipient message, then explicitly start fresh GPU proof. No payment or token approval is requested. See [WALLET-RECIPIENT.md](WALLET-RECIPIENT.md). These archived certificates do not mint coins. The separate native DVC panel mines blocks and sends signed native payments; see [NATIVE-DVC.md](NATIVE-DVC.md).

If the wallet connects but cannot read the required blocks, expand **Blockchain read service** and explicitly choose **PublicNode · Ethereum only**. This optional chain-1 service receives the connecting IP, public wallet address and exact block queries; smart-account verification also sends the public digest/signature. The wallet still supplies the account/network and signs. Wallet reads are the default, the choice is page-only, and there are no on-load calls or automatic fallback. Exact-block checks remain enforced; unsupported chains or missing state fail without verification. Error details show a safe method and numeric code, not raw provider payloads. No funds, fees, transaction permissions or data-format migration are required; existing vaults and v1/v2 records remain intact.

## Direct connections

Games and files use native encrypted WebRTC between browsers. Exchange a signed invitation and answer, then compare both spirographs and every code group before confirming. Use HTTPS or localhost. This release has no bundled VPN, STUN/TURN server or Internet relay; the browsers need direct reachability, often on the same local network. Read [the connection guide](PRIVATE-NETWORK.md) before inviting people.

The standalone browser service stays on loopback; Home Assistant uses authenticated ingress. No remote HTTP peer listener is started. Short directory codes and private garden trading work only for users of this same Keeper. Full signed invitations pair browsers across separate Keepers when directly reachable. Existing remote garden balances do not migrate with the connection change.

Keep the game host or unlocked file holder's page open. Outages and restarts require fresh invitations; there is no automatic host migration or resumable peer transfer. Older VPN invitation codes must be recreated in 0.3b. Saved keys, signed records and garden ledgers retain their formats, and earlier Home Assistant VPN state remains inert for rollback.

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

The current file library allows 20 MiB per file, 100 MiB and 100 files per identity, with up to four connected file peers. Its storage is encrypted in the browser; it is not an unattended shared-disk service. Private Keeper coins are a game economy. Optional public DGT gardens have separate balances and network fees; see [the contract guide](../contracts/README.md). Native Doodleverse Coin has its own experimental chain and spendable balances; its earlier certificates remain archival. There is no global identity registry, screenplay generator or consensus recovery system in this release.

See [VALIDATION.md](VALIDATION.md) for evidence and remaining checks, [RELEASES.md](RELEASES.md) for versioning, and [CONTRIBUTING.md](../CONTRIBUTING.md) for development. This edition has not had an independent security audit.
