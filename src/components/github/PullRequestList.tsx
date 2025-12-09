import { useState } from "react";
import type { PullRequestsResult } from "@/types/github";
import { PullRequestCard } from "./PullRequestCard";

interface PullRequestListProps {
  results: PullRequestsResult[];
}

export function PullRequestList({ results }: PullRequestListProps) {
  const [now] = useState(() => Date.now());
  return (
    <div className="space-y-6">
      {results.map((result) => (
        <div key={`${result.repository.owner}/${result.repository.repo}`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            <a
              href={`https://github.com/${result.repository.owner}/${result.repository.repo}/pulls`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {result.repository.owner}/{result.repository.repo}
            </a>
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({result.pullRequests.length} open)
            </span>
          </h3>

          {result.error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {result.error}
            </div>
          ) : result.pullRequests.length === 0 ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-sm">
              No open pull requests
            </div>
          ) : (
            <div className="space-y-3">
              {result.pullRequests.map((pr) => (
                <PullRequestCard key={pr.id} pr={pr} now={now} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
