# Doodle Tick direct connections · 0.4b

Games and files now use native browser WebRTC with encrypted DTLS channels. Doodle Tick does not install or run Tailscale. The local Keeper still stores its witness, receipts and garden; its browser service stays on loopback, or behind authenticated Home Assistant ingress.

## Pair with a friend

1. Open this release in a current browser over HTTPS or localhost. Preserve your existing browser origin and identity, or restore your own backups deliberately.
2. In **Doodleverse → Invite friends**, the host creates an invitation. Send the complete code privately to the intended friend; it contains connection addresses.
3. The guest pastes it and chooses **Answer invitation**, then returns the answer. The host pastes that answer and chooses **Finish pairing**.
4. Compare both spirographs **and every group of the verification code** over a trusted call or in person. Both players must confirm. Reject any mismatch or unexpected pairing.
5. Keep both pages open. **Files & peers** uses the same invitation/answer/comparison flow with its own connection and licensed library.

Use 0.3b or later on both sides. Old VPN invitation codes are unsupported; create fresh codes. Saved creator keys, signed entries, receipts and garden records retain their existing formats.

## Reachability and room codes

No third-party STUN/TURN service or Internet relay is configured. Browsers gather direct host candidates completely before an invitation is signed. The browsers need a reachable route, commonly on the same local network. Router isolation, browser policy or separate home networks can prevent connection. HTTPS access to a Keeper does not itself provide a route between two players.

A short room code and the room list work only for browsers using **this same Keeper**. They are not an Internet directory. Players on separate Keepers exchange full signed invitations. The game host simulates its room and forwards gameplay to its guests; closing that browser ends the session. There is no automatic host migration.

Garden operations also stay on this same Keeper. Each Keeper has a separate ledger and issuer. Direct browser pairing does not forward another Keeper's garden requests. A saved remote garden selection remains marked unavailable until the player explicitly chooses a different local garden; previous balances and issuer pins have not been moved or deleted.

## What pairing protects

The signed invitation includes complete connection information and the native DTLS certificate fingerprint. Its signed answer is bound to that invitation. Native WebRTC validates the certificate and encrypts the data channel; Doodle Tick waits for both spirograph confirmations before processing game or file data. Ordered reliable channels retain the app's bounded chunks, buffers and license checks. Invalid signatures, altered descriptions, incomplete address gathering and expired codes fail closed.

The drawing helps compare keys and a particular connection. It does not establish a legal name, unique person, authorship or ownership. Copying a drawing does not give someone its signing key. Compare the full creator fingerprint through a trusted channel to recognize an existing creator. Vault unlocking still requires its password.

The local UI checks Host and Origin. Home Assistant additionally authenticates ingress; forwarded headers do not grant access. The old remote HTTP peer listener and proxy routes are removed. No public router port, DMZ, tunnel device or network-administration capability is required.

## Storage and recovery

Writing, licensed files and arcade saves stay in the browser. Sharing requires a holder's library to be open and unlocked; this is not unattended disk hosting. A recipient can copy content outside the app. Creative Commons checks preserve credits and validate declared uses but cannot enforce outside behavior.

Keep separate browser backups and the Keeper's stopped-data backup. Upgrading the same Keeper preserves its identity and garden. Any earlier Home Assistant VPN state stays untouched and inert for rollback; the new app never starts a VPN from it. Other VPN software already installed on a computer is not uninstalled or reconfigured.

Brief local API reads have bounded retries. Signed garden actions use the existing explicit retry protection. Interrupted peer sessions need fresh invitations; incomplete incoming file bytes are discarded. Peer transfers do not resume after a restart.

## Checks and troubleshooting

- **No secure context:** use the actual configured HTTPS address, or localhost on a standalone computer. Do not bypass certificate or signature checks.
- **No complete invitation:** address gathering failed or timed out. Close the attempt and try again on a reachable network.
- **Direct connection failed:** confirm both pages remain open and can communicate directly. This release has no relay fallback; do not expose the Keeper's local service publicly to repair it.
- **Different patterns:** reject, verify your friend through a trusted channel, and make a fresh invitation.
- **Remote garden unavailable:** its ledger was not migrated by connecting browsers. Open the intended Keeper through its authorized UI; a different Keeper has different balances.

Native signed game pairing, two manual spirograph confirmations and bidirectional messages passed in Chrome using two connections on one machine. Physical two-device connections, separate-home NAT traversal and sustained load remain unverified. See [VALIDATION.md](VALIDATION.md) for the full evidence.

Protocol references: [WebRTC browser API](https://www.w3.org/TR/webrtc/) and [WebRTC security architecture](https://www.rfc-editor.org/rfc/rfc8827.html).
