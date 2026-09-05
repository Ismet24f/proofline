# Phase 0 Validation Field Dictionary

This dictionary is part of the authoritative Phase 0 gate. The CSV files in
this directory are blank public templates; completed records and raw evidence
stay in an approved private location. Use opaque aliases only. Do not put a
person, company, repository, pull-request number, source path, test title,
ticket, workstation path, or public/private repository URL in an ID, alias,
notes field, quoted problem, or evidence reference.

## Common rules

- Primary IDs (`interview_id`, `install_id`, `probe_id`, `commitment_id`, and
  `diary_id`) are non-empty opaque strings and unique within their record set.
  They are immutable; duplicate IDs invalidate every duplicated record.
- `team_alias`, `repository_alias`, `pr_alias`, `selector_alias`,
  `verifier_alias`, participant/observer aliases, and evidence references are
  non-empty opaque aliases. They are not names or URLs.
- Boolean fields allow exactly lowercase `yes` or `no`. Blank, `unknown`,
  `true`, `false`, and inferred values are invalid unless a field rule below
  explicitly allows blank.
- Date fields use `YYYY-MM-DD`. Timestamp fields use ISO 8601 with a timezone,
  for example `2026-09-05T09:30:00+02:00`. Decimal-hour and duration fields are
  base-10 numbers greater than or equal to zero; commas are not decimal marks.
- ID-list fields use `|` between opaque IDs and the exact value `none` for an
  observed empty set. A blank list means missing evidence, not an empty set.
- Evidence references are alias-safe pointers to approved private evidence.
  They must not contain raw evidence, names, paths, or URLs.
- Rows with a missing/invalid required field are retained as exclusions with a
  reason; their values are never inferred and they never count.

## Gate window freeze

The validation owner is the alias-designated person responsible for accepting
records into the gate. When the first qualification-complete interview is
accepted, that owner immediately writes an append-only gate record containing:

- the source `interview_id` and its `completed_at`;
- `window_start`, copied from that accepted interview's `completed_at`;
- `window_end`, calculated once as 42 calendar days after `window_start`;
- `window_frozen_at`, an ISO 8601 timestamp for the recording event;
- the validation-owner recorder alias; and
- an alias-safe window-freeze evidence reference.

The owner records the freeze before accepting another interview. After
`window_frozen_at`, `window_start` and `window_end` are immutable and must not
be recalculated with `min(completed_at)` or any other query over later rows.

A subsequently recorded interview whose `completed_at < window_start` has the
exact exclusion reason `late_backdated_before_window`. Retain it for audit, but
exclude it from `qualified_interview_count`, formal-cohort selection, and every
verdict measure. A later record completed inside the frozen boundaries may be
accepted normally until the formal interview cohort freezes. Once the cohort
or verdict freezes, no later record may replace a member or change the verdict.
If the source interview is invalidated, create a dated, versioned gate restart;
do not mutate the existing window.

## Interview scorecard

`interview-scorecard.csv` uses `interview_id` as its primary ID.

| Fields                                                                                                                                                                      | Exact type / allowed value                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `completed_at`                                                                                                                                                              | required timestamp                                                        |
| `team_alias`                                                                                                                                                                | required alias                                                            |
| `company_size`, `qa_size`                                                                                                                                                   | non-negative integer                                                      |
| `external`, `uses_playwright`, `uses_github_actions`, `repository_access_interest`, `install_interest`, `design_partner_interest`, `price_discussed`, `artifact_permission` | boolean                                                                   |
| `participant_role`                                                                                                                                                          | role enum below                                                           |
| `release_frequency`, `current_tools`                                                                                                                                        | non-empty alias-safe text                                                 |
| `hours_planning`, `hours_reporting`                                                                                                                                         | non-negative decimal hours                                                |
| `affected_test_selection_rank`, `green_but_unverified_rank`                                                                                                                 | integer 1–5 or blank                                                      |
| `quoted_problem`, `notes`                                                                                                                                                   | optional alias-safe text, except where a narrow-job rule requires content |
| `follow_up_completed_at`                                                                                                                                                    | timestamp or blank                                                        |
| `follow_up_evidence_reference`                                                                                                                                              | evidence reference or blank, linked as defined below                      |

- Required qualification fields are `completed_at`, `team_alias`, `external`,
  `participant_role`, `uses_playwright`, and `uses_github_actions`.
  `participant_role` allows exactly `qa_lead`, `senior_qa_engineer`,
  `automation_engineer`, `release_owner`, `engineering_manager`, or
  `head_of_qa`. A qualified interview has `external=yes`, both tool fields set
  to `yes`, an allowed role, and a valid completion timestamp.
- `hours_planning` and `hours_reporting` are required non-negative decimal
  hours for a formal-cohort record.
- `affected_test_selection_rank` and `green_but_unverified_rank` each allow an
  integer from `1` through `5`, or blank when the participant did not rank that
  exact problem in the top five. Rank `1` is highest. The derived narrow
  top-three result is `yes` only when at least one of these two fields is `1`,
  `2`, or `3`; it is `no` otherwise. No generic pain rank or manually entered
  top-three value is allowed.
- Interest and permission fields (`repository_access_interest`,
  `install_interest`, `design_partner_interest`, `price_discussed`, and
  `artifact_permission`) are booleans. They do not themselves count as
  behavior or a commitment.
- `follow_up_completed_at` is blank until the follow-up for that same
  `interview_id` is complete. Once complete it must be a valid timestamp at or
  after `completed_at`, and `follow_up_evidence_reference` must be non-empty.
  A timestamp without its linked evidence reference, or a reference without a
  timestamp, is incomplete.
- Each formal-cohort row records exactly one `narrow_job` token in `notes`:
  `narrow_job=reporting`, `narrow_job=skip_flake_visibility`,
  `narrow_job=audit_packets`, or `narrow_job=none`. A non-`none` token counts
  only with a non-empty `quoted_problem` and exactly one alias-safe
  `narrow_job_evidence_ref=E-<alias>` token.

The formal interview cohort is the first 12 accepted, in-window qualified
interviews ordered by `completed_at` ascending and then `interview_id`
ascending. It freezes when the twelfth record exists. After that freeze, later
records, backdated inserts, corrections that would change membership, and
interview 13 onward are excluded from every formal interview-derived measure.
The gate-window rule above separately excludes every
`late_backdated_before_window` row even before cohort freeze. Correct a frozen
record by an auditable amendment; do not replace the cohort.
`qualified_interview_count >= 12` is the sample-completeness predicate. Narrow
top-three count, median manual hours, early STOP, all-follow-ups-complete, and
every `narrow_job_count` use only the same frozen 12.

## Installation scorecard

`installation-scorecard.csv` uses `install_id` as its primary ID. `external`,
`unaided`, and `completed` are booleans. `started_at` and
`inventory_created_at` are timestamps; the latter must not precede the former.
`duration_minutes` must equal the elapsed duration supported by those
timestamps, subject only to documented whole-minute rounding.

| Fields                               | Exact type / allowed value                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `date`                               | required date matching the local date of `started_at`                                                                |
| `team_alias`                         | required alias                                                                                                       |
| `participant_role`                   | non-empty alias-safe role token                                                                                      |
| `external`, `unaided`, `completed`   | boolean                                                                                                              |
| `started_at`, `inventory_created_at` | required timestamp for a completed row                                                                               |
| `duration_minutes`                   | non-negative decimal minutes                                                                                         |
| `playwright_version`, `node_version` | non-empty version string                                                                                             |
| `blocker_category`                   | `none`, `environment`, `dependencies`, `configuration`, `permissions`, `product_defect`, `documentation`, or `other` |
| `evidence_reference`                 | evidence reference; required for a successful row                                                                    |
| `notes`                              | optional alias-safe text                                                                                             |

A successful install has `external=yes`, `unaided=yes`, `completed=yes`, a
duration from 0 through 60 minutes, and a non-empty evidence reference. Count
at most one success per distinct `team_alias`: choose the earliest successful
row by `inventory_created_at`, then `install_id` as the tie-breaker. Later or
duplicate successes remain visible but are excluded from
`successful_install_count`.

## Commitment register

`commitment-register.csv` uses `commitment_id` as its primary ID.
`buyer_authority` and `concrete_price_discussed` are booleans.
`commitment_type` allows exactly `written_design_partner` or
`priced_commitment`; `status` allows exactly `active`, `withdrawn`, or
`expired`.

| Fields                                        | Exact type / allowed value                        |
| --------------------------------------------- | ------------------------------------------------- |
| `date`                                        | required date                                     |
| `due_date`                                    | date, or blank only when no date was agreed       |
| `team_alias`                                  | required alias                                    |
| `participant_role`                            | non-empty alias-safe role token                   |
| `buyer_authority`, `concrete_price_discussed` | boolean                                           |
| `commitment_type`                             | `written_design_partner` or `priced_commitment`   |
| `next_step`                                   | alias-safe text; required for `priced_commitment` |
| `evidence_reference`                          | evidence reference; required to count             |
| `status`                                      | `active`, `withdrawn`, or `expired`               |
| `notes`                                       | optional alias-safe text                          |

Only an `active` row with a non-empty evidence reference and an allowed type
is countable. Withdrawn and expired rows never count. Count at most one active
commitment per distinct `team_alias`: among countable active rows choose the
earliest `date`, then `commitment_id` as the tie-breaker. The chosen row counts
only in its own type's measure. A `priced_commitment` additionally requires
`buyer_authority=yes`, `concrete_price_discussed=yes`, and a non-empty concrete
`next_step`; otherwise it is excluded. Interest, a predicted buyer reaction,
or a price conversation with no buyer/commercial authority never counts.

## Historical-PR selection-risk probe

`selection-risk-probe.csv` uses `probe_id` as its primary ID. `eligible`,
`required_ci_green`, and `green_but_unverified` are booleans. All timestamps
are ISO 8601 with a timezone.

| Fields                                                                                                                                         | Exact type / allowed value                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `repository_alias`, `pr_alias`, `selector_alias`, `verifier_alias`                                                                             | required alias                                         |
| `authorization_granted_at`, `merged_at`, `pr_selected_at`, `expected_set_frozen_at`, `ci_execution_evidence_revealed_at`, `result_verified_at` | required timestamp for a countable row                 |
| `authorization_evidence_reference`, `evidence_reference`                                                                                       | required evidence reference for a countable row        |
| `eligible`, `required_ci_green`, `green_but_unverified`                                                                                        | boolean                                                |
| `eligibility_basis`, `expectation_source`                                                                                                      | required non-empty alias-safe text for a countable row |
| `expected_test_ids`, `executed_test_ids`, `skipped_test_ids`, `incomplete_test_ids`, `retried_test_ids`, `absent_test_ids`                     | required ID list or `none`                             |
| `notes`                                                                                                                                        | optional alias-safe text                               |

Repository authorization is countable only when
`authorization_evidence_reference` identifies explicit permission covering
the aliased repository and historical-PR assessment, and
`authorization_granted_at <= pr_selected_at`. The public record contains only
the alias and the evidence reference, never the authorization artifact.

Before any PR is selected, freeze exactly two explicitly authorized repository
aliases and record that repository cohort plus its freeze timestamp in the gate
record. Authorization timestamps and references repeated on probe rows must be
consistent for the same repository alias. Other repositories cannot enter the
formal probe sample.

The probe is two-pass:

1. The `selector_alias` records an objectively eligible merged PR, its
   non-empty `eligibility_basis`, independently expected Playwright test IDs,
   and a non-empty `expectation_source`. The selector freezes that set at
   `expected_set_frozen_at` without seeing required-CI or execution results.
2. Only after the freeze may CI execution evidence be revealed. A different
   `verifier_alias` records required-CI state and executed, skipped,
   incomplete, retried, and absent sets, derives `green_but_unverified`, cites
   the result evidence, and records `result_verified_at`.

A probe row is eligible only when `eligible=yes`, `merged_at` proves it was a
merged historical PR before `pr_selected_at`, and `eligibility_basis` applies
an objective predeclared selection rule without reference to CI/test results.
It is countable only when it is eligible; authorization is complete; all ID
sets are non-blank; `selector_alias` and `verifier_alias` are non-empty and
different; `pr_selected_at <= expected_set_frozen_at <
ci_execution_evidence_revealed_at <= result_verified_at`; the expectation
source and result evidence reference are non-empty; and both derived result
booleans are valid. Unauthorized rows, rows selected after execution evidence
was revealed, expected sets frozen with hindsight, and same-person
selector/verifier rows never count.

For a countable row, `green_but_unverified=yes` exactly when
`required_ci_green=yes` and at least one expected test ID appears in the
skipped, incomplete, retried, or absent set; otherwise it is `no`. Freeze the
formal probe sample when the tenth countable row for each of the two
pre-authorized repository aliases is verified. Retain the 20 ordered probe IDs
and freeze timestamp in the gate record. Rows added later cannot replace or
change that formal sample.

## Workflow diaries and cost comparisons

Each diary has a unique `diary_id`, one `team_alias`, and one `interview_id`.
Required CI state allows exactly `green`, `red`, or `unknown`; the observed
green-but-unverified field allows exactly `yes`, `no`, or `unknown`. A complete
diary has every required section populated and evidence gaps explicitly
recorded. Count at most one complete diary per distinct team alias, choosing
the earliest `release date` and then `diary_id`. The formal diary sample is the
first three such distinct-team diaries ordered by release date, then
`diary_id`; freeze their IDs when the third exists. Later diaries cannot change
the three cost comparisons.

A complete cost comparison is linked to a counted diary and contains both
non-negative decimal-hour values plus one evidence reference covering the
same observed team release. `cost_overrun=yes` exactly when
`metadata_maintenance_hours > expected_release_effort_saved_hours`; equality
is not an overrun. PROCEED requires three comparisons, one for each counted
diary team, and zero overruns.
