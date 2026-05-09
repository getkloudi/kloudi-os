/**
 * GitHub Tools
 *
 * Tools for interacting with GitHub API.
 * Uses @octokit/rest for API calls.
 */

import { Octokit } from '@octokit/rest';
import { Logger } from '@kloudi-os/shared/logger';
import type { ToolDefinition, ToolContext } from '@kloudi-os/shared/types';

const logger = Logger.getInstance('tools:github');

/**
 * Extended context with GitHub token
 */
interface GitHubContext extends ToolContext {
  githubToken?: string;
}

/**
 * Parsed repository owner and name
 */
interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * Repo input can be string or object
 */
type RepoInput = string | RepoInfo;

/**
 * GitHub read file parameters
 */
interface GitHubReadFileParams {
  repo: RepoInput;
  path: string;
  ref?: string;
}

/**
 * GitHub file result
 */
interface GitHubFileResult {
  path: string;
  content: string;
  sha: string;
  size: number;
  url: string;
}

/**
 * GitHub directory entry
 */
interface GitHubDirectoryEntry {
  name: string;
  path: string;
  type: string;
  sha: string;
  size: number;
  url: string;
}

/**
 * GitHub directory result
 */
interface GitHubDirectoryResult {
  path: string;
  type: 'directory';
  entries: GitHubDirectoryEntry[];
}

/**
 * GitHub create PR parameters
 */
interface GitHubCreatePRParams {
  repo: RepoInput;
  title: string;
  body?: string;
  head: string;
  base?: string;
  draft?: boolean;
}

/**
 * GitHub PR result
 */
interface GitHubPRResult {
  number: number;
  title: string;
  state: string;
  url: string;
  draft: boolean;
  head: string;
  base: string;
  createdAt: string;
}

/**
 * GitHub list issues parameters
 */
interface GitHubListIssuesParams {
  repo: RepoInput;
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
  assignee?: string;
  creator?: string;
  sort?: 'created' | 'updated' | 'comments';
  direction?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
}

/**
 * GitHub issue result
 */
interface GitHubIssueItem {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: (string | undefined)[];
  assignees: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
}

/**
 * GitHub issues list result
 */
interface GitHubIssuesResult {
  repo: string;
  state: string;
  issues: GitHubIssueItem[];
  count: number;
  page: number;
}

/**
 * Octokit error with status
 */
interface OctokitError extends Error {
  status?: number;
}

/**
 * Get Octokit client from context
 */
function getOctokit(context: GitHubContext): Octokit {
  const token = context.githubToken || process.env['GITHUB_TOKEN'];

  if (!token) {
    throw new Error(
      'GitHub token not found. Provide via context.githubToken or GITHUB_TOKEN env var'
    );
  }

  return new Octokit({ auth: token });
}

/**
 * Parse owner/repo from various formats
 */
function parseRepo(repo: RepoInput): RepoInfo {
  if (typeof repo === 'object' && repo.owner && repo.repo) {
    return repo;
  }

  if (typeof repo === 'string') {
    const parts = repo.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
  }

  throw new Error(
    `Invalid repo format: "${repo}". Expected "owner/repo" or {owner, repo}`
  );
}

/**
 * github.read_file - Read a file from a GitHub repository
 */
export const githubReadFile: ToolDefinition = {
  name: 'github.read_file',
  description: 'Read a file from a GitHub repository',
  parameters: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format',
      },
      path: {
        type: 'string',
        description: 'Path to the file in the repository',
      },
      ref: {
        type: 'string',
        description: 'Branch, tag, or commit SHA (defaults to default branch)',
      },
    },
    required: ['repo', 'path'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext = {}
  ): Promise<GitHubFileResult | GitHubDirectoryResult> {
    const { repo, path, ref } = params as unknown as GitHubReadFileParams;
    const { owner, repo: repoName } = parseRepo(repo);
    const octokit = getOctokit(context as GitHubContext);

    logger.debug(`Reading GitHub file: ${owner}/${repoName}/${path}`, { ref });

    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path,
        ...(ref !== undefined && { ref }),
      });

      const data = response.data;

      // Handle file content
      if (!Array.isArray(data) && data.type === 'file' && 'content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');

        return {
          path: data.path,
          content,
          sha: data.sha,
          size: data.size,
          url: data.html_url ?? '',
        };
      }

      // Handle directory listing
      if (Array.isArray(data)) {
        return {
          path,
          type: 'directory',
          entries: data.map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type,
            sha: item.sha,
            size: item.size ?? 0,
            url: item.html_url ?? '',
          })),
        };
      }

      throw new Error(
        `Unexpected content type: ${(data as { type: string }).type}`
      );
    } catch (error) {
      const octokitError = error as OctokitError;
      if (octokitError.status === 404) {
        throw new Error(`File not found: ${path} in ${owner}/${repoName}`);
      }
      throw error;
    }
  },
};

/**
 * github.create_pr - Create a pull request
 */
export const githubCreatePR: ToolDefinition = {
  name: 'github.create_pr',
  description: 'Create a pull request in a GitHub repository',
  parameters: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format',
      },
      title: {
        type: 'string',
        description: 'Pull request title',
      },
      body: {
        type: 'string',
        description: 'Pull request description/body',
      },
      head: {
        type: 'string',
        description: 'Branch containing changes (e.g., "feature-branch")',
      },
      base: {
        type: 'string',
        description: 'Branch to merge into (defaults to "main")',
        default: 'main',
      },
      draft: {
        type: 'boolean',
        description: 'Create as draft PR',
        default: false,
      },
    },
    required: ['repo', 'title', 'head'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext = {}
  ): Promise<GitHubPRResult> {
    const {
      repo,
      title,
      body = '',
      head,
      base = 'main',
      draft = false,
    } = params as unknown as GitHubCreatePRParams;
    const { owner, repo: repoName } = parseRepo(repo);
    const octokit = getOctokit(context as GitHubContext);

    logger.debug(`Creating PR: ${owner}/${repoName} ${head} -> ${base}`);

    try {
      const response = await octokit.rest.pulls.create({
        owner,
        repo: repoName,
        title,
        body,
        head,
        base,
        draft,
      });

      const pr = response.data;

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        draft: pr.draft ?? false,
        head: pr.head.ref,
        base: pr.base.ref,
        createdAt: pr.created_at,
      };
    } catch (error) {
      const octokitError = error as OctokitError;
      if (octokitError.status === 422) {
        // Usually means PR already exists or validation error
        throw new Error(`Failed to create PR: ${octokitError.message}`);
      }
      throw error;
    }
  },
};

/**
 * github.list_issues - List issues in a repository
 */
export const githubListIssues: ToolDefinition = {
  name: 'github.list_issues',
  description: 'List issues in a GitHub repository',
  parameters: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: 'Repository in "owner/repo" format',
      },
      state: {
        type: 'string',
        description: 'Filter by state',
        default: 'open',
      },
      labels: {
        type: 'array',
        description: 'Filter by labels',
      },
      assignee: {
        type: 'string',
        description: 'Filter by assignee username',
      },
      creator: {
        type: 'string',
        description: 'Filter by issue creator username',
      },
      sort: {
        type: 'string',
        description: 'Sort by field',
        default: 'created',
      },
      direction: {
        type: 'string',
        description: 'Sort direction',
        default: 'desc',
      },
      perPage: {
        type: 'number',
        description: 'Number of results per page (max 100)',
        default: 30,
      },
      page: {
        type: 'number',
        description: 'Page number',
        default: 1,
      },
    },
    required: ['repo'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext = {}
  ): Promise<GitHubIssuesResult> {
    const {
      repo,
      state = 'open',
      labels,
      assignee,
      creator,
      sort = 'created',
      direction = 'desc',
      perPage = 30,
      page = 1,
    } = params as unknown as GitHubListIssuesParams;
    const { owner, repo: repoName } = parseRepo(repo);
    const octokit = getOctokit(context as GitHubContext);

    logger.debug(`Listing issues: ${owner}/${repoName}`, { state, labels });

    try {
      const response = await octokit.rest.issues.listForRepo({
        owner,
        repo: repoName,
        state,
        ...(labels && { labels: labels.join(',') }),
        ...(assignee && { assignee }),
        ...(creator && { creator }),
        sort,
        direction,
        per_page: Math.min(perPage, 100),
        page,
      });

      // Filter out pull requests (they come through issues API too)
      const issues: GitHubIssueItem[] = response.data
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          url: issue.html_url,
          labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
          assignees: issue.assignees?.map((a) => a.login) ?? [],
          author: issue.user?.login ?? '',
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          comments: issue.comments,
        }));

      return {
        repo: `${owner}/${repoName}`,
        state,
        issues,
        count: issues.length,
        page,
      };
    } catch (error) {
      const octokitError = error as OctokitError;
      if (octokitError.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repoName}`);
      }
      throw error;
    }
  },
};

// Export all tools as an array for easy registration
export const githubTools: ToolDefinition[] = [
  githubReadFile,
  githubCreatePR,
  githubListIssues,
];

export default githubTools;
