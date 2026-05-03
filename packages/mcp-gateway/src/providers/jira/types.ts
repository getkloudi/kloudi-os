export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: unknown;
    status: { name: string };
    assignee: { displayName: string } | null;
  };
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}
