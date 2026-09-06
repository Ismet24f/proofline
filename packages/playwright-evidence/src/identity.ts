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

export interface IdentityContext {
  rootDir: string;
  suitePath: readonly string[];
}

function relativeTestFile(rootDir: string, file: string): string {
  const absoluteFile = isAbsolute(file) ? file : resolve(rootDir, file);
  const result = relative(rootDir, absoluteFile);
  if (result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result)) {
    throw new Error(`test file escapes rootDir: ${file}`);
  }
  return result.split(sep).join('/');
}

function normalizedProjectName(value: string): string {
  return value === '' ? '<default>' : value;
}

export function makeIdentity(
  spec: PlaywrightSpec,
  test: PlaywrightTest,
  context: IdentityContext,
): TestIdentity {
  const projectName = normalizedProjectName(test.projectName);
  return {
    key: JSON.stringify([projectName, spec.id]),
    projectName,
    playwrightTestId: spec.id,
    file: relativeTestFile(context.rootDir, spec.file),
    line: spec.line,
    column: spec.column,
    titlePath: [...context.suitePath, spec.title],
  };
}

function normalizeSpec(
  report: PlaywrightJsonReport,
  spec: PlaywrightSpec,
  suitePath: readonly string[],
): NormalizedPlaywrightTest[] {
  return spec.tests.map((test) => ({
    identity: makeIdentity(spec, test, {
      rootDir: report.config.rootDir,
      suitePath,
    }),
    expectedStatus: test.expectedStatus satisfies PlannedExpectedStatus,
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
  normalized.sort((left, right) =>
    left.identity.key.localeCompare(right.identity.key),
  );
  const collisions = new Map<string, NormalizedPlaywrightTest[]>();
  for (const test of normalized) {
    const matches = collisions.get(test.identity.key) ?? [];
    matches.push(test);
    collisions.set(test.identity.key, matches);
  }
  const duplicates = [...collisions.entries()].filter(
    ([, matches]) => matches.length > 1,
  );
  if (duplicates.length > 0) {
    const details = duplicates
      .map(
        ([key, matches]) =>
          `${key}: ${matches
            .map(
              (match) =>
                `${match.identity.file}:${String(match.identity.line)}:${String(match.identity.column)}`,
            )
            .join(', ')}`,
      )
      .join('; ');
    throw new Error(`duplicate Playwright identity: ${details}`);
  }
  return normalized;
}
