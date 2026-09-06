# Proofline Completeness-First v0.1 Design

- **Status:** APPROVED DIRECTION — WRITTEN SPECIFICATION PENDING USER REVIEW
- **Date:** 2026-09-06
- **Target branch:** `feature/completeness-first-v0.1-design`
- **Product stage:** Open-source pilot
- **Primary surface:** GitHub Actions with Playwright
- **License:** Apache License 2.0

## 1. Executive decision

Proofline v0.1 will answer one narrow, provable question:

> Did every active Playwright test that this CI run planned produce trustworthy execution evidence?

It will not claim to know which tests _should_ protect a business change. Playwright's `--only-changed` option follows the JavaScript/TypeScript import graph; many end-to-end tests do not import the application code they protect. Treating that result as a semantic coverage oracle would create false confidence.

The product will therefore be a completeness check, not a test-selection engine. A required, always-running reconciliation job will compare a plan created before test execution with result artifacts created by every Playwright job or shard. Missing jobs, missing artifacts, incomplete results, runtime skips, and retry-masked passes will remain visible even when GitHub otherwise presents a green pull request.

This is a replacement for the previous broad release-intelligence thesis. Existing speculative policy, recommendation, and release-decision types are not part of v0.1.

## 2. Product assessment

### Good

- A completeness check is objective, explainable, and testable without AI.
- It catches a real GitHub Actions failure mode: a job skipped by a job-level condition reports success and can fail to block a merge.
- It fits existing Playwright and GitHub Actions workflows without moving test cases into another system.
- A local, open-source action creates trust and a credible path to paid retention and audit features later.

### Questionable

- Automatic change-to-test mapping is useful only when the repository's dependency graph represents business coverage. Proofline may expose it later as an explicitly labelled input, not as truth.
- Retry-masked results can indicate flakiness, infrastructure noise, or a product defect. v0.1 will expose them but will not fail a build on them by default.
- Willingness to pay for hosted history remains unproven. A price is a validation question, not a product fact.

### Bad

- Building a dashboard, policy engine, AI recommendation layer, database, or billing before recurring use is demonstrated.
- Requiring teams to annotate all tests with Proofline-specific IDs or business metadata.
- Calling absent execution evidence a passing test or merging it into a generic “green but unverified” bucket.
- Supporting end-of-life Node versions merely because the current code happens to run on them.

## 3. Target user, buyer, and job

### 3.1 Initial user

A QA lead, senior QA engineer, automation engineer, or release owner whose team runs Playwright in GitHub Actions, particularly with conditional jobs, matrices, or shards.

### 3.2 Buyer hypothesis

An engineering manager, Head of QA, or engineering/compliance leader who owns release risk and evidence retention. The buyer hypothesis is not considered validated until someone with budget authority discusses a paid pilot or subscription.

### 3.3 Job to be done

When Playwright CI completes, show whether the run produced evidence for every test it planned, distinguish the reason for every gap, and make the result available both to humans and automation.

### 3.4 Commercial boundary

The action and local reconciliation remain open source. A future paid service may add cross-repository history, longer retention, organization policy, audit export, and reviewer workflows. Those features are not authorized until the external validation gate succeeds.

## 4. Definitions and trust boundary

Proofline uses precise terms:

- **Plan:** the immutable set of Playwright test identities discovered for a specific repository revision, configuration, projects, filters, and shard topology before execution.
- **Active planned test:** a planned test whose resolved Playwright expected status is not `skipped`.
- **Planned disabled test:** a test resolved as skipped during planning. It is visible but not required to execute.
- **Observed evidence:** a terminal or partial test result found in a result artifact for the same revision and run.
- **Not executed:** a summary category containing active planned tests that are absent, runtime-skipped, incomplete, or covered by no usable result artifact.
- **Retry masked:** a test whose final outcome passes only after at least one earlier failed or timed-out attempt.
- **No evidence:** the test jobs produced no usable evidence for a required scope, such as a missing artifact or malformed report.
- **Unexpected:** an observed test identity that was not in the plan. This indicates mismatched filters, configuration, revision, or identity and is not silently accepted.

The plan represents what the workflow explicitly configured Playwright to run. It does not prove business coverage, requirement coverage, risk coverage, or correct test selection.

## 5. User experience

### 5.1 Workflow topology

```text
independent plan job
  -> emits one immutable plan artifact

Playwright job or matrix/shards
  -> each emits one result artifact, even after test failure

required reconciliation job (`if: always()`)
  -> downloads plan and all available result artifacts
  -> runs Proofline locally
  -> writes GitHub job summary and reconciliation JSON
  -> exits according to the selected policy
```

The plan must be created outside any condition that can skip the Playwright jobs. The reconciliation job must be required by branch protection and use `if: always()` with `needs` pointing to the plan and every test job. Proofline cannot compensate for a reconciliation job that the repository does not require.

### 5.2 Consumer contract

The public distribution unit is one bundled JavaScript action with three explicit operations:

- `plan`: discover tests and declare the result-producer topology before execution;
- `collect`: validate a Playwright JSON report and create one result envelope after a test job or shard;
- `reconcile`: compare the immutable plan with every available result envelope.

The operations live under one public action path and share schemas and identity code. A reconciliation step referenced by a release tag looks like:

```yaml
- name: Reconcile Playwright evidence
  if: always()
  uses: Ismet24f/proofline/check@v0.1.0
  with:
    operation: reconcile
    plan: artifacts/proofline-plan.json
    results: artifacts/results
    mode: report-only
```

The exact workflow example shipped with v0.1 will pin third-party actions to reviewed full commit SHAs. The Proofline release tag remains the ergonomic public reference; immutable SHA usage will also be documented for security-sensitive adopters.

Consumers do not install Proofline packages, use pnpm, publish metadata, or add Proofline annotations. Each operation reads or creates local artifacts and makes no network calls. GitHub's artifact actions transport those files between jobs.

### 5.3 Operating modes

- `report-only`: produce the full report and outputs; evidence gaps and unexpected tests do not fail the step. Internal tool errors still fail.
- `enforce-evidence`: fail when an active planned test is absent, runtime-skipped, incomplete, has no usable evidence, or results contain an unexpected test. Failed Playwright tests remain the test job's responsibility. Retry-masked passes are reported but do not fail v0.1.

`report-only` is the default for the external pilot. A team may opt into `enforce-evidence` after reviewing its own baseline.

## 6. Planning contract

### 6.1 Primary plan source

The plan job runs Playwright list discovery against the same revision, config file, projects, grep filters, and test arguments intended for execution. The `plan` operation captures the built-in Playwright JSON reporter output and normalizes it into `proofline-plan.json`.

For the common single-job case, `plan` creates one default producer from the supplied Playwright arguments. Matrix, shard, or multi-job workflows supply a small producer manifest. Each producer entry has a stable workflow-local ID, Playwright arguments, and shard total. The plan operation runs list discovery for every declared producer/shard combination and records the resulting expected topology. Producer IDs describe workflow jobs such as `e2e-chromium`; they are not global test identities.

Example logical manifest:

```json
{
  "producers": [
    { "id": "e2e", "playwrightArgs": ["--project=chromium"], "shards": 3 },
    { "id": "api", "playwrightArgs": ["--project=api"], "shards": 1 }
  ]
}
```

The implementation will define and validate this schema. A producer/shard plan is generated independently of the later job condition. The corresponding test job passes the same producer ID and one-based shard index to `collect`. A missing job then remains detectable because its producer/shard was already declared in the plan.

The plan records:

- schema version;
- repository and full revision;
- Playwright version;
- normalized selection arguments and config path;
- configured shard count, when applicable;
- discovery timestamp;
- active and disabled test identities;
- a digest over the normalized plan payload.

Repository and revision resolution follows this precedence:

1. explicit inputs;
2. `GITHUB_REPOSITORY` and `GITHUB_SHA` in GitHub Actions;
3. local Git remote/repository identity and `git rev-parse HEAD`;
4. a clear fatal error when trustworthy resolution is impossible.

A revision must resolve to a full lowercase 40-character commit SHA. Proofline does not accept an unresolved branch name as evidence identity.

### 6.2 Selection modes

v0.1 supports an explicit Playwright selection command as the authoritative mode. Full-suite discovery is the simplest default.

Playwright `--only-changed=<ref>` may be accepted as an experimental `dependency-affected` planning mode. Reports and summaries must display that label and this warning:

> Dependency-affected selection follows the test import graph and does not prove which tests should protect the business change.

Proofline will not market this mode as semantic test selection.

### 6.3 Plan invariants

- The plan and results must name the same repository and revision.
- Discovery failure produces no valid plan.
- Identity collisions are fatal and list every colliding source reference.
- A plan from one configuration or selection cannot be silently reconciled against another.
- Disabled planned tests remain visible but do not count as missing execution.
- The plan artifact must be uploaded even when it is empty; zero active tests is a visible state, not an absent artifact.

## 7. Result collection contract

### 7.1 Source

Each Playwright job or shard writes the built-in JSON reporter output to a unique local file. An `if: always()` step invokes the action's `collect` operation, which validates that report, creates a result envelope, and preserves partial evidence where Playwright emitted a readable report. A following `if: always()` upload step transports the envelope and report. Proofline v0.1 uses Playwright's built-in report rather than requiring the current unpublished custom reporter.

Each upload includes a small Proofline envelope containing:

- schema version;
- repository and full revision;
- GitHub run ID and attempt when available;
- logical job name;
- matrix/shard identity and configured total;
- report path and SHA-256 digest;
- collection timestamp.

`collect` requires the producer ID and shard index declared by the plan and records the plan digest. Artifact names must be unique per logical job and matrix/shard. Duplicate envelope identities are fatal. Passing a producer ID does not prove the test command used the declared arguments; identity reconciliation exposes resulting absences and unexpected tests, and the documentation states this trust boundary.

### 7.2 Expected artifact topology

The plan declares the expected logical result producers. Reconciliation verifies both test identities and producer completeness. If a whole job or shard is skipped, cancelled, crashes before upload, or uploads a malformed artifact, its expected producer is classified as `no_evidence` even if other shards are complete.

This producer check is essential: comparing only test identities could hide a missing shard when selection or identity data is itself incomplete.

### 7.3 Multiple reporters

The documented integration preserves a team's existing reporters by adding JSON output rather than replacing HTML, list, line, blob, or third-party reporters. Implementation must verify Playwright's supported multi-reporter configuration and output-file environment variables with real subprocess fixtures before the public example is finalized.

## 8. Identity model

v0.1 reconciles artifacts only within the same immutable revision and configured run. It does not promise identity continuity across commits.

The canonical test key is the normalized tuple:

```text
[projectName, repositoryRelativeFile, line, titlePath]
```

- Paths use POSIX separators and reject traversal outside the configured test root.
- The unnamed Playwright project uses a reserved sentinel that a real project may not claim.
- `titlePath` includes describe scopes and the test title.
- Exact duplicates are not deduplicated silently; collisions fail normalization.
- Explicit `PL-T-*` annotations are not required or privileged for v0.1 reconciliation.

Line numbers are acceptable because plan and results must come from the same commit. Cross-commit identity and churn measurement require separate evidence before they become product scope.

## 9. Reconciliation model

Each active planned test receives exactly one primary classification:

| Classification    | Meaning                                                    | Counts as evidence gap                    |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------- |
| `executed_clean`  | Passed on its first and only effective attempt             | No                                        |
| `retry_masked`    | Ultimately passed after a failed or timed-out attempt      | No, reported separately                   |
| `failed`          | Final effective result failed or timed out                 | No completeness gap; test job still fails |
| `runtime_skipped` | Active during planning but skipped during execution        | Yes                                       |
| `incomplete`      | Execution began but no valid terminal result exists        | Yes                                       |
| `absent`          | Identity exists in the plan but in no usable result report | Yes                                       |
| `no_evidence`     | Its required producer artifact is absent or unusable       | Yes                                       |

Additional non-primary records are:

- `planned_disabled`: resolved skipped during discovery and not expected to execute;
- `unexpected`: appears in results but not in the plan;
- `duplicate`: appears more than once where topology does not authorize it;
- `invalid`: violates schema, revision, digest, topology, or identity invariants.

Precedence prevents misleading precision:

1. An absent or invalid producer yields `no_evidence` for its required scope.
2. A malformed or contradictory test record is `invalid`, not guessed.
3. A valid partial record is `incomplete`.
4. Retry history is evaluated only when all attempts are valid and a terminal pass exists.

The reconciliation summary reports counts for every category. It never collapses `retry_masked` into `not_executed`.

## 10. Outputs

### 10.1 Machine-readable report

`proofline-reconciliation.json` includes:

- schema version and tool version;
- repository, revision, run identity, mode, and timestamps;
- plan digest and result artifact digests;
- expected, received, missing, duplicate, and invalid producers;
- one normalized record per planned test;
- unexpected result records;
- classification counts;
- final status: `complete`, `evidence_gaps`, or `tool_error`;
- exit-policy decision and reason codes.

Output is written atomically. A failure must not leave a stale report that looks current.

### 10.2 GitHub job summary

The summary leads with one of:

- `COMPLETE — all active planned tests produced terminal evidence`
- `EVIDENCE GAPS — N active planned tests lack trustworthy execution evidence`
- `TOOL ERROR — Proofline could not evaluate this run`

It then shows producer completeness, category counts, retry-masked tests, and a bounded list of affected identities with source locations. Large lists link to the JSON artifact rather than flooding the summary.

### 10.3 Action outputs

The action exposes at least:

- `status`;
- `planned-active`;
- `evidence-gaps`;
- `retry-masked`;
- `failed`;
- `unexpected`;
- `report-path`.

## 11. Security, privacy, and portability

- The action reads only declared local input paths and writes only its output directory and GitHub step summary.
- No source, test title, result, token, or telemetry leaves the runner.
- Inputs reject path traversal and symlink escapes outside the workspace unless an explicit safe root is configured.
- JSON parsing has file-size, nesting, string-length, and record-count bounds to avoid resource exhaustion from malformed artifacts.
- Error messages redact credentials and do not print environment variables wholesale.
- Consumer workflow permissions default to `contents: read`; artifact download/upload is performed by pinned GitHub-maintained actions, so Proofline itself does not require a GitHub token.
- Test titles and file paths may contain sensitive business information. Documentation calls this out and recommends repository-appropriate artifact retention.
- The bundled action supports Linux runners first. Parser and path normalization tests cover Windows paths; Windows runner support is not claimed until a real workflow passes.

## 12. Runtime and distribution

- Supported development/runtime versions: maintained Node 22 and Node 24 lines.
- CI runs clean, cache-bypassed checks on both Node 22 and Node 24.
- Node 20 is not supported because it is end-of-life, even though the current foundation can execute on it.
- The action is bundled so consumer repositories do not install Proofline dependencies.
- The release includes a generated dependency notice, source map policy, checksums, immutable Git tag, and release notes.
- No npm package is required for v0.1. Package publication will be considered only when a reusable CLI or reporter has proven external consumers.

## 13. Repository and model changes

Before the v0.1 pilot:

- Replace stale README and repository wording with the completeness-first contract.
- Describe the product as an open-source Playwright evidence completeness check, not broad release intelligence.
- Remove or archive speculative `RegressionPlan`, recommendation, policy-violation, evidence-assertion, and release-decision exports from the public model.
- Retain inventory code only where it directly supports plan normalization; do not expose unpublished packages as a consumer installation path.
- Replace manual repository/revision configuration with the resolution precedence in this specification.
- Separate retry-masked evidence from not-executed evidence in schemas and documentation.
- Support Node 22 and Node 24 in `engines` and CI.
- Add action metadata, bundled output, workflow examples, security guidance, contribution guidance, and a narrow public roadmap.

Because no package has been published and no compatibility promise exists, v0.1 may make breaking schema changes. Every artifact must still carry a schema version, and incompatible versions fail clearly rather than being coerced.

## 14. Error handling

Proofline distinguishes product findings from tool failures.

Product findings include missing producers, absent tests, runtime skips, incomplete results, retries, failures, and unexpected tests. They always produce a valid report.

Tool failures include unreadable inputs, schema violations, digest mismatch, revision mismatch, identity collision, unsupported Playwright shape, and atomic write failure. They return non-zero in every mode and must not be represented as an evidence-gap result.

Errors name the artifact and violated invariant without printing an entire potentially sensitive payload.

## 15. Verification strategy

Implementation is accepted only with executable evidence for:

1. Clean pass with one job.
2. Clean pass with multiple projects and shards.
3. Entire test job skipped while GitHub marks that job successful.
4. One shard missing its artifact.
5. Upload step reached after Playwright failure.
6. Active planned test absent from results.
7. Planned disabled test correctly excluded from required execution.
8. Runtime skip distinguished from planned disabled.
9. First-attempt pass distinguished from retry-masked pass.
10. Terminal failure and timeout preserved without becoming completeness gaps.
11. Cancelled or interrupted execution classified incomplete or no-evidence according to artifact state.
12. Unexpected and duplicate tests detected.
13. Malformed, oversized, mismatched-revision, and digest-invalid artifacts rejected.
14. Same inputs produce deterministic ordering and identities.
15. POSIX and Windows path normalization fixtures.
16. Existing Playwright reporters continue to work alongside JSON output.
17. Consumer fixture requires no Proofline package installation.
18. `report-only` and `enforce-evidence` exit behavior.
19. GitHub summary and outputs match the JSON counts.
20. Clean cache-bypassed Node 22 and Node 24 CI.

Unit tests are appropriate for pure parsers and schemas, but they are insufficient alone. Playwright subprocess fixtures and real GitHub Actions workflows must prove the external contract.

## 16. Delivery sequence

### Phase A — make public truth match the product

- Update product language, runtime support, and schemas.
- Remove speculative surface area.
- Establish normalized plan, result-envelope, and reconciliation contracts.
- Preserve the current green baseline while making deliberate breaking changes explicit.

### Phase B — build the vertical slice

- Implement plan capture and normalization.
- Implement result envelope collection.
- Implement deterministic reconciliation and both operating modes.
- Bundle the GitHub Action and create one copy-paste consumer workflow.
- Prove all acceptance scenarios in fixtures and live CI.

### Phase C — dogfood safely

- Run in `report-only` mode on Proofline and authorized repositories.
- Compare reports with raw workflow and Playwright evidence.
- Fix false classifications before recruiting external pilots.
- Release immutable `v0.1.0` only after the action works from a clean consumer repository.

### Phase D — run the external pilot

- Install on three authorized external repositories.
- Observe for 30 days without changing thresholds after seeing results.
- Record customer confirmation for real catches and false positives.
- Test retention and willingness to pay before building hosted infrastructure.

## 17. External validation gate

### 17.1 Preflight before the 30-day clock

- Eight qualified interview bookings are scheduled.
- Three repository owners authorize a `report-only` installation.
- Owners agree which workflows and pull requests may be observed.
- No production secrets, customer payloads, or unauthorized repositories enter the study.

If preflight is not met, recruitment continues; this is not yet evidence that the product problem is false.

### 17.2 Required observations

- At least 8 qualified interviews.
- At least 4 interviewees independently rank missing or misleading test-execution evidence among their top three release problems.
- 3 external repositories complete installation.
- At least 60 pull requests are observed across those repositories.
- At least 3 customer-confirmed `not_executed` cases occur across at least 2 teams.
- At least 1 team voluntarily keeps the action after the pilot.
- At least 1 budget-authority conversation tests a concrete `$99 per repository per month` hypothesis for retained history and audit export.

The price is a probe. Agreement, rejection, and counteroffer are all recorded verbatim; none is converted into revenue evidence without a paid commitment.

### 17.3 Outcomes

- **PROCEED:** all required observations pass, classifications are trusted, and continued use is voluntary.
- **NARROW:** the problem is confirmed but the useful scope, user, workflow, or buyer differs materially; rewrite the thesis before further build-out.
- **STOP:** qualified users do not rank the problem highly, confirmed catches do not occur, or teams remove the action because it provides insufficient value.
- **INCONCLUSIVE:** recruitment, authorization, or sample volume fails despite the preflight rules. Extend recruitment or change the channel without claiming product validation.

No fake evidence, internal-only installations, retrospective threshold changes, or agent opinions count toward the gate.

## 18. Success, failure, and investment criteria

Technical success is a low-friction action that correctly distinguishes complete evidence, absent execution, runtime skips, interrupted runs, and retry-masked passes.

Product success is repeated customer-confirmed catches with voluntary retention. Commercial success begins only with budget-owner demand or payment for a hosted outcome.

The next independent “Shark Tank” review should recommend investment only if the 30-day gate provides:

- usage in at least five repositories, including the three external pilot repositories;
- three or more confirmed catches across at least two teams;
- credible evidence that teams trust the classifications;
- one paid pilot or an equivalent signed commercial commitment.

Until then, the honest verdict is **promising, not proven**. Engineering quality alone is not market validation.

## 19. Non-goals for v0.1

- Semantic change-to-test recommendations.
- Requirement, risk, or capability mapping.
- AI-generated release decisions.
- A release `PASS` or `HOLD` policy engine.
- Hosted API, database, dashboard, billing, or authentication.
- Jira, Qase, TestRail, Slack, or email integrations.
- Cross-commit identity guarantees and historical analytics.
- Flaky-test quarantine or automatic retry policy.
- Browser trace, video, screenshot, or test-result hosting.
- Compliance certification or claims that Proofline makes a release safe.

## 20. Risks and mitigations

| Risk                                              | Mitigation                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Teams confuse the plan with business coverage     | Use “planned,” never “should have run”; label dependency-affected mode prominently |
| Plan and execution use different filters          | Persist normalized configuration and selection; reject mismatches                  |
| Missing shard is hidden by other results          | Validate producer topology before test-level reconciliation                        |
| Action creates workflow complexity                | Ship one bundled action and one copy-paste example; measure installation time      |
| JSON reporter changes between Playwright versions | Pin and test a supported range; fail unknown shapes clearly                        |
| Retry policy causes arguments                     | Report separately; do not block on retry-masked in v0.1                            |
| Artifact data exposes test names                  | No upload; document retention and sensitivity                                      |
| False positives destroy trust                     | Start report-only; require raw-evidence confirmation during dogfood                |
| Broad roadmap returns too early                   | External gate authorizes hosted or semantic features, not enthusiasm               |

## 21. Resolved design decisions

- The first product is a completeness check, not a recommendation engine.
- The plan is workflow-configured intent, not semantic business truth.
- Planning runs independently before conditionally executed test jobs.
- Reconciliation is an always-running required job.
- Built-in Playwright JSON is the initial evidence source.
- Producer topology and test identities are both reconciled.
- Retry-masked and not-executed are separate categories.
- Explicit Proofline test IDs are not required.
- GitHub context and local Git replace manual metadata where trustworthy.
- Node 22 and Node 24 are supported; Node 20 is not.
- v0.1 is distributed as a bundled GitHub Action, without npm publication.
- The external validation window is 30 days after recruitment preflight.
- Hosted development waits for demonstrated retention and commercial demand.

## 22. Authoritative references

- [Playwright command-line options, including `--list`, `--only-changed`, projects, grep, and shards](https://playwright.dev/docs/test-cli)
- [Playwright reporters and multiple-reporter configuration](https://playwright.dev/docs/test-reporters)
- [GitHub Actions conditions and skipped-job behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Node.js release schedule](https://github.com/nodejs/release#release-schedule)

## 23. Approval boundary

Approval of this specification authorizes implementation planning only. It does not authorize hosted infrastructure, package publication, billing, external repository installation, or public claims of market validation.

After the user reviews and approves this written specification, the next step is a goal-backward implementation plan with small tasks, explicit tests, exact files, and review checkpoints. Implementation begins only after that plan is accepted.
