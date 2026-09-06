import { readdir, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  parsePlanArtifact,
  parseReconciliationReport,
  parseResultEnvelope,
  type Classification,
  type PlanArtifact,
  type PlannedEvidenceRecord,
  type ProducerRef,
  type ReconciliationMode,
  type ReconciliationReport,
  type ResultEnvelope,
} from '@proofline/evidence-model';

import { flattenPlaywrightTests } from './identity.js';
import { parseProducerManifest } from './manifest.js';
import { deriveObservedOutcome } from './outcomes.js';
import { computePlanDigest } from './plan.js';
import { parsePlaywrightJson } from './playwright-json.js';
import {
  readBoundedJson,
  resolveInputPath,
  resolveOutputPath,
  sha256File,
  writeJsonAtomically,
} from './safe-files.js';
import { diffProducerSelection, diffReportSelection } from './selection.js';

function producerKey(producer: ProducerRef): string {
  return `${producer.id}:${String(producer.shard.current)}/${String(producer.shard.total)}`;
}

class ReconciliationToolError extends Error {
  constructor(
    readonly code: string,
    readonly scopeKey?: string,
  ) {
    super(scopeKey === undefined ? code : `${code}: ${scopeKey}`);
  }
}

async function findNamedFiles(root: string, name: string): Promise<string[]> {
  const matches: string[] = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory === undefined) break;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(path);
      else if (entry.isFile() && basename(path) === name) matches.push(path);
    }
  }
  return matches.sort((left, right) => left.localeCompare(right));
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

function verifyPlanDigest(plan: PlanArtifact): void {
  const { digest, ...withoutDigest } = plan;
  if (computePlanDigest(withoutDigest) !== digest) {
    throw new ReconciliationToolError(
      'plan_digest_mismatch',
      producerKey(plan.producer),
    );
  }
}

function duplicateKey<T>(
  values: readonly T[],
  producer: (value: T) => ProducerRef,
): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    const key = producerKey(producer(value));
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}

function noEvidenceRecords(
  plan: PlanArtifact,
  counts: ReturnType<typeof emptyCounts>,
): PlannedEvidenceRecord[] {
  const active = plan.tests.filter((test) => test.expectedStatus !== 'skipped');
  counts.plannedActive += active.length;
  counts.plannedDisabled += plan.tests.length - active.length;
  counts.noEvidence += active.length;
  return active.map((test) => ({
    producer: plan.producer,
    ...test,
    classification: 'no_evidence' as const,
    reasonCodes: ['producer_no_evidence'],
  }));
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

interface LoadedEnvelope {
  path: string;
  value: ResultEnvelope;
}

function finalizeCounts(counts: ReturnType<typeof emptyCounts>): void {
  counts.knownTestGaps =
    counts.runtimeSkipped +
    counts.incomplete +
    counts.absent +
    counts.noEvidence;
  counts.notExecuted = counts.knownTestGaps;
}

function diagnosticReport(
  options: ReconcileEvidenceOptions,
  manifest: readonly ProducerRef[],
  code: string,
  scopeKey?: string,
): ReconciliationReport {
  const counts = emptyCounts();
  counts.producerGaps = manifest.length;
  counts.toolErrors = 1;
  const timestamp = new Date().toISOString();
  return parseReconciliationReport({
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
    topology: manifest.map((producer) => ({
      producer,
      status: 'invalid' as const,
      reasonCodes: [
        scopeKey === undefined || producerKey(producer) === scopeKey
          ? code
          : 'evaluation_aborted',
      ],
    })),
    tests: [],
    unexpectedTests: [],
    counts,
    status: 'tool_error',
    exitDecision: { code: 2, reasonCodes: [code] },
  });
}

async function reconcileValidArtifacts(
  options: ReconcileEvidenceOptions,
  canonicalWorkspace: string,
  manifest: readonly ProducerRef[],
): Promise<ReconciliationReport> {
  const artifacts = await resolveInputPath(
    canonicalWorkspace,
    options.artifacts,
  );
  const [planFiles, envelopeFiles] = await Promise.all([
    findNamedFiles(artifacts, 'plan.json'),
    findNamedFiles(artifacts, 'envelope.json'),
  ]);
  const plans = await Promise.all(
    planFiles.map(async (path) => {
      const value = parsePlanArtifact(await readBoundedJson(path));
      verifyPlanDigest(value);
      return { path, value };
    }),
  );
  const envelopes: LoadedEnvelope[] = await Promise.all(
    envelopeFiles.map(async (path) => ({
      path,
      value: parseResultEnvelope(await readBoundedJson(path)),
    })),
  );
  const duplicatePlan = duplicateKey(plans, (plan) => plan.value.producer);
  if (duplicatePlan !== undefined) {
    throw new ReconciliationToolError('duplicate_plan', duplicatePlan);
  }
  const duplicateEnvelope = duplicateKey(
    envelopes,
    (envelope) => envelope.value.producer,
  );
  if (duplicateEnvelope !== undefined) {
    throw new ReconciliationToolError('duplicate_envelope', duplicateEnvelope);
  }

  const manifestKeys = new Set(manifest.map(producerKey));
  for (const producerId of new Set(manifest.map((producer) => producer.id))) {
    const producerPlans = plans
      .filter(
        (entry) =>
          entry.value.producer.id === producerId &&
          manifestKeys.has(producerKey(entry.value.producer)),
      )
      .map((entry) => entry.value);
    const baseline = producerPlans[0];
    if (baseline === undefined) continue;
    for (const candidate of producerPlans.slice(1)) {
      if (
        diffProducerSelection(baseline.selection, candidate.selection)
          .status === 'mismatch'
      ) {
        throw new ReconciliationToolError('selection_mismatch', producerId);
      }
    }
  }

  const topology = [];
  const tests: PlannedEvidenceRecord[] = [];
  const unexpectedTests = [];
  const counts = emptyCounts();

  for (const producer of manifest) {
    const key = producerKey(producer);
    const planEntry = plans.find(
      (entry) => producerKey(entry.value.producer) === key,
    );
    const envelope = envelopes.find(
      (entry) => producerKey(entry.value.producer) === key,
    );
    if (planEntry === undefined) {
      topology.push({
        producer,
        status: 'missing' as const,
        reasonCodes: ['producer_plan_missing'],
      });
      counts.producerGaps += 1;
      continue;
    }
    const plan = planEntry.value;
    if (
      plan.repository !== options.repository ||
      plan.revision !== options.revision
    ) {
      throw new ReconciliationToolError('artifact_identity_mismatch', key);
    }
    if (envelope === undefined) {
      const conventionalReport = join(dirname(planEntry.path), 'report.json');
      try {
        const report = parsePlaywrightJson(
          await readBoundedJson(conventionalReport),
        );
        const selection = diffReportSelection(
          plan.selection,
          report,
          options.workspace,
          producer,
        );
        if (selection.status === 'mismatch') {
          throw new ReconciliationToolError('selection_mismatch', key);
        }
      } catch (error) {
        if (error instanceof ReconciliationToolError) throw error;
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )) {
          throw new ReconciliationToolError('invalid_report', key);
        }
      }
      tests.push(...noEvidenceRecords(plan, counts));
      topology.push({
        producer,
        status: 'missing' as const,
        planDigest: plan.digest,
        reasonCodes: ['producer_envelope_missing'],
      });
      counts.producerGaps += 1;
      continue;
    }
    if (
      envelope.value.repository !== options.repository ||
      envelope.value.revision !== options.revision ||
      envelope.value.runId !== options.runId ||
      envelope.value.runAttempt !== options.runAttempt ||
      envelope.value.planDigest !== plan.digest ||
      producerKey(envelope.value.producer) !== key
    ) {
      throw new ReconciliationToolError('artifact_identity_mismatch', key);
    }
    if (envelope.value.selectionCheck.status === 'mismatch') {
      throw new ReconciliationToolError('selection_mismatch', key);
    }
    if (envelope.value.selectionCheck.status === 'unavailable') {
      throw new ReconciliationToolError('selection_unavailable', key);
    }
    const reportPath = await resolveInputPath(
      canonicalWorkspace,
      join(dirname(envelope.path), envelope.value.reportPath),
    );
    if ((await sha256File(reportPath)) !== envelope.value.reportDigest) {
      throw new ReconciliationToolError('report_digest_mismatch', key);
    }
    const report = parsePlaywrightJson(await readBoundedJson(reportPath));
    const selection = diffReportSelection(
      plan.selection,
      report,
      options.workspace,
      producer,
    );
    if (selection.status === 'mismatch') {
      throw new ReconciliationToolError('selection_mismatch', key);
    }
    const normalizedObserved = flattenPlaywrightTests(report);
    const observed = new Map(
      normalizedObserved.map((test) => [test.identity.key, test]),
    );
    const active = plan.tests.filter(
      (test) => test.expectedStatus !== 'skipped',
    );
    const disabled = plan.tests.filter(
      (test) => test.expectedStatus === 'skipped',
    );
    counts.plannedActive += active.length;
    counts.plannedDisabled += disabled.length;
    for (const planned of disabled) observed.delete(planned.identity.key);

    for (const planned of active) {
      const actual = observed.get(planned.identity.key);
      if (
        actual !== undefined &&
        JSON.stringify(actual.identity) !== JSON.stringify(planned.identity)
      ) {
        throw new ReconciliationToolError(
          'identity_metadata_mismatch',
          planned.identity.key,
        );
      }
      const classification =
        actual === undefined
          ? ('absent' as const)
          : deriveObservedOutcome({
              status: actual.observed.status,
              attempts: actual.observed.results.map((result) => result.status),
              plannedExpectedStatus: planned.expectedStatus,
            });
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

  tests.sort(
    (left, right) =>
      left.identity.key.localeCompare(right.identity.key) ||
      producerKey(left.producer).localeCompare(producerKey(right.producer)),
  );
  unexpectedTests.sort(
    (left, right) =>
      left.identity.key.localeCompare(right.identity.key) ||
      producerKey(left.producer).localeCompare(producerKey(right.producer)),
  );
  finalizeCounts(counts);
  const hasGaps =
    counts.producerGaps > 0 ||
    counts.knownTestGaps > 0 ||
    counts.unexpected > 0;
  const reasonCodes = [
    ...(counts.producerGaps > 0 ? ['producer_gap'] : []),
    ...(counts.knownTestGaps > 0 ? ['known_test_gap'] : []),
    ...(counts.unexpected > 0 ? ['unexpected_test'] : []),
  ];
  const timestamp = new Date().toISOString();
  return parseReconciliationReport({
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
    status: hasGaps ? 'evidence_gaps' : 'complete',
    exitDecision: {
      code: hasGaps && options.mode === 'enforce-evidence' ? 1 : 0,
      reasonCodes,
    },
  });
}

export async function reconcileEvidence(
  options: ReconcileEvidenceOptions,
): Promise<ReconciliationReport> {
  const out = await resolveOutputPath(options.workspace, options.out);
  let manifest: ProducerRef[] = [];
  let result: ReconciliationReport;
  try {
    manifest = parseProducerManifest(options.producers);
    const canonicalWorkspace = await realpath(options.workspace);
    result = await reconcileValidArtifacts(
      options,
      canonicalWorkspace,
      manifest,
    );
  } catch (error) {
    const code =
      error instanceof ReconciliationToolError
        ? error.code
        : 'artifact_invalid';
    const scopeKey =
      error instanceof ReconciliationToolError ? error.scopeKey : undefined;
    result = diagnosticReport(options, manifest, code, scopeKey);
  }
  await writeJsonAtomically(out, result);
  return result;
}

export function renderThinSummary(report: ReconciliationReport): string {
  return report.status === 'complete'
    ? `✅ COMPLETE — all ${String(report.counts.plannedActive)} active planned tests produced terminal evidence`
    : report.status === 'tool_error'
      ? '❌ TOOL ERROR — Proofline could not evaluate this run'
      : `⚠️ EVIDENCE GAPS — ${String(report.counts.producerGaps)} producer scopes and ${String(report.counts.knownTestGaps)} known active planned tests lack trustworthy execution evidence`;
}
