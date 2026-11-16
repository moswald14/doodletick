# Keeper time and Sleep garden · 0.7b

Sleep garden is a listening view. Keeper time helps the color wheel and private garden agree with the Keeper they use. Neither feature changes saved identities, signed-record formats, private garden rewards or native DVC consensus. See [validation](VALIDATION.md) for completed checks and remaining work.

## Start a listening session

1. Open **Sleep garden**. Three starter mushrooms are available without creating or unlocking a vault.
2. Adjust **Listening volume**, **Soft wind**, **Mushroom voices** and **Static reduction**. The expandable controls add **Arcade blips** and **Mic pops**.
3. Choose **Fade out after**, then press **Start sleep sounds**. **Stop sounds** ends the session; **Dim garden** reduces the visible controls.

The bedtime preset uses 15% volume, 60% wind, 45% mushroom voices, 90% static reduction, 15% blips and 8% pops. The default duration is eight hours. The duration menu offers 30 minutes and one, two, four, eight or twelve hours. The final minute fades before the sound stops.

**Use my saved mushrooms** reads recipes from the garden you have joined on this Keeper after unlocking your vault. Up to 100 voices can be mixed. **Open a Dot Wave recipe** reads one local recipe file smaller than 32 KB. The starter collection and imported sounds are listening only: they do not plant generators, create balances, harvest hours, mine or trade. Softening a sound does not edit its saved recipe or generator identity.

Mix and duration preferences are saved in this browser outside the encrypted vault. Owned/imported recipes are not saved by this listening panel. No audio starts on load, reload or return. A failed settings save is labeled, and the settings apply only for that visit.

## Playback and locking

The sound is synthesized locally into a stereo loop; no audio stream or external service is used. Starting Sleep garden pauses the existing background music and recipe preview. Starting either of those stops Sleep garden, so the players do not overlap.

Once started, Sleep garden can continue between app views and in a hidden tab. Keep the page open and the computer awake. The existing **Weather & music** player still pauses when its tab is hidden; it has a different listening lifecycle.

Volume changes apply while playing. Changing the mix, duration or recipe source stops the current session and requires another Start. Leaving or closing the page stops it. An audio-context interruption closes the player and requires another Start; the app does not silently resume it.

The vault's normal lock timer remains active. Locking clears owned recipes from the listening panel and selects the starter collection for the next session. Already-rendered sound can finish without holding a creator identity or key. An owned mix still preparing is canceled. A locked vault cannot sign or trade through this feature.

The fade and stop are scheduled on `AudioContext.currentTime`, the time coordinate used for Web Audio scheduling. A separate volume control cannot postpone that stop. Delayed screen updates do not set the audio deadline. See the [Web Audio specification](https://www.w3.org/TR/webaudio/).

Browsers and operating systems can suspend audio or the whole page. Sleep/wake clock divergence is treated as an interruption, not permission to extend a session automatically. This is not an OS wake alarm, a guarantee of overnight playback or a medical sleep treatment. An eight-hour setting is not evidence of an eight-hour endurance test.

## Keeper time

The app checks its same-origin Keeper at startup, periodically while visible and after returning to the page. **Sync time** requests another check. Use trusted HTTPS for a remote Keeper, or localhost for a standalone Keeper; a signature alone does not establish who controls the server you opened.

Each synchronization takes three samples, each signed by the Keeper and bound to a fresh random nonce. The browser verifies the public-key fingerprint and pins the Keeper identity for this page session. Each request has a five-second deadline; accepted samples must have a round trip of at most two seconds. All three must agree within their combined estimated uncertainty plus 100 milliseconds, and the lowest-round-trip sample anchors the display.

The browser projects that sample with `performance.now()`. This elapsed-time clock avoids ordinary system-clock adjustments; it is not synchronization across devices. Browser callbacks may still be delayed or suspended. See the [High Resolution Time specification](https://www.w3.org/TR/hr-time/).

Before the first successful verification the display uses device time. The first verified correction can move the display. Small timing differences adjust its rate gradually. A large change needs a second consistent signed check, then immediately reanchors the display and marks the correction; it may move forward or backward. This avoids taking many hours to catch up after a long sleep or clock adjustment. Status shows freshness and estimated uncertainty. Samples become stale after two minutes, and a discrepancy between wall time and elapsed time invalidates the sample.

Private garden actions use the fresh Keeper estimate, rather than a display still correcting small timing differences. If time is stale or unverified, the app tries to sync and refuses the action if fresh verification fails. It also checks that the time source matches the selected garden Keeper. Completed owned hours are counted and settled by the garden ledger; correcting or revisiting a displayed hour does not replay its rewards.

Automatic day/night appearance also uses projected Keeper time after synchronization, interpreted in the device's time zone. The chosen day/night hours stay unchanged; before verification it uses device time. Manual Daylight and Red night choices remain available.

These checks authenticate a recent response from one Keeper. Its host clock can still be wrong. The uncertainty estimates describe sampling delay and elapsed drift, not an independently established UTC error bound. The app does not set the operating-system clock, contact NTP, change recorded history or establish distributed clock consensus. Color order, hourly rewards and DVC block rules remain unchanged.
