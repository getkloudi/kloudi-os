/**
 * @kloudi/sdk — Typed HTTP client for the kloudi.os API
 *
 * Used by:
 *   - CLI (apps/cli) — renders API responses as terminal output
 *   - MCP server (apps/mcp-server) — exposes API as MCP tools
 *   - External integrations — any HTTP client
 *
 * Pattern for adding a new action:
 *   1. Add API route in apps/api/routes/
 *   2. Add SDK method here (typed request + response)
 *   3. Add CLI command in apps/cli/commands/ (calls SDK)
 *   4. Add MCP tool in apps/mcp-server/tools/ (calls SDK)
 */

export interface KloudiClientOptions {
  /** API base URL (default: http://localhost:3001) */
  baseUrl?: string;
  /** Auth token for authenticated requests */
  token?: string;
}

export class KloudiClient {
  private baseUrl: string;
  private token: string | undefined;

  constructor(options: KloudiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:3001').replace(
      /\/$/,
      ''
    );
    this.token = options.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const init: RequestInit = { method, headers };
    if (body) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, init);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Procedures
  // ---------------------------------------------------------------------------

  async listProcedures(filters?: {
    level?: string;
    maturity?: string;
  }): Promise<Procedure[]> {
    const params = new URLSearchParams();
    if (filters?.level) params.set('level', filters.level);
    if (filters?.maturity) params.set('maturity', filters.maturity);
    const query = params.toString() ? `?${params}` : '';
    return this.request<Procedure[]>('GET', `/api/procedures${query}`);
  }

  async getProcedure(idOrSlug: string): Promise<Procedure> {
    return this.request<Procedure>('GET', `/api/procedures/${idOrSlug}`);
  }

  async runProcedure(
    id: string,
    options?: { dryRun?: boolean; input?: Record<string, unknown> }
  ): Promise<ExecutionResult> {
    return this.request<ExecutionResult>('POST', `/api/procedures/${id}/run`, {
      dryRun: options?.dryRun ?? false,
      input: options?.input ?? {},
    });
  }

  // ---------------------------------------------------------------------------
  // Executions
  // ---------------------------------------------------------------------------

  async getExecution(id: string): Promise<Execution> {
    return this.request<Execution>('GET', `/api/executions/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }
}

// ---------------------------------------------------------------------------
// Types — mirror API response shapes
// ---------------------------------------------------------------------------

export interface Procedure {
  id: string;
  name: string;
  slug: string;
  level: string;
  maturity: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResult {
  executionId: string;
  status: string;
}

export interface Execution {
  id: string;
  procedureId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  result?: unknown;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  components: Record<string, { status: string }>;
}
