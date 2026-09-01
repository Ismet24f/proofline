# ADR 0001: Playwright discovery through the reporter contract

**Status:** ACCEPTED
**Date:** 2026-09-01

## Context

Proofline needs an inventory before any browser tests execute. The inventory
must preserve the logical test identity, source location, selected Playwright
projects, annotations, tags, and static skip state. The evidence-model package
is the owner of the strict `TestInventory` and `TestDefinition` payload
schemas; this integration validates every generated inventory with
`parseInventory` before writing it.

## Decision

Use a custom Playwright reporter during `playwright test --list`. In
`onBegin`, map `suite.allTests()` into Proofline definitions and merge entries
with the same file and title path across projects. Project names are sorted and
deduplicated; the project name is deliberately excluded from identity.

The reporter reads `repository` and a lowercase 40-character `revision` from
`config.metadata.proofline`. Its default destination is
`.proofline/inventory.json` beneath `config.rootDir`; a reporter `outputFile`
option may override that location. Valid output is written via a sibling
temporary file and rename.

Identity prefers exactly one valid `proofline.id` annotation (`PL-T-` plus at
least five digits). Otherwise it derives a provisional `PL-P-` identifier from
SHA-256 over canonical JSON of repository, POSIX-normalized file path, and
title path. A duplicate identity for a different logical test, multiple
explicit-ID annotations, or an invalid explicit ID is fatal. Fatal discovery
suppresses the inventory.

Static skip state is represented only when Playwright reports
`expectedStatus === 'skipped'`. This decision does not claim discovery of
runtime conditional skips.

## Observed evidence

The accepted run used Node `v24.20.0` and Playwright `1.62.1`:

```sh
PATH='/Users/ankora/.nvm/versions/node/v24.20.0/bin:'"$PATH" \
  pnpm --dir examples/playwright-demo exec playwright test --list \
  --reporter=@proofline/playwright-reporter
```

The fixture contains two projects (`chromium`, `firefox`), two same-named
tests in different files, one statically skipped test, two parameterized rows,
and one `PL-T-00001` test annotated with a tag, capability, risk, and
requirement. Playwright listed 12 project-specific cases in two files. The
reporter produced one schema-valid six-definition inventory: every definition
contained both sorted project names, the skipped test was `SKIPPED`, same-named
tests in different files retained different provisional IDs, and the explicit
test retained all four annotations and derived metadata.

The reporter E2E also duplicates `PL-T-00001` and separately adds `PL-T-1`.
Both cases emit a clear fatal message, suppress the fixture inventory, and
return a non-zero process status without running browser tests.

## Exit-status deviation

The initial reporter implementation accumulated discovery errors and set
`process.exitCode = 2` in `onExit`. Playwright 1.62.1 overwrote that value after
`onExit` for a successful `--list` operation, so duplicate and invalid
identities incorrectly exited 0. The smallest supported correction is the
documented reporter `onEnd` status override: when an accumulated fatal failure
exists, the reporter returns `{ status: 'failed' }`. Playwright then exits
non-zero (its standard failure code is 1), while `onExit` still removes any
output and reports the diagnostics. No unsupported process wrapper is used.

## Consequences

The reporter contract is acceptable for Phase 0 because the accepted command
proves all required metadata and failure behavior against the installed
Playwright version. Revalidate this ADR when upgrading Playwright or changing
the reporter lifecycle contract.
