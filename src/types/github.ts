export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  requested_reviewers: Array<{
    login: string;
    avatar_url: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

export interface GitHubReview {
  id: number;
  user: {
    login: string;
  };
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submitted_at: string;
}

export interface Repository {
  owner: string;
  repo: string;
}

export interface PullRequestsResult {
  repository: Repository;
  pullRequests: GitHubPullRequest[];
  error?: string;
}

export type ActionReason =
  | "review_ready"
  | "review_ongoing"
  | "qa_needed"
  | "fix_needed"
  | "changes_requested"
  | "has_comments";

export interface ActionablePR {
  pr: GitHubPullRequest;
  repository: Repository;
  reason: ActionReason;
  reasonLabel: string;
}

export interface ActionablePRsResult {
  actionablePRs: ActionablePR[];
  error?: string;
}
