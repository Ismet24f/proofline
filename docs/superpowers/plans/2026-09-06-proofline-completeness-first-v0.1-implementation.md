# Proofline Completeness-First v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an open-source GitHub Action that proves whether every active Playwright test planned by each declared job or shard produced trustworthy execution evidence.

**Architecture:** A pure TypeScript evidence model defines versioned plan, envelope, and reconciliation schemas. A Playwright-evidence package resolves the consumer's installed Playwright, normalizes list and execution JSON, validates selection consistency, and reconciles producer topology before test outcomes. A thin bundled `check` GitHub Action exposes `plan`, `collect`, and `reconcile`; GitHub artifact actions move files between jobs, while Proofline itself performs no network calls.

**Tech Stack:** TypeScript 6, Node 22/24, pnpm 10, Turbo, Zod 4, Vitest 4, Playwright 1.62.x, `@actions/core`, `@vercel/ncc`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-proofline-completeness-first-v0.1.md`

## Global Constraints

- Product wording is “planned,” never “should have run.” Proofline makes no business-coverage or release-safety claim.
- Playwright 1.62.x is the only supported report shape for v0.1; unknown shapes fail closed as tool errors.
- Node 22 and Node 24 are supported; Node 20 is explicitly refused.
- Proofline never invokes `npx`, opens a network connection, or uses a shell to execute consumer input.
- The consumer installs no Proofline package and supplies no token or Proofline test annotations.
- Canonical same-run identity is `[projectName, playwrightTestId]`; no cross-commit stability is claimed.
- Configuration-defined selectors are trusted through same revision plus same repository-relative config path. CLI selectors are compared from canonicalized `config.argv`; serialized regex objects and `config.projects` are not misrepresented as selected values.
- `retry_masked` is separate from `not_executed` and never blocks v0.1.
- `report-only` is the pilot default; tool errors fail in every mode.
- Linux is the only claimed runner platform. Paths are still normalized and containment-checked.
- All output writes are atomic. Malformed or partial input must never leave a stale current-looking report.
- Third-party GitHub actions are pinned to reviewed full commit SHAs in committed workflows.
- Work test-first. Each task ends with focused verification, the root check when applicable, diff review, and one atomic commit.

## File and Responsibility Map

| Path                                                  | Responsibility                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/evidence-model/src/completeness-types.ts`   | Serializable v0.1 domain types and reason codes                          |
| `packages/evidence-model/src/completeness-schemas.ts` | Strict Zod schemas and cross-field invariants                            |
| `packages/playwright-evidence/src/playwright-json.ts` | Bounded parsing and normalization of Playwright 1.62 JSON                |
| `packages/playwright-evidence/src/selection.ts`       | Canonical CLI-selection descriptor and mismatch diff                     |
| `packages/playwright-evidence/src/identity.ts`        | Same-run key creation and collision/source consistency checks            |
| `packages/playwright-evidence/src/metadata.ts`        | Repository, revision, run, and producer resolution                       |
| `packages/playwright-evidence/src/safe-files.ts`      | Path containment, bounded JSON reads, SHA-256, atomic writes             |
| `packages/playwright-evidence/src/plan.ts`            | Local Playwright resolution, list subprocess, plan artifact creation     |
| `packages/playwright-evidence/src/collect.ts`         | Execution-report validation, selection comparison, envelope creation     |
| `packages/playwright-evidence/src/reconcile.ts`       | Manifest-first reconciliation and deterministic classification           |
| `packages/playwright-evidence/src/summary.ts`         | Human-readable three-line clean summary and bounded detail               |
| `check/src/inputs.ts`                                 | GitHub Action input parsing and validation                               |
| `check/src/main.ts`                                   | Three-operation dispatcher, outputs, error boundary                      |
| `check/action.yml`                                    | Public action contract using Node 24 bundled runtime                     |
| `check/dist/index.js`                                 | Committed reproducible action bundle                                     |
| `packages/test-fixtures/fixtures/playwright-*`        | Playwright subprocess repositories and static malformed artifacts        |
| `examples/consumer-workflow.yml`                      | Copy-paste consumer integration with pinned action SHAs                  |
| `.github/workflows/proofline-self-test.yml`           | Real skipped-job, missing-shard, interruption, and selection-drift proof |
| `docs/validation/interviews.csv`                      | Qualified interview evidence                                             |
| `docs/validation/pilot-observations.csv`              | Immutable pilot PR observations and confirmations                        |

## Scenario Coverage Matrix

| Spec scenario                        | Owning task | Evidence                                |
| ------------------------------------ | ----------- | --------------------------------------- |
| 1–2 clean single/multi-shard         | 4, 6, 8     | subprocess plus reconciliation fixtures |
| 3 skipped job                        | 9           | real GitHub workflow                    |
| 4 missing upload                     | 6, 9        | fixture plus real GitHub workflow       |
| 5, 9–11 failures/outcomes/retries    | 5, 8        | real Playwright JSON fixtures           |
| 6–8 absent/disabled/runtime skip     | 4–6, 8      | parser and subprocess fixtures          |
| 12 interruption                      | 5, 9        | signal fixture plus real workflow       |
| 13–15 unexpected/invalid/determinism | 2, 3, 6     | pure bounded fixtures                   |
| 16 reporter coexistence              | 8           | subprocess fixture                      |
| 17 no Proofline install              | 8           | isolated consumer fixture               |
| 18 modes                             | 6, 7        | reconciliation and action-adapter tests |
| 19 output consistency                | 6, 7        | report/summary/output contract tests    |
| 20 selection mismatch                | 5, 9        | fixture plus real workflow              |
| 21 `expectedStatus` invariant        | 4           | list JSON fixture                       |
| 22 missing Playwright/no network     | 3, 4        | blocked-network fixture                 |
| 23 Node matrix/refusal               | 1, 9        | local and GitHub matrix                 |
| 24 repeat-each identity              | 4, 8        | subprocess fixture                      |

---

### Task 1: Align Public Truth, Runtime Support, and Retired Scope

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `packages/evidence-model/src/types.ts`
- Modify: `packages/evidence-model/src/schemas.ts`
- Modify: `packages/evidence-model/src/schemas.test.ts`
- Create: `docs/decisions/0002-completeness-first-v0.1.md`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: final v0.1 specification and current `pnpm check` contract.
- Produces: Node engine string `>=22 <23 || >=24 <25`; a narrow public README; the existing inventory model without speculative recommendation/policy/release-decision exports; ADR 0002; `check/dist/` allowlisted despite the repository-wide `dist/` ignore.

- [ ] **Step 1: Write the scope-removal assertions**

Add an `obsolete public concepts are not exported` runtime test to `schemas.test.ts` before removing the schemas:

```ts
import * as publicApi from './index.js';

it('does not export the retired release-intelligence schemas', () => {
  for (const retired of [
    'regressionPlanSchema',
    'releaseDecisionSchema',
    'evidenceAssertionSchema',
    'policyViolationSchema',
  ]) {
    expect(publicApi).not.toHaveProperty(retired);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/evidence-model test -- src/schemas.test.ts
```

Expected: FAIL because the retired types and schemas remain exported.

- [ ] **Step 3: Remove speculative public code and document the decision**

Delete only recommendation, changed-file, evidence-assertion, policy-violation, and release-decision types/schemas/tests. Keep `TestInventory`, `TestDefinition`, and parsing needed by the current reporter until Task 9 removes its consumer path. Write ADR 0002 with sections `Context`, `Decision`, `Consequences`, and `Supersedes`, stating that Git history—not `docs/archive`—preserves removed code.

Set:

```json
"engines": {
  "node": ">=22 <23 || >=24 <25"
}
```

Add this after `dist/` in `.gitignore`:

```gitignore
!check/dist/
!check/dist/**
```

- [ ] **Step 4: Replace stale product language**

Rewrite `README.md` around the exact one-question contract, the honest rollup comparison, job-level skip boundary, fully-skipped-job naming limitation, Node 22/24, current source status, and Apache-2.0. Remove the manual metadata and unpublished reporter installation walkthrough. Do not include pricing, adoption, safety, or partnership claims.

Defer the matching public repository-description mutation until the completed branch is pushed in Task 9, so the public description never promises code that is not yet visible.

- [ ] **Step 5: Pin the base CI actions and add the runtime matrix**

Resolve current tags and immutable commits at implementation time:

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
gh api repos/actions/setup-node/releases/latest --jq .tag_name
gh api repos/pnpm/action-setup/releases/latest --jq .tag_name
```

For each returned tag, resolve and record its commit with:

```bash
gh api repos/OWNER/REPO/git/ref/tags/TAG --jq .object.sha
```

If `.object.type` is `tag`, peel it with `gh api repos/OWNER/REPO/git/tags/SHA --jq .object.sha`. Update CI to matrix `node: [22, 24]`, use `pnpm/action-setup` before `setup-node`, and run `pnpm turbo run lint typecheck build test --force` without Turbo cache restoration.

- [ ] **Step 6: Verify Phase A truth changes**

Run:

```bash
PATH=/Users/ankora/.nvm/versions/node/v22.22.2/bin:$PATH pnpm install --frozen-lockfile
PATH=/Users/ankora/.nvm/versions/node/v22.22.2/bin:$PATH pnpm turbo run lint typecheck build test --force
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm turbo run lint typecheck build test --force
rg -n 'ReleaseDecision|RegressionPlan|PolicyViolation|should have run|Node 20' README.md packages/evidence-model/src docs/decisions/0002-completeness-first-v0.1.md
```

Expected: both Node matrices pass; `rg` finds retired names only in the ADR explanation and never finds “should have run” as a product promise.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore .github/workflows/ci.yml README.md packages/evidence-model/src docs/decisions/0002-completeness-first-v0.1.md
git commit -m "chore: align repository with completeness-first v0.1"
```

---

### Task 2: Define Strict Completeness Evidence Schemas

**Files:**

- Create: `packages/evidence-model/src/completeness-types.ts`
- Create: `packages/evidence-model/src/completeness-schemas.ts`
- Create: `packages/evidence-model/src/completeness-schemas.test.ts`
- Modify: `packages/evidence-model/src/index.ts`

**Interfaces:**

- Consumes: Zod 4 and repository/revision invariants from `schemas.ts`.
- Produces: `parsePlanArtifact`, `parseResultEnvelope`, `producerManifestSchema`, `parseReconciliationReport`; types `ProducerRef`, `SelectionDescriptor`, `TestIdentity`, `PlanArtifact`, `ResultEnvelope`, `ReconciliationReport`, `Classification`.

- [ ] **Step 1: Write the failing schema table**

Create table-driven tests covering strict unknown-key rejection, producer IDs, shard bounds, 40-hex revisions, same-run identity, digest shape, every classification, and report count invariants:

```ts
const producer = { id: 'e2e', shard: { current: 1, total: 3 } };
const identity = {
  key: '["chromium","pw-id-1"]',
  projectName: 'chromium',
  playwrightTestId: 'pw-id-1',
  file: 'checkout.spec.ts',
  line: 10,
  column: 3,
  titlePath: ['checkout', 'pays'],
};

it.each([
  [{ id: 'E2E', shard: { current: 1, total: 1 } }, 'id'],
  [{ id: 'e2e', shard: { current: 0, total: 1 } }, 'current'],
  [{ id: 'e2e', shard: { current: 2, total: 1 } }, 'current'],
])('rejects invalid producer reference %#', (value, field) => {
  expect(() => producerRefSchema.parse(value)).toThrow(field);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/evidence-model test -- src/completeness-schemas.test.ts
```

Expected: FAIL because completeness schemas do not exist.

- [ ] **Step 3: Implement the exact serializable contracts**

Define these discriminants and fields; use readonly arrays in TypeScript and strict Zod objects:

```ts
export type Classification =
  | 'executed_as_expected'
  | 'retry_masked'
  | 'failed'
  | 'runtime_skipped'
  | 'incomplete'
  | 'absent'
  | 'no_evidence';

export interface ProducerRef {
  id: string;
  shard: { current: number; total: number };
}

export interface SelectionDescriptor {
  configFile: string;
  rootDir: string;
  playwrightVersion: string;
  shard: { current: number; total: number };
  cli: readonly string[];
  configuredProjects: readonly string[];
}

export interface TestIdentity {
  key: string;
  projectName: string;
  playwrightTestId: string;
  file: string;
  line: number;
  column: number;
  titlePath: readonly string[];
}
```

`PlanArtifact` has `schemaVersion: 1`, repository, revision, optional head revision, producer, selection, generatedAt, tests `{ identity, expectedStatus }[]`, and digest. `ResultEnvelope` has the same run identity, producer, `planDigest | 'missing'`, report path/digest, collectedAt, and a selection check union `{ status: 'match' } | { status: 'mismatch'; differences } | { status: 'unavailable'; reason: 'plan_missing' }`. `ReconciliationReport` contains topology records, planned records, unexpected records, `producerGaps`, `knownTestGaps`, exact classification counts, `status`, mode, reason codes, and timestamps. It has no combined numeric gap total because unknown tests in a fully skipped producer cannot be counted.

Cross-field refinements must enforce `current <= total`, unique producer refs, unique test keys per plan, sum of known-test classification counts equals planned-active, and `status: complete` implies zero producer gaps, zero known-test gaps, zero unexpected tests, and zero tool errors.

- [ ] **Step 4: Prove positive and negative schema cases**

Add one valid fixture per artifact and one negative mutation per invariant. Run the focused test, then package lint/typecheck/build:

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/evidence-model test -- src/completeness-schemas.test.ts
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/evidence-model lint
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/evidence-model typecheck
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/evidence-model build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/evidence-model/src
git commit -m "feat: define completeness evidence contracts"
```

---

### Task 3: Add Filesystem, Metadata, and Process Safety Primitives

**Files:**

- Create: `packages/playwright-evidence/package.json`
- Create: `packages/playwright-evidence/tsconfig.json`
- Create: `packages/playwright-evidence/tsconfig.build.json`
- Create: `packages/playwright-evidence/src/safe-files.ts`
- Create: `packages/playwright-evidence/src/safe-files.test.ts`
- Create: `packages/playwright-evidence/src/metadata.ts`
- Create: `packages/playwright-evidence/src/metadata.test.ts`
- Create: `packages/playwright-evidence/src/arguments.ts`
- Create: `packages/playwright-evidence/src/arguments.test.ts`
- Create: `packages/playwright-evidence/src/index.ts`

**Interfaces:**

- Consumes: Node standard library and `@proofline/evidence-model`.
- Produces: `readBoundedJson(path, limits)`, `writeJsonAtomically(path, value)`, `sha256File(path)`, `resolveInputPath(workspace, path)`, `resolveOutputPath(workspace, path)`, `resolveRepositoryContext(options)`, `parseArgumentLines(input)`, `normalizeSelectionArgv(argv)`.

- [ ] **Step 1: Write failing security and precedence tests**

First create the package manifest, tsconfigs, empty `index.ts`, and test files so the workspace filter resolves but the imported functions are absent. Then use `mkdtemp` and real symlinks. Assert traversal, symlink escapes, 50 MB + 1 byte, depth 65, 1 MB + 1 string, and 200,001 records fail with named bounds. Assert explicit metadata wins over GitHub env, GitHub wins over local Git, and a missing 40-hex revision fails. For arguments:

```ts
expect(parseArgumentLines('--project=chromium\ntests/checkout')).toEqual([
  '--project=chromium',
  'tests/checkout',
]);
expect(() => parseArgumentLines('--reporter=json')).toThrow('action-owned');
expect(normalizeSelectionArgv(['--project', 'chromium', '-g', 'pays'])).toEqual(
  ['--grep=pays', '--project=chromium'],
);
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test
```

Expected: FAIL because the package and functions do not exist.

- [ ] **Step 3: Implement bounded I/O without shell or network behavior**

Implement file-size check before `readFile`, `JSON.parse`, then an iterative object walk that counts nodes, depth, and UTF-8 string bytes without recursion. `resolveInputPath` uses `realpath`; `resolveOutputPath` resolves the nearest existing parent and rejects symlink escape. `writeJsonAtomically` uses exclusive temp creation, `fsync`, close, rename, and finally cleanup. Hash streams the file through `createHash('sha256')`.

`parseArgumentLines` treats each non-empty line as one argv token—no quote evaluation. `normalizeSelectionArgv` canonicalizes positional test filters plus `--project`, `--grep`/`-g`, `--grep-invert`, and `--only-changed`; it removes only action-owned `--list` and reporter flags from actual `config.argv`. Reject `--shard` and `--config` in `playwright-args` because they have dedicated inputs.

- [ ] **Step 4: Implement metadata resolution**

Use this signature:

```ts
export interface RepositoryContextOptions {
  workspace: string;
  repository?: string;
  revision?: string;
  env: NodeJS.ProcessEnv;
  runGit(args: readonly string[]): Promise<string>;
}

export async function resolveRepositoryContext(
  options: RepositoryContextOptions,
): Promise<{ repository: string; revision: string; headRevision?: string }>;
```

Normalize HTTPS and SSH GitHub origin URLs to `owner/repo`. Read `GITHUB_EVENT_PATH` only through `readBoundedJson`; record pull-request head SHA but keep `GITHUB_SHA` as the executed revision.

- [ ] **Step 5: Run focused and package checks**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence lint
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence typecheck
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence build
```

Expected: all pass; no test needs network access.

- [ ] **Step 6: Commit**

```bash
git add packages/playwright-evidence
git commit -m "feat: add bounded evidence primitives"
```

---

### Task 4: Capture and Normalize Per-Shard Playwright Plans

**Files:**

- Create: `packages/playwright-evidence/src/playwright-json.ts`
- Create: `packages/playwright-evidence/src/playwright-json.test.ts`
- Create: `packages/playwright-evidence/src/identity.ts`
- Create: `packages/playwright-evidence/src/identity.test.ts`
- Create: `packages/playwright-evidence/src/selection.ts`
- Create: `packages/playwright-evidence/src/selection.test.ts`
- Create: `packages/playwright-evidence/src/plan.ts`
- Create: `packages/playwright-evidence/src/plan.test.ts`
- Modify: `packages/playwright-evidence/src/index.ts`
- Create: `packages/test-fixtures/fixtures/playwright-basic/playwright.config.ts`
- Create: `packages/test-fixtures/fixtures/playwright-basic/tests/outcomes.spec.ts`

**Interfaces:**

- Consumes: Task 2 artifact schemas; Task 3 safe files, metadata, argument parsing.
- Produces: `parsePlaywrightJson(input)`, `makeIdentity(spec, test)`, `buildSelectionDescriptor(config)`, `diffSelection(planned, actual)`, `resolvePlaywrightCli(workspace)`, `createPlan(options): Promise<PlanArtifact>`.

- [ ] **Step 1: Capture immutable real Playwright 1.62 fixtures**

Run list discovery for shard 1/2, project selection, static skip/fixme, parameterized tests, and `--repeat-each=2`. Store sanitized JSON fixtures with timestamps and absolute workspace prefixes replaced by `/workspace`; do not hand-author the Playwright shape.

- [ ] **Step 2: Write failing normalization tests**

Assert:

```ts
const plan = normalizePlanJson(rawListJson, context);
expect(
  plan.tests.filter((test) => test.expectedStatus !== 'skipped'),
).not.toHaveLength(0);
expect(
  plan.tests.every((test) => test.identity.playwrightTestId.length > 0),
).toBe(true);
expect(new Set(plan.tests.map((test) => test.identity.key)).size).toBe(
  plan.tests.length,
);
expect(
  plan.tests
    .filter((test) => test.identity.titlePath.at(-1) === 'disabled')
    .at(0)?.expectedStatus,
).toBe('skipped');
```

For repeat-each, assert two source-identical entries have different Playwright IDs and keys. For `--project=chromium`, assert the descriptor records the CLI project selector even though raw `config.projects` includes Firefox.

- [ ] **Step 3: Run tests and confirm RED**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test -- src/playwright-json.test.ts src/identity.test.ts src/selection.test.ts src/plan.test.ts
```

Expected: FAIL because normalization and plan creation do not exist.

- [ ] **Step 4: Implement strict Playwright normalization**

Walk nested suites and specs. Use the spec's built-in `id`, plus each contained test's `projectName` and `expectedStatus`. Build title paths from nested suite titles plus spec title. Reject missing IDs, unknown expected statuses, duplicate `[projectName,id]`, path escapes, and incompatible `config.version`. Sort by identity key.

Do not compare serialized regex bodies or infer selected projects from `config.projects`. Normalize repository-relative config/root paths and canonical CLI selectors.

- [ ] **Step 5: Implement local CLI resolution and plan subprocess**

Use `createRequire(import.meta.url).resolve('@playwright/test/cli', { paths: [workspace] })`. Spawn:

```ts
spawn(
  process.execPath,
  [
    cliPath,
    'test',
    '--list',
    '--reporter=json',
    ...selectionArgs,
    '--shard',
    shard,
  ],
  {
    cwd: workspace,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
```

Capture stdout with a 50 MB bound, keep stderr bounded for diagnostics, require exit code 0, parse, add repository context, compute the digest over canonical JSON excluding the digest field, and atomically write the plan. Never fall back to `npx` or PATH lookup.

- [ ] **Step 6: Prove missing Playwright and list semantics**

Run plan against a temporary consumer without `node_modules`, with `HTTPS_PROXY` and registry variables pointed to an unreachable local address. Assert the error names `@playwright/test/cli` and no child process starts. Run the actual fixture and assert list-mode `status: skipped` does not disable tests whose `expectedStatus` is `passed`.

- [ ] **Step 7: Run package verification and commit**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence lint
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence typecheck
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence build
git add packages/playwright-evidence packages/test-fixtures/fixtures/playwright-basic
git commit -m "feat: capture Playwright plan fragments"
```

---

### Task 5: Collect Results and Detect Selection Drift

**Files:**

- Create: `packages/playwright-evidence/src/outcomes.ts`
- Create: `packages/playwright-evidence/src/outcomes.test.ts`
- Create: `packages/playwright-evidence/src/collect.ts`
- Create: `packages/playwright-evidence/src/collect.test.ts`
- Modify: `packages/playwright-evidence/src/playwright-json.ts`
- Modify: `packages/playwright-evidence/src/index.ts`
- Add fixtures under: `packages/test-fixtures/fixtures/playwright-results/`

**Interfaces:**

- Consumes: `PlanArtifact`, Playwright JSON parser, selection descriptor/diff, bounded I/O.
- Produces: normalized observed test records and `collectEvidence(options): Promise<ResultEnvelope>`; `deriveObservedOutcome(test)` returning `executed_as_expected | retry_masked | failed | runtime_skipped | incomplete`.

- [ ] **Step 1: Generate result fixtures through Playwright**

Create non-browser tests for pass, declared `test.fail`, unexpected pass under `test.fail`, terminal failure, timeout, runtime body skip, static skip, and retry pass. Generate JSON with Playwright rather than hand-authoring it. Create a partial static fixture by truncating only after first confirming whether SIGINT produced readable JSON; document the observed branch in the test name.

- [ ] **Step 2: Write the failing outcome table**

```ts
it.each([
  ['expected', ['passed'], 'passed', 'executed_as_expected'],
  ['expected', ['failed'], 'failed', 'executed_as_expected'],
  ['flaky', ['failed', 'passed'], 'passed', 'retry_masked'],
  ['unexpected', ['timedOut'], 'passed', 'failed'],
  ['unexpected', ['passed'], 'failed', 'failed'],
  ['skipped', ['skipped'], 'passed', 'runtime_skipped'],
  ['unexpected', ['interrupted'], 'passed', 'incomplete'],
])('classifies %s %#', (outcome, attempts, plannedExpectedStatus, expected) => {
  expect(
    deriveObservedOutcome({ outcome, attempts, plannedExpectedStatus }),
  ).toBe(expected);
});
```

- [ ] **Step 3: Write drift and envelope tests**

Plan Chromium and execute Firefox; expect `selection_mismatch` naming `cli --project`. Test mismatch for shard, config path, root path, Playwright version, grep, and positional filters. Test that reporter differences alone do not mismatch. Test digest mismatch. For a missing plan with a valid report, expect an envelope with `planDigest: 'missing'` and `selectionCheck: { status: 'unavailable', reason: 'plan_missing' }`.

- [ ] **Step 4: Run and confirm RED**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test -- src/outcomes.test.ts src/collect.test.ts
```

Expected: FAIL because result collection is absent.

- [ ] **Step 5: Implement minimal collection**

Parse the report under Task 3 bounds, normalize every test using Task 4 identities, compare source metadata for matching keys, compare selection descriptors, and calculate the report SHA-256. With a valid plan and matching selection, atomically write an envelope that references both digests. With a valid report but missing plan, write the explicit unavailable envelope described in Step 3 so reconciliation can report `no_evidence`. On selection mismatch, atomically write an envelope containing the differences and then throw a typed `ProoflineToolError('selection_mismatch')`, allowing the `if: always()` upload to preserve the diagnosis. On a missing report or invalid report shape, remove any stale envelope and throw the relevant stable tool error.

- [ ] **Step 6: Verify and commit**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence lint
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence typecheck
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence build
git add packages/playwright-evidence packages/test-fixtures/fixtures/playwright-results
git commit -m "feat: collect Playwright execution evidence"
```

---

### Task 6: Reconcile Producer Topology and Test Evidence

**Files:**

- Create: `packages/playwright-evidence/src/manifest.ts`
- Create: `packages/playwright-evidence/src/manifest.test.ts`
- Create: `packages/playwright-evidence/src/reconcile.ts`
- Create: `packages/playwright-evidence/src/reconcile.test.ts`
- Create: `packages/playwright-evidence/src/summary.ts`
- Create: `packages/playwright-evidence/src/summary.test.ts`
- Modify: `packages/playwright-evidence/src/index.ts`
- Add fixtures under: `packages/test-fixtures/fixtures/reconciliation/`

**Interfaces:**

- Consumes: all Task 2 artifacts, normalized observations from Task 5, safe reads/writes from Task 3.
- Produces: `parseProducerManifest('e2e=3,api=1')`, `reconcileEvidence(options): Promise<ReconciliationReport>`, and `renderGitHubSummary(report): string`.

- [ ] **Step 1: Write failing manifest tests**

Assert whitespace normalization, deterministic ordering, duplicate IDs, invalid IDs, zero/negative/oversized shard counts, and a hard maximum of 100 producers and 1,000 total shards.

- [ ] **Step 2: Write the classification matrix first**

Create one fixture per primary classification and non-primary condition. Required assertions include:

```ts
expect(report.counts).toEqual({
  plannedActive: 7,
  executedAsExpected: 1,
  retryMasked: 1,
  failed: 1,
  runtimeSkipped: 1,
  incomplete: 1,
  absent: 1,
  noEvidence: 1,
  producerGaps: 1,
  knownTestGaps: 4,
  notExecuted: 4,
  unexpected: 1,
});
expect(report.status).toBe('evidence_gaps');
```

Test precedence: a missing producer yields producer-level `no_evidence`; if its plan fragment exists but envelope/report does not, its active tests inherit `no_evidence`; if the whole job produced no fragment, the report must state that its tests cannot be named rather than inventing records.

- [ ] **Step 3: Write mode, determinism, and summary tests**

Assert `report-only` returns an exit decision of 0 for product gaps, `enforce-evidence` returns 1 for gaps/unexpected, and all tool errors return 2. Failed tests alone do not make Proofline re-fail because Playwright owns that job result. Sort producers by ID/shard and tests by identity key. Compare reports after deleting `generatedAt`, `evaluatedAt`, and run-specific digests.

Assert a complete summary has exactly three non-empty lines. Assert detailed summaries cap identities at 25 and include the exact fully-skipped-producer limitation sentence.

- [ ] **Step 4: Run and confirm RED**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test -- src/manifest.test.ts src/reconcile.test.ts src/summary.test.ts
```

Expected: FAIL because reconciliation is absent.

- [ ] **Step 5: Implement manifest-first reconciliation**

Enumerate every expected producer/shard before reading artifact folders. Reject duplicate envelope identities. For each scope: verify plan/envelope/report presence, schema, same run/repository/revision, plan digest, report digest, and selection status. If an envelope is absent but both plan and report exist, rerun their selection comparison before choosing `no_evidence`; preserve `selection_mismatch` as a tool error instead of hiding the failed collect step. Only valid scopes reach identity comparison. Match `[projectName,playwrightTestId]`, compare display metadata, classify planned active tests, separate planned disabled tests, and record unexpected identities.

Always create a valid diagnostic `ReconciliationReport`, including `tool_error`, then atomically write it. Never downgrade a tool error to `no_evidence` when an artifact exists but contradicts its digest or selection.

- [ ] **Step 6: Verify and commit**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence lint
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence typecheck
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence build
git add packages/playwright-evidence packages/test-fixtures/fixtures/reconciliation
git commit -m "feat: reconcile planned and observed evidence"
```

---

### Task 7: Expose the Bundled GitHub Action

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `eslint.config.js`
- Modify: `turbo.json`
- Modify: `package.json`
- Create: `check/package.json`
- Create: `check/tsconfig.json`
- Create: `check/src/inputs.ts`
- Create: `check/src/inputs.test.ts`
- Create: `check/src/main.ts`
- Create: `check/src/main.test.ts`
- Create: `check/action.yml`
- Generate: `check/dist/index.js`
- Generate: `check/dist/sourcemap-register.cjs` if produced by the pinned bundler

**Interfaces:**

- Consumes: `createPlan`, `collectEvidence`, `reconcileEvidence`, `renderGitHubSummary`; `@actions/core` inputs/outputs/summary.
- Produces: public action operations `plan`, `collect`, `reconcile`; stable action outputs and exit codes 0/1/2.

- [ ] **Step 1: Write input-contract tests**

First add `check` to `pnpm-workspace.yaml`, create its package/tsconfig with the listed dependencies and scripts, and create test files importing not-yet-implemented modules so the filtered test command fails for the intended reason. Inject an adapter instead of mutating real action environment in tests:

```ts
export interface ActionsPort {
  getInput(name: string, options?: { required?: boolean }): string;
  setOutput(name: string, value: string | number): void;
  setFailed(message: string): void;
  writeSummary(markdown: string): Promise<void>;
}
```

Test required inputs per operation, defaults, unknown operation, invalid mode, safe paths, and output mapping.

- [ ] **Step 2: Write dispatcher tests and confirm RED**

Mock core ports and operation functions. Assert each operation calls exactly one domain function. Assert product enforcement exit 1 uses `process.exitCode = 1` without calling `setFailed`; tool errors call `setFailed` and set exit 2. Assert summary count outputs equal the report.

Run:

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check test
```

Expected: FAIL because the action package is absent.

- [ ] **Step 3: Implement the thin adapter**

Keep `main.ts` under 200 lines. Convert action inputs to domain options, call the selected operation, write outputs through `@actions/core`, and append summary only in reconcile when enabled. Catch only at the top-level boundary; preserve stable reason codes and redact payloads.

Use `runs.using: node24` and `runs.main: dist/index.js` in `action.yml`. Document every input/output from the spec with exact defaults.

- [ ] **Step 4: Configure reproducible bundling**

Add scripts:

```json
{
  "build": "pnpm bundle",
  "bundle": "ncc build src/main.ts -o dist --minify --source-map",
  "bundle:check": "pnpm bundle && git diff --exit-code -- dist",
  "lint": "eslint src --max-warnings 0",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

Update the root build/check graph so source checks precede bundle verification. Ensure `check/dist/**` is tracked and no other `dist` directory is accidentally added.

- [ ] **Step 5: Run action package verification**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm install --frozen-lockfile
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check lint
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check typecheck
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check test
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check bundle
shasum -a 256 check/dist/index.js
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check bundle
shasum -a 256 check/dist/index.js
```

Expected: all checks pass and both printed bundle hashes are identical. After the bundle is committed, CI's `bundle:check` enforces `git diff --exit-code -- dist`.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml eslint.config.js turbo.json package.json check
git commit -m "feat: expose Proofline GitHub action"
```

---

### Task 8: Prove Real Playwright Outcomes and Consumer Isolation

**Files:**

- Create: `packages/test-fixtures/src/run-playwright.ts`
- Create: `packages/test-fixtures/src/run-playwright.test.ts`
- Extend fixtures under: `packages/test-fixtures/fixtures/playwright-basic/`
- Create: `packages/test-fixtures/fixtures/consumer/package.json`
- Create: `packages/test-fixtures/fixtures/consumer/playwright.config.ts`
- Create: `packages/test-fixtures/fixtures/consumer/tests/evidence.spec.ts`
- Create: `packages/playwright-evidence/src/subprocess.e2e.test.ts`
- Modify: `examples/playwright-demo/package.json`
- Remove after migration: `packages/playwright-reporter/src/reporter.ts`
- Remove after migration: `packages/playwright-reporter/src/reporter.e2e.test.ts`
- Remove after migration: `packages/playwright-reporter/src/index.ts`

**Interfaces:**

- Consumes: built action/domain operations and local Playwright 1.62.x.
- Produces: executable evidence for scenarios 1, 2, 5–12, 16, 17, 20–22, and 24; no public custom-reporter installation path.

- [ ] **Step 1: Build a subprocess harness**

Implement:

```ts
export async function runCommand(options: {
  cwd: string;
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  signalAfterMs?: number;
}): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}>;
```

Spawn with `shell: false`, bound stdout/stderr, and terminate only the owned child process. Tests must never invoke a browser or external URL.

- [ ] **Step 2: Write end-to-end scenario tests**

For each scenario, run `createPlan`, execute local Playwright with JSON plus one existing reporter, run `collectEvidence`, then `reconcileEvidence`. Assert classifications and source locations, not snapshots alone. Use environment variables to activate runtime skip, failure, timeout, and retry behavior independently in isolated tests within the same spec file.

- [ ] **Step 3: Prove reporter coexistence and repeat-each**

Run once with CLI `--reporter=line,json` and once with config-array reporters. Assert the non-JSON reporter output exists and the JSON report reconciles. Run `--repeat-each=2` and assert both built-in IDs are present with no collision.

- [ ] **Step 4: Prove consumer isolation**

The consumer fixture package depends only on `@playwright/test`; it must not mention `@proofline/*`. Invoke the workspace-built action code against it and assert plan/collect/reconcile succeed. Add:

```ts
expect(JSON.stringify(consumerPackage)).not.toContain('@proofline/');
```

- [ ] **Step 5: Remove the obsolete reporter consumer path**

After all action E2E tests pass, remove reporter implementation and demo dependency. If `packages/playwright-reporter` has no remaining reusable source, remove the package and workspace references entirely. Move only reusable identity/atomic-write tests to their new owning packages; do not keep compatibility wrappers for an unpublished package.

- [ ] **Step 6: Run E2E and full checks**

```bash
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/playwright-evidence test -- src/subprocess.e2e.test.ts
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm check
```

Expected: every isolated scenario passes; no Proofline package appears in the consumer fixture; current reporter references are absent from README/examples.

- [ ] **Step 7: Commit**

```bash
git add packages examples pnpm-lock.yaml pnpm-workspace.yaml turbo.json
git commit -m "test: prove Playwright evidence workflows"
```

---

### Task 9: Add Pinned Consumer Example and Real GitHub Self-Tests

**Files:**

- Create: `examples/consumer-workflow.yml`
- Create: `.github/workflows/proofline-self-test.yml`
- Modify: `.github/workflows/ci.yml`
- Create: `SECURITY.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: committed `check/dist`, action operations, scenario fixtures, reviewed GitHub action SHAs.
- Produces: copy-paste integration; real GitHub evidence for scenarios 3, 4, 12, and 20; security/reporting documentation; reproducible bundle gate.

- [ ] **Step 1: Resolve and pin all action dependencies**

Use the Task 1 release/tag commands for `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `actions/upload-artifact`, and `actions/download-artifact`. Record `owner/repo`, release tag, commit SHA, and verification date in comments in `examples/consumer-workflow.yml`. Never commit `@main` or a floating third-party major.

- [ ] **Step 2: Write the consumer example**

Use one `e2e` producer with three shards, `fail-fast: false`, plan before test, collect/upload under `if: always()`, and required reconcile under `if: always()`. Use newline-tokenized `playwright-args`. Set `if-no-files-found: warn` on producer uploads because the manifest—not upload-artifact—must classify a missing job. State that the reconcile check must be configured as required.

- [ ] **Step 3: Add real workflow scenarios**

Create deterministic jobs:

- `skipped-producer` with `if: false` and manifest expectation;
- `missing-upload` with one declared shard intentionally omitting upload;
- `interrupted-run` sending SIGINT to the owned Playwright child;
- `selection-mismatch` planning Chromium and executing Firefox.

Each reconciliation runs in `report-only` where a product gap is expected and asserts JSON with a Node one-liner. Tool-error scenarios use `continue-on-error: true` only on the Proofline step, then assert its `outcome == 'failure'` and inspect the diagnostic report. These jobs are tests of Proofline and must not become release evidence for market validation.

- [ ] **Step 4: Add bundle and Node gates**

CI matrix runs Node 22/24 with cache bypass. Add a Node 20 negative job that executes `node check/dist/index.js` directly under setup-node 20 with minimal input environment and asserts the exact unsupported-runtime message; using the action through `uses:` would run GitHub's declared Node 24 action runtime and would not test this guard. Add `pnpm --filter @proofline/check bundle:check` and a clean-clone smoke job.

- [ ] **Step 5: Document security and dependency notices**

`SECURITY.md` states supported versions, private reporting channel, no network/token behavior, artifact sensitivity, path containment, and unsupported GHES/Windows boundaries. Generate `THIRD_PARTY_NOTICES.md` from the lockfile and bundled dependencies using a pinned script in `check/scripts/generate-notices.mjs`; verify it is deterministic.

- [ ] **Step 6: Validate workflow syntax and local contracts**

```bash
pnpm exec prettier --check .github/workflows/ci.yml .github/workflows/proofline-self-test.yml examples/consumer-workflow.yml README.md SECURITY.md THIRD_PARTY_NOTICES.md
rg -n 'uses: [^#]+@(main|master|v[0-9]+)$' .github examples/consumer-workflow.yml
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm check
```

Expected: formatting passes; the unpinned-action search returns no results; full check passes.

- [ ] **Step 7: Commit and push for live workflow evidence**

```bash
git add .github examples README.md SECURITY.md THIRD_PARTY_NOTICES.md check/scripts
git commit -m "ci: prove Proofline action end to end"
git push -u origin feature/completeness-first-v0.1
gh repo edit Ismet24f/proofline --description "Open-source completeness check for Playwright on GitHub Actions: proves every planned test produced evidence."
```

The description command changes only the public description; it must not change visibility, topics, branch protection, or other settings. After push, require every workflow job to finish and record run URLs in the PR description. A local pass cannot substitute for scenarios 3, 4, 12, and 20.

---

### Task 10: Replace the Validation Kit and Prepare the v0.1 Release Candidate

**Files:**

- Replace: `docs/validation/decision-gate.md`
- Create: `docs/validation/interviews.csv`
- Create: `docs/validation/pilot-observations.csv`
- Remove: superseded CSVs in `docs/validation/`
- Create: `docs/roadmap.md`
- Modify: `README.md`
- Modify: `NOTICE`

**Interfaces:**

- Consumes: spec §19 thresholds and verified action workflow.
- Produces: one non-circular 30-day gate, minimal append-only evidence files, narrow roadmap, and release-candidate checklist. Does not start the pilot or claim adoption.

- [ ] **Step 1: Write machine-checkable CSV contracts**

Use exact headers:

```csv
interview_id,team_alias,booked_at,conducted_at,qualified,role,playwright_github_actions,top_three_problem,budget_authority,price_probe_response,evidence_url
```

```csv
observation_id,team_alias,repository_alias,pr_alias,observed_at,disease_signal,proofline_status,classification,previously_unknown,customer_confirmed,false_positive,resolved_at,evidence_url
```

Add a TypeScript validation script under `packages/test-fixtures/scripts/validate-pilot-data.mjs` that rejects duplicate IDs, raw repository names, invalid booleans, mutable timestamps, and missing confirmation evidence.

- [ ] **Step 2: Replace the gate text exactly from the spec**

The gate must implement preflight, frozen 30-day window, thresholds 1–9, and mutually exclusive `PROCEED`, `NARROW`, `STOP`, `INCONCLUSIVE`. State that internal CI, public repository inspection, AI review, and unconfirmed detections do not count.

- [ ] **Step 3: Remove superseded process files safely**

Delete `commitment-register.csv`, `field-dictionary.md`, `installation-scorecard.csv`, `interview-guide.md`, `interview-scorecard.csv`, `selection-risk-probe.csv`, and `workflow-diary.md` only after all unique privacy/qualification fields needed by the new two CSVs and gate have been mapped. Git history remains the archive.

- [ ] **Step 4: Add the narrow roadmap and release checklist**

Roadmap stages are `v0.1 local completeness`, `30-day pilot`, and `hosted-history design only after PROCEED`. Copy every non-goal from spec §20. The release checklist requires clean Node 22/24 checks, deterministic bundle, clean consumer fixture, live workflow run URLs, immutable `v0.1.0` tag plan, floating `v0.1` update plan, checksums, and dependency notices. It must explicitly say the tag is not created in this task.

- [ ] **Step 5: Run final repository verification**

```bash
PATH=/Users/ankora/.nvm/versions/node/v22.22.2/bin:$PATH pnpm turbo run lint typecheck build test --force
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm turbo run lint typecheck build test --force
PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:$PATH pnpm --filter @proofline/check bundle:check
node packages/test-fixtures/scripts/validate-pilot-data.mjs
git diff --check origin/main...HEAD
git status --short
```

Expected: all commands pass and the worktree is clean after the final commit.

- [ ] **Step 6: Commit**

```bash
git add docs/validation docs/roadmap.md README.md NOTICE packages/test-fixtures/scripts/validate-pilot-data.mjs
git commit -m "docs: establish the v0.1 pilot gate"
```

- [ ] **Step 7: Final review checkpoint**

Open a PR containing exact commit list, spec/scenario traceability, Node 22/24 results, live self-test run URLs, consumer workflow, unresolved limitations, and the statement `Market verdict: promising, not proven`. Request an independent code/security review. Do not tag `v0.1.0`, install on external repositories, or begin the 30-day clock until review findings are resolved and the user explicitly approves release.

---

## Execution Order and Stop Conditions

Execute Tasks 1–10 in order. Stop and revise the spec/plan rather than improvising if any of these occur:

- Playwright 1.62 JSON cannot distinguish a required classification with the documented fields.
- Selection drift cannot be detected without claiming regex/project evidence the JSON does not contain.
- A fully skipped producer is given invented test identities.
- The action requires a token, network call, consumer package install, shell interpolation, or cross-commit identity promise.
- A correctness or security scenario would need to be cut to meet the 30-hour review checkpoint.

At each task boundary, inspect `git diff`, run the focused commands, and keep unrelated user changes untouched. The external validation gate and any hosted work remain unauthorized until the conditions in the specification are met.
