import {
  parsePlanArtifact,
  parseResultEnvelope,
  type ProducerRef,
  type ResultEnvelope,
} from '@proofline/evidence-model';
import { dirname, relative, sep } from 'node:path';

import { parsePlaywrightJson } from './playwright-json.js';
import {
  readBoundedJson,
  resolveInputPath,
  resolveOutputPath,
  sha256File,
  writeJsonAtomically,
} from './safe-files.js';
import { buildSelectionDescriptor, diffSelection } from './selection.js';

export interface CollectEvidenceOptions {
  workspace: string;
  producer: ProducerRef;
  plan: string;
  report: string;
  out: string;
  env: NodeJS.ProcessEnv;
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function collectEvidence(
  options: CollectEvidenceOptions,
): Promise<ResultEnvelope> {
  const planPath = await resolveInputPath(options.workspace, options.plan);
  const reportPath = await resolveInputPath(options.workspace, options.report);
  const out = await resolveOutputPath(options.workspace, options.out);
  const plan = parsePlanArtifact(await readBoundedJson(planPath));
  if (JSON.stringify(plan.producer) !== JSON.stringify(options.producer)) {
    throw new Error(
      'collect producer and shard must equal plan producer and shard',
    );
  }
  const report = parsePlaywrightJson(await readBoundedJson(reportPath));
  const selectionCheck = diffSelection(
    plan.selection,
    buildSelectionDescriptor(report, options.workspace, options.producer),
  );
  const envelope = parseResultEnvelope({
    schemaVersion: 1,
    repository: plan.repository,
    revision: plan.revision,
    ...(plan.headRevision === undefined
      ? {}
      : { headRevision: plan.headRevision }),
    runId: requiredEnvironment(options.env, 'GITHUB_RUN_ID'),
    runAttempt: Number(requiredEnvironment(options.env, 'GITHUB_RUN_ATTEMPT')),
    producer: options.producer,
    planDigest: plan.digest,
    reportPath: relative(dirname(out), reportPath).split(sep).join('/'),
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
    throw new Error(`selection_mismatch: ${details}`);
  }
  return envelope;
}
