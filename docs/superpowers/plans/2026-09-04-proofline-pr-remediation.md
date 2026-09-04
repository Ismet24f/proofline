# Proofline PR Remediation Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Make PR #1 technically trustworthy, safe to try in ordinary Playwright 1.62.1 repositories, honestly documented, and ready for a fresh independent review.

**Architecture:** Preserve the existing pnpm/Turborepo monorepo and reporter-based `playwright test --list` discovery. Normalize Playwright-owned control annotations at the reporter boundary, enforce impossible-state rules in Zod schemas, and move build ordering into the declared task graph. Keep this remediation local and deterministic; do not add the recommendation engine, GitHub Action, hosted service, or customer-evidence claims.

**Tech Stack:** Node.js 24, TypeScript 6, pnpm 10, Turborepo 2, Playwright 1.62.1, Vitest 4, Zod 4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-proofline-narrow-wedge-remediation-design.md`

## Global Constraints

- Work from the repository root on `feature/phase-0-cli-alpha`.
- Use test-first RED/GREEN slices. Preserve unrelated user changes.
- Do not implement original Tasks 5–12 or claim demand, payment, partnership, or formal GitHub approval.
- Keep `repository` in provisional identity and keep truthful `generatedAt` timestamps.
- Do not add a fake root E2E configuration.
- Use repository-relative POSIX source paths in diagnostics whenever `config.rootDir` is available.
- Commit each task atomically. Do not push or mutate PR #1 until the final local verification passes.

## Task 1: Normalize Playwright control annotations

**Files:**

- Modify: `packages/playwright-reporter/src/reporter.e2e.test.ts:1-330`
- Modify: `packages/playwright-reporter/src/reporter.ts:26-135`
- Modify: `docs/decisions/0001-playwright-discovery.md:44-81`

### Step 1: Replace rejection tests with real subprocess compatibility cases

Add one temporary-fixture test that creates a Playwright file containing ordinary description-less `skip`, `fixme`, `fail`, and `slow` controls, including a test nested under `test.describe.skip`. Run discovery through `runDiscovery`, then assert:

```ts
import { test } from '@playwright/test';

test.describe('skip scope', () => {
  test.skip();
  test('ordinary skip', () => {
    throw new Error('discovery executed a test body');
  });
});

test.describe('fixme scope', () => {
  test.fixme();
  test('ordinary fixme', () => {
    throw new Error('discovery executed a test body');
  });
});

test.describe('fail scope', () => {
  test.fail();
  test('ordinary fail', () => {
    throw new Error('discovery executed a test body');
  });
});

test.describe('slow scope', () => {
  test.slow();
  test('ordinary slow', () => {
    throw new Error('discovery executed a test body');
  });
});

test.describe.skip('outer skipped scope', () => {
  test.skip();
  test('nested skip', () => {
    throw new Error('discovery executed a test body');
  });
});
```

This fixture deliberately uses Playwright APIs rather than constructing reporter objects, so the accepted normalization reflects the installed reporter contract.

```ts
expect(result.status, result.stderr || result.stdout).toBe(0);
const inventory = await loadInventory(fixtureInventory);
expect(inventory.tests.map(({ title, status }) => ({ title, status }))).toEqual(
  expect.arrayContaining([
    { title: 'ordinary skip', status: 'SKIPPED' },
    { title: 'ordinary fixme', status: 'SKIPPED' },
    { title: 'ordinary fail', status: 'ACTIVE' },
    { title: 'ordinary slow', status: 'ACTIVE' },
    { title: 'nested skip', status: 'SKIPPED' },
  ]),
);
expect(inventory.tests.flatMap((test) => test.annotations)).not.toEqual(
  expect.arrayContaining([
    expect.objectContaining({ type: 'skip', description: expect.anything() }),
    expect.objectContaining({ type: 'fixme', description: expect.anything() }),
    expect.objectContaining({ type: 'fail', description: expect.anything() }),
    expect.objectContaining({ type: 'slow', description: expect.anything() }),
  ]),
);
```

Retain the existing tests that prove described annotations survive and unknown description-less annotations fail. Remove the assertions that a second description-less skip is inherently invalid.

### Step 2: Run the focused test and observe RED

Run:

```sh
pnpm --filter @proofline/evidence-model build
pnpm --filter @proofline/playwright-reporter build
pnpm --filter @proofline/playwright-reporter exec vitest run src/reporter.e2e.test.ts
```

Expected: the new compatibility fixture exits non-zero because the current reporter rejects description-less `fixme`, `fail`, `slow`, or accumulated `skip` annotations.

### Step 3: Implement explicit normalization

In `reporter.ts`, add the framework-owned set and replace annotation-count inference:

```ts
const PLAYWRIGHT_CONTROL_ANNOTATIONS = new Set([
  'skip',
  'fixme',
  'fail',
  'slow',
]);

function sourceReference(config: FullConfig, test: TestCase): string {
  const file = toPosixPath(relative(config.rootDir, test.location.file));
  return `${file}:${String(test.location.line)}`;
}

function annotationsFor(config: FullConfig, test: TestCase): Annotation[] {
  return test.annotations.flatMap(({ description, type }) => {
    if (description === undefined && PLAYWRIGHT_CONTROL_ANNOTATIONS.has(type))
      return [];

    if (
      typeof description !== 'string' ||
      description.length === 0 ||
      description.trim() !== description
    ) {
      throw new Error(
        `annotation ${type} on ${sourceReference(config, test)} (${test.title}) must define a non-empty trimmed description`,
      );
    }

    return [{ type, description }];
  });
}
```

Pass `config` from `mapTest`. Do not silently discard description-less unknown annotations or Proofline annotations. Preserve described framework controls as normal metadata.

### Step 4: Run GREEN and the affected package gates

Run:

```sh
pnpm --filter @proofline/playwright-reporter lint
pnpm --filter @proofline/playwright-reporter typecheck
pnpm --filter @proofline/playwright-reporter build
pnpm --filter @proofline/playwright-reporter test
```

Expected: all commands exit 0; the subprocess cases prove no test body executed and fatal cases suppress inventory.

### Step 5: Correct the ADR and commit

Replace the “exactly one skip marker” contract with the approved four-type normalization rule. Record only behavior demonstrated by the new Playwright 1.62.1 subprocess fixtures.

```sh
git add packages/playwright-reporter/src/reporter.ts packages/playwright-reporter/src/reporter.e2e.test.ts docs/decisions/0001-playwright-discovery.md
git commit -m "fix: accept Playwright control annotations"
```

## Task 2: Reserve the implicit project sentinel and sanitize source diagnostics

**Files:**

- Modify: `packages/playwright-reporter/src/reporter.e2e.test.ts`
- Modify: `packages/playwright-reporter/src/reporter.ts:26-135`
- Modify: `docs/decisions/0001-playwright-discovery.md:23-42`

### Step 1: Add failing black-box cases

Add an E2E fixture with `projects: [{ name: '<default>' }]`. Assert non-zero status, no inventory, and:

```ts
expect(result.stderr + result.stdout).toContain(
  'Playwright project name <default> is reserved',
);
```

Extend one existing invalid-annotation fixture to assert the diagnostic contains the config-relative path and does not contain `fixtureDir`:

```ts
expect(result.stderr + result.stdout).toContain(
  'tests/missing-description.spec.ts:',
);
expect(result.stderr + result.stdout).not.toContain(fixtureDir);
```

### Step 2: Run RED

```sh
pnpm --filter @proofline/playwright-reporter exec vitest run src/reporter.e2e.test.ts
```

Expected: literal `<default>` succeeds today, and diagnostics expose an absolute temporary path.

### Step 3: Implement the sentinel guard and finish diagnostic coverage

Reuse the `sourceReference` helper added in Task 1 for every source-test diagnostic. Update `projectNameFor` so `''` maps to `<default>`, literal `<default>` throws the specified message, and multiple unnamed project objects remain fatal.

### Step 4: Verify and commit

```sh
pnpm --filter @proofline/playwright-reporter lint
pnpm --filter @proofline/playwright-reporter typecheck
pnpm --filter @proofline/playwright-reporter build
pnpm --filter @proofline/playwright-reporter test
git add packages/playwright-reporter/src/reporter.ts packages/playwright-reporter/src/reporter.e2e.test.ts docs/decisions/0001-playwright-discovery.md
git commit -m "fix: reserve default project identity"
```

## Task 3: Enforce evidence and verdict invariants

**Files:**

- Modify: `packages/evidence-model/src/schemas.test.ts:1-80`
- Modify: `packages/evidence-model/src/schemas.ts:127-171`

### Step 1: Add assertion-state matrix tests

Import `evidenceAssertionSchema` and define a valid base assertion. Add table-driven negative tests for:

```ts
[
  ['VERIFIED', [], undefined],
  ['CODE_VALIDATED', [], undefined],
  ['FAILED', [], undefined],
  ['BLOCKED', [], undefined],
  ['NOT_AFFECTED', [], undefined],
  ['ACCEPTED_RISK', [], 'approved verbally'],
];
```

Add positive cases proving `FAILED`, `BLOCKED`, and `NOT_AFFECTED` accept either one evidence ID or a message; `UNTESTED` and `UNKNOWN` accept neither; `ACCEPTED_RISK` accepts an evidence ID.

### Step 2: Add release-verdict matrix tests

Import `releaseDecisionSchema`. Add negative cases proving:

- `PASS` rejects any violation and each of `FAILED`, `BLOCKED`, `UNTESTED`, `UNKNOWN`.
- `HOLD` rejects an empty reason set but accepts a violation, `FAILED`, or `BLOCKED`.
- `INCOMPLETE` rejects decisions without `UNTESTED` or `UNKNOWN`, and accepts either state.

Use valid assertions under the Task 3 state rules so a failure identifies the verdict invariant rather than fixture setup.

### Step 3: Run RED

```sh
pnpm --filter @proofline/evidence-model exec vitest run src/schemas.test.ts
```

Expected: current schemas accept every impossible combination.

### Step 4: Add schema refinements

Add `superRefine` to `evidenceAssertionSchema` with these exact predicates:

```ts
const hasEvidence = assertion.evidenceIds.length > 0;
const hasExplanation = assertion.message !== undefined;

if (
  ['VERIFIED', 'CODE_VALIDATED', 'ACCEPTED_RISK'].includes(assertion.state) &&
  !hasEvidence
) {
  context.addIssue({
    code: 'custom',
    path: ['evidenceIds'],
    message: `${assertion.state} requires evidence`,
  });
}
if (
  ['FAILED', 'BLOCKED', 'NOT_AFFECTED'].includes(assertion.state) &&
  !hasEvidence &&
  !hasExplanation
) {
  context.addIssue({
    code: 'custom',
    path: ['evidenceIds'],
    message: `${assertion.state} requires evidence or a message`,
  });
}
```

Add `superRefine` to `releaseDecisionSchema` using derived booleans for disqualifying, hold, and incomplete states. Emit issues on `verdict` with stable messages. Do not embed future authorization or expiry policy.

### Step 5: Run GREEN and commit

```sh
pnpm --filter @proofline/evidence-model lint
pnpm --filter @proofline/evidence-model typecheck
pnpm --filter @proofline/evidence-model build
pnpm --filter @proofline/evidence-model test
git add packages/evidence-model/src/schemas.ts packages/evidence-model/src/schemas.test.ts
git commit -m "fix: reject impossible evidence decisions"
```

## Task 4: Repair the root verification contract and E2E build ordering

**Files:**

- Modify: `package.json:8-15`
- Modify: `turbo.json:3-8`
- Modify: `.github/workflows/ci.yml:11-24`
- Modify: `packages/playwright-reporter/src/reporter.e2e.test.ts:1-59`

### Step 1: Record the broken baseline

```sh
pnpm test:e2e
pnpm check
```

Expected: both fail because `vitest.e2e.config.ts` does not exist. Save the concise error in the task report, not in a committed generated artifact.

### Step 2: Remove hook-time builds

Delete `execFileSync`, `beforeAll`, and the build hook from `reporter.e2e.test.ts`. Tests must consume declared build artifacts.

### Step 3: Declare the actual task graph

Set root scripts to:

```json
"check": "pnpm lint && pnpm typecheck && pnpm build && pnpm test"
```

Remove `test:e2e`. Set Turbo tasks to:

```json
"test": { "dependsOn": ["^build"] },
"@proofline/playwright-reporter#test": { "dependsOn": ["build", "^build"] }
```

Keep existing build/lint/typecheck entries and remove the false `coverage/**` output declaration.

Change CI's three separate verification commands to one `pnpm check` step after frozen install.

### Step 4: Prove clean-artifact ordering

Move existing `dist` directories out of the repository or remove only generated `dist` directories after confirming they are ignored. Then run:

```sh
pnpm exec turbo run test --force
pnpm check
```

Expected: reporter production artifacts build before its subprocess tests; no 10-second hook owns the build; both commands exit 0.

### Step 5: Commit

```sh
git add package.json turbo.json .github/workflows/ci.yml packages/playwright-reporter/src/reporter.e2e.test.ts
git commit -m "fix: make root verification truthful"
```

## Task 5: Make the repository genuinely open source and usable

**Files:**

- Create: `LICENSE`
- Create: `NOTICE`
- Modify: `README.md:1-6`
- Modify: `docs/decisions/0001-playwright-discovery.md:53-61`
- Delete: `.superpowers/sdd/proofline-phase-0-cli-alpha-implementation-plan/task-3-report.md`
- Verify: `.gitignore:1-8`

### Step 1: Add the canonical license

Place the unmodified Apache License 2.0 text from `https://www.apache.org/licenses/LICENSE-2.0.txt` in root `LICENSE`. Keep the standard appendix; do not invent trademark or warranty claims. Add `license: "Apache-2.0"` to publishable package manifests only when those packages become non-private; the current private workspace packages remain unchanged.

Create root `NOTICE` with:

```text
Proofline
Copyright 2026 Proofline contributors
```

### Step 2: Replace the README with an honest first-run guide

Cover exactly:

- Current capability: schema-valid Playwright inventory through `playwright test --list`.
- Non-capabilities: no affected-test recommendation, execution reconciliation, hosted service, or release verdict automation.
- Requirements: Node 24, pnpm 10, Playwright 1.62.1.
- Source-workspace install: clone, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`.
- Minimal `metadata.proofline` and reporter configuration.
- Discovery: `pnpm exec playwright test --list --reporter=@proofline/playwright-reporter`.
- Default output: config-directory `.proofline/inventory.json`.
- Fatal-validation behavior and limitations, including explicit metadata and no runtime conditional-skip discovery.
- Development verification: `pnpm check`.
- Phase 0/design-partner invitation without asserting adoption.
- Apache-2.0 license.

State that packages are not yet published; do not present the workspace install as an npm consumer flow.

### Step 3: Remove internal and machine-specific material

Delete the one tracked task report with `git rm`. Replace the ADR command containing a home-directory Node path with portable prerequisites and `pnpm` invocation.

Run:

```sh
git ls-files | rg '(^\.superpowers/|task-[0-9]+-(brief|report)\.md$)'
rg -n '/Users/|/home/|[A-Za-z]:\\\\Users\\\\' README.md docs package.json packages examples .github
```

Expected: both searches return no matches. The `.superpowers/` ignore rule remains.

### Step 4: Verify the README verbatim and commit

Execute the README development commands from repository root. Confirm inventory is created at the documented location and parsed by the evidence model tests.

```sh
git add LICENSE NOTICE README.md docs/decisions/0001-playwright-discovery.md
git add -u .superpowers/sdd/proofline-phase-0-cli-alpha-implementation-plan/task-3-report.md
git commit -m "docs: prepare Proofline for public evaluation"
```

## Task 6: Run cumulative verification and prepare an honest PR update

**Files:**

- Review: all files changed since `f6433b9`
- External update after verification: GitHub PR #1 body

### Step 1: Run local gates under the supported runtime

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
git status --short
git diff --check f6433b9..HEAD
```

Expected: Node is `v24.x`; pnpm is `10.x`; all gates pass; no generated inventory, `dist`, cache, or temporary fixture is tracked; diff check is clean.

### Step 2: Verify from a clean detached checkout

Create a temporary detached worktree at `HEAD`, run frozen install and `pnpm check` with Turbo cache bypassed, record the result, then remove only that explicitly resolved temporary worktree. This is the proof that success does not depend on stale local build artifacts.

### Step 3: Perform an independent read-only review

Review the cumulative `f6433b9..HEAD` diff against every accepted reviewer finding and the approved design. The reviewer must report severity-ranked findings, verification run, residual risks, and one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `BLOCK`.

Any correctness, compatibility, security, or trust blocker returns to the owning task with a new RED test before correction.

### Step 4: Draft, verify, then publish the PR wording

Draft the PR body locally first. It must say:

- prior reviews were internal read-only agent reviews, not formal GitHub approvals;
- local clean-checkout verification result and exact commit;
- live GitHub checks separately, once available;
- customer demand, paid commitment, and OpenAI partnership are not established;
- one governing Phase 0 gate will be supplied by the companion reconciliation plan;
- Tasks 5–12 remain stopped.

Show the final draft to the user before `git push` or `gh pr edit`. After approval, push the branch, update PR #1, wait for both push and pull-request CI, and link the actual jobs. Do not convert a local pass into a live-CI claim.

## Completion Contract

This plan is complete only when Tasks 1–5 are committed, local and clean-checkout verification pass, the cumulative diff receives no blocking independent finding, the user approves the external update, the branch is pushed, and GitHub CI is green. This is technical readiness only; it is not product-market validation.
