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
6. `windowEnd` is exactly 30 days after `windowStart`, both in canonical UTC.
   `evaluationAt` is frozen between `windowEnd` and 24 hours afterward as the
   only final-decision cutoff, and the thresholds equal the published contract.

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
  does not count. Every row uses the closed role set (including opaque `other`),
  and every price response is either blank or one of those four values. A price
  response is forbidden until a budget-authority interview is conducted.
  `alternative_wedge_alias` records a repeated materially
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
- `team-events.csv` records one terminal value per team for each of
  `retention_day_30`, `noise_rating`, and
  `removal_reason` events. Retention counts only at or after `windowEnd`, with
  value `enabled`. Noise uses `ignored`, `not_annoying`, `annoying`, or
  `unusable`. Low-value removal uses `removal_reason,low_value`. A team cannot
  be both retained as `enabled` and removed for low value; contradictory state
  fails validation rather than being resolved in favor of a commercial result.

All IDs, participant aliases, repository/PR pairs, finding identities, and
per-ledger evidence references are unique. Timestamps are canonical UTC values;
impossible calendar dates are rejected. All enums and booleans are closed sets.
The freeze and each repository entry also reject unknown keys so private names,
URLs, or ad hoc outcome fields cannot hide in the decision contract.

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

The evaluator reads every input exactly once and derives parsing, validation,
measures, and SHA-256 from those same immutable bytes. It emits each numerator,
threshold, result, included IDs, excluded IDs with reasons, noise records,
frozen cohort, and digest of every input file. The generated decision record
therefore pins the exact data used. Its output always labels itself
`non_authoritative` because `--as-of` and the local clock are operator supplied.
The evaluator proves byte consistency and deterministic rules; it does not
prove when those bytes existed.

An outcome becomes authoritative only after an independent reviewer verifies
that protected private-repository history contains all five exact input digests
no later than `evaluationAt`, and an external timestamped record binds that
commit, the decision digest, and the freeze digest. Record that verification
outside these public alias-only files. Without it, even a computed `PROCEED` is
only a candidate result and cannot authorize Stage 3.

## Execute the decision

Use the manifest's exact frozen `evaluationAt` as the candidate final decision
time. An earlier `--as-of` is a non-final progress view; a later value is
rejected. The evaluator does not treat the caller-supplied time as trusted:

```sh
node packages/test-fixtures/scripts/validate-pilot-data.mjs \
  path/to/pilot-freeze.json \
  path/to/interviews.csv \
  path/to/pilot-runs.csv \
  path/to/pilot-findings.csv \
  path/to/team-events.csv \
  --as-of=<exact-pilot-freeze.evaluationAt> \
  --expected-freeze-sha256=<externally-retained-digest> \
  --out=path/to/decision-record.json
```

Before `evaluationAt`, the result is `OBSERVING`. The only early `STOP` is all
three frozen teams explicitly removing Proofline for low value. Events after
the explicit progress time are excluded, and events after `evaluationAt` can
never enter this frozen decision.

At `evaluationAt`, rules execute once in this order:

1. `INCONCLUSIVE` if measure 1, 3, or 4 is unmet. Recruit a new versioned
   cohort/window and claim nothing.
2. `STOP` if fewer than two participants rank the problem top-three, there are
   zero confirmed catches, an unresolved false positive exists, or every pilot
   team removed Proofline for low value. All-team low-value removal has
   precedence over every commercial measure.
3. `PROCEED` if measures 1-8 all pass. This authorizes design of hosted history,
   not implementation, revenue claims, or an OpenAI partnership.
4. `NARROW` if the top-three and catch thresholds pass, `PROCEED` is false, no
   stop condition applies, and at least four qualified interviews independently
   point to the same `W-...` alternative wedge.
5. `STOP` otherwise because the complete sample did not establish enough
   retained or commercial value.

Noise is reported but cannot override these rules. Publish only aggregate,
non-identifying results and only with explicit permission.

Market verdict until an independently chronology-verified gate returns
`PROCEED`: **promising, not proven**.
