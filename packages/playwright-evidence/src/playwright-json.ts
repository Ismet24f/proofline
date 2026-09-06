export interface PlaywrightProject {
  name: string;
}

export interface PlaywrightResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
}

export interface PlaywrightTest {
  expectedStatus: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  projectName: string;
  results: readonly PlaywrightResult[];
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
}

export interface PlaywrightSpec {
  id: string;
  title: string;
  file: string;
  line: number;
  column: number;
  tests: readonly PlaywrightTest[];
}

export interface PlaywrightSuite {
  title: string;
  specs: readonly PlaywrightSpec[];
  suites: readonly PlaywrightSuite[];
}

export interface PlaywrightJsonReport {
  config: {
    argv: readonly string[];
    configFile: string;
    rootDir: string;
    projects: readonly PlaywrightProject[];
    shard: { current: number; total: number } | null;
    version: string;
  };
  suites: readonly PlaywrightSuite[];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function projectName(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }
  if (value === '<default>') {
    throw new Error(`${path} uses reserved project name <default>`);
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${path} has unsupported status: ${String(value)}`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value;
}

function parseResult(value: unknown, path: string): PlaywrightResult {
  const input = record(value, path);
  return {
    status: enumValue(
      input.status,
      ['passed', 'failed', 'timedOut', 'skipped', 'interrupted'] as const,
      `${path}.status`,
    ),
  };
}

function validateTestSemantics(test: PlaywrightTest, path: string): void {
  const attempts = test.results.map((result) => result.status);
  const finalAttempt = attempts.at(-1);

  if (test.status === 'expected') {
    if (attempts.length !== 1) {
      throw new Error(
        `${path} with status expected must contain exactly one result`,
      );
    }
    if (finalAttempt !== test.expectedStatus) {
      throw new Error(
        `${path} with status expected must match expectedStatus in its result`,
      );
    }
    return;
  }

  if (test.status === 'flaky') {
    if (attempts.length < 2) {
      throw new Error(
        `${path} with status flaky must contain at least two results`,
      );
    }
    if (finalAttempt !== test.expectedStatus) {
      throw new Error(
        `${path} with status flaky final result must match expectedStatus`,
      );
    }
    if (
      !attempts.slice(0, -1).some((attempt) => attempt !== test.expectedStatus)
    ) {
      throw new Error(
        `${path} with status flaky must contain an earlier unexpected result`,
      );
    }
    return;
  }

  if (test.status === 'unexpected') {
    if (attempts.length === 0) {
      throw new Error(
        `${path} with status unexpected must contain at least one result`,
      );
    }
    if (finalAttempt === test.expectedStatus) {
      throw new Error(
        `${path} with status unexpected final result must differ from expectedStatus`,
      );
    }
    return;
  }

  if (
    attempts.length > 0 &&
    finalAttempt !== 'skipped' &&
    finalAttempt !== 'interrupted'
  ) {
    throw new Error(
      `${path} with status skipped has an unsupported result sequence`,
    );
  }
}

function parseTest(value: unknown, path: string): PlaywrightTest {
  const input = record(value, path);
  const test: PlaywrightTest = {
    expectedStatus: enumValue(
      input.expectedStatus,
      ['passed', 'failed', 'skipped', 'timedOut', 'interrupted'] as const,
      `${path}.expectedStatus`,
    ),
    projectName: projectName(input.projectName, `${path}.projectName`),
    results: array(input.results, `${path}.results`).map((result, index) =>
      parseResult(result, `${path}.results[${String(index)}]`),
    ),
    status: enumValue(
      input.status,
      ['expected', 'unexpected', 'flaky', 'skipped'] as const,
      `${path}.status`,
    ),
  };
  validateTestSemantics(test, path);
  return test;
}

function parseSpec(value: unknown, path: string): PlaywrightSpec {
  const input = record(value, path);
  return {
    id: string(input.id, `${path}.id`),
    title: string(input.title, `${path}.title`),
    file: string(input.file, `${path}.file`),
    line: positiveInteger(input.line, `${path}.line`),
    column: positiveInteger(input.column, `${path}.column`),
    tests: array(input.tests, `${path}.tests`).map((test, index) =>
      parseTest(test, `${path}.tests[${String(index)}]`),
    ),
  };
}

function parseSuite(value: unknown, path: string): PlaywrightSuite {
  const input = record(value, path);
  const specs =
    input.specs === undefined ? [] : array(input.specs, `${path}.specs`);
  const suites =
    input.suites === undefined ? [] : array(input.suites, `${path}.suites`);
  return {
    title: string(input.title, `${path}.title`),
    specs: specs.map((spec, index) =>
      parseSpec(spec, `${path}.specs[${String(index)}]`),
    ),
    suites: suites.map((suite, index) =>
      parseSuite(suite, `${path}.suites[${String(index)}]`),
    ),
  };
}

function parseShard(value: unknown): { current: number; total: number } | null {
  if (value === null) {
    return null;
  }
  const input = record(value, 'config.shard');
  const current = positiveInteger(input.current, 'config.shard.current');
  const total = positiveInteger(input.total, 'config.shard.total');
  if (current > total) {
    throw new Error('config.shard.current must not exceed total');
  }
  return { current, total };
}

export function parsePlaywrightJson(input: unknown): PlaywrightJsonReport {
  const report = record(input, 'report');
  const config = record(report.config, 'config');
  if (!Object.hasOwn(config, 'shard')) {
    throw new Error('config.shard is required');
  }
  const version = string(config.version, 'config.version');
  if (!/^1\.62\.\d+$/u.test(version)) {
    throw new Error(
      `unsupported Playwright version: ${version}; expected 1.62.x`,
    );
  }
  return {
    config: {
      argv: array(config.argv, 'config.argv').map((argument, index) =>
        string(argument, `config.argv[${String(index)}]`),
      ),
      configFile: string(config.configFile, 'config.configFile'),
      rootDir: string(config.rootDir, 'config.rootDir'),
      projects: array(config.projects, 'config.projects').map(
        (project, index) => ({
          name: projectName(
            record(project, `config.projects[${String(index)}]`).name,
            `config.projects[${String(index)}].name`,
          ),
        }),
      ),
      shard: parseShard(config.shard),
      version,
    },
    suites: array(report.suites, 'report.suites').map((suite, index) =>
      parseSuite(suite, `report.suites[${String(index)}]`),
    ),
  };
}
