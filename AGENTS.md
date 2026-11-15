# Working on Doodle Tick

Read README.md, CONTRIBUTING.md and the relevant source before editing. Treat the current user request as the authority for scope; preserve unrelated work and saved identities.

For multi-component work, use the AI team roles in AI_TEAM.md with bounded tasks and separate file ownership. The integration lead resolves shared changes and verifies the final result. Do not claim a background team or continuous monitoring is running after a task ends.

- Canonical app source: `keeper/`. Home Assistant adapter source: `doodletick/` excluding the generated `keeper/` child.
- Regenerate adapted runtime with `node scripts/sync-ha.mjs`; check it with `node scripts/check-repository.mjs`.
- Run `node scripts/test.mjs` for changes affecting network, signatures, balances, storage, packaging or multiple components. Use focused checks for smaller changes; do not add tests that merely mirror a trivial edit.
- Use disposable test identities and data directories. Never read or commit a user's live keys, vault, garden ledger, VPN state, logs or backups.
- Keep existing signatures and signed-format versions compatible. A product version change does not itself require a data migration.
- Keep private peer and authenticated ingress boundaries intact. Do not replace cryptographic verification with a decorative image or an HTTP fallback.
- Update visible version labels, package metadata, app metadata, cache label, Pi bundle metadata and release notes together when preparing a new release.
- Build public assets with `python scripts/package-release.py --version <intended-release>` after repository checks pass. Versioned assets are immutable; the script refuses overwriting them. Public-chain changes also require `npm ci --ignore-scripts`, `npm run check` and `npm test` in `contracts/`.
- Describe the actual verification and unresolved limits. A source review is not a security certification; a simulated peer test is not a physical VPN test.
- Publish, contact people, change licensing or grant access only within the user's explicit authorization. Reversible local implementation and validation can proceed without repeated confirmation.

Open work and acceptance criteria are in ROADMAP.md and repository issues. Keep a change focused enough for another contributor to review.
