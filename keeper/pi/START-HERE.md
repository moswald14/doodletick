# Doodle Tick on Raspberry Pi OS

This guide is for a Raspberry Pi 4 running **Raspberry Pi OS Lite 64-bit** or a supported ARM64 Debian installation with systemd. For **Home Assistant OS**, use the Home Assistant app instead; do not run this installer on its host.

The Pi keeps a private room directory, witness and optional shared garden online. Players still host game simulation in their browsers, and file libraries remain in participating browsers. This is not unattended P2P disk storage or a dedicated game server.

## Prepare the Pi

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to prepare suitable storage. Confirm the selected drive and back up anything needed before writing; imaging replaces its contents. Choose the 64-bit OS, a hostname and your own username, set the password privately, and enable SSH if needed. Ethernet is simplest; otherwise configure Wi-Fi in Imager. Wait for writing and verification to finish.

A Pi 4 may need updated boot firmware for USB storage. Follow the [official boot guidance](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#usb-mass-storage-boot). Use adequate power and stop to diagnose boot or storage faults instead of repeatedly re-imaging the drive.

## Download the release bundle

Open the project's [Releases page](https://github.com/moswald14/doodletick/releases) and download the **Raspberry Pi support `.tar.gz` asset** plus its published checksum information. Use the selected release's actual filename in the commands below. Do not install directly from a Git checkout or GitHub's generic source-code archive: the installer requires the complete support bundle with its generated `SHA256SUMS` and runtime inventory.

Copy the bundle to your Pi using your normal SSH/file-transfer method. Confirm the Pi's SSH host fingerprint through a trusted source on first connection; enter credentials directly into your SSH client, not an issue or chat.

On the Pi, first calculate the archive's SHA-256 and compare it with the checksum published alongside that exact release. Then extract it and verify the internal inventory:

```bash
sha256sum doodletick-pi-0.1b-pi.1.tar.gz
tar -xzf doodletick-pi-0.1b-pi.1.tar.gz
cd doodletick-keeper
sha256sum --check --strict SHA256SUMS
```

The filename above is the 0.1b example; substitute the selected bundle's filename when using another release. Stop on a mismatch or missing checksum file. Review `pi/install.sh` before granting it administrative access.

## Install and connect

From the verified bundle folder:

```bash
sudo bash pi/install.sh
sudo tailscale up --accept-dns=false --accept-routes=false
```

The installer checks the supported ARM64 OS and bundle hashes, installs a private pinned Node.js runtime, adds Tailscale from its signed Debian repository when absent, and creates a dedicated system account and startup service. It does not format drives or open router ports. Follow Tailscale's sign-in link to join the same private network as the other Keepers. Keep that link private.

Run the packaged check with the Node version installed by this bundle:

```bash
/opt/doodletick-keeper/node-v24.22.3/bin/node /opt/doodletick-keeper/current/pi/check.mjs --require-vpn
```

A failed check is not a successful installation. In the desktop app, refresh the private network and select the Pi as the room directory or shared garden Keeper. Room invitations still require spirograph comparison. The Pi's administrative UI stays on its own loopback; its private VPN address is not a public browser UI.

## Operation and backups

```bash
systemctl status doodletick-keeper --no-pager
sudo journalctl -u doodletick-keeper -n 40 --no-pager
sudo systemctl restart doodletick-keeper
```

Keep power and network connected, and shut down cleanly before removing storage. To stop automatic startup, use `sudo systemctl disable --now doodletick-keeper`; this preserves persistent data.

Private Keeper data lives in `/var/lib/doodletick-keeper`. Back it up privately while the service is stopped, retaining the garden ledger and original witness key together. Browser vault/files/arcade backups are separate. Temporary locks live under `/run/doodletick-keeper`; do not delete persistent state as a startup repair. Never run two restored clones of one witness or VPN identity.

## Validation limit

The separate Raspberry Pi OS installation, reboot recovery, storage/power recovery and PC-to-Pi connections have not been verified. A successful ARM64 Home Assistant container deployment is different evidence. Acceptance requires the service to survive a Pi reboot with the same witness identity, then a real two-player room and shared garden check. Use disposable data for initial testing.
