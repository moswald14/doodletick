# Doodle Tick · 0.5.1b

A creator arcade inspired by the loops of a telephone cord: an hourly color clock, Dot Wave sound mushrooms, an encrypted vault and direct peer connections. Run a Keeper on your computer or Home Assistant.

[![Add Doodle Tick to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fmoswald14%2Fdoodletick)

## Wallet read compatibility

**0.5.1b is in preparation and has not been published or installed.** It adds an explicit optional **PublicNode · Ethereum only** read source for wallets that connect but cannot complete the required block queries. Wallet reads remain the default; the choice is not saved and no fallback or query happens automatically. The wallet still controls account access and message signing. Exact-block verification remains required. PublicNode receives the connecting IP, queried public address and block requests; smart-account checks also send the public digest/signature. See [the read-service disclosure and limits](keeper/WALLET-RECIPIENT.md#optional-ethereum-read-service).

Failures identify a safe method and numeric code without exposing raw provider errors. Existing vaults, original v1 proofs and v2 records retain their formats. This compatibility change requests no payment, token allowance, transaction, delegation or deployment, and creates no spendable DVC. All 287 app tests and repository checks passed. Chrome completed a disposable-creator/mock-wallet proof using live PublicNode reads and real GPU work; actual Coinbase signing remains unresolved. See [validation](keeper/VALIDATION.md) for evidence and limits.

## Weather and background music

**0.5b adds an expandable Weather & music panel below the top bar**, available across the app. Search for a city, choose a result, and switch between Celsius and Fahrenheit. The three-day forecast and city choice are saved in this browser; **Clear location** removes them. Weather refreshes while the panel is open and the tab is visible. No automatic geolocation is requested: searches and selected city coordinates go directly to Open-Meteo after your choice.

Choose **Phone cord**, **Mushroom grove** or **Afterglow**, then press Play for original music synthesized locally. Pause, Mute and volume remain under your control. Music continues between app views, pauses when the tab is hidden, and requires Play to resume. There is no autoplay, streaming subscription or health claim.

Weather attribution stays visible: [Open-Meteo data](https://open-meteo.com/en/licence) use CC BY 4.0, with GeoNames location credit. The included free API is for personal, non-commercial use; commercial hosts need a separate compliant plan/integration. See [Open-Meteo's terms](https://open-meteo.com/en/terms) and [the Keeper guide](keeper/README.md#weather-and-music).

## The wallet recipient update

**0.4b links a founder proposal to a self-custody browser wallet.** Choose the Coinbase Wallet extension (or another compatible injected wallet), review the recipient and network, then approve a narrowly scoped message. The original creator key also signs the new record. Fresh GPU work binds both approvals; the previous public proof stays intact. See [wallet recipient steps and verification limits](keeper/WALLET-RECIPIENT.md). This does not launch a coin or make a balance appear in a wallet.

## The Doodleverse Coin update

**0.3b removes the required Tailscale runtime** and introduces signed, encrypted WebRTC pairing. Exchange an invitation and answer, compare the spirographs, and confirm on both sides. No outside relay is configured automatically. Direct reachability depends on the networks involved; worldwide discovery and relaying remain development work.

**Doodleverse Coin begins with a disclosed 1,000,000 DVC founder-allocation proposal.** The new Coin page signs a public certificate with an unlocked creator identity, runs a bounded GPU proof search only when requested, and verifies imported proofs independently. Stop, hiding the page, leaving the view and locking the vault cancel work. A successful certificate is a prelaunch record: it establishes a signature and hash target, with no spendable DVC balance or adopted blockchain genesis. Anyone can create a self-signed proposal; compare its full address and hash with the project's published reference before assigning it authority. Future network supply and issuance rules are unadopted.

Read the [Doodleverse direction and developer invitation](DOODLEVERSE.md). Human networking, protocol, GPU, Home Assistant and usability contributors are wanted. The longer-term goals are community-owned free communication, the proposed Moz Republika Socialist Foundation, and eventually monthly Doodle Tick Free Food Days with local partners.

## What stays in your Keeper

- Every RGB hex color gets an hour: 16,777,216 colors per pass, starting red and ending green.
- Unique Dot Wave mushroom recipes earn private Doodle Coins for completed owned UTC hours. One Keeper records its own balances, trades and optional mining bonuses.
- Each player can choose the separate public-wallet DGT garden mode from 0.2b. Every public transaction requires wallet confirmation and network fees.
- Three small games, a world workshop, licensed peer file sharing, an encrypted creator vault and automatic red night mode remain available.

Private Doodle Coins, public DGT gardens and DVC certificates are separate. There is no conversion, redemption or promised market value. Spirograph comparison checks signed keys, not legal identity or authorship. Creative Commons handling preserves supplied attribution and validates declared uses inside the app; it cannot stop copying outside it.

**Connection changes:** room codes and private garden access work through the same Keeper. Separate Keepers use signed manual peer invitations for games/files. The old remote VPN bridges are removed; data held by another Keeper has not moved. Open that Keeper through its own trusted interface to access its garden. Recreate old pairing codes. A room's player host and browsers serving files must stay open.

## Install in Home Assistant

Use Home Assistant OS on 64-bit ARM or AMD64. Add `https://github.com/moswald14/doodletick` under **Settings → Apps → Install app → Repositories**, install **Doodle Tick Keeper**, and open its Web UI. Enable **Start on boot**, **Watchdog** and **Auto update** after verifying setup. The first source build can take several minutes. Cold backups stop the app briefly for a consistent snapshot.

Open Home Assistant over trusted **HTTPS** for vault signatures and GPU work. Home Assistant Cloud remote HTTPS is one supported option; keep Home Assistant sign-in enabled. The app needs no Tailscale login, router DMZ, published browser port or network-administration capability. See the [Home Assistant guide](doodletick/DOCS.md).

This is an app/add-on repository. [HACS does not distribute add-ons](https://www.hacs.dev/docs/faq/addons/); a dashboard companion would be separate.

### Moving from a local app

Keep the original installation and backup. Repository apps have a different identifier and data volume. Follow the [offline migration guide](doodletick/MIGRATION.md) to preserve the witness, receipts and garden ledger before the first start. Verified imports refuse existing target state and never reapply an old snapshot after restart. Old VPN files are retained inertly for rollback. Browser vault/file backups are separate. Never run two copies of one Keeper identity.

## Desktop and Raspberry Pi OS

Once published, download an asset from the [0.5.1b release](https://github.com/moswald14/doodletick/releases/tag/0.5.1b). Until then, 0.5b is the published release. Desktop requires Node.js 22 or newer; development checks use Node 24. Extract the desktop ZIP, run `node server.mjs` inside `doodletick-keeper`, and open **http://127.0.0.1:4317**. No npm dependencies are required to run the app. For a source checkout, run it from `keeper/`.

The separate Pi tarball includes checksums and the [Pi OS setup guide](keeper/pi/START-HERE.md). It does not install Tailscale. Pi OS service installation remains a separate hardware verification task from the Home Assistant app.

## Build with us

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](ARCHITECTURE.md), [roadmap](ROADMAP.md) and [validation](keeper/VALIDATION.md). The [AI team](AI_TEAM.md) describes bounded coding roles in the development chat; human maintainers and reviewers are still needed. No paid job or contributor coin allocation is promised.

```sh
node scripts/sync-ha.mjs --check
node scripts/check-repository.mjs
node scripts/test.mjs
```

Canonical runtime source is `keeper/`; regenerate `doodletick/keeper/` with `node scripts/sync-ha.mjs`. Never commit live keys, vaults, ledgers, logs or backups. See [SECURITY.md](SECURITY.md) for reporting. The software is experimental and has not had a comprehensive independent security audit. Real-wallet transactions, physical multi-device reachability and sustained adversarial operation still need testing.

## License

Copyright © 2026 moswald14 and contributors. Included project code and shared Dot Wave modules use **GNU GPL version 3 only**. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). This does not relicense other Dot Wave Studio products. Creators retain their separate content rights and choose licenses for their shared work.
