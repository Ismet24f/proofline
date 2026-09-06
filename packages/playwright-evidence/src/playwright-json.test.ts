import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parsePlaywrightJson } from './playwright-json.js';

interface MutableRawReport {
  config: Record<string, unknown> & { version: unknown };
  suites: Array<{
    specs: Array<{
      id?: unknown;
      tests: Array<Record<string, unknown> & { results?: unknown[] }>;
    }>;
  }>;
}

async function rawFixture(): Promise<MutableRawReport> {
  return JSON.parse(
    await readFile(
      new URL(
        './__fixtures__/playwright-1.62-list-shard-1-of-2.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as MutableRawReport;
}

function firstSpec(report: MutableRawReport) {
  const spec = report.suites[0]?.specs[0];
  if (spec === undefined) {
    throw new Error('fixture must contain a spec');
  }
  return spec;
}

function firstTest(report: MutableRawReport) {
  const test = firstSpec(report).tests[0];
  if (test === undefined) {
    throw new Error('fixture must contain a test');
  }
  return test;
}

describe('parsePlaywrightJson', () => {
  it('accepts the captured Playwright 1.62.1 shard report', async () => {
    const report = parsePlaywrightJson(await rawFixture());

    expect(report.config.version).toBe('1.62.1');
    expect(report.config.shard).toEqual({ current: 1, total: 2 });
  });

  it('rejects Playwright versions outside the verified 1.62.x range', async () => {
    const raw = await rawFixture();
    raw.config.version = '1.63.0';

    expect(() => parsePlaywrightJson(raw)).toThrow(
      'unsupported Playwright version: 1.63.0; expected 1.62.x',
    );
  });

  it.each([
    ['config.argv', (raw: MutableRawReport) => delete raw.config.argv],
    ['config.shard', (raw: MutableRawReport) => delete raw.config.shard],
    [
      'config.configFile',
      (raw: MutableRawReport) => delete raw.config.configFile,
    ],
    ['config.rootDir', (raw: MutableRawReport) => delete raw.config.rootDir],
    [
      'report.suites[0].specs[0].id',
      (raw: MutableRawReport) => {
        delete firstSpec(raw).id;
      },
    ],
    [
      'report.suites[0].specs[0].tests[0].expectedStatus',
      (raw: MutableRawReport) => {
        delete firstTest(raw).expectedStatus;
      },
    ],
    [
      'report.suites[0].specs[0].tests[0].projectName',
      (raw: MutableRawReport) => {
        delete firstTest(raw).projectName;
      },
    ],
    [
      'report.suites[0].specs[0].tests[0].results',
      (raw: MutableRawReport) => {
        delete firstTest(raw).results;
      },
    ],
    [
      'report.suites[0].specs[0].tests[0].status',
      (raw: MutableRawReport) => {
        delete firstTest(raw).status;
      },
    ],
  ])('rejects a missing required %s field', async (path, mutate) => {
    const raw = await rawFixture();
    mutate(raw);

    expect(() => parsePlaywrightJson(raw)).toThrow(path);
  });

  it.each([
    ['expectedStatus', 'future', 'expectedStatus'],
    ['status', 'future', 'status'],
  ])('rejects an unknown test %s', async (field, value, path) => {
    const raw = await rawFixture();
    firstTest(raw)[field] = value;

    expect(() => parsePlaywrightJson(raw)).toThrow(path);
  });

  it('rejects an unknown result status', async () => {
    const raw = await rawFixture();
    firstTest(raw).results = [{ status: 'future' }];

    expect(() => parsePlaywrightJson(raw)).toThrow('results[0].status');
  });

  it('rejects the reserved literal default project name', async () => {
    const raw = await rawFixture();
    firstTest(raw).projectName = '<default>';

    expect(() => parsePlaywrightJson(raw)).toThrow(
      'uses reserved project name <default>',
    );
  });

  it.each([
    ['expected', 'passed', [], 'exactly one result'],
    ['expected', 'passed', [{ status: 'failed' }], 'must match expectedStatus'],
    [
      'expected',
      'passed',
      [{ status: 'passed' }, { status: 'passed' }],
      'exactly one result',
    ],
    ['flaky', 'passed', [{ status: 'passed' }], 'at least two results'],
    [
      'flaky',
      'passed',
      [{ status: 'failed' }, { status: 'failed' }],
      'final result must match expectedStatus',
    ],
    [
      'flaky',
      'passed',
      [{ status: 'passed' }, { status: 'passed' }],
      'must contain an earlier unexpected result',
    ],
    [
      'flaky',
      'passed',
      [{ status: 'skipped' }, { status: 'passed' }],
      'does not match Playwright-computed status expected',
    ],
    [
      'flaky',
      'passed',
      [{ status: 'interrupted' }, { status: 'passed' }],
      'does not match Playwright-computed status expected',
    ],
    [
      'flaky',
      'failed',
      [{ status: 'skipped' }, { status: 'failed' }],
      'does not match Playwright-computed status expected',
    ],
    [
      'expected',
      'passed',
      [{ status: 'failed' }, { status: 'passed' }],
      'exactly one result',
    ],
    [
      'flaky',
      'passed',
      [{ status: 'passed' }, { status: 'failed' }],
      'final result must match expectedStatus',
    ],
    ['unexpected', 'passed', [], 'at least one result'],
    [
      'unexpected',
      'passed',
      [{ status: 'passed' }],
      'final result must differ from expectedStatus',
    ],
    [
      'skipped',
      'passed',
      [{ status: 'passed' }],
      'unsupported result sequence',
    ],
  ])(
    'rejects contradictory %s / %s evidence with results %j',
    async (status, expectedStatus, results, message) => {
      const raw = await rawFixture();
      Object.assign(firstTest(raw), { status, expectedStatus, results });

      expect(() => parsePlaywrightJson(raw)).toThrow(message);
    },
  );
});
