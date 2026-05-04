import type {
  CreatePrParams,
  GitHubCommit,
  GitHubFile,
  GitHubIssue,
  PullRequest,
} from './types.js';

const BASE = 'https://api.github.com';

async function ghFetch(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const github = {
  readFile: (owner: string, repo: string, path: string, token: string) =>
    ghFetch(
      `/repos/${owner}/${repo}/contents/${path}`,
      token
    ) as Promise<GitHubFile>,

  listPrs: (owner: string, repo: string, token: string) =>
    ghFetch(`/repos/${owner}/${repo}/pulls`, token) as Promise<PullRequest[]>,

  createPr: (params: CreatePrParams, token: string) =>
    ghFetch(`/repos/${params.owner}/${params.repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        base: params.base,
        head: params.head,
      }),
    }) as Promise<PullRequest>,

  postComment: (
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
    token: string
  ) =>
    ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  getIssue: (owner: string, repo: string, issueNumber: number, token: string) =>
    ghFetch(
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      token
    ) as Promise<GitHubIssue>,

  listCommits: (owner: string, repo: string, token: string) =>
    ghFetch(`/repos/${owner}/${repo}/commits`, token) as Promise<
      GitHubCommit[]
    >,
};
