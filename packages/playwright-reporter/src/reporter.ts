import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
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
  let descriptionlessSkipMarkers = 0;

  return test.annotations.flatMap(({ description, type }) => {
    if (type === 'skip' && description === undefined && test.expectedStatus === 'skipped') {
      descriptionlessSkipMarkers += 1;
      if (descriptionlessSkipMarkers === 1) return [];

      const file = toPosixPath(test.location.file);
      throw new Error(
        `multiple description-less skip annotations on ${file}:${String(test.location.line)} (${test.title})`,
      );
    }

    if (typeof description !== 'string' || description.length === 0 || description.trim() !== description) {
      const file = toPosixPath(test.location.file);
      throw new Error(
        `annotation ${type} on ${file}:${String(test.location.line)} (${test.title}) must define a non-empty trimmed description`,
      );
    }

    return [{ type, description }];
  });
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
    logicalKey: JSON.stringify([file, test.location.line, titlePath]),
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
  let ownsTemporaryFile = false;
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryHandle = await open(temporaryFile, 'wx');
    ownsTemporaryFile = true;
    await temporaryHandle.writeFile(`${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await rename(temporaryFile, outputFile);
  } finally {
    try {
      await temporaryHandle?.close();
    } finally {
      if (ownsTemporaryFile) await rm(temporaryFile, { force: true });
    }
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
      const testsByLogicalKey = new Map<string, MappedTest>();

      for (const test of suite.allTests()) {
        try {
          const mapped = mapTest(config, metadata, test);
          const existing = testsByLogicalKey.get(mapped.logicalKey);

          if (!existing) {
            testsByLogicalKey.set(mapped.logicalKey, mapped);
          } else if (existing.definition.id !== mapped.definition.id) {
            this.#fatalErrors.add(`inconsistent identities for source test: ${mapped.definition.title}`);
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
        this.#inventory = {
          schemaVersion: 1,
          repository: metadata.repository,
          revision: metadata.revision,
          generatedAt: new Date().toISOString(),
          tests: [...testsByLogicalKey.values()]
            .map(({ definition }) => definition)
            .sort((left, right) => left.id.localeCompare(right.id)),
        };
      }
    } catch (error) {
      this.#fatalErrors.add(error instanceof Error ? error.message : String(error));
    }
  }

  async onEnd(): Promise<{ status: 'failed' } | undefined> {
    const outputFile = this.#outputFile;
    if (!outputFile) {
      this.#fatalErrors.add('Playwright did not call reporter.onBegin');
    }

    if (this.#fatalErrors.size > 0 || !this.#inventory || !outputFile) {
      await this.#suppressInventory(outputFile);
      this.#reportFatalErrors();
      return { status: 'failed' };
    }

    try {
      await writeInventoryAtomically(outputFile, parseInventory(this.#inventory));
    } catch (error) {
      this.#fatalErrors.add(error instanceof Error ? error.message : String(error));
      await this.#suppressInventory(outputFile);
      this.#reportFatalErrors();
      return { status: 'failed' };
    }

    return undefined;
  }

  printsToStdio(): boolean {
    return false;
  }

  #resolveOutputFile(rootDir: string): string {
    const configured = this.#options.outputFile;
    if (!configured) return join(rootDir, '.proofline', 'inventory.json');
    return isAbsolute(configured) ? configured : resolve(rootDir, configured);
  }

  async #suppressInventory(outputFile: string | undefined): Promise<void> {
    if (!outputFile) return;

    try {
      await rm(outputFile, { force: true });
    } catch (error) {
      this.#fatalErrors.add(
        `could not remove inventory output: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  #reportFatalErrors(): void {
    for (const error of this.#fatalErrors) process.stderr.write(`Proofline discovery failed: ${error}\n`);
  }
}

export default ProoflineReporter;
