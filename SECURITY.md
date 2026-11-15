# Security reporting

The supported release is **0.2b**. The archived 0.1b baseline remains available for historical reference; separate backports are not promised. This is experimental software for trusted private communities with an optional public-wallet mode. Neither the application nor its contract has had a comprehensive independent security audit.

Use the repository's **Security → Report a vulnerability** option for confidential reports when available. If it is unavailable, open an issue requesting a private reporting channel without describing an exploitable weakness or including secrets. Do not post witness keys, browser vaults, passwords, wallet recovery phrases/private keys, Tailscale state, sign-in URLs, personal files or unredacted diagnostic logs in public issues.

Include the release number, affected component, a minimal reproduction using disposable identities, expected behavior and observed behavior. Reports involving signatures, overspending, replay, supply limits, wallet/network changes, identity replacement, ingress access or private-data exposure are priorities. No response-time guarantee or bounty is offered.

Use supported browsers, HTTPS for Home Assistant's cryptographic features and a private VPN for peer traffic. Keep vault exports and Keeper backups separately protected. Do not disable origin, signature or ingress checks to fix a connection problem.

The offline migration requires both installations to remain stopped until the copied identity is ready for cutover. Staging and unencrypted backup files contain private keys; keep them on the authorized Home Assistant system with restricted access and remove temporary copies after verified cutover. Never run restored clones together. Follow [MIGRATION.md](doodletick/MIGRATION.md); fixture tests do not establish a successful live migration.

Public mode uses the player's existing injected wallet. Each public transaction requires wallet confirmation and can incur network fees, including when it fails. The app does not request a recovery phrase, choose a public RPC endpoint or bridge private coins to public tokens. Public addresses, recipe fingerprints and transactions are observable on the selected chain. A matching contract runtime does not certify the network, wallet provider or token value. There is no shared deployment, guaranteed value, redemption or liquidity supplied by this project.

Optional proof mining is a bounded game mechanic, not the network's consensus mechanism. Public issuance has contract limits, but fingerprints do not prove authorship and wallet limits do not prevent multiple-wallet farming. Submitted transactions can remain pending, be replaced or be reorganized; inspect wallet activity before repeating an uncertain action. See the [public-mode rules and verification limits](contracts/README.md).

Real wallet/network transactions, the actual Home Assistant 0.2b migration and sustained adversarial operation remain unverified. Fixes are prepared through reviewed changes and a numbered release. Administrative access is not automatically granted to contributors or AI agents.
