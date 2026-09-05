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
4. Is this a completed external interview?

Record the role and tool-use answers in the scorecard. For every counted
interview, the `notes` field must contain the exact, case-sensitive tokens in
this canonical form: `external=yes; completed=yes`.

- `external=yes` means the participant represents a team outside the Proofline
  operating team.
- `completed=yes` means the interview was conducted and the qualification plus
  problem-interview evidence was recorded.

If a qualifying predicate is not evidenced, or either exact notes token is
absent, mark the interview excluded and record why; do not count it toward the
gate or start the 42-day clock.

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
10. Rank release planning/evidence among your top five QA pains. Record whether
    it is in the top three.

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

Do not pitch before qualification and the problem questions are complete. Do
not imply availability, pricing, customer traction, or a commitment that has
not been recorded.
