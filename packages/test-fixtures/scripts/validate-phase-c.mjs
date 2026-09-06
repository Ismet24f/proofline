#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REQUIRED_PULL_REQUESTS = 20;
const HEADER = [
  'observation_id',
  'repository_alias',
  'pr_alias',
  'observed_at',
  'proofline_commit',
  'playwright_version',
  'mode',
  'proofline_status',
  'proofline_records',
  'raw_records_checked',
  'cross_check_result',
  'false_classification_count',
  'resolved_at',
  'evidence_ref',
  'resolution_evidence_ref',
];
const CONSUMER_KEYS = [
  'schemaVersion',
  'status',
  'repositoryAlias',
  'verifiedCommit',
  'playwrightVersion',
  'freshClone',
  'noProoflinePackage',
  'workflowConclusion',
  'prooflineReportSha256',
  'rawReportSha256',
  'verifiedAt',
  'reviewerAlias',
  'evidenceRef',
];
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PLAYWRIGHT_VERSION = /^1\.62\.\d+$/;
const ALIASES = {
  observation_id: /^OBS-[A-Z0-9_-]+$/,
  repository_alias: /^R-[A-Z0-9_-]+$/,
  pr_alias: /^PR-[A-Z0-9_-]+$/,
  reviewerAlias: /^P-[A-Z0-9_-]+$/,
};
const EVIDENCE_REFERENCE = /^E-[A-Za-z0-9_-]+$/;
const STATUSES = new Set(['complete', 'evidence_gaps', 'tool_error']);
const CROSS_CHECK_RESULTS = new Set(['matched', 'mismatch']);

function fail(message) {
  throw new Error(message);
}

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
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

function readObservations(filePath, source) {
  const rows = parseCsv(source, filePath);
  if (rows.shift()?.join(',') !== HEADER.join(','))
    fail(`${filePath}: header does not match the published contract`);
  return rows.map((values, index) => {
    if (values.length !== HEADER.length)
      fail(
        `${filePath}:${String(index + 2)}: expected ${String(HEADER.length)} fields, received ${String(values.length)}`,
      );
    return Object.fromEntries(
      HEADER.map((name, offset) => [name, values[offset]]),
    );
  });
}

function exactKeys(value, expected, at) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expected].sort())
  )
    fail(`${at}: contains unsupported fields or omits required fields`);
}

function canonicalTimestamp(value, at) {
  const parsed = Date.parse(value);
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_match, fraction = '') => `.${fraction.padEnd(3, '0')}Z`,
  );
  if (
    !TIMESTAMP.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString() !== normalized
  )
    fail(`${at} must be a canonical UTC ISO 8601 timestamp`);
  return parsed;
}

function integer(value, field, at, positive = false) {
  if (!/^(?:0|[1-9]\d*)$/.test(value))
    fail(`${at}: ${field} must be a non-negative integer`);
  const parsed = Number(value);
  if (positive && parsed === 0) fail(`${at}: ${field} must be positive`);
  return parsed;
}

function unique(records, field, filePath) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record[field]))
      fail(`${filePath}: duplicate ${field} "${record[field]}"`);
    seen.add(record[field]);
  }
}

function validateObservations(records, filePath) {
  unique(records, 'observation_id', filePath);
  unique(records, 'evidence_ref', filePath);
  const repositoryPullRequests = new Set();

  for (const [index, record] of records.entries()) {
    const at = `${filePath}:${String(index + 2)}`;
    for (const field of HEADER.filter(
      (name) => name !== 'resolved_at' && name !== 'resolution_evidence_ref',
    )) {
      if (record[field] === '') fail(`${at}: ${field} is required`);
    }
    for (const field of ['observation_id', 'repository_alias', 'pr_alias']) {
      if (!ALIASES[field].test(record[field]))
        fail(`${at}: ${field} must be an opaque ${field} alias`);
    }
    if (!EVIDENCE_REFERENCE.test(record.evidence_ref))
      fail(`${at}: evidence_ref must be an alias-safe E- reference`);
    canonicalTimestamp(record.observed_at, `${at}: observed_at`);
    if (!SHA.test(record.proofline_commit))
      fail(`${at}: proofline_commit must be a lowercase 40-character SHA`);
    if (!PLAYWRIGHT_VERSION.test(record.playwright_version))
      fail(`${at}: playwright_version must be in the supported 1.62.x range`);
    if (record.mode !== 'report-only')
      fail(`${at}: mode must be "report-only"`);
    if (!STATUSES.has(record.proofline_status))
      fail(`${at}: proofline_status is not supported`);
    if (!CROSS_CHECK_RESULTS.has(record.cross_check_result))
      fail(`${at}: cross_check_result is not supported`);

    const prooflineRecords = integer(
      record.proofline_records,
      'proofline_records',
      at,
      true,
    );
    const rawRecordsChecked = integer(
      record.raw_records_checked,
      'raw_records_checked',
      at,
      true,
    );
    const falseClassifications = integer(
      record.false_classification_count,
      'false_classification_count',
      at,
    );
    if (prooflineRecords !== rawRecordsChecked)
      fail(`${at}: proofline_records must equal raw_records_checked`);

    if (record.cross_check_result === 'matched') {
      if (falseClassifications !== 0)
        fail(`${at}: matched observations require zero false classifications`);
      if (record.resolved_at !== '' || record.resolution_evidence_ref !== '')
        fail(`${at}: matched observations cannot contain resolution evidence`);
    } else {
      if (falseClassifications === 0)
        fail(
          `${at}: mismatch observations require a positive false classification count`,
        );
      const hasResolvedAt = record.resolved_at !== '';
      const hasResolutionEvidence = record.resolution_evidence_ref !== '';
      if (hasResolvedAt !== hasResolutionEvidence)
        fail(
          `${at}: mismatch resolution requires both resolved_at and resolution_evidence_ref`,
        );
      if (hasResolvedAt) {
        const resolvedAt = canonicalTimestamp(
          record.resolved_at,
          `${at}: resolved_at`,
        );
        if (resolvedAt < Date.parse(record.observed_at))
          fail(`${at}: resolved_at must not be before observed_at`);
        if (!EVIDENCE_REFERENCE.test(record.resolution_evidence_ref))
          fail(
            `${at}: resolution_evidence_ref must be an alias-safe E- reference`,
          );
      }
    }

    const pair = `${record.repository_alias}:${record.pr_alias}`;
    if (repositoryPullRequests.has(pair))
      fail(`${filePath}: duplicate repository_alias/pr_alias "${pair}"`);
    repositoryPullRequests.add(pair);
  }
}

function validateConsumer(consumer, filePath) {
  if (
    typeof consumer !== 'object' ||
    consumer === null ||
    Array.isArray(consumer)
  )
    fail(`${filePath}: consumer record must be an object`);
  exactKeys(consumer, CONSUMER_KEYS, filePath);
  if (consumer.schemaVersion !== 1)
    fail(`${filePath}: schemaVersion must equal 1`);
  if (consumer.status !== 'draft' && consumer.status !== 'verified')
    fail(`${filePath}: status must be "draft" or "verified"`);

  if (consumer.status === 'draft') {
    for (const key of CONSUMER_KEYS.filter(
      (name) => name !== 'schemaVersion' && name !== 'status',
    )) {
      if (consumer[key] !== '')
        fail(`${filePath}: draft consumer field ${key} must be empty`);
    }
    return false;
  }

  if (!ALIASES.repository_alias.test(consumer.repositoryAlias))
    fail(`${filePath}: repositoryAlias must be an opaque R- alias`);
  if (!SHA.test(consumer.verifiedCommit))
    fail(`${filePath}: verifiedCommit must be a lowercase 40-character SHA`);
  if (!PLAYWRIGHT_VERSION.test(consumer.playwrightVersion))
    fail(
      `${filePath}: playwrightVersion must be in the supported 1.62.x range`,
    );
  if (consumer.freshClone !== 'yes')
    fail(`${filePath}: freshClone must be "yes"`);
  if (consumer.noProoflinePackage !== 'yes')
    fail(`${filePath}: noProoflinePackage must be "yes"`);
  if (consumer.workflowConclusion !== 'success')
    fail(`${filePath}: workflowConclusion must be "success"`);
  for (const field of ['prooflineReportSha256', 'rawReportSha256']) {
    if (!SHA256.test(consumer[field]))
      fail(`${filePath}: ${field} must be a lowercase SHA-256`);
  }
  canonicalTimestamp(consumer.verifiedAt, `${filePath}: verifiedAt`);
  if (!ALIASES.reviewerAlias.test(consumer.reviewerAlias))
    fail(`${filePath}: reviewerAlias must be an opaque P- alias`);
  if (!EVIDENCE_REFERENCE.test(consumer.evidenceRef))
    fail(`${filePath}: evidenceRef must be an alias-safe E- reference`);
  return true;
}

function evaluate(
  observationsSource,
  observationsPath,
  consumerSource,
  consumerPath,
) {
  const observations = readObservations(
    observationsPath,
    observationsSource.toString('utf8'),
  );
  validateObservations(observations, observationsPath);
  let consumer;
  try {
    consumer = JSON.parse(consumerSource.toString('utf8'));
  } catch {
    fail(`${consumerPath}: invalid JSON`);
  }
  const consumerVerified = validateConsumer(consumer, consumerPath);
  const unresolved = observations
    .filter(
      (record) =>
        record.cross_check_result === 'mismatch' && record.resolved_at === '',
    )
    .map((record) => record.observation_id)
    .sort();
  const matched = observations.filter(
    (record) => record.cross_check_result === 'matched',
  ).length;
  const resolved = observations.filter(
    (record) =>
      record.cross_check_result === 'mismatch' && record.resolved_at !== '',
  ).length;
  const counts = {
    distinctPullRequests: observations.length,
    matchedObservations: matched,
    resolvedMismatchObservations: resolved,
    unresolvedMismatchObservations: unresolved.length,
    requiredPullRequests: REQUIRED_PULL_REQUESTS,
  };
  const ready =
    counts.distinctPullRequests >= REQUIRED_PULL_REQUESTS &&
    counts.unresolvedMismatchObservations === 0 &&
    consumerVerified;
  return {
    schemaVersion: 1,
    outcome: ready ? 'PHASE_C_READY' : 'PHASE_C_OBSERVING',
    counts,
    consumerVerified,
    authority: {
      status: 'non_authoritative',
      independentReviewRequired: true,
    },
    unresolvedObservationIds: unresolved,
    inputSha256: {
      observations: sha256(observationsSource),
      consumer: sha256(consumerSource),
    },
  };
}

function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 0 && arguments_.length !== 2)
    fail('usage: validate-phase-c.mjs [observations.csv consumer.json]');
  const observationsPath = resolve(
    arguments_[0] ?? resolve(ROOT, 'docs/validation/phase-c-observations.csv'),
  );
  const consumerPath = resolve(
    arguments_[1] ?? resolve(ROOT, 'docs/validation/phase-c-consumer.json'),
  );
  const observationsSource = readFileSync(observationsPath);
  const consumerSource = readFileSync(consumerPath);
  process.stdout.write(
    `${JSON.stringify(
      evaluate(
        observationsSource,
        observationsPath,
        consumerSource,
        consumerPath,
      ),
      undefined,
      2,
    )}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `Phase C validation failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
