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
with the same file, source line, and title path across projects. Project names
are sorted and deduplicated; the project name is deliberately excluded from
identity.

The reporter reads `repository` and a lowercase 40-character `revision` from
`config.metadata.proofline`. Its default destination is
`.proofline/inventory.json` beneath the directory containing `config.configFile`.
When Playwright has no config file, that base falls back to `process.cwd()`.
A relative reporter `outputFile` override resolves from that same config
directory; an absolute override remains absolute. Valid output is written via a
sibling temporary file and rename.

An unnamed implicit Playwright project is represented as the non-empty
`<default>` sentinel in the inventory. More than one unnamed project is
rejected as ambiguous. The sentinel collides with a real project literally
named `<default>`: inventory consumers cannot distinguish that name from the
implicit project, so configurations should reserve it for the sentinel.

Identity prefers exactly one valid `proofline.id` annotation (`PL-T-` plus at
least five digits). Otherwise it derives a provisional `PL-P-` identifier from
SHA-256 over canonical JSON of repository, POSIX-normalized file path, and
title path. A duplicate identity for a different logical test, multiple
explicit-ID annotations, or an invalid explicit ID is fatal. Fatal discovery
suppresses the inventory.

Static skip state is represented only when Playwright reports
`expectedStatus === 'skipped'`. Playwright 1.62.1 emits description-less
framework control annotations for `skip`, `fixme`, `fail`, and `slow`; the
reporter excludes any description-less annotation of those four types because
they are framework controls rather than Proofline metadata. Described framework
controls remain normal metadata. Every other description-less annotation is
fatal. This decision does not claim discovery of runtime conditional skips.

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
return a non-zero process status without running browser tests. Playwright 1.62.1
subprocess fixtures prove that ordinary `skip`, `fixme`, `fail`, and `slow`
controls, including `skip` nested under `test.describe.skip`, are accepted
without running browser test bodies. The resulting `skip` and `fixme` tests are
`SKIPPED`; `fail` and `slow` tests are `ACTIVE`; and the control annotations are
excluded from inventory metadata. Description-less `proofline.id` and unknown
annotations remain fatal. A same-file source-location collision is exercised
through a preceding reporter that gives two valid declarations the same source
path; the line-aware merge key keeps them separate and `parseInventory` rejects
the resulting provisional-ID collision.

## Exit-status deviation

The initial reporter implementation accumulated discovery errors and set
`process.exitCode = 2` in `onExit`. Playwright 1.62.1 overwrote that value after
`onExit` for a successful `--list` operation, so duplicate and invalid
identities incorrectly exited 0. The smallest supported correction is the
documented reporter `onEnd` status override. `onEnd` now validates with
`parseInventory`, writes atomically, removes stale output after every fatal
validation or write failure, reports diagnostics, and returns
`{ status: 'failed' }` when needed. Playwright then exits non-zero (its
standard failure code is 1). No unsupported process wrapper or `onExit`
exit-code mutation is used. The atomic writer claims its sibling temporary file
with exclusive create before writing it, and removes only a temporary file it
owns after either write or rename failure.

## Consequences

The reporter contract is acceptable for Phase 0 because the accepted command
proves all required metadata and failure behavior against the installed
Playwright version. Revalidate this ADR when upgrading Playwright or changing
the reporter lifecycle contract.
