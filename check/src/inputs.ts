import type {
  ProducerRef,
  ReconciliationMode,
} from '@proofline/evidence-model';

export interface ActionsPort {
  readonly env: NodeJS.ProcessEnv;
  getInput(name: string): string;
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
  appendSummary(markdown: string): void;
}

export function parseShard(input: string): ProducerRef['shard'] {
  const match = /^(\d+)\/(\d+)$/u.exec(input || '1/1');
  const current = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (
    match === null ||
    !Number.isInteger(current) ||
    !Number.isInteger(total) ||
    current < 1 ||
    total < 1 ||
    current > total ||
    total > 1000
  ) {
    throw new Error(`invalid shard: ${input}`);
  }
  return { current, total };
}

export function producerFrom(port: ActionsPort): ProducerRef {
  return {
    id: port.getInput('producer'),
    shard: parseShard(port.getInput('shard')),
  };
}

export function reconciliationMode(input: string): ReconciliationMode {
  const mode = input || 'report-only';
  if (mode !== 'report-only' && mode !== 'enforce-evidence') {
    throw new Error(`invalid reconciliation mode: ${input}`);
  }
  return mode;
}

export function requiredInput(port: ActionsPort, name: string): string {
  const value = port.getInput(name);
  if (value.length === 0) {
    throw new Error(`${name} input is required`);
  }
  return value;
}
