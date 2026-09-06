import type { ProducerRef } from '@proofline/evidence-model';

const maximumProducers = 100;
const maximumTotalShards = 1000;

export function parseProducerManifest(input: string): ProducerRef[] {
  const entries = input.split(',');
  if (entries.length > maximumProducers) {
    throw new Error('producer manifest exceeds 100 producers');
  }

  const totals = new Map<string, number>();
  for (const rawEntry of entries) {
    const entry = rawEntry.trim();
    const parts = entry.split('=');
    const id = parts[0]?.trim();
    const totalText = parts[1]?.trim();
    const total = Number(totalText);
    if (
      parts.length !== 2 ||
      id === undefined ||
      !/^[a-z0-9-]{1,32}$/u.test(id) ||
      totalText === undefined ||
      totalText.length === 0 ||
      !Number.isInteger(total) ||
      total < 1 ||
      total > maximumTotalShards
    ) {
      throw new Error(`invalid producer manifest entry: ${rawEntry}`);
    }
    if (totals.has(id)) {
      throw new Error(`duplicate producer id: ${id}`);
    }
    totals.set(id, total);
  }

  const totalShards = [...totals.values()].reduce(
    (sum, total) => sum + total,
    0,
  );
  if (totalShards > maximumTotalShards) {
    throw new Error('producer manifest exceeds 1000 total shards');
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([id, total]) =>
      Array.from({ length: total }, (_, index) => ({
        id,
        shard: { current: index + 1, total },
      })),
    );
}
