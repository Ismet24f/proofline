# Release Workflow Diary

Use one diary for each observed production release. Capture what actually
happened, including waits, rework, and gaps in evidence. Do not fill missing
facts from memory or assumptions. Use team, repository, participant, and PR
aliases only.

## Release details

| Field | Value |
| --- | --- |
| Interview ID | |
| Team alias | |
| Repository alias | |
| Release / PR alias | |
| Release date | |
| Observer alias | |
| Participant role | |

## Activity log

Record one row per meaningful activity, hand-off, wait, or correction. Use ISO
8601 timestamps where possible. Put a dash (`—`) when a field does not apply.

| Timestamp | Actor alias | Action | Tool | Input | Output | Waiting time | Rework | Evidence gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

## Required CI and Playwright evidence

Record expected tests independently from what CI reports. This section is
required for any diary used as a gate record.

| Field | Value |
| --- | --- |
| Required CI state (`green`, `red`, `unknown`) | |
| Expected Playwright test IDs | |
| Actual executed Playwright test IDs | |
| Skipped test IDs | |
| Retried test IDs | |
| Absent or incomplete test IDs | |
| Green-but-unverified observation (`yes`, `no`, `unknown`) | |
| Evidence reference | |

## Release summary

| Field | Value |
| --- | --- |
| Code-complete timestamp | |
| Approval timestamp | |
| Total elapsed time | |
| People involved | |
| Planning hours | |
| Reporting hours | |
| Tests planned / run | |
| Blocked, skipped, flaky, or untested checks | |
| Decision and decision-owner alias | |
| Evidence shown to the decision owner | |
| Follow-up or escaped-defect signal | |

## Evidence notes

Link or reference the artifact for each material claim. If an artifact cannot
be shared, record its type, alias-based location, owner role, and why
permission was unavailable. Do not put customer names or personal data in this
repository.

| Claim or observation | Artifact / reference | Permission status | Notes |
| --- | --- | --- | --- |
| | | | |
| | | | |

Three completed release diaries from three distinct team aliases are required
before a PROCEED decision. A completed diary has release details, an activity
log, required CI and Playwright evidence, a release summary, and evidence
notes with gaps explicitly recorded.
