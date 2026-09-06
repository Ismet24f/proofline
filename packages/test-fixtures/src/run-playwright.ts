import { spawn } from 'node:child_process';

const MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;

export interface RunCommandOptions {
  cwd: string;
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  signalAfterMs?: number;
  signalOnStdout?: {
    marker: string;
    timeoutMs: number;
  };
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
    const signalOnStdout = options.signalOnStdout;
    if (options.signalAfterMs !== undefined && signalOnStdout !== undefined) {
      throw new Error(
        'signalAfterMs and signalOnStdout cannot be used together',
      );
    }
    if (
      signalOnStdout !== undefined &&
      (signalOnStdout.marker.length === 0 ||
        !Number.isSafeInteger(signalOnStdout.timeoutMs) ||
        signalOnStdout.timeoutMs < 1)
    ) {
      throw new Error(
        'signalOnStdout requires a non-empty marker and positive timeoutMs',
      );
    }
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
    let signalSent = false;
    let signalTimer: NodeJS.Timeout | undefined;
    let markerTimer: NodeJS.Timeout | undefined;

    const clearTimers = (): void => {
      if (signalTimer !== undefined) {
        clearTimeout(signalTimer);
      }
      if (markerTimer !== undefined) {
        clearTimeout(markerTimer);
      }
    };
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      child.kill('SIGKILL');
      reject(error);
    };
    const sendSignal = (): void => {
      if (signalSent) return;
      signalSent = true;
      child.kill('SIGINT');
    };

    if (options.signalAfterMs !== undefined) {
      signalTimer = setTimeout(sendSignal, options.signalAfterMs);
    }
    if (signalOnStdout !== undefined) {
      markerTimer = setTimeout(() => {
        fail(
          new Error(
            `subprocess stdout marker ${JSON.stringify(signalOnStdout.marker)} was not observed within ${String(signalOnStdout.timeoutMs)}ms`,
          ),
        );
      }, signalOnStdout.timeoutMs);
    }

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
      if (
        signalOnStdout !== undefined &&
        stdout.includes(signalOnStdout.marker)
      ) {
        if (markerTimer !== undefined) clearTimeout(markerTimer);
        markerTimer = undefined;
        sendSignal();
      }
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
      clearTimers();
      resolve({ code, signal, stdout, stderr });
    });
  });
}
