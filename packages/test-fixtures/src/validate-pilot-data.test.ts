import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const INTERVIEW_HEADER =
  'interview_id,team_alias,booked_at,conducted_at,qualified,role,playwright_github_actions,top_three_problem,budget_authority,price_probe_response,evidence_url';
const OBSERVATION_HEADER =
  'observation_id,team_alias,repository_alias,pr_alias,observed_at,disease_signal,proofline_status,classification,previously_unknown,customer_confirmed,false_positive,resolved_at,evidence_url';
const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/validate-pilot-data.mjs',
);
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const workspaces: string[] = [];

function validate(interviewRows: string[], observationRows: string[]): string {
  const workspace = mkdtempSync(join(tmpdir(), 'proofline-pilot-data-'));
  workspaces.push(workspace);
  const interviews = join(workspace, 'interviews.csv');
  const observations = join(workspace, 'pilot-observations.csv');

  writeFileSync(
    interviews,
    `${[INTERVIEW_HEADER, ...interviewRows].join('\n')}\n`,
  );
  writeFileSync(
    observations,
    `${[OBSERVATION_HEADER, ...observationRows].join('\n')}\n`,
  );

  return execFileSync(process.execPath, [SCRIPT, interviews, observations], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('validate-pilot-data', () => {
  it('accepts the two blank public templates', () => {
    expect(
      execFileSync(process.execPath, [SCRIPT], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
      }),
    ).toContain('validated 0 interviews and 0 observations');
  });

  it('rejects duplicate immutable record IDs', () => {
    expect(() =>
      validate(
        [
          'I-001,T-001,2026-09-06T09:00:00Z,,yes,qa_lead,yes,yes,no,,E-001',
          'I-001,T-002,2026-09-06T10:00:00Z,,yes,release_owner,yes,no,no,,E-002',
        ],
        [],
      ),
    ).toThrow(/duplicate interview_id "I-001"/);
  });

  it('rejects raw repository names instead of opaque aliases', () => {
    expect(() =>
      validate(
        [],
        [
          'O-001,T-001,acme/payments,PR-001,2026-09-06T11:00:00Z,matrix,complete,complete,no,no,no,,E-003',
        ],
      ),
    ).toThrow(/repository_alias must be an opaque R- alias/);
  });

  it('rejects invalid boolean tokens', () => {
    expect(() =>
      validate(
        ['I-001,T-001,2026-09-06T09:00:00Z,,true,qa_lead,yes,yes,no,,E-001'],
        [],
      ),
    ).toThrow(/qualified must be "yes" or "no"/);
  });

  it('rejects a qualified interview without the required toolchain', () => {
    expect(() =>
      validate(
        ['I-001,T-001,2026-09-06T09:00:00Z,,yes,qa_lead,no,yes,no,,E-001'],
        [],
      ),
    ).toThrow(/qualified=yes requires playwright_github_actions=yes/);
  });

  it('rejects relative or date-only values for immutable timestamps', () => {
    expect(() =>
      validate(
        [],
        [
          'O-001,T-001,R-001,PR-001,2026-09-06,matrix,complete,complete,no,no,no,,E-003',
        ],
      ),
    ).toThrow(/observed_at must be an absolute ISO 8601 timestamp/);
  });

  it('rejects a customer confirmation without linked evidence', () => {
    expect(() =>
      validate(
        [],
        [
          'O-001,T-001,R-001,PR-001,2026-09-06T11:00:00Z,matrix,not_executed,absent,yes,yes,no,,',
        ],
      ),
    ).toThrow(/customer_confirmed=yes requires evidence_url/);
  });
});
