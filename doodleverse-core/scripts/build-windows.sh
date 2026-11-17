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
(
  cd "$DVC_SOURCE_DIR"
  # The upstream recipes verify the SHA256 of every downloaded source archive.
  # Restrict downloads and redirects to HTTPS without changing any version/hash.
  make -C depends -j"$DVC_JOBS" HOST="$DVC_WINDOWS_HOST" NO_QT=1 NO_UPNP=1 \
    x86_64_mingw32_CC=x86_64-w64-mingw32-gcc-posix \
    x86_64_mingw32_CXX=x86_64-w64-mingw32-g++-posix \
    bdb_download_path=https://download.oracle.com/berkeley-db \
    'build_linux_DOWNLOAD=curl --proto =https --proto-redir =https --location --fail --connect-timeout 20 --retry 3 -o'
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
# Keep complete dependency source archives, their notices and the upstream recipes.
tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner -C "$DVC_SOURCE_DIR/depends" -cf - sources | gzip -n > "$DVC_STAGE_DIR/source/dependency-sources.tar.gz"
cat >> "$DVC_STAGE_DIR/EXPERIMENTAL.txt" <<'NOTICE'
This Windows cross-build uses upstream dependency recipes, including OpenSSL
1.0.2u, Boost 1.63.0 and Berkeley DB 5.3.28. These are old dependencies. This
artifact is for disposable test-chain evaluation, not production funds or
public deployment. The Windows executables were cross-compiled and inspected;
they have not been executed by this Linux build job. A Windows runtime test is
required before claiming Windows operation. No GUI wallet is included.
NOTICE
dvc_package 'Cross-compiled on Linux; PE imports inspected. Windows runtime, wallet and GPU operation are not tested by this job.'
