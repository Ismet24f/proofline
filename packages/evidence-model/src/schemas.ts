import { z } from 'zod';

import type { TestInventory } from './types.js';

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
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const stableTestIdSchema = z
  .string()
  .regex(/^(PL-T-[0-9]{5,}|PL-P-[a-f0-9]{20})$/, 'must be a stable test ID');

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
    if (
      testDefinition.id.startsWith('PL-T-') &&
      testDefinition.stability !== 'EXPLICIT'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['stability'],
        message: 'PL-T IDs require EXPLICIT stability',
      });
    }

    if (
      testDefinition.id.startsWith('PL-P-') &&
      testDefinition.stability !== 'PROVISIONAL'
    ) {
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

export function parseInventory(input: unknown): TestInventory {
  const inventory = testInventorySchema.parse(input);
  const ids = inventory.tests.map((test) => test.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('tests: duplicate stable test IDs are forbidden');
  }
  return inventory;
}
