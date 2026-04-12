/**
 * Common TypeScript types and interfaces for the Kloudi platform
 */

// Base entity types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User and organization types
export interface User extends BaseEntity {
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  organizationId: string;
}

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  domain?: string;
  settings: OrganizationSettings;
}

export interface Team extends BaseEntity {
  name: string;
  slug: string;
  organizationId: string;
  memberIds: string[];
}

export interface Project extends BaseEntity {
  name: string;
  slug: string;
  description?: string;
  organizationId: string;
  teamId: string;
  status: ProjectStatus;
  settings: ProjectSettings;
}

// Decision and Pattern types
export interface Decision extends BaseEntity {
  title: string;
  description: string;
  context: string;
  outcome?: string;
  status: DecisionStatus;
  priority: Priority;
  authorId: string;
  projectId: string;
  sourceIds: string[];
  tagIds: string[];
}

export interface DecisionSource extends BaseEntity {
  name: string;
  type: SourceType;
  url?: string;
  content?: string;
  metadata: Record<string, any>;
}

export interface DecisionTag extends BaseEntity {
  name: string;
  slug: string;
  color?: string;
  organizationId: string;
}

export interface DecisionOutcome extends BaseEntity {
  decisionId: string;
  result: OutcomeResult;
  impact: ImpactLevel;
  lessons?: string;
  metrics?: Record<string, number>;
}

// Pattern types
export interface Pattern extends BaseEntity {
  name: string;
  description: string;
  category: PatternCategory;
  authorId: string;
  organizationId: string;
  fileIds: string[];
  variableIds: string[];
}

export interface PatternFile extends BaseEntity {
  name: string;
  path: string;
  content: string;
  language: string;
  patternId: string;
}

export interface PatternVariable extends BaseEntity {
  name: string;
  type: VariableType;
  defaultValue?: string;
  description?: string;
  patternId: string;
}

export interface PatternUsage extends BaseEntity {
  patternId: string;
  userId: string;
  projectId: string;
  context: string;
  success: boolean;
}

// Workspace types
export interface Workspace extends BaseEntity {
  name: string;
  type: WorkspaceType;
  mountPath: string;
  organizationId: string;
  projectIds: string[];
  settings: WorkspaceSettings;
}

export interface WorkspaceFile extends BaseEntity {
  path: string;
  content: string;
  hash: string;
  organizationId: string;
  lastSyncedAt: Date;
}

// Integration types
export interface IntegrationInstallation extends BaseEntity {
  type: IntegrationType;
  organizationId: string;
  config: IntegrationConfig;
  status: IntegrationStatus;
}

export interface WebhookSubscription extends BaseEntity {
  integrationId: string;
  eventType: string;
  endpoint: string;
  secret?: string;
  active: boolean;
}

// Cache types
export interface FilesystemCache extends BaseEntity {
  path: string;
  content: string;
  hash: string;
  expiresAt: Date;
  metadata: Record<string, any>;
}

// Graph and Node types for SOP execution
// Unified with execution engine types (from/to edges, config-based nodes)
export type NodeType =
  | 'llm_generate'
  | 'tool_call'
  | 'sub_entity'
  | 'interpolative'
  | 'condition'
  | 'parallel'
  | 'loop'
  | 'transform';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  config: Record<string, unknown>; // type-specific config (LLMConfig, ToolConfig, etc.)
  constraints?: Constraint[];
  timeout_ms?: number;
  retry_count?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** @deprecated Use InterpolativeConfig.options in execution engine types instead */
export interface InterpolativePath {
  id: string;
  label: string;
  targetNode: string;
  condition?: string;
}

export interface Constraint {
  id: string;
  level: 'MUST' | 'SHOULD' | 'MAY';
  scope: 'entity' | 'node';
  node_id?: string;
  description: string;
  enforcement: 'block' | 'warn' | 'log';
}

// Procedure/Entity types
export interface ProcedureEntity {
  id: string;
  slug: string;
  name: string;
  description?: string;
  level: 'guide' | 'project' | 'task' | 'skill';
  maturity: 'draft' | 'curated' | 'validated';
  graph: Graph;
  parameters: Record<string, ParameterDefinition>;
  constraints: Record<string, string>;
  organizationId: string;
  systemPrompt?: string;
  parentEntityId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  description?: string;
}

// Execution types
export interface ExecutionState {
  entityId: string;
  entityName: string;
  executionId: string;
  params: Record<string, unknown>;
  variables: Record<string, unknown>;
  nodeResults: Map<string, NodeResult>;
  visitedNodes: Set<string>;
  currentNode: string | null;
  status: string;
  startTime: number;
}

export interface NodeResult {
  success: boolean;
  nodeId: string;
  nodeType: string;
  output?: unknown;
  error?: string;
  chosenOption?: string; // for interpolative nodes — the chosen next node ID
}

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  entityId: string;
  entityName: string;
  output?: unknown;
  error?: string;
  variables: Record<string, unknown>;
  nodeResults: Record<string, NodeResult>;
  duration: number;
  status: string;
  lastNode?: string;
}

// Tool types
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (
    params: Record<string, unknown>,
    context: ToolContext
  ) => Promise<unknown>;
}

export interface ToolParameters {
  type?: string;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  default?: unknown;
}

export interface ToolContext {
  organizationId?: string;
  userId?: string;
  tokens?: Record<string, string>;
  [key: string]: unknown;
}

// AI Client types
export interface AIClientConfig {
  context: string;
  provider?: string;
  model?: string;
  businessDomain?: string;
  costCenter?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

// Logger types
export interface LoggerInstance {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>
  ): void;
  time(label: string): { end: (meta?: Record<string, unknown>) => void };
}

// Context Manager types
export interface ContextItem {
  id: string;
  type: string;
  content: string;
  priority: number;
  tokens?: number;
}

export interface ContextManagerConfig {
  maxTokens?: number;
}

// Enums and constants
export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  ON_HOLD = 'on_hold',
}

export enum DecisionStatus {
  DRAFT = 'draft',
  PROPOSED = 'proposed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IMPLEMENTED = 'implemented',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum SourceType {
  DOCUMENT = 'document',
  URL = 'url',
  CONVERSATION = 'conversation',
  MEETING = 'meeting',
  EMAIL = 'email',
}

export enum OutcomeResult {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILURE = 'failure',
}

export enum ImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum PatternCategory {
  ARCHITECTURE = 'architecture',
  CODE = 'code',
  PROCESS = 'process',
  TEMPLATE = 'template',
}

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
}

export enum WorkspaceType {
  FUSE = 'fuse',
  VIRTUAL = 'virtual',
  MAPPED = 'mapped',
}

export enum IntegrationType {
  GITHUB = 'github',
  SLACK = 'slack',
  NOTION = 'notion',
  JIRA = 'jira',
}

export enum IntegrationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

// Configuration types
export interface OrganizationSettings {
  defaultUserRole: UserRole;
  allowPublicDecisions: boolean;
  requireApproval: boolean;
}

export interface ProjectSettings {
  autoSync: boolean;
  syncInterval: number;
  allowedFileTypes: string[];
}

export interface WorkspaceSettings {
  autoMount: boolean;
  syncOnStart: boolean;
  cacheEnabled: boolean;
  cacheTTL: number;
}

export interface IntegrationConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  webhookUrl?: string;
  settings: Record<string, any>;
}
