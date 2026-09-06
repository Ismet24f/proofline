import { spawn } from 'node:child_process';

const MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;

export interface RunCommandOptions {
  cwd: string;
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  signalAfterMs?: number;
}

export interface RunCommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export function runCommand(
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const signalTimer =
      options.signalAfterMs === undefined
        ? undefined
        : setTimeout(() => child.kill('SIGINT'), options.signalAfterMs);

    const clearSignalTimer = (): void => {
      if (signalTimer !== undefined) {
        clearTimeout(signalTimer);
      }
    };
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearSignalTimer();
      child.kill('SIGKILL');
      reject(error);
    };

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        fail(
          new Error(
            `subprocess stdout exceeds ${String(MAX_STDOUT_BYTES)} bytes`,
          ),
        );
        return;
      }
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (stderrBytes >= MAX_STDERR_BYTES) {
        return;
      }
      const remaining = MAX_STDERR_BYTES - stderrBytes;
      const bounded = Buffer.from(chunk, 'utf8')
        .subarray(0, remaining)
        .toString('utf8');
      stderr += bounded;
      stderrBytes += Buffer.byteLength(bounded, 'utf8');
    });
    child.once('error', fail);
    child.once('close', (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearSignalTimer();
      resolve({ code, signal, stdout, stderr });
    });
  });
}
