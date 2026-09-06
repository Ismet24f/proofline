import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const execFileAsync = promisify(execFile);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return resolve(value);
}

function splitPackage(specifier) {
  const separator = specifier.lastIndexOf('@');
  if (separator < 1 || separator === specifier.length - 1) {
    throw new Error(`invalid bundled dependency: ${specifier}`);
  }
  return {
    name: specifier.slice(0, separator),
    version: specifier.slice(separator + 1),
  };
}

function packageStoreDirectory(name, version) {
  return `${name.replace('/', '+')}@${version}`;
}

async function licenseText(packageDirectory, specifier) {
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      return (await readFile(join(packageDirectory, filename), 'utf8')).trim();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }
  }
  throw new Error(`bundled dependency ${specifier} has no license file`);
}

function collectExternalDependencies(node, result) {
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    if (
      typeof dependency !== 'object' ||
      dependency === null ||
      typeof dependency.version !== 'string'
    ) {
      throw new Error(`invalid resolved dependency record for ${name}`);
    }
    if (!name.startsWith('@proofline/')) {
      result.add(`${name}@${dependency.version}`);
    }
    collectExternalDependencies(dependency, result);
  }
}

async function resolvedProductionInventory(root) {
  const { stdout } = await execFileAsync(
    'pnpm',
    [
      '--filter',
      '@proofline/check',
      'list',
      '--prod',
      '--depth',
      'Infinity',
      '--json',
    ],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  );
  const roots = JSON.parse(stdout);
  if (!Array.isArray(roots)) {
    throw new Error('pnpm produced an invalid dependency graph');
  }
  const dependencies = new Set();
  for (const rootPackage of roots) {
    collectExternalDependencies(rootPackage, dependencies);
  }
  return [...dependencies].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
}

function sourceUrl(repository, homepage) {
  const raw =
    typeof repository === 'string'
      ? repository
      : typeof repository?.url === 'string'
        ? repository.url
        : homepage;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('bundled dependency has no source URL');
  }
  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
}

function markdownTable(rows) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  );
  const render = (row) =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  return [
    render(rows[0]),
    render(widths.map((width) => '-'.repeat(width))),
    ...rows.slice(1).map(render),
  ];
}

async function generate({ root, inventoryPath, resolvedInventory }) {
  const [lockfile, inventorySource] = await Promise.all([
    readFile(join(root, 'pnpm-lock.yaml'), 'utf8'),
    readFile(inventoryPath, 'utf8'),
  ]);
  const inventory = JSON.parse(inventorySource);
  if (
    !Array.isArray(inventory) ||
    inventory.some((item) => typeof item !== 'string')
  ) {
    throw new Error('bundled dependency inventory must be a JSON string array');
  }
  const pinned = [...new Set(inventory)].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
  if (
    resolvedInventory !== undefined &&
    JSON.stringify(pinned) !== JSON.stringify(resolvedInventory)
  ) {
    throw new Error(
      `bundled dependency inventory differs from the resolved production dependency closure: pinned=${JSON.stringify(pinned)} resolved=${JSON.stringify(resolvedInventory)}`,
    );
  }

  const records = [];
  for (const specifier of pinned) {
    const { name, version } = splitPackage(specifier);
    const quotedKey = `  '${specifier}':`;
    const plainKey = `  ${specifier}:`;
    if (!lockfile.includes(quotedKey) && !lockfile.includes(plainKey)) {
      throw new Error(
        `bundled dependency ${specifier} is not pinned in pnpm-lock.yaml`,
      );
    }
    const packageDirectory = join(
      root,
      'node_modules/.pnpm',
      packageStoreDirectory(name, version),
      'node_modules',
      name,
    );
    const manifestPath = join(packageDirectory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(`installed manifest does not match ${specifier}`);
    }
    if (typeof manifest.license !== 'string' || manifest.license.length === 0) {
      throw new Error(
        `bundled dependency ${specifier} has no declared license`,
      );
    }
    records.push({
      name,
      version,
      license: manifest.license,
      source: sourceUrl(manifest.repository, manifest.homepage),
      licenseText: await licenseText(packageDirectory, specifier),
    });
  }

  records.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const table = markdownTable([
    ['Package', 'Version', 'License', 'Source'],
    ...records.map((record) => [
      `\`${record.name}\``,
      record.version,
      record.license,
      record.source,
    ]),
  ]);
  return [
    '# Third-Party Notices',
    '',
    'Proofline distributes the following third-party packages in its bundled GitHub Action:',
    '',
    ...table,
    '',
    'Generated by `check/scripts/generate-notices.mjs` from the pinned inventory and `pnpm-lock.yaml`.',
    '',
    '## License Texts',
    '',
    ...records.flatMap((record) => [
      `### \`${record.name}@${record.version}\``,
      '',
      ...record.licenseText
        .split('\n')
        .map((line) => (line.length === 0 ? '' : `    ${line}`)),
      '',
    ]),
  ].join('\n');
}

const root = argument('--root', repositoryRoot);
const inventoryOverridden = process.argv.includes('--inventory');
const inventoryPath = argument(
  '--inventory',
  join(scriptDirectory, 'bundled-dependencies.json'),
);
const outputPath = argument(
  '--output',
  join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'),
);
const resolvedInventoryPath = argument('--resolved-inventory', undefined);

try {
  const resolvedInventory =
    resolvedInventoryPath === undefined
      ? inventoryOverridden
        ? undefined
        : await resolvedProductionInventory(root)
      : JSON.parse(await readFile(resolvedInventoryPath, 'utf8'));
  if (
    resolvedInventory !== undefined &&
    (!Array.isArray(resolvedInventory) ||
      resolvedInventory.some((item) => typeof item !== 'string'))
  ) {
    throw new Error(
      'resolved dependency inventory must be a JSON string array',
    );
  }
  await writeFile(
    outputPath,
    await generate({ root, inventoryPath, resolvedInventory }),
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
