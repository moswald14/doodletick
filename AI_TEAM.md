# AI coding team

This project uses an AI coding team within the maintainer's current development chat. These are task roles, not hired people, GitHub accounts or services running continuously. Work proceeds when the maintainer starts or resumes a task.

| Role | Task agent | Current responsibility |
| --- | --- | --- |
| Release and integration lead | `root` | Choose coherent scope with the maintainer, integrate changes, validate and publish authorized work |
| App package reviewer | `addon_review` | Review Home Assistant packaging, data preservation, privacy and deployment blockers |
| Build and validation engineer | `delivery_automation` | Keep canonical source and generated runtime consistent; maintain reproducible checks |
| Contributor documentation | `team_docs` | Explain architecture, review practice, starter tasks and acceptance criteria |

[@moswald14](https://github.com/moswald14) is the project maintainer and owns merge, access and release decisions. AI agents do not receive repository membership, own user identities or approve their own security-sensitive changes.

## How work is assigned

1. Define the intended behavior and a finish condition in an issue or the development chat.
2. Give each agent a bounded task and explicit file ownership. Shared files stay with the integration lead unless coordinated otherwise.
3. Implement or review against the actual source. Report concrete findings with evidence and distinguish confirmed defects from open questions.
4. Integrate sequentially, run the checks appropriate to the change, and document remaining limits.
5. Let the maintainer decide publication, permissions and any unresolved product tradeoff.

Review is useful evidence within its stated scope; an AI package review is not an independent security certification. Agent activity, test runs and planned tasks must not be presented as continuous monitoring or as completed human recruitment.

Agents must preserve user data, use disposable fixtures, and keep secrets and personal deployment details out of public reports. They must not extract browser sessions or tokens, bypass authentication or HTTPS protections, run privileged host commands, grant outside access or contact people without the maintainer's authorization.

The first work queue is in [ROADMAP.md](ROADMAP.md). Contributors can use [CONTRIBUTING.md](CONTRIBUTING.md) to reproduce the same checks locally.
