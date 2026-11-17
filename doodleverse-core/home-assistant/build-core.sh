#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Executed only inside the temporary multi-stage Home Assistant image builder.
set -eu
umask 077

INPUT=/build-input
SOURCE=/build/doodleverse
OUT=/out
UPSTREAM=4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8
mkdir -p "$SOURCE" "$OUT/bin" "$OUT/source" "$OUT/validation"
python3 - "$INPUT" "$UPSTREAM" <<'PY'
import hashlib, json, pathlib, sys
source = pathlib.Path(sys.argv[1])
manifest = json.loads((source / 'chain-manifest.json').read_text())
provenance = json.loads((source / 'provenance.json').read_text())
assert manifest['upstream']['commit'] == sys.argv[2]
assert provenance['upstreamCommit'] == sys.argv[2]
assert provenance['patchSha256'] == hashlib.sha256((source / 'doodleverse.patch').read_bytes()).hexdigest()
assert provenance['upstreamRepository'] == 'https://github.com/pepecoinppc/pepecoin.git'
PY
git -C "$SOURCE" init --quiet
git -C "$SOURCE" remote add origin https://github.com/pepecoinppc/pepecoin.git
git -C "$SOURCE" -c protocol.file.allow=never -c protocol.ext.allow=never fetch --no-tags --depth=1 origin "$UPSTREAM"
git -C "$SOURCE" -c advice.detachedHead=false checkout --detach FETCH_HEAD
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$UPSTREAM"
git -C "$SOURCE" apply --check --index "$INPUT/doodleverse.patch"
git -C "$SOURCE" apply --index "$INPUT/doodleverse.patch"
git -C "$SOURCE" diff --cached --check
TREE=$(git -C "$SOURCE" write-tree)
git -C "$SOURCE" archive --format=tar --prefix=pepecoin-upstream/ "$UPSTREAM" | gzip -n > "$OUT/source/upstream-source.tar.gz"
git -C "$SOURCE" archive --format=tar --prefix=doodleverse-core-source/ "$TREE" | gzip -n > "$OUT/source/patched-source.tar.gz"
cp "$INPUT/doodleverse.patch" "$INPUT/chain-manifest.json" "$INPUT/provenance.json" "$INPUT/build-core.sh" "$INPUT/LICENSE" "$OUT/source/"
cp "$SOURCE/COPYING" "$OUT/source/Pepecoin-COPYING"
cd "$SOURCE"
export CFLAGS='-O2 -g0' CXXFLAGS='-O2 -g0'
./autogen.sh
# Site wallets sign in the browser. No Berkeley DB or node wallet is built here.
./configure --without-gui --disable-wallet --enable-tests --disable-bench --disable-man --disable-zmq --without-miniupnpc --disable-upnp-default --enable-hardening
make -j2
./src/test/test_pepecoin --run_test=doodleverse_tests,scrypt_tests --log_level=test_suite > "$OUT/validation/consensus-tests.txt" 2>&1
install -m 0755 src/pepecoind "$OUT/bin/doodleverse-core"
install -m 0755 src/pepecoin-cli "$OUT/bin/doodleverse-cli"
strip "$OUT/bin/doodleverse-core" "$OUT/bin/doodleverse-cli"
ldd "$OUT/bin/doodleverse-core" > "$OUT/validation/runtime-libraries.txt"
ldd "$OUT/bin/doodleverse-cli" >> "$OUT/validation/runtime-libraries.txt"
printf 'upstream=%s\npatched_tree=%s\narchitecture=%s\nwallet=disabled\n' "$UPSTREAM" "$TREE" "$(uname -m)" > "$OUT/validation/build.txt"
dpkg-query -W -f='${Package}\t${Version}\n' gcc g++ libc6-dev libssl-dev libevent-dev 'libboost*-dev' > "$OUT/validation/build-libraries.txt"
(cd "$OUT" && find bin source validation -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
