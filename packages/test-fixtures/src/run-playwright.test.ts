import { describe, expect, it } from 'vitest';

import { runCommand } from './run-playwright.js';

describe('runCommand', () => {
  it('captures an owned subprocess exit, stdout, stderr, and environment', async () => {
    const result = await runCommand({
      cwd: process.cwd(),
      command: process.execPath,
      args: [
        '-e',
        "process.stdout.write(process.env.PROOFLINE_VALUE ?? 'missing'); process.stderr.write('diagnostic'); process.exitCode = 7;",
      ],
      env: { ...process.env, PROOFLINE_VALUE: 'fixture-value' },
    });

    expect(result).toEqual({
      code: 7,
      signal: null,
      stdout: 'fixture-value',
      stderr: 'diagnostic',
    });
  });

  it('sends SIGINT only to the spawned child after the requested delay', async () => {
    const result = await runCommand({
      cwd: process.cwd(),
      command: process.execPath,
      args: [
        '-e',
        "process.stdout.write('ready'); setInterval(() => {}, 1_000);",
      ],
      signalAfterMs: 100,
    });

    expect(result).toEqual({
      code: null,
      signal: 'SIGINT',
      stdout: 'ready',
      stderr: '',
    });
  });

  it('rejects output larger than the 50 MB stdout bound', async () => {
    await expect(
      runCommand({
        cwd: process.cwd(),
        command: process.execPath,
        args: ['-e', "process.stdout.write('x'.repeat(50 * 1024 * 1024 + 1));"],
      }),
    ).rejects.toThrow('subprocess stdout exceeds 52428800 bytes');
  });

  it('truncates stderr at the 1 MB diagnostic bound', async () => {
    const result = await runCommand({
      cwd: process.cwd(),
      command: process.execPath,
      args: ['-e', "process.stderr.write('x'.repeat(1024 * 1024 + 32));"],
    });

    expect(Buffer.byteLength(result.stderr, 'utf8')).toBe(1024 * 1024);
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
  });
});
