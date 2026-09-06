# Proofline

Proofline answers one question: **did every active Playwright test that this CI run planned produce trustworthy execution evidence?**

A normal GitHub rollup job can catch failed, cancelled, or skipped jobs. It cannot reliably identify a missing matrix shard, a runtime `test.skip()`, a worker interruption that leaves planned tests unexecuted, plan/execution selection drift, or an invalid Playwright report. Proofline's value is limited to those evidence gaps; repositories without them do not need Proofline.

## Current status

Proofline v0.1 is an unreleased open-source, local-only GitHub Action with three operations: `plan`, `collect`, and `reconcile`. The action and its committed `check/dist` bundle are implemented, pass the repository's live release-candidate workflows, and await independent review. Do not depend on `v0.1.0` until that tag is published.

The action runs entirely on the GitHub runner. Consumers do not install a Proofline npm package, provide a token, add Proofline annotations, or send test data to a hosted service.

## Try it in a workflow

The [consumer workflow](examples/consumer-workflow.yml) is the copy-paste integration reference. It plans each of three Playwright shards, collects evidence even after a test failure, uploads each shard independently, and reconciles all declared shards in one required job.

For a monorepo whose Playwright package lives below the repository root, set
`working-directory: apps/web-e2e` on every Proofline step and set the same
directory on the Playwright `run` step. Proofline resolves Playwright from that
package; `config`, `plan`, `report`, `artifacts`, and `out` are then relative to
that directory. Upload `apps/web-e2e/proofline/` and download reconciliation
artifacts beneath `apps/web-e2e/`.

Configure both the Playwright job and `Proofline completeness` as required checks. The Playwright job answers whether tests passed; Proofline answers whether every planned test produced trustworthy evidence. Until `v0.1.0` is released, pin a reviewed Proofline commit rather than copying the prospective tag from the example.

## What v0.1 will report

| Condition                                           | Proofline classification        |
| --------------------------------------------------- | ------------------------------- |
| Declared producer or shard has no valid artifacts   | `no_evidence`                   |
| Active planned test is missing from a valid report  | `absent`                        |
| Execution was interrupted or never reached the test | `incomplete`                    |
| A test skipped during execution                     | `runtime_skipped`               |
| A test passed only after retry                      | `retry_masked`                  |
| Plan and execution selected different tests         | `selection_mismatch` tool error |

Proofline says **planned**, never **should have run**. It does not determine whether the suite covers the product, whether a change is safe, or whether a release should proceed.

## Important boundaries

A job skipped by `if:` creates no plan fragment. Proofline can report `no_evidence` for the declared producer or shard, but it cannot name tests that were never discovered. Workflow-level `paths:` or `branches:` filtering is outside v0.1 because Proofline cannot inspect a workflow that never started.

Playwright 1.62.1 ignores a config-defined JSON reporter `outputFile` when `--reporter=json` is supplied on the command line and writes JSON to stdout instead. Consumer workflows must set `PLAYWRIGHT_JSON_OUTPUT_FILE` to the same report path passed to Proofline. The example workflow does this explicitly; teams that already define JSON in the Playwright config must still set the environment variable when the CLI overrides reporters.

Proofline's compatibility contract is currently Playwright 1.62.x only. Freeze that minor in a pilot lockfile and validate a new Playwright minor against the compatibility matrix before upgrading.

## Development

Requirements:

- Node 22 or Node 24
- pnpm 10
- Playwright 1.62.x for behavior fixtures

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm turbo run lint typecheck build test --force
```

The authoritative contracts are the [v0.1 specification](docs/superpowers/specs/2026-09-06-proofline-completeness-first-v0.1.md), [implementation plan](docs/superpowers/plans/2026-09-06-proofline-completeness-first-v0.1-implementation.md), and [ADR 0002](docs/decisions/0002-completeness-first-v0.1.md).

The [roadmap and release checklist](docs/roadmap.md) keep technical readiness separate from demand. External validation uses one frozen [30-day decision gate](docs/validation/decision-gate.md), a freeze manifest, and normalized machine-checked alias-only ledgers. No pilot clock has started, no external adoption is claimed, and the current market verdict is **promising, not proven**.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Bundled dependency attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and vulnerability reporting guidance is in [SECURITY.md](SECURITY.md).
