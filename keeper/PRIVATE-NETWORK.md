# Doodle Tick private network 0.1b

Games, file sharing and cross-computer garden access use Keepers on the **same private Tailscale network**. The local vault, recipe maker, workshop, replays and bot practice work without a peer connection.

## Connect your community

1. Install [Tailscale](https://tailscale.com/download) on each standalone computer and sign in. The Home Assistant app includes its own Tailscale device and offers a sign-in link through its Web UI.
2. Invite members through your Tailscale network administration page. Each member uses their own account. Unrelated networks using the same VPN product do not form one community; externally shared devices with another network's DNS suffix are deliberately excluded.
3. Run Keeper locally and open `http://127.0.0.1:4317`. Keep the same origin and browser for existing saved data.
4. Use **Check connection**. Ready status requires a running VPN, assigned interface and bound private listener. An online computer in the peer list is not proof that its Keeper is running.
5. For a room, choose **Invite friends → Open room for friends** and share the complete private room code. A directory may be hosted on another online Keeper. For the garden, everyone selects the same shared Keeper; separate Keepers hold separate currencies.
6. Compare each pairing's spirograph **and every group of the verification code** over a trusted call or in person. Both sides must confirm. Reject differences or unexpected invitations. File pairing uses its own signed invitation and answer.

Your network policy must allow TCP **4318** between intended participants. `tailscale-policy.example.hujson` is an example with placeholder accounts, not a replacement for an existing policy. Rules can be additive; review broad existing access before assuming a group restriction takes effect.

The app does not disable firewalls, set up a router port or DMZ, advertise an exit node, or create a public tunnel. Use connection diagnostics before changing network rules. The private helper requires Tailscale IPv4, a normal VPN adapter and Node.js 22 or later; userspace-only and IPv6-only setups are not supported. A mobile browser alone does not replace the required local helper for private multiplayer.

## What spirographs verify

A creator's identity seal is derived from their public key. Restoring the same key preserves its seal; changing a display name does not change it. New or temporary guest identities have different keys.

Pairing uses a signed invitation and an invitation-bound signed answer, with fresh connection identifiers and expiry. Both browsers derive the same digest, spirograph and readable comparison code. Data is withheld until both sides confirm. Invalid signatures, changed comparisons and expired invitations fail closed.

The drawing is a visual aid; compare the full code. Copying a picture does not prove possession of a signing key. Pairing verifies keys and a particular connection, not legal names, unique people, authorship or ownership. Recognize an existing creator by comparing the full fingerprint through a trusted channel. Vault unlocking still requires its password.

## Traffic and trust

The standalone browser UI and witness listen on loopback with Host and Origin checks. The peer listener binds to the device's Tailscale address; outbound peer sockets use that interface. Destinations are restricted to current same-network peers, with fixed supported ports. Arbitrary URLs, redirects and LAN targets are refused.

Private peer routes provide message channels, the room directory and signed garden operations. Browser Origin requests and unknown peer sources are refused. Random channel capabilities are directional and bound to the paired computer and channel. Ordered batches, expiry, bounded buffers and request limits constrain resource use.

Each browser talks through its own Keeper. Room hosts forward gameplay, and the selected garden Keeper records balances and trades. Directory traffic carries invitations and room metadata, not file bytes or game contents. Local helpers and the garden operator are trusted endpoints. Tailscale encrypts transport and may use encrypted relays when a direct connection is unavailable; this is not anonymous or infrastructure-free networking.

The Keeper rechecks membership and closes invalid channels. Short request failures and lost confirmations have bounded retry and duplicate protection. Long outages, closed hosts and restarts need fresh invitations; they do not resume an interrupted game or file transfer. Public pairing and public WebRTC fallback are disabled. Use 0.1b on all participating Keepers.

## Troubleshooting

- **Network unavailable:** check Tailscale sign-in and its own diagnostics, then refresh Keeper. The app must be able to query the local Tailscale service.
- **Keeper unreachable:** confirm both Keepers are open, in the same network, and allowed to reach TCP 4318. Only one native peer listener per computer is supported.
- **Different pairing patterns:** reject, verify the other party through a trusted channel, and make a fresh invitation.
- **Another VPN is active:** consult both VPN providers' current compatibility guidance. No machine-specific routing override is shipped or applied by Keeper.
- **Home Assistant wallet unavailable on HTTP:** use a trusted HTTPS Home Assistant address. Do not disable certificate validation or cryptographic checks.

A permitted recipient can copy content outside this app. Creative Commons records preserve credits and validate declared uses; they cannot control external use or prove ownership. Real multi-device VPN gameplay and trading remain separate acceptance checks; see [VALIDATION.md](VALIDATION.md).

Official references: [Tailscale installation](https://tailscale.com/download), [access grants](https://tailscale.com/docs/features/access-control/grants), [connection types](https://tailscale.com/docs/reference/connection-types), [other VPNs](https://tailscale.com/docs/reference/faq/other-vpns).
