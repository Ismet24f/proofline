#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DAY_MS = 86_400_000;
const HEADERS = {
  interviews: [
    'interview_id',
    'participant_alias',
    'team_alias',
    'booked_at',
    'conducted_at',
    'qualified',
    'role',
    'playwright_github_actions',
    'top_three_problem',
    'budget_authority',
    'price_probe_response',
    'alternative_wedge_alias',
    'evidence_ref',
  ],
  runs: [
    'run_id',
    'team_alias',
    'repository_alias',
    'pr_alias',
    'observed_at',
    'disease_qualified',
    'proofline_status',
    'evidence_ref',
  ],
  findings: [
    'finding_id',
    'run_id',
    'test_identity_hash',
    'classification',
    'previously_unknown',
    'customer_confirmed',
    'false_positive',
    'resolved_at',
    'evidence_ref',
  ],
  events: [
    'event_id',
    'team_alias',
    'event_type',
    'occurred_at',
    'value',
    'evidence_ref',
  ],
};
const THRESHOLDS = Object.freeze({
  completedQualifiedInterviews: 8,
  topThreeProblem: 4,
  pilotRepositories: 3,
  observedPullRequests: 60,
  confirmedCatches: 3,
  catchTeams: 2,
  unresolvedFalsePositives: 0,
  retainedTeams: 1,
  budgetProbes: 1,
});
const QUALIFIED_ROLES = new Set([
  'qa_lead',
  'senior_qa_engineer',
  'automation_engineer',
  'sdet',
  'release_owner',
  'engineering_manager',
  'head_of_qa',
]);
const PRICE_RESPONSES = new Set(['accept', 'consider', 'reject', 'declined']);
const DISEASE_SIGNALS = new Set([
  'conditional_job',
  'matrix_or_shards',
  'runtime_skip',
  'retries',
]);
const STATUSES = new Set(['complete', 'evidence_gaps', 'tool_error']);
const CLASSIFICATIONS = new Set([
  'executed_as_expected',
  'retry_masked',
  'failed',
  'runtime_skipped',
  'incomplete',
  'absent',
  'no_evidence',
  'unexpected',
]);
const NOT_EXECUTED = new Set(['incomplete', 'absent', 'no_evidence']);
const EVENT_VALUES = {
  retention_day_30: new Set(['enabled', 'removed']),
  noise_rating: new Set(['ignored', 'not_annoying', 'annoying', 'unusable']),
  removal_reason: new Set(['low_value', 'other']),
};
const ABSOLUTE_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_REFERENCE = /^E-[A-Za-z0-9_-]+$/;
const ALIASES = {
  interview_id: /^I-[A-Z0-9_-]+$/,
  participant_alias: /^P-[A-Z0-9_-]+$/,
  team_alias: /^T-[A-Z0-9_-]+$/,
  repository_alias: /^R-[A-Z0-9_-]+$/,
  pr_alias: /^PR-[A-Z0-9_-]+$/,
  run_id: /^RUN-[A-Z0-9_-]+$/,
  finding_id: /^F-[A-Z0-9_-]+$/,
  event_id: /^EV-[A-Z0-9_-]+$/,
  alternative_wedge_alias: /^W-[A-Z0-9_-]+$/,
  validationOwnerAlias: /^P-[A-Z0-9_-]+$/,
};

function fail(message) {
  throw new Error(message);
}

function parseCsv(source, filePath) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) fail(`${filePath}: unterminated quoted field`);
  if (field.length > 0 || row.length > 0) rows.push([...row, field]);
  return rows.filter((candidate) => candidate.some((value) => value !== ''));
}

function readRecords(filePath, header, source) {
  const rows = parseCsv(source, filePath);
  if (rows.shift()?.join(',') !== header.join(','))
    fail(`${filePath}: header does not match the published contract`);
  return rows.map((values, index) => {
    if (values.length !== header.length)
      fail(
        `${filePath}:${String(index + 2)}: expected ${String(header.length)} fields, received ${String(values.length)}`,
      );
    return Object.fromEntries(
      header.map((name, offset) => [name, values[offset]]),
    );
  });
}

function location(filePath, index) {
  return `${filePath}:${String(index + 2)}`;
}
function required(record, field, at) {
  if (!record[field]) fail(`${at}: ${field} is required`);
}
function alias(record, field, at, optional = false) {
  if (optional && record[field] === '') return;
  if (!ALIASES[field]?.test(record[field]))
    fail(`${at}: ${field} must be an opaque ${field} alias`);
}
function timestamp(record, field, at, optional = false) {
  const value = record[field];
  if (optional && value === '') return;
  const parsed = Date.parse(value);
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_match, fraction = '') => `.${fraction.padEnd(3, '0')}Z`,
  );
  if (
    !ABSOLUTE_TIMESTAMP.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString() !== normalized
  )
    fail(`${at}: ${field} must be a canonical UTC ISO 8601 timestamp`);
}

function exactKeys(value, expected, at) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    fail(`${at}: contains unsupported fields or omits required fields`);
}
function bool(record, field, at) {
  if (record[field] !== 'yes' && record[field] !== 'no')
    fail(`${at}: ${field} must be "yes" or "no"`);
}
function evidence(record, at) {
  if (!EVIDENCE_REFERENCE.test(record.evidence_ref))
    fail(`${at}: evidence_ref must be an alias-safe E- reference`);
}
function unique(records, field, filePath) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record[field]))
      fail(`${filePath}: duplicate ${field} "${record[field]}"`);
    seen.add(record[field]);
  }
}

function validateInterviews(records, filePath) {
  unique(records, 'interview_id', filePath);
  unique(records, 'participant_alias', filePath);
  unique(records, 'evidence_ref', filePath);
  records.forEach((record, index) => {
    const at = location(filePath, index);
    for (const field of [
      'interview_id',
      'participant_alias',
      'team_alias',
      'booked_at',
      'role',
    ])
      required(record, field, at);
    for (const field of ['interview_id', 'participant_alias', 'team_alias'])
      alias(record, field, at);
    alias(record, 'alternative_wedge_alias', at, true);
    timestamp(record, 'booked_at', at);
    timestamp(record, 'conducted_at', at, true);
    for (const field of [
      'qualified',
      'playwright_github_actions',
      'top_three_problem',
      'budget_authority',
    ])
      bool(record, field, at);
    if (record.qualified === 'yes' && !QUALIFIED_ROLES.has(record.role))
      fail(`${at}: qualified=yes requires an allowed role`);
    if (
      record.qualified === 'yes' &&
      record.playwright_github_actions !== 'yes'
    )
      fail(`${at}: qualified=yes requires playwright_github_actions=yes`);
    if (
      record.conducted_at &&
      Date.parse(record.conducted_at) < Date.parse(record.booked_at)
    )
      fail(`${at}: conducted_at cannot precede booked_at`);
    if (
      record.budget_authority === 'yes' &&
      record.conducted_at &&
      !PRICE_RESPONSES.has(record.price_probe_response)
    )
      fail(
        `${at}: a completed budget-authority interview requires a controlled price_probe_response`,
      );
    if (record.budget_authority === 'no' && record.price_probe_response !== '')
      fail(`${at}: price_probe_response requires budget_authority=yes`);
    evidence(record, at);
  });
}

function validateRuns(records, filePath) {
  unique(records, 'run_id', filePath);
  unique(records, 'evidence_ref', filePath);
  const pullRequests = new Set();
  records.forEach((record, index) => {
    const at = location(filePath, index);
    for (const field of HEADERS.runs) required(record, field, at);
    for (const field of [
      'run_id',
      'team_alias',
      'repository_alias',
      'pr_alias',
    ])
      alias(record, field, at);
    timestamp(record, 'observed_at', at);
    bool(record, 'disease_qualified', at);
    if (!STATUSES.has(record.proofline_status))
      fail(`${at}: unsupported proofline_status`);
    evidence(record, at);
    const key = `${record.repository_alias}:${record.pr_alias}`;
    if (pullRequests.has(key))
      fail(`${filePath}: duplicate repository_alias/pr_alias "${key}"`);
    pullRequests.add(key);
  });
}

function validateFindings(records, filePath) {
  unique(records, 'finding_id', filePath);
  unique(records, 'evidence_ref', filePath);
  const identities = new Set();
  records.forEach((record, index) => {
    const at = location(filePath, index);
    for (const field of [
      'finding_id',
      'run_id',
      'test_identity_hash',
      'classification',
    ])
      required(record, field, at);
    for (const field of ['finding_id', 'run_id']) alias(record, field, at);
    for (const field of [
      'previously_unknown',
      'customer_confirmed',
      'false_positive',
    ])
      bool(record, field, at);
    timestamp(record, 'resolved_at', at, true);
    if (!CLASSIFICATIONS.has(record.classification))
      fail(`${at}: unsupported classification`);
    if (record.false_positive === 'yes' && record.customer_confirmed !== 'yes')
      fail(`${at}: false_positive=yes requires customer_confirmed=yes`);
    if (!SHA256.test(record.test_identity_hash))
      fail(`${at}: test_identity_hash must be a lowercase SHA-256`);
    const identity = `${record.run_id}:${record.test_identity_hash}`;
    if (identities.has(identity))
      fail(`${filePath}: duplicate run_id/test_identity_hash "${identity}"`);
    identities.add(identity);
    evidence(record, at);
  });
}

function validateEvents(records, filePath) {
  unique(records, 'event_id', filePath);
  unique(records, 'evidence_ref', filePath);
  const teamEventTypes = new Set();
  records.forEach((record, index) => {
    const at = location(filePath, index);
    for (const field of HEADERS.events) required(record, field, at);
    for (const field of ['event_id', 'team_alias']) alias(record, field, at);
    timestamp(record, 'occurred_at', at);
    const allowed = EVENT_VALUES[record.event_type];
    if (!allowed || !allowed.has(record.value))
      fail(`${at}: unsupported event_type/value combination`);
    const teamEventType = `${record.team_alias}:${record.event_type}`;
    if (teamEventTypes.has(teamEventType))
      fail(`${filePath}: duplicate team_alias/event_type "${teamEventType}"`);
    teamEventTypes.add(teamEventType);
    evidence(record, at);
  });
}

function parseFreeze(filePath, source) {
  let freeze;
  try {
    freeze = JSON.parse(source);
  } catch {
    fail(`${filePath}: invalid JSON`);
  }
  if (!freeze || typeof freeze !== 'object' || Array.isArray(freeze))
    fail(`${filePath}: freeze must be an object`);
  exactKeys(
    freeze,
    [
      'schemaVersion',
      'status',
      'windowStart',
      'windowEnd',
      'evaluationAt',
      'validationOwnerAlias',
      'interviewIds',
      'repositories',
      'thresholds',
    ],
    filePath,
  );
  if (freeze.schemaVersion !== 1) fail(`${filePath}: schemaVersion must be 1`);
  if (freeze.status !== 'draft' && freeze.status !== 'frozen')
    fail(`${filePath}: status must be draft or frozen`);
  if (
    !freeze.thresholds ||
    typeof freeze.thresholds !== 'object' ||
    JSON.stringify(Object.keys(freeze.thresholds).sort()) !==
      JSON.stringify(Object.keys(THRESHOLDS).sort()) ||
    Object.entries(THRESHOLDS).some(
      ([name, value]) => freeze.thresholds[name] !== value,
    )
  )
    fail(`${filePath}: thresholds differ from the frozen contract`);
  if (
    !Array.isArray(freeze.interviewIds) ||
    !Array.isArray(freeze.repositories)
  )
    fail(`${filePath}: cohorts must be arrays`);
  if (freeze.status === 'draft') {
    if (
      freeze.windowStart !== '' ||
      freeze.windowEnd !== '' ||
      freeze.evaluationAt !== '' ||
      freeze.validationOwnerAlias !== '' ||
      freeze.interviewIds.length !== 0 ||
      freeze.repositories.length !== 0
    )
      fail(`${filePath}: draft freeze must not contain a partial cohort`);
    return { freeze, source };
  }
  timestamp({ window_start: freeze.windowStart }, 'window_start', filePath);
  timestamp({ window_end: freeze.windowEnd }, 'window_end', filePath);
  timestamp({ evaluation_at: freeze.evaluationAt }, 'evaluation_at', filePath);
  alias(
    { validationOwnerAlias: freeze.validationOwnerAlias },
    'validationOwnerAlias',
    filePath,
  );
  if (
    Date.parse(freeze.windowEnd) - Date.parse(freeze.windowStart) !==
    30 * DAY_MS
  )
    fail(`${filePath}: windowEnd must be exactly 30 days after windowStart`);
  if (
    Date.parse(freeze.evaluationAt) < Date.parse(freeze.windowEnd) ||
    Date.parse(freeze.evaluationAt) > Date.parse(freeze.windowEnd) + DAY_MS
  )
    fail(
      `${filePath}: evaluationAt must be between windowEnd and 24 hours after windowEnd`,
    );
  if (
    freeze.interviewIds.length !== 8 ||
    new Set(freeze.interviewIds).size !== 8 ||
    freeze.interviewIds.some((id) => !ALIASES.interview_id.test(id))
  )
    fail(
      `${filePath}: frozen cohort must contain exactly 8 unique interviewIds`,
    );
  if (freeze.repositories.length !== 3)
    fail(`${filePath}: frozen cohort must contain exactly 3 repositories`);
  const repositoryAliases = new Set();
  const teamAliases = new Set();
  for (const repository of freeze.repositories) {
    if (
      !repository ||
      typeof repository !== 'object' ||
      Array.isArray(repository)
    )
      fail(`${filePath}: each repository must be an object`);
    exactKeys(
      repository,
      [
        'repositoryAlias',
        'teamAlias',
        'lockfileCommit',
        'diseaseSignal',
        'diseaseEvidenceRef',
        'authorizationEvidenceRef',
        'evidenceHandlingEvidenceRef',
      ],
      filePath,
    );
    for (const field of [
      'repositoryAlias',
      'teamAlias',
      'lockfileCommit',
      'diseaseSignal',
      'diseaseEvidenceRef',
      'authorizationEvidenceRef',
      'evidenceHandlingEvidenceRef',
    ])
      required(repository, field, filePath);
    if (
      !ALIASES.repository_alias.test(repository.repositoryAlias) ||
      !ALIASES.team_alias.test(repository.teamAlias)
    )
      fail(`${filePath}: repository and team aliases must be opaque`);
    if (!SHA.test(repository.lockfileCommit))
      fail(`${filePath}: lockfileCommit must be a lowercase 40-character SHA`);
    if (!DISEASE_SIGNALS.has(repository.diseaseSignal))
      fail(`${filePath}: unsupported diseaseSignal`);
    for (const field of [
      'diseaseEvidenceRef',
      'authorizationEvidenceRef',
      'evidenceHandlingEvidenceRef',
    ])
      if (!EVIDENCE_REFERENCE.test(repository[field]))
        fail(`${filePath}: ${field} must be an E- reference`);
    if (repositoryAliases.has(repository.repositoryAlias))
      fail(`${filePath}: duplicate repositoryAlias`);
    if (teamAliases.has(repository.teamAlias))
      fail(`${filePath}: each pilot repository must belong to a distinct team`);
    repositoryAliases.add(repository.repositoryAlias);
    teamAliases.add(repository.teamAlias);
  }
  return { freeze, source };
}

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function evaluate(freeze, interviews, runs, findings, events, asOf, digest) {
  if (freeze.status === 'draft')
    return {
      schemaVersion: 1,
      outcome: 'NOT_STARTED',
      freezeSha256: digest,
      reason: 'preflight_not_frozen',
    };
  const start = Date.parse(freeze.windowStart);
  const end = Date.parse(freeze.windowEnd);
  const evaluationAt = Date.parse(freeze.evaluationAt);
  const now = Date.parse(asOf);
  const frozenInterviews = new Set(freeze.interviewIds);
  const repositoryMap = new Map(
    freeze.repositories.map((entry) => [
      entry.repositoryAlias,
      entry.teamAlias,
    ]),
  );
  const teamSet = new Set(repositoryMap.values());
  const included = { interviews: [], runs: [], findings: [], events: [] };
  const excluded = [];
  const qualified = interviews.filter((record) => {
    const conducted = Date.parse(record.conducted_at);
    const include =
      frozenInterviews.has(record.interview_id) &&
      record.qualified === 'yes' &&
      record.playwright_github_actions === 'yes' &&
      record.conducted_at !== '' &&
      Date.parse(record.booked_at) <= start &&
      conducted >= start &&
      conducted <= end;
    if (include) included.interviews.push(record.interview_id);
    else
      excluded.push({
        id: record.interview_id,
        reason: 'not_completed_qualified_frozen_interview',
      });
    return include;
  });
  const validRuns = runs.filter((record) => {
    const observed = Date.parse(record.observed_at);
    const include =
      repositoryMap.get(record.repository_alias) === record.team_alias &&
      observed >= start &&
      observed < end &&
      record.disease_qualified === 'yes' &&
      record.proofline_status !== 'tool_error';
    if (include) included.runs.push(record.run_id);
    else
      excluded.push({
        id: record.run_id,
        reason: 'run_outside_frozen_valid_cohort',
      });
    return include;
  });
  const runMap = new Map(validRuns.map((record) => [record.run_id, record]));
  const validFindings = findings.filter((record) => {
    const run = runMap.get(record.run_id);
    const include =
      run !== undefined &&
      (!record.resolved_at ||
        Date.parse(record.resolved_at) >= Date.parse(run.observed_at));
    if (include) included.findings.push(record.finding_id);
    else
      excluded.push({
        id: record.finding_id,
        reason: 'finding_without_valid_run',
      });
    return include;
  });
  const validEvents = events.filter((record) => {
    const occurred = Date.parse(record.occurred_at);
    const include =
      teamSet.has(record.team_alias) && occurred >= start && occurred <= now;
    if (include) included.events.push(record.event_id);
    else
      excluded.push({
        id: record.event_id,
        reason: 'event_outside_frozen_team_or_time',
      });
    return include;
  });
  const catches = validFindings.filter(
    (record) =>
      NOT_EXECUTED.has(record.classification) &&
      record.previously_unknown === 'yes' &&
      record.customer_confirmed === 'yes' &&
      record.false_positive === 'no',
  );
  const catchTeams = new Set(
    catches.map((record) => runMap.get(record.run_id).team_alias),
  );
  const unresolvedFalsePositives = validFindings.filter(
    (record) =>
      record.false_positive === 'yes' &&
      (!record.resolved_at || Date.parse(record.resolved_at) > end),
  );
  const retainedTeams = new Set(
    validEvents
      .filter(
        (record) =>
          record.event_type === 'retention_day_30' &&
          record.value === 'enabled' &&
          Date.parse(record.occurred_at) >= end,
      )
      .map((record) => record.team_alias),
  );
  const removedLowValueTeams = new Set(
    validEvents
      .filter(
        (record) =>
          record.event_type === 'removal_reason' &&
          record.value === 'low_value',
      )
      .map((record) => record.team_alias),
  );
  for (const team of retainedTeams)
    if (removedLowValueTeams.has(team))
      fail(`team ${team}: retention contradicts low-value removal`);
  const budgetProbes = qualified.filter(
    (record) =>
      record.budget_authority === 'yes' &&
      PRICE_RESPONSES.has(record.price_probe_response),
  );
  const alternativeCounts = new Map();
  for (const record of qualified)
    if (record.alternative_wedge_alias)
      alternativeCounts.set(
        record.alternative_wedge_alias,
        (alternativeCounts.get(record.alternative_wedge_alias) ?? 0) + 1,
      );
  const alternativeConsensus = Math.max(0, ...alternativeCounts.values());
  const values = {
    completedQualifiedInterviews: qualified.length,
    topThreeProblem: qualified.filter(
      (record) => record.top_three_problem === 'yes',
    ).length,
    pilotRepositories: new Set(
      validRuns.map((record) => record.repository_alias),
    ).size,
    observedPullRequests: validRuns.length,
    confirmedCatches: catches.length,
    catchTeams: catchTeams.size,
    unresolvedFalsePositives: unresolvedFalsePositives.length,
    retainedTeams: retainedTeams.size,
    budgetProbes: budgetProbes.length,
  };
  const measures = Object.fromEntries(
    Object.entries(THRESHOLDS).map(([name, threshold]) => [
      name,
      {
        value: values[name],
        threshold,
        met:
          name === 'unresolvedFalsePositives'
            ? values[name] === threshold
            : values[name] >= threshold,
      },
    ]),
  );
  const allRemoved = removedLowValueTeams.size === teamSet.size;
  let outcome;
  let rule;
  if (now < start) {
    outcome = 'NOT_STARTED';
    rule = 'window_not_started';
  } else if (now < evaluationAt) {
    outcome = allRemoved ? 'STOP' : 'OBSERVING';
    rule = allRemoved
      ? 'early_all_teams_removed_for_low_value'
      : now < end
        ? 'window_in_progress'
        : 'decision_cutoff_pending';
  } else if (
    !measures.completedQualifiedInterviews.met ||
    !measures.pilotRepositories.met ||
    !measures.observedPullRequests.met
  ) {
    outcome = 'INCONCLUSIVE';
    rule = 'minimum_sample_unmet';
  } else if (
    values.topThreeProblem < 2 ||
    values.confirmedCatches === 0 ||
    values.unresolvedFalsePositives > 0 ||
    allRemoved
  ) {
    outcome = 'STOP';
    rule = 'explicit_stop_condition';
  } else if (Object.values(measures).every((measure) => measure.met)) {
    outcome = 'PROCEED';
    rule = 'all_commercial_measures_met';
  } else if (
    measures.topThreeProblem.met &&
    measures.confirmedCatches.met &&
    measures.catchTeams.met &&
    alternativeConsensus >= 4
  ) {
    outcome = 'NARROW';
    rule = 'consistent_alternative_wedge';
  } else {
    outcome = 'STOP';
    rule = 'commercial_value_not_established';
  }
  const noiseRatings = validEvents
    .filter((record) => record.event_type === 'noise_rating')
    .map((record) => ({
      teamAlias: record.team_alias,
      value: record.value,
      eventId: record.event_id,
    }));
  return {
    schemaVersion: 1,
    outcome,
    rule,
    decisionAt: asOf,
    decisionOwnerAlias: freeze.validationOwnerAlias,
    freezeSha256: digest,
    window: {
      start: freeze.windowStart,
      end: freeze.windowEnd,
      evaluationAt: freeze.evaluationAt,
    },
    frozenCohort: {
      interviewIds: freeze.interviewIds,
      repositories: freeze.repositories.map(
        ({ repositoryAlias, teamAlias }) => ({ repositoryAlias, teamAlias }),
      ),
    },
    measures,
    noiseRatings,
    included,
    excluded,
  };
}

function parseArguments(argv) {
  const options = {
    paths: [],
    asOf: new Date().toISOString(),
    expectedDigest: '',
    out: '',
  };
  for (const argument of argv) {
    if (argument.startsWith('--as-of='))
      options.asOf = argument.slice('--as-of='.length);
    else if (argument.startsWith('--expected-freeze-sha256='))
      options.expectedDigest = argument.slice(
        '--expected-freeze-sha256='.length,
      );
    else if (argument.startsWith('--out='))
      options.out = resolve(argument.slice('--out='.length));
    else options.paths.push(resolve(argument));
  }
  const defaults = [
    'docs/validation/pilot-freeze.json',
    'docs/validation/interviews.csv',
    'docs/validation/pilot-runs.csv',
    'docs/validation/pilot-findings.csv',
    'docs/validation/team-events.csv',
  ].map((path) => resolve(ROOT, path));
  return {
    ...options,
    paths: defaults.map((fallback, index) => options.paths[index] ?? fallback),
  };
}

function writeAtomically(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, value, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const [freezePath, interviewsPath, runsPath, findingsPath, eventsPath] =
    options.paths;
  const inputSources = options.paths.map((path) => readFileSync(path));
  const source = inputSources[0].toString('utf8');
  const { freeze } = parseFreeze(freezePath, source);
  const digest = sha256(source);
  if (freeze.status === 'frozen') {
    if (!/^[a-f0-9]{64}$/.test(options.expectedDigest))
      fail(
        'frozen evaluation requires --expected-freeze-sha256=<64 lowercase hex>',
      );
    if (options.expectedDigest !== digest)
      fail('freeze SHA-256 does not match the externally retained digest');
  }
  const interviews = readRecords(
    interviewsPath,
    HEADERS.interviews,
    inputSources[1].toString('utf8'),
  );
  const runs = readRecords(
    runsPath,
    HEADERS.runs,
    inputSources[2].toString('utf8'),
  );
  const findings = readRecords(
    findingsPath,
    HEADERS.findings,
    inputSources[3].toString('utf8'),
  );
  const events = readRecords(
    eventsPath,
    HEADERS.events,
    inputSources[4].toString('utf8'),
  );
  validateInterviews(interviews, interviewsPath);
  validateRuns(runs, runsPath);
  validateFindings(findings, findingsPath);
  validateEvents(events, eventsPath);
  timestamp({ as_of: options.asOf }, 'as_of', '--as-of');
  if (
    freeze.status === 'frozen' &&
    Date.parse(options.asOf) > Date.parse(freeze.evaluationAt)
  )
    fail('--as-of must not be after evaluationAt');
  const decision = {
    ...evaluate(
      freeze,
      interviews,
      runs,
      findings,
      events,
      options.asOf,
      digest,
    ),
    inputSha256: {
      freeze: digest,
      interviews: sha256(inputSources[1]),
      runs: sha256(inputSources[2]),
      findings: sha256(inputSources[3]),
      events: sha256(inputSources[4]),
    },
  };
  const serialized = `${JSON.stringify(decision, undefined, 2)}\n`;
  if (options.out) writeAtomically(options.out, serialized);
  process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(
    `Pilot data validation failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
