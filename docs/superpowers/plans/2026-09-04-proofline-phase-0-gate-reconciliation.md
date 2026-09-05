# Proofline Phase 0 Gate Reconciliation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Replace contradictory and circular Phase 0 criteria with one frozen six-week evidence gate that tests the narrow pull-request problem before more product code is written.

**Architecture:** Make `docs/validation/decision-gate.md` the repository's authoritative gate. Supporting templates collect only the fields required to calculate its outcome. Earlier strategy deliverables point to the same definition and move recommendation-quality benchmarking to the later recommendation-engine phase. Raw customer data remains private; the public repository contains blank templates and aggregate decision records only.

**Tech Stack:** Markdown, CSV, Git, ripgrep; no application code and no fabricated evidence.

**Spec:** `docs/superpowers/specs/2026-09-04-proofline-narrow-wedge-remediation-design.md` Sections 11–13.

## Global Constraints

- Execute after the technical PR remediation is locally green.
- Freeze the thresholds below before the first counted interview. Later changes require a dated decision note and restart of affected counts.
- Freeze the formal interview cohort at the first 12 qualified records ordered by `completed_at`, then `interview_id`; all interview-derived measures use only that cohort.
- Use `docs/validation/field-dictionary.md` as the normative type, alias, uniqueness, de-duplication, linkage, and countability contract.
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
- Create: `docs/validation/field-dictionary.md`
- Create: `docs/validation/installation-scorecard.csv`
- Create: `docs/validation/selection-risk-probe.csv`
- Create: `docs/validation/commitment-register.csv`

### Step 1: Define the as-built window and frozen samples

The following block supersedes every older exact formula/header snippet retained
elsewhere in this historical plan. Implement it exactly in the authoritative
gate:

```text
window_start = earliest completed_at among qualified interviews
window_end = window_start + 42 calendar days
qualified_interview = external=yes AND role is allowed AND uses_playwright=yes AND uses_github_actions=yes AND completed_at is valid
qualified_interview_count = count(qualified interviews completed in the window)
formal_interview_cohort = first 12 qualified interviews ordered by completed_at, then interview_id
narrow_top_three(interview) = affected_test_selection_rank in 1..3 OR green_but_unverified_rank in 1..3
narrow_top_three_count = count(formal cohort where narrow_top_three is true)
median_manual_hours = median(hours_planning + hours_reporting for the formal cohort)
all_formal_follow_ups_complete = every frozen interview has linked follow_up_completed_at and evidence
successful_install_count = count(distinct team aliases represented by their deterministic earliest successful external install)
countable_probe_row = explicitly authorized eligible merged PR with an expected set frozen by selector before CI execution evidence reveal, then results verified by a distinct verifier
probe_hit_count = count(green_but_unverified=yes across the frozen 20-row two-repository probe sample)
written_design_partner_count / priced_commitment_count = count the deterministic earliest active allowed commitment per distinct team alias; withdrawn/expired never count
cost_comparison_count = count(counted diary teams with one complete same-release comparison)
cost_overrun_count = count(complete comparisons where metadata maintenance hours exceed expected saved release hours)
narrow_job_count(job) = count(formal-cohort interviews with the same fully evidenced allowed non-none token)
```

### Step 2: Encode mutually evaluable outcomes

Write the authoritative rules exactly:

```text
PROCEED only when all are true by day 42:
- qualified_interview_count >= 12 and the first-12 cohort is frozen;
- narrow_top_three_count >= 6 of the frozen 12;
- median_manual_hours >= 2;
- 3 complete workflow diaries from 3 teams;
- successful_install_count >= 3 from distinct team aliases;
- 2 explicitly authorized repositories with exactly 10 countable two-pass rows per repository in the frozen sample;
- probe_hit_count >= 3 of the frozen 20;
- written_design_partner_count >= 2 OR priced_commitment_count >= 1.
- cost_comparison_count = 3, one per counted diary team, AND cost_overrun_count = 0.

STOP immediately when a terminal rule is known, or at day 42 when any is true:
- successful_install_count < 2 AND written_design_partner_count = 0;
- probe_hit_count <= 1 after the frozen 20-row sample is complete;
- the frozen interview cohort exists AND (narrow_top_three_count < 4 OR median_manual_hours < 1);
- written_design_partner_count = 0 AND priced_commitment_count = 0 after all frozen-cohort follow-ups are complete;
- all 3 cost comparisons are complete AND cost_overrun_count >= 1.

NARROW at day 42 only when PROCEED and STOP are false, the complete core sample exists, and at least one is true:
- narrow_top_three_count is 4 or 5 of the frozen 12;
- median_manual_hours is >= 1 and < 2;
- successful_install_count = 2 from distinct team aliases;
- probe_hit_count = 2 of the frozen 20;
- narrow_job_count(reporting) >= 4, narrow_job_count(skip_flake_visibility) >= 4, or narrow_job_count(audit_packets) >= 4.

Complete NARROW core sample:
- qualified_interview_count >= 12 and frozen first-12 cohort;
- 3 complete diaries from distinct teams;
- all frozen-cohort follow-ups complete;
- frozen two-repository/20-row probe sample complete;
- 3 complete same-release cost comparisons with zero overruns;
- exactly 2 successful installs from distinct external teams.
```

Evaluate at day 42 in this order: `PROCEED` if every proceed condition is true; otherwise `STOP` if a stop rule is true; otherwise `NARROW` if a narrow signal is true; otherwise `STOP` for insufficient evidence. Incomplete sampling at day 42 can never be called `PROCEED`.

### Step 3: Make the gate record auditable

Add fields for first interview date, day-42 deadline, each numerator/denominator, included record IDs, exclusions with reasons, repository aliases, install durations, probe result, commitment evidence, decision owner, and decision date.

### Step 4: Expand collection templates

The following are the current exact public CSV headers. They supersede every
older exact-header snippet, including historical snippets in the CLI-alpha
plan. Keep every template header-only and blank:

```csv
interview_id,completed_at,team_alias,company_size,qa_size,external,participant_role,uses_playwright,uses_github_actions,release_frequency,current_tools,hours_planning,hours_reporting,affected_test_selection_rank,green_but_unverified_rank,repository_access_interest,install_interest,design_partner_interest,price_discussed,artifact_permission,quoted_problem,follow_up_completed_at,follow_up_evidence_reference,notes
```

Create `installation-scorecard.csv`:

```csv
install_id,date,team_alias,participant_role,external,unaided,started_at,inventory_created_at,duration_minutes,completed,playwright_version,node_version,blocker_category,evidence_reference,notes
```

Create `selection-risk-probe.csv`:

```csv
probe_id,repository_alias,authorization_granted_at,authorization_evidence_reference,pr_alias,merged_at,eligible,eligibility_basis,pr_selected_at,selector_alias,expected_test_ids,expectation_source,expected_set_frozen_at,ci_execution_evidence_revealed_at,required_ci_green,executed_test_ids,skipped_test_ids,incomplete_test_ids,retried_test_ids,absent_test_ids,result_verified_at,green_but_unverified,evidence_reference,verifier_alias,notes
```

Create `commitment-register.csv`:

```csv
commitment_id,date,team_alias,participant_role,buyer_authority,commitment_type,concrete_price_discussed,next_step,due_date,evidence_reference,status,notes
```

Create `docs/validation/field-dictionary.md` defining unique primary IDs;
alias-only fields; exact boolean/status/date/timestamp/number/list types;
follow-up linkage; deterministic first-12 interview freezing; one earliest
successful install and one earliest active allowed commitment per distinct
team alias; withdrawn/expired exclusions; priced-commitment buyer authority;
and the authorized, timestamped, distinct-role two-pass probe protocol.

Update the interview guide to establish qualification, separately rank the two
exact narrow pains, record follow-up completion, request an unaided install,
and test a concrete paid-pilot conversation only after the problem is
demonstrated. Update the diary to use aliases and explicitly record required CI
state, expected/actual tests, skips, retries, absences, and one complete
same-release cost comparison for each counted diary team.

### Step 5: Validate structure and commit

```sh
test "$(head -n 1 docs/validation/interview-scorecard.csv)" = "interview_id,completed_at,team_alias,company_size,qa_size,external,participant_role,uses_playwright,uses_github_actions,release_frequency,current_tools,hours_planning,hours_reporting,affected_test_selection_rank,green_but_unverified_rank,repository_access_interest,install_interest,design_partner_interest,price_discussed,artifact_permission,quoted_problem,follow_up_completed_at,follow_up_evidence_reference,notes"
test "$(head -n 1 docs/validation/installation-scorecard.csv)" = "install_id,date,team_alias,participant_role,external,unaided,started_at,inventory_created_at,duration_minutes,completed,playwright_version,node_version,blocker_category,evidence_reference,notes"
test "$(head -n 1 docs/validation/selection-risk-probe.csv)" = "probe_id,repository_alias,authorization_granted_at,authorization_evidence_reference,pr_alias,merged_at,eligible,eligibility_basis,pr_selected_at,selector_alias,expected_test_ids,expectation_source,expected_set_frozen_at,ci_execution_evidence_revealed_at,required_ci_green,executed_test_ids,skipped_test_ids,incomplete_test_ids,retried_test_ids,absent_test_ids,result_verified_at,green_but_unverified,evidence_reference,verifier_alias,notes"
test "$(head -n 1 docs/validation/commitment-register.csv)" = "commitment_id,date,team_alias,participant_role,buyer_authority,commitment_type,concrete_price_discussed,next_step,due_date,evidence_reference,status,notes"
rg -n "qualified_interview_count >= 12|42 calendar|narrow_top_three_count >= 6|successful_install_count >= 3|probe_hit_count >= 3|priced_commitment_count >= 1|cost_comparison_count = 3|cost_overrun_count = 0" docs/validation/decision-gate.md
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

In a temporary directory outside tracked files, create focused synthetic cases
and remove them after the check:

- one meeting every `PROCEED` predicate;
- one triggering `STOP` through one probe hit out of 20;
- one reaching day 42 with five narrow top-three interviews, two distinct-team installs, two probe hits, a complete NARROW core sample, and `narrow_job_count >= 4`;
- unauthorized probe, expected set frozen after CI evidence reveal, and same selector/verifier exclusions;
- missing frozen-cohort follow-up exclusion;
- duplicate-team installation and commitment de-duplication;
- withdrawn/expired commitment exclusion and buyer-authority rejection;
- interview 12 to 13 monotonicity and same-`completed_at` `interview_id` tie-break.

Calculate using only `decision-gate.md` and the field dictionary. Expected
normal outcomes are `PROCEED`, `STOP`, and `NARROW`; every invalid or duplicate
record above must be excluded, interview 13 must not change the formal metrics,
and the same-time tie must resolve lexically by `interview_id`. If the same
case can yield different outcomes, revise the wording before data collection.

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

This plan is complete when the repository contains one dry-run-tested
authoritative gate and field dictionary; the supporting blank templates expose
the current exact headers; all interview measures use the frozen first 12; the
two-pass probe rejects unauthorized, hindsight-selected, and same-role rows;
installs and commitments de-duplicate by team; the PROCEED cost comparisons and
complete NARROW core sample are explicit; the three earlier deliverables point
to the same gate; no obsolete governing formula remains; and review finds no
decision ambiguity or privacy blocker. The market-validation program itself
completes only after real external evidence produces a documented verdict.
