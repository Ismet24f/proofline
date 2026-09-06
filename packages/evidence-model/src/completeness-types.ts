export type Classification =
  | 'executed_as_expected'
  | 'retry_masked'
  | 'failed'
  | 'runtime_skipped'
  | 'incomplete'
  | 'absent'
  | 'no_evidence';

export type PlannedExpectedStatus =
  'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';

export interface ProducerRef {
  id: string;
  shard: { current: number; total: number };
}

export interface SelectionDescriptor {
  configFile: string;
  rootDir: string;
  playwrightVersion: string;
  shard: { current: number; total: number };
  cli: readonly string[];
  configuredProjects: readonly string[];
}

export interface TestIdentity {
  key: string;
  projectName: string;
  playwrightTestId: string;
  file: string;
  line: number;
  column: number;
  titlePath: readonly string[];
}

export interface PlannedTest {
  identity: TestIdentity;
  expectedStatus: PlannedExpectedStatus;
}

export interface PlanArtifact {
  schemaVersion: 1;
  repository: string;
  revision: string;
  headRevision?: string | undefined;
  producer: ProducerRef;
  selection: SelectionDescriptor;
  generatedAt: string;
  tests: readonly PlannedTest[];
  digest: string;
}

export interface SelectionDifference {
  field: string;
  planned: string;
  actual: string;
}

export type SelectionCheck =
  | { status: 'match' }
  | { status: 'mismatch'; differences: readonly SelectionDifference[] }
  | { status: 'unavailable'; reason: 'plan_missing' };

export interface ResultEnvelope {
  schemaVersion: 1;
  repository: string;
  revision: string;
  headRevision?: string | undefined;
  runId: string;
  runAttempt: number;
  producer: ProducerRef;
  planDigest: string;
  reportPath: string;
  reportDigest: string;
  collectedAt: string;
  selectionCheck: SelectionCheck;
}

export interface ProducerManifest {
  schemaVersion: 1;
  producers: readonly ProducerRef[];
}

export type ProducerArtifactStatus =
  'received' | 'missing' | 'duplicate' | 'invalid';

export interface ProducerEvidenceRecord {
  producer: ProducerRef;
  status: ProducerArtifactStatus;
  planDigest?: string | undefined;
  reportDigest?: string | undefined;
  selectionCheck?: SelectionCheck | undefined;
  reasonCodes: readonly string[];
}

export interface PlannedEvidenceRecord extends PlannedTest {
  producer: ProducerRef;
  classification: Classification;
  reasonCodes: readonly string[];
}

export interface UnexpectedEvidenceRecord {
  producer: ProducerRef;
  identity: TestIdentity;
  reasonCodes: readonly string[];
}

export interface ReconciliationCounts {
  plannedActive: number;
  plannedDisabled: number;
  executedAsExpected: number;
  retryMasked: number;
  failed: number;
  runtimeSkipped: number;
  incomplete: number;
  absent: number;
  noEvidence: number;
  producerGaps: number;
  knownTestGaps: number;
  notExecuted: number;
  unexpected: number;
  toolErrors: number;
}

export type ReconciliationStatus = 'complete' | 'evidence_gaps' | 'tool_error';
export type ReconciliationMode = 'report-only' | 'enforce-evidence';

export interface ExitDecision {
  code: 0 | 1 | 2;
  reasonCodes: readonly string[];
}

export interface ReconciliationReport {
  schemaVersion: 1;
  toolVersion: string;
  repository: string;
  revision: string;
  headRevision?: string | undefined;
  runId: string;
  runAttempt: number;
  mode: ReconciliationMode;
  generatedAt: string;
  evaluatedAt: string;
  manifest: ProducerManifest;
  topology: readonly ProducerEvidenceRecord[];
  tests: readonly PlannedEvidenceRecord[];
  unexpectedTests: readonly UnexpectedEvidenceRecord[];
  counts: ReconciliationCounts;
  status: ReconciliationStatus;
  exitDecision: ExitDecision;
}
