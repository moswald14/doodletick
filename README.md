# Doodle Tick · 0.8b

A creator arcade inspired by the loops of a telephone cord: an hourly color clock, Dot Wave sound mushrooms, an encrypted vault and direct peer connections. Run a Keeper on your computer or Home Assistant.

[![Add Doodle Tick to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fmoswald14%2Fdoodletick)

## Doodle Jazz room

**0.8b adds Jazz room** to the Keeper sidebar. Open it and press **Play jazz** for an original, locally synthesized piano, bass and drum trio. Choose **Velvet swing**, **Blue hour** or **Bossa garden**, adjust the sound, or ask for a **New set**. No vault, wallet connection or streaming account is required.

The player opens in the same tab. Jazz can continue in the background while that page stays open and your device remains awake. **Back to Keeper** leaves the jazz page and stops its audio. Sound comes from the listening browser's speakers or headphones, and playback never starts automatically. Read the [jazz guide](keeper/JAZZ.md) for controls and interruption limits.

See the [validation record](keeper/VALIDATION.md) for the source checks and their limits. Published downloads are listed in [Releases](https://github.com/moswald14/doodletick/releases).

## Sleep garden and Keeper time

**0.7b adds a Sleep garden** with soft wind, blended mushroom voices, reduced static and quiet arcade blips and pops. Open **Sleep garden** and press **Start sleep sounds**. Three listening-only starter mushrooms work without a vault; you can also load your saved garden or open a Dot Wave recipe. The default is eight hours at 15% volume, with a fade during the final minute. Nothing starts automatically.

Sleep sounds can continue between app views and in a background tab. Keep the page open and the computer awake. Stop, a new mix, page exit or a browser audio interruption ends playback. Your vault can lock while already-rendered sound continues; locked keys cannot sign or trade. This listening feature does not plant, mint or mine coins.

The clock now checks signed, fresh responses from this Keeper, shows synchronization status and uncertainty, and projects time using the browser's elapsed-time clock. Private garden requests require fresh Keeper time. Automatic day/night appearance follows the same projected time while retaining the device's time zone and your chosen hours. A Keeper signature identifies the clock source; it does not prove Internet UTC accuracy or change DVC consensus. Read [time and Sleep garden details](keeper/TIME-AND-SLEEP.md) and the [validation status](keeper/VALIDATION.md).

## Mine to an address

**0.6.2b lets you mine using a Mining reward address alone.** Enter the full nonzero `0x` address, choose your algorithm and intensity, then press **MINE NOW**. Mining makes no wallet connection or signing request. **Mining address balances** shows that destination's available funds, immature rewards and pending outgoing payments separately from the wallet used for sending.

You can optionally choose **Use connected wallet address**. Connecting a wallet fills the mining field only when it is empty; editing the destination cancels unfinished work and turns Keep mining off. Spending still requires the address's supported wallet signature. Supply, consensus and saved-data formats are unchanged. See the [validation report](keeper/VALIDATION.md) for checked behavior and limits.

## Nightcap and GITTIT::GODDIT

**0.6.1b adds command input, output and errors to the Coin page.** Type `help`
for the command list, `status` for the loaded node state and mining destination,
`balance` for that destination's balances, or `mine` and `stop` to control GPU mining. Choose the
algorithm with `algorithm sha256d` and intensity with `intensity eco`.
The console follows the same account, visibility and cancellation checks as the
buttons. Output stays in this page and is bounded; Clear removes the transcript.
See the [command guide](keeper/NATIVE-DVC.md#gittitgoddit-console) for details.

Choose **Use Nightcap preset** for a Dot Wave mushroom with SHA-256, Eco intensity
and **Keep mining**. Press **MINE NOW** to begin repeated rounds. The auto catcher
submits each independently verified block and shows its immature reward in the
mining destination. Leave the Coin page visible and the computer awake. Stop,
turning repeat off, leaving the page, changing the reward address or an error ends the loop;
reopening never resumes it. The mushroom's session counter records accepted
blocks, not extra rewards or a separate garden coin balance.

## Native Doodleverse Coin

**0.6b introduced an independent, experimental Doodleverse blockchain.** Open **Doodleverse Coin**, enter a mining reward address, choose SHA-256 or SHA-256d and press the red **MINE NOW** button. Each round searches for one block with a visible Stop control and a 60-second limit; 0.6.1b adds opt-in Keep mining. A valid block earns native DVC; rewards mature after six further blocks. The fixed maximum is **21,000,000 DVC: 1,000,000 disclosed founder coins and 20,000,000 mineable coins**.

To send DVC, connect the wallet that controls the funds, review the recipient, amount and native fee, then approve its DVC message. The Keeper validates signatures, balances, nonces and work before saving anything. Paired browsers exchange blocks and pending payments; each Keeper independently chooses the history with the most verified work. Native DVC is held by the Doodleverse network, not displayed as an Ethereum token in Coinbase Wallet. There is no exchange, cash redemption, established market or promised return.

Read the [native coin guide and fixed rules](keeper/NATIVE-DVC.md) before mining or accepting a payment. Direct peer pairing currently needs a reachable route and open browser pages; there are no public seed nodes, automatic Internet relays or availability guarantees. The software is an early independent protocol, not Bitcoin-compatible or independently security-audited. See [validation](keeper/VALIDATION.md) for what was actually tested and what remains unverified.

Your creator vault, garden balances and original founder certificates keep their existing formats. The published [founder recipient record](founder-records/0.5.1b/README.md) remains archival evidence. The separate native genesis identifies the same disclosed recipient and allocation; importing a certificate cannot mint coins.

## Weather and background music

**0.5b adds an expandable Weather & music panel below the top bar**, available across the app. Search for a city, choose a result, and switch between Celsius and Fahrenheit. The three-day forecast and city choice are saved in this browser; **Clear location** removes them. Weather refreshes while the panel is open and the tab is visible. No automatic geolocation is requested: searches and selected city coordinates go directly to Open-Meteo after your choice.

Choose **Phone cord**, **Mushroom grove** or **Afterglow**, then press Play for original music synthesized locally. Pause, Mute and volume remain under your control. Music continues between app views, pauses when the tab is hidden, and requires Play to resume. There is no autoplay, streaming subscription or health claim.

Weather attribution stays visible: [Open-Meteo data](https://open-meteo.com/en/licence) use CC BY 4.0, with GeoNames location credit. The included free API is for personal, non-commercial use; commercial hosts need a separate compliant plan/integration. See [Open-Meteo's terms](https://open-meteo.com/en/terms) and [the Keeper guide](keeper/README.md#weather-and-music).

## The wallet recipient update

**0.4b links a founder proposal to a self-custody browser wallet.** Choose the Coinbase Wallet extension (or another compatible injected wallet), review the recipient and network, then approve a narrowly scoped message. The original creator key also signs the new record. Fresh GPU work binds both approvals; the previous public proof stays intact. See [wallet recipient steps and verification limits](keeper/WALLET-RECIPIENT.md). This does not launch a coin or make a balance appear in a wallet.

## The Doodleverse Coin update

**0.3b removes the required Tailscale runtime** and introduces signed, encrypted WebRTC pairing. Exchange an invitation and answer, compare the spirographs, and confirm on both sides. No outside relay is configured automatically. Direct reachability depends on the networks involved; worldwide discovery and relaying remain development work.

**Founder archive:** the original 1,000,000-DVC proposal, GPU proof and wallet recipient certificate remain available under the collapsed founder section. Those historical records do not mint coins. Native DVC uses the separate fixed genesis and supply rules described above.

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

Download a complete desktop or Pi asset from [Releases](https://github.com/moswald14/doodletick/releases). Desktop requires Node.js 22 or newer. Extract the desktop ZIP, run `node server.mjs` inside `doodletick-keeper`, and open **http://127.0.0.1:4317**. No npm dependencies are required to run the app. For a source checkout, run it from `keeper/`.

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
