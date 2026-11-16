# Native Doodleverse Coin · 0.6.2b

DVC is an independent experimental proof-of-work coin. It uses its own history,
balances, signatures and peer validation. It is not Bitcoin-compatible and is
not an Ethereum or Base token. Mining pays the public reward address you enter.
A browser wallet is needed to sign payments, but is optional for mining.
Doodle Tick displays the native balances.

The 0.6.2b address-only mining update does not change supply, consensus, signed
formats or saved chain data. See [validation](VALIDATION.md) for checked behavior
and deployment limits.

## Mine, pay and receive

1. Open the Keeper through HTTPS, or the desktop localhost address, and select
   **Doodleverse Coin**. Enter the complete address in **Mining reward address**.
   It must be a nonzero `0x` address; mixed-case addresses must pass checksum
   validation. Mining needs no wallet connection or signing prompt. Check the
   destination carefully: spending its rewards later requires its signing key
   through a supported wallet.
2. Choose **SHA-256** or **SHA-256d**, then Eco, Balanced or Fast GPU intensity.
   Press the red **MINE NOW** button. Each round searches for one block, bounded
   by 60 seconds and 4,194,304 candidates. **Keep mining** repeats rounds while
   this page remains visible. The toggle starts off; turning it on alone does
   not start work. Stop, turning it off, hiding the page, changing the mining
   address or connected wallet account, or leaving the view cancels unfinished
   work and resets the toggle. There is
   no saved mining-on setting or automatic resume after reopening.
3. A successful proof is submitted to this Keeper. The node verifies it and
   saves it before reporting acceptance. Initially a block earns **50 DVC** plus
   included transfer fees. A reward in block 1 first becomes spendable in block
   7. **Mining address balances** shows the destination's available funds,
   immature rewards and pending outgoing payments, separately from the sending
   wallet. A competing chain can replace those blocks and their balances.
4. To pay another person, use **Wallet for sending** to find and connect the
   wallet that controls the funds. If Home Assistant's embedded view hides the
   extension, use **Open Doodle Tick in a wallet window**. Enter the recipient's
   complete address and amount. Review the native network, recipient, amount,
   fee, nonce and expiry. Check the review box,
   then choose **Sign & submit DVC transfer** and approve the wallet message.
   Signing this message authorizes that DVC payment. It is not a harmless login
   message, an Ethereum transaction or a token allowance.
5. Share your receiving address or the generated payment request with a payer.
   The payment-request controls use the connected wallet's receiving address.
   A payment remains pending until a miner includes it. Account activity shows
   pending payments, block inclusion and immature rewards. Direct transfers
   support payments between players; there is no built-in exchange, order book,
   automatic trade settlement, bridge or cash redemption.

**Use connected wallet address** optionally copies a connected account into the
mining field. Connecting a wallet prefills only an empty field and does not
replace an existing destination. The mining destination and spending account
may be different. Changing the mining address cancels unfinished work and turns
Keep mining off; press MINE NOW again only after checking the new address.

Browser WebGPU support and a hardware adapter are required. Both algorithms run
real SHA-256 compression; SHA-256d hashes the first digest again. The miner checks
known vectors, nonce carries and full 256-bit target boundaries on the GPU, then
independently rehashes a found candidate using Web Crypto. Software fallback is
disabled in this miner. Consensus verifies work, not which hardware did it:
other implementations may use CPUs, GPUs or specialized devices.

## Nightcap mushroom and auto catcher

**Use Nightcap preset** selects SHA-256, Eco intensity and Keep mining. It uses
the existing Dot Wave mushroom artwork with a deterministic variation for the
mining reward address. Press MINE NOW to start it. SHA-256 has been observed
working on the maintainer's GTX 1080 in Chrome; this is a verified compatibility
choice, not a claim that it is the fastest or most profitable algorithm.

The auto catcher submits a candidate only after independent digest verification.
It counts a block only after the node confirms that exact block on its current
chain, then refreshes balances before another round. Rewards are recorded in the
mining destination and mature after six further blocks. The session counter resets
when that address changes or the page closes; saved chain balances do not. A
later competing chain may replace accepted blocks. The mushroom adds no extra
issuance and does not plant or change a private garden generator.

For an overnight session, leave the Coin page visible and the computer awake.
The loop stops on GPU or node errors. Every new round validates fresh node,
mining-address balance and job data and has the same limits.
No overnight stability, earnings or unattended availability is guaranteed.

## GITTIT::GODDIT console

The Coin page includes a command input and a labeled INPUT / OUTPUT / ERROR log.
Press Enter or Run to submit one command. Commands are case-insensitive.

| Command | Result |
| --- | --- |
| `help` | Show the command list. |
| `status` | Show the latest loaded node, mining destination and mining state. |
| `balance` | Show the mining destination's latest loaded available funds, immature rewards and pending outgoing payments. |
| `refresh` | Load the node and selected address balances again. |
| `wallets` | Discover browser wallets; select one in the Wallet extension menu. |
| `connect` | Request connection to the selected wallet for signing payments or optionally using its address. |
| `algorithm sha256` or `algorithm sha256d` | Choose the same algorithm offered by the mining menu. |
| `intensity eco`, `intensity balanced` or `intensity fast` | Choose GPU intensity. |
| `mine` | Start for the entered mining reward address with the selected algorithm and intensity; repeat if Keep mining is on. No wallet connection is required. |
| `repeat on` or `repeat off` | Select repeat mode or stop it. Turning it on alone does not start mining. |
| `stop` | Cancel the current local action. Already submitted records may still confirm. |
| `clear` | Clear the console transcript. This does not stop mining. |

Each mining round keeps the 60-second and candidate limits, explicit start, hardware GPU
requirement and independent result validation. Stop remains available while a
command is running; commands are never queued or replayed after cancellation.
Hiding the page or changing the mining destination or connected wallet account
cancels unfinished mining. Sending coins
still requires the separate transfer review and wallet signature controls.

Set the destination in the **Mining reward address** field. There is no console
address command.

The console accepts only these app commands. It has no operating-system shell,
JavaScript evaluator, arbitrary URL fetch or wallet signing command. Unknown
input is discarded without echoing it. Output is kept in memory, capped at 100
entries / 24 KiB, and removed when the page closes. Do not enter passwords,
recovery phrases or private keys. Public account details can appear in `balance`.
Known GPU errors include recovery guidance; arbitrary driver/provider exception
details are not copied into the console. Progress is sampled to keep it readable.

If no WebGPU adapter is available, keep the Keeper on HTTPS, check that browser
graphics acceleration is enabled, and restart the browser after an update or
GPU-process failure. [Chrome's troubleshooting guide](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
describes these checks. This message does not indicate that a CPU miner started.

## Fixed genesis and supply

| Parameter | Native network rule |
| --- | --- |
| Name | `doodleverse-native-1` |
| Genesis / network ID | `5f3f6181930d257de5542f65a53520123db9520fa7577a5868f0a811879a19e5` |
| Genesis time | 2026-11-16 08:00:00 UTC |
| Maximum supply | 21,000,000 DVC |
| Founder allocation | 1,000,000 DVC, immediately spendable by its signing account |
| Founder address | `0x41ed762a78bf3bb6007770bda259d40bbeca2d93` |
| Mining reserve | 20,000,000 DVC |
| Precision | 8 decimal places; 100,000,000 atoms per DVC |
| Initial subsidy | 50 DVC; halves every 210,000 blocks; truncated at the remaining reserve |
| Minimum transfer fee | 0.00001000 DVC (1,000 atoms), paid to the block miner |
| Reward maturity | 6 further blocks, including the miner's fees |
| Target interval | 60 seconds; an adjustment target, not a scheduling guarantee |
| Retarget | Every 32 blocks, using median-time windows; each change clamped to 1/4–4 times |
| Base target | Initially `2^236 - 1`; maximum `2^240 - 1` |
| Block limits | 64 transfers and 65,536 canonical JSON bytes |
| Timestamp | Above the median of the preceding 11 timestamps; no more than 120 seconds ahead of the validating node's clock |
| Transfer expiry | At most 1,440 blocks ahead of inclusion; the UI initially uses current height + 144 |

The genesis hash covers the manifest and consensus rules. Both the UI and node
pin it. Different rules require a different network; changing an operator option
cannot mint extra founder coins or increase production supply. Fees move existing
atoms and do not create issuance. There is no administrative mint endpoint.

The manifest references the [original public founder evidence](../founder-records/0.5.1b/README.md).
Those records retain their original signatures, timestamps and prelaunch meaning.
They are not redeemable mint instructions. Garden Doodle Coins and public DGT
remain separate; none is automatically converted into native DVC.

## Work, signatures and competing histories

The work prefix is SHA-256 of the canonical header (including network, parent,
height, timestamp, miner, algorithm, base target and transfer-list root). The
candidate is that 32-byte prefix followed by the 32-byte big-endian nonce.
SHA-256 compares its digest with the base target; SHA-256d compares its second
digest with `floor((baseTarget + 1) * 3 / 2) - 1`. Both contribute
`floor(2^256 / (baseTarget + 1))` work. The 3/2 factor accounts for the three
versus two SHA-256 compression operations; it does not guarantee equal speed,
profitability or hardware fairness. The work digest is the block identifier.

Transfers use recoverable EOA signatures and the [EIP-712 typed-message format](https://eips.ethereum.org/EIPS/eip-712).
The domain is **Doodleverse Native Coin**, version **1**, with the genesis hash as
its salt and no Ethereum chain ID. The signed message binds native network ID,
sender, recipient, amount in atoms, fee in atoms, account nonce and expiry height.
The node rejects bad signatures, noncanonical shapes, reused or skipped nonces,
expired messages and overspending. Smart-account, delegated and contract-wallet
signatures are unsupported. The wallet adapter never sends an Ethereum payment
or requests an allowance or network switch.

Each node replays and validates the history it adopts. A chain replaces the
current chain only when it has strictly more verified cumulative work; equal
work retains the current tip. Valid orphaned payments may return to the mempool.
The approach follows the [cumulative-work principle](https://developer.bitcoin.org/devguide/block_chain.html),
but this new network does not inherit Bitcoin's mining power or security.
Confirmations and reward maturity are not irreversible finality. A small network
can be cheaply reorganized; no established economic value or liquidity is claimed.

## Connect nodes

Under **Connect another Doodleverse node**, create an invitation or accept a
friend's code. Unlock the creator vault to sign the connection, exchange the
answer and compare every group of the spirograph code over a trusted channel.
The encrypted WebRTC link carries public native-chain history and pending
transfers. Each browser submits received material to its own validating Keeper.
Peer input cannot call arbitrary URLs, alter node configuration, access the
vault or invoke Home Assistant administrative APIs.

The current UI pairs one other browser at a time. Both Coin pages must remain
open and visible; leaving, hiding, locking the creator vault or Disconnect closes
the link. The Keeper itself remains running and retains its chain. No Tailscale,
public node listener, router port, automatic seed discovery, STUN or TURN relay is
installed. A direct reachable route, such as the same LAN, is required. Home
Assistant Cloud HTTPS provides access to a Keeper; it does not provide a public
peer relay. Wider Internet routing and persistent operator-managed peers remain
future network work.

An isolated miner builds a local branch. Its coins and payments become known to
other Keepers only when history is exchanged and accepted. The UI labels this
state; connecting two browsers to the same Keeper does not create two independent
validators. Peer availability and agreement should be checked before accepting
a payment. This release does not claim a deployed worldwide mining network.

## Saved history and operator limits

The node stores `dvc/dvc-chain.jsonl` under the Keeper data directory. Home
Assistant stores it inside `/data/keeper`, covered by stopped-app backups. The
new directory does not migrate, replace or read the creator vault, witness key,
receipt ledger or garden balances. Keep a full cold backup before upgrading.

Accepted mutations are serialized, appended and fsynced before their in-memory
result becomes visible. Restart independently revalidates all committed history.
An incomplete final write is truncated to the last complete commit; a malformed
complete record fails closed. Storage errors keep the last committed state and
stop further mutations until recovery. Never delete the journal to conceal a
failure. Restoring an older copy rolls this node back; reconnect to independently
verified peers before relying on restored balances.

Default resource limits are 64 queued mutations, 64 pending transfers, 8 retained
side-branch tips, 256 divergent side blocks, 1,000,000 canonical blocks and a
512 MiB journal. A history response contains at most 8 blocks; each sync round
pulls at most 4 pages and rotates through up to 8 pending transfers. HTTP bodies
are bounded to 512 KiB. Capacity exhaustion returns an explicit error rather
than discarding canonical history or trusting unverified work. These are early
node implementation limits, not a promise of unbounded storage or deep-fork sync.
Recent account activity scans up to the latest 4,096 blocks and reports when
limited. Archive compaction and scalable historical indexes are not implemented.

The library's explicitly named `doodleverse-regtest-*` networks are disposable
test networks with different genesis hashes. Their easier proofs and balances
cannot be imported into the fixed native production network.

See [VALIDATION.md](VALIDATION.md) for test evidence and unresolved live-browser,
wallet, Home Assistant and multi-device checks.
