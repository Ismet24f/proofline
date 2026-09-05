# Validation Decision Gate

This document is the authoritative Phase 0 decision rule. It supersedes every
earlier interview-count, alpha-commitment, recommendation-benchmark, header,
rate, or narrative rule. `docs/validation/field-dictionary.md` is normative for
field types, aliases, uniqueness, deterministic de-duplication, and row
countability. Only completed, attributable, countable records may affect the
gate; interest and incomplete or inferred evidence do not count.

## Window, qualification, and frozen samples

```text
window_start = completed_at of the first qualified interview accepted into the gate; immutable after acceptance
window_frozen_at = timestamp when the validation owner records the source interview, window_start, and window_end
window_end = frozen window_start + 42 calendar days; immutable after window_frozen_at
qualified_interview = external=yes AND participant_role is allowed AND uses_playwright=yes AND uses_github_actions=yes AND completed_at is valid
formal_interview_cohort = first 12 qualified interviews ordered by completed_at, then interview_id
successful_external_install = first qualifying success for a distinct team_alias, completed unaided in <= 60 minutes
countable_probe_row = authorized and eligible historical merged PR assessed under the complete two-pass protocol
green_but_unverified = required CI was green AND at least one independently expected Playwright test was skipped, incomplete, retried, or absent
```

The designated validation owner accepts the first qualification-complete
interview into the gate and immediately records its `interview_id`,
`completed_at`, the derived `window_start` and `window_end`,
`window_frozen_at`, their own recorder alias, and an alias-safe freeze evidence
reference in the gate record. This freeze must be recorded before another
interview is accepted. It is an event, not a query over the current scorecard.

Normalize timestamps to UTC for comparison. `window_end` is the same UTC clock
time 42 calendar dates after the frozen `window_start`. Neither boundary is
ever recomputed from later records. An interview added after
`window_frozen_at` with `completed_at < window_start` is retained as an
excluded `late_backdated_before_window` record; it cannot enter
`qualified_interview_count`, the formal cohort, or any verdict calculation. A
later accepted interview whose `completed_at` is inside the frozen window may
count normally until the formal cohort freezes. After that cohort or a verdict
is frozen, later records cannot replace its members or change the verdict. If
the source interview is later found invalid, record the error and explicitly
restart/version the gate; never silently move either boundary.

`qualified_interview_count >= 12` is the interview sample-completeness rule.
When the twelfth qualified interview exists, freeze the ordered first 12 by
`completed_at` ascending and `interview_id` ascending. Record those IDs and the
freeze timestamp. Every interview-derived measure uses only this formal cohort:
the narrow top-three count, median manual hours, early interview STOP,
all-follow-ups-complete, and every narrow-job count. Interview 13 and later,
late inserts, and hindsight replacements cannot change the formal metrics.

The probe also has a frozen formal sample: two explicitly authorized repository
aliases and the first 10 countable two-pass rows completed for each. Record the
20 probe IDs and the sample freeze timestamp. Extra, unauthorized, ineligible,
hindsight-selected, or protocol-invalid rows cannot replace a formal row or
affect `probe_hit_count`.

## Measures

```text
qualified_interview_count = count(qualified interviews accepted inside the frozen window, excluding late_backdated_before_window records)
narrow_top_three(interview) = affected_test_selection_rank in 1..3 OR green_but_unverified_rank in 1..3
narrow_top_three_count = count(formal cohort where narrow_top_three(interview) is true)
median_manual_hours = median(hours_planning + hours_reporting for the formal cohort)
all_formal_follow_ups_complete = every formal-cohort interview has linked follow_up_completed_at and follow_up_evidence_reference
complete_diary_team_count = count(distinct team_alias values represented by their earliest complete workflow diary)
successful_install_count = count(distinct team_alias values represented by their earliest successful external install)
probe_hit_count = count(green_but_unverified=yes in the frozen 20-row formal probe sample)
written_design_partner_count = count(distinct team_alias values whose deterministically selected active commitment is written_design_partner)
priced_commitment_count = count(distinct team_alias values whose deterministically selected active commitment is priced_commitment and has buyer authority, concrete price discussion, and next step)
cost_comparison_count = count(counted diary teams with one complete same-release cost comparison)
cost_overrun_count = count(complete cost comparisons where metadata_maintenance_hours > expected_release_effort_saved_hours)
narrow_job_count(job) = count(formal-cohort interviews with the same supported non-none narrow_job token)
```

The two narrow pains are exact: selecting tests affected by a change and green
required CI that did not actually verify all expected tests. A generic release
pain rank or manually entered top-three flag is not a substitute. A formal
interview contributes at most one to `narrow_top_three_count`, even if both
exact ranks are 1–3.

For every measure retain the numerator, denominator, included primary IDs, and
exclusions with reasons. Apply all uniqueness, evidence, status, alias,
de-duplication, tie-break, linkage, and type rules in the field dictionary.
Specifically:

- count at most one complete workflow diary, one successful install, and one
  active commitment per distinct `team_alias`, using the dictionary's earliest
  deterministic choice;
- withdrawn or expired commitments never count, and one team can contribute to
  only one commitment measure;
- a priced commitment requires recorded buyer/commercial authority;
- all-formal-follow-ups-complete means all 12 frozen interviews, not a growing
  day-42 set, have valid linked completion timestamps and evidence references;
- the formal diary sample is the first three distinct-team counted diaries by
  release date, then diary ID; three complete cost comparisons means one for
  each frozen formal-diary team, with both values observed for that release; and
- a probe row counts only when explicit repository authorization is evidenced,
  the selector froze an independently sourced expected-test set before CI
  execution evidence was revealed, a distinct verifier checked the result, and
  every required timestamp and evidence reference is valid.

## Authoritative outcomes

### PROCEED

PROCEED only when all are true by day 42:

- `qualified_interview_count >= 12` and the formal first-12 cohort is frozen;
- `narrow_top_three_count >= 6` out of the frozen 12;
- `median_manual_hours >= 2` for the frozen 12;
- `complete_diary_team_count >= 3` from three distinct teams;
- `successful_install_count >= 3` from three distinct external teams;
- the frozen probe sample contains exactly 10 countable rows for each of two
  explicitly authorized repository aliases;
- `probe_hit_count >= 3` out of the frozen 20;
- `written_design_partner_count >= 2 OR priced_commitment_count >= 1`;
- `cost_comparison_count = 3`, one for each counted diary team; and
- `cost_overrun_count = 0` out of those three complete comparisons.

### STOP

At day 42, STOP when any is true:

- `successful_install_count < 2 AND written_design_partner_count = 0`;
- `probe_hit_count <= 1` after the frozen 20-row probe sample is complete;
- the formal interview cohort is complete and (`narrow_top_three_count < 4 OR
median_manual_hours < 1`);
- `written_design_partner_count = 0 AND priced_commitment_count = 0` after
  `all_formal_follow_ups_complete = true`;
- `cost_comparison_count = 3 AND cost_overrun_count >= 1`.

Before day 42, STOP only when one of these terminal conditions is conclusively
known from its complete frozen sample:

- the frozen 20-row probe sample is complete and `probe_hit_count <= 1`; or
- the formal first-12 interview cohort is frozen and
  (`narrow_top_three_count < 4 OR median_manual_hours < 1`).

All other STOP rules are evaluated only at day 42.

### NARROW

NARROW at day 42 only when its complete core sample exists, PROCEED and STOP
are both false, and at least one signal below is true.

The complete NARROW core sample requires:

- `qualified_interview_count >= 12` and the frozen formal cohort;
- `complete_diary_team_count >= 3` from three distinct teams;
- `all_formal_follow_ups_complete = true`;
- the complete frozen two-repository/20-row probe sample;
- `cost_comparison_count = 3` with `cost_overrun_count = 0`; and
- `successful_install_count = 2` from two distinct external teams.

The objective NARROW signals are:

- `narrow_top_three_count` is 4 or 5 out of the frozen 12;
- `median_manual_hours >= 1 AND median_manual_hours < 2` for the frozen 12;
- `successful_install_count = 2`;
- `probe_hit_count = 2` out of the frozen 20;
- `narrow_job_count(reporting) >= 4` out of the frozen 12;
- `narrow_job_count(skip_flake_visibility) >= 4` out of the frozen 12; or
- `narrow_job_count(audit_packets) >= 4` out of the frozen 12.

Each counted narrow-job row requires its exact token, a non-empty alias-safe
quoted problem, and a linked alias-safe evidence reference as defined in the
field dictionary. The NARROW rationale identifies the supported token,
interview IDs, quotes, evidence references, and capabilities to remove/defer.

## Evaluation order and completeness

Before day 42, evaluate only the two terminal STOP conditions after their
complete frozen samples exist. Otherwise continue collecting evidence; no
PROCEED or NARROW result is available early.

At day 42, evaluate in this exact order:

1. `PROCEED` if every PROCEED condition is true.
2. Otherwise `STOP` if any explicit STOP rule is true.
3. Otherwise `NARROW` if the complete NARROW core sample exists and a NARROW
   signal is true.
4. Otherwise `STOP` for insufficient evidence.

Incomplete, duplicate, unauthorized, unlinked, hindsight-selected, or
otherwise non-countable records can never produce PROCEED or fill a NARROW
core sample. This precedence is total: every day-42 evaluation ends in exactly
one result.

## Auditable gate record

Complete every field at decision time. Keep the public templates blank and use
aliases only; raw evidence stays private.

### Timing, authority, and outcome

| Field                                                                 | Value |
| --------------------------------------------------------------------- | ----- |
| Window source interview ID and `completed_at`                         |       |
| Frozen window start (`window_start`)                                  |       |
| Immutable day-42 deadline (`window_end`)                              |       |
| Window freeze timestamp (`window_frozen_at`)                          |       |
| Window freeze recorder alias                                          |       |
| Window freeze evidence reference                                      |       |
| Formal interview cohort freeze timestamp                              |       |
| Frozen ordered interview IDs (`completed_at`, then `interview_id`)    |       |
| Authorized repository cohort freeze timestamp and two aliases         |       |
| Formal probe sample freeze timestamp                                  |       |
| Frozen probe IDs by repository alias                                  |       |
| Formal diary sample freeze timestamp and three ordered diary/team IDs |       |
| Decision owner alias                                                  |       |
| Decision timestamp                                                    |       |
| Decision (`PROCEED`, `NARROW`, or `STOP`)                             |       |
| Evaluation timing (`immediate terminal` or `day 42`)                  |       |
| Decision rationale and applicable rule(s)                             |       |

### Interview and diary evidence

| Field                            | Numerator / denominator or calculation                                       | Included record IDs                                              | Exclusions and reasons                    |
| -------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `qualified_interview_count`      | / all interview rows in window; must be >= 12                                |                                                                  |                                           |
| Formal interview cohort          | 12 / 12                                                                      | Ordered frozen IDs and completion timestamps                     |                                           |
| `narrow_top_three_count`         | / 12                                                                         | Per-ID two exact ranks and derived result                        | Invalid/missing rank reasons              |
| `median_manual_hours`            | ordered per-interview `(hours_planning + hours_reporting)` values and median | Frozen 12 IDs                                                    |                                           |
| `narrow_job_count` by value      | `reporting`: / 12; `skip_flake_visibility`: / 12; `audit_packets`: / 12      | IDs, quotes, evidence references                                 | Missing/invalid/unsupported token reasons |
| `all_formal_follow_ups_complete` | / 12                                                                         | Linked interview IDs, completion timestamps, evidence references | Missing/invalid linkage reasons           |
| Complete workflow diaries        | / 3 distinct teams                                                           | Counted diary IDs and team aliases                               | Duplicate/incomplete diary reasons        |

For the median, record each ordered value as
`interview_id: hours_planning + hours_reporting = value`, then the independent
median calculation. Do not substitute a total or average.

### Installation evidence

| Field                               | Numerator / denominator             | Included install IDs and distinct team aliases | Durations / exclusions and reasons |
| ----------------------------------- | ----------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `successful_install_count`          | / distinct external teams attempted | Earliest successful ID per team                | Duplicate/later/invalid rows       |
| Unaided inventory within 60 minutes | / attempted external install rows   |                                                |                                    |

### Two-pass probe evidence

| Field                                         | Numerator / denominator | Included aliases and IDs                         | Exclusions and reasons            |
| --------------------------------------------- | ----------------------- | ------------------------------------------------ | --------------------------------- |
| Explicitly authorized repository aliases      | 2 / 2                   | Authorization timestamps and evidence references | Unauthorized/out-of-scope reasons |
| Countable rows — repository alias 1           | 10 / 10                 | Ordered probe IDs                                | Eligibility/protocol reasons      |
| Countable rows — repository alias 2           | 10 / 10                 | Ordered probe IDs                                | Eligibility/protocol reasons      |
| Expected-set freeze before CI evidence reveal | 20 / 20                 | Per-ID source and timestamps                     | Hindsight/unfrozen reasons        |
| Distinct selector/verifier roles              | 20 / 20                 | Per-ID selector and verifier aliases             | Same/missing alias reasons        |
| Result verification complete                  | 20 / 20                 | Per-ID result timestamp and evidence reference   | Missing/invalid result reasons    |
| `probe_hit_count`                             | / 20                    | Hit probe IDs                                    |                                   |

### Commitment and cost evidence

| Field                          | Numerator / denominator                            | Included IDs / team aliases / references             | Exclusions and reasons                                  |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `written_design_partner_count` | / distinct teams with a selected active commitment | Earliest selected active row per team                | Duplicate, withdrawn, expired, missing-evidence reasons |
| `priced_commitment_count`      | / distinct teams with a selected active commitment | Buyer authority, concrete price, next step, evidence | Invalid authority/type/status reasons                   |
| `cost_comparison_count`        | / 3 counted diary teams                            | Diary IDs and same-release references                | Missing/mismatched comparison reasons                   |
| `cost_overrun_count`           | / 3 complete comparisons                           | Three exact value pairs and derived results          |                                                         |

### Evidence observations

| Observation | Alias-based evidence reference | Implication |
| ----------- | ------------------------------ | ----------- |
|             |                                |             |
|             |                                |             |
|             |                                |             |
