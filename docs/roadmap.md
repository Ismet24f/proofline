# Proofline Roadmap

Proofline advances only when evidence authorizes the next stage. The technical
release candidate is not proof of demand.

## Stage 1 — v0.1 local completeness

Deliver and independently review the open-source, local-only GitHub Action.
It plans, collects, and reconciles Playwright 1.62.x evidence without a token,
network service, or consumer package installation. Release `v0.1.0` only after
the checklist below is complete and the user explicitly approves release.

## Stage 2 — 30-day pilot

After release approval and all preflight conditions in the
[decision gate](validation/decision-gate.md) are met, run the frozen pilot in
report-only mode. Only pilot-blocking correctness, compatibility, security, or
summary-noise fixes are authorized during the window. The market verdict stays
**promising, not proven** until the gate is complete.

## Stage 3 — hosted-history design only after PROCEED

Only a `PROCEED` result authorizes design exploration for retained history and
audit export. It does not authorize hosted implementation, billing, or market
claims. A new reviewed specification and security/privacy model are required
before any hosted code.

## Explicit v0.1 non-goals

- `--only-changed` planning mode
- Semantic change-to-test recommendations
- Requirement, risk, or capability mapping
- AI release decisions
- A `PASS`/`HOLD` policy engine
- Hosted API, database, dashboard, billing, or authentication
- Jira, Qase, TestRail, or Slack integrations
- Cross-commit identity or history
- Test-level naming for fully skipped jobs through prior-plan lookup
- Flaky quarantine or retry policy
- Trace, video, or screenshot hosting
- Windows runner support
- npm publication
- Compliance claims

## v0.1.0 release-candidate checklist

- [x] Node 22 lint, typecheck, build, and tests pass on the candidate branch.
- [x] Node 24 lint, typecheck, build, and tests pass on the candidate branch.
- [x] The committed `check/dist` bundle is deterministic.
- [x] A consumer with no Proofline package installation passes from the bundled action.
- [x] Live CI run recorded: <https://github.com/Ismet24f/proofline/actions/runs/34033737310>.
- [x] Live adversarial self-test recorded: <https://github.com/Ismet24f/proofline/actions/runs/34033737327>.
- [x] Bundled dependency inventory and `THIRD_PARTY_NOTICES.md` are generated and verified.
- [ ] Independent code and security review has no unresolved release blocker.
- [ ] Create immutable `v0.1.0` only from the reviewed, green merge commit.
- [ ] Generate and publish SHA-256 checksums for the release source archive and bundled action.
- [ ] Move floating `v0.1` to the exact approved `v0.1.0` commit only after checksum verification.
- [ ] User explicitly approves release and pilot activation.

The `v0.1.0` and `v0.1` tags are plans only. **No tag is created in this task.**
