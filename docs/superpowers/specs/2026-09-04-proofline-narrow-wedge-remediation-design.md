# Proofline Narrow-Wedge and PR Remediation Design

**Status:** Draft for user review  
**Date:** 2026-09-04  
**Applies to:** PR #1, `feature/phase-0-cli-alpha`  
**Product stage:** Technical foundation and problem validation  
**License decision:** Apache License 2.0

## 1. Decision

Narrow Proofline's initial product thesis to one pull-request question:

> Which Playwright tests should have protected this code change, and which of them did not actually run?

The existing evidence model remains a foundation for future expansion, but the initial customer pitch will not include a complete release-intelligence platform, requirement management, defect management, manual evidence workflow, Jira integration, dashboards, or AI assistance.

PR #1 is not merge-ready. It must first become safe to install in ordinary Playwright repositories, internally consistent, genuinely open source, and honest about its review evidence.

Tasks 5–12 from the original plan remain stopped. After PR remediation, work moves to external validation, not additional product implementation.

## 2. Why this direction

The current engineering proves that Playwright inventory discovery, stable identities, strict evidence schemas, and failure propagation are feasible. It does not prove that teams want the broad product or will maintain capability, risk, and requirement metadata.

The narrower wedge has four advantages:

1. It describes an observable release risk rather than a platform category.
2. It can provide value without migrating test cases into another system.
3. It can be tested manually against historical pull requests before building a recommendation engine.
4. It creates a credible expansion path into organization history and audit-ready release evidence only after usage and willingness to pay are demonstrated.

## 3. Scope boundaries

### 3.1 Included in the PR remediation

- Compatibility with normal Playwright control annotations.
- Evidence and release-decision schema invariants.
- A truthful root verification and CI contract.
- Stable E2E build ordering without hook-timeout dependence.
- Reserved implicit-project sentinel enforcement.
- Repository-relative diagnostics where repository context exists.
- Removal of misleading cache-output declarations.
- Removal of tracked internal process reports and workstation paths.
- Apache-2.0 license.
- A practical README for a first inventory run.
- Honest PR wording that distinguishes internal agent reviews from GitHub reviews.
- Fresh clean-checkout and live CI verification.

### 3.2 Included in validation design

- One authoritative, non-circular Phase 0 gate.
- Time and effort bounds.
- Qualified problem interviews.
- Release workflow diaries.
- External installation evidence.
- Authorized manual selection-risk analysis on historical pull requests.
- Willingness-to-pay evidence.
- Objective `PROCEED`, `NARROW`, and `STOP` outcomes.

### 3.3 Explicitly excluded

- GitHub Action implementation.
- Execution-result ingestion beyond what is necessary to make current discovery trustworthy.
- Recommendation engine.
- Hosted API, database, or dashboard.
- Compliance templates or claims.
- Jira, Qase, or TestRail integrations.
- OpenAI integration or any AI-authored release verdict.
- Pricing implementation, billing, or fundraising.
- Tasks 5–12 until the external gate authorizes a smaller follow-up plan.

## 4. Product contract

### 4.1 Initial user and buyer hypothesis

**User:** QA lead, senior QA engineer, automation engineer, or release owner on a TypeScript team using Playwright and GitHub Actions.

**Economic buyer hypothesis:** Engineering manager, Head of QA, or compliance/engineering leader when release evidence has financial or audit value.

Both remain hypotheses until validated through behavior and priced commitments.

### 4.2 Initial job to be done

When a pull request changes behavior, determine whether the Playwright tests expected to protect that change actually executed, and expose skipped, absent, incomplete, or retry-masked evidence before merge.

### 4.3 Adoption principle

The initial useful workflow must not require teams to annotate every test with capability, risk, or requirement metadata. Explicit Proofline annotations remain supported, but path conventions, Playwright tags, and repository-owned mappings should be sufficient for an initial pilot.

No automatic mapping behavior is implemented in this remediation. This principle constrains the next plan if validation succeeds.

### 4.4 Monetization hypothesis

The reporter and basic pull-request check should remain inspectable and open source. Possible paid value later includes organization-wide history, policy management, evidence retention, audit export, and reviewer workflow.

No price is accepted as fact. Candidate pilot and subscription prices must be tested with real buyers.

## 5. Reporter compatibility design

### 5.1 Problem

Playwright exposes control annotations such as `skip`, `fixme`, `fail`, and `slow` without requiring descriptions. The current reporter treats most description-less annotations as fatal and limits description-less skip markers to one. This rejects ordinary suites and nested control scopes.

### 5.2 Normalization rule

Recognized framework control types are:

- `skip`
- `fixme`
- `fail`
- `slow`

For these types:

- A description-less annotation is framework control metadata and is not persisted in `TestDefinition.annotations`.
- Multiple description-less annotations are allowed because nested `describe` and test-level modifiers can legitimately accumulate.
- A described control annotation is preserved as ordinary annotation metadata unless Playwright behavior proves this ambiguous.
- Definition status derives from Playwright's resolved `expectedStatus`, not annotation count.
- `fixme` and resolved skipped tests map to the existing `SKIPPED` definition state.
- `fail` describes expected execution behavior; it does not make an unexecuted definition failed.
- `slow` affects execution timing and does not change definition status.

For non-framework annotations:

- Proofline-owned annotations require a non-empty trimmed description.
- Unknown/user annotations also require a non-empty trimmed description while the schema requires `Annotation.description: string`.
- Unknown description-less annotations are fatal rather than silently discarded.

This rule is deliberately explicit. It does not infer origin from annotation count and must be revalidated when Playwright changes its reporter contract.

### 5.3 Compatibility acceptance cases

Real `playwright test --list` subprocess fixtures must prove:

- ordinary `test.skip`;
- ordinary `test.fixme`;
- ordinary `test.fail`;
- ordinary `test.slow`;
- `test.skip` nested inside `test.describe.skip`;
- described user annotations remain preserved;
- description-less unknown annotations remain fatal;
- failures suppress stale inventory and return non-zero;
- no browser test body executes during discovery.

The ADR must document observed Playwright 1.62.1 behavior and the normalization contract.

## 6. Evidence model invariants

Schemas must reject impossible persisted claims without attempting to replace the future policy engine.

### 6.1 Evidence assertion rules

- `VERIFIED` requires at least one evidence ID.
- `CODE_VALIDATED` requires at least one evidence ID.
- `FAILED` and `BLOCKED` require either evidence or a non-empty explanatory message.
- `NOT_AFFECTED` requires an explanatory message or evidence path.
- `UNTESTED` and `UNKNOWN` may have no evidence because absence or contradiction can be the condition being represented.
- `ACCEPTED_RISK` requires an evidence ID representing the authorization or waiver record.

### 6.2 Release decision rules

- `PASS` requires zero policy violations and no assertion in `FAILED`, `BLOCKED`, `UNTESTED`, or `UNKNOWN`.
- `HOLD` requires at least one policy violation or an assertion in `FAILED` or `BLOCKED`.
- `INCOMPLETE` requires at least one assertion in `UNTESTED` or `UNKNOWN`.
- The schema does not decide whether a particular waiver is authorized, expired, or forbidden; those are Task 9 policy-engine responsibilities.

Every invariant receives a positive and negative schema test. Existing valid payloads remain valid unless they express a state that contradicts the product's non-negotiable evidence semantics.

## 7. Build, test, and CI contract

### 7.1 Root commands

Until root E2E orchestration is genuinely created:

- Remove the nonexistent `test:e2e` script.
- Define `pnpm check` as the authoritative combination of current lint, typecheck, build, and test gates.
- CI executes `pnpm check` after frozen installation.

No placeholder E2E configuration is added merely to make a command green.

### 7.2 Package task graph

- `lint` and `typecheck` continue to build upstream workspace dependencies.
- Reporter `test` depends on its own production build and upstream builds.
- The reporter E2E file stops rebuilding packages inside a default 10-second `beforeAll` hook.
- Package tests use the artifacts created by the declared task graph.
- Test tasks declare no output cache unless they actually produce a stable output directory.

### 7.3 Verification levels

1. Focused RED/GREEN tests for each behavior.
2. Affected package lint, typecheck, build, and tests.
3. Root `pnpm check` under Node 24.
4. Clean detached checkout with no package `dist` and cache bypass.
5. GitHub Actions on both push and pull request.
6. Independent read-only review of the cumulative remediation diff.

## 8. Identity and diagnostics

### 8.1 Reserved project sentinel

`<default>` remains the serialized name of one implicit unnamed Playwright project. A real Playwright project explicitly named `<default>` is rejected with a clear diagnostic. Multiple unnamed projects remain rejected.

### 8.2 Repository metadata helper

Manual `repository` and `revision` configuration is acknowledged as adoption friction. No helper is added in this remediation because environment resolution and fallback precedence belong to the next validated installation design.

The next design must consider `GITHUB_SHA`, `GITHUB_REPOSITORY`, local Git, detached heads, shallow clones, forks, repository renames, and explicit overrides before changing identity semantics.

The repository component remains part of provisional identity until a migration and collision analysis approves a change.

### 8.3 Diagnostics

Diagnostics emitted for source tests use configuration-relative POSIX paths where possible. Absolute output destinations may remain visible when required to diagnose filesystem write failures. No user home path is embedded in committed documentation.

`generatedAt` remains a truthful timestamp. Documentation describes inventories as deterministically ordered and identically identified for the same logical inputs, not byte-for-byte deterministic.

## 9. Open-source repository design

### 9.1 License

Use the unmodified Apache License, Version 2.0 text in root `LICENSE`, with an appropriate copyright notice.

The selection favors permissive organizational adoption and includes explicit patent-license terms. It does not guarantee trademark rights to the Proofline name or eliminate the need for legal review as the project becomes commercial.

### 9.2 Public repository hygiene

- Remove the tracked `.superpowers/.../task-3-report.md` internal process artifact.
- Keep `.superpowers/` ignored.
- Replace `/Users/ankora/...` commands in public documentation with portable Node 24 instructions.
- Ensure no credentials, customer data, private repository names, or workstation paths are committed.

### 9.3 README minimum

The README must state:

- what Proofline currently does;
- what it does not yet do;
- Node 24 and pnpm requirements;
- installation from the current repository/workspace state without pretending packages are published;
- minimal Playwright reporter configuration;
- the discovery command;
- output location and schema purpose;
- supported Playwright version;
- failure semantics and known limitations;
- development verification command;
- Apache-2.0 license;
- Phase 0 status and invitation for design partners.

`CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` remain public-launch requirements. They are not required to prove the current technical spike unless the repository begins accepting outside contributions before then.

## 10. PR trust contract

The PR description must:

- call prior reviews “internal read-only agent reviews”;
- state that they are not formal GitHub approvals;
- link live CI jobs where available;
- distinguish historical local verification from live GitHub verification;
- stop claiming one authoritative Phase 0 gate until the gate documents are reconciled;
- state that no customer demand, paid commitment, or OpenAI partnership is established.

## 11. Phase 0 validation gate design

### 11.1 Governing principle

Phase 0 must test demand and adoption risk without requiring the unbuilt recommendation engine. The benchmark moves to the phase that implements deterministic recommendation behavior.

### 11.2 Proposed bounded gate

The final numbers will be frozen in the implementation plan and will not change after the first interview without a written decision. Recommended starting gate:

- Maximum window: six weeks from the first interview.
- Additional product implementation before decision: only pilot-blocking fixes in this design.
- 12 qualified interviews with QA leads or engineering managers using Playwright and GitHub Actions.
- At least six of twelve interviewees rank green-but-unverified releases or affected-test selection among their top three release pains.
- Median current manual regression-planning and evidence-reporting effort is at least two hours per meaningful release.
- At least three workflow diaries from three different teams.
- At least three external unaided inventory installations completed in under one hour.
- At least two explicitly authorized repositories available for a manual selection-risk probe.
- Ten historical merged pull requests per repository assessed manually.
- At least three of the twenty PRs demonstrate a green-but-unverified condition to support frequency.
- At least two written design-partner commitments or one paid pilot/priced commitment.

### 11.3 Decision outcomes

`PROCEED` to a newly planned narrow slice only when:

- interview and diary targets are met;
- at least six interviewees rank the problem in their top three release pains and median current manual effort is at least two hours per meaningful release;
- at least three external installs succeed;
- the manual probe finds at least three green-but-unverified PRs out of twenty;
- at least two written design partners or one paid/priced commitment exists.

`NARROW` when the six-week window completes without a `PROCEED` or `STOP` result and at least one of these bounded signals exists: four or five interviewees rank the problem in their top three; median current effort is between one and two hours; exactly two external installs succeed; the probe finds exactly two green-but-unverified PRs; or teams consistently want only reporting, skip/flake visibility, or audit packets rather than enforcement. A new four-week gate must be written for that narrower job before implementation.

`STOP` when any of these occurs:

- the six-week window expires with fewer than two external installs and no written design partner;
- the probe finds at most one green-but-unverified PR out of twenty;
- after twelve interviews, fewer than four rank the problem in their top three or median current manual effort is below one hour per meaningful release;
- no buyer will discuss a price or pilot after the problem is demonstrated;
- teams report that metadata or maintenance cost is greater than the release effort saved.

Results must cite interview IDs, diary IDs, installation evidence, authorized repository aliases, redacted PR findings, and priced commitments. Compliments and GitHub stars do not count as behavioral commitment.

## 12. Data protection during validation

- Obtain explicit permission before running Proofline on any employer or client repository.
- Default to metadata-only collection.
- Redact organization, repository, source path, ticket, and test-title details when sharing validation evidence outside the authorized team.
- Do not commit client evidence to the public Proofline repository.
- Store raw interview and repository evidence only in an approved private location.
- Publish aggregated counts only when permissions allow.

## 13. Delivery sequence

### Stage 1 — PR remediation

Implement the scoped changes in Sections 5–10 using test-first slices and atomic commits. Re-run full clean verification and independent review. Keep PR #1 open until all merge blockers are closed.

### Stage 2 — Gate reconciliation

Update the product design, delivery program, implementation plan, and repository decision gate to refer to one Phase 0 definition. Move the recommendation benchmark to the recommendation-engine phase. Do not mix historical gate definitions with the new governing gate.

### Stage 3 — External validation

Execute interviews, diaries, installations, the manual historical-PR probe, and willingness-to-pay tests. Record evidence without fabricating or filling gaps by inference.

### Stage 4 — Decision

- `PROCEED`: write a new implementation design and plan only for the smallest validated pull-request evidence check.
- `NARROW`: rewrite the thesis and validate it before building.
- `STOP`: archive the product direction and preserve reusable technical components without further product spend.

## 14. Definition of done for this improvement program

The improvement program is complete only when:

1. PR #1's scoped technical and public-repository blockers are fixed and independently reviewed.
2. Root `pnpm check`, clean-checkout Node 24 verification, and GitHub CI pass.
3. Public documentation contains no workstation paths or internal process artifacts.
4. The repository contains Apache-2.0 licensing and an honest pilot README.
5. The four planning sources contain one non-circular Phase 0 gate.
6. The external gate has been executed with real evidence.
7. A documented `PROCEED`, `NARROW`, or `STOP` decision is made.

Passing items 1–5 does not satisfy items 6–7. Technical readiness and product validation remain separate verdicts.
