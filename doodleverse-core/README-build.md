# Experimental Doodleverse Core builds

These builds apply `patches/doodleverse.patch` to Pepecoin Core 1.1.0 at the exact
upstream revision `4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8`. Each build fetches a
fresh checkout, checks that revision, and requires the patch to apply cleanly
to the index. A patch failure stops the build. No branch tip or unpinned binary
is substituted.

The result is a separate experimental Scrypt blockchain with wallet-enabled
`pepecoind` and `pepecoin-cli` binaries. Those upstream executable names are
retained to avoid an incomplete build-system rename. This is not PEPE, Pepecoin,
an Ethereum token, or a continuation of the existing native DVC history. No GUI
wallet is included.

Production mainnet startup is blocked in the consensus patch until a real
Doodleverse founder receiving address is selected and pinned in the source.
No runtime option bypasses that guard. Build and validation use disposable test
data only. They do not run valuable mining, import a private key, configure a
public node, open a router port, or change a Home Assistant installation.

## GitHub Actions

The `Build experimental Doodleverse Core` workflow builds Linux first, runs the
Doodleverse-specific consensus suite, fixed Scrypt vectors and
`tests/functional.py`, and only then
starts the Windows cross-build. Tests must use temporary regtest directories,
loopback RPC/P2P addresses and explicitly connected local peers. They must check
that production startup remains blocked. There is no public-chain test target.

The workflow has read-only repository permissions, persists no checkout
credentials, and pins the official checkout and artifact actions to full commit
hashes. Only the maintainer publishes code or starts a manually requested run.
The workflow does not create a release or deploy a server.

Each successful package includes:

- Wallet daemon and command-line client.
- The complete pinned upstream source, complete patched source and exact patch.
- Build scripts, workflow and functional-test source.
- Original source license notices, a build manifest and SHA-256 checksums.
- Build-tool/library information and the validation evidence that actually ran.
- For Windows, all downloaded dependency source archives and their embedded
  licenses, with corresponding recipes in the complete source archive, plus
  the full OpenSSL license in `licenses/OpenSSL-LICENSE.txt` and its verified
  archive provenance in `validation/openssl-source.txt`.

Archives contain no runtime wallet, cookie, blockchain data directory or host
environment dump. The Linux package targets Ubuntu 22.04 x86_64 and dynamically
uses distribution libraries; its `validation/runtime-libraries.txt` records the
runtime requirements. This is not a Raspberry Pi binary. The Windows package
targets 64-bit Windows and statically links the cross-built non-system libraries.

GitHub build artifacts expire after 14 days; diagnostics expire after seven.
Preserve the whole package and `SHA256SUMS` together when retaining a result.
Pinned source and recorded tools make the build reviewable; byte-for-byte
reproducibility across different compiler or distribution updates is not claimed.

## Local Linux build

Use a disposable Ubuntu 22.04 x86_64 development environment with at least 4 GiB
of available memory. The scripts do not install tools. The CI workflow contains
the package installation steps for its temporary worker.

The Linux build requires GCC/G++, Make, Autoconf, Automake, Libtool, pkg-config,
Git, Python 3.10 or newer, OpenSSL development files, libevent, Berkeley DB 5.3
C++ development files, and the Boost system/filesystem/chrono/program-options/
test/thread development libraries. It uses Ubuntu's maintained OpenSSL 3
package. The Windows cross-build separately pins OpenSSL 3.5.9 LTS.

From the repository root:

```sh
bash doodleverse-core/scripts/build-linux.sh
```

`DVC_JOBS=2` is the default. An integer from one through eight may be selected
for a machine with enough memory. The result appears in
`doodleverse-core/dist/linux-x86_64/`. The script refuses to overwrite that
directory. Preserve or move an earlier result before building again.

The Linux validation gate runs
`test/test_pepecoin --run_test=doodleverse_tests,scrypt_tests`
and `tests/functional.py --daemon PATH --cli PATH`. The inherited Pepecoin full
test suite contains old genesis, address, reward and AuxPoW assumptions and is
not presented as a passing Doodleverse test suite. A passing gate is evidence
for the named checks, not a security audit, economic validation or live Pi/GPU
test.

## Windows cross-build

Run the following on Linux after the Linux validation gate passes:

```sh
bash doodleverse-core/scripts/build-windows.sh
```

The cross-build additionally requires the POSIX-thread MinGW-w64 x86_64 GCC/G++
compilers, curl, patch, Perl, bison and zip. The workflow installs these on its
temporary worker. No Windows or WSL setup is performed on the maintainer's PC.

The patched `depends` recipes pin versions and verify each downloaded archive's
SHA-256. Berkeley DB's old HTTP location is upgraded to the official HTTPS
location without changing the expected archive hash. All dependency downloads
and redirects must remain HTTPS. Compiler selection is explicit and does not
alter system compiler alternatives. Qt and UPnP are excluded.

OpenSSL is upgraded to **3.5.9 LTS**, supported upstream through April 8, 2030,
using the official release archive and SHA-256:

```text
603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a
```

The build uses static libraries with embedded providers and retains deprecated
APIs required by the inherited code. It checks the staged library version and
rechecks the archive hash before extracting the full Apache-2.0 license notice.
The OpenSSL test suite is not run by this cross-build.

**Boost 1.63.0 and Berkeley DB 5.3.28 remain old dependencies.** They are known
limitations requiring further release review. This build remains for disposable
test-chain evaluation and is not ready for production funds or public service.
Windows compilation and runtime validation are still required for this upgrade;
successful Linux compilation does not establish Windows compatibility.

The result appears in `doodleverse-core/dist/windows-x86_64/`. The cross-build
checks executable imports for missing compiler or crypto DLLs. It does not run
Windows executables. Windows wallet operation, a physical GTX 1080 mining
session, Home Assistant integration, persistent peer availability and any public
network deployment require separate verification.

## Upstream references

- [Pinned Pepecoin source](https://github.com/pepecoinppc/pepecoin/tree/4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8)
- [Unix build instructions](https://github.com/pepecoinppc/pepecoin/blob/4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8/doc/build-unix.md)
- [Windows cross-build instructions](https://github.com/pepecoinppc/pepecoin/blob/4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8/doc/build-windows.md)
- [Dependency recipes](https://github.com/pepecoinppc/pepecoin/tree/4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8/depends)
- [Official OpenSSL releases and support dates](https://openssl-library.org/source/)
- [OpenSSL 3.5.9 release archive](https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz)
- [OpenSSL 3.5.9 published SHA-256](https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz.sha256)
- [OpenSSL 3.5.9 MinGW build notes](https://github.com/openssl/openssl/blob/openssl-3.5.9/NOTES-WINDOWS.md)
- [Pinned checkout action release](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [Pinned artifact action release](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)
