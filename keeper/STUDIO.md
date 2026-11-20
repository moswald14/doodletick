# Dot Wave Studio in Keeper

Keeper includes the real Studio 2.9 editor. The guided path is capture a sound, shape a patch, make a beat, write melody and vocals, arrange, then export. WOOFpad discoveries keep their two-voice patch recipes. A captured hum becomes editable notes only after review and Keep. A captured wave becomes a repeating outline; keep the original recording separately when it matters.

Open Studio from Keeper for personal drafts and the Telephone World soundtrack shelf. Existing drafts, sounds and stories use the same browser storage names. Switching steps preserves the music. Projects remain version 2, with no Keeper identity, coin or signed-record migration.

Studio's music generators produce editable notes and beats. Doodle Jazz uses the original composer, with its license and source revision preserved in `studio-notices.txt`. Random melody and beat tools offer another starting point; keep the source project and use Undo when exploring alternatives.

Coin Wave turns a day of prices into sound material. Only an explicit request in the Studio document can contact `api.exchange.coinbase.com` or `api.coingecko.com`; requests carry no account credentials. CSV import works without those services. Other Keeper pages retain their existing connection policies.

The AI sketch handoff copies a music prompt, opens ChatGPT, and accepts reviewed note data pasted back into Studio. It does not add a Keeper AI endpoint or store provider credentials. Keep your project before replacing an idea, and review generated notes before saving them with a Telephone World soundtrack.

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

Check Studio and a disposable Telephone World soundtrack in a real browser. Verify a patch preview, WOOFpad, captured WAV analysis, melody editing, vocals, Doodle Jazz and Random notes, Coin Wave request or CSV import, AI sketch copy/paste, arrangement playback, project export, reopening a saved soundtrack, and returning to Keeper. Synthetic fixtures do not verify live market availability or a physical microphone or speaker. Package only after all final source changes are imported and checked. Keep a previous-version Home Assistant backup when upgrading the existing app.
