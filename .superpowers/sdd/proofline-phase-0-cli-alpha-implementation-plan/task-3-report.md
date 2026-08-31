# Task 3 Report: Versioned Evidence Model

## Outcome

Added the provider-neutral `@proofline/evidence-model` package with strict
versioned runtime schemas and exported TypeScript domain contracts.

## Delivered contract

- Exported all requested unions and interfaces, including readonly collection
  fields and the `UnmappedRisk` support type.
- Added strict Zod 4 schemas for every persisted/domain object.
- Enforced schema version `1`, lowercase 40-character revisions, ISO datetimes,
  non-empty trimmed fields, stable test-ID formats, positive test lines,
  non-empty recommendation reasons, and conditional renamed-file `oldPath`.
- Implemented `parseInventory(input)` with duplicate stable test-ID rejection.
- Added package build, lint, typecheck, and test scripts, plus the Zod 4
  runtime dependency and lockfile resolution.

## TDD evidence

### RED

`pnpm --filter @proofline/evidence-model test` was first run after the test
file and package harness were added, using Node 24.20.0. It failed at test
collection with the expected error:

```text
Cannot find module './schemas.js' imported from .../src/schemas.test.ts
```

The initial shell used Node 18.17.1 and could not start Vitest 4; subsequent
commands used the repository-required Node 24.20.0 runtime.

### GREEN

After implementation, focused tests passed:

```text
Test Files  1 passed (1)
Tests  9 passed (9)
```

The tests cover the required valid/invalid inventory cases, both stable ID
formats, malformed ID rejection, and the conditional `ChangedFile.oldPath`
rule.

## Verification

All commands below completed successfully with Node 24.20.0:

```text
pnpm --filter @proofline/evidence-model test       # 9/9 passed
pnpm --filter @proofline/evidence-model lint
pnpm --filter @proofline/evidence-model typecheck
pnpm --filter @proofline/evidence-model build
pnpm test                                          # 2 packages, 10 tests passed
```

## Self-review

- Confirmed strict-object schemas and all controller-specified fields are
  exported through the package entry point.
- Confirmed the `RENAMED` / `oldPath` rule rejects both absent required paths
  and irrelevant paths for other statuses.
- Configured the production build separately from typecheck so test sources are
  not emitted into `dist`.
- `git diff --check` reported no whitespace errors.

## Concern

The ambient shell defaults to Node 18.17.1 while this workspace requires Node
24. Commands need the available Node 24.20.0 runtime selected (or the local
environment updated) to run Vitest 4 successfully.

## Fix round 1: Review findings

### Files changed

- `packages/evidence-model/src/schemas.ts`
- `packages/evidence-model/src/schemas.test.ts`
- `packages/evidence-model/package.json`
- `packages/evidence-model/tsconfig.json`
- `packages/evidence-model/tsconfig.build.json`

### Corrections

- Added a cross-field test identity invariant: `PL-T-*` IDs require
  `EXPLICIT`, and `PL-P-*` IDs require `PROVISIONAL`.
- Added regression tests for each identity/stability mismatch and duplicate
  inventory IDs.
- Restored the frozen `test` script to `vitest run`.
- Introduced `tsconfig.build.json`, excluding `src/**/*.test.ts` from emitted
  production artifacts while retaining tests in the typecheck project used by
  ESLint.

### RED/GREEN evidence

After adding the two identity mismatch tests, the focused test command failed
as intended: 2 failed and 10 passed, because mismatched IDs were accepted.
After the cross-field refinement and test fixture correction, the focused suite
passed 12/12.

### Verification

All commands below used Node 24.20.0 via:

```text
env PATH=/Users/ankora/.nvm/versions/node/v24.20.0/bin:/Users/ankora/.nvm/versions/node/v20.18.0/bin:/usr/local/bin:/usr/bin:/bin
```

```text
pnpm --filter @proofline/evidence-model test       # 1 file, 12/12 passed
pnpm --filter @proofline/evidence-model lint       # clean
pnpm --filter @proofline/evidence-model typecheck  # clean
pnpm --filter @proofline/evidence-model build      # tsc -p tsconfig.build.json
find packages/evidence-model/dist -name '*.test.*' -print  # no output
pnpm test                                          # 2 packages, 13/13 tests passed
```
