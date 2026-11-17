# Doodleverse Core — Scrypt test network

This is Doodleverse's separate Pepecoin-derived blockchain, with real full nodes,
wallets, Scrypt proof of work and native transfers. It is under development. The
main network is deliberately disabled until a native founder address is chosen
and the release gates below are complete. Test coins have no monetary value.

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
| First miner subsidy | 50 DVC per block, halved every 210,000 blocks |
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
genesis headers and proofs, ports, reward policy and address prefixes. Mainnet
startup is blocked in the daemon before loading a wallet or opening listeners;
there is no command-line switch to override the missing founder destination.

## Run a node and browser miner

Get a matching tested artifact from the **Build experimental Doodleverse Core**
workflow, or follow [the build guide](README-build.md). Verify `SHA256SUMS` and
retain the package's source and manifest. Executable names are still `pepecoind`
and `pepecoin-cli`; their network identity and data directory are Doodleverse.
Never point this fork at a Pepecoin, Dogecoin or existing DVC data directory.

For a disposable Linux test node, in the extracted package:

```sh
mkdir -p "$PWD/test-node"
./bin/pepecoind -regtest -datadir="$PWD/test-node" -server=1 -daemon \
  -listen=1 -bind=127.0.0.1 -rpcbind=127.0.0.1 -rpcallowip=127.0.0.1 \
  -dnsseed=0 -discover=0 -upnp=0
./bin/pepecoin-cli -regtest -datadir="$PWD/test-node" getnewaddress miner
```

The last command prints a **test receiving address**, not a private key. Start the
computer's Keeper from this repository with the local node settings:

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
accepted block can become orphaned; the node wallet is the balance authority.

## Wallet and peers

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
private key into the mining page. A native spending interface in the site is
still release work; Coinbase Wallet cannot sign this chain's UTXO transactions.

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

The Home Assistant interface can display the new miner page, but this build does
not install a Core node in Home Assistant or connect it to another machine's RPC.
For now use the computer's Keeper alongside its Core test node. Public RPC,
router DMZ, mining pools and live external peers are not configured.

Before a mainnet release: finish the owner's native wallet setup and the site
spending flow; finish reviewing the remaining Windows dependencies; review consensus and
networking beyond the targeted tests; add tested Pi/ARM builds; select and verify
the owner's native founder address; publish immutable genesis and launch
parameters; then deploy independently operated nodes and validate their sync.
No exchange listing, market value, profitability or inherited network security
is implied by this fork.
