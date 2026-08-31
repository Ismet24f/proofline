export type EvidenceState =
  | 'VERIFIED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CODE_VALIDATED'
  | 'UNTESTED'
  | 'NOT_AFFECTED'
  | 'ACCEPTED_RISK'
  | 'UNKNOWN';

export type ReleaseVerdict = 'PASS' | 'HOLD' | 'INCOMPLETE';

export type RecommendationTier = 'MANDATORY' | 'RECOMMENDED' | 'EXTENDED' | 'UNMAPPED_RISK';

export type ReasonCode =
  | 'DIRECT_PATH_MAP'
  | 'SHARED_CAPABILITY'
  | 'SHARED_RISK'
  | 'REQUIREMENT_REFERENCE'
  | 'CRITICAL_RISK_POLICY'
  | 'NO_COVERING_TEST';

export type TestIdentityStability = 'EXPLICIT' | 'PROVISIONAL';
export type TestDefinitionStatus = 'ACTIVE' | 'SKIPPED' | 'DISABLED';
export type ChangedFileStatus = 'ADDED' | 'MODIFIED' | 'DELETED' | 'RENAMED';
export type ExecutableRecommendationTier = Exclude<RecommendationTier, 'UNMAPPED_RISK'>;

export interface Annotation {
  type: string;
  description: string;
}

export interface TestDefinition {
  id: string;
  stability: TestIdentityStability;
  title: string;
  titlePath: readonly string[];
  file: string;
  line: number;
  projects: readonly string[];
  tags: readonly string[];
  annotations: readonly Annotation[];
  capabilities: readonly string[];
  risks: readonly string[];
  requirements: readonly string[];
  status: TestDefinitionStatus;
}

export interface TestInventory {
  schemaVersion: 1;
  repository: string;
  revision: string;
  generatedAt: string;
  tests: readonly TestDefinition[];
}

export interface ChangedFile {
  status: ChangedFileStatus;
  path: string;
  oldPath?: string;
}

export interface RecommendationReason {
  code: ReasonCode;
  path: string;
}

export interface RecommendedTest {
  testId: string;
  tier: ExecutableRecommendationTier;
  capabilities: readonly string[];
  risks: readonly string[];
  reasons: readonly RecommendationReason[];
}

export interface UnmappedRisk {
  riskId: string;
  capabilityId?: string;
  tier: 'UNMAPPED_RISK';
  reasons: readonly RecommendationReason[];
}

export interface RegressionPlan {
  schemaVersion: 1;
  repository: string;
  baseRevision: string;
  headRevision: string;
  generatedAt: string;
  tests: readonly RecommendedTest[];
  unmappedRisks: readonly UnmappedRisk[];
}

export interface EvidenceAssertion {
  id: string;
  state: EvidenceState;
  revision: string;
  environment: string;
  observedAt: string;
  riskId?: string;
  capabilityId?: string;
  testId?: string;
  evidenceIds: readonly string[];
  message?: string;
}

export interface PolicyViolation {
  code: string;
  message: string;
  evidenceIds: readonly string[];
  riskId?: string;
  testId?: string;
}

export interface ReleaseDecision {
  schemaVersion: 1;
  verdict: ReleaseVerdict;
  revision: string;
  environment: string;
  evaluatedAt: string;
  assertions: readonly EvidenceAssertion[];
  violations: readonly PolicyViolation[];
}
