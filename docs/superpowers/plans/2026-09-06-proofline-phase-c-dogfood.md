# Proofline Phase C Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase C technical dogfooding auditable, count only genuine pull-request observations, and keep `v0.1.0` blocked until at least 20 PR classifications are cross-checked against raw Playwright evidence and a clean separate consumer repository passes from a fresh clone.

**Architecture:** A dependency-free Node ESM validator reads one closed CSV observation ledger and one closed JSON consumer-verification record, validates and hashes the exact bytes it evaluates, and emits a deterministic readiness record. Public files contain aliases and digests only; run URLs and raw artifacts remain in protected evidence storage. The validator measures technical release readiness only and cannot create market evidence.

**Tech Stack:** Node.js 22 and 24, JavaScript ESM, TypeScript/Vitest test harness, CSV/JSON, GitHub Actions evidence.

**Spec:** `docs/superpowers/specs/2026-09-06-proofline-completeness-first-v0.1.md` §18.2 Phase C

## Global Constraints

- Run Proofline in `report-only` mode during Phase C.
- Count distinct genuine pull requests, never synthetic or empty PRs created to reach the threshold.
- Cross-check every emitted test and topology classification against the raw Playwright report and workflow state.
- A mismatch remains release-blocking until a separately evidenced fix is verified.
- Public records use opaque aliases and SHA-256 digests; names, private repository paths, raw URLs, and customer data are forbidden.
- The Phase C threshold is at least 20 distinct repository/PR pairs.
- The separate consumer must use Playwright 1.62.x, install no `@proofline/*` package, start from a fresh clone, and pass the reviewed bundled action.
- Node 22 and 24 remain supported; Node 20 remains refused.
- This plan does not authorize creating a GitHub repository, tagging `v0.1.0`, moving `v0.1`, publishing a release, starting Phase D, or making market claims.

---

### Task 1: Lock the Phase C evidence contracts

**Files:**

- Create: `docs/validation/phase-c-observations.csv`
- Create: `docs/validation/phase-c-consumer.json`
- Create: `docs/validation/phase-c-dogfood.md`
- Modify: `.gitignore`

**Interfaces:**

- Produces CSV header: `observation_id,repository_alias,pr_alias,observed_at,proofline_commit,playwright_version,mode,proofline_status,proofline_records,raw_records_checked,cross_check_result,false_classification_count,resolved_at,evidence_ref,resolution_evidence_ref`
- Produces consumer JSON keys: `schemaVersion,status,repositoryAlias,verifiedCommit,playwrightVersion,freshClone,noProoflinePackage,workflowConclusion,prooflineReportSha256,rawReportSha256,verifiedAt,reviewerAlias,evidenceRef`
- Evidence references and aliases use their published prefix plus exactly six decimal digits, for example `E-000001` and `OBS-000001`.

- [x] **Step 1: Add the empty observation ledger**

Create `docs/validation/phase-c-observations.csv` with exactly the published header and no data rows.

- [x] **Step 2: Add the draft consumer record**

Create `docs/validation/phase-c-consumer.json` with `schemaVersion: 1`, `status: "draft"`, and empty values for every remaining published key.

- [x] **Step 3: Document the cross-check protocol**

Document that a reviewer downloads the raw Playwright JSON, plan, envelope, and reconciliation output; checks topology, every planned test classification, every unexpected identity, selection, revision, and count; records exact SHA-256 values; and stores the URL mapping outside public alias-only files. State that synthetic conformance jobs do not count toward 20 PRs unless the PR itself is a genuine product change and its complete classification output is manually cross-checked.

- [x] **Step 4: Protect local evidence**

Add `.proofline-evidence/` to `.gitignore`. This directory is a convenience cache only; the durable protected evidence location remains operator-owned.

- [x] **Step 5: Commit**

```bash
git add .gitignore docs/validation/phase-c-observations.csv docs/validation/phase-c-consumer.json docs/validation/phase-c-dogfood.md
git commit -m "docs: define Phase C dogfood evidence"
```

### Task 2: Build the machine-checkable readiness gate with TDD

**Files:**

- Create: `packages/test-fixtures/scripts/validate-phase-c.mjs`
- Create: `packages/test-fixtures/src/validate-phase-c.test.ts`
- Modify: `packages/test-fixtures/package.json`

**Interfaces:**

- CLI: `node packages/test-fixtures/scripts/validate-phase-c.mjs [observations.csv consumer.json]`
- Output: `{ schemaVersion, outcome, counts, consumerVerified, authority, unresolvedObservationIds, inputSha256 }`
- Outcomes: `PHASE_C_OBSERVING` or `PHASE_C_READY`
- `counts` keys: `distinctPullRequests`, `qualifyingPullRequests`, `matchedObservations`, `resolvedMismatchObservations`, `unresolvedMismatchObservations`, `toolErrorObservations`, `requiredPullRequests`

- [x] **Step 1: Write failing contract tests**

Add tests proving that public drafts return `PHASE_C_OBSERVING`, 20 distinct matched observations plus a verified consumer return `PHASE_C_READY`, and 19 observations remain observing.

- [x] **Step 2: Run the focused tests and verify RED**

```bash
pnpm --filter @proofline/test-fixtures exec vitest run src/validate-phase-c.test.ts
```

Expected: FAIL because `validate-phase-c.mjs` does not exist.

- [x] **Step 3: Add adversarial failing tests**

Reject duplicate repository/PR pairs, noncanonical UTC timestamps, unknown keys or headers, non-opaque aliases, unsupported Playwright minors, any mode other than `report-only`, invalid statuses, negative or non-integer counts, `proofline_records !== raw_records_checked`, `matched` with nonzero false classifications, `mismatch` with zero false classifications, unresolved mismatches, invalid SHA-1/SHA-256 values, and a consumer marked verified without fresh-clone/no-package/success evidence.

- [x] **Step 4: Implement the minimal validator**

Read each size-bounded input once as a `Buffer`; parse and hash those exact bytes. Validate the closed contracts. Count distinct repository/PR pairs, but exclude `tool_error` rows from the qualifying threshold. Emit `PHASE_C_READY` only when at least 20 observations qualify, every record was cross-checked, every mismatch has canonical `resolved_at` plus a unique `resolution_evidence_ref`, and the consumer record is fully verified. Do not perform network access or infer market demand.

- [x] **Step 5: Add the package command**

Add `validate:phase-c` to `packages/test-fixtures/package.json` with value `node scripts/validate-phase-c.mjs`.

- [x] **Step 6: Run focused GREEN verification**

```bash
pnpm --filter @proofline/test-fixtures exec vitest run src/validate-phase-c.test.ts
pnpm --filter @proofline/test-fixtures lint
pnpm --filter @proofline/test-fixtures typecheck
```

Expected: all commands pass.

- [x] **Step 7: Commit**

```bash
git add packages/test-fixtures/package.json packages/test-fixtures/scripts/validate-phase-c.mjs packages/test-fixtures/src/validate-phase-c.test.ts
git commit -m "feat: make Phase C readiness executable"
```

### Task 3: Correct current status and bind live merge evidence

**Files:**

- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/validation/phase-c-observations.csv`
- Modify: `docs/validation/phase-c-dogfood.md`
- Modify: `.github/workflows/proofline-self-test.yml`

**Interfaces:**

- Consumes merged commit `0ed535430d5db541d376ccadae624d7f856583a9` and its successful CI/self-test runs.
- Produces one honest observation only if the raw Playwright artifacts and resulting classifications can be fully reconstructed and cross-checked.

- [x] **Step 1: Correct the README status**

Replace “await independent review” with the verified state: independently reviewed, merged, and entering Phase C dogfood. Keep `v0.1.0` explicitly unreleased and market status `promising, not proven`.

- [x] **Step 2: Record live merge workflow evidence**

In `docs/roadmap.md`, link CI run `34040951579` and self-test run `34040951549` for merge commit `0ed535430d5db541d376ccadae624d7f856583a9`, then check the two corresponding release-checklist items.

- [x] **Step 3: Inspect PR #2 evidence without inflating the count**

Download artifacts from the retained PR self-test run, reconstruct the reconciliation report with the reviewed commit, compare every classification with raw Playwright JSON and workflow topology, and record `OBS-001` only if the check is complete. If required artifacts are absent, document PR #2 as non-counting instead of manufacturing a row.

- [x] **Step 4: Retain a report-only reconciliation for future observations**

Change the successful three-shard reconciliation in `.github/workflows/proofline-self-test.yml` from `enforce-evidence` to `report-only`. Upload `consumer-happy.json` as `proofline-dogfood-reconciliation` with 90-day retention so a reviewer can compare it with the already retained plan, envelope, and raw Playwright reports. Preserve the existing assertions and adversarial jobs.

- [x] **Step 5: Run the public readiness gate**

```bash
pnpm --filter @proofline/test-fixtures validate:phase-c
```

Expected: `PHASE_C_OBSERVING`, with either zero or one distinct genuine PR and consumer status `draft`.

- [x] **Step 6: Commit**

```bash
git add .github/workflows/proofline-self-test.yml README.md docs/roadmap.md docs/validation/phase-c-observations.csv docs/validation/phase-c-dogfood.md
git commit -m "docs: start Phase C dogfood"
```

### Task 4: Verify and open the Phase C pull request

**Files:**

- Modify only files required to resolve verified failures from the commands below.

**Interfaces:**

- Produces a reviewable Phase C foundation; it does not produce a release.

- [x] **Step 1: Run supported-runtime gates**

```bash
# Node 22
pnpm turbo run lint typecheck build test --force
pnpm --filter @proofline/check bundle:check

# Node 24
pnpm turbo run lint typecheck build test --force
pnpm --filter @proofline/check bundle:check
```

Expected: every command passes with cache bypass for the full task graph.

- [x] **Step 2: Validate repository state**

```bash
git diff --check origin/main...HEAD
git status --short
```

Expected: no whitespace errors and a clean worktree after commits.

- [x] **Step 3: Request independent review**

Review the exact immutable head for validation bypasses, privacy leaks, false readiness, duplicate counting, and unsupported market claims. Resolve all Important or Critical findings before push approval.

- [ ] **Step 4: Push and create a PR after explicit approval**

Target `main`; keep the Phase C worktree and branch. The PR must state the exact observation count, consumer status, live merge-run URLs, unresolved evidence work, and `Market verdict: promising, not proven`.

### Operational checkpoint after this PR

Do not create a separate GitHub consumer repository without explicit owner approval. Once approved, create it from a minimal Playwright 1.62.x template, integrate the reviewed commit-pinned action without a Proofline package, run from a fresh clone, preserve raw and reconciliation digests in protected evidence, and update `phase-c-consumer.json` in a reviewed follow-up PR. Continue adding only genuine PR observations until the validator reaches 20; then request release review and explicit tag approval.
