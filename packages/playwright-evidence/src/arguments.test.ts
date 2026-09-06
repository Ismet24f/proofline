import { describe, expect, it } from 'vitest';

import { normalizeSelectionArgv, parseArgumentLines } from './arguments.js';

describe('parseArgumentLines', () => {
  it('treats each non-empty line as exactly one argument', () => {
    expect(
      parseArgumentLines('--project=chromium\n\ntests/checkout\n'),
    ).toEqual(['--project=chromium', 'tests/checkout']);
  });

  it('preserves spaces inside an equals-form grep value', () => {
    expect(parseArgumentLines('--grep=checkout pays')).toEqual([
      '--grep=checkout pays',
    ]);
  });

  it.each([
    ['--project chromium', 'one argument per line; use --project=chromium'],
    ['-g pays', 'one argument per line; use --grep=pays'],
  ])('rejects a split option on one line: %s', (input, message) => {
    expect(() => parseArgumentLines(input)).toThrow(message);
  });

  it.each(['--list', '--reporter=json', '--shard=1/2', '--config=pw.ts'])(
    'rejects action-owned argument %s',
    (input) => {
      expect(() => parseArgumentLines(input)).toThrow('action-owned');
    },
  );

  it('rejects unsupported options instead of silently forwarding them', () => {
    expect(() => parseArgumentLines('--workers=20')).toThrow(
      'unsupported playwright argument',
    );
  });
});

describe('normalizeSelectionArgv', () => {
  it('canonicalizes aliases, paired values, and order', () => {
    expect(
      normalizeSelectionArgv(['--project', 'chromium', '-g', 'pays']),
    ).toEqual(['--grep=pays', '--project=chromium']);
  });

  it('retains positional filters and canonicalizes only-changed', () => {
    expect(
      normalizeSelectionArgv([
        'tests/checkout',
        '--only-changed',
        'origin/main',
      ]),
    ).toEqual(['--only-changed=origin/main', 'tests/checkout']);
  });

  it('removes list and reporter arguments without consuming positionals', () => {
    expect(
      normalizeSelectionArgv([
        '--list',
        '--reporter',
        'json',
        'tests/checkout',
        '--reporter=line',
      ]),
    ).toEqual(['tests/checkout']);
  });

  it('rejects a value-taking option with no value', () => {
    expect(() => normalizeSelectionArgv(['--project'])).toThrow(
      '--project requires a value',
    );
  });
});
