import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { parseInventory, type Annotation, type TestDefinition, type TestInventory } from '@proofline/evidence-model';
import type { FullConfig, Reporter, Suite, TestCase } from '@playwright/test/reporter';

import { resolveTestIdentity } from './identity.js';

const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const PLAYWRIGHT_CONTROL_ANNOTATIONS = new Set([
  'skip',
  'fixme',
  'fail',
  'slow',
]);

interface ProoflineMetadata {
  repository: string;
  revision: string;
}

interface MappedTest {
  definition: TestDefinition;
  logicalKey: string;
  source: string;
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

function sourceReference(config: FullConfig, test: TestCase): string {
  const baseDirectory = config.configFile ? dirname(config.configFile) : config.rootDir;
  const file = toPosixPath(relative(baseDirectory, test.location.file));
  return `${file}:${String(test.location.line)}`;
}

function annotationsFor(config: FullConfig, test: TestCase): Annotation[] {
  return test.annotations.flatMap(({ description, type }) => {
    if (description === undefined && PLAYWRIGHT_CONTROL_ANNOTATIONS.has(type)) return [];

    if (typeof description !== 'string' || description.length === 0 || description.trim() !== description) {
      throw new Error(
        `annotation ${type} on ${sourceReference(config, test)} (${test.title}) must define a non-empty trimmed description`,
      );
    }

    return [{ type, description }];
  });
}

function annotationValues(annotations: readonly Annotation[], type: string): string[] {
  return sortedUnique(annotations.filter((annotation) => annotation.type === type).map(({ description }) => description));
}

function projectNameFor(config: FullConfig, test: TestCase, unnamedProjects: Set<object>): string {
  const project = test.parent.project();
  if (!project) throw new Error(`test on ${sourceReference(config, test)} has no Playwright project: ${test.title}`);

  if (project.name.length === 0) {
    unnamedProjects.add(project);
    if (unnamedProjects.size > 1) {
      throw new Error(`multiple unnamed Playwright projects are ambiguous on ${sourceReference(config, test)}`);
    }
    return '<default>';
  }

  if (project.name === '<default>') {
    throw new Error(`Playwright project name <default> is reserved on ${sourceReference(config, test)}`);
  }

  return project.name;
}

function mapTest(
  config: FullConfig,
  metadata: ProoflineMetadata,
  test: TestCase,
  unnamedProjects: Set<object>,
): MappedTest {
  const file = toPosixPath(relative(config.rootDir, test.location.file));
  const source = sourceReference(config, test);
  const titlePath = titlePathFor(test);
  const annotations = annotationsFor(config, test);
  let identity: ReturnType<typeof resolveTestIdentity>;

  try {
    identity = resolveTestIdentity({ repository: metadata.repository, file, titlePath, annotations });
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} on ${source} (${test.title})`,
    );
  }

  return {
    logicalKey: JSON.stringify([file, test.location.line, titlePath]),
    source,
    definition: {
      ...identity,
      title: test.title,
      titlePath,
      file,
      line: test.location.line,
      projects: [projectNameFor(config, test, unnamedProjects)],
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
    this.#outputFile = this.#resolveOutputFile(config);
    this.#inventory = undefined;
    this.#fatalErrors.clear();

    try {
      const metadata = readProoflineMetadata(config);
      const testsByLogicalKey = new Map<string, MappedTest>();
      const unnamedProjects = new Set<object>();

      for (const test of suite.allTests()) {
        try {
          const mapped = mapTest(config, metadata, test, unnamedProjects);
          const existing = testsByLogicalKey.get(mapped.logicalKey);

          if (!existing) {
            testsByLogicalKey.set(mapped.logicalKey, mapped);
          } else if (existing.definition.id !== mapped.definition.id) {
            this.#fatalErrors.add(`inconsistent identities for source test ${mapped.source}: ${mapped.definition.title}`);
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

  #resolveOutputFile(config: FullConfig): string {
    const configFile = config.configFile;
    const configDirectory = configFile ? dirname(configFile) : process.cwd();
    const configured = this.#options.outputFile;
    if (!configured) return join(configDirectory, '.proofline', 'inventory.json');
    return isAbsolute(configured) ? configured : resolve(configDirectory, configured);
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
