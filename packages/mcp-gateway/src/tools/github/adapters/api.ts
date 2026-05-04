import { github } from '../../../providers/github/index.js';
import type { InternalTool } from '../../../registry.js';

export function buildGitHubApiTools(): InternalTool[] {
  return [
    {
      definition: {
        name: 'github_read_file',
        description: 'Read a file from a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            path: {
              type: 'string',
              description: 'File path in the repository',
            },
          },
          required: ['owner', 'repo', 'path'],
        },
        integration: 'github',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            github.readFile(
              params['owner'] as string,
              params['repo'] as string,
              params['path'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'github_list_prs',
        description: 'List pull requests in a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
        integration: 'github',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            github.listPrs(
              params['owner'] as string,
              params['repo'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'github_create_pr',
        description: 'Create a pull request in a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'Pull request title' },
            body: { type: 'string', description: 'Pull request description' },
            base: { type: 'string', description: 'Base branch to merge into' },
            head: { type: 'string', description: 'Head branch with changes' },
          },
          required: ['owner', 'repo', 'title', 'body', 'base', 'head'],
        },
        integration: 'github',
        authType: 'org',
        defaultTrust: 'prompt',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            github.createPr(
              {
                owner: params['owner'] as string,
                repo: params['repo'] as string,
                title: params['title'] as string,
                body: params['body'] as string,
                base: params['base'] as string,
                head: params['head'] as string,
              },
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'github_post_comment',
        description: 'Post a comment on a GitHub issue or pull request',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            issue_number: { type: 'number', description: 'Issue or PR number' },
            body: { type: 'string', description: 'Comment text' },
          },
          required: ['owner', 'repo', 'issue_number', 'body'],
        },
        integration: 'github',
        authType: 'org',
        defaultTrust: 'prompt',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            github.postComment(
              params['owner'] as string,
              params['repo'] as string,
              params['issue_number'] as number,
              params['body'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'github_get_issue',
        description: 'Get details of a GitHub issue',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            issue_number: { type: 'number', description: 'Issue number' },
          },
          required: ['owner', 'repo', 'issue_number'],
        },
        integration: 'github',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            github.getIssue(
              params['owner'] as string,
              params['repo'] as string,
              params['issue_number'] as number,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'github_list_commits',
        description: 'List recent commits in a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
        integration: 'github',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            github.listCommits(
              params['owner'] as string,
              params['repo'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
  ];
}
