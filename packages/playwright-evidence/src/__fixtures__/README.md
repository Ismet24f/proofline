# Playwright 1.62.1 fixture provenance

These reports were produced on 2026-09-06 from
`packages/test-fixtures/fixtures/playwright-basic` with the repository's exact
`@playwright/test` 1.62.1 lockfile dependency. They are captured reporter
output, not hand-authored approximations.

Commands, run from a temporary consumer copy with local dependencies:

```text
playwright test --list --reporter=json --config=playwright.config.ts --project=chromium --shard=1/2
playwright test --list --reporter=json --config=playwright.config.ts --project=chromium
playwright test --list --reporter=json --config=playwright.config.ts --project=chromium --repeat-each=2
```

`PLAYWRIGHT_JSON_OUTPUT_FILE` named each destination. Sanitization was limited
to replacing the absolute consumer prefix with `/workspace`, replacing the
machine-specific Node executable with `/usr/local/bin/node`, and fixing
`stats.startTime`/`stats.duration` to `2026-01-01T00:00:00.000Z`/`0`.
