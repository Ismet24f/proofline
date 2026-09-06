# Proofline 30-Day Pilot Decision Gate

This is the sole market-validation gate for Proofline v0.1. It measures whether
the local completeness check solves a frequent, trusted problem for external
Playwright teams. Technical correctness is necessary, but it is not market
evidence.

The public CSVs are blank contracts. Store completed alias-only records in an
approved private location and validate them with:

```sh
node packages/test-fixtures/scripts/validate-pilot-data.mjs \
  path/to/interviews.csv \
  path/to/pilot-observations.csv
```

Rows are append-only. Never change an ID or timestamp after capture, delete an
unfavorable row, or overwrite a correction. Retain the original and append a
new unique record whose private evidence reference documents the correction.
Use `I-...`, `O-...`, `T-...`, `R-...`, and `PR-...` opaque aliases plus
`E-...` evidence references; never record people,
companies, repository names, paths, pull-request numbers, customer payloads,
or raw URLs in the CSVs.

## Preflight and frozen window

The 30-day clock starts only when all of these conditions are evidenced at the
same freeze event:

1. Eight external interviews are booked with qualified QA, release, or
   engineering-management participants whose teams use Playwright and GitHub
   Actions.
2. Three external repository owners authorize report-only installation and
   identify the workflows to observe.
3. Every pilot repository has at least one disease signal: conditional test
   jobs, a matrix or shards, a skip that can occur during execution, or
   `retries >= 1`. Workflow-level path filtering alone does not qualify.
4. Every pilot repository freezes Playwright to a tested 1.62.x lockfile for
   the observation window. A requested minor upgrade pauses that repository's
   observations until the compatibility matrix passes as a same-day task.
5. The evidence-handling plan excludes production secrets and customer
   payloads.

At preflight, record the UTC `window_start`, derived `window_end` exactly 30
calendar days later, three repository aliases, eight interview IDs, lockfile
commit SHAs, disease-signal evidence references, authorization evidence
references, and the validation-owner alias in the private freeze record. Freeze
the thresholds in this document at the same time. Later records cannot move the
window, replace the frozen cohorts, or change a threshold.

If preflight is incomplete, keep recruiting. That is not negative evidence
about the problem and the clock has not started.

## CSV contracts and countability

`interviews.csv` has one row per booked conversation. An interview counts as
qualified only when `qualified=yes`, `playwright_github_actions=yes`, its role
is allowed by the validator, and qualification evidence is linked. It counts
as completed only when `conducted_at` is present. `top_three_problem=yes`
means the participant independently ranked missing or misleading test-execution
evidence among their top three release problems. A budget conversation counts
only when `budget_authority=yes`, `price_probe_response` records the response
to `$99/repo/month` for retained history plus audit export, and evidence is
linked.

`pilot-observations.csv` has one immutable row per observed pull request. A PR
counts only when its aliased repository belongs to the frozen three-repository
cohort, `observed_at` is inside the frozen window, the repository remained
disease-qualified, and evidence is linked. The `proofline_status` and
`classification` fields preserve Proofline's raw result. A confirmed catch
requires a `not_executed` classification (`no_evidence`, `absent`, or
`incomplete`), `previously_unknown=yes`, `customer_confirmed=yes`, and linked
confirmation evidence. `runtime_skipped` and `retry_masked` are visible but do
not count as `not_executed` catches.

For day-30 retention, append one alias-only observation per pilot team with
`classification=retained_day_30` and `proofline_status=enabled` only after the
owner voluntarily keeps the action enabled without prompting. For clean-summary
noise, use `classification=clean_summary_noise` and record the owner's exact
alias-safe response in `proofline_status`; these special measurement rows do
not count as observed PRs. A false positive is unresolved at day 30 when
`false_positive=yes` and `resolved_at` is blank or later than `window_end`.

## Frozen measures

At the decision, calculate each measure from the frozen cohorts and retain the
included record IDs, exclusions, numerator, denominator, and evidence
references:

|   # | Measure                                                                       |                  Frozen threshold |
| --: | ----------------------------------------------------------------------------- | --------------------------------: |
|   1 | Completed qualified interviews                                                |                            `>= 8` |
|   2 | Completed qualified interviewees with `top_three_problem=yes`                 |                            `>= 4` |
|   3 | Distinct authorized pilot repositories with valid reconciliation evidence     |                             `= 3` |
|   4 | Countable pull requests observed across the three repositories                |                           `>= 60` |
|   5 | Customer-confirmed, previously unknown `not_executed` catches                 |        `>= 3` across `>= 2` teams |
|   6 | Confirmed false positives unresolved at day 30                                |                             `= 0` |
|   7 | Teams voluntarily retaining the enabled action at day 30                      |                            `>= 1` |
|   8 | Completed `$99/repo/month` probes with budget authority and verbatim evidence |                            `>= 1` |
|   9 | User-reported clean-summary noise                                             | `ignored, not annoying` or better |

Internal CI, Proofline's public repository, self-tests, founder-controlled
repositories, repository inspection, AI review, and unconfirmed detections do
not contribute to any market threshold.

## Mutually exclusive outcome

Before `window_end`, no positive verdict is available. An early `STOP` is
allowed only if all three repositories are installed and the owner of every
one removes Proofline explicitly for low value; otherwise continue observing.

At or after `window_end`, evaluate exactly once in this order:

1. **INCONCLUSIVE** when row 1, 3, or 4 is unmet. Change the recruiting channel
   or extend with a newly versioned window. Claim nothing.
2. **PROCEED** when rows 1–8 are all met, classifications are trusted after raw
   evidence review, and retention was voluntary. This authorizes hosted-history
   design only—not implementation, revenue claims, or an OpenAI partnership.
3. **STOP** when row 2 is below 2, row 5 is zero despite three
   disease-qualified repositories, any confirmed false positive remains
   unresolved, or teams removed the action for low value.
4. **NARROW** when rows 2 and 5 meet their thresholds, `PROCEED` is false, no
   `STOP` rule applies, and linked interview evidence consistently identifies a
   materially different user, workflow, or buyer. Rewrite the product thesis
   before building more.
5. **STOP** otherwise, because the complete sample did not establish enough
   retained or commercial value for this wedge.

Row 9 is a UX diagnostic, not permission to override this order. Record it and
fix pilot-blocking summary noise, but never reinterpret rows 1–8 after seeing
the result.

## Decision record

The private decision record must contain the frozen window and cohort, every
measure above, included/excluded IDs with reasons, the exact rule that fired,
the decision timestamp, and the decision-owner alias. Publish only aggregate,
non-identifying results with explicit permission.

Market verdict before a completed gate: **promising, not proven**.
