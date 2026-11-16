# Recipient signature primitives

The browser bundle exports only Ethereum address, ABI, typed-data and signature
primitives from ethers 6.17.0. It contains no provider or wallet connection API.
SigningKey and computeAddress support disposable offline test fixtures; production
recipient approval uses the user's browser wallet and never accepts a private key.

Install pinned development dependencies with `npm ci --ignore-scripts` here, then
run `npm run build` or `npm run check`. The exact dependency versions and npm
integrity digests are in package-lock.json. Build output is unminified ES module
source. In a source checkout, run from crypto-vendor/ and the output goes to
../keeper/public/. In an extracted desktop or Pi Keeper, run from crypto-source/
and the output goes to ../public/. The build selects these existing directories
in that order and accepts no output path override. Both layouts support
`npm run build` and the read-only `npm run check`.

The output is recipient-crypto.mjs; all included dependencies' licenses are
generated alongside it in recipient-crypto-notices.txt. No CDN is used.

source-inputs.json contains the exact contributing JavaScript modules and their
preferred TypeScript source, per-file hashes, dependency versions and licenses,
plus this entry, build script and lockfile. Only modules contributing bytes to
the runtime determine the bundled licenses. Text is normalized to LF so the
source and generated checks are reproducible on Windows and Linux. Desktop/Pi
archives carry these same sources in crypto-source for rebuilding and inspection.

Ethers uses Noble cryptographic primitives. Upstream audits apply to their stated
versions and scope; bundling this release is not an audit of Doodle Tick.
See https://docs.ethers.org/v6/ and https://github.com/paulmillr/noble-curves.

The build asserts that provider APIs, network calls, transaction submission and
wallet storage are excluded. Address derivation helpers do not send transactions.
Rebuilding requires Node.js and the pinned esbuild development binary;
running Doodle Tick requires no npm installation.
