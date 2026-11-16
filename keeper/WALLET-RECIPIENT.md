# DVC wallet-recipient records · 0.4b

The recipient feature links a Doodleverse prelaunch founder proof to an Ethereum address selected in a browser wallet. The intended owner setup is the **Coinbase Wallet Chrome extension**; actual Coinbase signing remains a field-test step. The record proposes a recipient for the disclosed **1,000,000 DVC founder allocation**. It creates **zero spendable DVC**, no live blockchain and no token balance in Coinbase Wallet. Coinbase listing, approval or endorsement is not implied.

This is separate from private Doodle Coins and public DGT gardens. Their balances are not converted, backed, burned or transferred by a recipient certificate. Total future DVC supply, genesis and issuance rules remain unadopted.

## What is preserved and what is new

The original v1 proof stays unchanged and remains independently verifiable. The v2 record includes that proof and its recomputed public reference, a recipient mapping signed by the **same creator key**, and the selected wallet's approval of a purpose-specific message. It then requires **fresh GPU work** for the combined record. A v1 nonce cannot be relabeled as work for v2.

Both signatures matter: the creator authorizes linking their original proof, and the wallet approves the proposed recipient. Another wallet cannot establish that link merely by referencing someone else's public proof. A successful proof establishes its stated hash target; it does not establish the hardware used, a unique person, project authority, network adoption or value.

The app can save a recipient proposal **before** GPU work. Its status must be read precisely:

| Record | What verifies |
| --- | --- |
| Creator-only recipient proposal | The original proof and its creator's mapping approval; wallet approval and fresh work are still missing. |
| Wallet-signed recipient proposal | Both approvals; fresh work is still missing. This public proposal is saved when wallet signing completes. |
| Recipient proof | Both approvals and the new work target. It remains a non-spendable prelaunch proposal. |

The public formats are `doodleverse-recipient-proposal-v2` and `doodleverse-recipient-proof-v2`. Neither replaces the original v1 format or browser record.

## Use the feature

1. Open Doodle Tick in a supported Chrome context over trusted HTTPS or localhost. Keep a backup of the original v1 proof and creator vault. An embedded Home Assistant view or mobile WebView may not expose the extension; compatibility must be checked in the actual browser.
2. Unlock the creator vault that signed the original proof, and select or import that proof. A different creator key cannot approve the mapping.
3. Choose **Find browser wallets**, select the extension you installed, then **Connect selected wallet**. Choose the recipient if the wallet exposes multiple accounts. Check its full address and EVM chain ID; change the network in the wallet if needed. Connection requests public accounts, not balances or transaction history. Doodle Tick never needs recovery words, private keys, wallet passwords or a Coinbase exchange API key.
4. Choose **Review wallet recipient**. This signs the new proposal locally with the unlocked original creator key. Review the displayed source proof, creator fingerprint, full recipient, network, allocation and expiration. Expand **Exact wallet message** to inspect the structured data. Check the acknowledgement, then choose **Sign recipient message in wallet**. The request uses the `Doodleverse Founder Recipient` signing domain and requests no token spending permission, transfer, transaction fee or contract deployment.
5. Choose **Start wallet-linked GPU proof**. Each explicit run is limited to 60 seconds or 4,194,304 candidates. **Cancel wallet work**, leaving the view, hiding the page, locking the vault or withdrawing consent cancels unfinished work. Cancel discards late replies but cannot close the wallet's own prompt; finish or dismiss that prompt before attempting another connection/signature.
6. Choose **Copy recipient record** or **Export recipient record** and retain the v1 proof separately. Copy also shows selectable public JSON if the clipboard is unavailable. Use **Import recipient record** and **Verify recipient record again** to check a saved copy. Connecting, signing and copying do not publish anything automatically.

The wallet connection is specific to the selected provider/account/chain. Changing those, locking or changing the creator, changing the source proof, or cancelling invalidates pending work. A rejected signature is not silently replaced with a different signing request.

Reload/import restores public verification data only. It does not reconnect a wallet, reopen its signing prompt or resume mining. To begin another active work session, connect, review and approve a fresh proposal. The old saved record remains useful for independent verification.

## Account support and verification

| Account | 0.4b treatment |
| --- | --- |
| Ordinary externally owned account (EOA) | Verify the Ethereum signature against the exact typed message and recipient. This offline check proves the address's signature, not historical code on a blockchain. |
| Deployed ERC-1271 smart account | Connect the matching account/network, then check the signature through a read-only query at the exact declared canonical block. The wallet's RPC must support that block and EIP-1898 block-hash selection. |
| Undeployed/counterfactual ERC-6492 signature | Unsupported. Keep the record unverified; do not deploy or fund the account to bypass this limit. |
| EIP-7702 delegated account | The connected adapter rejects delegation code observed at the declared canonical block. Offline EOA imports cannot independently certify that code/delegation state. Do not change delegation to make the prototype pass. |

ERC-1271 ownership and validation rules can change. Importing a signed smart-account record keeps it unverified until the explicit chain-state check succeeds. An exported “verified” observation is not proof of historical chain state, and it cannot replace an independent query. Network failure, unavailable historical state, a reverted query or an unsupported account means **unverified**, not success. The connection flow rejects delegated accounts rather than changing their delegation. Wallet names are supplied by extensions and are not evidence that a provider is authentic.

The requested signature uses a fixed recipient-authorization schema. The new flow has no payment, approval, permit, session-key, account-deployment or transaction controls. The optional DGT garden is a different feature and does have explicit wallet-confirmed transactions; its permissions and balances do not carry into DVC recipient verification.

## Expiration, publication and authority

Authorizations last at most **24 hours**. `issuedAt` and `expiresAt` are Unix **milliseconds**, and the wallet message also shows an ISO expiration date. New signing and GPU proof creation require the current window. Import/reverification can check archival integrity while marking a record expired or not yet valid; those statuses cannot authorize a new action.

Signed times are declarations, not a trusted timestamp. A creator can sign conflicting recipient proposals. This app has no global issuer or consensus mechanism that prevents that, so a future live allocation needs agreed adoption, conflict and revocation rules.

Anyone can create their own valid proposal. Compare the complete creator fingerprint, recipient, chain and proof reference with an independently trusted project publication before treating a record as the project's chosen one. No project founder address is inferred from the Coinbase brand or supplied automatically.

Public exports contain public identities, signatures and proof data. Keep recovery material, vault contents, local addresses, authenticated URLs and RPC credentials out of published files and issue reports. A wallet address makes the declaration publicly linkable to that address's activity; review the full record before publishing it.

## Verification status

The combined 0.4b suite passed **238 tests**, including 19 recipient-protocol, 22 wallet-adapter and 15 recipient-UI checks. The separate existing garden-contract reproduction passed 10 offline EVM tests; those are not live DVC issuance tests.

An actual Chrome fixture used the real adapter, a **mock wallet** and a disposable creator. It completed both signatures, fresh difficulty-16 WebGPU work, public copy, reload and locked import. The exported proof passed independent Node verification. The integrated standalone app rendered both Coin panels and connected an imported v1 proof to the recipient flow without console errors in that check. The separate fixture logged one unassigned extension-style receiving-end error after copying, so no overall clean-console claim is made.

Actual Coinbase Wallet signing, a real smart-account state check and the Home Assistant 0.4b update remain pending. No personal founder address or chosen official certificate is established by disposable fixtures. See [VALIDATION.md](VALIDATION.md) for the full evidence and remaining limits. These checks are not a production security audit.

See [security reporting](../SECURITY.md), [architecture](../ARCHITECTURE.md) and [the Doodleverse direction](../DOODLEVERSE.md).
