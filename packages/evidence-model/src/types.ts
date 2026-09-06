export type TestIdentityStability = 'EXPLICIT' | 'PROVISIONAL';
export type TestDefinitionStatus = 'ACTIVE' | 'SKIPPED' | 'DISABLED';

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
