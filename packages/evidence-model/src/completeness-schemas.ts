import { z } from 'zod';

import type {
  PlanArtifact,
  ReconciliationReport,
  ResultEnvelope,
} from './completeness-types.js';

const nonEmptyTrimmedString = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'must be trimmed');
const revisionSchema = z
  .string()
  .regex(
    /^[a-f0-9]{40}$/,
    'must be a lowercase 40-character hexadecimal revision',
  );
const digestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'must be a lowercase SHA-256 digest');
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const reasonCodesSchema = z.array(nonEmptyTrimmedString);

const shardSchema = z
  .object({
    current: positiveInteger,
    total: positiveInteger.max(1_000),
  })
  .strict()
  .superRefine((shard, context) => {
    if (shard.current > shard.total) {
      context.addIssue({
        code: 'custom',
        path: ['current'],
        message: 'current must be less than or equal to total',
      });
    }
  });

export const producerRefSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,32}$/, 'invalid producer id'),
    shard: shardSchema,
  })
  .strict();

export const selectionDescriptorSchema = z
  .object({
    configFile: nonEmptyTrimmedString,
    rootDir: nonEmptyTrimmedString,
    playwrightVersion: nonEmptyTrimmedString,
    shard: shardSchema,
    cli: z.array(nonEmptyTrimmedString),
    configuredProjects: z.array(nonEmptyTrimmedString),
  })
  .strict()
  .superRefine((selection, context) => {
    if (
      new Set(selection.configuredProjects).size !==
      selection.configuredProjects.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['configuredProjects'],
        message: 'configured project names must be unique',
      });
    }
  });

export const testIdentitySchema = z
  .object({
    key: nonEmptyTrimmedString,
    projectName: nonEmptyTrimmedString,
    playwrightTestId: nonEmptyTrimmedString,
    file: nonEmptyTrimmedString,
    line: positiveInteger,
    column: positiveInteger,
    titlePath: z.array(nonEmptyTrimmedString).min(1),
  })
  .strict()
  .superRefine((identity, context) => {
    const canonicalKey = JSON.stringify([
      identity.projectName,
      identity.playwrightTestId,
    ]);
    if (identity.key !== canonicalKey) {
      context.addIssue({
        code: 'custom',
        path: ['key'],
        message: 'identity key must equal [projectName, playwrightTestId]',
      });
    }
  });

export const plannedExpectedStatusSchema = z.enum([
  'passed',
  'failed',
  'skipped',
  'timedOut',
  'interrupted',
]);

export const plannedTestSchema = z
  .object({
    identity: testIdentitySchema,
    expectedStatus: plannedExpectedStatusSchema,
  })
  .strict();

export const planArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: nonEmptyTrimmedString,
    revision: revisionSchema,
    headRevision: revisionSchema.optional(),
    producer: producerRefSchema,
    selection: selectionDescriptorSchema,
    generatedAt: isoDateTimeSchema,
    tests: z.array(plannedTestSchema),
    digest: digestSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const keys = plan.tests.map((test) => test.identity.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['tests'],
        message: 'duplicate test identity',
      });
    }
    if (
      plan.producer.shard.current !== plan.selection.shard.current ||
      plan.producer.shard.total !== plan.selection.shard.total
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selection', 'shard'],
        message: 'selection shard must equal producer shard',
      });
    }
  });

const selectionDifferenceSchema = z
  .object({
    field: nonEmptyTrimmedString,
    planned: z.string(),
    actual: z.string(),
  })
  .strict();

export const selectionCheckSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('match') }).strict(),
  z
    .object({
      status: z.literal('mismatch'),
      differences: z.array(selectionDifferenceSchema).min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      reason: z.literal('plan_missing'),
    })
    .strict(),
]);

export const resultEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: nonEmptyTrimmedString,
    revision: revisionSchema,
    headRevision: revisionSchema.optional(),
    runId: z.string().regex(/^\d+$/, 'runId must contain only digits'),
    runAttempt: positiveInteger,
    producer: producerRefSchema,
    planDigest: z.union([digestSchema, z.literal('missing')]),
    reportPath: nonEmptyTrimmedString,
    reportDigest: digestSchema,
    collectedAt: isoDateTimeSchema,
    selectionCheck: selectionCheckSchema,
  })
  .strict()
  .superRefine((envelope, context) => {
    const planMissing = envelope.planDigest === 'missing';
    const selectionUnavailable =
      envelope.selectionCheck.status === 'unavailable';
    if (planMissing !== selectionUnavailable) {
      context.addIssue({
        code: 'custom',
        path: ['planDigest'],
        message:
          'missing plan digest requires unavailable selection check and vice versa',
      });
    }
  });

const producerKey = (producer: {
  id: string;
  shard: { current: number; total: number };
}) =>
  [producer.id, producer.shard.current, producer.shard.total]
    .map(String)
    .join(':');

export const producerManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    producers: z.array(producerRefSchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = manifest.producers.map(producerKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['producers'],
        message: 'duplicate producer shard',
      });
    }
  });

export const classificationSchema = z.enum([
  'executed_as_expected',
  'retry_masked',
  'failed',
  'runtime_skipped',
  'incomplete',
  'absent',
  'no_evidence',
]);

const producerEvidenceRecordSchema = z
  .object({
    producer: producerRefSchema,
    status: z.enum(['received', 'missing', 'duplicate', 'invalid']),
    planDigest: digestSchema.optional(),
    reportDigest: digestSchema.optional(),
    selectionCheck: selectionCheckSchema.optional(),
    reasonCodes: reasonCodesSchema,
  })
  .strict();

const plannedEvidenceRecordSchema = z
  .object({
    producer: producerRefSchema,
    identity: testIdentitySchema,
    expectedStatus: plannedExpectedStatusSchema,
    classification: classificationSchema,
    reasonCodes: reasonCodesSchema,
  })
  .strict();

const unexpectedEvidenceRecordSchema = z
  .object({
    producer: producerRefSchema,
    identity: testIdentitySchema,
    reasonCodes: reasonCodesSchema,
  })
  .strict();

export const reconciliationCountsSchema = z
  .object({
    plannedActive: nonNegativeInteger,
    plannedDisabled: nonNegativeInteger,
    executedAsExpected: nonNegativeInteger,
    retryMasked: nonNegativeInteger,
    failed: nonNegativeInteger,
    runtimeSkipped: nonNegativeInteger,
    incomplete: nonNegativeInteger,
    absent: nonNegativeInteger,
    noEvidence: nonNegativeInteger,
    producerGaps: nonNegativeInteger,
    knownTestGaps: nonNegativeInteger,
    notExecuted: nonNegativeInteger,
    unexpected: nonNegativeInteger,
    toolErrors: nonNegativeInteger,
  })
  .strict()
  .superRefine((counts, context) => {
    const classified =
      counts.executedAsExpected +
      counts.retryMasked +
      counts.failed +
      counts.runtimeSkipped +
      counts.incomplete +
      counts.absent +
      counts.noEvidence;
    const knownTestGaps =
      counts.runtimeSkipped +
      counts.incomplete +
      counts.absent +
      counts.noEvidence;
    if (counts.plannedActive !== classified) {
      context.addIssue({
        code: 'custom',
        path: ['plannedActive'],
        message: 'plannedActive must equal classified active tests',
      });
    }
    if (counts.knownTestGaps !== knownTestGaps) {
      context.addIssue({
        code: 'custom',
        path: ['knownTestGaps'],
        message: 'knownTestGaps must equal incomplete execution classes',
      });
    }
    if (counts.notExecuted !== counts.knownTestGaps) {
      context.addIssue({
        code: 'custom',
        path: ['notExecuted'],
        message: 'notExecuted must equal knownTestGaps',
      });
    }
  });

export const reconciliationReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    toolVersion: nonEmptyTrimmedString,
    repository: nonEmptyTrimmedString,
    revision: revisionSchema,
    headRevision: revisionSchema.optional(),
    runId: z.string().regex(/^\d+$/, 'runId must contain only digits'),
    runAttempt: positiveInteger,
    mode: z.enum(['report-only', 'enforce-evidence']),
    generatedAt: isoDateTimeSchema,
    evaluatedAt: isoDateTimeSchema,
    manifest: producerManifestSchema,
    topology: z.array(producerEvidenceRecordSchema),
    tests: z.array(plannedEvidenceRecordSchema),
    unexpectedTests: z.array(unexpectedEvidenceRecordSchema),
    counts: reconciliationCountsSchema,
    status: z.enum(['complete', 'evidence_gaps', 'tool_error']),
    exitDecision: z
      .object({
        code: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        reasonCodes: reasonCodesSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const topologyKeys = report.topology.map((record) =>
      producerKey(record.producer),
    );
    if (new Set(topologyKeys).size !== topologyKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['topology'],
        message: 'duplicate producer topology record',
      });
    }

    const testKeys = report.tests.map(
      (record) => `${producerKey(record.producer)}:${record.identity.key}`,
    );
    if (new Set(testKeys).size !== testKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['tests'],
        message: 'duplicate planned evidence record',
      });
    }

    const classifications = {
      executed_as_expected: 0,
      retry_masked: 0,
      failed: 0,
      runtime_skipped: 0,
      incomplete: 0,
      absent: 0,
      no_evidence: 0,
    };
    for (const record of report.tests) {
      classifications[record.classification] += 1;
    }
    const expectedClassificationCounts = {
      executedAsExpected: classifications.executed_as_expected,
      retryMasked: classifications.retry_masked,
      failed: classifications.failed,
      runtimeSkipped: classifications.runtime_skipped,
      incomplete: classifications.incomplete,
      absent: classifications.absent,
      noEvidence: classifications.no_evidence,
    };
    for (const [field, expected] of Object.entries(
      expectedClassificationCounts,
    )) {
      const actual = report.counts[field as keyof typeof report.counts];
      if (actual !== expected) {
        context.addIssue({
          code: 'custom',
          path: ['counts', field],
          message: `${field} must equal matching test records`,
        });
      }
    }

    if (report.counts.plannedActive !== report.tests.length) {
      context.addIssue({
        code: 'custom',
        path: ['counts', 'plannedActive'],
        message: 'plannedActive must equal planned evidence records',
      });
    }
    if (report.counts.unexpected !== report.unexpectedTests.length) {
      context.addIssue({
        code: 'custom',
        path: ['counts', 'unexpected'],
        message: 'unexpected must equal unexpected test records',
      });
    }

    const producerGaps = report.topology.filter(
      (record) => record.status !== 'received',
    ).length;
    if (report.counts.producerGaps !== producerGaps) {
      context.addIssue({
        code: 'custom',
        path: ['counts', 'producerGaps'],
        message: 'producerGaps must equal non-received topology records',
      });
    }

    if (report.status === 'complete') {
      for (const field of [
        'producerGaps',
        'knownTestGaps',
        'unexpected',
        'toolErrors',
      ] as const) {
        if (report.counts[field] !== 0) {
          context.addIssue({
            code: 'custom',
            path: ['counts', field],
            message: `complete status requires zero ${field}`,
          });
        }
      }
    }
  });

export function parsePlanArtifact(input: unknown): PlanArtifact {
  return planArtifactSchema.parse(input);
}

export function parseResultEnvelope(input: unknown): ResultEnvelope {
  return resultEnvelopeSchema.parse(input);
}

export function parseReconciliationReport(
  input: unknown,
): ReconciliationReport {
  return reconciliationReportSchema.parse(input);
}
