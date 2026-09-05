# Validation Decision Gate

This document is the authoritative Phase 0 decision rule. It supersedes any
earlier interview-count, alpha-commitment, rate, or narrative rule. The gate
is based only on completed, attributable records; it does not infer traction
from interest, incomplete sampling, or opinions without an example.

## Window and qualifying predicates

The fixed evidence window begins only on the date of the first completed
qualified external interview. It does not begin on document creation, project
start, or an internal conversation.

```text
window_end = first_qualified_interview_date + 42 calendar days
qualified_interview = role is QA lead, senior QA/automation engineer, release owner, engineering manager, or Head of QA AND team uses Playwright AND team uses GitHub Actions
successful_external_install = external participant completes inventory generation without live implementation help in <= 60 minutes
green_but_unverified = merged PR had green required CI AND at least one manually expected Playwright test was absent, skipped, incomplete, or only green after retry masking
```

`first_qualified_interview_date` is the date of the first *completed,
qualified external* interview. A record is not qualified until every predicate
above is evidenced. For every counted interview, the `notes` field must
contain these exact, case-sensitive tokens in this canonical form:
`external=yes; completed=yes`.

- `external=yes` means the participant represents a team outside the Proofline
  operating team.
- `completed=yes` means the interview was conducted and the qualification plus
  problem-interview evidence was recorded.

Records lacking either exact token are excluded, even if their role and tool
answers otherwise match. Record excluded interviews and the exclusion reason;
do not backdate the window from an unqualified, incomplete, or internal
conversation.

For the qualitative NARROW signal, evaluate only the frozen first 12 qualified
interviews in chronological completion order. Each may have exactly one
case-sensitive `narrow_job` token in `notes`:
`narrow_job=reporting`, `narrow_job=skip_flake_visibility`,
`narrow_job=audit_packets`, or `narrow_job=none`. A non-`none` token counts
only when the same scorecard has a non-empty `quoted_problem` and an
alias-safe, case-sensitive `narrow_job_evidence_ref=E-<alias>` token in
`notes`. `<alias>` is a non-empty opaque identifier; it must not contain a
customer, participant, repository, PR, or workstation identifier. A missing,
duplicated, or unrecognized `narrow_job` token is not inferred and never
counts toward the NARROW signal; record it as an exclusion.

## Measures

```text
top_three_count = count(qualified interviews where top_three = yes)
median_manual_hours = median(hours_planning + hours_reporting for qualified interviews)
successful_install_count = count(successful external installs)
probe_hit_count = count(green_but_unverified = yes across 20 authorized historical PRs)
written_design_partner_count = count(written commitments with evidence reference)
priced_commitment_count = count(commitments where a buyer discussed a concrete price and next step)
cost_comparison_count = count(complete team-release cost comparisons)
cost_overrun_count = count(complete cost comparisons where metadata_maintenance_hours > expected_release_effort_saved_hours)
narrow_job_count(job) = count(frozen first 12 qualified interviews with the same non-none narrow_job token, non-empty quoted_problem, and narrow_job_evidence_ref)
```

For every measure, retain both the numerator and denominator, included record
IDs, and exclusions with reasons. A completed workflow diary is counted only
when it is from a distinct team and contains its required details, activity
log, release summary, and evidence notes. An installation counts only when
the participant is external, completed inventory generation unaided, and took
60 minutes or less. A probe denominator contains only authorized, eligible,
merged historical PRs; exactly 10 must be assessed for each of two repository
aliases before the 20-PR probe condition is complete.

A priced commitment is countable only when `participant_role` identifies the
person who discussed the price and next step as an authorized buyer or
commercial authority. A participant's prediction of what a buyer might pay,
or a price discussion without that authority, never counts.

A complete team-release cost comparison uses non-negative decimal hours for
the same team and observed release diary. `metadata_maintenance_hours` is the
participant's actual time creating or updating repository metadata for the
observed inventory/probe workflow. `expected_release_effort_saved_hours` is
that participant's recorded estimate of release effort the workflow would save
on that same release. Retain both values and their evidence references; do not
infer either value. This comparison does not require a recommendation engine.

## Authoritative outcomes

### PROCEED

PROCEED only when all are true by day 42:

- 12 qualified interviews completed;
- `top_three_count >= 6`;
- `median_manual_hours >= 2`;
- 3 complete workflow diaries from 3 teams;
- `successful_install_count >= 3`;
- 2 authorized repositories with exactly 10 eligible merged PRs assessed per repository;
- `probe_hit_count >= 3 of 20`;
- `written_design_partner_count >= 2 OR priced_commitment_count >= 1`;
- 3 complete team-release cost comparisons, one for each workflow-diary team,
  with `cost_overrun_count = 0`.

### STOP

At day 42, STOP when any is true:

- `successful_install_count < 2 AND written_design_partner_count = 0`;
- `probe_hit_count <= 1 after all 20 eligible PRs are assessed`;
- `12 interviews are complete AND (top_three_count < 4 OR median_manual_hours < 1)`;
- `written_design_partner_count = 0 AND priced_commitment_count = 0 after all qualified-interview follow-ups are complete`;
- all 3 required team-release cost comparisons are complete AND
  `cost_overrun_count >= 1`.

Before day 42, STOP only when one of these terminal conditions is conclusively
known from its complete frozen sample:

- after all 20 eligible probe PRs are assessed, `probe_hit_count <= 1`;
- after the first 12 qualified completed interviews, freeze that cohort by
  chronological completion; STOP if `top_three_count < 4 OR
  median_manual_hours < 1` for that frozen cohort.

All other STOP rules are evaluated only at day 42. The frozen 12-interview
cohort is used only for the before-day-42 terminal test; retain its ordered
interview IDs and completion dates in the gate record.

### NARROW

NARROW at day 42 only when its core sample is complete, PROCEED and STOP are
both false, and at least one signal below is true. A complete NARROW core
sample has at least 12 qualified interviews, 3 complete workflow diaries from
distinct teams, all qualified-interview follow-ups complete, exactly 20
eligible PRs assessed as 10 per authorized repository alias, 3 complete
team-release cost comparisons, and 2 successful unaided external installs. No
NARROW signal can replace a missing core sample; that case reaches the final
insufficient-evidence STOP.

- `top_three_count is 4 or 5`;
- `median_manual_hours is >= 1 and < 2`;
- `successful_install_count = 2`;
- `probe_hit_count = 2 of 20`;
- `narrow_job_count(reporting) >= 4`,
  `narrow_job_count(skip_flake_visibility) >= 4`, or
  `narrow_job_count(audit_packets) >= 4`.

The NARROW rationale must identify the supported smaller workflow, its exact
token value, the frozen interview IDs, their quoted problems, their alias-safe
evidence references, and the capabilities to remove or defer.

## Evaluation order and completeness

Before day 42, evaluate only the two terminal STOP conditions above after
their complete frozen samples exist. If neither is true, continue collecting
evidence; no other STOP, NARROW, or PROCEED outcome is available before day
42.

At day 42, evaluate in this exact order:

1. `PROCEED` if every PROCEED condition is true.
2. Otherwise `STOP` if a STOP rule is true.
3. Otherwise `NARROW` if a NARROW signal is true.
4. Otherwise `STOP` for insufficient evidence.

Incomplete sampling at day 42 can never be called `PROCEED`. This precedence
is total: every day-42 evaluation ends in exactly one of PROCEED, STOP, or
NARROW, with the final STOP covering insufficient evidence. A before-day-42
terminal STOP ends collection and records STOP immediately.

## Auditable gate record

Complete every field below at the decision. Keep public templates blank and
use team, company, repository, PR, and participant aliases only; evidence
references must not expose customer or personal data in this repository.

### Timing, authority, and outcome

| Field | Value |
| --- | --- |
| First completed qualified external interview date | |
| Day-42 deadline (`window_end`) | |
| Decision owner | |
| Decision date | |
| Decision (`PROCEED`, `NARROW`, or `STOP`) | |
| Evaluation timing (`immediate terminal` or `day 42`) | |
| Decision rationale and applicable rule(s) | |

### Interview and diary evidence

| Field | Numerator / denominator or calculation | Included record IDs | Exclusions and reasons |
| --- | --- | --- | --- |
| Qualified interviews completed | / 12 | | |
| `top_three_count` | / qualified interviews | | |
| `median_manual_hours` | ordered per-interview `(hours_planning + hours_reporting)` values and calculated median | | |
| `narrow_job_count` by non-`none` value | `reporting`: / 12; `skip_flake_visibility`: / 12; `audit_packets`: / 12 | Frozen interview IDs, quoted problems, and alias-safe evidence references | Missing, duplicate, unrecognized, `none`, or unsupported-token reasons |
| Complete workflow diaries from distinct teams | / 3 teams | | |
| Qualified-interview follow-ups complete | / qualified interviews | | |

For `median_manual_hours`, record the ordered per-interview values as
`interview_id: (hours_planning + hours_reporting) = value`, alongside the
calculated median. Do not substitute a total or a division calculation for
this ordered-value audit trail.

### Installation evidence

| Field | Numerator / denominator | Included install IDs and team aliases | Durations / exclusions and reasons |
| --- | --- | --- | --- |
| Successful external installs | / attempted external installs | | |
| Unaided inventory generation within 60 minutes | / attempted external installs | | |

### Probe evidence

| Field | Numerator / denominator | Repository aliases and included probe IDs | Exclusions and reasons |
| --- | --- | --- | --- |
| Authorized repositories assessed | / 2 | | |
| Eligible merged PRs assessed — repository alias 1 | / exactly 10 | | |
| Eligible merged PRs assessed — repository alias 2 | / exactly 10 | | |
| `probe_hit_count` (`green_but_unverified = yes`) | / 20 | | |

### Commitment and cost evidence

| Field | Numerator / denominator | Included commitment IDs / evidence references | Exclusions and reasons |
| --- | --- | --- | --- |
| Written design-partner commitments with evidence reference | / commitment records | | |
| Priced commitments with concrete price and next step | / commitment records | | |
| Observed metadata/maintenance cost | / observed teams | | |
| Participant-expected release effort saved | / observed teams | | |
| Complete team-release cost comparisons | / 3 workflow-diary teams | | |
| `cost_overrun_count` | / complete cost comparisons | | |

## Evidence observations

Use this table for the exact observations behind the decision. Do not replace
the numerator, denominator, record IDs, or exclusion fields above with a
narrative summary.

| Observation | Alias-based evidence reference | Implication |
| --- | --- | --- |
| | | |
| | | |
| | | |
