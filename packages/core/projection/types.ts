export interface ProjectionResult {
  content: string;
  sourceSlug: string;
  sourceVersion: string;
  projectedAt: string;
  targetFormat: 'skill.md';
}

export interface ProjectionOptions {
  includeMetadata?: boolean;
  targetAgent?: 'claude' | 'cursor' | 'generic';
}
