# Experimental Scrypt validation

This records observed checks, not a mainnet launch or an independent security audit.

## Native packages

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

## Executed on Windows

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

## Keeper and GPU

After merging Keeper 0.12b, 789 combined app/HA tests passed, including 26 Scrypt
UI checks for command input, explicit start, repeat/cancel behavior and rejected
commands. An earlier full attempt had one ingress connection reset; its four
focused ingress checks and the complete 789-test rerun passed. No product timeout
or authentication check was relaxed to make it pass. Repository generation and
consistency checks also passed.

Real Chrome WebGPU checks on the development PC passed fixed Scrypt vectors and
both complete Eco (64-candidate) and Balanced (128-candidate) batches. Those checks
did not submit blocks. The browser GPU and real Core bridge have been exercised
separately; a complete GPU-to-Windows-node browser session remains a live acceptance
step. The command input has automated coverage; its live Enter/layout check is
also pending.

The published Home Assistant 0.12b update is separate. This branch does not install
Core on Home Assistant, migrate legacy coin balances, create an owner wallet or
enable mainnet. Pi/ARM builds, native site spending, owner backup/recovery setup,
founder destination approval, further dependency/consensus review and independent
peer deployment remain release work.
