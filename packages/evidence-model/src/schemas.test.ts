import { describe, expect, it } from 'vitest';

import {
  changedFileSchema,
  evidenceAssertionSchema,
  parseInventory,
  releaseDecisionSchema,
  testDefinitionSchema,
} from './schemas.js';

const testDefinition = {
  id: 'PL-T-00001',
  stability: 'EXPLICIT',
  title: 'checks a payment',
  titlePath: ['payments', 'checks a payment'],
  file: 'tests/payments.spec.ts',
  line: 1,
  projects: [],
  tags: [],
  annotations: [],
  capabilities: [],
  risks: [],
  requirements: [],
  status: 'ACTIVE',
};

const evidenceAssertion = {
  id: 'payment evidence',
  state: 'VERIFIED',
  revision: 'a'.repeat(40),
  environment: 'staging',
  observedAt: '2026-08-31T12:00:00.000Z',
  evidenceIds: ['evidence-1'],
};

const releaseDecision = {
  schemaVersion: 1,
  verdict: 'PASS',
  revision: 'a'.repeat(40),
  environment: 'staging',
  evaluatedAt: '2026-08-31T12:00:00.000Z',
  assertions: [evidenceAssertion],
  violations: [],
};

describe('parseInventory', () => {
  it('accepts a versioned inventory', () => {
    const result = parseInventory({
      schemaVersion: 1,
      repository: 'acme/payments',
      revision: 'a'.repeat(40),
      generatedAt: '2026-08-31T12:00:00.000Z',
      tests: [],
    });
    expect(result.schemaVersion).toBe(1);
  });

  it.each([
    [{ repository: 'acme/payments', tests: [] }, 'schemaVersion'],
    [{ schemaVersion: 2, repository: 'acme/payments', tests: [] }, 'schemaVersion'],
    [{ schemaVersion: 1, repository: '', tests: [] }, 'repository'],
  ])('rejects invalid payload %#', (payload, field) => {
    expect(() => parseInventory(payload)).toThrow(field);
  });

  it.each([
    ['PL-T-00001', 'EXPLICIT'],
    ['PL-P-aaaaaaaaaaaaaaaaaaaa', 'PROVISIONAL'],
  ])('accepts stable test ID %s', (id, stability) => {
    expect(testDefinitionSchema.parse({ ...testDefinition, id, stability }).id).toBe(id);
  });

  it.each(['PL-T-1', 'PL-P-AAAAAAAAAAAAAAAAAAAA'])('rejects malformed stable test ID %s', (id) => {
    expect(() => testDefinitionSchema.parse({ ...testDefinition, id })).toThrow('id');
  });

  it.each([
    [{ id: 'PL-T-00001', stability: 'PROVISIONAL' }, 'PL-T IDs require EXPLICIT stability'],
    [{ id: 'PL-P-aaaaaaaaaaaaaaaaaaaa', stability: 'EXPLICIT' }, 'PL-P IDs require PROVISIONAL stability'],
  ])('rejects test identity/stability mismatch: %s', (identity) => {
    expect(() => testDefinitionSchema.parse({ ...testDefinition, ...identity })).toThrow('stability');
  });

  it('rejects duplicate stable test IDs in an inventory', () => {
    expect(() =>
      parseInventory({
        schemaVersion: 1,
        repository: 'acme/payments',
        revision: 'a'.repeat(40),
        generatedAt: '2026-08-31T12:00:00.000Z',
        tests: [testDefinition, testDefinition],
      }),
    ).toThrow('duplicate stable test IDs');
  });

  it('requires oldPath exactly for renamed files', () => {
    expect(changedFileSchema.parse({ status: 'RENAMED', path: 'new.ts', oldPath: 'old.ts' })).toMatchObject({
      oldPath: 'old.ts',
    });
    expect(() => changedFileSchema.parse({ status: 'RENAMED', path: 'new.ts' })).toThrow('oldPath');
    expect(() => changedFileSchema.parse({ status: 'MODIFIED', path: 'file.ts', oldPath: 'old.ts' })).toThrow(
      'oldPath',
    );
  });
});

describe('evidenceAssertionSchema', () => {
  it.each([
    ['VERIFIED', [], undefined],
    ['CODE_VALIDATED', [], undefined],
    ['FAILED', [], undefined],
    ['BLOCKED', [], undefined],
    ['NOT_AFFECTED', [], undefined],
    ['ACCEPTED_RISK', [], 'approved verbally'],
  ])('rejects %s without its required support', (state, evidenceIds, message) => {
    expect(evidenceAssertionSchema.safeParse({ ...evidenceAssertion, state, evidenceIds, message }).success).toBe(false);
  });

  it.each([
    ['FAILED', ['evidence-1'], undefined],
    ['FAILED', [], 'payment failed'],
    ['BLOCKED', ['evidence-1'], undefined],
    ['BLOCKED', [], 'test environment unavailable'],
    ['NOT_AFFECTED', ['evidence-1'], undefined],
    ['NOT_AFFECTED', [], 'payment flow is unchanged'],
    ['UNTESTED', [], undefined],
    ['UNKNOWN', [], undefined],
    ['ACCEPTED_RISK', ['evidence-1'], undefined],
  ])('accepts %s with valid support', (state, evidenceIds, message) => {
    expect(evidenceAssertionSchema.safeParse({ ...evidenceAssertion, state, evidenceIds, message }).success).toBe(true);
  });
});

describe('releaseDecisionSchema', () => {
  it.each([
    ['a policy violation', { violations: [{ code: 'blocking-policy', message: 'payment is unsafe', evidenceIds: [] }] }],
    ['a FAILED assertion', { assertions: [{ ...evidenceAssertion, state: 'FAILED' }] }],
    ['a BLOCKED assertion', { assertions: [{ ...evidenceAssertion, state: 'BLOCKED' }] }],
    ['an UNTESTED assertion', { assertions: [{ ...evidenceAssertion, state: 'UNTESTED', evidenceIds: [] }] }],
    ['an UNKNOWN assertion', { assertions: [{ ...evidenceAssertion, state: 'UNKNOWN', evidenceIds: [] }] }],
  ])('rejects PASS with %s', (_description, override) => {
    expect(releaseDecisionSchema.safeParse({ ...releaseDecision, ...override }).success).toBe(false);
  });

  it('rejects HOLD without a violation, FAILED assertion, or BLOCKED assertion', () => {
    expect(releaseDecisionSchema.safeParse({ ...releaseDecision, verdict: 'HOLD' }).success).toBe(false);
  });

  it.each([
    ['a policy violation', { violations: [{ code: 'blocking-policy', message: 'payment is unsafe', evidenceIds: [] }] }],
    ['a FAILED assertion', { assertions: [{ ...evidenceAssertion, state: 'FAILED' }] }],
    ['a BLOCKED assertion', { assertions: [{ ...evidenceAssertion, state: 'BLOCKED' }] }],
  ])('accepts HOLD with %s', (_description, override) => {
    expect(releaseDecisionSchema.safeParse({ ...releaseDecision, verdict: 'HOLD', ...override }).success).toBe(true);
  });

  it('rejects INCOMPLETE without an UNTESTED or UNKNOWN assertion', () => {
    expect(releaseDecisionSchema.safeParse({ ...releaseDecision, verdict: 'INCOMPLETE' }).success).toBe(false);
  });

  it.each([
    ['an UNTESTED assertion', { assertions: [{ ...evidenceAssertion, state: 'UNTESTED', evidenceIds: [] }] }],
    ['an UNKNOWN assertion', { assertions: [{ ...evidenceAssertion, state: 'UNKNOWN', evidenceIds: [] }] }],
  ])('accepts INCOMPLETE with %s', (_description, override) => {
    expect(releaseDecisionSchema.safeParse({ ...releaseDecision, verdict: 'INCOMPLETE', ...override }).success).toBe(true);
  });
});
