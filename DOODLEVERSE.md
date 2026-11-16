# Doodleverse: a network built by its people

Doodle Tick began with the loops of a telephone cord and a clock that visits every RGB color, one hour at a time. Doodleverse extends that idea: creators keeping their own work, sharing useful copies, playing together and checking the claims that travel with those copies.

The next direction is direct, encrypted peer connections without a required VPN provider, and **Doodleverse Coin (DVC)** with issuance that people can inspect. We are looking for human developers, maintainers, testers and community organizers to help make that work dependable.

## The disclosed founder allocation

The project owner has requested a **1,000,000 DVC founder allocation** for an eventual live network. This allocation must be disclosed before launch. A proposal binds the amount, founder public identity, network description and proof rules to a signature. A bounded, explicitly started GPU search can find a SHA-256 proof for that signed proposal. Other people can verify the signature and proof independently.

The first implementation is a **prelaunch allocation certificate**. It does not put a spendable balance on a running DVC blockchain. A successful proof establishes that its hash meets the stated target. It does not establish which GPU was used, how long someone worked, authorship, unique people, community agreement or economic value. Changing the founder or the signed proposal changes the proof challenge.

The owner has authorized publication of the [verified founder recipient certificate](founder-records/0.5.1b/README.md), including the selected public Coinbase wallet address, both public signatures and fresh 20-bit work. The original creator proof is preserved unchanged. The linked record includes its independent verification report, authorization expiry and prelaunch limitations; it is not an adopted live genesis or a spendable balance.

The **0.4b wallet-recipient update** links an existing v1 certificate to an address selected in the Coinbase Wallet Chrome extension. The original creator identity and the selected wallet both approve the proposed recipient, then a fresh GPU proof binds those approvals. The original v1 proof is preserved. This feature requests a message signature, with no token approval, transfer, contract deployment or spending permission. It does not add a token or spendable balance to Coinbase Wallet, and it does not establish a Coinbase listing or endorsement. See the [wallet-recipient guide](keeper/WALLET-RECIPIENT.md) for the supported accounts and verification limits.

The owner has now selected an independent native chain with **21 million DVC maximum: 1 million founder and 20 million mineable**. Version 0.6b implements the [fixed genesis and native rules](keeper/NATIVE-DVC.md), independently validated work and spends, supply accounting, fork choice and persistent node history. The founder address is `0x41ed762a78bf3bb6007770bda259d40bbeca2d93`. These native rules are separate from the archival certificates above. Certificates do not grant a mint function, and their expiry does not rewrite historical evidence or the chosen genesis. Wider node operation and adversarial review remain necessary; no investment return, exchange listing, redemption, liquidity or free service is promised.

Existing private garden Doodle Coins and the optional public-wallet DGT gardens keep their own rules and balances. A DVC certificate does not move, burn, back or convert either balance. The public garden contracts distributed in 0.2b remain a separate experimental feature.

## Communication first

The long-term ambition is a community-owned communications network that is free at the point of use: the owner's idea of **worldwide Ethernet**. Direct encrypted browser connections are one early component. Broad reach still requires routing, connectivity, relays, equipment, operators, abuse handling and resources. A browser app cannot supply that physical infrastructure by itself.

The initial direct connection design uses signed invitations, encrypted WebRTC data channels and two-sided spirograph key comparison. Connections depend on the networks involved. There is no implicit third-party relay account or guarantee of connectivity through every router. Wider discovery and operator-controlled relays need their own reviewed design and practical tests.

## The proposed foundation and food days

The owner's proposed **Moz Republika Socialist Foundation** would organize the communication effort first, then work toward **Doodle Tick Monthly Free Food Days** with local partners. Both are organizing goals. This repository does not establish a registered foundation, charitable status, a funded food program, a food entitlement or an event date.

Useful next work includes a public governance proposal, transparent responsibilities and costs, local connectivity trials and conversations with experienced community organizations. Food days need willing partners, an actual location, resources and an operating plan before they can be announced as available.

## Developers wanted

This project needs people who can review decisions and maintain what ships. Development has used AI coding tools; human review and field testing remain essential.

- **Networking:** signed signaling, connection recovery, NAT/relay testing, admission and abuse controls.
- **Protocol and accounting:** independently reproducible proof verification, wallet-recipient review, genesis/supply review, signed spends, fork and recovery rules.
- **GPU/browser engineering:** portable WebGPU compute, cancellation, device loss, power and time bounds, accessibility.
- **Home Assistant:** packaging, updates, HTTPS, migration and real-device testing.
- **Creators and organizers:** licensing workflows, documentation, usability and practical community pilots.

Start with a small reproducible issue or a focused pull request in the [Doodle Tick repository](https://github.com/moswald14/doodletick). Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). This is an invitation to open-source collaboration; no employment, payment, contributor coin award or administrative access is offered automatically.
