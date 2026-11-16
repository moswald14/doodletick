# Development roadmap

Current release: **0.4b**. [Doodleverse's direction](DOODLEVERSE.md) describes the proposed founder allocation, communication effort, foundation and eventual food days. The table below separates implementation from outstanding verification and operational work.

| Priority | Work | Finish condition |
| --- | --- | --- |
| P0 | Verify the 0.4b repository update | HTTPS app starts, original witness/receipts/ledger and v1 browser proofs are retained, restart succeeds, old clone stays stopped and requested automatic updates remain enabled. Record actual deployment separately from source checks. |
| P0 | Complete actual wallet-recipient checks | Exercise the Coinbase Wallet Chrome extension's native prompt and selected account/network. Verify its exact message and public export; test a real deployed ERC-1271 account separately before claiming that field check. Source and mock-wallet browser checks are complete, but are not evidence of these live paths. Unsupported ERC-6492/EIP-7702 accounts remain unverified; no financial call is available. |
| P0 | Publish the founder's chosen recipient proof | The owner privately selects/unlocks the original creator identity and intended wallet, reviews the disclosed allocation and full recipient, signs, runs fresh GPU work, and explicitly publishes the verified public record. Preserve the original v1 proof; expose no private keys and imply no live issuance. |
| P1 | Two-device direct connection field tests | Two physical devices compare complete patterns, complete a game and licensed binary file transfer, and exercise disconnect/reconnect on LAN and distinct networks. Record failure conditions without claiming universal connectivity. |
| P1 | Operator-owned rendezvous and relays | Define authenticated admission, scoped authorization, quotas, revocation, abuse handling and deployment costs; test independently before enabling remote garden or discovery services. |
| P1 | Native DVC protocol design | Agree genesis and disclosed allocation, future supply, signed spends, nonces/double-spend prevention, independent validation, cumulative-work fork choice, reorganization and recovery. Reproducible adversarial tests and human review precede live issuance. |
| P1 | GPU and wallet field tests | Test real browser/driver combinations, the Coinbase Wallet Chrome extension, cancellation, account/network changes and chain-state failures. Separately test existing public DGT transactions with disposable wallets and explicitly approved test-network funds. |
| P1 | Additional smart-account support | Design and test bounded read-only ERC-6492 verification and EIP-7702 policy before enabling either. Never deploy or modify a wallet to make verification pass. |
| P1 | Accessibility and recovery | Keyboard/narrow-screen checks, interrupted writes, compatible backups and ledger recovery retain saved work and clear control of mining. |
| P2 | HACS companion | Choose and implement an actual dashboard card or integration separately from the Keeper app; obtain acceptance before claiming a listing. |
| Organizing | Proposed foundation and food days | Establish governance, people, resources and communication pilots; then arrange real local food partners, responsibilities and dates. No service entitlement is promised by coins. |

0.3b implements native encrypted browser pairing, removes the Tailscale runtime and network privileges, preserves local signed garden accounting, and supplies a prelaunch certificate verifier plus bounded GPU search. It does not launch a spendable DVC chain or worldwide service.

0.4b adds a separately versioned wallet-recipient record linked to the existing proof. It preserves v1, requires creator and wallet approvals plus fresh work, and restricts the new wallet flow to message signing. It creates no spendable DVC balance or Coinbase listing. See the [recipient guide](keeper/WALLET-RECIPIENT.md) and [validation record](keeper/VALIDATION.md) for scope and evidence.

The combined suite passed **238 tests**. A real Chrome fixture using the actual adapter, a mock wallet and a disposable creator completed signing, GPU work, copy, reload and locked import; the exported proof also passed an independent Node verification. The actual Coinbase account and Home Assistant 0.4b update have not yet been verified.

## Next engineering task

Complete the **actual Coinbase Wallet handoff** before publishing the owner's chosen record. Verify the full public export independently, exercise cancellation and changed accounts/networks, and confirm that the wallet is asked only for the displayed message signature. Record unsupported account types and unperformed checks honestly.

Then complete the **two-device direct-connection field test** with disposable players. Compare both spirographs, finish a game, transfer a licensed binary file, close/reopen the host, and record what works on LAN and through different routers. Use measured failures to design explicit operator-controlled relay support. Do not silently reintroduce a VPN or arbitrary URL proxy.

## Release gate

Canonical and generated runtime agree; signature/accounting/storage/network checks pass; relevant browser observations are recorded; archives exclude private state; migration preserves identity and rollback material. Release notes distinguish tested behavior from remaining setup. Source review does not constitute a production security audit.
