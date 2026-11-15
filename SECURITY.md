# Security reporting

This is experimental software for a trusted private community. It has not had a comprehensive independent security audit.

Use the repository's **Security → Report a vulnerability** option for confidential reports when available. If it is unavailable, open an issue requesting a private reporting channel without describing an exploitable weakness or including secrets. Do not post witness keys, browser vaults, passwords, Tailscale state, sign-in URLs, personal files or unredacted diagnostic logs in public issues.

Include the release number, affected component, a minimal reproduction using disposable identities, expected behavior and observed behavior. Reports involving signatures, overspending, identity replacement, ingress access or private-data exposure are priorities. No response-time guarantee or bounty is offered.

Use supported browsers, HTTPS for Home Assistant's cryptographic features and a private VPN for peer traffic. Keep vault exports and Keeper backups separately protected. Do not disable origin, signature or ingress checks to fix a connection problem.

The initial supported public release is 0.1b. Fixes are prepared through reviewed changes and a numbered release. Administrative access is not automatically granted to contributors or AI agents.
