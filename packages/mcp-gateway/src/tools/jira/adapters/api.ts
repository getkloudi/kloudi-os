import { jira } from '../../../providers/jira/index.js';
import type { InternalTool } from '../../../registry.js';

export function buildJiraApiTools(): InternalTool[] {
  return [
    {
      definition: {
        name: 'jira_get_issue',
        description: 'Get details of a Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'Issue key (e.g. PROJ-123)',
            },
          },
          required: ['issueKey'],
        },
        integration: 'jira',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            jira.getIssue(
              credentials['domain'] as string,
              params['issueKey'] as string,
              credentials['email'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'jira_update_issue',
        description: 'Update fields on a Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'Issue key (e.g. PROJ-123)',
            },
            fields: {
              type: 'object',
              description: 'Fields to update',
              properties: {},
            },
          },
          required: ['issueKey', 'fields'],
        },
        integration: 'jira',
        authType: 'org',
        defaultTrust: 'prompt',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            jira.updateIssue(
              credentials['domain'] as string,
              params['issueKey'] as string,
              params['fields'] as Record<string, unknown>,
              credentials['email'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'jira_add_comment',
        description: 'Add a comment to a Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'Issue key (e.g. PROJ-123)',
            },
            body: { type: 'string', description: 'Comment text' },
          },
          required: ['issueKey', 'body'],
        },
        integration: 'jira',
        authType: 'org',
        defaultTrust: 'prompt',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            jira.addComment(
              credentials['domain'] as string,
              params['issueKey'] as string,
              params['body'] as string,
              credentials['email'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'jira_search_issues',
        description: 'Search Jira issues using JQL (Jira Query Language)',
        inputSchema: {
          type: 'object',
          properties: {
            jql: { type: 'string', description: 'JQL query string' },
          },
          required: ['jql'],
        },
        integration: 'jira',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (params, credentials, _context) =>
            jira.searchIssues(
              credentials['domain'] as string,
              params['jql'] as string,
              credentials['email'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
    {
      definition: {
        name: 'jira_list_projects',
        description:
          'List all Jira projects accessible with the configured credentials',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
        integration: 'jira',
        authType: 'org',
        defaultTrust: 'auto',
      },
      adapters: [
        {
          type: 'api',
          execute: async (_params, credentials, _context) =>
            jira.listProjects(
              credentials['domain'] as string,
              credentials['email'] as string,
              credentials['token'] as string
            ),
        },
      ],
    },
  ];
}
