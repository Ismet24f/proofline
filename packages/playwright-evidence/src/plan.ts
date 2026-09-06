import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstatSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  parsePlanArtifact,
  type PlanArtifact,
  type ProducerRef,
} from '@proofline/evidence-model';

import { parseArgumentLines } from './arguments.js';
import { flattenPlaywrightTests } from './identity.js';
import { resolveRepositoryContext } from './metadata.js';
import { parsePlaywrightJson } from './playwright-json.js';
import {
  readBoundedJson,
  resolveOutputPath,
  writeJsonAtomically,
} from './safe-files.js';
import { buildSelectionDescriptor } from './selection.js';

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

const MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;

function runProcess(
  command: string,
  arguments_: readonly string[],
  workspace: string,
  env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: workspace,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGKILL');
      reject(error);
    };
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        fail(
          new Error(
            `Playwright stdout exceeds ${String(MAX_STDOUT_BYTES)} bytes`,
          ),
        );
        return;
      }
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (stderrBytes >= MAX_STDERR_BYTES) {
        return;
      }
      const remaining = MAX_STDERR_BYTES - stderrBytes;
      const bytes = Buffer.from(chunk, 'utf8');
      const bounded = bytes.subarray(0, remaining).toString('utf8');
      stderr += bounded;
      stderrBytes += Buffer.byteLength(bounded, 'utf8');
    });
    child.once('error', (error) => {
      fail(error);
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value !== 'object') {
    throw new Error('plan contains a non-JSON value');
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

export function computePlanDigest(plan: Omit<PlanArtifact, 'digest'>): string {
  return createHash('sha256').update(canonicalJson(plan)).digest('hex');
}

export function resolvePlaywrightCli(workspace: string): string {
  const absoluteWorkspace = resolve(workspace);
  const localPackage = join(
    absoluteWorkspace,
    'node_modules/@playwright/test/package.json',
  );
  try {
    lstatSync(localPackage);
    const requireFromWorkspace = createRequire(
      join(absoluteWorkspace, 'package.json'),
    );
    return requireFromWorkspace.resolve('@playwright/test/cli');
  } catch (error) {
    throw new Error(`cannot resolve @playwright/test/cli from ${workspace}`, {
      cause: error,
    });
  }
}

export interface NormalizePlanContext {
  workspace: string;
  repository: string;
  revision: string;
  headRevision?: string | undefined;
  producer: ProducerRef;
  generatedAt: string;
}

export function normalizePlanJson(
  input: unknown,
  context: NormalizePlanContext,
): PlanArtifact {
  const report = parsePlaywrightJson(input);
  const withoutDigest: Omit<PlanArtifact, 'digest'> = {
    schemaVersion: 1,
    repository: context.repository,
    revision: context.revision,
    ...(context.headRevision === undefined
      ? {}
      : { headRevision: context.headRevision }),
    producer: context.producer,
    selection: buildSelectionDescriptor(
      report,
      context.workspace,
      context.producer,
    ),
    generatedAt: context.generatedAt,
    tests: flattenPlaywrightTests(report).map(
      ({ identity, expectedStatus }) => ({ identity, expectedStatus }),
    ),
  };
  return parsePlanArtifact({
    ...withoutDigest,
    digest: computePlanDigest(withoutDigest),
  });
}

export interface CreatePlanOptions {
  workspace: string;
  producer: ProducerRef;
  playwrightArguments: string;
  config?: string;
  repository?: string;
  revision?: string;
  env: NodeJS.ProcessEnv;
  out: string;
}

export async function createPlan(
  options: CreatePlanOptions,
): Promise<PlanArtifact> {
  const out = await resolveOutputPath(options.workspace, options.out);
  const discoveryPath = `${out}.${randomUUID()}.discovery.json`;
  const cliPath = resolvePlaywrightCli(options.workspace);

  const arguments_ = [cliPath, 'test', '--list', '--reporter=json'];
  if (options.config !== undefined && options.config.length > 0) {
    arguments_.push(`--config=${options.config}`);
  }
  if (options.producer.shard.total !== 1) {
    arguments_.push(
      `--shard=${String(options.producer.shard.current)}/${String(options.producer.shard.total)}`,
    );
  }
  arguments_.push(...parseArgumentLines(options.playwrightArguments));

  try {
    const discovery = await runProcess(
      process.execPath,
      arguments_,
      options.workspace,
      {
        ...options.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: discoveryPath,
      },
    );
    if (discovery.code !== 0) {
      throw new Error(
        `Playwright list discovery failed with code ${String(discovery.code)}: ${discovery.stderr || discovery.stdout}`,
      );
    }
    const rawReport = await readBoundedJson(discoveryPath);
    const context = await resolveRepositoryContext({
      workspace: options.workspace,
      ...(options.repository === undefined
        ? {}
        : { repository: options.repository }),
      ...(options.revision === undefined ? {} : { revision: options.revision }),
      env: options.env,
      runGit: async (args) => {
        const result = await runProcess(
          'git',
          args,
          options.workspace,
          options.env,
        );
        if (result.code !== 0) {
          throw new Error(`git ${args.join(' ')} failed`);
        }
        return result.stdout.trim();
      },
    });
    const plan = normalizePlanJson(rawReport, {
      workspace: options.workspace,
      ...context,
      producer: options.producer,
      generatedAt: new Date().toISOString(),
    });
    await writeJsonAtomically(out, plan);
    return plan;
  } finally {
    await rm(discoveryPath, { force: true });
  }
}
