#!/usr/bin/env bash
# Build the selected, pinned Doodleverse fork. This file also supplies shared
# preparation/packaging functions to build-windows.sh.
set -Eeuo pipefail
umask 077

readonly DVC_UPSTREAM_URL='https://github.com/pepecoinppc/pepecoin.git'
readonly DVC_UPSTREAM_COMMIT='4fb5a0cd930c0df82c88292e973a7b7cfa06c4e8'
readonly DVC_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DVC_CORE_DIR="$DVC_REPO_ROOT/doodleverse-core"

dvc_fail() { printf 'Doodleverse build: %s\n' "$*" >&2; exit 1; }

dvc_require() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || dvc_fail "Required build tool is missing: $tool"
  done
}

dvc_prepare() {
  DVC_PLATFORM="$1"
  DVC_PATCH="$DVC_CORE_DIR/patches/doodleverse.patch"
  [[ "$(uname -s)" == Linux ]] || dvc_fail 'Run this build in Linux; no host toolchain is installed automatically.'
  [[ -s "$DVC_PATCH" ]] || dvc_fail "Missing nonempty consensus patch: $DVC_PATCH"
  [[ -f "$DVC_CORE_DIR/tests/functional.py" ]] || dvc_fail 'Missing isolated regtest functional tests.'
  dvc_require git python3 make autoconf automake libtoolize pkg-config tar gzip sha256sum
  python3 -c 'import sys; assert sys.version_info >= (3, 10), "Python 3.10 or newer is required"'
  DVC_JOBS="${DVC_JOBS:-2}"
  [[ "$DVC_JOBS" =~ ^[1-8]$ ]] || dvc_fail 'DVC_JOBS must be an integer from 1 through 8.'
  DVC_OUTPUT_DIR="$DVC_CORE_DIR/dist/$DVC_PLATFORM"
  [[ ! -e "$DVC_OUTPUT_DIR" ]] || dvc_fail "Output already exists; preserve or move it before rebuilding: $DVC_OUTPUT_DIR"
  DVC_WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/doodleverse-build.XXXXXXXX")"
  DVC_SOURCE_DIR="$DVC_WORK_DIR/source"
  DVC_BUNDLE_NAME="doodleverse-core-experimental-$DVC_PLATFORM"
  DVC_STAGE_DIR="$DVC_WORK_DIR/$DVC_BUNDLE_NAME"
  mkdir -p "$DVC_SOURCE_DIR" "$DVC_STAGE_DIR/bin" "$DVC_STAGE_DIR/source" "$DVC_STAGE_DIR/licenses" "$DVC_STAGE_DIR/validation"

  # Fresh source only: never build in the maintainer's checkout or data folder.
  git -C "$DVC_SOURCE_DIR" init --quiet
  git -C "$DVC_SOURCE_DIR" remote add origin "$DVC_UPSTREAM_URL"
  git -C "$DVC_SOURCE_DIR" -c protocol.file.allow=never -c protocol.ext.allow=never fetch --no-tags --depth=1 origin "$DVC_UPSTREAM_COMMIT"
  git -C "$DVC_SOURCE_DIR" -c advice.detachedHead=false checkout --detach FETCH_HEAD
  [[ "$(git -C "$DVC_SOURCE_DIR" rev-parse HEAD)" == "$DVC_UPSTREAM_COMMIT" ]] || dvc_fail 'Upstream commit verification failed.'
  [[ -z "$(git -C "$DVC_SOURCE_DIR" status --porcelain)" ]] || dvc_fail 'The fetched upstream source is not clean.'
  git -C "$DVC_SOURCE_DIR" apply --check --index "$DVC_PATCH"
  git -C "$DVC_SOURCE_DIR" apply --index "$DVC_PATCH"
  git -C "$DVC_SOURCE_DIR" diff --cached --check
  DVC_PATCHED_TREE="$(git -C "$DVC_SOURCE_DIR" write-tree)"
  [[ "$DVC_PATCHED_TREE" != "$(git -C "$DVC_SOURCE_DIR" rev-parse 'HEAD^{tree}')" ]] || dvc_fail 'The patch did not change the source tree.'
  DVC_PATCH_SHA256="$(sha256sum "$DVC_PATCH" | cut -d ' ' -f 1)"
  SOURCE_DATE_EPOCH="$(git -C "$DVC_SOURCE_DIR" show -s --format=%ct HEAD)"
  export SOURCE_DATE_EPOCH

  git -C "$DVC_SOURCE_DIR" archive --format=tar --prefix=pepecoin-upstream/ "$DVC_UPSTREAM_COMMIT" | gzip -n > "$DVC_STAGE_DIR/source/upstream-source.tar.gz"
  git -C "$DVC_SOURCE_DIR" archive --format=tar --prefix=doodleverse-core-source/ "$DVC_PATCHED_TREE" | gzip -n > "$DVC_STAGE_DIR/source/patched-source.tar.gz"
  cp "$DVC_PATCH" "$DVC_STAGE_DIR/source/doodleverse.patch"
  cp "$DVC_SOURCE_DIR/COPYING" "$DVC_STAGE_DIR/licenses/Pepecoin-COPYING"
  cp "$DVC_REPO_ROOT/LICENSE" "$DVC_STAGE_DIR/licenses/build-integration-LICENSE"
  cp "$DVC_CORE_DIR/README-build.md" "$DVC_STAGE_DIR/README-build.md"
  mkdir -p "$DVC_STAGE_DIR/source/build-support"
  cp -R "$DVC_CORE_DIR/scripts" "$DVC_CORE_DIR/tests" "$DVC_STAGE_DIR/source/build-support/"
  cp "$DVC_REPO_ROOT/.github/workflows/doodleverse-core.yml" "$DVC_STAGE_DIR/source/build-support/"
  printf '%s\n' 'Experimental test-chain build. No production founder allocation is configured.' > "$DVC_STAGE_DIR/EXPERIMENTAL.txt"
  printf '%s\n' "Build workspace: $DVC_WORK_DIR" "Upstream: $DVC_UPSTREAM_COMMIT" "Patched tree: $DVC_PATCHED_TREE"
}

dvc_record_tools() {
  {
    printf 'Target: %s\n' "$DVC_PLATFORM"
    git --version
    python3 --version
    gcc --version
    g++ --version
    autoconf --version
    automake --version
    make --version
    if [[ -f /etc/os-release ]]; then cat /etc/os-release; fi
  } > "$DVC_STAGE_DIR/validation/build-tools.txt"
}

dvc_package() {
  local validation_status="$1"
  export DVC_UPSTREAM_URL DVC_UPSTREAM_COMMIT DVC_PATCH_SHA256 DVC_PATCHED_TREE DVC_PLATFORM DVC_STAGE_DIR
  DVC_VALIDATION_STATUS="$validation_status" python3 - <<'PY'
import hashlib
import json
import os
from pathlib import Path

stage = Path(os.environ['DVC_STAGE_DIR'])
files = {}
for path in sorted(stage.rglob('*')):
    if path.is_file():
        files[path.relative_to(stage).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {
    'schema': 1,
    'product': 'Doodleverse Core experimental',
    'platform': os.environ['DVC_PLATFORM'],
    'upstreamRepository': os.environ['DVC_UPSTREAM_URL'],
    'upstreamCommit': os.environ['DVC_UPSTREAM_COMMIT'],
    'patchSha256': os.environ['DVC_PATCH_SHA256'],
    'patchedGitTree': os.environ['DVC_PATCHED_TREE'],
    'validation': os.environ['DVC_VALIDATION_STATUS'],
    'productionReady': False,
    'filesSha256': files,
}
(stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
PY
  # Nothing from a runtime data directory or a build worker's environment is packaged.
  mkdir -p "$DVC_OUTPUT_DIR"
  if [[ "$DVC_PLATFORM" == windows-x86_64 ]]; then
    (cd "$DVC_WORK_DIR" && zip -X -r "$DVC_OUTPUT_DIR/$DVC_BUNDLE_NAME.zip" "$DVC_BUNDLE_NAME")
  else
    tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner -C "$DVC_WORK_DIR" -cf - "$DVC_BUNDLE_NAME" | gzip -n > "$DVC_OUTPUT_DIR/$DVC_BUNDLE_NAME.tar.gz"
  fi
  cp "$DVC_STAGE_DIR/manifest.json" "$DVC_OUTPUT_DIR/manifest.json"
  (cd "$DVC_OUTPUT_DIR" && sha256sum "$DVC_BUNDLE_NAME".* manifest.json > SHA256SUMS)
  printf 'Packaged %s\n' "$DVC_OUTPUT_DIR"
}

dvc_build_linux() {
  [[ $# -eq 0 ]] || dvc_fail 'Usage: bash doodleverse-core/scripts/build-linux.sh'
  dvc_prepare linux-x86_64
  [[ "$(uname -m)" == x86_64 ]] || dvc_fail 'This script produces the Linux x86_64 build only.'
  dvc_require gcc g++ ldd dpkg-query
  dvc_record_tools
  dpkg-query -W -f='${Package}\t${Version}\n' libssl-dev libssl3 libevent-dev libdb5.3++-dev libboost-system-dev libboost-filesystem-dev libboost-chrono-dev libboost-program-options-dev libboost-test-dev libboost-thread-dev > "$DVC_STAGE_DIR/validation/system-libraries.txt"
  (
    cd "$DVC_SOURCE_DIR"
    ./autogen.sh
    ./configure --without-gui --enable-wallet --enable-tests --disable-bench --disable-man --disable-zmq --without-miniupnpc --disable-upnp-default --enable-hardening
    make -j"$DVC_JOBS"
    # Pepecoin's original chain/genesis fixtures do not describe this new network.
    # Only the explicit Doodleverse consensus suite is represented as passing.
    ./src/test/test_pepecoin --run_test=doodleverse_tests,scrypt_tests --log_level=test_suite 2>&1 | tee "$DVC_STAGE_DIR/validation/consensus-tests.txt"
  )
  cp "$DVC_SOURCE_DIR/src/pepecoind" "$DVC_SOURCE_DIR/src/pepecoin-cli" "$DVC_STAGE_DIR/bin/"
  ldd "$DVC_STAGE_DIR/bin/pepecoind" > "$DVC_STAGE_DIR/validation/runtime-libraries.txt"
  ldd "$DVC_STAGE_DIR/bin/pepecoin-cli" >> "$DVC_STAGE_DIR/validation/runtime-libraries.txt"
  python3 "$DVC_CORE_DIR/tests/functional.py" --daemon "$DVC_STAGE_DIR/bin/pepecoind" --cli "$DVC_STAGE_DIR/bin/pepecoin-cli" 2>&1 | tee "$DVC_STAGE_DIR/validation/functional-tests.txt"
  dvc_package 'Doodleverse consensus suite, Scrypt vectors and isolated local regtest functional checks passed on Linux; the inherited Pepecoin full suite was not run.'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  dvc_build_linux "$@"
fi
