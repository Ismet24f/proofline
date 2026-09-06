import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const HEADERS = {
  interviews:
    'interview_id,participant_alias,team_alias,booked_at,conducted_at,qualified,role,playwright_github_actions,top_three_problem,budget_authority,price_probe_response,alternative_wedge_alias,evidence_ref',
  runs: 'run_id,team_alias,repository_alias,pr_alias,observed_at,disease_qualified,proofline_status,evidence_ref',
  findings:
    'finding_id,run_id,test_identity_hash,classification,previously_unknown,customer_confirmed,false_positive,resolved_at,evidence_ref',
  events: 'event_id,team_alias,event_type,occurred_at,value,evidence_ref',
};
const THRESHOLDS = {
  completedQualifiedInterviews: 8,
  topThreeProblem: 4,
  pilotRepositories: 3,
  observedPullRequests: 60,
  confirmedCatches: 3,
  catchTeams: 2,
  unresolvedFalsePositives: 0,
  retainedTeams: 1,
  budgetProbes: 1,
};
const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/validate-pilot-data.mjs',
);
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const workspaces: string[] = [];

function frozenManifest() {
  return {
    schemaVersion: 1,
    status: 'frozen',
    windowStart: '2026-09-01T00:00:00Z',
    windowEnd: '2026-10-01T00:00:00Z',
    evaluationAt: '2026-10-02T00:00:00Z',
    validationOwnerAlias: 'P-OWNER',
    interviewIds: Array.from(
      { length: 8 },
      (_, index) => `I-${String(index + 1).padStart(3, '0')}`,
    ),
    repositories: Array.from({ length: 3 }, (_, index) => ({
      repositoryAlias: `R-${String(index + 1).padStart(3, '0')}`,
      teamAlias: `T-${String(index + 1).padStart(3, '0')}`,
      lockfileCommit: String(index + 1).repeat(40),
      diseaseSignal: 'matrix_or_shards',
      diseaseEvidenceRef: `E-DISEASE-${String(index + 1)}`,
      authorizationEvidenceRef: `E-AUTH-${String(index + 1)}`,
      evidenceHandlingEvidenceRef: `E-HANDLING-${String(index + 1)}`,
    })),
    thresholds: THRESHOLDS,
  };
}

interface PilotData {
  freeze?: ReturnType<typeof frozenManifest> | Record<string, unknown>;
  interviews?: string[];
  runs?: string[];
  findings?: string[];
  events?: string[];
}

function validate(
  data: PilotData,
  expectedDigest?: string,
  asOf = '2026-10-02T00:00:00Z',
  replacementInterviews?: string[],
): unknown {
  const workspace = mkdtempSync(join(tmpdir(), 'proofline-pilot-data-'));
  workspaces.push(workspace);
  const freezePath = join(workspace, 'pilot-freeze.json');
  const freezeSource = `${JSON.stringify(data.freeze ?? frozenManifest(), undefined, 2)}\n`;
  writeFileSync(freezePath, freezeSource);
  const files = (['interviews', 'runs', 'findings', 'events'] as const).map(
    (name) => {
      const path = join(workspace, `${name}.csv`);
      writeFileSync(
        path,
        `${[HEADERS[name], ...(data[name] ?? [])].join('\n')}\n`,
      );
      return path;
    },
  );
  const digest =
    expectedDigest ?? createHash('sha256').update(freezeSource).digest('hex');
  const preloadArguments: string[] = [];
  const environment = { ...process.env };
  if (replacementInterviews !== undefined) {
    const hookPath = join(workspace, 'replace-second-read.mjs');
    writeFileSync(
      hookPath,
      [
        "import fs from 'node:fs';",
        "import { syncBuiltinESMExports } from 'node:module';",
        'const originalReadFileSync = fs.readFileSync;',
        'let matchingReads = 0;',
        'fs.readFileSync = function readFileSync(path, options) {',
        '  if (String(path) !== process.env.PROOFLINE_SWAP_PATH)',
        '    return originalReadFileSync(path, options);',
        '  matchingReads += 1;',
        '  if (matchingReads === 1) return originalReadFileSync(path, options);',
        "  const replacement = Buffer.from(process.env.PROOFLINE_SWAP_BASE64, 'base64');",
        "  return typeof options === 'string' ? replacement.toString(options) : replacement;",
        '};',
        'syncBuiltinESMExports();',
      ].join('\n'),
    );
    preloadArguments.push('--import', hookPath);
    environment.PROOFLINE_SWAP_PATH = files[0];
    environment.PROOFLINE_SWAP_BASE64 = Buffer.from(
      `${[HEADERS.interviews, ...replacementInterviews].join('\n')}\n`,
    ).toString('base64');
  }
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        ...preloadArguments,
        SCRIPT,
        freezePath,
        ...files,
        `--as-of=${asOf}`,
        `--expected-freeze-sha256=${digest}`,
      ],
      { encoding: 'utf8', env: environment },
    ),
  ) as unknown;
}

function completeData(): Required<
  Pick<PilotData, 'interviews' | 'runs' | 'findings' | 'events'>
> {
  const interviews = Array.from({ length: 8 }, (_, index) => {
    const current = index + 1;
    return [
      `I-${String(current).padStart(3, '0')}`,
      `P-${String(current).padStart(3, '0')}`,
      `T-${String((index % 3) + 1).padStart(3, '0')}`,
      '2026-08-20T09:00:00Z',
      `2026-09-${String(current + 1).padStart(2, '0')}T09:00:00Z`,
      'yes',
      'qa_lead',
      'yes',
      index < 4 ? 'yes' : 'no',
      index === 0 ? 'yes' : 'no',
      index === 0 ? 'consider' : '',
      '',
      `E-INTERVIEW-${String(current)}`,
    ].join(',');
  });
  const runs = Array.from({ length: 60 }, (_, index) => {
    const cohort = (index % 3) + 1;
    return `RUN-${String(index + 1).padStart(3, '0')},T-${String(cohort).padStart(3, '0')},R-${String(cohort).padStart(3, '0')},PR-${String(index + 1).padStart(3, '0')},2026-09-15T12:00:00Z,yes,complete,E-RUN-${String(index + 1)}`;
  });
  const findings = [1, 2, 3].map(
    (current) =>
      `F-${String(current).padStart(3, '0')},RUN-${String(current).padStart(3, '0')},${String(current).repeat(64)},incomplete,yes,yes,no,,E-FINDING-${String(current)}`,
  );
  const events = [
    'EV-001,T-001,retention_day_30,2026-10-01T00:00:00Z,enabled,E-RETENTION-1',
    'EV-002,T-001,noise_rating,2026-09-30T12:00:00Z,not_annoying,E-NOISE-1',
  ];
  return { interviews, runs, findings, events };
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('validate-pilot-data', () => {
  it('accepts the public draft contracts without starting the clock', () => {
    const output = execFileSync(process.execPath, [SCRIPT], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({
      outcome: 'NOT_STARTED',
      reason: 'preflight_not_frozen',
    });
  });

  it('computes PROCEED only from a complete frozen cohort', () => {
    const result = validate(completeData()) as {
      inputSha256: Record<string, string>;
    };
    expect(result).toMatchObject({
      outcome: 'PROCEED',
      rule: 'all_commercial_measures_met',
      window: { evaluationAt: '2026-10-02T00:00:00Z' },
      measures: {
        completedQualifiedInterviews: { value: 8, met: true },
        pilotRepositories: { value: 3, met: true },
        observedPullRequests: { value: 60, met: true },
        confirmedCatches: { value: 3, met: true },
        catchTeams: { value: 3, met: true },
        retainedTeams: { value: 1, met: true },
        budgetProbes: { value: 1, met: true },
      },
    });
    expect(Object.keys(result.inputSha256).sort()).toEqual([
      'events',
      'findings',
      'freeze',
      'interviews',
      'runs',
    ]);
    for (const digest of Object.values(result.inputSha256)) {
      expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it.each([
    [
      'OBSERVING',
      (data: ReturnType<typeof completeData>) => data,
      '2026-09-20T00:00:00Z',
    ],
    [
      'INCONCLUSIVE',
      (data: ReturnType<typeof completeData>) => ({
        ...data,
        runs: data.runs.slice(0, 59),
      }),
      '2026-10-02T00:00:00Z',
    ],
    [
      'STOP',
      (data: ReturnType<typeof completeData>) => ({
        ...data,
        findings: [],
      }),
      '2026-10-02T00:00:00Z',
    ],
    [
      'NARROW',
      (data: ReturnType<typeof completeData>) => ({
        ...data,
        interviews: data.interviews.map((row, index) => {
          if (index >= 4) return row;
          const fields = row.split(',');
          fields[11] = 'W-ALTERNATIVE';
          return fields.join(',');
        }),
        events: data.events.filter(
          (event) => !event.includes('retention_day_30'),
        ),
      }),
      '2026-10-02T00:00:00Z',
    ],
  ])('computes the mutually exclusive %s branch', (outcome, mutate, asOf) => {
    expect(validate(mutate(completeData()), undefined, asOf)).toMatchObject({
      outcome,
    });
  });

  it('rejects a changed freeze against its externally retained digest', () => {
    expect(() => validate(completeData(), 'a'.repeat(64))).toThrow(
      /freeze SHA-256 does not match/,
    );
  });

  it('rejects duplicate participant aliases', () => {
    const data = completeData();
    data.interviews[1] = data.interviews[1]?.replace('P-002', 'P-001') ?? '';
    expect(() => validate(data)).toThrow(/duplicate participant_alias/);
  });

  it('rejects duplicate pull-request aliases within a repository', () => {
    const data = completeData();
    data.runs[3] =
      data.runs[3]?.replace('PR-004', 'PR-001').replace('R-001', 'R-001') ?? '';
    expect(() => validate(data)).toThrow(
      /duplicate repository_alias\/pr_alias/,
    );
  });

  it('requires a controlled response from a completed budget authority', () => {
    const data = completeData();
    const fields = data.interviews[0]?.split(',') ?? [];
    fields[10] = '';
    data.interviews[0] = fields.join(',');
    expect(() => validate(data)).toThrow(/price_probe_response/);
  });

  it('rejects arbitrary classifications and event values', () => {
    const data = completeData();
    data.findings[0] =
      data.findings[0]?.replace(',incomplete,', ',probably_missing,') ?? '';
    expect(() => validate(data)).toThrow(/unsupported classification/);
  });

  it('requires each frozen repository to represent a distinct team', () => {
    const freeze = frozenManifest();
    if (freeze.repositories[1]) freeze.repositories[1].teamAlias = 'T-001';
    expect(() => validate({ freeze })).toThrow(/distinct team/);
  });

  it('hashes the same interview bytes that it evaluates', () => {
    const data = completeData();
    const replacement = data.interviews.map((row) => {
      const fields = row.split(',');
      fields[8] = 'no';
      return fields.join(',');
    });
    const source = `${[HEADERS.interviews, ...data.interviews].join('\n')}\n`;
    const result = validate(data, undefined, undefined, replacement) as {
      inputSha256: { interviews: string };
      measures: { topThreeProblem: { value: number } };
    };

    expect(result.measures.topThreeProblem.value).toBe(4);
    expect(result.inputSha256.interviews).toBe(
      createHash('sha256').update(source).digest('hex'),
    );
  });

  it('waits for the frozen evaluation cutoff before producing a final decision', () => {
    expect(
      validate(completeData(), undefined, '2026-10-01T00:00:00Z'),
    ).toMatchObject({ outcome: 'OBSERVING', rule: 'decision_cutoff_pending' });
  });

  it('rejects evaluation after the frozen cutoff', () => {
    expect(() =>
      validate(completeData(), undefined, '2026-10-02T00:00:01Z'),
    ).toThrow(/must not be after evaluationAt/);
  });

  it('rejects retention that contradicts low-value removal', () => {
    const data = completeData();
    data.events.push(
      'EV-003,T-001,removal_reason,2026-09-25T00:00:00Z,low_value,E-REMOVAL-1',
      'EV-004,T-002,removal_reason,2026-09-25T00:00:00Z,low_value,E-REMOVAL-2',
      'EV-005,T-003,removal_reason,2026-09-25T00:00:00Z,low_value,E-REMOVAL-3',
    );

    expect(() => validate(data)).toThrow(
      /retention contradicts low-value removal/,
    );
  });

  it('rejects impossible calendar timestamps', () => {
    const data = completeData();
    data.interviews[0] =
      data.interviews[0]?.replace(
        '2026-08-20T09:00:00Z',
        '2026-02-31T09:00:00Z',
      ) ?? '';

    expect(() => validate(data)).toThrow(/canonical UTC ISO 8601 timestamp/);
  });

  it('rejects noncanonical fractional timestamps', () => {
    const data = completeData();
    data.interviews[0] =
      data.interviews[0]?.replace(
        '2026-08-20T09:00:00Z',
        '2026-08-20T09:00:00.1Z',
      ) ?? '';

    expect(() => validate(data)).toThrow(/canonical UTC ISO 8601 timestamp/);
  });

  it('returns STOP when every pilot team removed Proofline for low value', () => {
    const data = completeData();
    data.events = [
      'EV-003,T-001,removal_reason,2026-09-25T00:00:00Z,low_value,E-REMOVAL-1',
      'EV-004,T-002,removal_reason,2026-09-25T00:00:00Z,low_value,E-REMOVAL-2',
      'EV-005,T-003,removal_reason,2026-09-25T00:00:00Z,low_value,E-REMOVAL-3',
    ];

    expect(validate(data)).toMatchObject({
      outcome: 'STOP',
      rule: 'explicit_stop_condition',
    });
  });

  it.each([
    ['top-level', () => ({ ...frozenManifest(), customerName: 'Acme' })],
    [
      'repository',
      () => {
        const freeze = frozenManifest();
        const repository = freeze.repositories[0];
        if (repository === undefined)
          throw new Error('fixture must contain a repository');
        Object.assign(repository, {
          repositoryUrl: 'https://example.test/private',
        });
        return freeze;
      },
    ],
  ])('rejects unknown %s freeze keys', (_scope, makeFreeze) => {
    expect(() => validate({ freeze: makeFreeze() })).toThrow(
      /contains unsupported fields/,
    );
  });
});
