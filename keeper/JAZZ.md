# Doodle Jazz room

Doodle Jazz is an original, locally synthesized piano, plucked bass and percussion trio. It composes new phrases and accompaniment as it plays, with no programmed final song. It is a listening program rather than a recording stream.

## Open the room

Choose **Jazz room** in the Keeper sidebar. The player opens at `./jazz.html` in the same tab, on desktop or through Home Assistant's authenticated Web UI. Press **Play jazz** to begin. No creator vault, wallet connection, microphone or streaming account is required.

Audio uses the speakers or headphones selected for this browser. Keeping the Keeper server or Home Assistant app running does not play music on that server's audio hardware. Use a current browser over trusted HTTPS or localhost.

## Choose a feel

**Shuffle the trio** chooses a coherent variation of the musical settings: a mellow room, a warm trio or a brighter conversation. Tempo, swing, room and instrument balance move together on the next bar. It usually continues the current style, sometimes moves into another style, and keeps bossa straight. Master volume and your mutes are preserved. **Undo shuffle** restores the preceding musical settings.

| Style | Arrangement |
| --- | --- |
| **Velvet swing** | Piano, walking bass and swinging percussion over changing jazz harmony. |
| **Blue hour** | A slower twelve-bar blues. |
| **Bossa garden** | A minor-key bossa with a straight Latin feel. |

The music moves through choruses with changing density. Piano voicings connect nearby chord tones; short motifs call, repeat and answer with rests. Swing gives the lead deliberate timing against the rhythm section, while Bossa garden keeps its straight feel. New motifs and possible key changes keep the performance developing. The instruments are synthesized sounds, not recordings of a live band.

## Controls

- **Play / Pause / Resume:** pause a session and continue from its position.
- **Stop:** end playback and release its audio resources. The next Play starts a new session from the beginning.
- **New set:** begin a fresh improvisation on the next bar.
- **Volume and speaker button:** overall level and mute.
- **Piano, upright bass and drums:** each player's level and mute; the plus button unmutes a muted player.
- **Tempo:** 55–180 beats per minute.
- **Swing:** 50% is straight; higher values lengthen the first eighth note.
- **Room:** the amount of room reverberation.
- **Moon button:** dim or brighten the room.

Style, tempo, swing and New set changes arrive at the next bar. Level and room changes respond while the music plays. Settings are saved in this browser when local storage is available. They are outside the encrypted creator vault; they contain sound preferences, not identity keys or writing. Opening or reloading the page always waits for Play.

When focus is outside a control, **Space** plays or pauses, **M** toggles mute and **N** asks for a new set. Supported browser media keys can control playback too.

## Background listening and returning

After starting, you can switch windows or minimize the browser while leaving the jazz page open. Keep the device awake. **Back to Keeper** leaves the jazz page and stops its sound; returning to Jazz room requires Play again. Opening Jazz room also leaves the main Keeper page, so its current page's sound players end through their normal page-exit cleanup.

Closing or reloading the page, device sleep, browser suspension or an audio-device interruption can stop playback. Mobile screen-lock playback and uninterrupted overnight operation are not guaranteed. If the browser interrupts the session, use the displayed Play or Resume control when ready. No device sleep or audio-output settings are changed by the player.

## Cast Jazz live

Press **Play Jazz**, then **Cast Jazz live**. Jazz sends its own synthesized audio directly to the free, account-free VDO.Ninja service and shows a listener link. Copy that link or open its listener page; anyone with the link can listen while this player remains open and the device stays awake. There is no station directory, recording archive or server-generated radio stream.

Only the Jazz mix is supplied to the casting library. No microphone, camera, display/tab capture, wallet connection or OpenAI account is needed. Your current mix, shuffle changes, master volume and Mute affect the cast. Pause sends silence; **Stop casting** ends the network cast while Jazz continues locally. **Stop Jazz**, reload or leaving the Jazz page ends the cast. Starting again creates a new link; a stopped link does not resume automatically.

The page shows connected listeners and audio bytes actually sent, rather than treating a signaling connection as evidence that a listener receives music. Browsers can require a click on the listener page before sound plays. Cast audio is Opus, with a 128-kbps target and a stereo-capable source; actual delivery depends on browser negotiation and network conditions. This is intended for a small audience: each listener needs a peer connection and outgoing bandwidth. It is not an unlimited always-on hosting service.

VDO.Ninja’s public signaling and TURN discovery services are contacted only when you start casting. Direct WebRTC connections may reveal network addresses to listening peers; relays can carry encrypted traffic if a direct connection is unavailable. No Keeper address, identity, saved content, vault, payment receipt or API key is sent by this integration. Treat the generated listener URL as an access link and stop casting to end its access.

The library is bundled locally, including its source and MPL-2.0 license. Script restrictions stay in place; only the Jazz page is permitted to contact its two casting-service origins. Home Assistant keeps its existing authentication and offline-shell restrictions. See [the casting library API](https://sdk.vdo.ninja/docs/api-reference.html) and [connection guide](https://sdk.vdo.ninja/docs/connecting.html).

## Loading and privacy

The optional **Name this song** control adds an OpenAI title and a new drum beat after a listener-confirmed PEPE payment. It is off until owner account setup is complete; ordinary playback remains free and local. See [JAZZ-NAMING.md](JAZZ-NAMING.md) for the separate Ethereum fee, server-side API access, shared musical summary and private receipt recovery. This is an unreleased development addition.

The integrated room loads external same-origin scripts, styles and its audio worklet from the Keeper. Relative URLs retain the Home Assistant ingress path. It uses the existing authenticated-ingress and script policy, with no remote music service or audio upload. The original standalone Doodle Jazz download is separate from this integrated loading path.

Jazz listening does not sign records, modify the garden, transfer funds or start mining. Existing Keeper identities, vaults, signed formats, balances and native-chain rules retain their own behavior. See [VALIDATION.md](VALIDATION.md) for completed checks and remaining limits, and [RELEASES.md](RELEASES.md) for release status.
