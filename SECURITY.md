# Security reporting

The supported release is **0.3b**. Earlier releases remain archived; separate backports are not promised. This is experimental software for trusted communities, with an optional public-wallet garden and a separate prelaunch DVC proof tool. It has not had a comprehensive independent security audit.

Use **Security → Report a vulnerability** on the repository when available. Otherwise, request a private reporting channel without publishing exploitable details. Never post witness keys, private wallet/vault material, legacy VPN state, sign-in URLs, personal files or unredacted logs. Include the version, component, disposable reproduction and observed impact. No bounty or response-time guarantee is offered.

## Boundaries to preserve

- Keep the standalone service on loopback and Home Assistant behind authenticated HTTPS ingress. Do not publish its internal HTTP endpoints or disable origin/signature checks.
- Compare the full spirograph code through a trusted channel; both people must confirm. Signed invitations bind native transport descriptions. No outside relay is configured automatically; arbitrary remote HTTP bridges are removed.
- Protect browser backups separately from Keeper backups. Do not run restored clones concurrently. The offline importer accepts only verified state into an unused target and records completion; legacy VPN files stay inert.
- Mining must be explicit, bounded and cancellable. Never enable hidden mining, automatic proof submission or silent CPU fallback presented as GPU work.

## Coins and public proofs

Private gardens trust their Keeper operator and clock. Separate public DGT gardens require wallet confirmation and network fees; each address/chain has its own balance and cap. No bridge, redemption or promised value exists. Exact runtime matching and tests do not certify a wallet, network or economic system. See [the public garden guide](contracts/README.md).

DVC verifies a self-signed prelaunch proposal and a hash target for a disclosed 1,000,000 founder allocation. A valid certificate does not prove official project authority, which GPU ran, network adoption, live issuance or spendability. Anyone can make their own signed proposal. Compare full founder and manifest references with an independently trusted project publication. Future genesis, total supply, transactions and consensus remain unadopted.

Real public-wallet transactions, physical cross-network operation, production consensus and sustained adversarial load remain outside current verification. Maintainer access is not automatically granted to contributors or AI agents.
