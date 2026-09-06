# Phase C Dogfood Evidence

Phase C establishes technical release confidence; it is not customer adoption,
market validation, revenue evidence, or evidence of an OpenAI partnership. The
release stays blocked until the dependency-free validator reports
`PHASE_C_READY`, the exact evidence has independent review, and the owner
explicitly approves the release.

## Public contracts and protected evidence

`phase-c-observations.csv` and `phase-c-consumer.json` are alias-only public
records. Use mechanically assigned, zero-padded six-digit identifiers such as
`OBS-000001`, `R-000001`, `PR-000001`, `P-000001`, and `E-000001`. The fixed
shape prevents descriptive aliases but cannot prove semantic opacity, so the
independent reviewer must still inspect the public records. Never put names,
private repository paths, raw URLs, access tokens, test payloads, or customer
data in them.

For each `E-` reference, retain the URL mapping and these exact artifacts in an
access-controlled evidence location:

- the GitHub workflow identity and conclusion;
- the plan fragment and result envelope for every producer/shard;
- the raw Playwright JSON report for every producer/shard;
- the final reconciliation JSON;
- SHA-256 digests for the raw reports and reconciliation output;
- the review notes explaining every classification comparison.

`.proofline-evidence/` is ignored for safe local inspection, but it is only a
temporary cache and is not the durable evidence location.

## Observation qualification

One row represents one distinct repository/pull-request pair. A pull request
counts only when it is genuine product or maintenance work in a repository the
founder controls, Proofline ran in `report-only`, and a human reviewer completed
the protocol below. Empty or synthetic PRs created to reach 20 never count.
Synthetic conformance jobs may support a genuine PR observation, but workflow
success alone is insufficient.

Use Playwright `1.62.x` and a full 40-character reviewed Proofline commit. The
closed `proofline_status` values are `complete`, `evidence_gaps`, and
`tool_error`. The closed `cross_check_result` values are `matched` and
`mismatch`. A `tool_error` row remains visible as an observation but does not
count toward the 20 qualifying pull requests needed for readiness.

For a `matched` row, `false_classification_count` is zero and both resolution
fields are blank. For a `mismatch` row, the count is positive. It remains a
release blocker until both `resolved_at` and `resolution_evidence_ref` identify
a verified fix. Every primary and resolution evidence reference is unique; a
shared underlying fix receives a separate evidence record for each affected
observation. Resolving a mismatch does not erase the original observation.

### Non-counting baseline

PR #2 and its successful self-test run `34040683344` do not count toward the
20-PR threshold. The retained producer artifacts omit the final reconciliation
JSON, and the happy-path reconciliation used `enforce-evidence` rather than the
required `report-only` mode. This evidence proves conformance but cannot satisfy
the Phase C observation contract, so PR #2 contributes no public observation.

## Per-PR cross-check protocol

1. Confirm the workflow belongs to the recorded repository/PR and the action
   ran the recorded Proofline commit in `report-only` mode.
2. Confirm repository, revision, head revision, run ID, attempt, producer IDs,
   shard totals, selection descriptor, and plan digest against workflow state.
3. For every topology entry, compare artifact presence, envelope validity,
   revision, selection, and reason codes with the downloaded files and job
   state.
4. For every planned test, compare its identity, expected status, attempts,
   terminal Playwright outcome, Proofline classification, and reason codes with
   the raw JSON report. Check every unexpected identity too.
5. Recalculate summary counts and exit decision from the reviewed records. Set
   `proofline_records` to the total topology, planned-test, and unexpected-test
   records reviewed; set `raw_records_checked` to the number actually checked.
   They must be equal.
6. Record exact digests and review notes in protected evidence, then append the
   public alias-only row. Corrections append a new evidence record; they do not
   silently rewrite retained evidence.

## Separate consumer verification

`phase-c-consumer.json` remains `draft` until the owner explicitly authorizes a
separate repository. A verified record requires a fresh clone, Playwright
`1.62.x`, no `@proofline/*` dependency, a commit-pinned bundled action, a
successful workflow, raw and reconciliation SHA-256 digests, an opaque reviewer
alias, and protected evidence. The consumer check proves installability only;
it does not count as one of the 20 genuine PR observations unless it separately
meets the observation protocol.

For a single raw report, `rawReportSha256` is that file's digest. For multiple
reports, it is the SHA-256 of a UTF-8 manifest without a byte-order mark. The
manifest contains exactly one LF-terminated line for each reconciliation
topology entry, including missing entries. Each line has
`<producer> <current>/<total> <raw-report-sha256-or-missing>`. Sort lines by
producer ID in ASCII byte order, then by numeric shard `current`, then by
numeric shard `total`. This definition makes the public aggregate reproducible
while the protected evidence retains every individual file digest.

## Evaluate readiness

```sh
pnpm --filter @proofline/test-fixtures validate:phase-c
```

`PHASE_C_OBSERVING` is expected until at least 20 distinct PR observations are
valid and do not have `tool_error` status, every classification has been
cross-checked, no mismatch is unresolved, and the separate consumer record is
verified. The validator accepts at most 1,000 observation rows, 1 MiB of CSV,
64 KiB of consumer JSON, and 1,000,000 reviewed records per observation.
`PHASE_C_READY` permits a release review; it does not create or authorize a tag
by itself. Every local evaluator result is explicitly `non_authoritative`
because the alias-only inputs and evidence references are operator supplied. An
independent reviewer must inspect the protected artifacts and confirm their
digests before accepting readiness.
