# Doodle Jazz room

Doodle Jazz is an original, locally synthesized piano, plucked bass and percussion trio. It composes new phrases and accompaniment as it plays, with no programmed final song. It is a listening program rather than a recording stream.

## Open the room

Choose **Jazz room** in the Keeper sidebar. The player opens at `./jazz.html` in the same tab, on desktop or through Home Assistant's authenticated Web UI. Press **Play jazz** to begin. No creator vault, wallet connection, microphone or streaming account is required.

Audio uses the speakers or headphones selected for this browser. Keeping the Keeper server or Home Assistant app running does not play music on that server's audio hardware. Use a current browser over trusted HTTPS or localhost.

## Choose a feel

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

## Loading and privacy

The integrated room loads external same-origin scripts, styles and its audio worklet from the Keeper. Relative URLs retain the Home Assistant ingress path. It uses the existing authenticated-ingress and script policy, with no remote music service or audio upload. The original standalone Doodle Jazz download is separate from this integrated loading path.

Jazz listening does not sign records, modify the garden, transfer funds or start mining. Existing Keeper identities, vaults, signed formats, balances and native-chain rules retain their own behavior. See [VALIDATION.md](VALIDATION.md) for completed checks and remaining limits, and [RELEASES.md](RELEASES.md) for release status.
