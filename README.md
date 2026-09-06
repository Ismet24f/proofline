# Proofline

Proofline answers one question: **did every active Playwright test that this CI run planned produce trustworthy execution evidence?**

A normal GitHub rollup job can catch failed, cancelled, or skipped jobs. It cannot reliably identify a missing matrix shard, a runtime `test.skip()`, a worker interruption that leaves planned tests unexecuted, plan/execution selection drift, or an invalid Playwright report. Proofline's value is limited to those evidence gaps; repositories without them do not need Proofline.

## Current status

Proofline v0.1 is being implemented as an open-source, local-only GitHub Action with three operations: `plan`, `collect`, and `reconcile`. The repository currently contains the independently reviewed specification, implementation plan, and Phase 0 discovery foundation. The consumable action and `check/dist` bundle do not exist yet.

The action will run entirely on the GitHub runner. Consumers will not install a Proofline npm package, provide a token, add Proofline annotations, or send test data to a hosted service.

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

Playwright 1.62.1 ignores a config-defined JSON reporter `outputFile` when `--reporter=json` is supplied on the command line and writes JSON to stdout instead. Consumer workflows must set `PLAYWRIGHT_JSON_OUTPUT_FILE` to the same report path passed to Proofline. The future example workflow will include this explicitly.

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

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
