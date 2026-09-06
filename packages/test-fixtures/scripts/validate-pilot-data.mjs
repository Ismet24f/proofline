#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INTERVIEW_HEADER = [
  'interview_id',
  'team_alias',
  'booked_at',
  'conducted_at',
  'qualified',
  'role',
  'playwright_github_actions',
  'top_three_problem',
  'budget_authority',
  'price_probe_response',
  'evidence_url',
];
const OBSERVATION_HEADER = [
  'observation_id',
  'team_alias',
  'repository_alias',
  'pr_alias',
  'observed_at',
  'disease_signal',
  'proofline_status',
  'classification',
  'previously_unknown',
  'customer_confirmed',
  'false_positive',
  'resolved_at',
  'evidence_url',
];
const QUALIFIED_ROLES = new Set([
  'qa_lead',
  'senior_qa_engineer',
  'automation_engineer',
  'sdet',
  'release_owner',
  'engineering_manager',
  'head_of_qa',
]);
const ABSOLUTE_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const OPAQUE_ALIAS = /^[A-Z][A-Z0-9_-]*$/;
const EVIDENCE_REFERENCE = /^E-[A-Za-z0-9_-]+$/;
const ALIAS_PREFIX = {
  interview_id: 'I-',
  observation_id: 'O-',
  team_alias: 'T-',
  repository_alias: 'R-',
  pr_alias: 'PR-',
};

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
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error(`${filePath}: unterminated quoted field`);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value !== ''));
}

function readRecords(filePath, expectedHeader) {
  const rows = parseCsv(readFileSync(filePath, 'utf8'), filePath);
  const header = rows.shift();
  if (!header || header.join(',') !== expectedHeader.join(',')) {
    throw new Error(
      `${filePath}: header does not match the published contract`,
    );
  }

  return rows.map((values, index) => {
    if (values.length !== expectedHeader.length) {
      throw new Error(
        `${filePath}:${index + 2}: expected ${expectedHeader.length} fields, received ${values.length}`,
      );
    }
    return Object.fromEntries(
      expectedHeader.map((name, offset) => [name, values[offset]]),
    );
  });
}

function requireValue(record, field, location) {
  if (!record[field]) throw new Error(`${location}: ${field} is required`);
}

function requireBoolean(record, field, location) {
  if (record[field] !== 'yes' && record[field] !== 'no') {
    throw new Error(`${location}: ${field} must be "yes" or "no"`);
  }
}

function requireTimestamp(record, field, location, optional = false) {
  const value = record[field];
  if (optional && value === '') return;
  if (!ABSOLUTE_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(
      `${location}: ${field} must be an absolute ISO 8601 timestamp`,
    );
  }
}

function requireAlias(record, field, location) {
  const value = record[field];
  if (!OPAQUE_ALIAS.test(value) || !value.startsWith(ALIAS_PREFIX[field])) {
    throw new Error(
      `${location}: ${field} must be an opaque ${ALIAS_PREFIX[field]} alias using uppercase letters, digits, underscores, or hyphens`,
    );
  }
}

function validateEvidence(record, location, required) {
  if (!required && record.evidence_url === '') return;
  if (!EVIDENCE_REFERENCE.test(record.evidence_url)) {
    throw new Error(
      `${location}: evidence_url must be an alias-safe E- reference, not a raw customer URL`,
    );
  }
}

function rejectDuplicateIds(records, field, filePath) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record[field])) {
      throw new Error(`${filePath}: duplicate ${field} "${record[field]}"`);
    }
    seen.add(record[field]);
  }
}

function validateInterviews(records, filePath) {
  rejectDuplicateIds(records, 'interview_id', filePath);
  records.forEach((record, index) => {
    const location = `${filePath}:${index + 2}`;
    for (const field of ['interview_id', 'team_alias', 'booked_at', 'role']) {
      requireValue(record, field, location);
    }
    for (const field of ['interview_id', 'team_alias']) {
      requireAlias(record, field, location);
    }
    requireTimestamp(record, 'booked_at', location);
    requireTimestamp(record, 'conducted_at', location, true);
    for (const field of [
      'qualified',
      'playwright_github_actions',
      'top_three_problem',
      'budget_authority',
    ]) {
      requireBoolean(record, field, location);
    }
    if (record.qualified === 'yes' && !QUALIFIED_ROLES.has(record.role)) {
      throw new Error(`${location}: qualified=yes requires an allowed role`);
    }
    if (
      record.qualified === 'yes' &&
      record.playwright_github_actions !== 'yes'
    ) {
      throw new Error(
        `${location}: qualified=yes requires playwright_github_actions=yes`,
      );
    }
    if (
      record.conducted_at &&
      Date.parse(record.conducted_at) < Date.parse(record.booked_at)
    ) {
      throw new Error(`${location}: conducted_at cannot precede booked_at`);
    }
    validateEvidence(
      record,
      location,
      record.qualified === 'yes' || Boolean(record.conducted_at),
    );
  });
}

function validateObservations(records, filePath) {
  rejectDuplicateIds(records, 'observation_id', filePath);
  records.forEach((record, index) => {
    const location = `${filePath}:${index + 2}`;
    for (const field of [
      'observation_id',
      'team_alias',
      'repository_alias',
      'pr_alias',
      'observed_at',
      'disease_signal',
      'proofline_status',
      'classification',
    ]) {
      requireValue(record, field, location);
    }
    for (const field of [
      'observation_id',
      'team_alias',
      'repository_alias',
      'pr_alias',
    ]) {
      requireAlias(record, field, location);
    }
    requireTimestamp(record, 'observed_at', location);
    requireTimestamp(record, 'resolved_at', location, true);
    for (const field of [
      'previously_unknown',
      'customer_confirmed',
      'false_positive',
    ]) {
      requireBoolean(record, field, location);
    }
    if (
      record.resolved_at &&
      Date.parse(record.resolved_at) < Date.parse(record.observed_at)
    ) {
      throw new Error(`${location}: resolved_at cannot precede observed_at`);
    }
    if (record.customer_confirmed === 'yes' && record.evidence_url === '') {
      throw new Error(
        `${location}: customer_confirmed=yes requires evidence_url`,
      );
    }
    validateEvidence(record, location, true);
  });
}

try {
  const interviewsPath = resolve(
    process.argv[2] ?? 'docs/validation/interviews.csv',
  );
  const observationsPath = resolve(
    process.argv[3] ?? 'docs/validation/pilot-observations.csv',
  );
  const interviews = readRecords(interviewsPath, INTERVIEW_HEADER);
  const observations = readRecords(observationsPath, OBSERVATION_HEADER);
  validateInterviews(interviews, interviewsPath);
  validateObservations(observations, observationsPath);
  process.stdout.write(
    `Pilot data validated ${interviews.length} interviews and ${observations.length} observations.\n`,
  );
} catch (error) {
  process.stderr.write(
    `Pilot data validation failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
