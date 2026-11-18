# Doodle Jazz radio

Doodle Jazz composes original piano, plucked bass and percussion continuously. In Home Assistant, the Keeper renders and broadcasts the music itself. Chrome can close and the PC can turn off while Home Assistant keeps playing.

## Open and listen

Open **Jazz room** in Keeper and press **Start Jazz & listen**. **Listen here** connects this browser to the running station. **Pause listening**, **Local output** and the speaker/mute button affect only this device; they never turn down the outgoing broadcast. Returning to Keeper releases local listening and leaves the station running.

**Stop** ends the broadcast for everyone. **Never stop** guards Stop and shuffles the musical players every hour. Press **Never stop: ON · unlock** to turn the guard off before an intentional stop. The app remembers a started station and resumes it after Keeper restarts. Power, network, resource and casting-service outages can still interrupt delivery; this is not an uptime guarantee or a restriction on the Home Assistant administrator.

No microphone, camera, display capture, streaming account, creator vault or wallet is needed. Opening the page does not start a fresh station or play browser audio without a gesture. A running station remains running when the page opens.

## Eight genres and organized shuffle

| Tab | Arrangement |
| --- | --- |
| Swing | Walking bass, swinging ride and changing 32-bar song form. |
| Blues | Relaxed twelve-bar dominant blues and turnarounds. |
| Bossa | Minor-key two-feel bass and interlocking straight rhythms. |
| Bebop | Quicker ii-V turns, secondary dominants and chromatic neighbors. |
| Cool | Soft brushes, spaced comping and restrained phrases. |
| Modal | Long Dorian vamps, open space and pedal/two-feel bass. |
| Latin | Afro-Cuban-inspired 2-3 son clave, anticipated bass and montuno-style comping. |
| Jazz funk | Minor/dominant vamps, sixteenth syncopation and a backbeat. |

**Shuffle the trio** chooses a correlated mellow, warm or bright variation of tempo, feel, room and instrument balance. It usually stays in the current genre and sometimes chooses another. **Undo shuffle** restores the previous arrangement. Manual genre changes select that genre's starting tempo and feel. Bossa, Latin and funk retain straight timing. Tempo stays within 55-180 BPM. **New set** changes the seed and musical phrase.

The three original styles keep their performed musical events. New genres retain the call/repeat/answer/cadence approach with rests. Rootless piano shapes move between nearby thirds, sevenths and color tones. These are original synthesized arrangements, not recordings or claims to reproduce a specific musician.

Arrangements take effect at the next bar. Instrument controls change the outgoing mix; local output does not. Room is a bounded server stereo effect. Station settings are shared by everyone authorized to open this Home Assistant app; browser volume and dim-room preferences stay local.

## Speed, measures and key

**Speed** sets 55–180 beats per minute. **Beats per bar** chooses two through seven beats and the moving dots follow your choice. **Phrase length** follows the genre or uses 4, 8, 16 or 32 bars. **Beat** sets the drum groove independently of the harmony.

Choose **Beat only · just the drums** to hear percussion without piano or bass. Turning it off brings the pitched players back with their saved mixer settings. This changes the shared broadcast. Local mute still affects only the listening device.

**Key** can let the band choose or hold one of the twelve displayed roots. **Suggest a key** proposes a neighboring key for the current genre and queues it for the next bar. This suggestion runs locally without an account or API request. A manual root stays selected through new sets and shuffles; each genre retains its own major, minor or modal character.

Outside text fields, selectors, links and buttons, **Space** toggles local listening, **M** toggles local mute and **N** requests a new shared set. Editing controls retain their normal keyboard behavior.

## Progressions you like

A completed **Name this song** result and a successfully saved **I dig this!** passage each reinforce the relevant chord progression once. Payment retries, pending captures and repeated requests for an already saved passage do not add repeated likes. The band can revisit matching progressions in the same genre, with more-liked progressions receiving more weight while fresh variations remain possible. A manual key transposes a recalled progression into that key.

Turn **Bring back progressions I like** off to stop favoring stored progressions in future choices. This leaves the saved preference memory intact. The displayed count reports stored musical preferences; this is local weighted selection, not training an external AI model. Playback, voice and keepsake recording need no OpenAI account.

Preference memory lives in the Keeper's separate `jazz-learning/memory.json`, with room for 128 progressions and 7,000 distinct positive responses. It does not change old signed recordings, payment receipts, balances or identities. If memory cannot update, a successfully saved passage remains saved and the radio continues. Include this file in the Keeper app backup.

## Give the players Dot Wave voices

1. In **Dot Wave → Sound**, keep a named sound in **Your Sound Box**.
2. Return to Jazz at the same Keeper address and press **Use saved Dot Wave sounds**. This reads that browser's saved Sound Box only when you press it. If the sounds live at another address or on another device, use **Export** in the Sound Box and then **Import sound file** in Jazz.
3. Choose a named sound and **Piano**, **Bass** or **Drums**, then press **Give voice to player**.
4. Wait for **Voice saved**. The Keeper prepares and saves the voice before it joins at the next bar. Loading or selecting a file alone never changes the band or starts playback.

To restore a player, choose **Original trio voice** and press **Give voice to player** again. Each of the three players can have one saved assignment. All listeners hear the assigned instrument, including when the PC is off and Home Assistant continues broadcasting.

Imports accept a Dot Wave sound-library JSON file with up to 32 choices, an exported Studio patch or a mushroom recipe. The file limit is 512 KB; each selected editable voice must fit within 32 KB. Recordings, WAV files, remote audio URLs and scripts are not supported. Invalid imports leave the current assignments unchanged.

The saved voice retains its name, supplied creator/license/source credits, effects and editable recipe. Mushroom settings keep their seed. Studio patches use the same frozen waveform snapshot as **Keep sound**, including amp character and inversion; the original patch remains editable. Independent-pitch collisions become that snapshot when played as a pitched instrument. Listening Master and EQ are retained in a patch recipe but do not set the broadcast's listening volume.

**Export player voice** downloads the complete editable voice and its credits. A voice exported this way can be imported back into Jazz. Its contained recipe is a one-sound Studio library, Studio patch or mushroom recipe that can be reopened in the corresponding Dot Wave tool. Keep the complete Jazz file to retain credit fields that older Studio library imports do not display. Your chosen content license remains separate from the app's code license.

Voice preparation runs separately from the live audio clock. The Keeper saves recipes rather than imported executable code or arbitrary audio files, and recreates a bounded sample bank after restart. New keepsake recordings include the assigned musical voices; previously saved audio remains unchanged.

## Free casting

The **Let others listen** panel provides a VDO.Ninja listener link. Anyone with the link can hear the current broadcast, including its voice updates. Keep it private if you want a private audience. The same station link is retained after normal restarts. Stopping ends delivery; starting the same station makes that link usable again.

Home Assistant supplies its own 48 kHz stereo PCM to native WebRTC. Opus targets 128 kbps; actual channels and bandwidth depend on negotiation and network conditions. Each listener needs a peer connection and bandwidth. The panel distinguishes advertisement from observed outgoing audio counters; a signaling connection alone does not establish audio delivery.

VDO.Ninja's fixed public signaling and TURN-discovery services are contacted when broadcasting starts. Direct WebRTC can disclose network addresses to peers; a relay can carry encrypted traffic when needed. The integration sends original music and enabled announcer speech. It does not send the Keeper URL, vault, private rooms, keys, saved chord library or API account. Home Assistant remains behind its authenticated ingress, with no new host ports, devices or administrative API permissions.

## Optional voice

Switch **Voice updates on the broadcast** on to hear short setting announcements and, about every fifteen minutes, a world brief with constructive dated headlines, modeled world weather and the current Doodle clock color. Multiple quick adjustments are combined. Music ducks under speech. Turning voice off clears pending announcements.

Voice is synthesized offline with eSpeak NG and FFmpeg; it does not use an OpenAI account. The app fetches fixed NASA and United Nations RSS sources and filters for recent constructive headlines. A brief quotes at most 22 headline words and includes source links and dates. No qualifying recent story means an explicit unavailable message. Weather rotates modeled conditions for New York, Rio de Janeiro, London, Nairobi, Tokyo and Sydney, in Celsius, with Open-Meteo attribution. There is no device geolocation. Current model times and cache ages are checked, and unavailable or cached data is labeled. This is a light announcer, not an emergency weather service or a comprehensive news report.

The latest speech and source links are visible under **Latest world update & sources**. Source requests are bounded and cached. No arbitrary client text or URL can be submitted to the announcer.

With the broadcast running and voice switched on, **Test voice** queues a fixed announcer line. Its status shows preparation and the most recent successful synthesis time, or an error. A successful synthesis check means speech audio was prepared; hear the line through **Listen here** or a connected cast listener to check the actual output. Local mute or a paused listener can hide speech even while the station is broadcasting it. This check does not establish a working OpenAI account.

## Chord receipts and I dig this!

**Chord receipt** downloads a Keeper-signed snapshot of the current music and clock color. A snapshot contains no replay audio.

After four chords have played, **I dig this!** keeps four completed chords before the click and four starting with the chord being played at that moment. It waits for the following chords to finish, then saves their original music as MP3 with a permanent signed receipt. Voice announcements are excluded. The exact captured audio can be replayed later, even after the style changes or Keeper restarts.

Passage length follows the measure, speed and chord changes. At the slowest seven-beat setting, eight chords can last about 61 seconds. Recording processing has a 64-second limit; this is a bound, not a fixed passage length.

Open **Saved passages - listen again** to play recordings, download their audio or save signed receipt JSON. Older entries remain available through **Load older passages**. Receipts include all eight chord events, timing, arrangement, seed, clock color, audio SHA-256, previous receipt hash and the existing Keeper witness's public signature. The browser verifies each displayed signature. This new journal is separate from existing witness receipts, encrypted vaults, garden balances and DVC. It is your own Doodlekeeper's Doodlechain, not a public cryptocurrency transaction.

The private library is included in Home Assistant's cold app backups. It never silently removes old recordings. Its limit is 2,000 passages or 256 MiB of audio; two captures may be pending at once. A stop during an unfinished capture reports that it was interrupted. A record is permanent only after **Eight chords saved** is shown. Unread or damaged journal/audio files block new saves and are left in place for recovery. Back up the app and download important recordings; signatures establish integrity and issuer, not physical storage immortality.

## Optional paid naming

**Name this song** remains off until the owner separately connects their OpenAI API account. No payment or API call is requested while it is off. The existing two-cent original Ethereum PEPE flow and its separate ETH network fee remain documented in [JAZZ-NAMING.md](JAZZ-NAMING.md). Ordinary playback, voice and keepsakes do not require payments. Existing identities and signed vault/DVC formats are unchanged.

## Runtime and fallback

Home Assistant images include FFmpeg, eSpeak NG and the lockfile-pinned native WebRTC package. The vendored patched VDO.Ninja SDK retains its MPL source/license; native dependency and codec notices are in `jazz-stream-deps/`. Images are checked on Linux amd64 and aarch64 before release and published at versioned GHCR addresses. Home Assistant pulls the checked image for its architecture instead of compiling Core on the Pi.

The ordinary desktop/Pi Keeper still defaults to browser-local playback, preserving its standalone workflow and no required native dependencies. In that mode the page must stay open and the computer awake; local pause/mute also affect its optional browser cast. Do not interpret that fallback as server radio. The pinned native WebRTC library has a reproduced teardown crash on Windows and Linux. It now runs in a dedicated child that has no Keeper identity or journal state. After an acknowledged resource stop, Keeper deliberately terminates that owned child and waits for its exit; unexpected worker failures trigger station recovery. The canary checks real audio and a clean non-native Keeper/service exit, without claiming clean native-library teardown. The always-on backend is delivered through the checked Home Assistant image.

See [VALIDATION.md](VALIDATION.md) for measured checks and remaining limits, and [RELEASES.md](RELEASES.md) for release changes. Physical speaker output, cross-network reception and overnight operation need their own evidence.
