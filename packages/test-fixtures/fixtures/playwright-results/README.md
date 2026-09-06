# Playwright result fixture provenance

These reports were generated on 2026-09-06 with the repository's pinned
`@playwright/test` 1.62.1 dependency. The tests use no browser.

`reports/outcomes.json` came from:

```text
playwright test --config=playwright.config.ts tests/outcomes.spec.ts --reporter=json
```

The expected non-zero run produced expected pass/failure, unexpected pass,
terminal failure, timeout, runtime/static skip, and fail-then-pass retry cases.

`reports/sigint.json` came from `node capture-sigint.mjs <output-file>`. The
harness waits for the long-running test's `PROOFLINE_IN_FLIGHT` marker before
sending SIGINT. Playwright 1.62.1 produced:

| Test                       | Test status | Attempt statuses  |
| -------------------------- | ----------- | ----------------- |
| runtime skip before signal | `skipped`   | `['skipped']`     |
| in flight at signal        | `skipped`   | `['interrupted']` |
| never started              | `skipped`   | `[]`              |

Sanitization replaced absolute repository/consumer paths with `/workspace`,
the machine-specific Node executable with `/usr/local/bin/node`, and ISO
timestamps with `2026-01-01T00:00:00.000Z`. Top-level duration was set to `0`.
No outcome, identity, selection, or attempt fields were changed.

`tests/compile-sigint.spec.ts` and the conditional delay in
`playwright.config.ts` exercise the earlier interruption boundary. The harness
plans normally, then sets `PROOFLINE_DELAY_COMPILE=true` and sends SIGINT after
the config emits `PROOFLINE_COMPILING`. Playwright exits by signal before
creating the configured JSON report, so reconciliation must use the preserved
plan to classify the active test as `no_evidence`.
