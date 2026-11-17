# Doodleverse Core — native Scrypt DVC · 0.13b

This is Doodleverse's separate Pepecoin-derived blockchain, with real full nodes,
wallets, Scrypt proof of work and native transfers. The 0.13b source enables the
main network with a verified, publicly pinned founder recipient. Final binaries,
packages and deployment still require the checks in [VALIDATION.md](VALIDATION.md).
Source readiness is not a live launch or proof of a distributed network. Test
coins have no monetary value; no network promises earnings or redemption.

The upstream is [Pepecoin Core v1.1.0](https://github.com/pepecoinppc/pepecoin/tree/4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8),
pinned to a full commit and changed by the reviewable
[`doodleverse.patch`](patches/doodleverse.patch). All original MIT notices remain;
new Doodleverse changes and integration are GPL-3.0-only, with the complete license
in the repository's `LICENSE`. The build includes complete corresponding source.
See [validation evidence](VALIDATION.md) for the exact tested packages and limits.

## What changed

| Rule | Doodleverse |
| --- | --- |
| Proof of work | Scrypt, N=1024, r=1, p=1 |
| Coin | DVC, 8 decimal places |
| Maximum issuance | 21,000,000 DVC |
| Founder allocation | Exactly 1,000,000 at block 1, to a fixed script |
| Mining allowance | At most 20,000,000 total |
| First miner subsidy | 50 DVC per block, including block 1, halved every 210,000 blocks |
| End of subsidy | Partial final epoch ends at height 940,000; fees only afterward |
| Block target | 60 seconds; DigiShield adjusts work |
| Coinbase maturity | 30 confirmations |
| Merged mining | Disabled; no inherited Pepecoin/Dogecoin/Litecoin hashrate |
| Addresses | New native Base58Check addresses, distinct for each network |

Unused miner allowance is burned when a miner underclaims it. Fees move existing
coins, so they do not expand the supply. All three genesis blocks contain zero
value and an unspendable output. The public test networks use a publicly known
founder fixture. It is never a production owner or recovery key.

[`chain-manifest.json`](chain-manifest.json) records the network identifiers,
genesis headers and proofs, ports, reward policy and address prefixes. The main
founder recipient is **`DrMNk6EFRQ8zbLS8MAktyt2PwxyYThW1tp`**, authorized by the
verified [public enrollment record](founder-recipient.json). Block 1 must include
its 1,000,000 DVC allocation and may also pay the normal 50 DVC miner subsidy.
The same address may receive both as separate outputs. The record is public
authorization evidence; it contains no private key and does not itself issue coins.
The founder pin is a consensus source parameter, not a runtime wallet setting.

Earlier development binaries blocked mainnet startup and used a different patch.
That history is retained in [validation](VALIDATION.md); do not use an earlier
artifact as evidence that the final 0.13b binary has passed its release checks.

## Run a node and browser miner

For Windows, use the complete [portable GPU miner](windows/README.md): extract it
and run **Start-Doodleverse.cmd**. It includes Core, Keeper and Node.js and opens
`http://127.0.0.1:4329/scrypt.html`. Home Assistant uses its bundled wallet-disabled
node through authenticated HTTPS ingress; see [the app guide](../doodletick/DOCS.md).
Neither package starts mining automatically. Native wallet keys stay in the browser.

For a developer-managed node, get a matching tested artifact from the
**Build experimental Doodleverse Core** workflow, or follow [the build guide](README-build.md). Verify `SHA256SUMS` and
retain the package's source and manifest. Executable names are still `pepecoind`
and `pepecoin-cli`; their network identity and data directory are Doodleverse.
Never point this fork at a Pepecoin, Dogecoin or existing DVC data directory.

For a disposable Linux test node, in the extracted package:

```sh
mkdir -p "$PWD/test-node"
./bin/pepecoind -regtest -datadir="$PWD/test-node" -server=1 -daemon \
  -listen=1 -bind=127.0.0.1 -rpcbind=127.0.0.1 -rpcallowip=127.0.0.1 \
  -dnsseed=0 -discover=0 -upnp=0 -txindex=1
./bin/pepecoin-cli -regtest -datadir="$PWD/test-node" getnewaddress miner
```

The last command prints a **test receiving address** owned by that disposable
Core wallet, not a browser-wallet backup. Alternatively create a browser wallet
once Keeper is running. Start Keeper with Node.js 24 or newer and these local
node settings:

```sh
export DVC_CORE_NETWORK=regtest
export DVC_CORE_RPC_URL=http://127.0.0.1:18473
export DVC_CORE_RPC_COOKIE=/absolute/path/to/test-node/regtest/.cookie
export DOODLETICK_DATA=/absolute/path/to/separate-test-keeper
node keeper/server.mjs
```

On Windows, [`scripts/start-local.ps1`](scripts/start-local.ps1) starts the node and
Keeper using explicit binary, source and disposable data folders. It binds both
services to this computer and stops its node when the Keeper exits. It does not
open firewall/router ports, import keys, start mining, or change browser settings.

Open `http://127.0.0.1:4317/scrypt.html`, paste the test receiving address, run
**Check GPU**, then press **MINE NOW**. The address alone is sufficient for mining.
**Keep mining** requests fresh work and submits found blocks until stopped. Work
pauses when the tab is hidden. Eco and Balanced select 64 or 128 nonce batches;
the consensus algorithm remains Scrypt. There is no hidden CPU search fallback.

The **GITTIT::GODDIT** command box accepts `help`, `status`, `check node`,
`check gpu`, `mine`, `stop`, `keep on`, `keep off`, `intensity eco`,
`intensity balanced` and `clear`. Press Enter or Run to submit a command.
`keep on` arms repeat mode; it starts only on `mine` or MINE NOW. Use the separate
receiving-address field for the payout destination. No shell, key-import or
arbitrary node command is exposed.

Every GPU session checks fixed Scrypt vectors and full-target comparison before
searching. The browser independently verifies a candidate, the bridge verifies it
again, and Core decides whether the complete block is valid. Only a confirmed
active-chain block is reported as accepted. After a reorganization a previously
accepted block can become orphaned. Balances follow the node's validated active
chain, and rewards need 30 confirmations before spending.

## Native browser wallet and payments

Open **Your wallet · Receive & send** from the miner. Create a native wallet with
a password of at least 12 characters, then save its encrypted backup and password.
Restore that backup deliberately when changing browser, profile or site address.
Creator-vault backups, Home Assistant backups and a public receiving address do
not replace it. Mining needs only the native address and works while the wallet
is locked. Coinbase Wallet cannot sign this chain's UTXO transactions.

To spend matured coins, unlock the native wallet, enter a same-network recipient
and amount, and choose **Review payment**. Check the recipient, network, amount,
fee and returned change before **Sign and send this payment**. The minimum payment
is 0.01 DVC. The client verifies complete previous transaction values and signs
locally; only the signed transaction is sent to Keeper/Core. No password or private
key goes to the node. A submitted transaction can remain pending until mined, and
one node's acceptance does not establish final settlement.

The wallet locks on page hiding or five minutes without activity. Keep its
encrypted backup separately. The Home Assistant and portable Windows nodes have
their Core wallet disabled; they validate and relay transactions without holding
browser spending keys.

### Optional developer Core-wallet test

Use the Core wallet that owns your receiving address to spend matured test coins.
For example, after creating a second node wallet address:

```sh
./bin/pepecoin-cli -regtest -datadir="$PWD/test-node" getbalance
./bin/pepecoin-cli -regtest -datadir="$PWD/test-node" sendtoaddress SECOND_TEST_ADDRESS 1
./bin/pepecoin-cli -regtest -datadir="$PWD/test-node" gettransaction TRANSACTION_ID
```

`sendtoaddress` spends coins; substitute the intended recipient and amount and
submit it yourself. The browser mining bridge never exposes wallet-spending,
private-key-export or arbitrary RPC commands. Never paste a recovery phrase or
private key into the mining page. These CLI examples apply only to a deliberately
wallet-enabled disposable developer node, not the wallet-disabled packaged services.

## Native peers

Nodes must use the same published genesis and founder pin. There are no inherited
Pepecoin seeds or automatically configured public relays. Configure reachable
peer IP:port entries explicitly. Mainnet P2P uses TCP 38474; the Home Assistant
host mapping is optional and off by default, and its RPC port is never published.
Home Assistant Cloud HTTPS reaches the app but does not relay Core P2P traffic.
The Windows launcher opens no incoming peer port or firewall rule. An isolated
node is not a distributed network; mainnet mining requires a connected peer.

Start a second regtest node with a different directory, P2P port and RPC port,
then use `addnode 127.0.0.1:SECOND_P2P_PORT onetry` to connect it. The automated
functional test runs this arrangement, mines valid Scrypt blocks, checks invalid
founder payouts and overpayment rejection, spends matured rewards, splits and
rejoins the peers, and restarts a node to check persistence.

## Compatibility and launch gates

The existing Keeper identity, vault, mushroom records and legacy SHA-256 DVC
ledger are preserved. They are separate histories, with no automatic conversion,
bridge or balance import. The published Ethereum founder certificate is
disclosure evidence; its address is not a native DVC receiving address. PEPE,
Pepecoin and Ethereum balances cannot be sent to this chain.

The native site wallet, public founder enrollment, portable Windows service and
bundled Home Assistant node are implemented. Final binaries for the current
patch, the Windows package and Home Assistant architecture images still require
their release checks. Record exact build/artifact identities, backed-up installation
and restart results, and independently operated peer synchronization before
claiming a distributed launch. See [the current checklist](VALIDATION.md).

Older Boost and Berkeley DB dependencies, consensus/networking behavior under
adversarial load and long-term operation remain review limitations. Source review
and targeted tests are not an independent security audit. No exchange listing,
market value, profitability or inherited network security is implied by this fork.
