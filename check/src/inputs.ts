import { isAbsolute } from 'node:path';

import type {
  ProducerRef,
  ReconciliationMode,
} from '@proofline/evidence-model';

export interface ActionsPort {
  getInput(name: string, options?: { required?: boolean }): string;
  setOutput(name: string, value: string | number): void;
  setFailed(message: string): void;
  writeSummary(markdown: string): Promise<void>;
}

export type ActionInputs = { workingDirectory: string } & (
  | {
      operation: 'plan';
      producer: ProducerRef;
      playwrightArguments: string;
      config?: string;
      repository?: string;
      revision?: string;
      out: string;
    }
  | {
      operation: 'collect';
      producer: ProducerRef;
      report: string;
      plan: string;
      out: string;
    }
  | {
      operation: 'reconcile';
      producers: string;
      artifacts: string;
      mode: ReconciliationMode;
      out: string;
      summary: boolean;
    }
);

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

export function reconciliationMode(input: string): ReconciliationMode {
  const mode = input || 'report-only';
  if (mode !== 'report-only' && mode !== 'enforce-evidence') {
    throw new Error(`invalid reconciliation mode: ${input}`);
  }
  return mode;
}

function optional(port: ActionsPort, name: string): string | undefined {
  const value = port.getInput(name);
  return value.length === 0 ? undefined : value;
}

function safePath(value: string, name: string): string {
  if (
    isAbsolute(value) ||
    value.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`unsafe path for ${name}: ${value}`);
  }
  return value;
}

function producerFrom(port: ActionsPort): ProducerRef {
  const id = port.getInput('producer', { required: true });
  if (!/^[a-z0-9-]{1,32}$/u.test(id)) {
    throw new Error(`invalid producer id: ${id}`);
  }
  return {
    id,
    shard: parseShard(port.getInput('shard')),
  };
}

function booleanInput(input: string, fallback: boolean): boolean {
  if (input.length === 0) return fallback;
  if (input === 'true') return true;
  if (input === 'false') return false;
  throw new Error(`invalid boolean input: ${input}`);
}

export function readActionInputs(port: ActionsPort): ActionInputs {
  const operation = port.getInput('operation', { required: true });
  const workingDirectory = safePath(
    port.getInput('working-directory') || '.',
    'working-directory',
  );
  if (operation === 'plan') {
    const config = optional(port, 'config');
    return {
      operation,
      workingDirectory,
      producer: producerFrom(port),
      playwrightArguments: port.getInput('playwright-args'),
      ...(config === undefined ? {} : { config: safePath(config, 'config') }),
      ...(optional(port, 'repository') === undefined
        ? {}
        : { repository: port.getInput('repository') }),
      ...(optional(port, 'revision') === undefined
        ? {}
        : { revision: port.getInput('revision') }),
      out: safePath(port.getInput('out') || 'proofline/plan.json', 'out'),
    };
  }
  if (operation === 'collect') {
    return {
      operation,
      workingDirectory,
      producer: producerFrom(port),
      report: safePath(port.getInput('report', { required: true }), 'report'),
      plan: safePath(port.getInput('plan') || 'proofline/plan.json', 'plan'),
      out: safePath(port.getInput('out') || 'proofline/envelope.json', 'out'),
    };
  }
  if (operation === 'reconcile') {
    return {
      operation,
      workingDirectory,
      producers: port.getInput('producers', { required: true }),
      artifacts: safePath(
        port.getInput('artifacts', { required: true }),
        'artifacts',
      ),
      mode: reconciliationMode(port.getInput('mode')),
      out: safePath(
        port.getInput('out') || 'proofline-reconciliation.json',
        'out',
      ),
      summary: booleanInput(port.getInput('summary'), true),
    };
  }
  throw new Error(`unsupported operation: ${operation}`);
}

export function assertSupportedNodeVersion(version: string): void {
  const major = Number(/^v?(\d+)/u.exec(version)?.[1]);
  if (major !== 22 && major !== 24) {
    throw new Error(
      `Proofline requires Node 22 or Node 24; received ${version}`,
    );
  }
}
