/**
 * GitHub Tools
 *
 * Tools for interacting with GitHub API.
 * Uses @octokit/rest for API calls.
 */

import { Octokit } from '@octokit/rest';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools:github');

/**
 * Get Octokit client from context
 */
function getOctokit(context) {
  const token = context.githubToken || process.env.GITHUB_TOKEN;

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
function parseRepo(repo) {
  if (typeof repo === 'object' && repo.owner && repo.repo) {
    return repo;
  }

  if (typeof repo === 'string') {
    const parts = repo.split('/');
    if (parts.length === 2) {
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
export const githubReadFile = {
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

  async execute(params, context = {}) {
    const { repo, path, ref } = params;
    const { owner, repo: repoName } = parseRepo(repo);
    const octokit = getOctokit(context);

    logger.debug(`Reading GitHub file: ${owner}/${repoName}/${path}`, { ref });

    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref,
      });

      const data = response.data;

      // Handle file content
      if (data.type === 'file') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');

        return {
          path: data.path,
          content,
          sha: data.sha,
          size: data.size,
          url: data.html_url,
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
            size: item.size,
            url: item.html_url,
          })),
        };
      }

      throw new Error(`Unexpected content type: ${data.type}`);
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`File not found: ${path} in ${owner}/${repoName}`);
      }
      throw error;
    }
  },
};

/**
 * github.create_pr - Create a pull request
 */
export const githubCreatePR = {
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

  async execute(params, context = {}) {
    const {
      repo,
      title,
      body = '',
      head,
      base = 'main',
      draft = false,
    } = params;
    const { owner, repo: repoName } = parseRepo(repo);
    const octokit = getOctokit(context);

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
        draft: pr.draft,
        head: pr.head.ref,
        base: pr.base.ref,
        createdAt: pr.created_at,
      };
    } catch (error) {
      if (error.status === 422) {
        // Usually means PR already exists or validation error
        throw new Error(`Failed to create PR: ${error.message}`);
      }
      throw error;
    }
  },
};

/**
 * github.list_issues - List issues in a repository
 */
export const githubListIssues = {
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
        enum: ['open', 'closed', 'all'],
        description: 'Filter by state',
        default: 'open',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
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
        enum: ['created', 'updated', 'comments'],
        description: 'Sort by field',
        default: 'created',
      },
      direction: {
        type: 'string',
        enum: ['asc', 'desc'],
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

  async execute(params, context = {}) {
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
    } = params;
    const { owner, repo: repoName } = parseRepo(repo);
    const octokit = getOctokit(context);

    logger.debug(`Listing issues: ${owner}/${repoName}`, { state, labels });

    try {
      const response = await octokit.rest.issues.listForRepo({
        owner,
        repo: repoName,
        state,
        labels: labels ? labels.join(',') : undefined,
        assignee,
        creator,
        sort,
        direction,
        per_page: Math.min(perPage, 100),
        page,
      });

      // Filter out pull requests (they come through issues API too)
      const issues = response.data
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          url: issue.html_url,
          labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
          assignees: issue.assignees.map((a) => a.login),
          author: issue.user.login,
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
      if (error.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repoName}`);
      }
      throw error;
    }
  },
};

// Export all tools as an array for easy registration
export const githubTools = [githubReadFile, githubCreatePR, githubListIssues];

export default githubTools;
