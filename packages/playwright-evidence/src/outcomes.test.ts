import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { deriveObservedOutcome } from './outcomes.js';
import { parsePlaywrightJson, type PlaywrightTest } from './playwright-json.js';

type AttemptStatus = PlaywrightTest['results'][number]['status'];

async function sigintTests(): Promise<Map<string, PlaywrightTest>> {
  const report = parsePlaywrightJson(
    JSON.parse(
      await readFile(
        new URL(
          '../../test-fixtures/fixtures/playwright-results/reports/sigint.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as unknown,
  );
  const tests = new Map<string, PlaywrightTest>();
  for (const suite of report.suites) {
    for (const spec of suite.specs) {
      const test = spec.tests[0];
      if (test !== undefined) {
        tests.set(spec.title, test);
      }
    }
  }
  return tests;
}

describe('deriveObservedOutcome', () => {
  it.each<
    [
      PlaywrightTest['status'],
      AttemptStatus[],
      PlaywrightTest['expectedStatus'],
      string,
    ]
  >([
    ['expected', ['passed'], 'passed', 'executed_as_expected'],
    ['expected', ['failed'], 'failed', 'executed_as_expected'],
    ['flaky', ['failed', 'passed'], 'passed', 'retry_masked'],
    ['unexpected', ['timedOut'], 'passed', 'failed'],
    ['unexpected', ['passed'], 'failed', 'failed'],
    ['skipped', ['skipped'], 'passed', 'runtime_skipped'],
    ['skipped', ['interrupted'], 'passed', 'incomplete'],
  ])(
    'classifies %s with attempts %j as %s evidence',
    (status, attempts, plannedExpectedStatus, expected) => {
      expect(
        deriveObservedOutcome(
          { status, attempts, plannedExpectedStatus },
          { reportInterrupted: attempts.includes('interrupted') },
        ),
      ).toBe(expected);
    },
  );

  it('classifies the captured in-flight skipped test as incomplete', async () => {
    const test = (await sigintTests()).get('in flight at signal');
    expect(test).toBeDefined();
    if (test === undefined) {
      return;
    }

    expect(test.status).toBe('skipped');
    expect(test.results.map((result) => result.status)).toEqual([
      'interrupted',
    ]);
    expect(
      deriveObservedOutcome(
        {
          status: test.status,
          attempts: test.results.map((result) => result.status),
          plannedExpectedStatus: 'passed',
        },
        { reportInterrupted: true },
      ),
    ).toBe('incomplete');
  });

  it('marks a zero-attempt active test incomplete when its report was interrupted', async () => {
    const test = (await sigintTests()).get('never started');
    expect(test).toBeDefined();
    if (test === undefined) {
      return;
    }

    expect(test.results).toEqual([]);
    expect(
      deriveObservedOutcome(
        {
          status: test.status,
          attempts: [],
          plannedExpectedStatus: 'passed',
        },
        { reportInterrupted: true },
      ),
    ).toBe('incomplete');
  });

  it('does not relabel a completed runtime skip after another test is interrupted', async () => {
    const test = (await sigintTests()).get('runtime skip before signal');
    expect(test).toBeDefined();
    if (test === undefined) {
      return;
    }

    expect(test.results.map((result) => result.status)).toEqual(['skipped']);
    expect(
      deriveObservedOutcome(
        {
          status: test.status,
          attempts: ['skipped'],
          plannedExpectedStatus: 'passed',
        },
        { reportInterrupted: true },
      ),
    ).toBe('runtime_skipped');
  });
});
