import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { parseInventory, type Annotation, type TestDefinition, type TestInventory } from '@proofline/evidence-model';
import type { FullConfig, Reporter, Suite, TestCase } from '@playwright/test/reporter';

import { resolveTestIdentity } from './identity.js';

const REVISION_PATTERN = /^[a-f0-9]{40}$/;

interface ProoflineMetadata {
  repository: string;
  revision: string;
}

interface MappedTest {
  definition: TestDefinition;
  logicalKey: string;
}

export interface ProoflineReporterOptions {
  outputFile?: string;
}

function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function sortedUnique(items: readonly string[]): string[] {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right));
}

function readProoflineMetadata(config: FullConfig): ProoflineMetadata {
  const metadata = (config.metadata as Record<string, unknown>)['proofline'];
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error('config.metadata.proofline must define repository and revision');
  }

  const proofline = metadata as Record<string, unknown>;
  const repository = proofline['repository'];
  const revision = proofline['revision'];

  if (typeof repository !== 'string' || repository.trim() !== repository || repository.length === 0) {
    throw new Error('config.metadata.proofline.repository must be a non-empty trimmed string');
  }
  if (typeof revision !== 'string' || !REVISION_PATTERN.test(revision)) {
    throw new Error('config.metadata.proofline.revision must be a lowercase 40-character hexadecimal revision');
  }

  return { repository, revision };
}

function titlePathFor(test: TestCase): string[] {
  const titles = [test.title];
  let suite: Suite | undefined = test.parent;

  while (suite) {
    if (suite.type === 'describe') titles.unshift(suite.title);
    suite = suite.parent;
  }

  return titles;
}

function annotationsFor(test: TestCase): Annotation[] {
  return test.annotations.flatMap(({ description, type }) =>
    description === undefined ? [] : [{ type, description }],
  );
}

function annotationValues(annotations: readonly Annotation[], type: string): string[] {
  return sortedUnique(annotations.filter((annotation) => annotation.type === type).map(({ description }) => description));
}

function projectNameFor(test: TestCase): string {
  const project = test.parent.project();
  if (!project || project.name.length === 0) throw new Error(`test has no named Playwright project: ${test.title}`);
  return project.name;
}

function mapTest(config: FullConfig, metadata: ProoflineMetadata, test: TestCase): MappedTest {
  const file = toPosixPath(relative(config.rootDir, test.location.file));
  const titlePath = titlePathFor(test);
  const annotations = annotationsFor(test);
  const identity = resolveTestIdentity({ repository: metadata.repository, file, titlePath, annotations });

  return {
    logicalKey: JSON.stringify([file, titlePath]),
    definition: {
      ...identity,
      title: test.title,
      titlePath,
      file,
      line: test.location.line,
      projects: [projectNameFor(test)],
      tags: sortedUnique(test.tags),
      annotations,
      capabilities: annotationValues(annotations, 'proofline.capability'),
      risks: annotationValues(annotations, 'proofline.risk'),
      requirements: annotationValues(annotations, 'proofline.requirement'),
      status: test.expectedStatus === 'skipped' ? 'SKIPPED' : 'ACTIVE',
    },
  };
}

async function writeInventoryAtomically(outputFile: string, inventory: TestInventory): Promise<void> {
  const temporaryFile = `${outputFile}.${String(process.pid)}.${randomUUID()}.tmp`;
  await mkdir(dirname(outputFile), { recursive: true });

  try {
    await writeFile(temporaryFile, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryFile, outputFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

export class ProoflineReporter implements Reporter {
  readonly #options: ProoflineReporterOptions;
  readonly #fatalErrors = new Set<string>();
  #inventory: TestInventory | undefined;
  #outputFile: string | undefined;

  constructor(options: ProoflineReporterOptions = {}) {
    this.#options = options;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.#outputFile = this.#resolveOutputFile(config.rootDir);
    this.#inventory = undefined;
    this.#fatalErrors.clear();

    try {
      const metadata = readProoflineMetadata(config);
      const testsById = new Map<string, MappedTest>();

      for (const test of suite.allTests()) {
        try {
          const mapped = mapTest(config, metadata, test);
          const existing = testsById.get(mapped.definition.id);

          if (!existing) {
            testsById.set(mapped.definition.id, mapped);
          } else if (existing.logicalKey !== mapped.logicalKey) {
            this.#fatalErrors.add(`duplicate stable test IDs: ${mapped.definition.id}`);
          } else {
            existing.definition = {
              ...existing.definition,
              projects: sortedUnique([...existing.definition.projects, ...mapped.definition.projects]),
            };
          }
        } catch (error) {
          this.#fatalErrors.add(error instanceof Error ? error.message : String(error));
        }
      }

      if (this.#fatalErrors.size === 0) {
        this.#inventory = parseInventory({
          schemaVersion: 1,
          repository: metadata.repository,
          revision: metadata.revision,
          generatedAt: new Date().toISOString(),
          tests: [...testsById.values()]
            .map(({ definition }) => definition)
            .sort((left, right) => left.id.localeCompare(right.id)),
        });
      }
    } catch (error) {
      this.#fatalErrors.add(error instanceof Error ? error.message : String(error));
    }
  }

  onEnd(): Promise<{ status: 'failed' } | undefined> {
    // Playwright overwrites process.exitCode after reporter.onExit. Its documented
    // onEnd status override is the supported way to carry discovery failures into
    // the authoritative command result.
    return Promise.resolve(this.#fatalErrors.size > 0 ? { status: 'failed' } : undefined);
  }

  async onExit(): Promise<void> {
    const outputFile = this.#outputFile;
    if (!outputFile) {
      this.#fatalErrors.add('Playwright did not call reporter.onBegin');
    }

    if (this.#fatalErrors.size > 0 || !this.#inventory || !outputFile) {
      if (outputFile) await rm(outputFile, { force: true });
      for (const error of this.#fatalErrors) process.stderr.write(`Proofline discovery failed: ${error}\n`);
      process.exitCode = 2;
      return;
    }

    try {
      await writeInventoryAtomically(outputFile, this.#inventory);
    } catch (error) {
      await rm(outputFile, { force: true });
      process.stderr.write(
        `Proofline discovery failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    }
  }

  printsToStdio(): boolean {
    return false;
  }

  #resolveOutputFile(rootDir: string): string {
    const configured = this.#options.outputFile;
    if (!configured) return join(rootDir, '.proofline', 'inventory.json');
    return isAbsolute(configured) ? configured : resolve(rootDir, configured);
  }
}

export default ProoflineReporter;
