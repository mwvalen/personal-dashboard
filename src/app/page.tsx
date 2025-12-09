"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900">
            Valens Dash
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email to receive a magic link
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSendMagicLink}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded">
              {message}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          <a href="/login" className="text-blue-600 hover:underline">
            Sign in with password instead
          </a>
        </p>
      </div>
    </div>
  );
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

function Dashboard({ user }: { user: User }) {
  const [prResults, setPrResults] = useState<unknown[] | null>(null);
  const [prLoading, setPrLoading] = useState(true);
  const [actionablePRs, setActionablePRs] = useState<ActionablePRData[]>([]);
  const [actionableLoading, setActionableLoading] = useState(true);
  const [actionableError, setActionableError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    fetch("/api/github/pull-requests")
      .then((res) => res.json())
      .then((data) => {
        setPrResults(data);
        setPrLoading(false);
      })
      .catch(() => {
        setPrLoading(false);
      });

    fetch("/api/github/actionable-prs")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setActionableError(data.error);
        } else {
          setActionablePRs(data.actionablePRs || []);
        }
        setActionableLoading(false);
      })
      .catch(() => {
        setActionableError("Failed to load");
        setActionableLoading(false);
      });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Valens Dash</h1>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <p className="text-gray-600">
            Welcome, {user.email}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Needs Your Action
            {!actionableLoading && !actionableError && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({actionablePRs.length})
              </span>
            )}
          </h2>
          {actionableLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          ) : actionableError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {actionableError}
            </div>
          ) : actionablePRs.filter((p) => !p.pr.draft).length === 0 ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              All caught up! No PRs need your action.
            </div>
          ) : (
            <div className="space-y-3">
              {actionablePRs
                .filter((p) => !p.pr.draft)
                .map((item) => (
                  <ActionablePRCard key={item.pr.id} item={item} />
                ))}
            </div>
          )}
        </div>

        {!actionableLoading && !actionableError && actionablePRs.filter((p) => p.pr.draft).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Draft PRs Needing Action
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({actionablePRs.filter((p) => p.pr.draft).length})
              </span>
            </h2>
            <div className="space-y-3">
              {actionablePRs
                .filter((p) => p.pr.draft)
                .map((item) => (
                  <ActionablePRCard key={item.pr.id} item={item} />
                ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            All Open Pull Requests
          </h2>
          {prLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          ) : prResults ? (
            <PullRequestResults results={prResults} />
          ) : (
            <p className="text-gray-500">Failed to load pull requests</p>
          )}
        </div>
      </main>
    </div>
  );
}

function PullRequestResults({ results }: { results: unknown[] }) {
  return (
    <div className="space-y-6">
      {results.map((result: any) => (
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
              {result.pullRequests.map((pr: any) => (
                <PullRequestCard key={pr.id} pr={pr} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PullRequestCard({ pr }: { pr: any }) {
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
            {pr.labels.map((label: any) => (
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

function ActionablePRCard({ item }: { item: ActionablePRData }) {
  const { pr, repository, reasonLabel } = item;
  const createdAt = new Date(pr.created_at);
  const daysAgo = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 hover:bg-orange-100 transition-colors">
      <div className="flex items-start gap-3">
        <img
          src={pr.user.avatar_url}
          alt={pr.user.login}
          className="w-8 h-8 rounded-full"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={pr.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              {pr.title}
            </a>
            <span className="px-2 py-0.5 text-xs bg-orange-500 text-white rounded-full font-medium">
              {reasonLabel}
            </span>
            {pr.draft && (
              <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                Draft
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            <span className="text-gray-500">{repository.owner}/{repository.repo}</span>
            {" · "}
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
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
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
  }, [supabase.auth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <MagicLinkForm />;
  }

  return <Dashboard user={user} />;
}
