import { createHash } from 'node:crypto';

import type { Annotation, TestIdentityStability } from '@proofline/evidence-model';

export interface IdentityInput {
  repository: string;
  file: string;
  titlePath: readonly string[];
  annotations: readonly Annotation[];
}

export interface TestIdentity {
  id: string;
  stability: TestIdentityStability;
}

export function resolveTestIdentity(input: IdentityInput): TestIdentity {
  const explicit = input.annotations.filter((item) => item.type === 'proofline.id');
  if (explicit.length > 1) throw new Error('multiple proofline.id annotations');

  if (explicit[0]) {
    const id = explicit[0].description;
    if (!/^PL-T-[0-9]{5,}$/.test(id)) throw new Error(`invalid proofline.id: ${id}`);
    return { id, stability: 'EXPLICIT' };
  }

  const canonical = JSON.stringify([input.repository, input.file.replaceAll('\\', '/'), input.titlePath]);
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 20);
  return { id: `PL-P-${hash}`, stability: 'PROVISIONAL' };
}
