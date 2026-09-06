import { isAbsolute, relative, resolve, sep } from 'node:path';

import type {
  ProducerRef,
  SelectionCheck,
  SelectionDescriptor,
  SelectionDifference,
} from '@proofline/evidence-model';

import { normalizeSelectionArgv } from './arguments.js';
import type { PlaywrightJsonReport } from './playwright-json.js';

function repositoryRelative(workspace: string, path: string): string {
  const absolute = isAbsolute(path) ? path : resolve(workspace, path);
  const result = relative(workspace, absolute);
  if (result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result)) {
    throw new Error(`Playwright path escapes workspace: ${path}`);
  }
  return result === '' ? '.' : result.split(sep).join('/');
}

function commandArguments(argv: readonly string[]): readonly string[] {
  const testIndex = argv.indexOf('test');
  return testIndex === -1 ? argv : argv.slice(testIndex + 1);
}

export function buildSelectionDescriptor(
  report: PlaywrightJsonReport,
  workspace: string,
  producer: ProducerRef,
): SelectionDescriptor {
  const reportShard = report.config.shard ?? producer.shard;
  return {
    configFile: repositoryRelative(workspace, report.config.configFile),
    rootDir: repositoryRelative(workspace, report.config.rootDir),
    playwrightVersion: report.config.version,
    shard: reportShard,
    cli: normalizeSelectionArgv(commandArguments(report.config.argv)),
    configuredProjects: report.config.projects.map((project) =>
      project.name === '' ? '<default>' : project.name,
    ),
  };
}

export function diffSelection(
  planned: SelectionDescriptor,
  actual: SelectionDescriptor,
): SelectionCheck {
  const differences: SelectionDifference[] = [];
  for (const field of [
    'configFile',
    'rootDir',
    'playwrightVersion',
    'shard',
    'cli',
    'configuredProjects',
  ] as const) {
    const plannedValue = JSON.stringify(planned[field]);
    const actualValue = JSON.stringify(actual[field]);
    if (plannedValue !== actualValue) {
      differences.push({ field, planned: plannedValue, actual: actualValue });
    }
  }
  return differences.length === 0
    ? { status: 'match' }
    : { status: 'mismatch', differences };
}

export function diffReportSelection(
  planned: SelectionDescriptor,
  report: PlaywrightJsonReport,
  workspace: string,
  producer: ProducerRef,
): SelectionCheck {
  if (report.config.shard === null && producer.shard.total > 1) {
    return {
      status: 'mismatch',
      differences: [
        {
          field: 'shard',
          planned: JSON.stringify(planned.shard),
          actual: 'null',
        },
      ],
    };
  }
  return diffSelection(
    planned,
    buildSelectionDescriptor(report, workspace, producer),
  );
}

export function diffProducerSelection(
  baseline: SelectionDescriptor,
  candidate: SelectionDescriptor,
): SelectionCheck {
  return diffSelection(
    {
      ...baseline,
      shard: { current: 1, total: baseline.shard.total },
    },
    {
      ...candidate,
      shard: { current: 1, total: candidate.shard.total },
    },
  );
}
