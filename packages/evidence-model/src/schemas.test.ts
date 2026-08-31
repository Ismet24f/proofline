import { describe, expect, it } from 'vitest';

import { changedFileSchema, parseInventory, testDefinitionSchema } from './schemas.js';

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
