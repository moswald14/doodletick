# Open Doodle Tick securely

The Keeper panel checks **Browser security** and **Direct pairing** separately. HTTPS makes browser signing available; it does not guarantee a reachable peer connection. Recipe previews and the clock can work while browser signing is unavailable; unlocking a vault, planting and trading require browser cryptography.

Open the configured HTTPS address for the **whole Home Assistant frontend**, sign in normally, then open Doodle Tick from its sidebar. The app checks the actual secure context and Web Crypto availability. It does not invent an address, change certificates or disable cryptographic verification.

## Choose the connection already configured for your home

- **Home Assistant Cloud:** if remote access is enabled with the owner's agreement, use the HTTPS address shown by Home Assistant Cloud. It handles the encrypted connection. The app cannot enable this service or read its private address. [Official remote-access guide](https://www.home-assistant.io/docs/configuration/remote/)
- **An existing HTTPS reverse proxy:** use its configured address. Home Assistant must trust the actual proxy; retain its authentication. Consult the HTTP settings appropriate to the installed Home Assistant version. [Official HTTP guide](https://www.home-assistant.io/integrations/http/)

Changing an address from `http` to `https` alone does not configure HTTPS. Do not bypass certificate errors. An HTTPS iframe within an insecure outer page can still lack a secure context; open Home Assistant itself securely.

Doodle Tick stays behind authenticated ingress. Never point a TLS proxy directly at its Keeper port or accept forwarded headers as a substitute for ingress authentication. Home Assistant authenticates the browser and the Supervisor forwards authorized requests to the app. [Official ingress guide](https://contributors.home-assistant.io/apps/guides/ingress/)

## Keep your identity when changing addresses

Browser storage belongs to an origin: scheme, hostname and port. A new HTTPS address does not automatically contain vaults or files saved at an old address. Export existing browser backups before the change and restore the same identity at the destination. Do not create a replacement identity to recover an existing garden balance. Keeper data and its witness remain separate from browser data.

When the panel reports **Secure browser connection ready**, unlock the vault and join this Keeper's garden. For games and files, exchange a signed invitation and answer and compare both spirographs. WebRTC has no STUN/TURN service or Internet relay configured, so the two browsers still need direct reachability. Garden actions and short directory codes are local to this same Keeper.

If status becomes unavailable, reopen Doodle Tick through Home Assistant or use **Check again**. The app has no VPN sign-in step in 0.3b. Automated checks cover secure-context detection, local-only status, serialized requests, timeouts and expired-session handling. Live Home Assistant HTTPS access has worked, but the 0.3b target app and its data cutover remain pending. A local fixture does not verify a physical two-device route or another home's certificate.
