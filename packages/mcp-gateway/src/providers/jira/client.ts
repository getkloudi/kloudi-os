import type { JiraIssue, JiraProject } from './types.js';

async function jiraFetch(
  domain: string,
  path: string,
  email: string,
  token: string,
  init: RequestInit = {}
): Promise<unknown> {
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const res = await fetch(`https://${domain}.atlassian.net/rest/api/3${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const jira = {
  getIssue: (domain: string, issueKey: string, email: string, token: string) =>
    jiraFetch(domain, `/issue/${issueKey}`, email, token) as Promise<JiraIssue>,

  updateIssue: (
    domain: string,
    issueKey: string,
    fields: Record<string, unknown>,
    email: string,
    token: string
  ) =>
    jiraFetch(domain, `/issue/${issueKey}`, email, token, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    }),

  addComment: (
    domain: string,
    issueKey: string,
    body: string,
    email: string,
    token: string
  ) =>
    jiraFetch(domain, `/issue/${issueKey}/comment`, email, token, {
      method: 'POST',
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: body }],
            },
          ],
        },
      }),
    }),

  searchIssues: (domain: string, jql: string, email: string, token: string) =>
    jiraFetch(domain, `/search?jql=${encodeURIComponent(jql)}`, email, token),

  listProjects: (domain: string, email: string, token: string) =>
    jiraFetch(domain, '/project', email, token) as Promise<JiraProject[]>,
};
