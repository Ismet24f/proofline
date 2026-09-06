import { describe, expect, it } from 'vitest';

import {
  classificationSchema,
  parsePlanArtifact,
  parseReconciliationReport,
  parseResultEnvelope,
  producerManifestSchema,
  producerRefSchema,
} from './completeness-schemas.js';

const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const producer = { id: 'e2e', shard: { current: 1, total: 3 } };
const identity = {
  key: '["chromium","pw-id-1"]',
  projectName: 'chromium',
  playwrightTestId: 'pw-id-1',
  file: 'checkout.spec.ts',
  line: 10,
  column: 3,
  titlePath: ['checkout', 'pays'],
};
const selection = {
  configFile: 'playwright.config.ts',
  rootDir: 'tests',
  playwrightVersion: '1.62.1',
  shard: { current: 1, total: 3 },
  cli: ['--project=chromium'],
  configuredProjects: ['chromium', 'firefox'],
};
const plan = {
  schemaVersion: 1,
  repository: 'acme/checkout',
  revision,
  headRevision: 'c'.repeat(40),
  producer,
  selection,
  generatedAt: '2026-09-06T10:00:00.000Z',
  tests: [{ identity, expectedStatus: 'passed' }],
  digest,
};
const envelope = {
  schemaVersion: 1,
  repository: 'acme/checkout',
  revision,
  headRevision: 'c'.repeat(40),
  runId: '12345678901234567890',
  runAttempt: 2,
  producer,
  planDigest: digest,
  reportPath: 'proofline/report.json',
  reportDigest: 'd'.repeat(64),
  collectedAt: '2026-09-06T10:05:00.000Z',
  selectionCheck: { status: 'match' },
};

const counts = {
  plannedActive: 1,
  plannedDisabled: 0,
  executedAsExpected: 1,
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

const report = {
  schemaVersion: 1,
  toolVersion: '0.1.0',
  repository: 'acme/checkout',
  revision,
  runId: '12345678901234567890',
  runAttempt: 2,
  mode: 'report-only',
  generatedAt: '2026-09-06T10:06:00.000Z',
  evaluatedAt: '2026-09-06T10:06:01.000Z',
  manifest: { schemaVersion: 1, producers: [producer] },
  topology: [
    {
      producer,
      status: 'received',
      planDigest: digest,
      reportDigest: 'd'.repeat(64),
      selectionCheck: { status: 'match' },
      reasonCodes: [],
    },
  ],
  tests: [
    {
      producer,
      identity,
      expectedStatus: 'passed',
      classification: 'executed_as_expected',
      reasonCodes: [],
    },
  ],
  unexpectedTests: [],
  counts,
  status: 'complete',
  exitDecision: { code: 0, reasonCodes: [] },
};

describe('producerRefSchema', () => {
  it.each([
    [{ id: 'E2E', shard: { current: 1, total: 1 } }, 'id'],
    [{ id: 'e2e', shard: { current: 0, total: 1 } }, 'current'],
    [{ id: 'e2e', shard: { current: 2, total: 1 } }, 'current'],
    [{ id: 'e2e', shard: { current: 1, total: 0 } }, 'total'],
  ])('rejects invalid producer reference %#', (value, field) => {
    expect(() => producerRefSchema.parse(value)).toThrow(field);
  });

  it('rejects unknown fields', () => {
    expect(() => producerRefSchema.parse({ ...producer, extra: true })).toThrow(
      'Unrecognized key',
    );
  });
});

describe('artifact schemas', () => {
  it('accepts a valid plan and preserves the optional head revision', () => {
    expect(parsePlanArtifact(plan).headRevision).toBe('c'.repeat(40));
  });

  it.each([
    [{ ...plan, revision: 'main' }, 'revision'],
    [{ ...plan, digest: 'abc' }, 'digest'],
    [
      {
        ...plan,
        selection: {
          ...selection,
          configuredProjects: ['chromium', 'chromium'],
        },
      },
      'configured project names must be unique',
    ],
    [
      {
        ...plan,
        selection: { ...selection, shard: { current: 2, total: 3 } },
      },
      'selection shard must equal producer shard',
    ],
    [
      {
        ...plan,
        tests: [
          { identity, expectedStatus: 'passed' },
          { identity, expectedStatus: 'passed' },
        ],
      },
      'duplicate test identity',
    ],
    [
      {
        ...plan,
        tests: [
          {
            identity: { ...identity, key: '["firefox","pw-id-1"]' },
            expectedStatus: 'passed',
          },
        ],
      },
      'identity key',
    ],
    [{ ...plan, unknown: true }, 'Unrecognized key'],
  ])('rejects an invalid plan: %s', (value, message) => {
    expect(() => parsePlanArtifact(value)).toThrow(message);
  });

  it.each([
    { status: 'match' },
    {
      status: 'mismatch',
      differences: [
        {
          field: 'cli',
          planned: '["--project=chromium"]',
          actual: '["--project=firefox"]',
        },
      ],
    },
  ])('accepts selection check %#', (selectionCheck) => {
    expect(parseResultEnvelope({ ...envelope, selectionCheck })).toMatchObject({
      selectionCheck,
    });
  });

  it.each([
    [{ ...envelope, planDigest: 'missing' }, undefined],
    [
      {
        ...envelope,
        planDigest: 'missing',
        selectionCheck: { status: 'unavailable', reason: 'plan_missing' },
      },
      'valid',
    ],
    [{ ...envelope, reportDigest: 'abc' }, 'reportDigest'],
    [{ ...envelope, revision: 'main' }, 'revision'],
    [{ ...envelope, runAttempt: 0 }, 'runAttempt'],
    [{ ...envelope, unknown: true }, 'Unrecognized key'],
  ])('validates envelope invariant %#', (value, expected) => {
    if (expected === 'valid') {
      expect(parseResultEnvelope(value).planDigest).toBe('missing');
    } else {
      expect(() => parseResultEnvelope(value)).toThrow(expected);
    }
  });
});

describe('producerManifestSchema', () => {
  it('accepts distinct producer shards', () => {
    expect(
      producerManifestSchema.parse({
        schemaVersion: 1,
        producers: [producer, { id: 'e2e', shard: { current: 2, total: 3 } }],
      }).producers,
    ).toHaveLength(2);
  });

  it('rejects duplicate producer shards', () => {
    expect(() =>
      producerManifestSchema.parse({
        schemaVersion: 1,
        producers: [producer, producer],
      }),
    ).toThrow('duplicate producer');
  });
});

describe('reconciliation report schema', () => {
  it.each([
    'executed_as_expected',
    'retry_masked',
    'failed',
    'runtime_skipped',
    'incomplete',
    'absent',
    'no_evidence',
  ])('accepts classification %s', (classification) => {
    expect(classificationSchema.parse(classification)).toBe(classification);
  });

  it('accepts a complete report', () => {
    expect(parseReconciliationReport(report)).toMatchObject({
      status: 'complete',
      evaluatedAt: '2026-09-06T10:06:01.000Z',
      topology: [{ selectionCheck: { status: 'match' } }],
    });
  });

  it.each([
    [{ ...report, evaluatedAt: 'yesterday' }, 'evaluatedAt'],
    [{ ...report, unknown: true }, 'Unrecognized key'],
  ])('rejects an invalid report artifact %#', (value, message) => {
    expect(() => parseReconciliationReport(value)).toThrow(message);
  });

  it.each([
    [
      {
        ...counts,
        plannedActive: 2,
      },
      'plannedActive',
    ],
    [
      {
        ...counts,
        runtimeSkipped: 1,
        knownTestGaps: 0,
        notExecuted: 0,
      },
      'knownTestGaps',
    ],
    [
      {
        ...counts,
        runtimeSkipped: 1,
        knownTestGaps: 1,
        notExecuted: 0,
      },
      'notExecuted',
    ],
  ])('rejects inconsistent counts %#', (invalidCounts, message) => {
    expect(() =>
      parseReconciliationReport({ ...report, counts: invalidCounts }),
    ).toThrow(message);
  });

  it.each([
    [{ ...counts, producerGaps: 1 }, 'producerGaps'],
    [{ ...counts, knownTestGaps: 1, notExecuted: 1 }, 'knownTestGaps'],
    [{ ...counts, unexpected: 1 }, 'unexpected'],
    [{ ...counts, toolErrors: 1 }, 'toolErrors'],
  ])('rejects complete status with non-zero %s', (invalidCounts, field) => {
    expect(() =>
      parseReconciliationReport({ ...report, counts: invalidCounts }),
    ).toThrow(field);
  });

  it('rejects a count that disagrees with record arrays', () => {
    expect(() =>
      parseReconciliationReport({
        ...report,
        counts: { ...counts, unexpected: 1 },
        status: 'evidence_gaps',
        exitDecision: { code: 0, reasonCodes: ['unexpected_test'] },
      }),
    ).toThrow('unexpected');
  });
});
