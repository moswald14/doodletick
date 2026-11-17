# Build the Windows GPU miner package

The packager runs offline and does not install or execute a downloaded program.
It requires the reviewed source checkout, a matching checked Windows Core ZIP
and manifest, and the official Node runtime inputs pinned in `node-runtime.json`.

Download the named Node archive, `SHASUMS256.txt`, `SHASUMS256.txt.sig` and the
published release key to a separate build-input folder. Name the public key
`node-release-key.asc`. The recorded Node 24.22.3 checksum signature was verified
with GPG against the fingerprint
`5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`, independently matched to the
[Node project's release-key list](https://github.com/nodejs/release-keys).
The pinned hashes cover the runtime archive and each retained signature input.
No private signing key is used. For a new dependency version, repeat the upstream
signature check before changing these pins; copying a checksum from an unrelated
download site is insufficient.

After committing the reviewed source and passing repository tests, run:

```text
python -B doodleverse-core/windows/package-windows.py --version 0.13b --core-package PATH_TO_CHECKED_CORE_ZIP --core-manifest PATH_TO_CORE_MANIFEST --core-sha256 VERIFIED_INNER_ZIP_SHA256 --node-input PATH_TO_NODE_INPUTS --output NEW_OUTPUT_DIRECTORY
```

The default `node` executable runs the repository checker. Supply `--node PATH`
when necessary. A published package requires a clean commit and an unused output
directory. `--allow-working-tree` creates a visibly marked `working-test` package
for developer smoke checks and is not a release shortcut.

The packager checks the exact Core source patch, chain manifest, all native file
hashes, Node archive and provenance hashes, and the Keeper runtime inventory.
It includes complete corresponding Core and Keeper source, build scripts,
dependency archives and licenses. It excludes runtime wallets, node cookies,
logs, user data and local account settings. Each archive is read back and checked
before its checksum is emitted. Output files are never overwritten.

Extract to a new controlled directory and run:

```text
runtime\node.exe launcher.mjs --check
```

From the reviewed source checkout, the complete native service/control check is:

```text
node doodleverse-core/windows/check-package.mjs --bundle EXTRACTED_PACKAGE_DIRECTORY
```

It additionally rejects a wrong stop token and a browser-origin stop request,
then stops the task-owned launcher during startup and confirms temporary cleanup.

This launches the included Core and Keeper with disposable data and random test
ports, checks the real connection and shuts down. It never opens a browser,
mines or spends coins. Separately verify the browser GPU check, address-only
mining, Keep mining/Stop, wallet review/send flow and normal launcher stop. Record
the actual architecture and package hash; a native node test does not establish
GPU hardware performance.
