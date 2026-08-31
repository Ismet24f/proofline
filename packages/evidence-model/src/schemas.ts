import { z } from 'zod';

import type { TestInventory } from './types.js';

const nonEmptyTrimmedString = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'must be trimmed');
const revisionSchema = z.string().regex(/^[a-f0-9]{40}$/, 'must be a lowercase 40-character hexadecimal revision');
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const stableTestIdSchema = z.string().regex(/^(PL-T-[0-9]{5,}|PL-P-[a-f0-9]{20})$/, 'must be a stable test ID');

export const annotationSchema = z
  .object({
    type: nonEmptyTrimmedString,
    description: nonEmptyTrimmedString,
  })
  .strict();

export const testDefinitionSchema = z
  .object({
    id: stableTestIdSchema,
    stability: z.enum(['EXPLICIT', 'PROVISIONAL']),
    title: nonEmptyTrimmedString,
    titlePath: z.array(nonEmptyTrimmedString),
    file: nonEmptyTrimmedString,
    line: z.number().int().positive(),
    projects: z.array(nonEmptyTrimmedString),
    tags: z.array(nonEmptyTrimmedString),
    annotations: z.array(annotationSchema),
    capabilities: z.array(nonEmptyTrimmedString),
    risks: z.array(nonEmptyTrimmedString),
    requirements: z.array(nonEmptyTrimmedString),
    status: z.enum(['ACTIVE', 'SKIPPED', 'DISABLED']),
  })
  .strict()
  .superRefine((testDefinition, context) => {
    if (testDefinition.id.startsWith('PL-T-') && testDefinition.stability !== 'EXPLICIT') {
      context.addIssue({
        code: 'custom',
        path: ['stability'],
        message: 'PL-T IDs require EXPLICIT stability',
      });
    }

    if (testDefinition.id.startsWith('PL-P-') && testDefinition.stability !== 'PROVISIONAL') {
      context.addIssue({
        code: 'custom',
        path: ['stability'],
        message: 'PL-P IDs require PROVISIONAL stability',
      });
    }
  });

export const testInventorySchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: nonEmptyTrimmedString,
    revision: revisionSchema,
    generatedAt: isoDateTimeSchema,
    tests: z.array(testDefinitionSchema),
  })
  .strict();

export const changedFileSchema = z
  .object({
    status: z.enum(['ADDED', 'MODIFIED', 'DELETED', 'RENAMED']),
    path: nonEmptyTrimmedString,
    oldPath: nonEmptyTrimmedString.optional(),
  })
  .strict()
  .superRefine((changedFile, context) => {
    if (changedFile.status === 'RENAMED' && changedFile.oldPath === undefined) {
      context.addIssue({ code: 'custom', path: ['oldPath'], message: 'oldPath is required for RENAMED files' });
    }

    if (changedFile.status !== 'RENAMED' && changedFile.oldPath !== undefined) {
      context.addIssue({ code: 'custom', path: ['oldPath'], message: 'oldPath is allowed only for RENAMED files' });
    }
  });

export const recommendationReasonSchema = z
  .object({
    code: z.enum([
      'DIRECT_PATH_MAP',
      'SHARED_CAPABILITY',
      'SHARED_RISK',
      'REQUIREMENT_REFERENCE',
      'CRITICAL_RISK_POLICY',
      'NO_COVERING_TEST',
    ]),
    path: nonEmptyTrimmedString,
  })
  .strict();

export const recommendedTestSchema = z
  .object({
    testId: stableTestIdSchema,
    tier: z.enum(['MANDATORY', 'RECOMMENDED', 'EXTENDED']),
    capabilities: z.array(nonEmptyTrimmedString),
    risks: z.array(nonEmptyTrimmedString),
    reasons: z.array(recommendationReasonSchema).min(1),
  })
  .strict();

export const unmappedRiskSchema = z
  .object({
    riskId: nonEmptyTrimmedString,
    capabilityId: nonEmptyTrimmedString.optional(),
    tier: z.literal('UNMAPPED_RISK'),
    reasons: z.array(recommendationReasonSchema).min(1),
  })
  .strict();

export const regressionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: nonEmptyTrimmedString,
    baseRevision: revisionSchema,
    headRevision: revisionSchema,
    generatedAt: isoDateTimeSchema,
    tests: z.array(recommendedTestSchema),
    unmappedRisks: z.array(unmappedRiskSchema),
  })
  .strict();

export const evidenceAssertionSchema = z
  .object({
    id: nonEmptyTrimmedString,
    state: z.enum([
      'VERIFIED',
      'FAILED',
      'BLOCKED',
      'CODE_VALIDATED',
      'UNTESTED',
      'NOT_AFFECTED',
      'ACCEPTED_RISK',
      'UNKNOWN',
    ]),
    revision: revisionSchema,
    environment: nonEmptyTrimmedString,
    observedAt: isoDateTimeSchema,
    riskId: nonEmptyTrimmedString.optional(),
    capabilityId: nonEmptyTrimmedString.optional(),
    testId: stableTestIdSchema.optional(),
    evidenceIds: z.array(nonEmptyTrimmedString),
    message: nonEmptyTrimmedString.optional(),
  })
  .strict();

export const policyViolationSchema = z
  .object({
    code: nonEmptyTrimmedString,
    message: nonEmptyTrimmedString,
    evidenceIds: z.array(nonEmptyTrimmedString),
    riskId: nonEmptyTrimmedString.optional(),
    testId: stableTestIdSchema.optional(),
  })
  .strict();

export const releaseDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    verdict: z.enum(['PASS', 'HOLD', 'INCOMPLETE']),
    revision: revisionSchema,
    environment: nonEmptyTrimmedString,
    evaluatedAt: isoDateTimeSchema,
    assertions: z.array(evidenceAssertionSchema),
    violations: z.array(policyViolationSchema),
  })
  .strict();

export function parseInventory(input: unknown): TestInventory {
  const inventory = testInventorySchema.parse(input);
  const ids = inventory.tests.map((test) => test.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('tests: duplicate stable test IDs are forbidden');
  }
  return inventory;
}
