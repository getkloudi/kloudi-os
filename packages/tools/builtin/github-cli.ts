/**
 * GitHub CLI Tools
 *
 * Registers GitHub-related tools that use the `gh` and `git` CLIs.
 * These complement the Octokit-based tools in github.ts with
 * lightweight CLI wrappers for common operations.
 */

import type { CLIToolDefinition } from '../adapters/cli-adapter.js';
import { registerCLITools } from '../adapters/cli-adapter.js';
import type { ToolRegistry } from '../registry.js';

/**
 * GitHub CLI tool definitions
 */
export const githubCLIToolDefinitions: CLIToolDefinition[] = [
  {
    name: 'github.createBranch',
    description: 'Create and checkout a new git branch',
    command: 'git',
    args: (params) => [
      'checkout',
      '-b',
      String(params['branchName'] ?? ''),
    ],
    parameters: {
      type: 'object',
      properties: {
        branchName: {
          type: 'string',
          description: 'Name of the branch to create',
        },
      },
      required: ['branchName'],
    },
  },
  {
    name: 'github.createPR',
    description: 'Create a pull request using the GitHub CLI',
    command: 'gh',
    args: (params) => [
      'pr',
      'create',
      '--title',
      String(params['title'] ?? ''),
      '--body',
      String(params['body'] ?? ''),
    ],
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Pull request title',
        },
        body: {
          type: 'string',
          description: 'Pull request body/description',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'github.listIssues',
    description: 'List issues in a GitHub repository',
    command: 'gh',
    args: (params) => {
      const args = ['issue', 'list'];
      if (params['repo']) {
        args.push('--repo', String(params['repo']));
      }
      args.push('--json', 'number,title,state');
      return args;
    },
    parseOutput: (stdout) => JSON.parse(stdout),
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description:
            'Repository in owner/repo format (defaults to current repo)',
        },
      },
      required: [],
    },
  },
  {
    name: 'github.viewIssue',
    description: 'View details of a specific GitHub issue',
    command: 'gh',
    args: (params) => [
      'issue',
      'view',
      String(params['issueNumber'] ?? ''),
      '--json',
      'number,title,body,labels,assignees',
    ],
    parseOutput: (stdout) => JSON.parse(stdout),
    parameters: {
      type: 'object',
      properties: {
        issueNumber: {
          type: 'string',
          description: 'Issue number to view',
        },
      },
      required: ['issueNumber'],
    },
  },
];

/**
 * Register all GitHub CLI tools in the registry.
 */
export function registerGitHubCLITools(registry: ToolRegistry): void {
  registerCLITools(registry, githubCLIToolDefinitions);
}
