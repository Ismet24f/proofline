import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  parsePlanArtifact,
  parseReconciliationReport,
  parseResultEnvelope,
  type Classification,
  type PlannedEvidenceRecord,
  type ProducerRef,
  type ReconciliationMode,
  type ReconciliationReport,
} from '@proofline/evidence-model';

import { flattenPlaywrightTests } from './identity.js';
import { parsePlaywrightJson } from './playwright-json.js';
import { deriveObservedOutcome } from './outcomes.js';
import {
  readBoundedJson,
  resolveInputPath,
  resolveOutputPath,
  sha256File,
  writeJsonAtomically,
} from './safe-files.js';

function producerKey(producer: ProducerRef): string {
  return `${producer.id}:${String(producer.shard.current)}/${String(producer.shard.total)}`;
}

export function parseProducerManifest(input: string): ProducerRef[] {
  const producers: ProducerRef[] = [];
  for (const entry of input.split(',')) {
    const [id, totalText, extra] = entry.split('=');
    const total = Number(totalText);
    if (
      id === undefined ||
      !/^[a-z0-9-]{1,32}$/u.test(id) ||
      totalText === undefined ||
      extra !== undefined ||
      !Number.isInteger(total) ||
      total < 1 ||
      total > 1000
    ) {
      throw new Error(`invalid producer manifest entry: ${entry}`);
    }
    for (let current = 1; current <= total; current += 1) {
      producers.push({ id, shard: { current, total } });
    }
  }
  if (producers.length !== 1 || producers[0]?.id !== 'e2e') {
    throw new Error('thin slice supports exactly one producer: e2e=1');
  }
  return producers;
}

async function findNamedFiles(root: string, name: string): Promise<string[]> {
  const matches: string[] = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory === undefined) {
      break;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(path);
      } else if (entry.isFile() && basename(path) === name) {
        matches.push(path);
      }
    }
  }
  return matches;
}

function emptyCounts() {
  return {
    plannedActive: 0,
    plannedDisabled: 0,
    executedAsExpected: 0,
    retryMasked: 0,
    failed: 0,
    runtimeSkipped: 0,
    incomplete: 0,
    absent: 0,
    noEvidence: 0,
    producerGaps: 0,
    knownTestGaps: 0,
    notExecuted: 0,
    unexpected: 0,
    toolErrors: 0,
  };
}

function incrementClassification(
  counts: ReturnType<typeof emptyCounts>,
  classification: Classification,
): void {
  const fields = {
    executed_as_expected: 'executedAsExpected',
    retry_masked: 'retryMasked',
    failed: 'failed',
    runtime_skipped: 'runtimeSkipped',
    incomplete: 'incomplete',
    absent: 'absent',
    no_evidence: 'noEvidence',
  } as const;
  counts[fields[classification]] += 1;
}

export interface ReconcileEvidenceOptions {
  workspace: string;
  artifacts: string;
  producers: string;
  mode: ReconciliationMode;
  out: string;
  repository: string;
  revision: string;
  runId: string;
  runAttempt: number;
}

export async function reconcileEvidence(
  options: ReconcileEvidenceOptions,
): Promise<ReconciliationReport> {
  const manifest = parseProducerManifest(options.producers);
  const artifacts = await resolveInputPath(
    options.workspace,
    options.artifacts,
  );
  const out = await resolveOutputPath(options.workspace, options.out);
  const [planFiles, envelopeFiles] = await Promise.all([
    findNamedFiles(artifacts, 'plan.json'),
    findNamedFiles(artifacts, 'envelope.json'),
  ]);
  const plans = await Promise.all(
    planFiles.map(async (path) =>
      parsePlanArtifact(await readBoundedJson(path)),
    ),
  );
  const envelopes = await Promise.all(
    envelopeFiles.map(async (path) => ({
      path,
      value: parseResultEnvelope(await readBoundedJson(path)),
    })),
  );
  const topology = [];
  const tests: PlannedEvidenceRecord[] = [];
  const unexpectedTests = [];
  const counts = emptyCounts();

  for (const producer of manifest) {
    const key = producerKey(producer);
    const matchingPlans = plans.filter(
      (plan) => producerKey(plan.producer) === key,
    );
    const matchingEnvelopes = envelopes.filter(
      (envelope) => producerKey(envelope.value.producer) === key,
    );
    if (matchingPlans.length !== 1 || matchingEnvelopes.length !== 1) {
      topology.push({
        producer,
        status: 'missing' as const,
        reasonCodes: ['producer_artifact_missing'],
      });
      counts.producerGaps += 1;
      continue;
    }
    const plan = matchingPlans[0];
    const envelope = matchingEnvelopes[0];
    if (plan === undefined || envelope === undefined) {
      throw new Error('internal producer matching error');
    }
    if (
      plan.repository !== options.repository ||
      plan.revision !== options.revision ||
      envelope.value.repository !== options.repository ||
      envelope.value.revision !== options.revision ||
      envelope.value.runId !== options.runId ||
      envelope.value.runAttempt !== options.runAttempt ||
      envelope.value.planDigest !== plan.digest
    ) {
      throw new Error(`artifact identity mismatch for ${key}`);
    }
    const reportPath = await resolveInputPath(
      options.workspace,
      join(dirname(envelope.path), envelope.value.reportPath),
    );
    if ((await sha256File(reportPath)) !== envelope.value.reportDigest) {
      throw new Error(`report digest mismatch for ${key}`);
    }
    const report = parsePlaywrightJson(await readBoundedJson(reportPath));
    const observed = new Map(
      flattenPlaywrightTests(report).map((test) => [test.identity.key, test]),
    );
    const active = plan.tests.filter(
      (test) => test.expectedStatus !== 'skipped',
    );
    counts.plannedActive += active.length;
    counts.plannedDisabled += plan.tests.length - active.length;

    for (const planned of active) {
      const actual = observed.get(planned.identity.key);
      const classification =
        actual === undefined
          ? ('absent' as const)
          : deriveObservedOutcome(actual.observed);
      incrementClassification(counts, classification);
      tests.push({
        producer,
        identity: planned.identity,
        expectedStatus: planned.expectedStatus,
        classification,
        reasonCodes: classification === 'absent' ? ['test_absent'] : [],
      });
      observed.delete(planned.identity.key);
    }
    for (const actual of observed.values()) {
      unexpectedTests.push({
        producer,
        identity: actual.identity,
        reasonCodes: ['unexpected_test'],
      });
    }
    counts.unexpected += observed.size;
    topology.push({
      producer,
      status: 'received' as const,
      planDigest: plan.digest,
      reportDigest: envelope.value.reportDigest,
      selectionCheck: envelope.value.selectionCheck,
      reasonCodes: [],
    });
  }

  counts.knownTestGaps =
    counts.runtimeSkipped +
    counts.incomplete +
    counts.absent +
    counts.noEvidence;
  counts.notExecuted = counts.knownTestGaps;
  const hasGaps =
    counts.producerGaps > 0 ||
    counts.knownTestGaps > 0 ||
    counts.unexpected > 0;
  const status = hasGaps ? 'evidence_gaps' : 'complete';
  const reasonCodes = [
    ...(counts.producerGaps > 0 ? ['producer_gap'] : []),
    ...(counts.knownTestGaps > 0 ? ['known_test_gap'] : []),
    ...(counts.unexpected > 0 ? ['unexpected_test'] : []),
  ];
  const timestamp = new Date().toISOString();
  const result = parseReconciliationReport({
    schemaVersion: 1,
    toolVersion: '0.1.0',
    repository: options.repository,
    revision: options.revision,
    runId: options.runId,
    runAttempt: options.runAttempt,
    mode: options.mode,
    generatedAt: timestamp,
    evaluatedAt: timestamp,
    manifest: { schemaVersion: 1, producers: manifest },
    topology,
    tests,
    unexpectedTests,
    counts,
    status,
    exitDecision: {
      code: hasGaps && options.mode === 'enforce-evidence' ? 1 : 0,
      reasonCodes,
    },
  });
  await writeJsonAtomically(out, result);
  return result;
}

export function renderThinSummary(report: ReconciliationReport): string {
  return report.status === 'complete'
    ? `✅ COMPLETE — all ${String(report.counts.plannedActive)} active planned tests produced terminal evidence`
    : `⚠️ EVIDENCE GAPS — ${String(report.counts.producerGaps)} producer scopes and ${String(report.counts.knownTestGaps)} known active planned tests lack trustworthy execution evidence`;
}
