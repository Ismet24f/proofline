# ADR 0002: Completeness-first v0.1

**Status:** ACCEPTED
**Date:** 2026-09-06

## Context

Proofline's Phase 0 repository modeled test recommendations, evidence assertions, policies, and release verdicts before customer demand or trustworthy execution reconciliation existed. That scope implied decisions the product could not yet prove and delayed the smallest useful workflow.

Playwright and GitHub Actions already expose job results and test reports, but a green workflow can still hide a skipped job, a missing matrix shard, a runtime skip, a partial run, selection drift, or a malformed report. The v0.1 product needs to answer one narrower question: did every active Playwright test planned by this CI run produce trustworthy execution evidence?

## Decision

Build one open-source, local-only GitHub Action with `plan`, `collect`, and `reconcile` operations. The action reads Playwright's JSON output, validates every declared producer and shard, and classifies execution evidence deterministically. It makes no business-coverage, affected-test, release-safety, or hosted-service claim.

Remove the speculative recommendation, changed-file, evidence-assertion, policy-violation, and release-decision contracts from the public evidence-model API. Keep the current `TestInventory` and `TestDefinition` contracts only while ADR 0001's unpublished reporter remains an internal migration dependency; Task 8 removes that path after the replacement action is proven.

Support Node 22 and 24, refuse Node 20, and verify both supported majors in CI. Consumer integration requires no Proofline package, token, network call, or Proofline-specific test annotation.

## Consequences

- The public scope is smaller and directly testable.
- Missing or contradictory evidence fails closed; it is never converted into success.
- Existing Phase 0 recommendation and release-decision code remains available in Git history, not in an archive directory or compatibility wrapper.
- The open-source action may support paid retained-history design only after the external validation gate returns an independently chronology-verified `PROCEED`; implementation still requires a new reviewed specification and security/privacy model.
- Playwright versions outside the behavior-tested range remain unsupported until the compatibility matrix passes.

## Supersedes

This ADR supersedes all earlier Proofline product theses, recommendation-engine plans, release-policy plans, and validation gates. ADR 0001 remains historical authority only for the reporter code during migration and will be marked superseded when that code is removed in Task 8.
