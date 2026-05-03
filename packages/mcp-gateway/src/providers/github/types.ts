export interface CreatePrParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  base: string;
  head: string;
}

export interface PullRequest {
  number: number;
  html_url: string;
  title: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
}

export interface GitHubCommit {
  sha: string;
  commit: { message: string };
}

export interface GitHubFile {
  content: string;
  encoding: string;
  name: string;
}
