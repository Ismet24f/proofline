import { describe, expect, it } from 'vitest';

import { resolveTestIdentity } from './identity.js';

describe('resolveTestIdentity', () => {
  it('prefers an explicit proofline.id annotation', () => {
    expect(
      resolveTestIdentity({
        repository: 'acme/payments',
        file: 'tests/export.spec.ts',
        titlePath: ['invoice', 'exports CSV'],
        annotations: [{ type: 'proofline.id', description: 'PL-T-00421' }],
      }),
    ).toEqual({ id: 'PL-T-00421', stability: 'EXPLICIT' });
  });

  it('derives the same provisional ID for identical logical input', () => {
    const input = {
      repository: 'acme/payments',
      file: 'tests/export.spec.ts',
      titlePath: ['invoice', 'exports CSV'],
      annotations: [],
    };

    expect(resolveTestIdentity(input)).toEqual(resolveTestIdentity(input));
  });

  it('normalizes Windows separators before deriving a provisional ID', () => {
    expect(
      resolveTestIdentity({
        repository: 'acme/payments',
        file: String.raw`tests\export.spec.ts`,
        titlePath: ['invoice', 'exports CSV'],
        annotations: [],
      }),
    ).toEqual({ id: 'PL-P-87214fc28e124b06c2bd', stability: 'PROVISIONAL' });
  });

  it('rejects multiple proofline.id annotations', () => {
    expect(() =>
      resolveTestIdentity({
        repository: 'acme/payments',
        file: 'tests/export.spec.ts',
        titlePath: ['invoice', 'exports CSV'],
        annotations: [
          { type: 'proofline.id', description: 'PL-T-00421' },
          { type: 'proofline.id', description: 'PL-T-00422' },
        ],
      }),
    ).toThrow('multiple proofline.id annotations');
  });

  it.each(['PL-T-1', 'PL-P-aaaaaaaaaaaaaaaaaaaa', ' PL-T-00421'])('rejects invalid explicit ID %s', (id) => {
    expect(() =>
      resolveTestIdentity({
        repository: 'acme/payments',
        file: 'tests/export.spec.ts',
        titlePath: ['invoice', 'exports CSV'],
        annotations: [{ type: 'proofline.id', description: id }],
      }),
    ).toThrow(`invalid proofline.id: ${id}`);
  });
});
