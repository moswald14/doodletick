#!/usr/bin/env bash
# Cross-compile Windows executables on Linux. Never starts a node or miner.
set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/build-linux.sh"

[[ $# -eq 0 ]] || dvc_fail 'Usage: bash doodleverse-core/scripts/build-windows.sh'
dvc_prepare windows-x86_64
dvc_require gcc g++ curl patch perl zip x86_64-w64-mingw32-gcc-posix x86_64-w64-mingw32-g++-posix x86_64-w64-mingw32-objdump
dvc_record_tools
{
  x86_64-w64-mingw32-gcc-posix --version
  x86_64-w64-mingw32-g++-posix --version
} >> "$DVC_STAGE_DIR/validation/build-tools.txt"

readonly DVC_WINDOWS_HOST=x86_64-w64-mingw32
readonly DVC_OPENSSL_VERSION=3.5.9
readonly DVC_OPENSSL_SHA256=603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a
(
  cd "$DVC_SOURCE_DIR"
  # The patched recipes verify the SHA256 of every downloaded source archive.
  # Restrict downloads and redirects to HTTPS while preserving those pins.
  make -C depends -j"$DVC_JOBS" HOST="$DVC_WINDOWS_HOST" NO_QT=1 NO_UPNP=1 \
    x86_64_mingw32_CC=x86_64-w64-mingw32-gcc-posix \
    x86_64_mingw32_CXX=x86_64-w64-mingw32-g++-posix \
    bdb_download_path=https://download.oracle.com/berkeley-db \
    'build_linux_DOWNLOAD=curl --proto =https --proto-redir =https --location --fail --connect-timeout 20 --retry 3 -o'
  [[ "$(PKG_CONFIG_LIBDIR="$DVC_SOURCE_DIR/depends/$DVC_WINDOWS_HOST/lib/pkgconfig" PKG_CONFIG_PATH= pkg-config --modversion libcrypto)" == "$DVC_OPENSSL_VERSION" ]] || dvc_fail 'The staged OpenSSL version differs from the verified release pin.'
  ./autogen.sh
  CONFIG_SITE="$DVC_SOURCE_DIR/depends/$DVC_WINDOWS_HOST/share/config.site" ./configure \
    --prefix=/ --host="$DVC_WINDOWS_HOST" --without-gui --enable-wallet \
    --disable-tests --disable-bench --disable-man --disable-zmq \
    --without-miniupnpc --disable-upnp-default --enable-hardening \
    --enable-reduce-exports LDFLAGS='-static -static-libgcc -static-libstdc++'
  make -j"$DVC_JOBS"
)
cp "$DVC_SOURCE_DIR/src/pepecoind.exe" "$DVC_SOURCE_DIR/src/pepecoin-cli.exe" "$DVC_STAGE_DIR/bin/"
for executable in "$DVC_STAGE_DIR/bin/pepecoind.exe" "$DVC_STAGE_DIR/bin/pepecoin-cli.exe"; do
  x86_64-w64-mingw32-objdump -p "$executable" >> "$DVC_STAGE_DIR/validation/windows-imports.txt"
done
if grep -Eiq 'DLL Name:.*(libgcc|libstdc\+\+|libwinpthread|libssl|libcrypto|libboost)' "$DVC_STAGE_DIR/validation/windows-imports.txt"; then
  dvc_fail 'Unexpected external compiler/crypto DLL dependency in the Windows package.'
fi
# Copy the full notice only after rechecking the exact official source archive.
readonly DVC_OPENSSL_ARCHIVE="$DVC_SOURCE_DIR/depends/sources/openssl-$DVC_OPENSSL_VERSION.tar.gz"
printf '%s  %s\n' "$DVC_OPENSSL_SHA256" "$DVC_OPENSSL_ARCHIVE" | sha256sum --check --status - || dvc_fail 'OpenSSL source archive verification failed before notice extraction.'
tar -xOf "$DVC_OPENSSL_ARCHIVE" "openssl-$DVC_OPENSSL_VERSION/LICENSE.txt" > "$DVC_STAGE_DIR/licenses/OpenSSL-LICENSE.txt"
[[ -s "$DVC_STAGE_DIR/licenses/OpenSSL-LICENSE.txt" ]] || dvc_fail 'The OpenSSL license notice is missing.'
printf '%s\n' "OpenSSL $DVC_OPENSSL_VERSION" \
  "Archive: https://github.com/openssl/openssl/releases/download/openssl-$DVC_OPENSSL_VERSION/openssl-$DVC_OPENSSL_VERSION.tar.gz" \
  "SHA256: $DVC_OPENSSL_SHA256" > "$DVC_STAGE_DIR/validation/openssl-source.txt"
# Keep complete dependency source archives, their notices and the upstream recipes.
tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner -C "$DVC_SOURCE_DIR/depends" -cf - sources | gzip -n > "$DVC_STAGE_DIR/source/dependency-sources.tar.gz"
cat >> "$DVC_STAGE_DIR/EXPERIMENTAL.txt" <<'NOTICE'
This Windows cross-build pins OpenSSL 3.5.9 LTS and includes its full Apache-2.0
license notice. Boost 1.63.0 and Berkeley DB 5.3.28 remain old dependencies and
require further release review. This artifact is for disposable test-chain
evaluation, not production funds or public deployment. The Windows executables
were cross-compiled and inspected;
they have not been executed by this Linux build job. A Windows runtime test is
required before claiming Windows operation. No GUI wallet is included.
NOTICE
dvc_package 'Cross-compiled on Linux; PE imports inspected. Windows runtime, wallet and GPU operation are not tested by this job.'
