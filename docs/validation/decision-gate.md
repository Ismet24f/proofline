# Proofline 30-Day Pilot Decision Gate

This is the sole market-validation gate for Proofline v0.1. Technical
correctness is necessary, but self-tests, repository inspection, founder-run
repositories, and AI review are not market evidence.

The public files in this directory are blank contracts. Store populated,
alias-only copies in an access-controlled private repository. Commit every
capture append-only; corrections add a new record and evidence reference rather
than rewriting history.

## Freeze the experiment before observing it

The clock starts only after all preflight conditions are represented in a
`pilot-freeze.json` whose `status` is `frozen`:

1. Exactly eight unique external participants are booked, and their immutable
   `I-...` IDs are frozen.
2. Exactly three external repositories from three distinct teams authorize a
   report-only installation.
3. Each repository has one controlled disease signal: `conditional_job`,
   `matrix_or_shards`, `runtime_skip`, or `retries`.
4. Each repository records a Playwright 1.62.x lockfile commit. A requested
   Playwright minor upgrade pauses that repository until the compatibility
   matrix passes.
5. Authorization, disease-signal, and evidence-handling `E-...` references are
   present for every repository. Production secrets and customer payloads are
   excluded.
6. `windowEnd` is exactly 30 days after `windowStart`, both in UTC, and the
   thresholds equal the published contract.

After finalizing the freeze file, calculate its digest with
`shasum -a 256 pilot-freeze.json` and retain that digest in a separate,
timestamped evidence record. Every later evaluation requires that external
digest. Changing the cohort, window, repository preconditions, or thresholds
then fails validation rather than silently moving the goalposts.

If preflight is incomplete, keep `status: draft`. The evaluator returns
`NOT_STARTED`; this is not negative market evidence.

## Normalized evidence ledgers

Use opaque `I-`, `P-`, `T-`, `R-`, `PR-`, `RUN-`, `F-`, `EV-`, and `W-`
aliases. Evidence references use `E-`. Never store names, repository paths,
pull-request numbers, customer payloads, or raw URLs in these ledgers.

- `interviews.csv` contains one row per unique participant. A completed
  qualified interview must use an allowed role, Playwright plus GitHub Actions,
  a frozen interview ID, a booking at or before the freeze, a conducted time
  inside the window, and unique evidence. A completed budget-authority probe
  must record `accept`, `consider`, `reject`, or `declined`; an empty response
  does not count. `alternative_wedge_alias` records a repeated materially
  different wedge without exposing its text publicly.
- `pilot-runs.csv` contains one row per distinct repository/pull-request pair.
  A run counts only for the frozen repository-team mapping, inside the window,
  while disease-qualified, with a non-`tool_error` reconciliation and unique
  evidence. Duplicate PR aliases within a repository are rejected.
- `pilot-findings.csv` contains one row per finding linked to a valid run.
  `test_identity_hash` is the SHA-256 of the stable Proofline identity and is
  unique within the run, preventing the same catch from being counted twice.
  Only `incomplete`, `absent`, and `no_evidence` can be confirmed
  not-executed catches. `runtime_skipped` and `retry_masked` stay visible but do
  not count toward that measure.
- `team-events.csv` records `retention_day_30`, `noise_rating`, and
  `removal_reason` events. Retention counts only at or after `windowEnd`, with
  value `enabled`. Noise uses `ignored`, `not_annoying`, `annoying`, or
  `unusable`. Low-value removal uses `removal_reason,low_value`.

All IDs, participant aliases, repository/PR pairs, finding identities, and
per-ledger evidence references are unique. Timestamps are absolute UTC values.
All enums and booleans are closed sets enforced by the evaluator.

## Frozen measures

|   # | Measure                                                   |              Threshold |
| --: | --------------------------------------------------------- | ---------------------: |
|   1 | Completed qualified interviews                            |                 `>= 8` |
|   2 | Qualified interviewees independently ranking it top-three |                 `>= 4` |
|   3 | Authorized pilot repositories with valid run evidence     |                  `= 3` |
|   4 | Distinct countable pull requests                          |                `>= 60` |
|   5 | Confirmed, previously unknown not-executed catches        | `>= 3` in `>= 2` teams |
|   6 | Confirmed false positives unresolved at day 30            |                  `= 0` |
|   7 | Teams voluntarily retaining the enabled action at day 30  |                 `>= 1` |
|   8 | Completed `$99/repo/month` probes with budget authority   |                 `>= 1` |
|   9 | Per-team clean-summary noise                              |             diagnostic |

The evaluator emits each numerator, threshold, result, included IDs, excluded
IDs with reasons, noise records, frozen cohort, and SHA-256 digest of every
input file. The generated decision record therefore pins the exact data used;
the private repository history and external freeze digest provide the audit
trail. This is tamper-evident process evidence, not a claim that a local CSV can
be made cryptographically immutable by itself.

## Execute the decision

Use an explicit decision time so reruns are deterministic:

```sh
node packages/test-fixtures/scripts/validate-pilot-data.mjs \
  path/to/pilot-freeze.json \
  path/to/interviews.csv \
  path/to/pilot-runs.csv \
  path/to/pilot-findings.csv \
  path/to/team-events.csv \
  --as-of=2026-10-01T00:00:00Z \
  --expected-freeze-sha256=<externally-retained-digest> \
  --out=path/to/decision-record.json
```

Before `windowEnd`, the result is `OBSERVING`. The only early `STOP` is all
three frozen teams explicitly removing Proofline for low value.

At or after `windowEnd`, rules execute once in this order:

1. `INCONCLUSIVE` if measure 1, 3, or 4 is unmet. Recruit a new versioned
   cohort/window and claim nothing.
2. `PROCEED` if measures 1-8 all pass. This authorizes design of hosted history,
   not implementation, revenue claims, or an OpenAI partnership.
3. `STOP` if fewer than two participants rank the problem top-three, there are
   zero confirmed catches, an unresolved false positive exists, or every pilot
   team removed Proofline for low value.
4. `NARROW` if the top-three and catch thresholds pass, `PROCEED` is false, no
   stop condition applies, and at least four qualified interviews independently
   point to the same `W-...` alternative wedge.
5. `STOP` otherwise because the complete sample did not establish enough
   retained or commercial value.

Noise is reported but cannot override these rules. Publish only aggregate,
non-identifying results and only with explicit permission.

Market verdict until a completed gate returns `PROCEED`: **promising, not
proven**.
