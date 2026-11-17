# Phrase lab

Open **Phrase lab** in the Keeper sidebar. Choose the shortest and longest phrase (one to eight words), Friendly mode, and **Start / resume search**. Repeated words are allowed, including expressions such as “never say never”.

**Known phrases first** visits expressions attested in the bundled English dictionary, then single words. It is the useful default. **Literal brute force** enumerates the Cartesian product in length order with repetition: every one-word string, every two-word string, through the selected maximum. It generates chunks without materializing the whole search space. A large dictionary's complete search cannot finish in a practical lifetime.

The automatic meaning test is deliberately limited: a single word must occur in the dictionary, or a multiword expression must match a recorded dictionary entry. Dictionary presence does not prove factual truth, originality, popularity, suitability or the meaning of an arbitrary new sentence. Meaningful combinations absent from the dictionary will be missed. There is no paid AI service or hidden semantic model.

Friendly mode excludes offensive, derogatory and vulgar dictionary tags plus a conservative explicit-word list. Turning it off permits those entries. Label coverage is incomplete; review material before sharing it with other people. Changing the search settings selects the corresponding checkpoint; old progress and the common deduplicated pile are retained. The active posting filter is checked again before a batch is sealed.

## Saved progress and the pile

The phrase workspace is **unencrypted IndexedDB storage in this browser and at this address**, separate from the encrypted creator vault. It contains dictionary matches, source links, search positions, pending batches and saved seal identifiers. It never contains a Keeper password or signing key. Clearing browser storage removes the workspace. Export **pile & progress** for a readable snapshot, or **phrase text** for a plain-text list. This version exports snapshots; it does not import them into another browser.

A search checkpoint and its new matches commit in one transaction. Quota errors leave that chunk uncommitted. Search positions use arbitrary-precision integers, and a changed dictionary cannot silently reuse an old brute-force cursor. Browser locks prevent two tabs from searching or posting simultaneously. Separate settings keep separate checkpoints while deduplicating the shared pile by normalized phrase spelling.

Waiting work is limited to 20,000 phrases; the complete workspace retains up to 250,000 phrases including posted history. A full workspace pauses with the previous checkpoint intact. These are practical browser limits, not promises of infinite storage. Export before clearing data. Clearing posted history can allow old phrases to be found again.

Hiding, leaving or closing the page pauses searching and posting after any operation already in flight. Reloading never restarts either automatically. Leave the page visible and the device awake during a run. **Pause search** and **Pause posting** are separate controls.

## Posting into Keeper

**Queue qualifying pile** moves matching unqueued phrases into the queue. **Post queue to Keeper** adds signed **Note** entries of up to 100 phrases each, including source links and a content-derived batch marker. Your open draft stays in place. The normal Keeper signature format, encrypted vault save and local witness process are used. The witness receives the proof of a seal, not its phrase text. No wallet, gas fee or DVC transaction is involved.

If the vault locks or is full, pending work remains saved. A batch is marked posted only after the vault confirms a saved seal. If a tab closes after sealing but before the queue acknowledgement, resuming checks the existing batch marker and content before making any new seal. Posted history also stops later searches adding the same phrase again.

Keeper's existing limits still apply: 10,000 signed entries, 250,000 characters per entry, and a 4,500,000-character encrypted backup envelope. Exporting a backup does not itself expand the vault. The queue stops instead of deleting old entries or changing identity. A different empty vault is not a continuation of your existing signing history; use normal Keeper backup/restore when moving your identity.

These posts are **local signed notes in your Keeper trail**. The current app has no public Doodlechain phrase feed. Deliberately sharing an exported note or receipt is a separate action.

## Using this local build

The supplied desktop package contains a complete Keeper build and requires Node.js 22 or newer. Extract it and double-click **Start Phrase Lab.cmd** inside `doodletick-keeper`. It opens the Phrase lab page at the usual local Keeper address. Keep using the same browser and exact address for an existing desktop vault. If that address already has a running Keeper, stop the old instance normally before starting this copy; never run two live copies of a witness identity.

Browser vaults at a Home Assistant address do not automatically appear at a desktop address. Keep an encrypted backup and use Keeper's normal restore flow to move a vault yourself. This package has not replaced an installed Home Assistant app or changed the public repository. The Home Assistant source bundle is included separately for installation through the usual managed app workflow.

See **PHRASE-SOURCES.md** for the dictionary snapshot, extraction rules, counts and licenses. Generated phrase content remains distinct from the application's GPLv3 code license.
