# Public garden contracts

This is an experimental, unaudited EVM option for Doodle Tick. A player connects an existing injected wallet, chooses its network, and either deploys an independent garden or connects an existing compatible address. This repository does not include a shared deployed contract. No public network deployment or paid transaction was performed during development.

Public DGT tokens and private Keeper Doodle Coins are separate systems. There is no conversion, bridge, redemption, promised market value, or liquidity. Tokens from different garden addresses or chain IDs are separate even though they use the same name and symbol. Every public transaction requires the player's wallet confirmation and its network gas fee; the app never asks for a recovery phrase or creates keys.

## Fixed contract rules

- OpenZeppelin ERC20 with whole-token units (`decimals() == 0`) and a hard 1,000,000-token cap. No premine, administrator mint, proxy, upgrade, native-currency payment, external protocol call, or wallet allowance request in the app.
- At most 4,096 registered fingerprints per garden and 32 per wallet. Registration is permanent; generator ownership does not transfer when its tokens move.
- Reserve a SHA-256 commitment, then reveal the recipe fingerprint in a later block within 24 hours. Commitments bind the wallet, contract, and chain. A new reservation replaces that wallet's previous reservation.
- One token per fully owned UTC hour, starting at the first hour boundary at or after registration. A mushroom registered at 12:20 first earns one hourly token at 14:00; one registered exactly at 12:00 first earns one at 13:00. Each claim processes at most 720 hours; subsequent claims catch up without deleting backlog. The hourly pool is 900,000 tokens shared by the garden.
- Optional proof mining uses SHA-256 with 16 leading zero bits. Each proof binds the chain, contract, caller, recipe, hour, and per-recipe counter. It earns one token, at most once per recipe per UTC hour and 64 times per garden per hour. The separate lifetime mining pool is 100,000 tokens.
- Transferring ERC20 tokens does not transfer a generator or change hourly accrual. Rewards go to the generator's original registering wallet.

Full cap exhaustion is permanent. Competition for the remaining supply is first transaction included, not an equal allocation. Block timestamps define hour boundaries. A proof can expire or lose the last available reward while its transaction is pending; failed transactions can still cost gas.

## What the fingerprint proves

The app hashes the existing normalized Dot Wave Studio recipe through `mushroomId`. Names, motion preferences, and listening settings do not create a new generator. Only the fingerprint is published; the recipe is not uploaded to the chain. Keep an export if you want to recreate it.

The contract accepts a nonzero 32-byte fingerprint and cannot prove that it came from a mushroom, that its registrant authored the recipe, or that two wallets belong to different people. The reservation prevents copying a pending reveal from taking its fingerprint; it does not establish intellectual-property rights. Public recipes can be claimed first by someone else. Wallet and global caps limit issuance but do not prevent multiple-wallet farming. Low-difficulty proof mining is a bounded game mechanic, not chain consensus or a financial-security mechanism. The underlying EVM network provides consensus.

## Wallet and mining behavior

`keeper/public/public-chain-wallet.mjs` uses the injected EIP-1193 provider without a remote script or RPC endpoint configured by this app. Account access begins only on Connect. Network switching, deployment, reserve, register, claim, transfer, and proof submission each begin on a player click. Gas is simulated before the wallet request, and the wallet shows the actual fee. Native transaction value is always zero.

An attached garden must match the complete compiled runtime byte for byte. Proxies and contracts compiled differently are refused. Matching code does not certify the chain, wallet provider, deployment history, or token value. The page checks account and chain before writes, clears the selection when they change, and retains a submitted transaction hash when confirmation is interrupted. A timeout is shown as pending. Check pending or wallet activity before resending; replacements and dropped transactions must be resolved in the wallet. A successful first receipt is not a finality guarantee and can be reorganized.

Start mining runs a single visible session, stopping after 60 seconds or 250,000 attempts. It yields regularly and stops when hidden, when the mode/account/network/garden changes, or when Stop is clicked. A found proof requires a separate Submit found proof click. No transaction is submitted by the mining loop, and no hidden or background miner is started.

## Reproduce and test

Use Node 22.13 or newer. From `contracts/`:

These JavaScript build and integration-test commands use the full repository layout. Desktop and Pi downloads include the complete source under `contract-source/`; use the repository or Home Assistant source archive to run the commands below. The bundled `artifacts/compiler-input.json` also contains every Solidity dependency for independent compilation with the pinned compiler.

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm test
```

The lockfile pins Solidity compiler **0.8.38**, OpenZeppelin Contracts **5.6.1**, and the offline EthereumJS VM toolchain **10.1.3**. The compiler targets **Paris**, with optimizer enabled at 200 runs and metadata bytecode hash disabled. `build` regenerates the JSON artifact, complete compiler input, and browser artifact. `check` requires byte-for-byte equality with the checked-in output.

`artifacts/compiler-input.json` contains every compiled Solidity source verbatim, including the OpenZeppelin imports, so source distribution does not require `node_modules`. It can be submitted as Solidity standard JSON input to the pinned compiler. `OPENZEPPELIN-LICENSE.txt` preserves the upstream MIT license; DoodleGarden and its application code are GPL-3.0-only. Dev tools retain their upstream licenses in their installed packages.

The contract tests run real compiled bytecode in an in-memory EVM with fixture addresses, no keys and no RPC. They cover registration timing/ownership/duplicates/caps, hourly boundaries and catch-up, SHA-256 interoperability, proof replay and domain separation, mining limits, supply rollback, and 1,000 deterministic randomized harvest/transfer steps. Selected cap tests seed near-limit storage explicitly; randomized invariants use normal contract operations. These are implementation checks, not a production security audit, economic validation, or live wallet/network testing.

From the repository root, frontend tests run with `node --test keeper/tests/public-chain.test.mjs keeper/tests/public-chain-ui.test.mjs`. They cover explicit wallet requests, ABI bounds, runtime verification, account/network changes, rejected/failed/pending transactions, and mining visibility/cancellation/time bounds. A deterministic UI fixture also checks cancellation while a challenge RPC is pending, including hiding then returning before it resolves.

## Primary references

- [OpenZeppelin ERC20](https://docs.openzeppelin.com/contracts/5.x/erc20) and [pinned release](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.6.1).
- [Solidity 0.8.38](https://www.soliditylang.org/blog/2026/10/22/solidity-0.8.38-release-announcement/) and [compiler JSON settings](https://docs.soliditylang.org/en/latest/using-the-compiler.html#compiler-input-and-output-json-description).
- [EIP-1193 wallet provider](https://eips.ethereum.org/EIPS/eip-1193), [wallet chain switching](https://eips.ethereum.org/EIPS/eip-3326), and [EthereumJS VM](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/vm).
