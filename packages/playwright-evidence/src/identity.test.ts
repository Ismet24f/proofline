import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { flattenPlaywrightTests } from './identity.js';
import { parsePlaywrightJson } from './playwright-json.js';

async function fixture(name: string) {
  return parsePlaywrightJson(
    JSON.parse(
      await readFile(
        new URL(`./__fixtures__/${name}`, import.meta.url),
        'utf8',
      ),
    ) as unknown,
  );
}

describe('flattenPlaywrightTests', () => {
  it('preserves active and disabled identities from real list output', async () => {
    const tests = flattenPlaywrightTests(
      await fixture('playwright-1.62-list-project-chromium.json'),
    );

    expect(
      tests.filter((test) => test.expectedStatus !== 'skipped'),
    ).not.toHaveLength(0);
    expect(
      tests.every((test) => test.identity.playwrightTestId.length > 0),
    ).toBe(true);
    expect(new Set(tests.map((test) => test.identity.key)).size).toBe(
      tests.length,
    );
    expect(
      tests.find((test) => test.identity.titlePath.at(-1) === 'disabled')
        ?.expectedStatus,
    ).toBe('skipped');
  });

  it('keeps repeat-each executions distinct despite identical source tuples', async () => {
    const tests = flattenPlaywrightTests(
      await fixture('playwright-1.62-list-repeat-each-2.json'),
    );
    const repeated = tests.filter(
      (test) => test.identity.titlePath.at(-1) === 'passes',
    );

    expect(repeated).toHaveLength(2);
    expect(
      new Set(repeated.map((test) => test.identity.playwrightTestId)).size,
    ).toBe(2);
    expect(new Set(repeated.map((test) => test.identity.key)).size).toBe(2);
    expect(
      new Set(
        repeated.map(
          (test) =>
            `${test.identity.file}:${String(test.identity.line)}:${String(test.identity.column)}`,
        ),
      ).size,
    ).toBe(1);
  });

  it('rejects duplicate canonical identities and names their source locations', async () => {
    const report = structuredClone(
      await fixture('playwright-1.62-list-project-chromium.json'),
    );
    const specs = report.suites[0]?.specs;
    if (specs?.[0] === undefined || specs[1] === undefined) {
      throw new Error('fixture must contain two specs');
    }
    specs[1].id = specs[0].id;

    expect(() => flattenPlaywrightTests(report)).toThrow(
      /duplicate Playwright identity.*outcomes\.spec\.ts:3:1.*outcomes\.spec\.ts:7:1/u,
    );
  });

  it('normalizes an unnamed project to the reserved default partition', async () => {
    const report = structuredClone(
      await fixture('playwright-1.62-list-project-chromium.json'),
    );
    const test = report.suites[0]?.specs[0]?.tests[0];
    if (test === undefined) {
      throw new Error('fixture must contain a test');
    }
    test.projectName = '';

    expect(flattenPlaywrightTests(report)[0]?.identity.projectName).toBe(
      '<default>',
    );
  });

  it('rejects a test file that escapes the recorded root directory', async () => {
    const report = structuredClone(
      await fixture('playwright-1.62-list-project-chromium.json'),
    );
    const spec = report.suites[0]?.specs[0];
    if (spec === undefined) {
      throw new Error('fixture must contain a spec');
    }
    spec.file = '../outside.spec.ts';

    expect(() => flattenPlaywrightTests(report)).toThrow(
      'test file escapes rootDir: ../outside.spec.ts',
    );
  });
});
