import type {
  ProducerEvidenceRecord,
  ReconciliationReport,
} from '@proofline/evidence-model';

function headline(report: ReconciliationReport): string {
  if (report.status === 'complete') {
    return `✅ COMPLETE — all ${String(report.counts.plannedActive)} active planned tests produced terminal evidence`;
  }
  if (report.status === 'tool_error') {
    return '❌ TOOL ERROR — Proofline could not evaluate this run';
  }
  return `⚠️ EVIDENCE GAPS — ${String(report.counts.producerGaps)} producer scopes and ${String(report.counts.knownTestGaps)} known active planned tests lack trustworthy execution evidence`;
}

function producerLabel(record: ProducerEvidenceRecord): string {
  return `${record.producer.id} ${String(record.producer.shard.current)}/${String(record.producer.shard.total)}`;
}

export function renderGitHubSummary(report: ReconciliationReport): string {
  const received = report.topology.filter(
    (record) => record.status === 'received',
  ).length;
  if (report.status === 'complete') {
    return [
      headline(report),
      `Producers: ${String(received)}/${String(report.topology.length)} received · Planned disabled: ${String(report.counts.plannedDisabled)}`,
      `Results: ${String(report.counts.executedAsExpected)} expected · ${String(report.counts.retryMasked)} retry-masked · ${String(report.counts.failed)} failed · ${String(report.counts.unexpected)} unexpected`,
    ].join('\n');
  }

  const lines = [
    headline(report),
    '',
    '## Producers',
    '',
    '| Producer | Evidence |',
    '| --- | --- |',
    ...report.topology.map(
      (record) => `| ${producerLabel(record)} | ${record.status} |`,
    ),
  ];
  for (const record of report.topology) {
    if (
      record.status === 'missing' &&
      record.reasonCodes.includes('producer_plan_missing')
    ) {
      lines.push(
        `- ${producerLabel(record)}: tests for this producer cannot be named because its plan was never produced`,
      );
    }
  }
  lines.push(
    '',
    '## Classification counts',
    '',
    `Expected: ${String(report.counts.executedAsExpected)} · Retry-masked: ${String(report.counts.retryMasked)} · Failed: ${String(report.counts.failed)} · Runtime skipped: ${String(report.counts.runtimeSkipped)} · Incomplete: ${String(report.counts.incomplete)} · Absent: ${String(report.counts.absent)} · No evidence: ${String(report.counts.noEvidence)} · Unexpected: ${String(report.counts.unexpected)}`,
  );

  const retryMasked = report.tests.filter(
    (test) => test.classification === 'retry_masked',
  );
  if (retryMasked.length > 0) {
    lines.push(
      '',
      '## Retry-masked tests',
      '',
      ...retryMasked.map(
        (test) => `- ${test.identity.file}:${String(test.identity.line)}`,
      ),
    );
  }

  const gapClasses = new Set([
    'runtime_skipped',
    'incomplete',
    'absent',
    'no_evidence',
  ]);
  const affected = [
    ...report.tests
      .filter((test) => gapClasses.has(test.classification))
      .map((test) => ({
        key: test.identity.key,
        text: `- ${test.identity.file}:${String(test.identity.line)} — ${test.classification}`,
      })),
    ...report.unexpectedTests.map((test) => ({
      key: test.identity.key,
      text: `- ${test.identity.file}:${String(test.identity.line)} — unexpected`,
    })),
  ]
    .sort((left, right) => left.key.localeCompare(right.key))
    .slice(0, 25);
  if (affected.length > 0) {
    lines.push(
      '',
      '## Affected tests (up to 25)',
      '',
      ...affected.map(({ text }) => text),
    );
  }
  return lines.join('\n');
}
