# Proofline — Completeness-First v0.1 Specification (Final)

- **Status:** FINAL — accepted direction; corrects the 2026-09-06 revised draft
- **Date:** 2026-09-06
- **Supersedes:** all prior Proofline theses, designs, and validation gates
- **Target branch:** `feature/completeness-first-v0.1`
- **Product stage:** open-source pilot
- **Surface:** one bundled GitHub Action for Playwright on GitHub Actions
- **License:** Apache-2.0
- **Verified against:** Playwright 1.62.1 (`--list --shard=N/T --reporter=json` honours the shard and exposes `config.argv`, `config.shard`, `config.grep`, `config.projects`, stable same-revision `spec.id`, and per-test `expectedStatus`, `line`, `column`, `projectName`; a SIGINT report contains an `interrupted` in-flight result and zero attempts for active tests that never started)

---

## 1. The one question

> **Did every active Playwright test that this CI run planned produce trustworthy execution evidence?**

Proofline v0.1 answers that per pull request, locally on the runner, from artifacts Playwright already produces. It does not claim to know which tests _should_ protect a change: `--only-changed` follows the TypeScript import graph, and most end-to-end tests do not import the code they protect. Proofline says **planned**, never **should have run**. Everything not needed to answer the question is out of scope (§20).

---

## 2. What teams already get for free — and Proofline's marginal value

This is the README's second paragraph, because every competent platform engineer will say "we already have a rollup job."

The free baseline:

```yaml
gate:
  needs: [e2e, api]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - run: '[[ "${{ contains(needs.*.result, ''skipped'') || contains(needs.*.result, ''failure'') || contains(needs.*.result, ''cancelled'') }}" == "false" ]]'
```

Two GitHub behaviours must not be conflated:

- A **job** skipped by `if:` is reported as **success** and does not block a required check.
- A **workflow** not triggered because of `paths:`/`branches:` filters leaves its required check **pending** ("Expected — Waiting for status"), which _blocks_ merge. If a separate dummy workflow supplies a green status, Proofline still cannot inspect the filtered workflow because Proofline never ran there.

| Failure mode                                                      | GitHub shows | Rollup job                            | Proofline v0.1                                                                    |
| ----------------------------------------------------------------- | ------------ | ------------------------------------- | --------------------------------------------------------------------------------- |
| Workflow filtered out by `paths:`; required check stays pending   | blocked      | n/a                                   | n/a (already blocked)                                                             |
| Workflow filtered out + dummy same-name workflow passes           | green        | ❌ (dummy is in a different workflow) | ❌ (Proofline did not run)                                                        |
| Job skipped by `if:` inside the workflow                          | green        | ✅                                    | ✅ `no_evidence` for the producer/shard (see §6.2 on what it can and cannot name) |
| Job cancelled or crashed before upload                            | grey/green   | ✅                                    | ✅                                                                                |
| Matrix declares 3 shards, workflow runs 2                         | green        | ❌                                    | ✅ `no_evidence` shard 3                                                          |
| `test.skip()` is invoked during test execution inside a green job | green        | ❌                                    | ✅ `runtime_skipped` with identities                                              |
| Worker crash drops tests; job exits 0                             | green        | ❌                                    | ✅ `absent` / `incomplete` with identities                                        |
| Pass only on retry                                                | green        | ❌                                    | ✅ `retry_masked`, reported, non-blocking                                         |
| Plan and execution used different projects/grep/shard             | green        | ❌                                    | ✅ `selection_mismatch` tool error (§8.4)                                         |
| Malformed or empty report uploaded                                | green        | ❌                                    | ✅ `invalid` → tool error                                                         |

Proofline's value begins after workflow-level scheduling and is concentrated in the rows a job-result rollup cannot inspect. A repository with none of those failure modes doesn't need Proofline; the gate (§19) records that as _rare_, not _false_.

---

## 3. Assessment

### 🟢 Good

- Objective, explainable, deterministic, no AI, no oracle.
- Reads Playwright's own JSON report; transports via GitHub's own artifact actions; nothing leaves the runner.
- **No Proofline package installation** for consumers: no npm, no pnpm, no annotations, no token. (Not "one line" — see §6.1; it is three steps per test job plus a reconcile job.)
- Free layer that could support a paid layer later, if and only if the gate passes.

### 🟡 Questionable

- Marginal value over the rollup job is real but narrow; the pilot measures how often it matters.
- Retry-masked passes indicate flakiness, infrastructure, or defects; v0.1 reports them and never blocks on them.
- In-job planning trades test-level naming for a fully skipped job against zero argument-duplication cost in setup (§6.2). Accepted, stated, measured.
- `$99/repo/month` is a probe, not a price.

### 🔴 Bad — refused for v0.1

- Dashboards, policy engines, recommendation layers, databases, billing, hosted anything.
- Proofline test IDs or business metadata on tests.
- Calling absent evidence a pass; collapsing `retry_masked` into _not executed_.
- Node 20 (EOL). Windows runner claims without a passing real workflow.
- A separate plan job that replays test arguments and re-installs dependencies.

---

## 4. User, buyer, job, boundary

- **User:** QA lead / SDET / release owner on Playwright + GitHub Actions, especially with conditional jobs, matrices, shards, or runtime skips.
- **Buyer hypothesis:** engineering manager, Head of QA, or compliance-adjacent engineering leader owning release risk. Unvalidated until someone with budget authority discusses a paid pilot.
- **Job:** when Playwright CI completes, show whether the run produced evidence for every test it planned, name the reason for every gap, and expose the result to humans and automation.
- **Commercial boundary:** action and reconciliation stay open source forever. Paid-service design is authorized only by an independently chronology-verified `PROCEED` gate outcome.

---

## 5. Definitions and trust boundary

| Term                      | Meaning                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Producer**              | One logical Playwright job: workflow-local ID (`e2e`, `api`) + declared shard total.                                                                                        |
| **Producer manifest**     | The `reconcile` input declaring every expected producer and shard total.                                                                                                    |
| **Plan fragment**         | The immutable test set one producer/shard discovered via list mode immediately before execution, with its resolved selection (config path, projects, grep, shard) recorded. |
| **Plan**                  | Union of all fragments for a run, validated for consistency.                                                                                                                |
| **Active planned test**   | Planned test with `expectedStatus ≠ skipped`.                                                                                                                               |
| **Planned disabled test** | Planned test with `expectedStatus = skipped` at discovery. Visible, not required to execute.                                                                                |
| **Result envelope**       | Metadata + digest wrapping one producer/shard's JSON report.                                                                                                                |
| **Observed evidence**     | A terminal or partial result for a planned identity in a valid envelope of the same revision and run.                                                                       |
| **Not executed**          | Summary bucket for known planned tests: `runtime_skipped` + `incomplete` + `absent` + inherited `no_evidence`. Unknown tests in a producer with no plan cannot be counted.  |
| **Retry masked**          | Playwright outcome `flaky`: final pass after ≥1 failed/timed-out attempt. Never inside _not executed_.                                                                      |
| **Unexpected**            | Observed identity not in that producer/shard's fragment. Never silently accepted.                                                                                           |

The plan is **what the workflow configured Playwright to run**. It proves nothing about business, requirement, or risk coverage.

---

## 6. Workflow topology — plan inside the job, manifest at reconcile

Planning runs **inside each test job**, immediately before execution. The only thing declared up front is the producer manifest on `reconcile`.

```text
test job / shard (each)
  1. plan     -> proofline/plan.json      (list discovery; records resolved selection)
  2. playwright test ... --reporter=<existing>,json
  3. collect  (if: always()) -> proofline/envelope.json (+ report digest, selection check)
  4. upload   (if: always()) -> artifact proofline-<producer>-<shard>

reconcile job (needs: all test jobs, if: always(), REQUIRED by branch protection)
  1. download proofline-* artifacts
  2. reconcile: manifest vs fragments vs envelopes vs reports
  3. write step summary + proofline-reconciliation.json; set outputs
  4. exit per mode
```

Proofline cannot compensate for a `reconcile` job the repository does not mark as required. The README states this in bold.

### 6.1 Copy-paste consumer workflow (single producer, 3 shards)

Third-party actions are shown as `@<full-sha>` with the major in a comment. **Phase A checklist item A6 verifies the current major of each action and records the reviewed SHA**; this document does not assert version numbers.

```yaml
name: e2e
on: [pull_request]
permissions:
  contents: read

jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@<full-sha> # current major, reviewed SHA
      - uses: actions/setup-node@<full-sha> # current major, reviewed SHA
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Proofline plan
        uses: Ismet24f/proofline/check@v0.1.0
        with:
          operation: plan
          producer: e2e
          shard: ${{ matrix.shard }}/3
          out: proofline/e2e-${{ matrix.shard }}-of-3/plan.json
          playwright-args: --project=chromium

      - name: Playwright
        run: npx playwright test --project=chromium --shard=${{ matrix.shard }}/3 --reporter=list,json
        env:
          PLAYWRIGHT_JSON_OUTPUT_FILE: proofline/e2e-${{ matrix.shard }}-of-3/report.json

      - name: Proofline collect
        if: always()
        uses: Ismet24f/proofline/check@v0.1.0
        with:
          operation: collect
          producer: e2e
          shard: ${{ matrix.shard }}/3
          plan: proofline/e2e-${{ matrix.shard }}-of-3/plan.json
          report: proofline/e2e-${{ matrix.shard }}-of-3/report.json
          out: proofline/e2e-${{ matrix.shard }}-of-3/envelope.json

      - uses: actions/upload-artifact@<full-sha> # current major, reviewed SHA
        if: always()
        with:
          name: proofline-e2e-${{ matrix.shard }}
          path: proofline/
          retention-days: 14

  reconcile:
    needs: [e2e]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@<full-sha> # current major, reviewed SHA
        with: { pattern: proofline-*, path: artifacts }
      - uses: Ismet24f/proofline/check@v0.1.0
        with:
          operation: reconcile
          producers: e2e=3
          artifacts: artifacts
          mode: report-only
```

In Playwright 1.62.1, CLI `--reporter=json` writes to stdout and does not preserve a config-defined JSON reporter `outputFile`. Consumers must set `PLAYWRIGHT_JSON_OUTPUT_FILE` to the same path passed to Proofline, as above; relying only on a config-array `outputFile` is unsupported.

The consumer's `npx playwright install`/`test` lines are theirs and may use `npx`; Proofline's own operations do not (§7.5).

### 6.2 What a fully skipped job can and cannot report

Because the plan runs inside the job, a job skipped by `if:` produces no fragment. Reconciliation reports **`no_evidence` for producer `e2e` shard `2/3`** — truthfully, with the manifest entry that expected it — but **cannot name the tests** that would have run. This is the accepted cost of eliminating the independent plan job. The summary says exactly this. Test-level naming for skipped jobs (e.g., from a prior default-branch plan) is a non-goal (§20).

---

## 7. Consumer contract

One bundled JavaScript action at `Ismet24f/proofline/check` with three operations sharing schemas and identity code.

All operations accept optional `working-directory` (default `.`). It is
repository-relative, must resolve to a directory inside `GITHUB_WORKSPACE`, and
defines the Playwright resolution/cwd plus the base for every other path input.
This is the supported monorepo contract.

### 7.1 `plan`

| Input                    | Required | Notes                                 |
| ------------------------ | -------- | ------------------------------------- |
| `working-directory`      | no       | default `.`, common to all operations |
| `producer`               | yes      | `[a-z0-9-]{1,32}`                     |
| `shard`                  | no       | `N/T`, default `1/1`                  |
| `playwright-args`        | no       | forwarded to list discovery           |
| `config`                 | no       | forwarded as `--config`               |
| `repository`, `revision` | no       | override §8.2                         |
| `out`                    | no       | default `proofline/plan.json`         |

### 7.2 `collect`

| Input               | Required | Notes                              |
| ------------------- | -------- | ---------------------------------- |
| `producer`, `shard` | yes      | must equal the job's `plan` inputs |
| `report`            | yes      | Playwright JSON report path        |
| `plan`              | no       | default `proofline/plan.json`      |
| `out`               | no       | default `proofline/envelope.json`  |

### 7.3 `reconcile`

| Input       | Required | Notes                                         |
| ----------- | -------- | --------------------------------------------- |
| `producers` | yes      | `id=total[,id=total]`                         |
| `artifacts` | yes      | directory of downloaded `proofline-*` folders |
| `mode`      | no       | `report-only` (default) or `enforce-evidence` |
| `out`       | no       | default `proofline-reconciliation.json`       |
| `summary`   | no       | default `true`                                |

### 7.4 Modes

- **`report-only`** — full report and outputs; evidence gaps and unexpected tests do not fail the step. Tool errors fail. Pilot default.
- **`enforce-evidence`** — fails on `runtime_skipped`, `incomplete`, `absent`, `no_evidence`, or `unexpected`. Failed tests remain the test job's responsibility. `retry_masked` never fails v0.1.

### 7.5 Process and network rules

- Proofline never invokes `npx`. `plan` resolves the repository's installed Playwright via `require.resolve('@playwright/test/cli', { paths: [workspace] })` and spawns it with `child_process.spawn(process.execPath, [cliPath, 'test', '--list', '--reporter=json', ...args], { shell: false })`. A missing or unresolvable Playwright is a tool error naming the lookup path.
- No operation opens a network connection. Artifact transport is GitHub's pinned actions. No token.

---

## 8. Plan contract

### 8.1 Discovery

`plan` runs list discovery (§7.5) with `--shard=N/T` when `shard ≠ 1/1`. Playwright 1.62.1 honours `--shard` in list mode (verified), so each fragment is the exact per-shard set. The fragment stores for every test: `projectName`, repo-relative POSIX `file`, `line`, `column`, `titlePath`, `expectedStatus`.

**Invariant: the plan keys on `expectedStatus`, never `status`.** In list mode Playwright reports every test's `status` as `skipped` (verified); using it would mark the whole suite disabled.

The fragment also stores the **selection evidence Playwright actually serializes**: `config.configFile`, `config.rootDir`, `config.shard`, configured `config.projects[].name`, normalized CLI selection arguments, `config.version` (Playwright), and raw `config.argv` for diagnostics. Playwright 1.62.1 retains every configured project in `config.projects` even when `--project` selects one, so that array must never be treated as the selected-project set. It also serializes regular-expression values such as `config.grep` as empty objects, so Proofline must not claim it can compare their pattern from the resolved JSON. Configuration-defined selectors are trusted only because plan and execution require the same immutable revision and repository-relative config path; CLI selectors are compared from canonicalized `config.argv`.

### 8.2 Repository and revision resolution

1. explicit inputs;
2. `GITHUB_REPOSITORY` + `GITHUB_SHA` (for `pull_request`, `github.event.pull_request.head.sha` is recorded alongside so merge and head SHAs are both visible);
3. `git remote get-url origin` normalized to `owner/repo` + `git rev-parse HEAD`;
4. tool error.

Revision must be a full lowercase 40-hex SHA. Branch names are never accepted.

### 8.3 Plan invariants

- All fragments in a run share repository and revision.
- Fragments of one producer share Playwright version, repository-relative `configFile`, repository-relative `rootDir`, configured project definitions, and normalized CLI selection arguments; only `shard.current` may differ.
- Discovery failure writes no fragment; `collect` then records `plan: missing`; reconciliation classifies the producer/shard `no_evidence`.
- Identity collisions within a fragment are a tool error listing every colliding Playwright test ID and `file:line:column`.
- An empty fragment is still written and uploaded.

### 8.4 Selection drift detection

Arguments appear twice in the consumer YAML (plan and execution). Drift is therefore **detected, not prevented**. `collect` compares a canonical selection descriptor derived from the fragment and report. It includes `shard`, repository-relative `configFile` and `rootDir`, Playwright version, positional test filters, and normalized CLI selection flags such as `--project`, `--grep`, and `--grep-invert`. Configured `config.projects` and serialized regex objects are recorded for diagnostics but are not used as evidence of the selected projects or regex patterns. Any difference is a **`selection_mismatch` tool error** in `collect` and again in `reconcile`, naming each differing field with planned vs actual values. Raw `config.argv` is retained for diagnosis; action-owned differences such as `--list` and reporter-output flags are removed before comparison.

`playwright-args` is tokenized into an argument array and passed to `spawn` with `shell: false`; it is never interpolated into a shell command. Each non-empty line is exactly one argument, so multi-value options use one-token forms such as `--project=chromium`, not `--project chromium` on one line. v0.1 accepts only documented selection-affecting arguments and positional test filters. Action-owned `--list`, `--reporter`, `--shard`, and `--config` flags are rejected in `playwright-args` because those have dedicated inputs or fixed behavior.

### 8.5 Selection modes

Explicit Playwright arguments are the only planning mode. `--only-changed` is a non-goal; if present in `playwright-args` it is recorded and the summary prints: _"Dependency-affected selection follows the import graph and does not prove which tests should protect the change."_

---

## 9. Result collection contract

`collect` runs under `if: always()`, validates the JSON report against a bounded schema, performs §8.4 when the plan exists, computes SHA-256, and writes an envelope: schema version; repository and revision; `GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`; producer, shard index/total; plan digest (or `missing`); report path and digest; collection timestamp; selection-check result (`match`, `mismatch`, or `unavailable` when the plan is missing). A readable-but-partial report (interrupted run) is preserved as partial evidence. `unavailable` is never treated as a match; reconciliation classifies the producer scope `no_evidence`.

Artifact names must be unique per producer/shard; duplicate envelope identities in one run are a tool error.

### 9.1 Producer completeness precedes test reconciliation

For every manifest producer/shard, reconciliation requires one valid fragment and one valid envelope whose report digest matches. Missing, malformed, mismatched, or duplicate → the scope is `no_evidence` (or `invalid`) and its planned tests inherit that. Only then are identities compared. This ordering is what keeps a missing shard visible when surviving shards happen to cover the same files.

---

## 10. Identity

Within one immutable revision and run only. Canonical key: `[projectName, playwrightTestId]`, where `playwrightTestId` is the built-in JSON `spec.id`.

- In verified 1.62.1 output, `spec.id` already differs by project. `projectName` remains in the key as an explicit partition and defence-in-depth consistency check; Proofline does not claim it is required for ID uniqueness.
- Test paths are POSIX metadata relative to the recorded `rootDir`; `rootDir` is stored repository-relative. These report-controlled display identities are lexically normalized and rejected on `..` escape. Proofline does not open them. Action input files and traversed artifact files are separately realpath-contained and symlink-rejected as described in §13.
- Unnamed project → reserved `<default>`; a real project may not use that name.
- `titlePath`, path, line, and column are retained for display and must agree between plan and result for the same key.
- Playwright IDs are not claimed stable across commits. They are used only because reconciliation is restricted to the same immutable revision and run.
- `--repeat-each` entries have distinct built-in IDs and remain distinct planned executions even when their source tuple is identical.
- No Proofline annotations are read. `PL-T-*` is not part of v0.1.

---

## 11. Classification — Playwright outcome semantics

Raw `status` is insufficient: `test.fail()` makes a failing result _expected_, and a runtime `test.skip()` looks like a planned skip. Classification combines the plan's `expectedStatus` with per-attempt statuses and the derived outcome (`expected`, `unexpected`, `flaky`, `skipped`).

Before classification, Proofline independently recomputes Playwright 1.62.x's outcome from `expectedStatus` and every raw attempt and requires exact equality with the report's outcome. It then applies the stricter terminal-attempt rules below. Any contradiction, including `flaky` paired with `skipped → passed` or `interrupted → passed`, is an invalid-report tool error and can never become `retry_masked`.

| Classification         | Derivation                                                                                                                     | Evidence gap                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `executed_as_expected` | outcome `expected`, single attempt (includes `test.fail()` that failed as declared)                                            | no                              |
| `retry_masked`         | outcome `flaky`                                                                                                                | no — reported separately        |
| `failed`               | outcome `unexpected` (includes timeouts, and `test.fail()` that unexpectedly passed)                                           | no — the test job already fails |
| `runtime_skipped`      | plan `expectedStatus ≠ skipped`, result status `skipped`                                                                       | **yes**                         |
| `incomplete`           | an attempt is `interrupted`, or the same report contains an interrupted attempt and this active planned test has zero attempts | **yes**                         |
| `absent`               | in fragment, not in the matching valid report                                                                                  | **yes**                         |
| `no_evidence`          | producer/shard failed §9.1; known planned tests may inherit it                                                                 | **yes**                         |

Non-primary: `planned_disabled`, `unexpected`, `duplicate`, `invalid`.

Precedence: `no_evidence` → `invalid` → report-wide interruption context → outcome evaluation. If any result in a valid report is `interrupted`, every active planned test in that report with zero attempts is `incomplete`, not `absent`; an observed `skipped` result remains `runtime_skipped` because it is execution evidence and may have completed before the signal. This deliberately avoids converting a genuine runtime skip into an interruption guess. Retry history is evaluated only when all attempts are valid and a terminal result exists. `retry_masked` is never merged into _not executed_.

---

## 12. Outputs

### 12.1 `proofline-reconciliation.json`

Schema and tool version; repository, revision, run ID/attempt, mode, timestamps; manifest with received/missing/duplicate/invalid producers and digests; selection-check results; one record per known planned test; unexpected records; counts per classification; separate producer-gap and known-test-gap counts; `status ∈ {complete, evidence_gaps, tool_error}`; exit decision and reason codes. A producer gap is counted once even when its known planned tests inherit `no_evidence`, preventing double-counting. Atomic write; no stale file can look current.

### 12.2 Step summary

First line:

- `✅ COMPLETE — all N active planned tests produced terminal evidence`
- `⚠️ EVIDENCE GAPS — P producer scopes and T known active planned tests lack trustworthy execution evidence`
- `❌ TOOL ERROR — Proofline could not evaluate this run`

Then producer table (including, for `no_evidence` producers, the explicit sentence "tests for this producer cannot be named because its plan was never produced"), classification counts, retry-masked list, and ≤25 affected identities as `file:line`. A clean run is three lines.

### 12.3 Action outputs

`status`, `planned-active`, `producer-gaps`, `known-test-gaps`, `not-executed`, `retry-masked`, `failed`, `unexpected`, `selection-mismatch`, `report-path`.

---

## 13. Security, privacy, portability

- Reads only declared inputs; writes only `out` paths and the step summary. No network. No token. No `npx`; child processes spawned with `shell: false` (§7.5).
- `working-directory` rejects traversal and resolved symlink escape outside `GITHUB_WORKSPACE`. Other relative inputs are contained by that resolved directory; artifact discovery does not follow symlinks. Concurrent filesystem replacement by another process is outside the v0.1 threat model.
- Artifact discovery bounds: depth 32, 4,096 directories, 20,000 entries, and 4,096 plan/envelope files. Aggregate distinct artifact JSON is capped at 512 MiB and read sequentially.
- Per-file JSON parsing bounds: 50 MB file, depth 64, 1 MB strings, 200k records; exceeding → tool error naming the bound.
- Errors name artifact + violated invariant; never print environment or full payloads.
- Consumer permissions: `contents: read`.
- Test titles/paths may be sensitive; documentation recommends `retention-days`; nothing leaves the runner.
- Linux runners. Windows deferred (§20).

---

## 14. Runtime and distribution

- Node 22 and 24; CI cache-bypassed on both. Node 20 refused via `engines` and a runtime check.
- Bundled; `dist/` committed and verified reproducible in CI.
- Release: immutable `v0.1.0`, floating `v0.1`, SHA in notes, checksums, dependency notice.
- No npm publication.

---

## 15. Repository changes before pilot (Phase A checklist)

- **A1** README: contract paragraph, §2 table (with the job-vs-workflow distinction), §6.1 workflow, §6.2 limitation. Delete the merge-state sentence.
- **A2** Repo description: _"Open-source completeness check for Playwright on GitHub Actions: proves every planned test produced evidence."_
- **A3** Remove unused `RegressionPlan`, `ReleaseDecision`, `EvidenceAssertion`, `PolicyViolation`, recommendation tiers, and their tests from public code. Record the scope decision in an ADR; Git history remains the archive.
- **A4** Reuse only directly applicable `playwright-reporter` components such as identity normalization, `<default>` handling, and atomic writes. Remove its current consumer installation path rather than preserving an unused public package.
- **A5** Replace `docs/validation/*` with §19's frozen manifest, normalized evidence ledgers, executable evaluator, and generated decision record.
- **A6** Verify current majors of `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`, `pnpm/action-setup`; record reviewed full SHAs in `examples/consumer-workflow.yml` and this repo's CI; clear the Node 20 deprecation annotation.
- **A7** Add `check/action.yml`, `check/dist/`, `examples/consumer-workflow.yml`, `SECURITY.md` updates, roadmap listing §20.

Breaking schema changes are permitted; every artifact carries `schemaVersion`; mismatches fail, never coerce.

---

## 16. Error handling

Product findings (gaps, unexpected, retries, failures) always yield a valid report and follow the mode's exit policy. Tool failures (unreadable input, schema violation, digest/revision mismatch, `selection_mismatch`, identity collision, unresolvable Playwright, unsupported report shape, write failure) exit non-zero in every mode and are never represented as evidence-gap results.

---

## 17. Verification — acceptance scenarios

Unit tests for parsers and schemas are necessary and insufficient. Playwright behavior scenarios run as 1.62.x subprocess fixtures; artifact-only corruption and reconciliation cases use bounded filesystem fixtures. Scenarios 3, 4, 12, and 20 also run as real GitHub Actions workflows in this repository.

1. Clean pass, one producer, one shard.
2. Clean pass, two projects × 3 shards; per-shard fragments equal per-shard reports.
3. Whole test job skipped by `if: false`, GitHub marks it successful → `no_evidence`, summary states tests cannot be named.
4. One shard's upload missing → `no_evidence` for that shard only.
5. Collect and upload after Playwright failure → `failed`, no gap.
6. Active planned test absent from its shard's report → `absent`.
7. `test.skip()` / `test.fixme()` at declaration → `planned_disabled`.
8. `test.skip(condition, reason)` invoked inside the test body → `runtime_skipped`, distinct from 7.
9. `test.fail()` failing as declared → `executed_as_expected`; `test.fail()` unexpectedly passing → `failed`.
10. First-attempt pass vs retry pass → `executed_as_expected` vs `retry_masked`; semantically contradictory retry histories fail as an invalid-report tool error in collect, reconcile, and the bundled action.
11. Terminal failure and timeout → `failed`, never a completeness gap.
12. `SIGINT` mid-run with partial report → the interrupted attempt and active planned tests with zero attempts are `incomplete`; already-observed runtime skips remain `runtime_skipped`. `SIGINT` during Playwright compilation may produce no JSON; an unreadable/missing artifact is `no_evidence`.
13. Unexpected and duplicate identities detected.
14. Malformed, oversized, mismatched-revision, digest-invalid artifacts → tool error.
15. Same inputs → deterministic record ordering and identities after excluding truthful timestamps and run-specific digests.
16. `--reporter=html,json` and config-array multi-reporter both preserve existing reporters.
17. Consumer fixture repo installs no Proofline package.
18. `report-only` vs `enforce-evidence` exit codes independently asserted for every primary classification, unexpected identities, and representative tool errors.
19. Summary and action outputs equal JSON counts.
20. Plan `--project=chromium`, execution `--project=firefox` → `selection_mismatch` tool error in `collect` and `reconcile`, naming the field.
21. Plan reads `expectedStatus`, not `status`: list-mode report with all `status: skipped` yields correct active/disabled split.
22. Playwright missing from `node_modules` → tool error naming the resolution path; no network attempted (asserted with a blocked-network fixture).
23. Clean cache-bypassed CI on Node 22 and 24; Node 20 refused with message.
24. `--repeat-each=2` produces distinct planned identities and reconciles both executions without a source-tuple collision.

---

## 18. Delivery

### 18.1 Implementation plan (required, time-boxed)

A goal-backward implementation plan is written **before** Phase B and committed as `docs/superpowers/plans/2026-09-06-proofline-completeness-first-v0.1-implementation.md`. It maps every §17 scenario to files, tests, and a review checkpoint, in small tasks. Authoring is time-boxed to **4 hours**; if it exceeds that, the plan is committed as-is and refined during implementation rather than delaying code further.

### 18.2 Phases

- **Phase A** — §15 checklist A1–A7.
- **Phase B** — vertical slice: `plan`, `collect`, `reconcile`, bundle, example workflow, scenarios 1–24.
- **Phase C** — dogfood in `report-only` on this repository and repositories the founder controls; every classification cross-checked against raw Playwright output on ≥20 PRs; false classifications fixed before external contact; `v0.1.0` tagged only after a clean consumer repository passes from a fresh clone.
- **Phase D** — pilot (§19).

### 18.3 Effort checkpoint (not a ceiling)

At **30 recorded hours** into A+B, hold a scope review. Permitted cuts, in order: multi-producer manifests (accept one `producers` entry), then the ≤25-identity list in the summary (counts only). **Never cut a §17 correctness scenario, a security bound, or Node 22 support to hit a number.** If the review shows correctness needs more time, the time is spent and the reason is recorded.

---

## 19. External validation gate — 30 days

### 19.1 Preflight (clock starts only when all are true)

- 8 qualified interviews **booked** (Playwright + GitHub Actions + QA/release/EM role + external team).
- 3 repository owners authorize `report-only` installation and name observable workflows.
- **Disease-signal qualification:** each pilot repository has ≥1 of: conditional test jobs, matrix or shards, a skip that can occur during test execution, or `retries ≥ 1`. Workflow-level path filtering alone does not qualify because Proofline cannot evaluate a workflow that never starts.
- Each pilot repository freezes its Playwright dependency to a tested 1.62.x lockfile for the observation window. A requested minor upgrade triggers the compatibility matrix as a same-day task; observations for that repository pause until it passes.
- No production secrets or customer payloads enter the study.
- The cohort, window, `evaluationAt` cutoff, repository-team mapping, evidence references, lockfile SHAs, and thresholds are frozen in `pilot-freeze.json`; its SHA-256 is retained separately and required by the evaluator. `evaluationAt` is no earlier than `windowEnd` and no later than 24 hours afterward, allowing one bounded day-30 capture period.

Preflight not met → keep recruiting; not evidence about the problem.

### 19.2 Required observations (30 days from preflight)

| #   | Observation                                                                                           | Threshold                         |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Qualified interviews completed                                                                        | ≥ 8                               |
| 2   | Interviewees ranking missing/misleading test-execution evidence in top-3 release problems             | ≥ 4                               |
| 3   | External repositories installed and reconciling                                                       | 3                                 |
| 4   | Pull requests observed                                                                                | ≥ 60                              |
| 5   | Customer-confirmed `not_executed` cases (owner agrees the gap was real and previously unknown)        | ≥ 3 across ≥ 2 teams              |
| 6   | Confirmed false positives unresolved at day 30                                                        | 0                                 |
| 7   | Teams keeping the action enabled, unprompted, at day 30                                               | ≥ 1                               |
| 8   | Budget-authority conversations probing `$99/repo/month` for retained history + audit export, verbatim | ≥ 1                               |
| 9   | Clean-PR summary noise, user-reported                                                                 | "ignored, not annoying" or better |

Thresholds freeze at preflight. Later records never change them.

Evidence is normalized across `interviews.csv`, `pilot-runs.csv`,
`pilot-findings.csv`, and `team-events.csv`. Unique participant aliases,
repository/PR pairs, and run/test identity hashes prevent duplicate counting.
Closed enums and exact allowed-key sets make every measure computable without accepting hidden freeze metadata. Canonical UTC timestamps reject impossible calendar dates. Each team may record each terminal event type once; enabled retention contradicting low-value removal is rejected. The dependency-free evaluator
reads each input once, validates and evaluates those immutable bytes, pins their SHA-256 in its decision record,
lists included and excluded IDs with reasons, and executes the mutually
exclusive rules below in order. `docs/validation/decision-gate.md` is the
operational authority for field contracts and the exact command.

The evaluator always labels its result `non_authoritative`: its `--as-of` value
and local clock are operator supplied, so deterministic evaluation proves which
bytes produced a result but not when those bytes existed. Before any candidate
outcome can authorize Stage 3, an independent reviewer must verify that
protected history contained the five exact input digests no later than
`evaluationAt`, and that an external timestamped record binds the reviewed
commit, decision digest, and freeze digest.

### 19.3 Outcomes

Before `evaluationAt`, the evaluator may emit `OBSERVING` (or the sole early `STOP` when all teams removed Proofline for low value). It rejects evaluation after the frozen cutoff. Final rules run only at the caller-supplied exact `evaluationAt`, but this is a candidate result until the independent chronology verification above proves the evidence existed by that cutoff.

- **PROCEED** — rows 1–8 met, classifications trusted, retention voluntary. Only after independent chronology verification does it authorize hosted-history _design_ only.
- **NARROW** — rows 2 and 5 meet their thresholds, no stop rule applies, and at least four qualified interviews independently identify the same frozen `W-...` alternative wedge; rewrite §4 first.
- **STOP** — rows 1, 3, 4 met and (row 2 < 2, row 5 = 0 in disease-qualified repos, an unresolved false positive exists, or every team removed the action for low value). All-team low-value removal has precedence over `PROCEED`. Legitimate: the problem is real but rare and §2's rollup suffices.
- **INCONCLUSIVE** — rows 1, 3, or 4 unmet. Change channel or extend. Claim nothing.

Internal-only installs, retrospective threshold edits, and AI opinions never count.

### 19.4 Investment review trigger

The next independent review runs only after executable CI evidence exists (Phase C complete) and recommends investment only with: usage in ≥5 repositories including the 3 pilots; ≥3 confirmed catches across ≥2 teams; trusted classifications; an independently chronology-verified gate; ≥1 paid pilot or signed commitment. Until then: **promising, not proven.**

---

## 20. Non-goals for v0.1

`--only-changed` planning mode · semantic change-to-test recommendations · requirement/risk/capability mapping · AI release decisions · `PASS`/`HOLD` policy engine · hosted API/DB/dashboard/billing/auth · Jira/Qase/TestRail/Slack · cross-commit identity or history · test-level naming for fully skipped jobs (prior-plan lookup) · flaky quarantine or retry policy · trace/video/screenshot hosting · Windows runner support · npm publication · compliance claims.

---

## 21. Risks

| Risk                                      | Mitigation                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| "Planned" read as "should have run"       | Vocabulary rule; no oracle mode exists                                                                                       |
| "We already have a rollup job"            | §2 table incl. job-vs-workflow distinction; disease-signal preflight                                                         |
| Plan/execution argument drift             | Detected by resolved-config comparison (§8.4); tool error, never silent                                                      |
| Skipped job's tests cannot be named       | Stated in summary and README (§6.2); non-goal to solve in v0.1                                                               |
| Missing shard hidden by surviving shards  | Manifest completeness before identity reconciliation                                                                         |
| `test.fail`/runtime skip misclassified    | Outcome semantics; fixtures 7–9                                                                                              |
| List-mode `status` misused                | `expectedStatus`-only invariant; fixture 21                                                                                  |
| `npx` breaks no-network promise           | `require.resolve` + `spawn(shell:false)`; fixture 22                                                                         |
| Stale action versions in examples         | A6 verifies majors and pins SHAs at implementation time                                                                      |
| Summary noise on green PRs                | Three-line clean summary; gate row 9                                                                                         |
| Playwright JSON shape changes             | Supported range pinned; unknown shape → tool error                                                                           |
| Interrupted run hides never-started tests | Report-wide interruption context turns zero-attempt active tests into `incomplete` without relabeling observed runtime skips |
| Scope creep                               | 30-hour checkpoint with feature-only cut list                                                                                |
| Planning overhead delays code             | Plan doc time-boxed to 4 hours                                                                                               |
| Pilot repos have no disease               | Preflight qualification                                                                                                      |
| Sensitive test names                      | No upload; retention guidance                                                                                                |

---

## 22. Resolved decisions

1. Completeness check, not recommendation engine; _planned_, never _should have run_.
2. Planning inside each test job; producer manifest at reconcile; skipped-job tests unnamed by design.
3. Selection drift detected via resolved config comparison and surfaced as a tool error.
4. Reconciliation is a required, always-running job with no token.
5. Built-in Playwright JSON is the evidence source; consumer reporters preserved.
6. Classification uses outcome semantics + `expectedStatus`; `executed_as_expected` replaces "clean."
7. `retry_masked` separate from _not executed_; never blocks v0.1.
8. No Proofline test IDs or annotations.
9. Proofline never invokes `npx`; spawns the resolved Playwright CLI with `shell: false`.
10. `--only-changed` is a non-goal.
11. Node 22 and 24; Node 20 refused.
12. Bundled GitHub Action; no npm.
13. Written implementation plan required, authoring time-boxed to 4 hours.
14. 30 hours is a scope-review checkpoint; correctness is never cut.
15. 30-day gate with disease-signal preflight and `INCONCLUSIVE` outcome.
16. Hosted-history design waits for an independently chronology-verified `PROCEED`; hosted implementation remains unauthorized.

---

## 23. References

- Playwright CLI — `--list`, `--shard`, `--reporter`, `--only-changed`: https://playwright.dev/docs/test-cli
- Playwright reporters and multi-reporter configuration: https://playwright.dev/docs/test-reporters
- Playwright retries and outcomes: https://playwright.dev/docs/test-retries
- GitHub Actions job conditions and skipped-job status: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions
- GitHub required status checks, pending checks, and skipped-but-required handling: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- GitHub protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- actions/checkout releases: https://github.com/actions/checkout/releases
- actions/setup-node releases: https://github.com/actions/setup-node/releases
- Node.js release schedule: https://github.com/nodejs/release#release-schedule

---

## 24. Approval boundary and next steps

Acceptance authorizes Phases A–C. It does not authorize hosted infrastructure, npm publication, external installation (Phase D needs §19.1 preflight), or public claims of market validation.

Sequence on acceptance:

1. Commit this document as `docs/superpowers/specs/2026-09-06-proofline-completeness-first-v0.1.md`; push.
2. Write the implementation plan (§18.1, ≤4 h); commit.
3. Phase A (A1–A7).
4. Phase B smallest end-to-end slice: scenarios 1, 3, 6, 8, 10, 20, 21 first.
5. Independent review only after Phase C produces executable CI evidence.
