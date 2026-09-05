# Proofline Problem Interview

Use this guide to collect evidence, not to create demand. Keep the public
record alias-based; record exact examples and evidence references, not names,
customer details, or inferred answers.

## Qualification first

Before counting the interview or starting the 42-day clock, establish all of
the following:

1. Is the participant a QA lead, senior QA/automation engineer, release owner,
   engineering manager, or Head of QA?
2. Does the participant's team use Playwright?
3. Does the participant's team use GitHub Actions?
4. Is this a completed external interview, and what is its ISO 8601 completion
   timestamp with timezone?

Record `external`, role, tool use, and `completed_at` in their dedicated
scorecard fields. `external=yes` means the participant represents a team
outside the Proofline operating team. If a predicate is not evidenced, mark
the interview excluded and record why; do not count it or start the window.

The formal cohort freezes at the first 12 qualified interviews ordered by
`completed_at` and then `interview_id`. Interview 13 and later cannot change
any formal interview-derived measure. See the field dictionary before
recording data.

## NARROW job classification

For each of the frozen first 12 qualified interviews, record exactly one of
these case-sensitive `notes` tokens: `narrow_job=reporting`,
`narrow_job=skip_flake_visibility`, `narrow_job=audit_packets`, or
`narrow_job=none`. A non-`none` classification is usable only when
`quoted_problem` is non-empty and `notes` also contains the alias-safe token
`narrow_job_evidence_ref=E-<alias>`. `<alias>` must be a non-empty opaque
identifier with no customer, participant, repository, PR, or workstation
identifier. Example token order for a counted non-`none` interview:
`narrow_job=reporting; narrow_job_evidence_ref=E-example`.

Do not infer a classification. A missing, duplicated, or unrecognized
`narrow_job` token is excluded from the NARROW metric. `narrow_job=none`
records an explicit non-match and is not a NARROW signal.

## Problem and workflow questions

1. Walk me through the last production release from code complete to approval.
2. How did you decide which regression tests to run?
3. Where were requirements, automated tests, manual checks, and results recorded?
4. Show or describe the release report or evidence used for the decision.
5. For the last real example where required CI was green but the release was
   not actually verified, what manually expected Playwright test was absent,
   skipped, incomplete, or only green after retry masking? Capture the PR and
   repository aliases, expected versus actual tests, CI state, and evidence
   reference if authorized.
6. What was blocked, skipped, flaky, or untested, and how was that represented?
7. How many people and hours were involved in planning and reporting?
8. Which current tools are paid, and what would break if you removed them?
9. Tell me about the last escaped defect related to missing or misleading evidence.
10. Rank **selecting the Playwright tests affected by a code change** among the
    participant's top five release pains. Record its numeric rank from 1 to 5,
    or leave the field blank if it is not in the top five.
11. Separately rank **required CI being green while one or more expected
    Playwright tests were absent, skipped, incomplete, or green only after a
    retry**. Record 1 to 5, or blank if it is not in the top five. Do not ask
    for or record a generic release-pain rank or a manual top-three flag.
12. If either exact pain is ranked 1, 2, or 3, the scorecard derives one narrow
    top-three result for this interview; two qualifying ranks still count once.
13. If the demonstrated problem supports only reporting, skip/flake visibility,
    or audit packets, record that exact narrow-job token, a non-identifying
    quoted problem, and an alias-safe evidence reference; otherwise record
    `narrow_job=none`.

## Evidence requests after the problem is established

After the participant has demonstrated the problem with a real example:

1. Ask whether they will authorize assessment of historical merged PRs. Explain
   that the record uses repository and PR aliases and needs 10 eligible merged
   PRs for each authorized repository.
2. Request an unaided external install: the participant independently runs the
   inventory-generation workflow without live implementation help. Record the
   start, inventory-created time, duration, blockers, and evidence reference in
   the installation scorecard. It is successful only when completed in 60
   minutes or less.
3. Only after the problem is demonstrated, test a concrete paid-pilot
   conversation with an authorized buyer or commercial authority. Record that
   authority in `participant_role`, and count a priced commitment only when
   that person actually discussed a concrete price and next step, with an
   evidence reference. A participant's prediction, general interest, or a
   price discussion without buyer/commercial authority is not a commitment.
4. Complete the interview-linked follow-up, record its ISO 8601 timestamp in
   `follow_up_completed_at`, and cite an alias-safe
   `follow_up_evidence_reference`. The gate's all-follow-ups-complete measure
   covers exactly the frozen 12 interview IDs; a timestamp or reference alone
   is incomplete.

Do not pitch before qualification and the problem questions are complete. Do
not imply availability, pricing, customer traction, or a commitment that has
not been recorded.
