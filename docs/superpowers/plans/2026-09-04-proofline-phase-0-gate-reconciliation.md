# Proofline Phase 0 Gate Reconciliation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Replace contradictory and circular Phase 0 criteria with one frozen six-week evidence gate that tests the narrow pull-request problem before more product code is written.

**Architecture:** Make `docs/validation/decision-gate.md` the repository's authoritative gate. Supporting templates collect only the fields required to calculate its outcome. Earlier strategy deliverables point to the same definition and move recommendation-quality benchmarking to the later recommendation-engine phase. Raw customer data remains private; the public repository contains blank templates and aggregate decision records only.

**Tech Stack:** Markdown, CSV, Git, ripgrep; no application code and no fabricated evidence.

**Spec:** `docs/superpowers/specs/2026-09-04-proofline-narrow-wedge-remediation-design.md` Sections 11–13.

## Global Constraints

- Execute after the technical PR remediation is locally green.
- Freeze the thresholds below before the first counted interview. Later changes require a dated decision note and restart of affected counts.
- Do not count compliments, GitHub stars, inferred intent, internal installations, or unpriced enthusiasm.
- Do not commit customer names, repository names, source paths, test titles, credentials, or raw commercial documents.
- Use aliases in public or shareable evidence. Store raw records only in an approved private location.
- Do not unblock original Tasks 5–12 from documentation alone.

## Task 1: Make the repository gate authoritative and computable

**Files:**

- Modify: `docs/validation/decision-gate.md`
- Modify: `docs/validation/interview-scorecard.csv`
- Modify: `docs/validation/interview-guide.md`
- Modify: `docs/validation/workflow-diary.md`
- Create: `docs/validation/installation-scorecard.csv`
- Create: `docs/validation/selection-risk-probe.csv`
- Create: `docs/validation/commitment-register.csv`

### Step 1: Replace the old 15-interview rule

Define the fixed window and qualifying predicates before formulas:

```text
window_end = first_qualified_interview_date + 42 calendar days
qualified_interview = role is QA lead, senior QA/automation engineer, release owner, engineering manager, or Head of QA AND team uses Playwright AND team uses GitHub Actions
successful_external_install = external participant completes inventory generation without live implementation help in <= 60 minutes
green_but_unverified = merged PR had green required CI AND at least one manually expected Playwright test was absent, skipped, incomplete, or only green after retry masking
```

Use these measures:

```text
top_three_count = count(qualified interviews where top_three = yes)
median_manual_hours = median(hours_planning + hours_reporting for qualified interviews)
successful_install_count = count(successful external installs)
probe_hit_count = count(green_but_unverified = yes across 20 authorized historical PRs)
written_design_partner_count = count(written commitments with evidence reference)
priced_commitment_count = count(commitments where a buyer discussed a concrete price and next step)
```

### Step 2: Encode mutually evaluable outcomes

Write the authoritative rules exactly:

```text
PROCEED only when all are true by day 42:
- 12 qualified interviews completed;
- top_three_count >= 6;
- median_manual_hours >= 2;
- 3 complete workflow diaries from 3 teams;
- successful_install_count >= 3;
- 2 authorized repositories with exactly 10 eligible merged PRs assessed per repository;
- probe_hit_count >= 3 of 20;
- written_design_partner_count >= 2 OR priced_commitment_count >= 1.

STOP immediately when a terminal rule is known, or at day 42 when any is true:
- successful_install_count < 2 AND written_design_partner_count = 0;
- probe_hit_count <= 1 after all 20 eligible PRs are assessed;
- 12 interviews are complete AND (top_three_count < 4 OR median_manual_hours < 1);
- written_design_partner_count = 0 AND priced_commitment_count = 0 after all qualified-interview follow-ups are complete;
- the observed metadata/maintenance cost is greater than the release effort participants expect to save.

NARROW at day 42 only when PROCEED and STOP are both false and at least one is true:
- top_three_count is 4 or 5;
- median_manual_hours is >= 1 and < 2;
- successful_install_count = 2;
- probe_hit_count = 2 of 20;
- repeated evidence supports only reporting, skip/flake visibility, or audit packets rather than enforcement.
```

Evaluate at day 42 in this order: `PROCEED` if every proceed condition is true; otherwise `STOP` if a stop rule is true; otherwise `NARROW` if a narrow signal is true; otherwise `STOP` for insufficient evidence. Incomplete sampling at day 42 can never be called `PROCEED`.

### Step 3: Make the gate record auditable

Add fields for first interview date, day-42 deadline, each numerator/denominator, included record IDs, exclusions with reasons, repository aliases, install durations, probe result, commitment evidence, decision owner, and decision date.

### Step 4: Expand collection templates

Replace the scorecard header with:

```csv
interview_id,date,team_alias,company_size,qa_size,participant_role,uses_playwright,uses_github_actions,release_frequency,current_tools,hours_planning,hours_reporting,pain_rank,top_three,repository_access_interest,install_interest,design_partner_interest,price_discussed,artifact_permission,quoted_problem,notes
```

Create `installation-scorecard.csv`:

```csv
install_id,date,team_alias,participant_role,external,unaided,started_at,inventory_created_at,duration_minutes,completed,playwright_version,node_version,blocker_category,evidence_reference,notes
```

Create `selection-risk-probe.csv`:

```csv
probe_id,repository_alias,pr_alias,merged_at,eligible,required_ci_green,expected_test_ids,executed_test_ids,skipped_test_ids,retried_test_ids,absent_test_ids,green_but_unverified,evidence_reference,reviewer,notes
```

Create `commitment-register.csv`:

```csv
commitment_id,date,team_alias,participant_role,commitment_type,concrete_price_discussed,next_step,due_date,evidence_reference,status,notes
```

Update the interview guide to establish qualifying role/tool use, ask for the last real green-but-unverified example, request an unaided install, and test a concrete paid-pilot conversation only after the problem is demonstrated. Update the diary to use team/repository aliases and explicitly record required CI state, expected tests, actual tests, skips, retries, and absences.

### Step 5: Validate structure and commit

```sh
test "$(head -n 1 docs/validation/interview-scorecard.csv)" = "interview_id,date,team_alias,company_size,qa_size,participant_role,uses_playwright,uses_github_actions,release_frequency,current_tools,hours_planning,hours_reporting,pain_rank,top_three,repository_access_interest,install_interest,design_partner_interest,price_discussed,artifact_permission,quoted_problem,notes"
test "$(head -n 1 docs/validation/installation-scorecard.csv)" = "install_id,date,team_alias,participant_role,external,unaided,started_at,inventory_created_at,duration_minutes,completed,playwright_version,node_version,blocker_category,evidence_reference,notes"
test "$(head -n 1 docs/validation/selection-risk-probe.csv)" = "probe_id,repository_alias,pr_alias,merged_at,eligible,required_ci_green,expected_test_ids,executed_test_ids,skipped_test_ids,retried_test_ids,absent_test_ids,green_but_unverified,evidence_reference,reviewer,notes"
test "$(head -n 1 docs/validation/commitment-register.csv)" = "commitment_id,date,team_alias,participant_role,commitment_type,concrete_price_discussed,next_step,due_date,evidence_reference,status,notes"
rg -n "12 qualified|42 calendar|top_three_count >= 6|successful_install_count >= 3|probe_hit_count >= 3|priced_commitment_count >= 1" docs/validation/decision-gate.md
git add docs/validation
git commit -m "docs: freeze the Phase 0 evidence gate"
```

## Task 2: Reconcile the three earlier strategy deliverables

**Files:**

- Modify outside repository: `release-evidence-platform-product-design.md`
- Modify outside repository: `proofline-delivery-program.md`
- Modify outside repository: `proofline-phase-0-cli-alpha-implementation-plan.md`
- Verify: `docs/validation/decision-gate.md`

These three user-facing deliverables live in the Codex outputs directory and are not part of the public Git repository.

### Step 1: Mark superseded scope without erasing history

At the top of each deliverable, add a dated status notice:

```md
> **Superseded scope notice (2026-09-04):** Proofline's Phase 0 is now governed by the narrow pull-request thesis and the authoritative repository gate in `docs/validation/decision-gate.md`. Broad platform and CLI-alpha sections below are retained as future hypotheses, not authorized implementation.
```

### Step 2: Replace every governing old gate reference

Where a document currently makes 15 interviews, three alpha teams, or the unbuilt recommendation benchmark a Phase 0 exit condition, replace the governing instruction with the frozen gate summary from Task 1. Explicitly move the 20-scenario deterministic recommendation benchmark to the future recommendation-engine phase.

Do not delete technical history or relabel already completed Tasks 1–4 as market validation. State:

```text
Tasks 5–12 remain stopped. Technical feasibility is not customer demand. A future recommendation implementation receives a new design and plan only after PROCEED.
```

### Step 3: Resolve schedule and cost claims

Replace the old 2–3 week Phase 0 assumption with a maximum six-week evidence window. Keep any infrastructure or pricing values explicitly labeled as hypotheses or spending caps, never traction evidence.

### Step 4: Run a contradiction scan

```sh
rg -n "15 interviews|completed_interviews >= 15|alpha_commitments >= 3|benchmark.*Phase 0|Phase 0.*benchmark|continue only on.*benchmark" docs/validation/decision-gate.md
```

Expected: no output.

Run the same expressions against the three revised outputs. Any remaining match must be inside a clearly labeled historical/superseded quotation; otherwise correct it.

Because the outputs are outside this Git repository, report their saved paths to the user but do not include them in a repository commit.

## Task 3: Audit the gate before collecting evidence

**Files:**

- Review: `docs/validation/*`
- Review: the three revised strategy deliverables

### Step 1: Perform a dry-run with synthetic data outside tracked files

In a temporary directory, create three synthetic cases:

- one meeting every `PROCEED` predicate;
- one triggering `STOP` through one probe hit out of 20;
- one reaching day 42 with five top-three interviews, two installs, and two probe hits.

Manually calculate the result using only `decision-gate.md`. Expected outcomes are `PROCEED`, `STOP`, and `NARROW`. If two reviewers can reach different outcomes from the same case, revise the wording before data collection.

### Step 2: Run privacy and fabrication checks

```sh
rg -n '[/]Users/|[/]home/|[A-Za-z]:[\\\\]{2}Users[\\\\]{2}|github[.]com/[^ )]+/[^ )]+' docs/validation
git diff --check
git status --short
```

Expected: no workstation paths or real repository URLs in validation templates; formatting is clean; no synthetic or customer rows are tracked.

### Step 3: Independent gate review

Have a read-only reviewer answer:

1. Are all inputs objectively recordable?
2. Are `PROCEED`, `NARROW`, and `STOP` mutually resolvable with stated precedence?
3. Can any result pass through missing samples or inferred evidence?
4. Does the gate accidentally require the unbuilt recommendation engine?
5. Could public artifacts expose customer identity or repository content?

Fix any blocker in the governing gate and repeat the synthetic dry-run.

## Manual Execution Checkpoint

After Tasks 1–3, stop product implementation. The next work is six weeks or less of real interviews, diaries, unaided installs, authorized historical-PR probes, and priced conversations. Blank templates and an internally consistent gate are not validation evidence.

At the end of the window, calculate one verdict with cited record IDs:

- `PROCEED`: write a new design and implementation plan for the smallest validated pull-request check.
- `NARROW`: write a new four-week gate for the observed smaller job before coding.
- `STOP`: archive the commercial direction and preserve reusable components without additional product spend.

## Completion Contract

This plan is complete when the repository contains one dry-run-tested authoritative gate, all supporting templates collect its required fields, the three earlier deliverables point to the same gate, no circular benchmark remains, and an independent review finds no decision ambiguity or privacy blocker. The market-validation program itself completes only after real external evidence produces a documented verdict.
