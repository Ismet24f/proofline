import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';

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
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function digestPlan(plan: Omit<PlanArtifact, 'digest'>): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
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
  const require = createRequire(import.meta.url);
  let cliPath: string;
  try {
    cliPath = require.resolve('@playwright/test/cli', {
      paths: [options.workspace],
    });
  } catch (error) {
    throw new Error(
      `cannot resolve @playwright/test/cli from ${options.workspace}`,
      { cause: error },
    );
  }

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
    const report = parsePlaywrightJson(await readBoundedJson(discoveryPath));
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
    const withoutDigest: Omit<PlanArtifact, 'digest'> = {
      schemaVersion: 1,
      ...context,
      producer: options.producer,
      selection: buildSelectionDescriptor(
        report,
        options.workspace,
        options.producer,
      ),
      generatedAt: new Date().toISOString(),
      tests: flattenPlaywrightTests(report).map(
        ({ identity, expectedStatus }) => ({
          identity,
          expectedStatus,
        }),
      ),
    };
    const plan = parsePlanArtifact({
      ...withoutDigest,
      digest: digestPlan(withoutDigest),
    });
    await writeJsonAtomically(out, plan);
    return plan;
  } finally {
    await rm(discoveryPath, { force: true });
  }
}
