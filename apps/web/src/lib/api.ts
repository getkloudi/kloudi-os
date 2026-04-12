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
      // Token expired or invalid - clear auth and redirect to login
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

  /**
   * Get procedures as a tree structure for the sidebar.
   * Returns TreeNode[] grouped by level into folders.
   */
  async getProcedureTree(): Promise<TreeNode[]> {
    const response =
      await this.fetch<ApiResponse<TreeNode[]>>('/api/procedures');
    return response.data;
  }

  /**
   * Get a single procedure detail by ID.
   * Returns EntityData for the entity panel.
   */
  async getProcedureDetail(id: string): Promise<EntityData> {
    const response = await this.fetch<ApiResponse<EntityData>>(
      `/api/procedures/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  /**
   * Search procedures for the omnibox.
   * Returns CommandItem[] matching the query.
   */
  async searchProcedures(query: string): Promise<CommandItem[]> {
    const response = await this.fetch<ApiResponse<CommandItem[]>>(
      `/api/procedures/search?q=${encodeURIComponent(query)}`
    );
    return response.data;
  }

  /**
   * Execute (run) a procedure by ID.
   * Returns execution tracking information.
   */
  async executeProcedure(id: string): Promise<ExecutionResult> {
    const response = await this.fetch<ApiResponse<ExecutionResult>>(
      `/api/procedures/${encodeURIComponent(id)}/run`,
      { method: 'POST' }
    );
    return response.data;
  }

  /**
   * Get execution status by execution ID.
   */
  async getExecution(id: string): Promise<ExecutionResult> {
    const response = await this.fetch<ApiResponse<ExecutionResult>>(
      `/api/executions/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  /**
   * Create a new procedure.
   */
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

  /**
   * Update an existing procedure.
   */
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

  /**
   * Delete a procedure.
   */
  async deleteProcedure(id: string): Promise<void> {
    await this.fetch(`/api/procedures/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
export default api;
