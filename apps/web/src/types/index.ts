// Shared types for the web UI

export type Space = 'home' | 'browse' | 'editor' | 'store';

export type EntityType = 'guide' | 'skill' | 'task' | 'project' | 'folder';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_input'
  | 'cancelled';

export type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'neutral' | 'accent';

export interface ActivityPost {
  id: string;
  type: 'execution_run' | 'execution_completed' | 'execution_failed' | 'awaiting_approval' | 'procedure_edited';
  user: { username: string; initials: string };
  procedure: { id: string; name: string; slug: string };
  execution?: {
    id: string;
    status: ExecutionStatus;
    nodes?: ExecutionNodeSummary[];
    progress?: number;
    duration?: string;
    tokens?: number;
    error?: string;
  };
  trustGate?: {
    id: string;
    question: string;
    nodeLabel: string;
    visitCount: number;
  };
  editSummary?: string;
  reactions?: { emoji: string; count: number }[];
  replyCount?: number;
  timestamp: string;
  relativeTime: string;
}

export interface ExecutionNodeSummary {
  id: string;
  label: string;
  type: string;
  status: ExecutionStatus;
  duration?: string;
  tokens?: number;
}

export interface ProcedureFile {
  id: string;
  name: string;
  slug: string;
  type: EntityType;
  isFolder?: boolean;
}

export interface ExecutionDetail {
  id: string;
  procedureId: string;
  procedureName: string;
  procedureSlug: string;
  procedureDescription?: string;
  status: ExecutionStatus;
  nodes: ExecutionNodeDetail[];
  stats: {
    duration: string;
    tokens: number;
    nodesCompleted: number;
    nodesTotal: number;
  };
  startedAt: string;
  completedAt?: string;
}

export interface ExecutionNodeDetail {
  id: string;
  label: string;
  type: string;
  status: ExecutionStatus;
  duration?: string;
  tokens?: number;
  output?: string;
  error?: string;
}

export interface AgentMessage {
  id: string;
  role: 'agent' | 'system' | 'user';
  content: string;
  timestamp: string;
}

export interface TrustGateEvent {
  executionId: string;
  nodeId: string;
  nodeLabel: string;
  question: string;
  visitCount: number;
  procedureName: string;
}

export interface StoreApp {
  id: string;
  name: string;
  author: string;
  description: string;
  category: string;
  icon: string;
  iconBg: string;
  tag: string;
  installed: boolean;
}
