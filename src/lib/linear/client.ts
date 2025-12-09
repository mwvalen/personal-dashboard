import type { LinearIssue, LinearIssuesResult } from "@/types/linear";

interface LinearGraphQLResponse {
  data?: {
    viewer?: {
      assignedIssues?: {
        nodes: LinearIssue[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

class LinearClient {
  private apiKey: string;
  private baseUrl = "https://api.linear.app/graphql";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async query<T>(graphqlQuery: string): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query: graphqlQuery }),
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Linear authentication failed. Check your API key.");
      }
      throw new Error(`Linear API error: ${response.status}`);
    }

    const result = await response.json();
    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message);
    }

    return result;
  }

  async getMyActionableIssues(): Promise<LinearIssue[]> {
    const query = `
      query {
        viewer {
          assignedIssues(
            filter: {
              state: {
                type: { in: ["started", "unstarted"] }
              }
            }
            first: 100
          ) {
            nodes {
              id
              identifier
              title
              url
              priority
              priorityLabel
              createdAt
              updatedAt
              state {
                name
                type
              }
              attachments {
                nodes {
                  url
                  sourceType
                }
              }
            }
          }
        }
      }
    `;

    const response = await this.query<LinearGraphQLResponse>(query);
    return response.data?.viewer?.assignedIssues?.nodes || [];
  }
}

function createLinearClient(): LinearClient | null {
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    console.warn("LINEAR_API_KEY environment variable is not set");
    return null;
  }

  return new LinearClient(apiKey);
}

export async function fetchMyLinearIssues(): Promise<LinearIssuesResult> {
  const client = createLinearClient();

  if (!client) {
    return { issues: [], error: "Linear API key not configured" };
  }

  try {
    const issues = await client.getMyActionableIssues();
    return { issues };
  } catch (e) {
    return {
      issues: [],
      error: e instanceof Error ? e.message : "Failed to fetch Linear issues",
    };
  }
}

export function getLinkedPRUrl(issue: LinearIssue): string | null {
  if (!issue.attachments?.nodes) return null;

  const githubAttachment = issue.attachments.nodes.find(
    (a) => a.url?.includes("github.com") && a.url?.includes("/pull/")
  );

  return githubAttachment?.url || null;
}
