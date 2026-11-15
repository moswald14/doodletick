# Doodleverse private arcade 0.1b

## Play and invite friends

Start Keeper and open `http://127.0.0.1:4317/#arcade`. **Enter the Doodleverse** creates a temporary guest. For saved profiles, worlds and match history, create or unlock **My vault** first. Guest identities disappear when their page closes; individual exports remain available.

The clearing holds up to four people. Move with WASD, arrow keys or touch controls; chat or send an emote. The host chooses a game and players mark themselves ready. Empty seats can use visibly marked practice bots.

| Game | Play | Finish |
| --- | --- | --- |
| Stardust Dash | Move, collect stars and dash | Most stars after the selected round duration |
| Color Conquest | Choose a color to expand into connected neutral territory | Largest territory after the move limit or a filled board |
| Four to Orbit | Drop a moon into a column | Four connected moons, or a draw when the board fills |

Four to Orbit has two players and optional spectators. The host can pause, remove a player or return to the clearing. A participating player's departure cancels an active round; the host closing or locking their Keeper ends the room. There is no automatic host migration.

Everyone uses the same private Tailscale network and runs a Keeper. The host opens **Invite friends → Open room for friends** and shares the full private room code. Friends choose **Join a friend**. Both people compare the fresh spirographs and every group of the code over a trusted channel, then confirm. Game contents are withheld until both confirmations succeed. File pairing has its own invitation and comparison. See [PRIVATE-NETWORK.md](PRIVATE-NETWORK.md).

## Worlds and credits

The workshop edits a 28 × 18 map with mouse or keyboard controls. Undo keeps the last 30 strokes. Keep all four center spawns connected and at least 80 tiles reachable. The map and race rules affect the clearing and Stardust Dash; all three games remain available in each room.

Save up to 20 local worlds with an unlocked identity. World editing is host-controlled, so collaboration means playing, sharing copies and publishing credited remixes. Simultaneous painting is not implemented.

Before hosting a custom world, add credits, choose a supported Creative Commons license and confirm your rights. **Play this world** signs its exact bytes and license record. Guests verify the record and can inspect **World credits & license**. The built-in clearing map is CC0 1.0. A local unlicensed draft can be practiced solo.

**Export licensed world** includes map JSON, attribution and a signed license record in a readable ZIP. **Add to shared files** makes that bundle available through the file library. Plain imported JSON has no verified provenance. ShareAlike remixes retain their upstream record and supported license; unchanged NoDerivatives worlds can be shared, while the controls refuse publishing altered ND editions. These checks cannot determine actual ownership or copying outside the app. Downloaded worlds are bounded data; arbitrary game scripts are not executed.

## Replays and backups

Completed rounds record rules, players, seed, inputs and final scores. The host replays before signing; participating guests independently verify a replay before signing it. Bots do not sign. A host-only record is labeled accordingly. These checks establish transcript consistency and agreement by keys, not independent anti-cheat or proof of unique humans.

The archive keeps the latest 40 matches. Export individual records or use **Back up arcade** for the encrypted profile, contacts, saved worlds and match archive. Keep separate vault and file backups too; restore the identity vault before its arcade data. Arcade restore replaces that identity's saved arcade state after validation.

Locking disconnects peers. Hiding the host's play view pauses simulation; returning resumes only a pause caused automatically. Active rounds count as activity, but an idle room does not defeat auto-lock. Concurrent edits from another tab refuse stale saves; export the offered recovery copy before closing or locking that tab.

## Directory and transport

The host forwards room state and chat. The directory carries introductions and temporary room metadata; it does not store gameplay, writing or file contents. Local helpers handle transient traffic and are trusted endpoints.

Each connected Keeper can act as a directory. Listings expire when a host stops refreshing, pending joins expire, and requests and buffers are bounded. Restarting a directory removes invitations; established links may continue while their host and VPN remain connected. Reopen invitations for new joins after restart. Brief request failures and lost confirmations have retries and duplicate protection, but long outages need a fresh invitation.

Mushroom Garden adds in-app Doodle Coins, transfers and generator trades through one selected garden Keeper. It is separate from match results and does not provide cash redemption, cryptocurrency, wagers or a global ranked scoreboard. See [MUSHROOMS.md](MUSHROOMS.md).

Public hosting, unattended P2P storage, dedicated game simulation, automatic host migration, independent anti-cheat and distributed recovery remain future work. Current evidence and limits are in [VALIDATION.md](VALIDATION.md).
