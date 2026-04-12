import type {
  ActivityPost,
  ProcedureFile,
  ExecutionDetail,
  StoreApp,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Tree structure for sidebar display
export interface TreeNode {
  id: string;
  name: string;
  type: 'guide' | 'skill' | 'task' | 'project' | 'folder';
  slug?: string;
  children?: TreeNode[];
}

// Individual entity detail for the entity panel
export interface EntityData {
  id: string;
  name: string;
  type: 'guide' | 'skill' | 'task' | 'project';
  description?: string;
  content?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  slug?: string;
  maturity?: string;
}

// Command item for omnibox search
export interface CommandItem {
  id: string;
  name: string;
  type: 'guide' | 'skill' | 'task' | 'project' | 'action';
  description?: string;
  slug?: string;
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ExecutionResult {
  id: string;
  procedureId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  startedAt?: string;
  completedAt?: string;
  logs?: ExecutionLog[];
  progress?: number;
}

// API response wrapper type
interface ApiResponse<T> {
  data: T;
  total?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getProcedureTree(): Promise<TreeNode[]> {
    const response =
      await this.fetch<ApiResponse<TreeNode[]>>('/api/procedures');
    return response.data;
  }

  async getProcedureDetail(id: string): Promise<EntityData> {
    const response = await this.fetch<ApiResponse<EntityData>>(
      `/api/procedures/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  async searchProcedures(query: string): Promise<CommandItem[]> {
    const response = await this.fetch<ApiResponse<CommandItem[]>>(
      `/api/procedures/search?q=${encodeURIComponent(query)}`
    );
    return response.data;
  }

  async executeProcedure(id: string): Promise<ExecutionResult> {
    const response = await this.fetch<ApiResponse<ExecutionResult>>(
      `/api/procedures/${encodeURIComponent(id)}/run`,
      { method: 'POST' }
    );
    return response.data;
  }

  async getExecution(id: string): Promise<ExecutionResult> {
    const response = await this.fetch<ApiResponse<ExecutionResult>>(
      `/api/executions/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  async createProcedure(data: {
    slug: string;
    name: string;
    description?: string;
    level?: string;
  }): Promise<EntityData> {
    const response = await this.fetch<ApiResponse<EntityData>>(
      '/api/procedures',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return response.data;
  }

  async updateProcedure(
    id: string,
    data: Partial<EntityData>
  ): Promise<EntityData> {
    const response = await this.fetch<ApiResponse<EntityData>>(
      `/api/procedures/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return response.data;
  }

  async deleteProcedure(id: string): Promise<void> {
    await this.fetch(`/api/procedures/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // --- Sprint 2 endpoints ---

  async getActivity(): Promise<ActivityPost[]> {
    try {
      const response =
        await this.fetch<ApiResponse<ActivityPost[]>>('/api/activity');
      return response.data;
    } catch {
      return [];
    }
  }

  async getProcedureFiles(path?: string): Promise<ProcedureFile[]> {
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : '';
      const response = await this.fetch<ApiResponse<ProcedureFile[]>>(
        `/api/procedures/files${q}`
      );
      return response.data;
    } catch {
      // Fallback: derive from tree
      const tree = await this.getProcedureTree();
      return flattenTreeToFiles(tree);
    }
  }

  async getExecutionDetail(id: string): Promise<ExecutionDetail | null> {
    try {
      const response = await this.fetch<ApiResponse<ExecutionDetail>>(
        `/api/executions/${encodeURIComponent(id)}`
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async getStoreApps(): Promise<StoreApp[]> {
    // Store is static for now — will be backed by API in Phase 4
    return MOCK_STORE_APPS;
  }
}

function flattenTreeToFiles(nodes: TreeNode[]): ProcedureFile[] {
  const result: ProcedureFile[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      name: node.name,
      slug: node.slug || node.name,
      type: node.type,
      isFolder: node.type === 'folder',
    });
    if (node.children) {
      result.push(...flattenTreeToFiles(node.children));
    }
  }
  return result;
}

const MOCK_STORE_APPS: StoreApp[] = [
  {
    id: 'analytics',
    name: 'Analytics Dashboard',
    author: 'lore.dev',
    description:
      'Execution metrics, token trends, success rates. Real-time procedure health monitoring.',
    category: 'workspace',
    icon: '📊',
    iconBg: 'var(--blue-s)',
    tag: 'workspace · free',
    installed: true,
  },
  {
    id: 'slack',
    name: 'Slack Notifier',
    author: 'community',
    description:
      'Push execution results, failures, and approval requests to any Slack channel.',
    category: 'integrations',
    icon: '🔗',
    iconBg: 'var(--green-s)',
    tag: 'integration · free',
    installed: false,
  },
  {
    id: 'audit',
    name: 'Audit Trail',
    author: 'lore.dev',
    description:
      'Full history of who ran what, when. Diffs, approval chains, compliance exports.',
    category: 'workspace',
    icon: '🔍',
    iconBg: 'var(--amber-s)',
    tag: 'workspace · pro',
    installed: false,
  },
  {
    id: 'security',
    name: 'Security Tools',
    author: 'community',
    description:
      'SAST, dependency audit, secret scanning — available as agent tools in your terminal.',
    category: 'agent',
    icon: '🛡',
    iconBg: 'var(--red-s)',
    tag: 'agent · free',
    installed: true,
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions Bridge',
    author: 'lore.dev',
    description:
      'Trigger procedures from GitHub events. Map CI/CD workflows to SOP executions.',
    category: 'integrations',
    icon: '🤖',
    iconBg: 'var(--accent-s)',
    tag: 'integration · free',
    installed: false,
  },
  {
    id: 'approvals',
    name: 'Approval Workflows',
    author: 'lore.dev',
    description:
      'Custom approval chains, role-based gates, escalation policies for sensitive SOPs.',
    category: 'workspace',
    icon: '📋',
    iconBg: 'var(--green-s)',
    tag: 'workspace · pro',
    installed: false,
  },
];

export const api = new ApiClient();
export default api;
