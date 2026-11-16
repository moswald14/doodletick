# Doodle Tick on Raspberry Pi OS

This guide is for a Raspberry Pi 4 running **Raspberry Pi OS Lite 64-bit** or a supported ARM64 Debian installation with systemd. For **Home Assistant OS**, use the Home Assistant app instead; do not run this installer on its host.

The Pi keeps its local room directory, witness and shared garden online. Players host game simulation and encrypted WebRTC connections in their browsers; file libraries remain in those browsers. This is not unattended P2P disk storage or a dedicated game server.

## Prepare the Pi

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to prepare suitable storage. Confirm the selected drive and back up anything needed before writing; imaging replaces its contents. Choose the 64-bit OS, a hostname and your own username, set the password privately, and enable SSH if needed. Ethernet is simplest; otherwise configure Wi-Fi in Imager. Wait for writing and verification to finish.

A Pi 4 may need updated boot firmware for USB storage. Follow the [official boot guidance](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#usb-mass-storage-boot). Use adequate power and stop to diagnose boot or storage faults instead of repeatedly re-imaging the drive.

## Download the release bundle

Open the project's [Releases page](https://github.com/moswald14/doodletick/releases) and download the **Raspberry Pi support `.tar.gz` asset** plus its published checksum information. Use the selected release's actual filename in the commands below. Do not install directly from a Git checkout or GitHub's generic source-code archive: the installer requires the complete support bundle with its generated `SHA256SUMS` and runtime inventory.

Copy the bundle to your Pi using your normal SSH/file-transfer method. Confirm the Pi's SSH host fingerprint through a trusted source on first connection; enter credentials directly into your SSH client, not an issue or chat.

On the Pi, first calculate the archive's SHA-256 and compare it with the checksum published alongside that exact release. Then extract it and verify the internal inventory:

```bash
sha256sum doodletick-pi-0.6b-pi.1.tar.gz
tar -xzf doodletick-pi-0.6b-pi.1.tar.gz
cd doodletick-keeper
sha256sum --check --strict SHA256SUMS
```

The filename above is the 0.6b example; that release is still in preparation. Use it only once published, and substitute the selected bundle's actual filename for another release. Stop on a mismatch or missing checksum file. Review `pi/install.sh` before granting it administrative access.

## Install and connect

From the verified bundle folder:

```bash
sudo bash pi/install.sh
```

The installer checks the supported ARM64 OS and bundle hashes, installs a private pinned Node.js runtime, and creates a dedicated system account and startup service. It does not install or start a VPN, format drives or open router ports. Existing VPN software on the Pi is not uninstalled or reconfigured.

Run the packaged check with the Node version installed by this bundle:

```bash
/opt/doodletick-keeper/node-v24.22.3/bin/node /opt/doodletick-keeper/current/pi/check.mjs
```

A failed check is not a successful installation. The obsolete `--require-vpn` flag reports an error; it does not enroll a device. The Pi's UI stays on its own loopback and cannot be opened directly at its LAN address.

Use an authenticated SSH tunnel from your computer, replacing the account and hostname with your actual Pi settings:

```sh
ssh -N -L 127.0.0.1:4317:127.0.0.1:4317 YOUR_PI_USER@YOUR_PI_HOST
```

Keep that SSH connection open and visit **http://127.0.0.1:4317**. Port 4317 on your computer must be free; stop another local Keeper first. Use a separate browser profile for this Pi Keeper so the same localhost address does not silently mix with a desktop Keeper's storage or issuer pins. Export existing browser backups before changing endpoints and restore the same creator vault deliberately when needed. Do not expose the Pi's local service through a router port.

Room directory codes and garden trading work for players opening this same Keeper through their own authorized access. Between separate Keepers, use full signed invitation and answer codes for games/files, then compare both spirographs. WebRTC has no STUN/TURN service or Internet relay configured, so browser peers need direct reachability; an SSH connection to the Pi does not itself provide a route between players.

## Operation and backups

```bash
systemctl status doodletick-keeper --no-pager
sudo journalctl -u doodletick-keeper -n 40 --no-pager
sudo systemctl restart doodletick-keeper
```

Keep power and network connected, and shut down cleanly before removing storage. To stop automatic startup, use `sudo systemctl disable --now doodletick-keeper`; this preserves persistent data.

Private Keeper data lives in `/var/lib/doodletick-keeper`. Back it up privately while the service is stopped, retaining the garden ledger and original witness key together. Browser vault/files/arcade backups are separate. Temporary locks live under `/run/doodletick-keeper`; do not delete persistent state as a startup repair. Never run two restored clones of one witness identity. Retain older private VPN backups separately if you need to roll back to an earlier release.

## Validation limit

The installer passed shell syntax checking, but Raspberry Pi OS service installation, reboot recovery, storage/power recovery and PC-to-Pi access remain unverified. Earlier ARM64 Home Assistant container evidence is a different deployment. Acceptance requires a Pi reboot with the same witness identity, authorized browser access, a real two-player direct connection and a same-Keeper garden check. Use disposable data initially.
