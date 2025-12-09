"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { GitHubPullRequest } from "@/types/github";

interface PRResult {
  repository: { owner: string; repo: string };
  pullRequests: GitHubPullRequest[];
  error?: string;
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for the magic link!");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-slate-400">Sign in to your dashboard</p>
          </div>

          <form className="space-y-5" onSubmit={handleSendMagicLink}>
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-lg text-sm">
                {message}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending..." : "Send Magic Link"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

interface ActionablePRData {
  pr: {
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
  repository: { owner: string; repo: string };
  reason: string;
  reasonLabel: string;
}

interface LinearIssueData {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  state: {
    name: string;
    type: string;
  };
  createdAt: string;
  attachments?: {
    nodes: Array<{
      url: string;
    }>;
  };
}

interface ActionableItem {
  type: "pr" | "linear" | "pr_with_linear";
  sortPriority: number;
  pr?: ActionablePRData["pr"];
  prRepository?: ActionablePRData["repository"];
  prReason?: string;
  prReasonLabel?: string;
  linearIssue?: LinearIssueData;
  isDraft?: boolean;
}

function combineActionableItems(
  prs: ActionablePRData[],
  linearIssues: LinearIssueData[]
): ActionableItem[] {
  const items: ActionableItem[] = [];
  const linkedPRUrls = new Set<string>();

  const linearByPrUrl = new Map<string, LinearIssueData>();
  for (const issue of linearIssues) {
    const prAttachment = issue.attachments?.nodes?.find(
      (a) => a.url?.includes("github.com") && a.url?.includes("/pull/")
    );
    if (prAttachment?.url) {
      linearByPrUrl.set(prAttachment.url, issue);
      linkedPRUrls.add(prAttachment.url);
    }
  }

  for (const prData of prs) {
    const linkedLinear = linearByPrUrl.get(prData.pr.html_url);
    let sortPriority = 200;
    if (linkedLinear && linkedLinear.priority === 1) {
      sortPriority = 100 + linkedLinear.priority;
    }

    items.push({
      type: linkedLinear ? "pr_with_linear" : "pr",
      sortPriority,
      pr: prData.pr,
      prRepository: prData.repository,
      prReason: prData.reason,
      prReasonLabel: prData.reasonLabel,
      linearIssue: linkedLinear,
      isDraft: prData.pr.draft,
    });
  }

  for (const issue of linearIssues) {
    const prAttachment = issue.attachments?.nodes?.find(
      (a) => a.url?.includes("github.com") && a.url?.includes("/pull/")
    );
    if (prAttachment?.url && linkedPRUrls.has(prAttachment.url)) {
      continue;
    }

    let sortPriority: number;
    if (issue.priority === 1) {
      sortPriority = 100 + issue.priority;
    } else if (issue.state.type === "started") {
      sortPriority = 300 + issue.priority;
    } else {
      sortPriority = 400 + issue.priority;
    }

    items.push({
      type: "linear",
      sortPriority,
      linearIssue: issue,
      isDraft: false,
    });
  }

  items.sort((a, b) => a.sortPriority - b.sortPriority);
  return items;
}

function Dashboard(_props: { user: User }) {
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [prResults, setPrResults] = useState<PRResult[] | null>(null);
  const [prLoading, setPrLoading] = useState(true);
  const [actionablePRs, setActionablePRs] = useState<ActionablePRData[]>([]);
  const [now, setNow] = useState(Date.now);
  const [linearIssues, setLinearIssues] = useState<LinearIssueData[]>([]);
  const [actionableLoading, setActionableLoading] = useState(true);
  const [actionableError, setActionableError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    fetch("/api/github/user")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setGithubUser(data);
      })
      .catch(() => {});

    fetch("/api/github/pull-requests")
      .then((res) => res.json())
      .then((data) => {
        setPrResults(data);
        setPrLoading(false);
        setNow(Date.now());
      })
      .catch(() => setPrLoading(false));

    Promise.all([
      fetch("/api/github/actionable-prs").then((res) => res.json()),
      fetch("/api/linear/issues").then((res) => res.json()),
    ])
      .then(([prData, linearData]) => {
        if (prData.error && linearData.error) {
          setActionableError(`${prData.error}; ${linearData.error}`);
        } else {
          setActionablePRs(prData.actionablePRs || []);
          setLinearIssues(linearData.issues || []);
        }
        setActionableLoading(false);
        setNow(Date.now());
      })
      .catch(() => {
        setActionableError("Failed to load");
        setActionableLoading(false);
      });
  }, []);

  const actionableItems = combineActionableItems(actionablePRs, linearIssues);
  const activeItems = actionableItems.filter((i) => !i.isDraft);
  const draftItems = actionableItems.filter((i) => i.isDraft);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {githubUser ? (
              <>
                <img
                  src={githubUser.avatar_url}
                  alt={githubUser.login}
                  className="w-10 h-10 rounded-full ring-2 ring-slate-700"
                />
                <div>
                  <h1 className="text-lg font-semibold text-white">
                    {githubUser.name || githubUser.login}
                  </h1>
                  <p className="text-sm text-slate-500">@{githubUser.login}</p>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
                  <div className="h-3 w-16 bg-slate-800 rounded animate-pulse" />
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Needs Action Section */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-white">Needs Your Action</h2>
            {!actionableLoading && !actionableError && (
              <span className="px-2.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
                {activeItems.length}
              </span>
            )}
          </div>

          {actionableLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-slate-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : actionableError ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {actionableError}
            </div>
          ) : activeItems.length === 0 ? (
            <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
              <p className="text-emerald-400 font-medium">All caught up!</p>
              <p className="text-slate-500 text-sm mt-1">Nothing needs your attention right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeItems.map((item) => (
                <ActionableItemCard key={item.pr?.id || item.linearIssue?.id} item={item} now={now} />
              ))}
            </div>
          )}
        </section>

        {/* Draft PRs Section */}
        {!actionableLoading && !actionableError && draftItems.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-white">Drafts</h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-slate-700 text-slate-400 rounded-full">
                {draftItems.length}
              </span>
            </div>
            <div className="space-y-3">
              {draftItems.map((item) => (
                <ActionableItemCard key={item.pr?.id} item={item} now={now} />
              ))}
            </div>
          </section>
        )}

        {/* All PRs Section */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-4">All Open Pull Requests</h2>
          {prLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : prResults ? (
            <PullRequestResults results={prResults} now={now} />
          ) : (
            <p className="text-slate-500">Failed to load pull requests</p>
          )}
        </section>
      </main>
    </div>
  );
}

function PullRequestResults({ results, now }: { results: PRResult[]; now: number }) {
  return (
    <div className="space-y-6">
      {results.map((result) => (
        <div key={`${result.repository.owner}/${result.repository.repo}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-slate-400 font-medium">
              {result.repository.owner}/{result.repository.repo}
            </span>
            <span className="text-slate-600 text-sm">
              {result.pullRequests.length} open
            </span>
          </div>

          {result.error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {result.error}
            </div>
          ) : result.pullRequests.length === 0 ? (
            <div className="p-4 bg-slate-900 rounded-xl text-slate-500 text-sm">
              No open pull requests
            </div>
          ) : (
            <div className="space-y-2">
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

function PullRequestCard({ pr, now }: { pr: GitHubPullRequest; now: number }) {
  const createdAt = new Date(pr.created_at);
  const daysAgo = Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <a
      href={pr.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors group"
    >
      <div className="flex items-center gap-3">
        <img src={pr.user.avatar_url} alt={pr.user.login} className="w-8 h-8 rounded-full" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium truncate group-hover:text-blue-400 transition-colors">
              {pr.title}
            </span>
            {pr.draft && (
              <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Draft</span>
            )}
          </div>
          <div className="text-sm text-slate-500">
            #{pr.number} · {daysAgo === 0 ? "today" : `${daysAgo}d ago`} · {pr.user.login}
          </div>
        </div>
      </div>
    </a>
  );
}

function ActionableItemCard({ item, now }: { item: ActionableItem; now: number }) {
  if (item.type === "linear" && item.linearIssue) {
    return <LinearIssueCard issue={item.linearIssue} />;
  }

  if ((item.type === "pr" || item.type === "pr_with_linear") && item.pr) {
    const { pr, prRepository, prReasonLabel, linearIssue } = item;
    const createdAt = new Date(pr.created_at);
    const daysAgo = Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return (
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
        <div className="flex items-start gap-3">
          <img src={pr.user.avatar_url} alt={pr.user.login} className="w-9 h-9 rounded-full" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <a
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-medium hover:text-blue-400 transition-colors"
              >
                {pr.title}
              </a>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {prReasonLabel && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded">
                  {prReasonLabel}
                </span>
              )}
              {linearIssue && (
                <a
                  href={linearIssue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 text-xs font-medium bg-violet-500/20 text-violet-400 rounded hover:bg-violet-500/30 transition-colors"
                >
                  {linearIssue.identifier}
                </a>
              )}
              {pr.draft && (
                <span className="px-2 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Draft</span>
              )}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {prRepository?.owner}/{prRepository?.repo} · #{pr.number} · {daysAgo === 0 ? "today" : `${daysAgo}d ago`} · {pr.user.login}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function LinearIssueCard({ issue }: { issue: LinearIssueData }) {
  const priorityStyles: Record<number, string> = {
    1: "bg-red-500/20 text-red-400",
    2: "bg-orange-500/20 text-orange-400",
    3: "bg-yellow-500/20 text-yellow-400",
    4: "bg-blue-500/20 text-blue-400",
  };

  const stateLabel = issue.state.type === "started" ? "In Progress" : "To Do";

  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <span className="text-violet-400 text-xs font-bold">
            {issue.identifier.split("-")[0]?.slice(0, 2) || "LN"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white font-medium hover:text-blue-400 transition-colors"
            >
              {issue.title}
            </a>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityStyles[issue.priority] || "bg-slate-700 text-slate-400"}`}>
              {issue.priorityLabel || "No Priority"}
            </span>
            <span className="px-2 py-0.5 text-xs font-medium bg-violet-500/20 text-violet-400 rounded">
              {stateLabel}
            </span>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {issue.identifier} · {issue.state.name}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Dev mode: if Supabase is not configured, skip auth
  const isDevMode = !supabase;

  useEffect(() => {
    if (isDevMode) {
      setLoading(false);
      return;
    }

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase, isDevMode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Dev mode: render dashboard without auth
  if (isDevMode) {
    return <Dashboard user={null as unknown as User} />;
  }

  if (!user) {
    return <MagicLinkForm />;
  }

  return <Dashboard user={user} />;
}
