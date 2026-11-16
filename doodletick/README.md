# Doodle Tick Keeper · 0.5b

Creator arcade, hourly color clock and Dot Wave mushroom garden for Home Assistant OS. This source-built app/add-on supports aarch64 and amd64.

Install through the [Doodle Tick repository](https://github.com/moswald14/doodletick), then open its Web UI through Home Assistant over HTTPS. Games and files pair directly between browsers with signed invitations, encrypted WebRTC and a spirograph comparison. No VPN is bundled. Direct reachability is required; no Internet relay is configured.

Read [DOCS.md](DOCS.md) and [HTTPS.md](HTTPS.md). Room directory codes and private garden trading work only for users of this same Keeper. Browser hosts and file holders must keep their pages open.

The global **Weather & music** panel adds optional city weather and original local soundscapes. Search/select a city manually, use C/F or Clear location, and start music with Play; hiding the tab pauses audio. City queries and selected coordinates go directly to Open-Meteo, without geolocation permission. Forecast attribution and the free service's non-commercial terms apply. See [weather and music controls](../keeper/README.md#weather-and-music).

A repository installation has separate data from a pre-existing local app. The [offline migration procedure](MIGRATION.md) preserves the witness, receipts and garden in a verified one-time import into an unused target. Earlier VPN state, when present, is preserved inert for rollback. Installing the repository alone does not migrate anything.

Private Keeper coins and public wallet DGT gardens have separate balances. Doodleverse Coin produces a separate prelaunch certificate with no balance or deployed DVC contract. The 0.4b recipient flow links that certificate to a self-custody wallet through message signatures and fresh GPU work. Public transactions require wallet confirmation and network fees. No shared deployed contract, redemption or token value is supplied. See [public-mode rules](../contracts/README.md).

The 0.4b repository update and restart were verified over HTTPS with the original Keeper witness and receipt count preserved. The 0.5b suite passed 263 checks and Chrome weather/music-control checks passed; its live Home Assistant update and audible output remain pending. Actual Coinbase signing and real wallet transactions remain untested. Same-machine native Chrome pairing passed in the earlier release. See [validation](../keeper/VALIDATION.md) for evidence and limits. Source is GPL-3.0-only under the repository's LICENSE.
