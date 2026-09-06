import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const output = process.argv[2];
if (output === undefined) {
  throw new Error('usage: node capture-sigint.mjs <output-file>');
}

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const child = spawn(
  process.execPath,
  [
    cli,
    'test',
    '--config=playwright.config.ts',
    'tests/sigint.spec.ts',
    '--reporter=json',
  ],
  {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(output),
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let interrupted = false;
const timeout = setTimeout(() => {
  child.kill('SIGKILL');
}, 15_000);

child.stdout.setEncoding('utf8').on('data', (chunk) => {
  process.stdout.write(chunk);
  if (!interrupted && chunk.includes('PROOFLINE_IN_FLIGHT')) {
    interrupted = true;
    child.kill('SIGINT');
  }
});
child.stderr.pipe(process.stderr);

child.once('error', (error) => {
  clearTimeout(timeout);
  throw error;
});
child.once('close', (code) => {
  clearTimeout(timeout);
  if (!interrupted) {
    throw new Error('SIGINT marker was never observed');
  }
  if (code !== 130) {
    throw new Error(`expected Playwright exit 130, received ${String(code)}`);
  }
});
