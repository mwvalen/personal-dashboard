export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  priority: number; // 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low
  priorityLabel: string;
  estimate?: number; // Story points if set
  state: {
    name: string;
    type: string; // "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled"
  };
  createdAt: string;
  updatedAt: string;
  attachments?: {
    nodes: Array<{
      url: string;
      sourceType?: string;
    }>;
  };
  comments?: {
    nodes: Array<{
      body: string;
      createdAt: string;
    }>;
  };
  inverseRelations?: {
    nodes: Array<{
      type: string; // "blocks" | "duplicate" | "related"
    }>;
  };
}

export interface LinearIssuesResult {
  issues: LinearIssue[];
  error?: string;
}

export type ActionableItemType = "pr" | "linear" | "pr_with_linear";

export interface ActionableItem {
  type: ActionableItemType;
  priority: number; // For sorting: 0 = urgent linear, 1 = PR, 2 = in_progress linear, 3 = todo linear
  subPriority: number; // Linear priority within category
  pr?: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    created_at: string;
    draft: boolean;
    user: { login: string; avatar_url: string; html_url: string };
    head: { ref: string };
    base: { ref: string };
    labels: Array<{ id: number; name: string; color: string }>;
  };
  prRepository?: { owner: string; repo: string };
  prReason?: string;
  prReasonLabel?: string;
  linearIssue?: LinearIssue;
}
