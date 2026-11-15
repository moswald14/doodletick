# Doodle Tick · 0.1b

A private creator arcade with a phone-cord-inspired identity drawing, an hourly color clock and a Dot Wave mushroom garden. Run a Keeper on your own computer or Home Assistant.

[![Add Doodle Tick to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fmoswald14%2Fdoodletick)

**Experimental release.** The Home Assistant package has run on a Raspberry Pi 4. Real multi-device VPN play, HTTPS garden transactions, sustained load and backup restoration still need field testing. See [validation](keeper/VALIDATION.md).

## What it does

- Visits every RGB hex color once per pass, one color per hour; each pass starts red and ends green.
- Creates and imports Dot Wave mushroom recipes. Each unique recipe earns one in-app Doodle Coin per complete owned UTC hour in a shared garden.
- Transfers coins, buys decorations and trades mushroom generators through one authoritative Keeper.
- Offers three small multiplayer games, a world workshop, signed spirograph pairing, an encrypted browser vault and licensed peer file sharing.
- Switches automatically to a muted red night theme, with manual appearance controls.

Coins are game balances, with no cash redemption or cryptocurrency connection. Spirographs help compare signed keys; they do not establish a person's legal identity or prove authorship. Creative Commons checks preserve supplied attribution and validate declared uses inside the app; they cannot prevent copying outside it.

## Install in Home Assistant

Use Home Assistant OS with a 64-bit ARM or AMD64 system. Select the badge above, or add `https://github.com/moswald14/doodletick` under **Settings → Apps → Install app → Repositories**. Install **Doodle Tick Keeper**, enable startup as desired, then open its Web UI. The first installation builds from source and can take several minutes.

This is a Home Assistant **app/add-on repository**. [HACS does not distribute add-ons](https://www.hacs.dev/docs/faq/addons/). A real HACS dashboard companion is a separate future task.

Open Home Assistant over **HTTPS** to use the encrypted vault, planting and trading. The recipe maker also previews on ordinary HTTP. Connect the included Tailscale device to your private network; other players need compatible Keepers in that network. No public router ports or DMZ are required. Follow the [Home Assistant guide](doodletick/DOCS.md).

### Already running a local Doodle Tick app?

Keep that installation and its backup. A GitHub-repository installation receives a different app identifier and separate data storage. Adding this repository **does not migrate** the existing witness identity, garden balances, receipts or Tailscale state. Do not uninstall the local app to switch over; a tested migration procedure is still pending. Ordinary updates to the same installed app retain its persistent data.

## Desktop and Raspberry Pi OS

Download the appropriate asset from [Releases](https://github.com/moswald14/doodletick/releases/tag/0.1b). Desktop requires Node.js 22 or newer; Node 24 is used by the tests. Extract the desktop ZIP, run `node server.mjs` inside its `doodletick-keeper` folder, and open **http://127.0.0.1:4317**. No npm dependencies are required.

For a source checkout:

```sh
cd keeper
node server.mjs
```

For Raspberry Pi OS, use the separate tarball and its [setup guide](keeper/pi/START-HERE.md). It includes an installer and file checksums. Raspberry Pi OS service installation is separate from the Home Assistant app and still needs a physical service-install test.

## Develop with us

The [AI coding team](AI_TEAM.md) is organized into package review, build automation, contributor documentation and release integration. These are roles in the development chat, not hired maintainers or a continuously running service. The repository owner reviews releases and access changes.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](ARCHITECTURE.md) and the [roadmap](ROADMAP.md). The next priorities are clear HTTPS onboarding, physical two-device VPN verification and a safe local-app migration path.

```sh
node scripts/sync-ha.mjs --check
node scripts/check-repository.mjs
node scripts/test.mjs
```

Canonical runtime source lives in `keeper/`. Run `node scripts/sync-ha.mjs` after changing it to refresh `doodletick/keeper/`. Never commit live `.doodletick` data or personal backup files. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License and credits

Copyright © 2026 moswald14 and contributors. Included project code, including the shared Dot Wave sound modules, is released under **GNU GPL version 3 only**. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). This permission applies to the files in this repository; it does not relicense other Dot Wave Studio products.

Your writing, audio, artwork, vault exports and shared files remain separate from the code license. Their creators choose applicable licenses; existing attribution stays attached.
