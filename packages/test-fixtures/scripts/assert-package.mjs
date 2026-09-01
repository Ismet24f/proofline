import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const distDirectory = join(packageDirectory, 'dist');

async function findTestArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const artifacts = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...await findTestArtifacts(path));
    } else if (entry.name.includes('.test.')) {
      artifacts.push(path);
    }
  }

  return artifacts;
}

const artifacts = await findTestArtifacts(distDirectory);
if (artifacts.length > 0) {
  throw new Error(`test artifacts must not be packaged: ${artifacts.join(', ')}`);
}
