import { describe, expect, it } from 'vitest';

import { parseProducerManifest } from './manifest.js';

describe('parseProducerManifest', () => {
  it('normalizes whitespace and sorts producers then shards', () => {
    expect(parseProducerManifest(' zeta = 1, api=2 ,e2e = 1 ')).toEqual([
      { id: 'api', shard: { current: 1, total: 2 } },
      { id: 'api', shard: { current: 2, total: 2 } },
      { id: 'e2e', shard: { current: 1, total: 1 } },
      { id: 'zeta', shard: { current: 1, total: 1 } },
    ]);
  });

  it('rejects duplicate producer IDs before expanding shards', () => {
    expect(() => parseProducerManifest('e2e=1,api=1,e2e=2')).toThrow(
      'duplicate producer id: e2e',
    );
  });

  it.each(['E2E=1', 'e2e_api=1', '=1', 'e2e=1=2'])(
    'rejects invalid manifest entry %s',
    (input) => {
      expect(() => parseProducerManifest(input)).toThrow(
        'invalid producer manifest entry',
      );
    },
  );

  it.each(['e2e=0', 'e2e=-1', 'e2e=1.5', 'e2e=1001', 'e2e=NaN'])(
    'rejects invalid shard count in %s',
    (input) => {
      expect(() => parseProducerManifest(input)).toThrow(
        'invalid producer manifest entry',
      );
    },
  );

  it('accepts exactly 100 producers and rejects the 101st', () => {
    const oneHundred = Array.from(
      { length: 100 },
      (_, index) => `p${String(index)}=1`,
    ).join(',');
    const oneHundredOne = `${oneHundred},overflow=1`;

    expect(parseProducerManifest(oneHundred)).toHaveLength(100);
    expect(() => parseProducerManifest(oneHundredOne)).toThrow(
      'producer manifest exceeds 100 producers',
    );
  });

  it('accepts exactly 1,000 total shards and rejects 1,001', () => {
    expect(parseProducerManifest('api=400,e2e=600')).toHaveLength(1000);
    expect(() => parseProducerManifest('api=401,e2e=600')).toThrow(
      'producer manifest exceeds 1000 total shards',
    );
  });
});
