import type { ReconciliationReport } from '@proofline/evidence-model';
import { describe, expect, it } from 'vitest';

import { renderGitHubSummary } from './summary.js';

const producer = { id: 'e2e', shard: { current: 1, total: 1 } } as const;

function report(
  overrides: Partial<ReconciliationReport> = {},
): ReconciliationReport {
  return {
    schemaVersion: 1,
    toolVersion: '0.1.0',
    repository: 'acme/checkout',
    revision: 'a'.repeat(40),
    runId: '123456789',
    runAttempt: 1,
    mode: 'report-only',
    generatedAt: '2026-01-01T00:00:00.000Z',
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    manifest: { schemaVersion: 1, producers: [producer] },
    topology: [{ producer, status: 'received', reasonCodes: [] }],
    tests: [],
    unexpectedTests: [],
    counts: {
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
    },
    status: 'complete',
    exitDecision: { code: 0, reasonCodes: [] },
    ...overrides,
  };
}

describe('renderGitHubSummary', () => {
  it('renders a complete report as exactly three non-empty lines', () => {
    const summary = renderGitHubSummary(
      report({
        counts: {
          ...report().counts,
          plannedActive: 2,
          executedAsExpected: 2,
        },
      }),
    );

    expect(summary.split('\n')).toEqual([
      '✅ COMPLETE — all 2 active planned tests produced terminal evidence',
      'Producers: 1/1 received · Planned disabled: 0',
      'Results: 2 expected · 0 retry-masked · 0 failed · 0 unexpected',
    ]);
  });

  it('caps affected identities at 25 and explains a producer with no plan', () => {
    const affected = Array.from({ length: 30 }, (_, index) => ({
      producer,
      identity: {
        key: JSON.stringify([
          'chromium',
          `id-${String(index).padStart(2, '0')}`,
        ]),
        projectName: 'chromium',
        playwrightTestId: `id-${String(index).padStart(2, '0')}`,
        file: `tests/case-${String(index).padStart(2, '0')}.spec.ts`,
        line: index + 1,
        column: 1,
        titlePath: ['suite', `case ${String(index)}`],
      },
      expectedStatus: 'passed' as const,
      classification: 'absent' as const,
      reasonCodes: ['test_absent'],
    }));
    const missing = { id: 'ui', shard: { current: 1, total: 1 } } as const;
    const summary = renderGitHubSummary(
      report({
        manifest: { schemaVersion: 1, producers: [producer, missing] },
        topology: [
          { producer, status: 'received', reasonCodes: [] },
          {
            producer: missing,
            status: 'missing',
            reasonCodes: ['producer_plan_missing'],
          },
        ],
        tests: affected,
        counts: {
          ...report().counts,
          plannedActive: 30,
          absent: 30,
          producerGaps: 1,
          knownTestGaps: 30,
          notExecuted: 30,
        },
        status: 'evidence_gaps',
      }),
    );

    expect(summary).toContain(
      'tests for this producer cannot be named because its plan was never produced',
    );
    expect(summary.match(/^- tests\/case-/gmu)).toHaveLength(25);
    expect(summary).toContain('- tests/case-24.spec.ts:25 — absent');
    expect(summary).not.toContain('tests/case-25.spec.ts');
  });

  it('renders the stable tool-error headline', () => {
    expect(
      renderGitHubSummary(
        report({
          status: 'tool_error',
          counts: { ...report().counts, toolErrors: 1 },
          exitDecision: { code: 2, reasonCodes: ['artifact_invalid'] },
        }),
      ).split('\n')[0],
    ).toBe('❌ TOOL ERROR — Proofline could not evaluate this run');
  });

  it('escapes report-controlled paths before writing Markdown', () => {
    const unsafeFile =
      'tests/a|name\n## injected [link](https://example.com).spec.ts';
    const summary = renderGitHubSummary(
      report({
        tests: [
          {
            producer,
            identity: {
              key: '["chromium","unsafe"]',
              projectName: 'chromium',
              playwrightTestId: 'unsafe',
              file: unsafeFile,
              line: 1,
              column: 1,
              titlePath: ['unsafe'],
            },
            expectedStatus: 'passed',
            classification: 'absent',
            reasonCodes: ['test_absent'],
          },
        ],
        counts: {
          ...report().counts,
          plannedActive: 1,
          absent: 1,
          knownTestGaps: 1,
          notExecuted: 1,
        },
        status: 'evidence_gaps',
      }),
    );

    expect(summary).not.toContain('\n## injected');
    expect(summary).toContain(
      'tests/a\\|name \\#\\# injected \\[link\\](https://example.com).spec.ts:1',
    );
  });
});
