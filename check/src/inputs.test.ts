import { describe, expect, it } from 'vitest';

import {
  assertSupportedNodeVersion,
  type ActionsPort,
  readActionInputs,
} from './inputs.js';

class InputPort implements ActionsPort {
  readonly requested: Array<{ name: string; required: boolean }> = [];

  constructor(private readonly values: Readonly<Record<string, string>>) {}

  getInput(name: string, options?: { required?: boolean }): string {
    this.requested.push({ name, required: options?.required === true });
    const value = this.values[name] ?? '';
    if (options?.required === true && value.length === 0) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return value;
  }

  setOutput(): void {}
  setFailed(): void {}
  async writeSummary(): Promise<void> {}
}

describe('readActionInputs', () => {
  it('normalizes plan defaults while preserving argument lines exactly', () => {
    const port = new InputPort({
      operation: 'plan',
      producer: 'e2e',
      'playwright-args': '--project=chromium\n--grep=checkout',
    });

    expect(readActionInputs(port)).toEqual({
      operation: 'plan',
      workingDirectory: '.',
      producer: { id: 'e2e', shard: { current: 1, total: 1 } },
      playwrightArguments: '--project=chromium\n--grep=checkout',
      out: 'proofline/plan.json',
    });
    expect(port.requested).toContainEqual({
      name: 'operation',
      required: true,
    });
    expect(port.requested).toContainEqual({ name: 'producer', required: true });
  });

  it('requires collect report and applies plan/output defaults', () => {
    const port = new InputPort({ operation: 'collect', producer: 'api' });

    expect(() => readActionInputs(port)).toThrow(
      'Input required and not supplied: report',
    );
  });

  it('requires reconcile producers and artifacts', () => {
    expect(() =>
      readActionInputs(
        new InputPort({ operation: 'reconcile', producers: 'e2e=2' }),
      ),
    ).toThrow('Input required and not supplied: artifacts');
  });

  it('applies reconcile defaults', () => {
    expect(
      readActionInputs(
        new InputPort({
          operation: 'reconcile',
          producers: 'e2e=2',
          artifacts: 'artifacts',
        }),
      ),
    ).toEqual({
      operation: 'reconcile',
      workingDirectory: '.',
      producers: 'e2e=2',
      artifacts: 'artifacts',
      mode: 'report-only',
      out: 'proofline-reconciliation.json',
      summary: true,
    });
  });

  it.each(['unknown', '', 'PLAN'])(
    'rejects unsupported operation %j',
    (operation) => {
      expect(() => readActionInputs(new InputPort({ operation }))).toThrow();
    },
  );

  it('rejects an invalid reconciliation mode', () => {
    expect(() =>
      readActionInputs(
        new InputPort({
          operation: 'reconcile',
          producers: 'e2e=1',
          artifacts: 'artifacts',
          mode: 'strict',
        }),
      ),
    ).toThrow('invalid reconciliation mode: strict');
  });

  it.each([
    ['plan', { operation: 'plan', producer: 'e2e', out: '../plan.json' }],
    [
      'collect',
      { operation: 'collect', producer: 'e2e', report: '/tmp/report.json' },
    ],
    [
      'reconcile',
      {
        operation: 'reconcile',
        producers: 'e2e=1',
        artifacts: '../../artifacts',
      },
    ],
    [
      'working-directory',
      {
        operation: 'plan',
        producer: 'e2e',
        'working-directory': '../outside',
      },
    ],
  ])('rejects unsafe %s paths', (_operation, values) => {
    expect(() => readActionInputs(new InputPort(values))).toThrow(
      'unsafe path',
    );
  });

  it('preserves a safe monorepo working directory', () => {
    expect(
      readActionInputs(
        new InputPort({
          operation: 'plan',
          producer: 'e2e',
          'working-directory': 'apps/web-e2e',
        }),
      ),
    ).toMatchObject({ workingDirectory: 'apps/web-e2e' });
  });

  it('rejects invalid producer IDs before domain work', () => {
    expect(() =>
      readActionInputs(new InputPort({ operation: 'plan', producer: 'E2E' })),
    ).toThrow('invalid producer id: E2E');
  });
});

describe('assertSupportedNodeVersion', () => {
  it.each(['22.22.2', '24.20.0'])('accepts Node %s', (version) => {
    expect(() => {
      assertSupportedNodeVersion(version);
    }).not.toThrow();
  });

  it.each(['20.19.0', '23.11.0', '25.0.0', 'invalid'])(
    'rejects unsupported Node %s',
    (version) => {
      expect(() => {
        assertSupportedNodeVersion(version);
      }).toThrow('Proofline requires Node 22 or Node 24');
    },
  );
});
