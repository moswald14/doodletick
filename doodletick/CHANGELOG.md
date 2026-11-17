# 0.11b — Shelf Defense

Adds Shelf Defense to Keeper: the original three-shelf tower-defense game, five defenders and skill trees, bosses, and the editable waveform attack lab. Same-tab navigation returns to Keeper or opens the idle edition. Browser battle saves retain their format and reopen paused.

Adds Idle shelves: one shared cookie bakery stored by Keeper, with five helpers, three shelves, upgrades, achievements and Story Stars. Mutations are serialized and protected against duplicate retries. Production continues while Keeper runs; stopped-server catch-up is capped at 24 hours without replaying backward clock intervals. Unread saves remain available for recovery.

Game counters are separate from DVC, garden balances and creator vaults. Home Assistant uses its existing ingress and app data backup, with no new ports, permissions or helper integrations. The installed private MozCorp bundle and existing identity formats are preserved.

# 0.10b

Adds an isolated private MozCorp station room and a pinned local bundle installer. The private source is installed separately; existing vault, garden, coin and identity formats remain unchanged.

Adds module 14 Credits and module 15 Blooper Reel. Both save with the creative project, remain outside the story feedback loop and skip held sources. Older projects retain the hardwired story exit when reopened.

Adds Phrase lab: one-to-eight-word searches with repeats, saved checkpoints, a dictionary-backed candidate pile, Friendly mode, and a resumable queue that seals phrase batches using the unlocked Keeper. Work pauses when hidden or closed. Dictionary evidence is not a complete semantic test. Existing identities, drafts and signed formats are preserved.

Phrase posting now cancels if the vault session changes while preparing a batch. Telephone soundtrack generation also fits the last melody note into the song boundary, so affected text seeds generate, save and reopen normally without changing the writing.

# 0.9.3b — Telephone World, Studio and Jazz

Telephone World, Dot Wave Studio and Doodle Keeper share an explicit creative-project shelf. Keep source, protected master, story, character, poem, drawings and editable soundtrack together; review before copying into the encrypted vault or making a fictional map. Shared projects and portable exports are unencrypted and remain separate from vault keys and balances.

Doodle Jazz is included with smoother chord movement, call/repeat/answer phrases with rests, coordinated swing timing, and a straight bossa feel. All sound renders locally and waits for Play.

The release also fixes partial imports after invalid drawing data, edits made during slow saves or loads, and Stop during soundtrack preparation. Existing Keeper identities, signed formats and DVC rules are unchanged. Use a Home Assistant backup before updating and export browser projects separately. See VALIDATION.md for the tested scope and limitations.

# 0.9.1b

Telephone playback Stop now cancels pending project reads and rendering immediately. The integrated Studio includes all 49 recovered sounds. Local integration edition; live installation is coordinated separately.

# 0.9b — Telephone World and Dot Studio

Local integration source cut; no release publication or live installation is implied. See the integration report for actual verification evidence.

- Add Telephone World 2 and Studio 2.3 as same-origin Keeper pages under authenticated ingress; retain the pending Jazz room integration.
- Share narrative sessions and editable soundtrack projects within the current browser origin. Offer portable `.telephone.json` export/import for other browsers, devices or addresses.
- Keep original input and protected master separate from machine outputs. Offer reviewed vault drafts and fictional map drafts through existing Keeper workflows.
- Keep the shared shelf and project exports unencrypted, separate from the encrypted vault. Preserve existing identity, signatures, balances, mining and chain rules.
- Keep audio opt-in, news fetching explicit and Home Assistant request protection intact. See [the Telephone World guide](../keeper/TELEPHONE-WORLD.md).

# 0.8b — Doodle Jazz room

Source checks and browser observations are recorded in [the validation report](../keeper/VALIDATION.md). Installation and release receipts are separate from this source-cut report.

- Add **Jazz room** to the Keeper sidebar. It opens the Doodle Jazz player in the same tab through authenticated ingress; **Back to Keeper** leaves the page and stops jazz audio.
- Add original local piano, plucked bass and percussion in swing, blues and bossa styles, with Play/Pause/Resume, Stop, New set and adjustable sound controls.
- Keep playback opt-in and save preferences locally outside the vault. No vault, wallet connection, microphone or streaming account is required.
- Allow background listening while the jazz page remains open and the device stays awake. Closing or leaving the page, browser suspension and device sleep can interrupt it. Sound plays on the listening browser's output device.
- Use external same-origin player and worklet assets without relaxing ingress authentication or its existing script policy. Preserve saved Keeper identities, garden accounting and native DVC rules.
- See [the jazz guide](../keeper/JAZZ.md) and [validation status](../keeper/VALIDATION.md).

# 0.7b — Sleep garden and Keeper time

0.7b is published. See the validation report for checked behavior and deployment limits.

- Add a Sleep garden with locally generated soft wind, combined Dot Wave mushroom voices, reduced static and adjustable arcade blips/pops. Listening-only starters work without a vault; saved garden recipes and local recipe files can be loaded explicitly.
- Start only on **Start sleep sounds**. Default to eight hours at 15% volume and schedule a final-minute fade and stop against the audio clock. Stop, mix/source changes, page exit and browser audio interruptions require a new Start.
- Allow intentional background listening. Vault autolock clears owned recipes for next play while already-rendered sound can finish without keys; it cancels an owned mix still preparing. Keep the page open and the computer awake.
- Add fresh nonce-bound Keeper time signatures, bounded round trips, uncertainty/stale status and elapsed-time clock projection. Small corrections adjust gradually; confirmed large corrections reanchor the display and may move it backward without replaying rewards. Automatic day/night appearance uses projected Keeper time with the existing time zone and chosen hours. Private garden requests require fresh time from their Keeper; no Internet UTC or distributed-consensus accuracy is claimed.
- Preserve creator identities, signed formats, private garden rewards, native DVC supply/consensus and existing saved data. Listening does not plant, harvest or mine.
- See [the guide](../keeper/TIME-AND-SLEEP.md) and [validation status](../keeper/VALIDATION.md).

# 0.6.2b — Mine to a reward address

- Add a validated Mining reward address so MINE NOW needs no wallet connection or signing prompt.
- Separate mining-destination balances and Nightcap's session counter from the wallet used for sending.
- Add optional Use connected wallet address; connection fills only an empty field. Editing the destination cancels unfinished work and repeat mode.
- Show the mining destination in console status and balance without adding an address command. Sending still requires a wallet signature.
- Preserve native supply/consensus, creator identities, signed records and saved chain data. No migration is added.
- See the validation report for address-only mining, spending isolation, browser checks and deployment limits.

# 0.6.1b — Nightcap and GITTIT::GODDIT

- Added command input with labeled output and errors to the native Coin page.
- Added help, status, balance, refresh, wallet discovery/connection, algorithm,
  intensity, repeat, mine, stop and clear commands using existing app controls.
- Added the Nightcap mushroom preset, opt-in Keep mining and an auto catcher
  that counts exact accepted blocks and refreshes immature rewards.
- Repeat mode stays in the foreground, starts only on MINE NOW or mine, and
  resets on Stop, off, hide, account changes or errors.
- Recorded sampled mining progress and known GPU recovery guidance, with bounded
  in-memory output, safe text rendering and no command replay after cancellation.
- Kept the native genesis, supply, signatures, saved identities and transfer
  review unchanged. This update does not start mining automatically.

# 0.6b — Native DVC mining and payments

- Add an independent native Doodleverse chain with a fixed 21-million cap: one million disclosed founder coins and 20 million mineable coins. The original founder certificates and existing garden balances are preserved separately.
- Add the red **MINE NOW** button, real SHA-256/SHA-256d GPU algorithms, three intensity settings, Stop and bounded work. Native rewards mature after six further blocks.
- Add wallet-controlled native signatures, exact payment review, sending, receiving, payment requests and account history. No Ethereum transaction or token allowance is used by native DVC.
- Persist and independently replay the chain; validate supply, proof, signatures, nonces, funds and competing-chain work. Add bounded manual peer sync over authenticated, encrypted browser pairing.
- Keep Home Assistant ingress authentication and loopback-only Keeper access. No new public ports, VPN, seed or relay is installed. Each connected node independently validates the public history.
- Early network limits: direct reachability and open browser Coin pages are required for pairing; no exchange, bridge, cash value or mature network security is claimed. See [native rules](../keeper/NATIVE-DVC.md) and [validation](../keeper/VALIDATION.md).

# 0.5.1b — Optional Ethereum read compatibility

This update is in preparation; publication and installation are pending.

- Add an explicitly selected PublicNode Ethereum chain-1 read service; the connected wallet keeps account/network checks and message signing.
- Default to wallet reads, with no saved service choice, on-load calls, automatic fallback or network switching. Disclose the public queries sent to the operator.
- Retain exact-block EIP-1898 verification and report safe method/numeric-code diagnostics without raw provider errors. Unsupported chains or missing state remain unverified.
- Preserve creator vaults, Keeper identity/data and v1/v2 records. No payment, spending permission, transaction, delegation or deployment is requested by this flow.
- Validation: all 287 app checks and repository checks passed. Chrome verified safe diagnostics/no fallback, explicit PublicNode reads, a disposable creator/mock-wallet proof with real GPU work, public-record verification and reload without automatic wallet activity. The live read-only Node probe also passed. Publication and deployment are pending; a complete live Coinbase recipient proof remains unresolved.

Earlier entries retain their source-cut status. The published 0.5b installation was later verified with the same Keeper witness, zero receipts and automatic-update setting preserved. See [validation](../keeper/VALIDATION.md).

# 0.5b — Weather and background music

- Add the global expandable Weather & music panel below the top bar.
- Add manual city search, saved/clearable location, C/F and a short Open-Meteo forecast with provider/license attribution. No automatic geolocation.
- Add three original local synthesized soundscapes with Play/Pause, Mute and volume. No autoplay; hiding pauses music and page exit releases audio resources.
- Preserve existing identities, garden data and signed proof formats.
- Validation: 263 combined checks passed, including all six new ingress assets. Chrome exercised sample-city weather, C/F/cache/clear, music controls without autoplay, view navigation and a 390-pixel red-night layout. Audible speaker output, actual Coinbase signing and the live 0.5b update remain unverified.

# 0.4b — Wallet-bound founder recipient

- Added a separate v2 recipient record that preserves the complete v1 founder proof and requires its original creator key plus the chosen wallet to sign. Fresh bounded GPU work commits both signatures.
- Added explicit injected-wallet discovery, account selection, recipient review and message signing. No payment, approval, network switch, delegation or deployment method is available in this flow.
- Ordinary wallet signatures verify offline; deployed ERC-1271 wallets need read-only verification against their declared chain and block. Unsupported wallet variants fail without granting a verified status.
- Preserved browser vaults, garden balances, Keeper state and v1 certificates. DVC remains prelaunch with zero spendable coins and no adopted issuance mechanism.
- Validation: 238 combined app checks and 10 offline EVM tests passed; the signature bundle reproduces. Chrome verified the full disposable-wallet flow with real WebGPU, public copy, reload and import. Actual Coinbase and live 0.4b installation remain deployment checks.

# 0.3b — Doodleverse direction, direct peers and GPU founder proof

- Removed the Tailscale runtime, peer HTTP bridge and Home Assistant tunnel/network privileges. Native WebRTC now carries signed game/file pairings with two-sided spirograph confirmation. No outside relay is configured; direct reachability remains network-dependent.
- Kept local garden/directory access and existing signed identities/ledgers. Room codes require the same Keeper. Old transient pairing codes must be recreated; remote garden data has not moved. Legacy VPN backup files remain inert for rollback.
- Added a separate Doodleverse Coin page for a disclosed, signed 1,000,000 DVC founder-allocation certificate, independent proof verification and bounded opt-in WebGPU work. It creates no spendable DVC balance or adopted genesis. Future network supply is unadopted.
- Added the public Doodleverse direction and invitation to human contributors, including communication, the proposed foundation and eventual food-day organizing goals.
- Validation: 182 combined app checks passed. Actual Chrome GPU proof, Stop and public proof copy/import checks passed; actual native signed peers delivered messages and a 65,537-byte licensed file on one computer. Physical multi-device/NAT and a live DVC chain remain untested/unimplemented respectively.

# 0.2b

- Clear HTTPS browser readiness and private VPN status, with setup and expired-session guidance.
- Private mushroom minting and opt-in bounded mining, plus a separate external-wallet public garden mode.
- Wallet-confirmed public deployment, registration, token minting, proof submission and transfer. No funds move without a player approving a transaction in their wallet.
- Verified offline migration into an empty repository app using its own read-only configuration folder. Existing state is never overwritten, and a restart never imports an old ledger again.
- Cold backups preserve consistent Keeper and VPN state. No public browser port or administrative Supervisor access is added.
- Updated release metadata, corresponding contract source and automated contract/browser-controller checks.

Use the same Home Assistant HTTPS address for continuing browser storage. Moving from HTTP to HTTPS still requires restoring the user's separate encrypted browser exports. See `MIGRATION.md` before replacing a local installation.

# 0.1b

Initial public baseline under the maintainer-designated version number.

- Complete hourly RGB sequence and 24-hour clock wheel, with Tetrachroma previews and automatic red night appearance.
- Encrypted creator vault, signed receipts, licensed peer files, private arcade and spirograph pairing.
- Dot Wave-compatible mushroom recipes, hourly in-app coins, transfers, decorations and atomic generator trades through one shared Keeper.
- Home Assistant ingress adaptation, private-network setup controls and persistent Keeper/VPN data.
- HTTP recipe previews with an explicit HTTPS requirement for signed operations; signature checks remain intact.
- Public installation, contributor and validation documentation. Earlier internal development numbers are not the public release sequence.

Updates and rebuilds of the same installed app retain its persistent data. A GitHub repository installation has a different app ID from an existing local app and does **not** automatically migrate its data. Keep the local app and private backup until a tested migration and rollback procedure is available.

The baseline was built and run on aarch64 Home Assistant. Physical multi-device VPN play, HTTPS garden transactions and full backup restore remain further acceptance work. See `DOCS.md` and the repository validation notes.
