export interface PlaywrightProject {
  name: string;
}

export interface PlaywrightResult {
  status: string;
}

export interface PlaywrightTest {
  expectedStatus: string;
  projectName: string;
  results: readonly PlaywrightResult[];
  status: string;
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

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value;
}

function parseResult(value: unknown, path: string): PlaywrightResult {
  const input = record(value, path);
  return { status: string(input.status, `${path}.status`) };
}

function parseTest(value: unknown, path: string): PlaywrightTest {
  const input = record(value, path);
  return {
    expectedStatus: string(input.expectedStatus, `${path}.expectedStatus`),
    projectName: string(input.projectName, `${path}.projectName`),
    results: array(input.results, `${path}.results`).map((result, index) =>
      parseResult(result, `${path}.results[${String(index)}]`),
    ),
    status: string(input.status, `${path}.status`),
  };
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
  if (value === null || value === undefined) {
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
  return {
    config: {
      argv: array(config.argv, 'config.argv').map((argument, index) =>
        string(argument, `config.argv[${String(index)}]`),
      ),
      configFile: string(config.configFile, 'config.configFile'),
      rootDir: string(config.rootDir, 'config.rootDir'),
      projects: array(config.projects, 'config.projects').map(
        (project, index) => ({
          name: string(
            record(project, `config.projects[${String(index)}]`).name,
            `config.projects[${String(index)}].name`,
          ),
        }),
      ),
      shard: parseShard(config.shard),
      version: string(config.version, 'config.version'),
    },
    suites: array(report.suites, 'report.suites').map((suite, index) =>
      parseSuite(suite, `report.suites[${String(index)}]`),
    ),
  };
}
