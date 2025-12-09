import type { GitHubPullRequest } from "@/types/github";

interface PullRequestCardProps {
  pr: GitHubPullRequest;
}

export function PullRequestCard({ pr }: PullRequestCardProps) {
  const createdAt = new Date(pr.created_at);
  const daysAgo = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        <img
          src={pr.user.avatar_url}
          alt={pr.user.login}
          className="w-8 h-8 rounded-full"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={pr.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium truncate"
            >
              {pr.title}
            </a>
            {pr.draft && (
              <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                Draft
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-gray-500">
            #{pr.number} opened {daysAgo === 0 ? "today" : `${daysAgo}d ago`} by{" "}
            <a
              href={pr.user.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {pr.user.login}
            </a>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">
              {pr.head.ref} → {pr.base.ref}
            </span>
            {pr.labels.map((label) => (
              <span
                key={label.id}
                className="px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
