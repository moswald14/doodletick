# Native wallet hash primitive

The native DVC browser wallet reuses the existing pinned `recipient-crypto.mjs`
`SigningKey` and SHA-256 implementation. Its P2PKH addresses additionally require
RIPEMD160. `scrypt-wallet-crypto.mjs` bundles only that primitive and its helpers
from the same lockfile's `@noble/hashes` 1.3.2. It contains no storage, provider,
wallet connection or networking code. `scrypt-wallet-crypto-notices.txt` preserves
the original MIT notice. No external CDN is used at runtime.

After `npm ci --ignore-scripts` in this directory:

```sh
node build-scrypt-wallet.mjs
node build-scrypt-wallet.mjs --check
```

The build uses esbuild 0.28.2 from the existing lockfile, checks the dependency
version and restricts bundled modules to the hash package. It works from this
source directory or the `crypto-source` directory in a Keeper download. The
`scrypt-wallet-source-inputs.json` file contains every contributing JavaScript
module, preferred TypeScript source, licenses, exact source hashes, entry point,
build script and dependency lockfile. Package source and notices must accompany
distributed binaries and bundles.

The wallet's own implementation is in `keeper/public/scrypt-wallet-core.mjs` and
`scrypt-wallet-ui.mjs`. Password derivation and encryption use browser Web Crypto
PBKDF2-SHA256 with 600,000 iterations and AES-256-GCM. Native transaction inputs
are authenticated against their complete previous transactions before signing.
The signer uses the existing vetted ECDSA primitive; this project does not
implement elliptic-curve arithmetic. These design choices and automated tests
do not constitute an independent audit of the complete wallet.
