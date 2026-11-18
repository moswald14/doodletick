# Doodleverse Paper Wallet

Download the maker from the native DVC miner or wallet. Open the HTML file on
your own device while offline. The printed receiving address is for mining and
receiving main-network DVC. The private key and its QR code control spending.
Keep the sheet private. Use a printer you control.

To spend, use **Recover from paper** in the offline file, then **Save encrypted
backup**. Restore the encrypted JSON backup in Keeper's native DVC wallet.
Keeper protects any existing different wallet, so use a separate browser
profile if needed.

## Build

From the repository root, with the existing pinned dependencies installed in
`crypto-vendor`:

```sh
node crypto-vendor/build-paper-wallet.mjs
node crypto-vendor/build-paper-wallet.mjs --check
node scripts/sync-ha.mjs
```

The build bundles Keeper's existing wallet code and the [Nayuki QR encoder
v1.8.0](https://github.com/nayuki/QR-Code-generator/tree/v1.8.0). The original
TypeScript is preserved with Git blob ID
`4a2d0acce5a24760245d43c1644a4e1993d70834`. The bundle includes the license notices
and pins its own inline code and styles in its Content Security Policy.
