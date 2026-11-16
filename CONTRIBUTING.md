# Contributing to Doodle Tick

Doodle Tick is an experimental creator vault, private arcade and shared mushroom garden. Small, reviewable contributions are welcome. Start with an existing issue or describe the intended behavior before making a large change. The maintainer is [@moswald14](https://github.com/moswald14).

## Run and check a change

Use Node.js 24 and Python 3.11 or newer for development checks. There are no application dependencies to install. Contract verification has separate pinned development dependencies.

```sh
node keeper/server.mjs
```

Open `http://127.0.0.1:4317`. Use a disposable browser profile and local Keeper data for experiments. Never test payments, recovery or migrations against a real player's only copy.

The canonical application source is `keeper/`. Home Assistant's adapted runtime at `doodletick/keeper/` is generated; change the source and regeneration script, then regenerate it:

```sh
node scripts/sync-ha.mjs
node scripts/sync-ha.mjs --check
node scripts/check-repository.mjs
node --test keeper/tests/*.test.mjs doodletick/tests/*.test.mjs
cd contracts
npm ci --ignore-scripts
npm run check
npm test
```

Home Assistant-specific code lives in `doodletick/main.mjs`, `gateway.mjs`, `migration.mjs` and `public/`. See [the architecture guide](ARCHITECTURE.md) for the storage and network boundaries.

Run checks appropriate to your change. A documentation correction does not need a new unit test. A change to signing, payments, recovery or retry behavior needs a regression test that exercises the failure it prevents. A UI change needs a browser check; a container or networking change needs the corresponding environment check. State what was not tested.

Build numbered downloads from the repository root with `python scripts/package-release.py --version 0.6.1b`. Artifacts are created exclusively in `dist/0.6.1b/`; a repeated build refuses to overwrite them. Public-chain bytecode ships with its complete corresponding Solidity/compiler input source. Never use real keys or a paid network to run verification tests.

## Preserve users' work

- Never include `.doodletick`, browser vaults, garden ledgers, witness keys, VPN state, authentication links, access tokens or personal logs in a commit or issue.
- Keep browser identity backups separate from Keeper data backups. Restore a garden ledger with its original witness key; never run two live copies of that identity.
- Preserve signed record formats and old signatures. An app version bump is not a reason to change a data-format version.
- Preserve creator credits and Creative Commons records when handling shared content. Do not imply that a valid signature proves original authorship.
- Do not loosen signature checks to make HTTP work. Recipe previews can work without Web Crypto; signed garden operations need a secure browser context.

## Review and licensing

Submit a pull request explaining the problem, the resulting behavior, and evidence for the change. Include a migration and rollback plan when persistent data changes. Keep unrelated edits separate. The maintainer makes merge and release decisions; CODEOWNERS identifies the reviewer but does not itself enforce branch protection.

The repository's included code is published under [GPLv3](LICENSE), including the shared Dot Wave sound modules. Contribute code you have the right to submit under those terms and preserve notices. Contributors retain their copyrights; no copyright assignment is requested. A user's writing, sounds, worlds and files are separate works. Their chosen content license is not replaced by the application's GPL license.

AI-assisted contributions are welcome. Review the actual patch, name the relevant tool assistance in the PR, and report the checks you performed. Do not submit invented test results, generated credentials or unreviewed dependency changes. Agents must not read browser authentication state, copy tokens, run privileged host commands, grant collaborators access or publish a release without the maintainer's authorization.

## Useful first contributions

- Reproduce a documented setup problem using disposable data and report clear steps.
- Improve keyboard focus, contrast or accessible labels, with a before/after browser check.
- Improve setup wording without promising unimplemented storage, recovery or identity features.
- Add a focused regression for an acknowledged bug in the existing test suite.

Use the issue forms for bugs, proposals and test evidence. For a suspected security issue, follow `SECURITY.md` if present; otherwise open an issue requesting a private reporting channel without publishing exploit details or secrets.
