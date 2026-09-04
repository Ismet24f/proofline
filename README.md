# Proofline

Proofline currently generates a schema-valid inventory of a Playwright suite through `playwright test --list`. It is Phase 0 source code for design partners: it does **not** recommend affected tests, reconcile execution results, provide a hosted service, or automate release verdicts.

## Requirements

- Node 24
- pnpm 10
- Playwright 1.62.1

## Run from the source workspace

The packages in this repository are not yet published. Install and use the source workspace; this is not an npm consumer installation flow.

```sh
git clone https://github.com/Ismet24f/proofline.git
cd proofline
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Add the required Proofline metadata to your Playwright configuration. `repository` must be a non-empty, trimmed string and `revision` must be a lowercase, 40-character hexadecimal revision.

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  metadata: {
    proofline: {
      repository: 'your-org/your-repository',
      revision: '0123456789abcdef0123456789abcdef01234567',
    },
  },
});
```

Run discovery from the directory containing that configuration. The reporter can be provided on the command line:

```sh
pnpm exec playwright test --list --reporter=@proofline/playwright-reporter
```

Or configure it in `playwright.config.ts`:

```ts
reporter: [['@proofline/playwright-reporter', { outputFile: '.proofline/inventory.json' }]],
```

Without an `outputFile` override, the reporter writes `.proofline/inventory.json` beneath the configuration directory. A relative `outputFile` is also resolved from that directory.

For a first-run check against the included workspace example, run from the repository root:

```sh
pnpm --dir examples/playwright-demo exec playwright test --list --reporter=@proofline/playwright-reporter
```

The command lists tests only; it does not execute browser test bodies. Discovery is fatal and produces no inventory when required metadata is missing or invalid, annotations are malformed, test IDs are invalid or conflict, or project naming is ambiguous. Explicit test IDs use `proofline.id` with the `PL-T-` prefix and at least five digits. The reporter captures static skip state only when Playwright lists a test as skipped; it does not discover runtime conditional skips.

## Development verification

From the repository root, run:

```sh
pnpm check
```

If you are evaluating Phase 0 as a design partner, feedback on the inventory shape and discovery failure messages is welcome. This invitation does not imply active adoption or a production commitment.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
