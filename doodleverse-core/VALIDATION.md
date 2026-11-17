# Doodleverse Core validation · Doodle Tick 0.13b

This records observed checks, not a mainnet launch or an independent security audit.

## Current source and completed integration evidence · 2026-11-17

The current fork patch SHA-256 is **`641c07ba26a034e6d778a6264ab0a3ddab2690e7620829d6357ee009ad406101`**. It includes the native main-network founder recipient and revised first-block checks. **A successful native build and execution of this exact patch are still required.** The earlier verified native artifacts below use a different patch; their successful execution must not be attributed to this one.

### Completed integration checks

- [x] **Combined source checks:** **853/853 Keeper/Home Assistant tests passed** in **22.60 seconds**, with zero failures or skips. Both pinned browser crypto bundles reproduced byte-for-byte, and the preserved contract suite passed **10/10** offline tests in **206 seconds**. A subsequent Windows-launcher correction still needs its owned follow-up check; these source results do not certify that later edit or any current native artifact.
- [x] **Actual browser GPU to Core:** Chrome's site miner submitted **17 accepted Scrypt blocks** on an isolated disposable regtest node. **Stop** ended work and the observed height remained stable. A later receipt/cancellation race was fixed with a focused regression. No live mainnet coins or owner wallet were used in this mining check.
- [x] **Site wallet implemented and checked:** **30 client tests and 19 backend tests passed**. The browser generates a native key, stores only a network-bound encrypted backup, authenticates previous transactions, reviews exact payment/change/fees, and signs locally. Core and Keeper receive no wallet password or plaintext signing key.
- [x] **Native site-wallet acceptance:** `tests/site-wallet-functional.mjs` passed against the earlier verified Windows daemon through the full Keeper HTTP interface. Restored browser-wallet keys sent **7 test DVC**, then the receiving wallet sent **1 test DVC** back. Both payments had a checked fee of **226,000 atoms** and were confirmed by Core.
- [x] **Consensus-valid large previous transaction:** that fixture mined a **220,249-byte block** whose coinbase had **10,004 outputs** and a **120,006-byte OP_RETURN script**. The reward was indexed, matured, authenticated from its raw previous transaction, signed and spent. Backend and client bounds now follow serialized consensus-size limits rather than rejecting valid unrelated script/output shapes.
- [x] **Recovery and access boundaries:** the native fixture passed encrypted-backup restore and wrong-password checks, 30-confirmation maturity, mempool exclusion, pending/confirmed idempotent retries, transaction-id tamper and double-spend rejection, active-chain rollback/restoration and index restart. Full Keeper requests without the mutation header or with a foreign Origin returned HTTP 403. Disposable data was cleaned up.
- [x] **Founder enrollment:** the owner's public native enrollment signature and address were verified. The public record pins the intended recipient without publishing a private key or password. This is authorization evidence, not a mined allocation. The owner reported saving the encrypted backup privately; no owner-wallet recovery or spend is claimed.

These receipts complete the earlier outstanding site-wallet and full browser GPU-to-Core integration checks on the development build. They do not prove the changed current C++ binary, a final Windows ZIP, the ARM64/AMD64 Home Assistant image, live mainnet issuance or a distributed peer deployment. The native source, browser wallet, Windows launcher and bundled Home Assistant node are implemented; final-artifact validation is the remaining release boundary.

### Current build and deployment checklist

- [ ] Obtain a successful CI build for patch **`641c07ba26a034e6d778a6264ab0a3ddab2690e7620829d6357ee009ad406101`**, including native consensus and functional checks. Add its build URL and exact artifact identities here.
- [ ] Verify the resulting Windows package and Home Assistant architecture images against their manifests/checksums; rerun the native payment, recovery and mining compatibility checks against the final artifacts. Complete the later Windows-launcher correction's owned checks and final generated-runtime/package checks.
- [ ] Verify the portable Windows startup and the backed-up Home Assistant 0.13b update/restart with the original Keeper identity and configured matching peers. Report actual network/deployment state before claiming a live distributed launch.

## Historical native packages and execution

The remainder records an earlier integration build. Statements about unimplemented site spending or pending full browser GPU acceptance describe that earlier source cut and are superseded by the completed checks above. They do not describe current source functionality.

### Native packages

[Build 44145863634](https://github.com/moswald14/doodletick/actions/runs/44145863634)
at integration commit `a826301224d77c757a0ec125ca3df0b6a9748049` passed the Linux
consensus/Scrypt tests, two-node functional checks and Windows cross-build.
Both packages use upstream commit `4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8`
and fork patch SHA-256
`b611028ab2fd83ab577ce4476ddc4c4e93ee37721706fa39f7137feffa5226f9`.

Downloaded Actions artifacts and every file listed by their package manifests
were independently checked against their SHA-256 records before Windows execution.

| Platform | Actions artifact | Outer artifact SHA-256 |
| --- | --- | --- |
| Linux x86_64 | 14356866601 | `13b1931d071c57a0ffeeabbe9c6b2856c247e0a707daed65c92d004fba9dedca` |
| Windows x86_64 | 14358320686 | `259c304985411e2c67df0f81dadf580d7b1d9b1f736390fd83ae0ac341f28d25` |

These identify the outer Actions downloads. The inner install archives have
their own `SHA256SUMS` and file manifests. Complete source, patch, build scripts
and license notices are included. Actions downloads expire; retain the complete
package when keeping a binary.

### Executed on Windows

The verified Windows daemon and CLI passed `tests/functional.py` against newly
created, isolated regtest nodes. The checks covered the mainnet startup guard,
genesis/network identity, two-peer synchronization, real Scrypt proofs, exact
founder output, rejection of overpayment and founder redirection, reward maturity,
CLI access, a real Keeper-bridge block submission, a transfer, competing-chain
reorganization and restart persistence. Final chain height was 37.

`tests/wallet-recovery.py` passed with separate disposable nodes. It encrypted a
fresh wallet using an in-memory random test password, backed it up before funding,
then restored it into a new node that downloaded the chain and rescanned it.
The recovered wallet found its later 50-DVC test reward, rejected a wrong password
and a locked spend, unlocked and paid 7 test DVC, and remained locked with the
correct balance after restarting. The independently decoded fee was 226,000 atoms,
leaving 4,299,774,000 atoms; the recipient held 700,000,000 atoms. Temporary wallets,
cookies, logs and backups were removed after the test. No operator wallet was read.

The Windows package statically uses the hash-verified OpenSSL 3.5.9 source. Its
full Apache-2.0 notice and source provenance are included. PE imports were checked
for unexpected external compiler/crypto DLL requirements. Boost 1.63 and Berkeley
DB 5.3 remain old dependencies requiring production review.

### Earlier Keeper and GPU source cut

After merging Keeper 0.12b, 789 combined app/HA tests passed, including 26 Scrypt
UI checks for command input, explicit start, repeat/cancel behavior and rejected
commands. An earlier full attempt had one ingress connection reset; its four
focused ingress checks and the complete 789-test rerun passed. No product timeout
or authentication check was relaxed to make it pass. Repository generation and
consistency checks also passed.

At this earlier source cut, real Chrome WebGPU checks on the development PC passed fixed Scrypt vectors and
both complete Eco (64-candidate) and Balanced (128-candidate) batches. Those checks
did not submit blocks. The browser GPU and real Core bridge have been exercised
separately; a complete GPU-to-Windows-node browser session remains a live acceptance
step. The command input has automated coverage; its live Enter/layout check is
also pending.

The published Home Assistant 0.12b update was separate. At that source cut the branch did not install
Core on Home Assistant, migrate legacy coin balances, create an owner wallet or
enable mainnet. Pi/ARM builds, native site spending, owner backup/recovery setup,
founder destination approval, further dependency/consensus review and independent
peer deployment remain release work.
