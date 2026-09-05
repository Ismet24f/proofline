# Release Workflow Diary

Use one diary for each observed production release. Capture what actually
happened, including waits, rework, and gaps in evidence. Do not fill missing
facts from memory or assumptions. Use team, repository, participant, and PR
aliases only.

## Release details

| Field              | Value |
| ------------------ | ----- |
| Diary ID           |       |
| Interview ID       |       |
| Team alias         |       |
| Repository alias   |       |
| Release / PR alias |       |
| Release date       |       |
| Observer alias     |       |
| Participant role   |       |

## Activity log

Record one row per meaningful activity, hand-off, wait, or correction. Use ISO
8601 timestamps where possible. Put a dash (`—`) when a field does not apply.

| Timestamp | Actor alias | Action | Tool | Input | Output | Waiting time | Rework | Evidence gap |
| --------- | ----------- | ------ | ---- | ----- | ------ | ------------ | ------ | ------------ |
|           |             |        |      |       |        |              |        |              |
|           |             |        |      |       |        |              |        |              |
|           |             |        |      |       |        |              |        |              |
|           |             |        |      |       |        |              |        |              |

## Required CI and Playwright evidence

Record expected tests independently from what CI reports. This section is
required for any diary used as a gate record. A diary is observational; the
formal historical-PR probe uses the stricter two-pass selector/verifier process
defined in the field dictionary.

| Field                                                     | Value |
| --------------------------------------------------------- | ----- |
| Required CI state (`green`, `red`, `unknown`)             |       |
| Expected Playwright test IDs                              |       |
| Actual executed Playwright test IDs                       |       |
| Skipped test IDs                                          |       |
| Retried test IDs                                          |       |
| Absent or incomplete test IDs                             |       |
| Green-but-unverified observation (`yes`, `no`, `unknown`) |       |
| Evidence reference                                        |       |

## Release summary

| Field                                       | Value |
| ------------------------------------------- | ----- |
| Code-complete timestamp                     |       |
| Approval timestamp                          |       |
| Total elapsed time                          |       |
| People involved                             |       |
| Planning hours                              |       |
| Reporting hours                             |       |
| Tests planned / run                         |       |
| Blocked, skipped, flaky, or untested checks |       |
| Decision and decision-owner alias           |       |
| Evidence shown to the decision owner        |       |
| Follow-up or escaped-defect signal          |       |

## Metadata/maintenance cost comparison

Use this section only when the diary contributes a cost comparison to the
gate. Both hour values must be non-negative decimal hours for this same team
and observed release. Record actual participant time, not an inferred cost;
the expected saved time is the same participant's recorded estimate for this
release. This comparison concerns the inventory/probe workflow and does not
require a recommendation engine.

| Field                               | Value |
| ----------------------------------- | ----- |
| Metadata/maintenance hours          |       |
| Expected release effort saved hours |       |
| Evidence reference for both values  |       |

## NARROW-job cross-reference

When this diary supports a NARROW classification, record the linked interview's
exact `narrow_job` token and its alias-safe `narrow_job_evidence_ref`. The
supporting interview scorecard must also contain a non-empty `quoted_problem`.

| Field                                              | Value |
| -------------------------------------------------- | ----- |
| NARROW-job token and alias-safe evidence reference |       |

## Evidence notes

Link or reference the artifact for each material claim. If an artifact cannot
be shared, record its type, alias-based location, owner role, and why
permission was unavailable. Do not put customer names or personal data in this
repository.

| Claim or observation | Artifact / reference | Permission status | Notes |
| -------------------- | -------------------- | ----------------- | ----- |
|                      |                      |                   |       |
|                      |                      |                   |       |

Three completed release diaries from three distinct team aliases are required
before a PROCEED decision. A completed diary has release details, an activity
log, required CI and Playwright evidence, a release summary, and evidence
notes with gaps explicitly recorded. Count at most one complete diary per team:
the earliest release date, then `diary_id`, is the deterministic choice. Freeze
the first three resulting distinct-team diaries by release date, then
`diary_id`. Each formal-diary team must also have one complete same-release cost
comparison; PROCEED requires all three comparisons and zero overruns.
