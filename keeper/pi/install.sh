#!/usr/bin/env bash
# Run on the Pi, from the extracted, checksum-verified Pi support bundle.
set -euo pipefail
umask 022
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
die() { printf '%s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die 'Run: sudo bash pi/install.sh'
[[ $(uname -s) == Linux && $(uname -m) == aarch64 ]] || die 'Use Raspberry Pi OS Lite (64-bit) on the Pi.'
[[ $(dpkg --print-architecture) == arm64 ]] || die 'A 64-bit ARM operating system is required.'
[[ -d /run/systemd/system ]] || die 'This installer needs a normal Raspberry Pi OS boot with systemd.'
source /etc/os-release
[[ ${ID:-} == debian || ${ID:-} == raspbian ]] || die 'Supported systems: Raspberry Pi OS / Debian.'
case ${VERSION_CODENAME:-} in bookworm|trixie) ;; *) die 'This OS release needs review before adding the Tailscale repository.' ;; esac
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ -f $source_dir/SHA256SUMS && -f $source_dir/pi/runtime-files.txt ]] || die 'Extract the complete Pi release bundle first.'
(cd -- "$source_dir" && sha256sum --check --strict SHA256SUMS >/dev/null) || die 'The package checksum check failed. Nothing was installed.'

install_root=/opt/doodletick-keeper
release_id=0.1b-pi.1
release_dir=$install_root/releases/$release_id
node_version=v24.22.3
node_archive=node-$node_version-linux-arm64.tar.xz
node_sha256=6e51a2ada00f0011cc266f65d98922b403d7ad88f809ca2aa615a5fe1ce6e86c
node_dir=$install_root/node-$node_version
unit=/etc/systemd/system/doodletick-keeper.service
account=doodletick-keeper
[[ ! -L $install_root && ! -L $unit ]] || die 'An installation path is a symbolic link; review it before continuing.'
if [[ -e $install_root ]]; then
  [[ -f $install_root/.managed-by-doodletick-pi && $(cat "$install_root/.managed-by-doodletick-pi") == v1 ]] || die 'The existing installation folder is not managed by this installer.'
elif [[ -e $unit ]]; then
  die 'An existing Keeper service needs review before installation.'
fi
if id "$account" >/dev/null 2>&1; then
  [[ $(id -u "$account") -gt 0 && $(id -u "$account") -lt 1000 && $(id -gn "$account") == "$account" && $(getent passwd "$account" | cut -d: -f6) == /var/lib/doodletick-keeper && $(getent passwd "$account" | cut -d: -f7) == /usr/sbin/nologin ]] || die 'An existing account with the service name is not the expected system account.'
fi

# Only one installer may modify this named installation at a time.
exec 9>/run/lock/doodletick-keeper-install.lock
flock -n 9 || die 'Another Keeper installer is running.'
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils
if ! command -v tailscale >/dev/null 2>&1; then
  repo=/etc/apt/sources.list.d/tailscale.list
  expected_repo="deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/debian $VERSION_CODENAME main"
  if [[ -e $repo ]]; then
    [[ ! -L $repo && $(cat "$repo") == "$expected_repo" && -s /usr/share/keyrings/tailscale-archive-keyring.gpg ]] || die 'An existing Tailscale repository differs from this setup; review it first.'
  else
    curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.noarmor.gpg" -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    chmod 0644 /usr/share/keyrings/tailscale-archive-keyring.gpg
    printf '%s\n' "$expected_repo" > "$repo"
    chmod 0644 "$repo"
  fi
  apt-get update
  apt-get install -y --no-install-recommends tailscale
fi

install -d -m 0755 "$install_root" "$install_root/releases"
printf 'v1\n' > "$install_root/.managed-by-doodletick-pi"
stage=$(mktemp -d "$install_root/.stage.XXXXXXXX")
cleanup() {
  if [[ -n ${stage:-} && $stage == /opt/doodletick-keeper/.stage.* && -d $stage && ! -L $stage ]]; then
    rm -rf -- "$stage"
  fi
}
trap cleanup EXIT
if [[ ! -e $node_dir ]]; then
  printf 'Downloading the verified ARM64 Node.js runtime...\n'
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' "https://nodejs.org/dist/$node_version/$node_archive" -o "$stage/$node_archive"
  printf '%s  %s\n' "$node_sha256" "$stage/$node_archive" | sha256sum --check --strict
  mkdir "$stage/node"
  tar --extract --xz --file "$stage/$node_archive" --directory "$stage/node" --strip-components=1 --no-same-owner
  mv -- "$stage/node" "$node_dir"
fi
[[ ! -L $node_dir && $("$node_dir/bin/node" --version) == "$node_version" ]] || die 'The installed private Node.js runtime needs review.'

# Copy only the published runtime allowlist, never a local vault or witness key.
install -d -m 0755 "$stage/release"
while IFS= read -r file; do
  [[ $file =~ ^(server\.mjs|garden-ledger\.mjs|vpn-network\.mjs|rendezvous\.mjs|package\.json|LICENSE|THIRD_PARTY_NOTICES\.md|public/[a-z0-9.-]+|pi/check\.mjs)$ && $file != *..* ]] || die 'Invalid runtime file list.'
  [[ -f $source_dir/$file && ! -L $source_dir/$file ]] || die 'Missing or linked runtime file.'
  install -D -m 0644 "$source_dir/$file" "$stage/release/$file"
done < "$source_dir/pi/runtime-files.txt"
cp -- "$source_dir/pi/runtime-files.txt" "$stage/release/runtime-files.txt"
if [[ -e $release_dir ]]; then
  [[ ! -L $release_dir ]] || die 'The existing release is a link; review it first.'
  while IFS= read -r file; do cmp -- "$stage/release/$file" "$release_dir/$file" >/dev/null || die 'This release has changed. Use a new release number.'; done < "$source_dir/pi/runtime-files.txt"
else
  mv -- "$stage/release" "$release_dir"
fi
if ! id "$account" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/doodletick-keeper --no-create-home --shell /usr/sbin/nologin "$account"
fi
[[ ! -e $install_root/current || -L $install_root/current ]] || die 'The current-release path is not a managed link.'
previous=$(readlink "$install_root/current" || true)
[[ -z $previous || $previous == /opt/doodletick-keeper/releases/* ]] || die 'The previous release points outside this installation.'
if systemctl cat doodletick-keeper.service >/dev/null 2>&1; then systemctl stop doodletick-keeper.service; fi
ln -sfn -- "$release_dir" "$install_root/current"
install -m 0644 "$source_dir/pi/doodletick-keeper.service" "$unit"
systemctl daemon-reload
systemctl enable --now tailscaled.service
systemctl enable --now doodletick-keeper.service
healthy=false
for attempt in {1..12}; do
  if "$node_dir/bin/node" "$release_dir/pi/check.mjs" > "$stage/check.txt" 2>&1; then healthy=true; break; fi
  sleep 1
done
if [[ $healthy != true ]]; then
  cat "$stage/check.txt"
  if [[ -n $previous && $previous != "$release_dir" ]]; then
    ln -sfn -- "$previous" "$install_root/current"
    systemctl restart doodletick-keeper.service
  fi
  die 'Keeper did not become healthy. Its private data was preserved; check the service journal.'
fi
cat "$stage/check.txt"
printf '\nInstalled. Keeper will start automatically when the Pi boots.\n'
printf 'Next: sudo tailscale up --accept-dns=false --accept-routes=false\n'
printf 'Sign in using the SAME Tailscale network as your Windows computer.\n'
printf 'Then: %s/bin/node %s/current/pi/check.mjs --require-vpn\n' "$node_dir" "$install_root"
