# Doodle Tick Keeper 0.13b

**0.13b adds a Pepecoin-derived Scrypt blockchain, encrypted native wallet and address-only GPU miner.** Open **Doodleverse Coin** and check the connected network. Create or restore a native wallet under **Your wallet · Receive & send**, save its encrypted backup and password, then mine using its public receiving address. The signing key stays in this browser; the creator vault and Keeper server backups do not replace the native-wallet backup.

Press **MINE NOW** to start. **Keep mining** submits found blocks and requests fresh work; Stop or hiding the page ends GPU work. Eco and Balanced change intensity, while Scrypt 1024/1/1 is fixed by the chain. Hardware WebGPU is required and no CPU miner starts as a fallback. Payments require an unlocked wallet, explicit recipient/amount/fee/change review and **Sign and send this payment**. Mined rewards need **30 confirmations**; pending payments need another block before confirmation.

The native maximum is **21,000,000 DVC**, with **1,000,000 for the publicly recorded founder recipient** and **20,000,000 mineable**. The first mined block includes the founder allocation plus the normal 50 DVC miner subsidy; the public certificate alone does not issue coins. Native addresses are separate from Ethereum/Coinbase `0x` addresses, PEPE, Pepecoin, the legacy DVC ledger and private garden balances. No conversion, guaranteed value or earnings is provided. Read [the native chain rules](../doodleverse-core/README.md).

For the complete Windows node and GPU miner, extract the portable Windows release and run **Start-Doodleverse.cmd**; see [its guide](../doodleverse-core/windows/README.md). Home Assistant bundles its own wallet-disabled Core node. The general Keeper desktop ZIP and Pi support bundle require a separately configured matching Core node for native mining and payments. The browser does the GPU work; the node validates blocks and keeps chain data.

Disposable Core tests have covered GPU acceptance, wallet payments, encrypted-backup restoration and chain reorganizations. These checks do not establish a live distributed launch or a security audit. Existing creator identities, signed legacy records, garden ledgers and creative work are preserved.

**0.12b brought MozCorp’s cloud savepoints, fictional HOPE-LON feed and upgrade desk into Keeper.** Open **MozCorp → Keeper cloud** or **Upgrade desk**. Shared records live with this Keeper and survive restarts. AI drafts are optional and use a server-side key with explicit instruction-only consent. See [the MozCorp guide](MOZCORP.md).

Open **Shelf Defense** for the original tower-defense game, or **Idle shelves** for a shared Keeper cookie bakery. Battles save in this browser; idle progress saves with Keeper. Both use fictional game currency separate from DVC and garden coins. See [Shelf Defense](SHELF-DEFENSE.md).

Doodle Tick is an experimental creator vault, social arcade, file library and shared mushroom garden. Spirographs help people compare signed creator keys when pairing. Your writing and files remain in your browser; Keepers provide signed receipts, a local directory and a shared garden scorekeeper.

The 0.10b update also adds **Phrase lab** with a resumable one-to-eight-word search, Friendly mode, a dictionary-backed pile, and a queue of signed Keeper notes. Open **Start Phrase Lab.cmd** to start the desktop build. See [Phrase lab](PHRASE-LAB.md) for limits and [dictionary credits](PHRASE-SOURCES.md).

Open **MozCorp** to install your matching private station bundle and connect its machine or Bug World to the shared Studio shelf. Other desks keep their own exports; cloud services remain on the private original site. See [MozCorp rooms](MOZCORP.md).

The earlier 0.9.3b update connects **Telephone World**, **Dot Studio** and Keeper. Save a narrative session, attach an editable Studio soundtrack, then copy its text to an encrypted vault draft or open a fictional map in the workshop. The shared creative shelf and `.telephone.json` exports are unencrypted, separate from the vault. See [Telephone World](TELEPHONE-WORLD.md).

The 0.8b source update adds a **Jazz room** with an original local piano, bass and drum trio. Open the sidebar link and press **Play jazz**; no vault, wallet or streaming account is required. It opens in the same tab, and **Back to Keeper** leaves the player and stops its audio. See [the jazz guide](JAZZ.md) for background listening, controls and saved preferences. See [VALIDATION.md](VALIDATION.md) for source checks and limits, and the published release for downloads.

The 0.7b update adds a **Sleep garden** for locally synthesized wind and mushroom voices, plus signed Keeper clock synchronization. See [time and Sleep garden](TIME-AND-SLEEP.md) for controls, source trust and interruption limits. Existing vault, garden and native-chain formats remain unchanged.

### Legacy DVC history

The following 0.6.x notes describe the preserved **Legacy DVC history** page. Its `0x` addresses, SHA algorithms and signed formats do not apply to the current native Scrypt chain, and its balances are not converted.

The 0.6.2b update makes mining work with a **Mining reward address** alone. Enter a full nonzero `0x` address, choose settings and press **MINE NOW**; no wallet connection or signing prompt is needed. **Mining address balances** belongs to that destination and is separate from **Wallet for sending**. The optional **Use connected wallet address** button copies a connected account; connecting fills only an empty mining field. Changing the destination stops unfinished work and repeat mode. Sending still requires a wallet signature. Supply, consensus and saved formats are unchanged. See [validation](VALIDATION.md) for checked behavior and limits.

The 0.6.1b update adds **Nightcap**, a SHA-256/Eco mushroom preset with opt-in **Keep mining** and automatic collection of accepted blocks. Press MINE NOW to start; keep the page visible and computer awake. **GITTIT::GODDIT** adds command input, output and error messages: type `help`, `status`, `balance`, `mine`, `stop` or `repeat off`. See [the command guide](NATIVE-DVC.md#gittitgoddit-console).

The 0.6b update added the earlier independent DVC ledger, mining and signed payments, now accessible through **Legacy DVC history**. Read [NATIVE-DVC.md](NATIVE-DVC.md) for that ledger's fixed 21-million supply, disclosed founder allocation, mining maturity and experimental network limits. Existing vaults, garden coins and founder certificates retain their formats. See [validation](VALIDATION.md) for evidence.

## Start

Install [Node.js](https://nodejs.org/) 24 or newer, extract the complete Keeper desktop release, and run this command from the Keeper folder:

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

## Jazz room

Open **Jazz room** in the sidebar, then press **Play jazz**. **Velvet swing**, **Blue hour** and **Bossa garden** provide swing, twelve-bar blues and bossa settings. The synthesized trio keeps composing new phrases and accompaniment; it does not stream recordings.

Use Pause/Resume, Stop, New set, master and instrument levels, mute, tempo, swing, room reverb and dim mode. Preferences stay in this browser outside the vault, while opening or reloading always waits for Play. Jazz can continue with another window in front while the jazz page remains open and your device stays awake. **Back to Keeper**, closing the page, device sleep or a browser interruption can stop it. The Keeper server does not supply unattended audio playback on Home Assistant hardware. Read [JAZZ.md](JAZZ.md).

## Sleep garden

Open **Sleep garden** and press **Start sleep sounds**. The three starter mushrooms are ready without a vault. **Use my saved mushrooms** reads recipes from your joined Keeper garden after you unlock; **Open a Dot Wave recipe** loads a local recipe for listening. Neither action plants a generator, changes its saved recipe or earns coins.

The bedtime preset uses 15% listening volume, soft wind, strong static reduction and gentle blips and pops. **Fade out after** defaults to eight hours; the final minute fades before playback stops. Volume can change while listening. Changing the mix, source or duration stops it until you press Start again. **Dim garden** reduces the visible controls; **Stop sounds** ends playback.

Sound can continue across app views and in a hidden tab while the page and device remain active. Vault locking clears owned recipe references and selects the starter collection for next time; already-rendered audio may finish without any identity or key. A mix still preparing when the vault locks is canceled. Leaving the page or a browser audio interruption stops the sound and requires another Start. Device sleep, browser suspension and overnight playback are not guaranteed. Preferences are stored locally outside the encrypted vault; playback never resumes automatically. See [the full guide](TIME-AND-SLEEP.md).

## Weather and music

Open **Weather & music** below the top bar from any app view. Weather is off until you search for a city and select a result. **Degrees** switches C/F, **Change city** replaces the choice, **Refresh weather** requests a new report, and **Clear location** removes the saved city and forecast. Current conditions, feels-like temperature, wind and three forecast days are shown with fetch/model times; stale reports stay labeled when a refresh fails.

Search sends your city query directly to Open-Meteo. Selecting a result sends its coordinates for forecasts and saves the city, units and latest report in this browser, outside the encrypted vault. There is no automatic geolocation. Weather refreshes about every 30 minutes while the panel is open and the tab is visible; closing/hiding it stops pending requests and scheduled refreshes. Clearing the saved location turns weather off. Storage failures are shown rather than silently promising persistence or deletion.

Keep [Open-Meteo](https://open-meteo.com/) and GeoNames attribution beside the weather. API data use [CC BY 4.0](https://open-meteo.com/en/licence), distinct from the application's GPL license. The included free endpoint is for personal, non-commercial use; commercial deployment needs a separate compliant service plan/integration before enabling it. See [provider terms](https://open-meteo.com/en/terms). This is forecast data, not a local sensor or emergency-alert service.

**Play music** starts original local synthesis: Phone cord, Mushroom grove or Afterglow. Use Pause, Mute and volume as needed. Music continues between Doodle Tick views and when this panel is collapsed, pauses when the tab is hidden, and releases its audio resources on page exit. It never autoplays or automatically resumes. Sound preferences are saved locally; no music is streamed and no third-party recording rights, subscription or health benefit is supplied.

## Historical founder recipient certificates

The **Legacy DVC history** page preserves the original signed founder proof and its Ethereum wallet recipient record. The historical flow connects a compatible browser extension, reviews the exact account and chain, signs the fixed recipient message, then explicitly starts fresh GPU proof. No payment or token approval is requested. See [WALLET-RECIPIENT.md](WALLET-RECIPIENT.md). These archived certificates do not mint coins and are separate from the native 0.13b founder enrollment. The earlier ledger is documented in [NATIVE-DVC.md](NATIVE-DVC.md).

If the wallet connects but cannot read the required blocks, expand **Blockchain read service** and explicitly choose **PublicNode · Ethereum only**. This optional chain-1 service receives the connecting IP, public wallet address and exact block queries; smart-account verification also sends the public digest/signature. The wallet still supplies the account/network and signs. Wallet reads are the default, the choice is page-only, and there are no on-load calls or automatic fallback. Exact-block checks remain enforced; unsupported chains or missing state fail without verification. Error details show a safe method and numeric code, not raw provider payloads. No funds, fees, transaction permissions or data-format migration are required; existing vaults and v1/v2 records remain intact.

## Direct connections

Games and files use native encrypted WebRTC between browsers. Exchange a signed invitation and answer, then compare both spirographs and every code group before confirming. Use HTTPS or localhost. This release has no bundled VPN, STUN/TURN server or Internet relay; the browsers need direct reachability, often on the same local network. Read [the connection guide](PRIVATE-NETWORK.md) before inviting people.

The standalone browser service stays on loopback; Home Assistant uses authenticated ingress. No remote HTTP peer listener is started. Short directory codes and private garden trading work only for users of this same Keeper. Full signed invitations pair browsers across separate Keepers when directly reachable. Existing remote garden balances do not migrate with the connection change.

Keep the game host or unlocked file holder's page open. Outages and restarts require fresh invitations; there is no automatic host migration or resumable peer transfer. Older VPN invitation codes must be recreated in 0.3b. Saved keys, signed records and garden ledgers retain their formats, and earlier Home Assistant VPN state remains inert for rollback.

## Color clock and appearance

The UTC clock visits every one of the 16,777,216 RGB colors once per full pass, beginning red and ending green. One color per hour takes about 1,914 years; subsequent passes change order. The wheel displays 24 hours. The epoch is November 11, 2026, 00:00 UTC. The galaxy countdown is poetic, not an astronomical forecast or a secret key.

The clock status reports signed Keeper synchronization, uncertainty and stale samples. **Sync time** checks it again. Before verification the display uses device time; a stale display estimate is not accepted as garden-request time. Fresh signed requests use the Keeper estimate, and the color wheel advances with elapsed time between checks. The Keeper operator can still have an inaccurate clock. This does not set the device clock, alter recorded hours or establish distributed time consensus. See [time synchronization](TIME-AND-SLEEP.md#keeper-time).

Tetrachroma adds a custom focusable-black channel, `tetrachroma:#RRGGBBTT`. `00` preserves the RGB color and `FF` previews full black. This is a display adjustment, not a fourth physical primary or an authentication feature. Eight-digit CSS hex instead uses its fourth pair for transparency; do not treat these formats as interchangeable.

The automatic theme uses muted red and dark backgrounds from **9 PM to 7 AM** in the device's time zone. After synchronization it uses projected Keeper time; before verification it uses device time. Adjust the hours in Appearance or restore Automatic after a manual Daylight/Red night choice. Your chosen hours and time zone are preserved. Appearance does not change signed colors or saved records.

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
