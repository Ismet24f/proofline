import {
  parsePlanArtifact,
  parseResultEnvelope,
  type ProducerRef,
  type ResultEnvelope,
} from '@proofline/evidence-model';
import { mkdir, realpath, rm } from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';

import { flattenPlaywrightTests } from './identity.js';
import { computePlanDigest } from './plan.js';
import { parsePlaywrightJson } from './playwright-json.js';
import {
  readBoundedJson,
  resolveInputPath,
  resolveOutputPath,
  sha256File,
  writeJsonAtomically,
} from './safe-files.js';
import { diffReportSelection } from './selection.js';

export interface CollectEvidenceOptions {
  workspace: string;
  producer: ProducerRef;
  plan: string;
  report: string;
  out: string;
  env: NodeJS.ProcessEnv;
}

export class ProoflineToolError extends Error {
  readonly code: string;

  constructor(code: string, details?: string, options?: ErrorOptions) {
    super(details === undefined ? code : `${code}: ${details}`, options);
    this.name = 'ProoflineToolError';
    this.code = code;
  }
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: unknown }).code === 'ENOENT'
  );
}

async function removeStaleEnvelope(out: string): Promise<void> {
  await rm(out, { force: true });
}

function identitiesMatch(
  planned: ReturnType<typeof parsePlanArtifact>,
  report: ReturnType<typeof parsePlaywrightJson>,
): void {
  const plannedByKey = new Map(
    planned.tests.map((test) => [test.identity.key, test.identity]),
  );
  for (const observed of flattenPlaywrightTests(report)) {
    const expected = plannedByKey.get(observed.identity.key);
    if (
      expected !== undefined &&
      JSON.stringify(expected) !== JSON.stringify(observed.identity)
    ) {
      throw new ProoflineToolError(
        'identity_metadata_mismatch',
        `${observed.identity.key}: planned ${expected.file}:${String(expected.line)}:${String(expected.column)}, actual ${observed.identity.file}:${String(observed.identity.line)}:${String(observed.identity.column)}`,
      );
    }
  }
}

export async function collectEvidence(
  options: CollectEvidenceOptions,
): Promise<ResultEnvelope> {
  const out = await resolveOutputPath(options.workspace, options.out);
  let reportPath: string;
  let report: ReturnType<typeof parsePlaywrightJson>;
  try {
    reportPath = await resolveInputPath(options.workspace, options.report);
    report = parsePlaywrightJson(await readBoundedJson(reportPath));
  } catch (error) {
    await removeStaleEnvelope(out);
    throw new ProoflineToolError(
      isMissingFile(error) ? 'report_missing' : 'invalid_report',
      options.report,
      { cause: error },
    );
  }

  let plan: ReturnType<typeof parsePlanArtifact> | undefined;
  try {
    const planPath = await resolveInputPath(options.workspace, options.plan);
    plan = parsePlanArtifact(await readBoundedJson(planPath));
  } catch (error) {
    if (!isMissingFile(error)) {
      await removeStaleEnvelope(out);
      throw new ProoflineToolError('invalid_plan', options.plan, {
        cause: error,
      });
    }
  }

  if (plan !== undefined) {
    const { digest, ...withoutDigest } = plan;
    if (computePlanDigest(withoutDigest) !== digest) {
      await removeStaleEnvelope(out);
      throw new ProoflineToolError('plan_digest_mismatch', options.plan);
    }
    if (JSON.stringify(plan.producer) !== JSON.stringify(options.producer)) {
      await removeStaleEnvelope(out);
      throw new ProoflineToolError(
        'producer_mismatch',
        'collect producer and shard must equal plan producer and shard',
      );
    }
    try {
      identitiesMatch(plan, report);
    } catch (error) {
      await removeStaleEnvelope(out);
      throw error;
    }
  }

  const selectionCheck =
    plan === undefined
      ? ({ status: 'unavailable', reason: 'plan_missing' } as const)
      : diffReportSelection(
          plan.selection,
          report,
          options.workspace,
          options.producer,
        );
  await mkdir(dirname(out), { recursive: true });
  const outputDirectory = await realpath(dirname(out));
  const envelope = parseResultEnvelope({
    schemaVersion: 1,
    repository:
      plan?.repository ?? requiredEnvironment(options.env, 'GITHUB_REPOSITORY'),
    revision: plan?.revision ?? requiredEnvironment(options.env, 'GITHUB_SHA'),
    ...(plan?.headRevision === undefined
      ? {}
      : { headRevision: plan.headRevision }),
    runId: requiredEnvironment(options.env, 'GITHUB_RUN_ID'),
    runAttempt: Number(requiredEnvironment(options.env, 'GITHUB_RUN_ATTEMPT')),
    producer: options.producer,
    planDigest: plan?.digest ?? 'missing',
    reportPath: relative(outputDirectory, reportPath).split(sep).join('/'),
    reportDigest: await sha256File(reportPath),
    collectedAt: new Date().toISOString(),
    selectionCheck,
  });
  await writeJsonAtomically(out, envelope);
  if (selectionCheck.status === 'mismatch') {
    const details = selectionCheck.differences
      .map(
        (difference) =>
          `${difference.field}: planned ${difference.planned}, actual ${difference.actual}`,
      )
      .join('; ');
    throw new ProoflineToolError('selection_mismatch', details);
  }
  return envelope;
}
