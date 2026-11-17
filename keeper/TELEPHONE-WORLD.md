# Telephone World in Keeper and Dot Studio

Doodle Tick 0.9.3b connects Bullshit Telephone World 2, Dot Wave Studio 2.3 and Doodle Keeper, alongside the Doodle Jazz room.

## Open the workspace

From a fresh desktop source copy, run `node keeper/server.mjs` at the repository root and open `http://127.0.0.1:4317`. The desktop runtime needs Node.js 22 or newer. If another Keeper already uses this address, stop that copy or use an explicitly configured separate preview port and disposable data directory. Never run two servers with the same Keeper identity or data directory.

Use **Telephone World** in the Keeper sidebar. The Telephone room and Studio open within this Keeper's address, so they can read the same creative project shelf. Home Assistant uses its normal authenticated Web UI; this source package does not install itself there. Existing HTTPS and sign-in requirements continue to apply.

## Carry a project through the three apps

1. Open Telephone World, name the session and write the input. Choose its source handling before running the machine. The protected master copy remains a separate field.
2. Press **Save session** to keep the narrative and drawings on this browser's shelf. Reopen it from the saved-session list.
3. Open **Dot Studio** for that project and use the **Telephone** step. Make an editable score from the selected text, or load an existing attached soundtrack. This creates musical material; it does not rewrite the story.
4. Edit the sound, beat, melody and arrangement with Studio's normal tools. Save the score back to the Telephone project. Keep an ordinary Studio project or export WAV/MIDI with the existing export tools when useful.
5. Return to Telephone and press **Soundtrack** to hear the attached score. Playback starts only after the button is pressed. Stop music, leaving the page or browser interruptions can end it.
6. In Keeper, preview the session before carrying its narrative into an encrypted vault draft or opening a fictional map in the world workshop.

Generated scores use deterministic text-derived musical choices. They are editable Studio projects, not recordings of speech or claims about a person's feelings. Existing Studio sound libraries remain available through Studio's normal library import/export and project-merging controls.

## Original input and protected sources

The session preserves input, the protected master, source handling and generated outputs separately. Reopening a session does not run the story generator. Personal, observer and talky source modes keep their existing protections; the integration does not convert them into fictional plots or maps automatically.

A narrative snapshot includes the character, poem, story, selected narrative settings, module settings, protected master and drawings. It is not a save state for every running arcade minigame. Typing-practice entries, match profiles, corruptor passwords and volatile minigame state are excluded.

## Keep a copy in the vault

The shared project shelf is **unencrypted browser storage**. It is not the creator vault, and locking the vault does not encrypt or remove that shelf. Avoid saving material to it that should exist only in an encrypted vault.

The vault action requires an unlocked Keeper and stages a draft for review. It asks before replacing an occupied draft. Review and seal the draft with Keeper's normal controls; importing a project does not silently sign, witness or publish it. Existing sealed entries stay in their history.

A vault draft is a text copy of the selected narrative. It is separate from the complete portable project, attached Studio score, world shelf and file backups.

## Make an editable world

A fictional Telephone project can seed a playable Keeper map. Opening it stages a map in the existing world workshop so you can inspect and edit it. Supply your credits and confirm the rights to your contributions before exporting or sharing through the normal workshop controls. This does not grant rights to imported material or verify its authorship.

Protected source modes do not invent a fictional map from personal text. Choose an intentional fictional project when you want to build a world.

## Move or back up projects

Use **Export project** for a `.telephone.json` file containing the narrative snapshot, drawings and attached editable Studio score. This file is **unencrypted**. Store it accordingly. Use **Import project** to bring a copy onto another browser's shelf without overwriting an existing session.

The shelf is shared only by pages in the same browser profile and origin: the same scheme, host and port. `localhost` and `127.0.0.1`, two ports, and desktop and Home Assistant addresses have separate shelves. Browsers may remove local data; private browsing may discard it on exit. Export copies you want to retain. Use Studio's existing library export/import to move older sounds between these origins as well.

The shared shelf contains creative project data only. Keeper identity keys, vault encryption keys, garden balances and mining state do not travel in Telephone project files. Existing Keeper and browser-vault backup procedures remain separate.

## Audio and news

Music renders locally and plays on the listening browser's output device. Keep the page open and the device awake. Opening a saved project never resumes music automatically.

The integrated edition does not start Telephone's news fetch on page load. An explicit news-button action may request GDELT headlines. Remote news scripts are not loaded into Keeper. Core narrative and music work do not need a news request.

## Verification status

See [VALIDATION.md](VALIDATION.md) for checks actually run and unresolved limits. A source build or simulated ingress check does not establish a physical Home Assistant installation, a long listening run or cross-device operation.

Existing creator credits and source licenses remain in place. User-created writing, music and world contributions retain their separate content rights.
