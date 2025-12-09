import type {
  GitHubPullRequest,
  GitHubReview,
  Repository,
  PullRequestsResult,
  ActionablePR,
  ActionablePRsResult,
  ActionReason,
} from "@/types/github";

export const MONITORED_REPOSITORIES: Repository[] = [
  { owner: "Moment-Wealth", repo: "superadvisor" },
];

interface GitHubUser {
  login: string;
}

class GitHubClient {
  private token: string;
  private baseUrl = "https://api.github.com";

  constructor(token: string) {
    this.token = token;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("GitHub authentication failed. Check your PAT.");
      }
      if (response.status === 403) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        if (remaining === "0") {
          const resetTime = response.headers.get("X-RateLimit-Reset");
          throw new Error(
            `GitHub rate limit exceeded. Resets at ${new Date(Number(resetTime) * 1000).toLocaleTimeString()}`
          );
        }
        throw new Error("GitHub access forbidden. Check repository permissions.");
      }
      if (response.status === 404) {
        throw new Error("Repository not found or no access.");
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.fetch<GitHubUser>("/user");
  }

  async getOpenPullRequests(
    owner: string,
    repo: string
  ): Promise<GitHubPullRequest[]> {
    return this.fetch<GitHubPullRequest[]>(
      `/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=100`
    );
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubReview[]> {
    return this.fetch<GitHubReview[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
    );
  }

  async getPullRequestDetails(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubPullRequest> {
    return this.fetch<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`
    );
  }

  async getPullRequestReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{ body: string; user: { login: string }; created_at: string }>> {
    return this.fetch<Array<{ body: string; user: { login: string }; created_at: string }>>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=50`
    );
  }
}

function createGitHubClient(): GitHubClient | null {
  const token = process.env.GITHUB_PAT;

  if (!token) {
    console.warn("GITHUB_PAT environment variable is not set");
    return null;
  }

  return new GitHubClient(token);
}

export async function fetchAllPullRequests(): Promise<PullRequestsResult[]> {
  const client = createGitHubClient();

  if (!client) {
    return MONITORED_REPOSITORIES.map((repo) => ({
      repository: repo,
      pullRequests: [],
      error: "GitHub token not configured",
    }));
  }

  const results = await Promise.allSettled(
    MONITORED_REPOSITORIES.map(async (repo) => {
      const pullRequests = await client.getOpenPullRequests(repo.owner, repo.repo);
      return {
        repository: repo,
        pullRequests,
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      repository: MONITORED_REPOSITORIES[index],
      pullRequests: [],
      error: result.reason?.message || "Failed to fetch pull requests",
    };
  });
}

function hasLabel(pr: GitHubPullRequest, labelName: string): boolean {
  return pr.labels.some((l) => l.name.toLowerCase() === labelName.toLowerCase());
}

function isAssignedTo(pr: GitHubPullRequest, username: string): boolean {
  return pr.assignees.some((a) => a.login.toLowerCase() === username.toLowerCase());
}

function isRequestedReviewer(pr: GitHubPullRequest, username: string): boolean {
  return pr.requested_reviewers.some(
    (r) => r.login.toLowerCase() === username.toLowerCase()
  );
}

function hasChangesRequested(reviews: GitHubReview[]): boolean {
  // Get the latest review from each user
  const latestByUser = new Map<string, GitHubReview>();
  for (const review of reviews) {
    const existing = latestByUser.get(review.user.login);
    if (!existing || new Date(review.submitted_at) > new Date(existing.submitted_at)) {
      latestByUser.set(review.user.login, review);
    }
  }
  // Check if any latest review is CHANGES_REQUESTED
  return Array.from(latestByUser.values()).some(
    (r) => r.state === "CHANGES_REQUESTED"
  );
}

function hasUnaddressedReviewComments(reviews: GitHubReview[], pr: GitHubPullRequest): boolean {
  // Filter out bot reviews
  const humanReviews = reviews.filter(r => !r.user.login.endsWith("[bot]") && !r.user.login.includes("bot"));

  // Get reviewers who left comments or requested changes
  const reviewersWithComments = humanReviews
    .filter(r => r.state === "COMMENTED" || r.state === "CHANGES_REQUESTED")
    .map(r => r.user.login.toLowerCase());

  if (reviewersWithComments.length === 0) return false;

  // If any of those reviewers are in requested_reviewers, it means author
  // has addressed comments and re-requested review - so comments are addressed
  const pendingReviewers = new Set(pr.requested_reviewers.map(r => r.login.toLowerCase()));

  // Comments are unaddressed if reviewer is NOT waiting to re-review
  // (i.e., they left comments and author hasn't re-requested their review yet)
  return reviewersWithComments.some(reviewer => !pendingReviewers.has(reviewer));
}

function hasUserReviewed(reviews: GitHubReview[], username: string): boolean {
  return reviews.some(
    (r) =>
      r.user.login.toLowerCase() === username.toLowerCase() &&
      (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "COMMENTED")
  );
}

export async function fetchActionablePullRequests(): Promise<ActionablePRsResult> {
  const client = createGitHubClient();

  if (!client) {
    return { actionablePRs: [], error: "GitHub token not configured" };
  }

  try {
    const currentUser = await client.getAuthenticatedUser();
    const username = currentUser.login;

    const actionablePRs: ActionablePR[] = [];

    for (const repo of MONITORED_REPOSITORIES) {
      let pullRequests: GitHubPullRequest[];
      try {
        pullRequests = await client.getOpenPullRequests(repo.owner, repo.repo);
      } catch (e) {
        console.error(`Failed to fetch PRs for ${repo.owner}/${repo.repo}:`, e);
        continue;
      }

      for (const pr of pullRequests) {
        const isAuthor = pr.user.login.toLowerCase() === username.toLowerCase();
        const isAssigned = isAssignedTo(pr, username);

        let reviews: GitHubReview[] = [];

        // Fetch reviews if needed for author PRs or assigned PRs with review_ready
        if (isAuthor || (isAssigned && hasLabel(pr, "review_ready"))) {
          try {
            reviews = await client.getPullRequestReviews(repo.owner, repo.repo, pr.number);
          } catch (e) {
            console.error(`Failed to fetch reviews for PR #${pr.number}:`, e);
          }
        }

        let reason: ActionReason | null = null;
        let reasonLabel = "";

        if (isAuthor) {
          // Author conditions
          if (hasLabel(pr, "fix_needed")) {
            reason = "fix_needed";
            reasonLabel = "Fixes Needed";
          } else if (hasChangesRequested(reviews)) {
            reason = "changes_requested";
            reasonLabel = "Changes Requested";
          } else if (hasUnaddressedReviewComments(reviews, pr) && !hasLabel(pr, "review_done")) {
            reason = "has_comments";
            reasonLabel = "Has Review Comments";
          }
        } else if (isAssigned && !hasLabel(pr, "fix_needed")) {
          // Non-author conditions (only if assigned and not passed back to dev)
          // Priority: review first, then QA
          const userHasReviewed = hasUserReviewed(reviews, username);

          if (hasLabel(pr, "review_ready") && !userHasReviewed) {
            reason = "review_ready";
            reasonLabel = "Review Needed";
          } else if (
            hasLabel(pr, "review_ongoing") &&
            isRequestedReviewer(pr, username)
          ) {
            reason = "review_ongoing";
            reasonLabel = "Review In Progress";
          } else if (
            (hasLabel(pr, "qa_by_dev") || hasLabel(pr, "qa_by_done")) &&
            !hasLabel(pr, "qa_done")
          ) {
            reason = "qa_needed";
            reasonLabel = "QA Needed";
          }
        }

        if (reason) {
          // Fetch detailed PR stats for better effort estimation
          let detailedPr = pr;
          try {
            detailedPr = await client.getPullRequestDetails(repo.owner, repo.repo, pr.number);
          } catch (e) {
            console.error(`Failed to fetch details for PR #${pr.number}:`, e);
          }

          // Fetch review comments for "has_comments" PRs so AI can estimate based on actual comments
          let reviewComments: Array<{ body: string; user: { login: string }; created_at: string }> | undefined;
          if (reason === "has_comments") {
            try {
              const allComments = await client.getPullRequestReviewComments(repo.owner, repo.repo, pr.number);
              // Filter out bot comments
              reviewComments = allComments.filter(c =>
                !c.user.login.endsWith("[bot]") && !c.user.login.includes("bot")
              );
            } catch (e) {
              console.error(`Failed to fetch review comments for PR #${pr.number}:`, e);
            }
          }

          actionablePRs.push({
            pr: detailedPr,
            repository: repo,
            reason,
            reasonLabel,
            reviewComments,
          });
        }
      }
    }

    // Sort by created_at oldest first
    actionablePRs.sort(
      (a, b) => new Date(a.pr.created_at).getTime() - new Date(b.pr.created_at).getTime()
    );

    return { actionablePRs };
  } catch (e) {
    return {
      actionablePRs: [],
      error: e instanceof Error ? e.message : "Failed to fetch actionable PRs",
    };
  }
}
