# Dot Wave Studio in Keeper

Keeper includes the real Studio 2.8 editor. The guided path is capture a sound, shape a patch, make a beat, write melody and vocals, arrange, then export. WOOFpad discoveries keep their two-voice patch recipes. A captured hum becomes editable notes only after review and Keep. A captured wave becomes a repeating outline; keep the original recording separately when it matters.

Open Studio from Keeper for personal drafts and the Telephone World soundtrack shelf. Existing drafts, sounds and stories use the same browser storage names. Switching steps preserves the music. Projects remain version 2, with no Keeper identity, coin or signed-record migration.

## Import a Studio release

Use a verified `dot-wave-studio` source checkout, then run from the Keeper repository root:

```text
node scripts/import-studio.mjs <Studio-source-checkout>
node scripts/import-studio.mjs <Studio-source-checkout> --check
node scripts/sync-ha.mjs
node scripts/check-repository.mjs
node scripts/test.mjs
```

The importer builds the standalone HTML, separates its actual script, style and worker, and applies checked source markers for Keeper integration. A changed source boundary stops the import for review. It keeps scripts and the audio worker on the same origin and uses relative URLs for authenticated ingress. It preserves the Telephone score generator, story shelf, original 49 bundled sounds and story integration in `scripts/studio-integration/`. Sample attribution and source records are reproduced in `studio-notices.txt`; the Classic page remains a separate included tool.

Check Studio and a disposable Telephone World soundtrack in a real browser. Verify a patch preview, WOOFpad, captured WAV analysis, melody editing, vocals, arrangement playback, project export, reopening a saved soundtrack, and returning to Keeper. Synthetic fixtures do not verify a physical microphone or speaker. Package only after all final source changes are imported and checked. Keep a previous-version Home Assistant backup when upgrading the existing app.
