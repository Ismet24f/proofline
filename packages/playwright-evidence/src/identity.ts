import { isAbsolute, relative, resolve, sep } from 'node:path';

import type {
  PlannedExpectedStatus,
  TestIdentity,
} from '@proofline/evidence-model';

import type {
  PlaywrightJsonReport,
  PlaywrightSpec,
  PlaywrightTest,
} from './playwright-json.js';

export interface NormalizedPlaywrightTest {
  identity: TestIdentity;
  expectedStatus: PlannedExpectedStatus;
  observed: PlaywrightTest;
}

function relativeTestFile(rootDir: string, file: string): string {
  const absoluteFile = isAbsolute(file) ? file : resolve(rootDir, file);
  const result = relative(rootDir, absoluteFile);
  if (result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result)) {
    throw new Error(`test file escapes rootDir: ${file}`);
  }
  return result.split(sep).join('/');
}

function expectedStatus(value: string): PlannedExpectedStatus {
  if (
    value === 'passed' ||
    value === 'failed' ||
    value === 'skipped' ||
    value === 'timedOut' ||
    value === 'interrupted'
  ) {
    return value;
  }
  throw new Error(`unsupported Playwright expectedStatus: ${value}`);
}

function normalizeSpec(
  report: PlaywrightJsonReport,
  spec: PlaywrightSpec,
  suitePath: readonly string[],
): NormalizedPlaywrightTest[] {
  return spec.tests.map((test) => ({
    identity: {
      key: JSON.stringify([test.projectName, spec.id]),
      projectName: test.projectName,
      playwrightTestId: spec.id,
      file: relativeTestFile(report.config.rootDir, spec.file),
      line: spec.line,
      column: spec.column,
      titlePath: [...suitePath, spec.title],
    },
    expectedStatus: expectedStatus(test.expectedStatus),
    observed: test,
  }));
}

export function flattenPlaywrightTests(
  report: PlaywrightJsonReport,
): NormalizedPlaywrightTest[] {
  const normalized: NormalizedPlaywrightTest[] = [];
  const stack = report.suites.map((suite) => ({ suite, path: [] as string[] }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    const suitePath = [...current.path, current.suite.title];
    for (const spec of current.suite.specs) {
      normalized.push(...normalizeSpec(report, spec, suitePath));
    }
    for (const suite of current.suite.suites) {
      stack.push({ suite, path: suitePath });
    }
  }
  return normalized.sort((left, right) =>
    left.identity.key.localeCompare(right.identity.key),
  );
}
