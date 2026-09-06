import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parsePlaywrightJson } from './playwright-json.js';
import {
  buildSelectionDescriptor,
  diffProducerSelection,
  diffReportSelection,
  diffSelection,
} from './selection.js';

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

const producer = { id: 'e2e', shard: { current: 1, total: 1 } } as const;

describe('buildSelectionDescriptor', () => {
  it('records the CLI project selector without inferring it from configured projects', async () => {
    const selection = buildSelectionDescriptor(
      await fixture('playwright-1.62-list-project-chromium.json'),
      '/workspace',
      producer,
    );

    expect(selection.configuredProjects).toEqual(['chromium', 'firefox']);
    expect(selection.cli).toContain('--project=chromium');
    expect(selection.cli).not.toContain('--list');
    expect(
      selection.cli.every((argument) => !argument.startsWith('--config')),
    ).toBe(true);
    expect(
      selection.cli.every((argument) => !argument.startsWith('--reporter')),
    ).toBe(true);
  });

  it('uses the real list-mode shard metadata', async () => {
    const selection = buildSelectionDescriptor(
      await fixture('playwright-1.62-list-shard-1-of-2.json'),
      '/workspace',
      { id: 'e2e', shard: { current: 1, total: 2 } },
    );

    expect(selection.shard).toEqual({ current: 1, total: 2 });
    expect(
      selection.cli.every((argument) => !argument.startsWith('--shard')),
    ).toBe(true);
  });
});

describe('diffSelection', () => {
  it('treats split and equals-form selection arguments as equivalent', async () => {
    const report = structuredClone(
      await fixture('playwright-1.62-list-project-chromium.json'),
    );
    const equalsForm = buildSelectionDescriptor(report, '/workspace', producer);
    const projectIndex = report.config.argv.indexOf('--project=chromium');
    const splitArguments = [...report.config.argv];
    splitArguments.splice(projectIndex, 1, '--project', 'chromium');
    const splitForm = buildSelectionDescriptor(
      { ...report, config: { ...report.config, argv: splitArguments } },
      '/workspace',
      producer,
    );

    expect(diffSelection(equalsForm, splitForm)).toEqual({ status: 'match' });
  });

  it('rejects missing observed shard metadata for a multi-shard producer', async () => {
    const report = structuredClone(
      await fixture('playwright-1.62-list-shard-1-of-2.json'),
    );
    const planned = buildSelectionDescriptor(report, '/workspace', {
      id: 'e2e',
      shard: { current: 1, total: 2 },
    });
    report.config.shard = null;

    expect(
      diffReportSelection(planned, report, '/workspace', {
        id: 'e2e',
        shard: { current: 1, total: 2 },
      }),
    ).toEqual({
      status: 'mismatch',
      differences: [
        {
          field: 'shard',
          planned: '{"current":1,"total":2}',
          actual: 'null',
        },
      ],
    });
  });

  it('allows producer plans to differ only by shard.current', async () => {
    const shardOne = buildSelectionDescriptor(
      await fixture('playwright-1.62-list-shard-1-of-2.json'),
      '/workspace',
      { id: 'e2e', shard: { current: 1, total: 2 } },
    );

    expect(
      diffProducerSelection(shardOne, {
        ...shardOne,
        shard: { current: 2, total: 2 },
      }),
    ).toEqual({ status: 'match' });
  });

  it('rejects different CLI project selection across one producer', async () => {
    const shardOne = buildSelectionDescriptor(
      await fixture('playwright-1.62-list-shard-1-of-2.json'),
      '/workspace',
      { id: 'e2e', shard: { current: 1, total: 2 } },
    );

    expect(
      diffProducerSelection(shardOne, {
        ...shardOne,
        shard: { current: 2, total: 2 },
        cli: [...shardOne.cli, '--project=firefox'],
      }),
    ).toMatchObject({
      status: 'mismatch',
      differences: [expect.objectContaining({ field: 'cli' })],
    });
  });
});
