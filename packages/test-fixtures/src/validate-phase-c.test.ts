import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const HEADER =
  'observation_id,repository_alias,pr_alias,observed_at,proofline_commit,playwright_version,mode,proofline_status,proofline_records,raw_records_checked,cross_check_result,false_classification_count,resolved_at,evidence_ref,resolution_evidence_ref';
const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/validate-phase-c.mjs',
);
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const workspaces: string[] = [];

interface ConsumerRecord {
  schemaVersion: number;
  status: 'draft' | 'verified';
  repositoryAlias: string;
  verifiedCommit: string;
  playwrightVersion: string;
  freshClone: string;
  noProoflinePackage: string;
  workflowConclusion: string;
  prooflineReportSha256: string;
  rawReportSha256: string;
  verifiedAt: string;
  reviewerAlias: string;
  evidenceRef: string;
  [key: string]: unknown;
}

function draftConsumer(): ConsumerRecord {
  return {
    schemaVersion: 1,
    status: 'draft',
    repositoryAlias: '',
    verifiedCommit: '',
    playwrightVersion: '',
    freshClone: '',
    noProoflinePackage: '',
    workflowConclusion: '',
    prooflineReportSha256: '',
    rawReportSha256: '',
    verifiedAt: '',
    reviewerAlias: '',
    evidenceRef: '',
  };
}

function verifiedConsumer(): ConsumerRecord {
  return {
    schemaVersion: 1,
    status: 'verified',
    repositoryAlias: 'R-900000',
    verifiedCommit: 'a'.repeat(40),
    playwrightVersion: '1.62.1',
    freshClone: 'yes',
    noProoflinePackage: 'yes',
    workflowConclusion: 'success',
    prooflineReportSha256: 'b'.repeat(64),
    rawReportSha256: 'c'.repeat(64),
    verifiedAt: '2026-09-06T16:00:00Z',
    reviewerAlias: 'P-900000',
    evidenceRef: 'E-900000',
  };
}

function observation(
  index: number,
  overrides: Partial<Record<string, string>> = {},
): string {
  const current = String(index).padStart(6, '0');
  const row: Record<string, string> = {
    observation_id: `OBS-${current}`,
    repository_alias: `R-${String((index % 3) + 1).padStart(6, '0')}`,
    pr_alias: `PR-${current}`,
    observed_at: '2026-09-06T15:00:00Z',
    proofline_commit: 'd'.repeat(40),
    playwright_version: '1.62.1',
    mode: 'report-only',
    proofline_status: 'complete',
    proofline_records: '5',
    raw_records_checked: '5',
    cross_check_result: 'matched',
    false_classification_count: '0',
    resolved_at: '',
    evidence_ref: `E-${String(100_000 + index).padStart(6, '0')}`,
    resolution_evidence_ref: '',
    ...overrides,
  };
  return HEADER.split(',')
    .map((field) => row[field])
    .join(',');
}

function run(
  observations: string[],
  consumer: ConsumerRecord = draftConsumer(),
  header = HEADER,
): unknown {
  return runSources(
    renderObservations(observations, header),
    renderConsumer(consumer),
  );
}

function runSources(
  observationsSource: string,
  consumerSource: string,
): unknown {
  const workspace = mkdtempSync(join(tmpdir(), 'proofline-phase-c-'));
  workspaces.push(workspace);
  const observationsPath = join(workspace, 'observations.csv');
  const consumerPath = join(workspace, 'consumer.json');
  writeFileSync(observationsPath, observationsSource);
  writeFileSync(consumerPath, consumerSource);
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, observationsPath, consumerPath], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }),
  ) as unknown;
}

function renderObservations(observations: string[], header = HEADER): string {
  return `${[header, ...observations].join('\n')}\n`;
}

function renderConsumer(consumer: ConsumerRecord): string {
  return `${JSON.stringify(consumer, undefined, 2)}\n`;
}

function digest(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

afterEach(() => {
  for (const workspace of workspaces.splice(0))
    rmSync(workspace, { recursive: true, force: true });
});

describe('validate-phase-c', () => {
  it('reports the current public contracts as observing', () => {
    const output = execFileSync(process.execPath, [SCRIPT], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({
      schemaVersion: 1,
      outcome: 'PHASE_C_OBSERVING',
      counts: {
        distinctPullRequests: 1,
        qualifyingPullRequests: 1,
        matchedObservations: 1,
        resolvedMismatchObservations: 0,
        unresolvedMismatchObservations: 0,
        toolErrorObservations: 0,
        requiredPullRequests: 20,
      },
      consumerVerified: false,
      authority: {
        status: 'non_authoritative',
        independentReviewRequired: true,
      },
    });
  });

  it('becomes ready only with 20 cross-checked PRs and a verified consumer', () => {
    const observations = Array.from({ length: 20 }, (_, index) =>
      observation(index + 1),
    );
    const consumer = verifiedConsumer();
    expect(run(observations, consumer)).toMatchObject({
      schemaVersion: 1,
      outcome: 'PHASE_C_READY',
      counts: {
        distinctPullRequests: 20,
        qualifyingPullRequests: 20,
        matchedObservations: 20,
        unresolvedMismatchObservations: 0,
        toolErrorObservations: 0,
        requiredPullRequests: 20,
      },
      consumerVerified: true,
      authority: {
        status: 'non_authoritative',
        independentReviewRequired: true,
      },
      unresolvedObservationIds: [],
      inputSha256: {
        observations: digest(renderObservations(observations)),
        consumer: digest(renderConsumer(consumer)),
      },
    });
  });

  it('remains observing at 19 distinct PRs', () => {
    expect(
      run(
        Array.from({ length: 19 }, (_, index) => observation(index + 1)),
        verifiedConsumer(),
      ),
    ).toMatchObject({
      outcome: 'PHASE_C_OBSERVING',
      counts: { distinctPullRequests: 19, qualifyingPullRequests: 19 },
    });
  });

  it('rejects duplicate repository and PR pairs', () => {
    expect(() =>
      run([
        observation(1),
        observation(2, {
          repository_alias: 'R-000002',
          pr_alias: 'PR-000001',
        }),
      ]),
    ).toThrow(/duplicate repository_alias\/pr_alias/);
  });

  it('rejects an altered observation header', () => {
    expect(() => run([], draftConsumer(), `${HEADER},private_url`)).toThrow(
      /header does not match the published contract/,
    );
  });

  it.each([
    ['private repository name', { repository_alias: 'my-secret-repo' }],
    ['private PR name', { pr_alias: 'real-pr-123' }],
    [
      'uppercase private repository name',
      { repository_alias: 'R-ACME_PRIVATE' },
    ],
    ['uppercase private PR name', { pr_alias: 'PR-CUSTOMER_1' }],
    ['invalid observation alias', { observation_id: 'observation-1' }],
    ['noncanonical timestamp', { observed_at: '2026-09-06 15:00:00' }],
    ['invalid commit', { proofline_commit: 'ABC' }],
    ['unsupported Playwright minor', { playwright_version: '1.63.0' }],
    ['enforcement mode', { mode: 'enforce-evidence' }],
    ['unknown status', { proofline_status: 'passed' }],
    ['negative count', { proofline_records: '-1' }],
    ['decimal count', { raw_records_checked: '5.5' }],
    ['unknown cross-check result', { cross_check_result: 'approved' }],
    ['raw evidence URL', { evidence_ref: 'https://private.example/run' }],
  ])('rejects %s', (_name, override) => {
    expect(() => run([observation(1, override)])).toThrow();
  });

  it('rejects a partial classification review', () => {
    expect(() => run([observation(1, { raw_records_checked: '4' })])).toThrow(
      /proofline_records must equal raw_records_checked/,
    );
  });

  it('does not count tool errors as qualifying pull-request evidence', () => {
    const allToolErrors = Array.from({ length: 20 }, (_, index) =>
      observation(index + 1, { proofline_status: 'tool_error' }),
    );
    expect(run(allToolErrors, verifiedConsumer())).toMatchObject({
      outcome: 'PHASE_C_OBSERVING',
      counts: {
        distinctPullRequests: 20,
        qualifyingPullRequests: 0,
        toolErrorObservations: 20,
      },
    });

    const mixed = Array.from({ length: 20 }, (_, index) =>
      observation(
        index + 1,
        index === 19 ? { proofline_status: 'tool_error' } : {},
      ),
    );
    expect(run(mixed, verifiedConsumer())).toMatchObject({
      outcome: 'PHASE_C_OBSERVING',
      counts: {
        distinctPullRequests: 20,
        qualifyingPullRequests: 19,
        toolErrorObservations: 1,
      },
    });
  });

  it('rejects unsafe or impossible observation counts', () => {
    expect(() =>
      run([
        observation(1, {
          proofline_records: '9007199254740992',
          raw_records_checked: '9007199254740993',
        }),
      ]),
    ).toThrow(/safe supported range/);
    expect(() =>
      run([
        observation(1, {
          proofline_records: '5',
          raw_records_checked: '5',
          cross_check_result: 'mismatch',
          false_classification_count: '6',
        }),
      ]),
    ).toThrow(/cannot exceed proofline_records/);
  });

  it('rejects contradictory matched and mismatch records', () => {
    expect(() =>
      run([observation(1, { false_classification_count: '1' })]),
    ).toThrow(/matched observations require zero false classifications/);
    expect(() =>
      run([observation(1, { cross_check_result: 'mismatch' })]),
    ).toThrow(
      /mismatch observations require a positive false classification count/,
    );
  });

  it('rejects malformed or partial mismatch resolutions', () => {
    expect(() =>
      run([
        observation(1, {
          cross_check_result: 'mismatch',
          false_classification_count: '1',
          resolved_at: '2026-09-06T16:00:00Z',
        }),
      ]),
    ).toThrow(/requires both resolved_at and resolution_evidence_ref/);
    expect(() =>
      run([
        observation(1, {
          cross_check_result: 'mismatch',
          false_classification_count: '1',
          resolved_at: '2026-09-06T14:00:00Z',
          resolution_evidence_ref: 'E-800001',
        }),
      ]),
    ).toThrow(/resolved_at must not be before observed_at/);
  });

  it('blocks unresolved mismatches and accepts separately evidenced resolutions', () => {
    const unresolved = run([
      observation(1, {
        cross_check_result: 'mismatch',
        false_classification_count: '1',
      }),
    ]);
    expect(unresolved).toMatchObject({
      outcome: 'PHASE_C_OBSERVING',
      counts: { unresolvedMismatchObservations: 1 },
      unresolvedObservationIds: ['OBS-000001'],
    });

    const rows = Array.from({ length: 20 }, (_, index) =>
      observation(
        index + 1,
        index === 0
          ? {
              cross_check_result: 'mismatch',
              false_classification_count: '1',
              resolved_at: '2026-09-06T16:00:00Z',
              resolution_evidence_ref: 'E-800001',
            }
          : {},
      ),
    );
    expect(run(rows, verifiedConsumer())).toMatchObject({
      outcome: 'PHASE_C_READY',
      counts: {
        resolvedMismatchObservations: 1,
        unresolvedMismatchObservations: 0,
      },
    });
  });

  it('rejects duplicate or primary-colliding resolution evidence', () => {
    const resolved = (index: number, resolutionEvidence: string) =>
      observation(index, {
        cross_check_result: 'mismatch',
        false_classification_count: '1',
        resolved_at: '2026-09-06T16:00:00Z',
        resolution_evidence_ref: resolutionEvidence,
      });
    expect(() =>
      run([resolved(1, 'E-800001'), resolved(2, 'E-800001')]),
    ).toThrow(/duplicate resolution_evidence_ref/);
    expect(() => run([resolved(1, 'E-100002'), observation(2)])).toThrow(
      /resolution_evidence_ref collides with evidence_ref/,
    );
  });

  it('rejects unknown consumer keys and false fresh-clone claims', () => {
    expect(() =>
      run([], { ...draftConsumer(), privateUrl: 'https://private.example' }),
    ).toThrow(/unsupported fields/);
    expect(() => run([], { ...verifiedConsumer(), freshClone: 'no' })).toThrow(
      /freshClone must be "yes"/,
    );
  });

  it.each([
    ['repositoryAlias', 'private/repository'],
    ['repositoryAlias', 'R-ACME_PRIVATE'],
    ['verifiedCommit', 'not-a-commit'],
    ['playwrightVersion', '1.63.0'],
    ['noProoflinePackage', 'no'],
    ['workflowConclusion', 'failure'],
    ['prooflineReportSha256', 'not-a-digest'],
    ['rawReportSha256', 'not-a-digest'],
    ['verifiedAt', '2026-09-06 16:00:00'],
    ['reviewerAlias', 'Jane Doe'],
    ['reviewerAlias', 'P-JANE_DOE'],
    ['evidenceRef', 'https://private.example/run'],
    ['evidenceRef', 'E-CUSTOMER_SECRET'],
  ])('rejects invalid verified consumer %s', (field, value) => {
    expect(() => run([], { ...verifiedConsumer(), [field]: value })).toThrow();
  });

  it('rejects a populated draft consumer record', () => {
    expect(() =>
      run([], { ...draftConsumer(), repositoryAlias: 'R-900000' }),
    ).toThrow(/draft consumer field repositoryAlias must be empty/);
  });

  it('bounds the number of observation rows', () => {
    expect(() =>
      run(Array.from({ length: 1001 }, (_, index) => observation(index + 1))),
    ).toThrow(/observation count exceeds 1000/);
  });

  it('bounds both public input files before parsing', () => {
    expect(() =>
      runSources(
        `${HEADER}\n${' '.repeat(1024 * 1024)}`,
        renderConsumer(draftConsumer()),
      ),
    ).toThrow(/observations\.csv: file exceeds 1048576 bytes/);
    expect(() =>
      runSources(
        `${HEADER}\n`,
        `${' '.repeat(64 * 1024)}${renderConsumer(draftConsumer())}`,
      ),
    ).toThrow(/consumer\.json: file exceeds 65536 bytes/);
  });
});
