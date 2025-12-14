"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import type { GitHubPullRequest } from "@/types/github";
import type { CalendarEvent } from "@/types/calendar";
import type { DashboardUser } from "@/types/user";
import { UserSelector } from "@/components/UserSelector";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    if (!supabase) return;

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
  description?: string;
  url: string;
  priority: number;
  priorityLabel: string;
  estimate?: number;
  state: {
    name: string;
    type: string;
  };
  createdAt: string;
  updatedAt: string;
  attachments?: {
    nodes: Array<{
      url: string;
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
      type: string;
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
  isInReview?: boolean;
  isBlocked?: boolean;
  isStale?: boolean;
}

interface DailyPlanItem extends ActionableItem {
  hours: number;
  reasoning: string;
  isOverflow?: boolean;
}

// Category definitions for drag-and-drop grouping
type CategoryKey = "urgent" | "pr" | "inprogress-high" | "inprogress-medium" | "inprogress-low" | "inprogress-none" | "todo-high" | "todo-medium" | "todo-low" | "todo-none";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  "urgent": "Urgent Issues",
  "pr": "PR Actions",
  "inprogress-high": "In Progress - High",
  "inprogress-medium": "In Progress - Medium",
  "inprogress-low": "In Progress - Low",
  "inprogress-none": "In Progress - No Priority",
  "todo-high": "Todo - High",
  "todo-medium": "Todo - Medium",
  "todo-low": "Todo - Low",
  "todo-none": "Todo - No Priority",
};

const CATEGORY_ORDER: CategoryKey[] = [
  "urgent", "pr", "inprogress-high", "inprogress-medium", "inprogress-low", "inprogress-none",
  "todo-high", "todo-medium", "todo-low", "todo-none"
];

function getCategoryKey(item: ActionableItem): CategoryKey {
  const sortPriority = item.sortPriority || 999;
  const section = Math.floor(sortPriority / 100);
  const priority = item.linearIssue?.priority ?? 0;

  if (section === 1) return "urgent";
  if (section === 2) return "pr";
  if (section === 3) {
    if (priority === 1) return "inprogress-high"; // Urgent in progress treated as high
    if (priority === 2) return "inprogress-high";
    if (priority === 3) return "inprogress-medium";
    if (priority === 4) return "inprogress-low";
    return "inprogress-none";
  }
  // section 4 or fallback = todo
  if (priority === 1) return "todo-high"; // Urgent todo treated as high
  if (priority === 2) return "todo-high";
  if (priority === 3) return "todo-medium";
  if (priority === 4) return "todo-low";
  return "todo-none";
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

  // Linear priority: 0 = No Priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
  // We want: Urgent (1) -> High (2) -> Medium (3) -> Low (4) -> No Priority (0)
  const priorityOrder: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 0: 4 };

  for (const issue of linearIssues) {
    const prAttachment = issue.attachments?.nodes?.find(
      (a) => a.url?.includes("github.com") && a.url?.includes("/pull/")
    );
    if (prAttachment?.url && linkedPRUrls.has(prAttachment.url)) {
      continue;
    }

    const stateName = issue.state.name.toLowerCase();

    // Skip canceled issues unless they're specifically "Stale"
    if (issue.state.type === "canceled" && stateName !== "stale") {
      continue;
    }

    const priorityRank = priorityOrder[issue.priority] ?? 5;
    let sortPriority: number;
    if (issue.priority === 1) {
      sortPriority = 100 + priorityRank;
    } else if (issue.state.type === "started") {
      sortPriority = 300 + priorityRank;
    } else {
      sortPriority = 400 + priorityRank;
    }

    // Check if issue is blocked by another issue (has "blocks" inverse relation)
    const isBlockedByRelation = issue.inverseRelations?.nodes?.some(
      (rel) => rel.type === "blocks"
    );

    items.push({
      type: "linear",
      sortPriority,
      linearIssue: issue,
      isDraft: false,
      isInReview: stateName.includes("review"),
      isBlocked: stateName.includes("blocked") || isBlockedByRelation,
      isStale: stateName === "stale",
    });
  }

  items.sort((a, b) => a.sortPriority - b.sortPriority);
  return items;
}

function Dashboard() {
  // User selection state
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<DashboardUser | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);

  const [prResults, setPrResults] = useState<PRResult[] | null>(null);
  const [prLoading, setPrLoading] = useState(true);
  const [actionablePRs, setActionablePRs] = useState<ActionablePRData[]>([]);
  const [now, setNow] = useState(Date.now);
  const [linearIssues, setLinearIssues] = useState<LinearIssueData[]>([]);
  const [linearUnavailable, setLinearUnavailable] = useState(false);
  const [actionableLoading, setActionableLoading] = useState(true);
  const [actionableError, setActionableError] = useState<string | null>(null);
  const [dailyPlanItems, setDailyPlanItems] = useState<DailyPlanItem[]>([]);
  const [dailyPlanTotal, setDailyPlanTotal] = useState(0);
  const [dailyPlanMaxHours, setDailyPlanMaxHours] = useState(0);
  const [dailyPlanLoading, setDailyPlanLoading] = useState(false);
  const [dailyPlanLastRun, setDailyPlanLastRun] = useState<Date | null>(null);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [showHoursPrompt, setShowHoursPrompt] = useState(false);
  const [selectedHours, setSelectedHours] = useState(6);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [showAllStale, setShowAllStale] = useState(false);
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(new Set());
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>({});
  const [customHourEstimates, setCustomHourEstimates] = useState<Map<string, number>>(new Map());
  const router = useRouter();
  const supabase = createClient();

  // Helper to get localStorage key for current user (using GitHub username)
  const getDailyPlanKey = useCallback((githubUsername: string) => `dailyPlan_${githubUsername}`, []);
  const getItemOrderKey = useCallback((githubUsername: string) => `itemOrder_${githubUsername}`, []);

  // Load item order from localStorage for a specific user
  const loadItemOrderFromStorage = useCallback((githubUsername: string) => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(getItemOrderKey(githubUsername));
      if (stored) {
        const parsed = JSON.parse(stored);
        setItemOrder(parsed || {});
      } else {
        setItemOrder({});
      }
    } catch {
      setItemOrder({});
    }
  }, [getItemOrderKey]);

  // Save item order to localStorage
  const saveItemOrderToStorage = useCallback((githubUsername: string, order: Record<string, string[]>) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(getItemOrderKey(githubUsername), JSON.stringify(order));
    } catch {
      // Ignore storage errors
    }
  }, [getItemOrderKey]);

  // Load daily plan from localStorage for a specific user
  const loadDailyPlanFromStorage = useCallback((githubUsername: string) => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(getDailyPlanKey(githubUsername));
      if (stored) {
        const parsed = JSON.parse(stored);
        setDailyPlanItems(parsed.items || []);
        setDailyPlanTotal(parsed.totalHours || 0);
        setDailyPlanMaxHours(parsed.maxHours || 0);
        setDailyPlanLastRun(parsed.lastRun ? new Date(parsed.lastRun) : null);

        // Only load meetings if they're from today
        if (parsed.lastRun && parsed.meetings) {
          const lastRunDate = new Date(parsed.lastRun);
          const today = new Date();
          if (
            lastRunDate.getFullYear() === today.getFullYear() &&
            lastRunDate.getMonth() === today.getMonth() &&
            lastRunDate.getDate() === today.getDate()
          ) {
            setCalendarEvents(parsed.meetings);
            setSelectedEventIds(new Set(parsed.meetings.map((m: CalendarEvent) => m.id)));
            return;
          }
        }
      }
    } catch {
      // Invalid stored data, ignore
    }
    // Reset if no valid data
    setDailyPlanItems([]);
    setDailyPlanTotal(0);
    setDailyPlanMaxHours(0);
    setDailyPlanLastRun(null);
    setCalendarEvents([]);
    setSelectedEventIds(new Set());
  }, [getDailyPlanKey]);

  // Load users on mount
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.users) {
          setUsers(data.users);
          // Restore selected user from localStorage or use default
          const savedUsername = localStorage.getItem("selectedUserId");
          const savedUser = data.users.find((u: DashboardUser) => u.githubUsername === savedUsername);
          const userToSelect = savedUser || data.users.find((u: DashboardUser) => u.githubUsername === data.defaultUser) || data.users[0];
          setSelectedUser(userToSelect);
          if (userToSelect) {
            loadDailyPlanFromStorage(userToSelect.githubUsername);
            loadItemOrderFromStorage(userToSelect.githubUsername);
          }
        }
        setUsersLoading(false);
      })
      .catch(() => {
        setUsersLoading(false);
      });
  }, [loadDailyPlanFromStorage, loadItemOrderFromStorage]);

  // Fetch data for a user
  const fetchUserData = useCallback((githubUsername: string) => {
    // Fetch all PRs (not filtered by user)
    fetch("/api/github/pull-requests")
      .then((res) => res.json())
      .then((data) => {
        setPrResults(data);
        setPrLoading(false);
        setNow(Date.now());
      })
      .catch(() => setPrLoading(false));

    // Fetch user-specific actionable data
    Promise.all([
      fetch(`/api/github/actionable-prs?userId=${githubUsername}`).then((res) => res.json()),
      fetch(`/api/linear/issues?userId=${githubUsername}`).then((res) => res.json()),
    ])
      .then(([prData, linearData]) => {
        if (prData.error && linearData.error) {
          setActionableError(`${prData.error}; ${linearData.error}`);
        } else {
          setActionablePRs(prData.actionablePRs || []);
          // Handle Linear unavailable state
          if (linearData.linearUnavailable) {
            setLinearIssues([]);
            setLinearUnavailable(true);
          } else {
            setLinearIssues(linearData.issues || []);
            setLinearUnavailable(false);
          }
        }
        setActionableLoading(false);
        setNow(Date.now());
      })
      .catch(() => {
        setActionableError("Failed to load");
        setActionableLoading(false);
      });
  }, []);

  // Fetch data when selected user changes
  useEffect(() => {
    if (!selectedUser) return;
    fetchUserData(selectedUser.githubUsername);
  }, [selectedUser, fetchUserData]);

  // Update `now` every minute so meetings transition to completed in real-time
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle user selection
  const handleUserSelect = (user: DashboardUser) => {
    // Reset loading states before switching
    setPrLoading(true);
    setActionableLoading(true);
    setActionableError(null);
    setLinearUnavailable(false);

    setSelectedUser(user);
    localStorage.setItem("selectedUserId", user.githubUsername);
    loadDailyPlanFromStorage(user.githubUsername);
    loadItemOrderFromStorage(user.githubUsername);
  };

  const actionableItems = combineActionableItems(actionablePRs, linearIssues);
  const activeItems = actionableItems.filter((i) => !i.isDraft && !i.isInReview && !i.isBlocked && !i.isStale);
  const draftItems = actionableItems.filter((i) => i.isDraft);
  const inReviewItems = actionableItems.filter((i) => i.isInReview);
  const blockedItems = actionableItems.filter((i) => !i.isStale && i.isBlocked);
  const staleItems = actionableItems.filter((i) => i.isStale && !i.isDraft && !i.isInReview);

  // Calculate total hours of selected calendar events
  const totalMeetingHours = calendarEvents
    .filter((e) => selectedEventIds.has(e.id))
    .reduce((sum, e) => sum + e.durationMinutes / 60, 0);

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const generateDailyPlan = (hours: number) => {
    if (activeItems.length === 0 || !selectedUser) return;

    // Filter out excluded items before sending to API
    const itemsToSend = activeItems.filter((item) => {
      const itemId = String(item.pr?.id || item.linearIssue?.id);
      return !excludedItemIds.has(itemId);
    });

    if (itemsToSend.length === 0) {
      // All items excluded, nothing to generate
      return;
    }

    // Subtract meeting hours from available focus time
    const availableHours = Math.max(0.5, hours - totalMeetingHours);

    // Convert custom hours map to object for API
    const customHoursObj: Record<string, number> = {};
    customHourEstimates.forEach((hours, itemId) => {
      customHoursObj[itemId] = hours;
    });

    setDailyPlanLoading(true);
    setShowHoursPrompt(false);
    fetch("/api/daily-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: itemsToSend,
        maxHours: availableHours,
        customHours: customHoursObj,
        itemOrder: itemOrder,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          const newLastRun = new Date();

          // Sort results using custom item order within each category
          // Categories are based on sortPriority: 100s=urgent, 200s=PRs, 300s=in progress, 400s=backlog
          const sortedItems = [...(data.items || [])].sort((a: DailyPlanItem, b: DailyPlanItem) => {
            const aCategory = getCategoryKey(a);
            const bCategory = getCategoryKey(b);

            // First, sort by category order
            const aCatIndex = CATEGORY_ORDER.indexOf(aCategory);
            const bCatIndex = CATEGORY_ORDER.indexOf(bCategory);
            if (aCatIndex !== bCatIndex) {
              return aCatIndex - bCatIndex;
            }

            // Within same category, use custom order if available
            const aId = String(a.pr?.id || a.linearIssue?.id);
            const bId = String(b.pr?.id || b.linearIssue?.id);
            const categoryItemOrder = itemOrder[aCategory] || [];
            const aOrderIndex = categoryItemOrder.indexOf(aId);
            const bOrderIndex = categoryItemOrder.indexOf(bId);

            // Items with custom order come before those without
            if (aOrderIndex !== -1 && bOrderIndex !== -1) {
              return aOrderIndex - bOrderIndex;
            }
            if (aOrderIndex !== -1) return -1;
            if (bOrderIndex !== -1) return 1;

            // Fall back to original sortPriority
            return (a.sortPriority || 999) - (b.sortPriority || 999);
          });

          setDailyPlanItems(sortedItems);
          setDailyPlanTotal(data.totalHours || 0);
          setDailyPlanMaxHours(data.maxHours || availableHours);
          setDailyPlanLastRun(newLastRun);
          // Persist to user-specific localStorage (including selected meetings)
          const selectedMeetings = calendarEvents
            .filter((e) => selectedEventIds.has(e.id))
            .map((e) => ({ ...e }));
          localStorage.setItem(
            getDailyPlanKey(selectedUser.githubUsername),
            JSON.stringify({
              items: sortedItems,
              totalHours: data.totalHours || 0,
              maxHours: data.maxHours || availableHours,
              lastRun: newLastRun.toISOString(),
              meetings: selectedMeetings,
            })
          );
        }
        setDailyPlanLoading(false);
      })
      .catch(() => setDailyPlanLoading(false));
  };

  const fetchCalendarEvents = () => {
    if (!selectedUser) return;

    setCalendarLoading(true);
    fetch(`/api/calendar/events?userId=${selectedUser.githubUsername}`)
      .then((res) => res.json())
      .then((data) => {
        const events = data.events || [];
        setCalendarEvents(events);
        // Pre-select non-all-day events that user accepted (or no response status = own event)
        const defaultSelected = new Set<string>(
          events
            .filter(
              (e: CalendarEvent) =>
                !e.isAllDay && (e.responseStatus === "accepted" || !e.responseStatus)
            )
            .map((e: CalendarEvent) => e.id)
        );
        setSelectedEventIds(defaultSelected);
        setCalendarLoading(false);
      })
      .catch(() => {
        setCalendarEvents([]);
        setCalendarLoading(false);
      });
  };

  const handleGenerateClick = () => {
    // Fetch calendar events when opening the modal
    fetchCalendarEvents();
    if (dailyPlanLastRun && isSameDay(dailyPlanLastRun, new Date())) {
      setShowRefreshConfirm(true);
    } else {
      setShowHoursPrompt(true);
    }
  };

  const confirmRefresh = () => {
    setShowRefreshConfirm(false);
    setShowHoursPrompt(true);
  };

  const toggleCalendarEvent = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  // Toggle exclude state for an item (excludes from generation)
  const toggleExcludeItem = (itemId: string) => {
    setExcludedItemIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Set custom hour estimate for an item (empty to use AI estimate)
  const setCustomHours = (itemId: string, hours: number | null) => {
    setCustomHourEstimates((prev) => {
      const newMap = new Map(prev);
      if (hours === null || hours <= 0) {
        newMap.delete(itemId);
      } else {
        newMap.set(itemId, hours);
      }
      return newMap;
    });
  };

  // Update item order and save to localStorage
  const handleItemOrderChange = useCallback((newOrder: Record<string, string[]>) => {
    setItemOrder(newOrder);
    if (selectedUser) {
      saveItemOrderToStorage(selectedUser.githubUsername, newOrder);
    }
  }, [selectedUser, saveItemOrderToStorage]);

  const handleHoursConfirm = () => {
    generateDailyPlan(selectedHours);
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {usersLoading || !selectedUser ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
                  <div className="h-3 w-16 bg-slate-800 rounded animate-pulse" />
                </div>
              </div>
            ) : (
              <UserSelector
                users={users}
                selectedUser={selectedUser}
                onSelect={handleUserSelect}
              />
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
          ) : activeItems.length === 0 && !linearUnavailable ? (
            <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
              <p className="text-emerald-400 font-medium">All caught up!</p>
              <p className="text-slate-500 text-sm mt-1">Nothing needs your attention right now.</p>
            </div>
          ) : activeItems.length === 0 && linearUnavailable ? (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-center">
              <p className="text-slate-400 font-medium">No GitHub PRs requiring action</p>
              <p className="text-slate-500 text-sm mt-1">Linear data is only available for the configured Linear user.</p>
            </div>
          ) : (
            <>
              <TodaysDashSection
                items={dailyPlanItems}
                totalHours={dailyPlanTotal}
                maxHours={dailyPlanMaxHours}
                loading={dailyPlanLoading}
                lastRun={dailyPlanLastRun}
                onGenerate={handleGenerateClick}
                now={now}
                showConfirm={showRefreshConfirm}
                onConfirm={confirmRefresh}
                onCancelConfirm={() => setShowRefreshConfirm(false)}
                disabled={activeItems.length === 0}
                showHoursPrompt={showHoursPrompt}
                selectedHours={selectedHours}
                onHoursChange={setSelectedHours}
                onHoursConfirm={handleHoursConfirm}
                onHoursCancel={() => setShowHoursPrompt(false)}
                activeItemIds={new Set(activeItems.map((i) => i.pr?.id || i.linearIssue?.id))}
                calendarEvents={calendarEvents}
                calendarLoading={calendarLoading}
                selectedEventIds={selectedEventIds}
                onToggleEvent={toggleCalendarEvent}
                totalMeetingHours={totalMeetingHours}
                activeItems={activeItems}
                excludedItemIds={excludedItemIds}
                onToggleExclude={toggleExcludeItem}
                customHourEstimates={customHourEstimates}
                onSetCustomHours={setCustomHours}
                itemOrder={itemOrder}
                onItemOrderChange={handleItemOrderChange}
              />
              {linearUnavailable && (
                <div className="mb-4 p-3 bg-slate-900/50 border border-slate-800 rounded-lg text-center">
                  <p className="text-slate-500 text-xs">Linear issues not shown - only available for the configured Linear user</p>
                </div>
              )}
              {(() => {
                // Filter out items already shown in Today's Dash
                const dailyPlanIds = new Set(
                  dailyPlanItems.map((item) => item.pr?.id || item.linearIssue?.id)
                );
                const remainingItems = activeItems.filter(
                  (item) => !dailyPlanIds.has(item.pr?.id || item.linearIssue?.id)
                );
                return remainingItems.length > 0 ? (
                  <div className="space-y-3">
                    {remainingItems.map((item) => (
                      <ActionableItemCard key={item.pr?.id || item.linearIssue?.id} item={item} now={now} />
                    ))}
                  </div>
                ) : null;
              })()}
            </>
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

        {/* In Review Section */}
        {!actionableLoading && !actionableError && inReviewItems.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-white">In Review</h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-violet-500/20 text-violet-400 rounded-full">
                {inReviewItems.length}
              </span>
            </div>
            <div className="space-y-3">
              {inReviewItems.map((item) => (
                <ActionableItemCard key={item.linearIssue?.id} item={item} now={now} />
              ))}
            </div>
          </section>
        )}

        {/* Blocked Section */}
        {!actionableLoading && !actionableError && blockedItems.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-white">Blocked</h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
                {blockedItems.length}
              </span>
            </div>
            <div className="space-y-3">
              {blockedItems.map((item) => (
                <ActionableItemCard key={item.linearIssue?.id} item={item} now={now} />
              ))}
            </div>
          </section>
        )}

        {/* Stale Section */}
        {!actionableLoading && !actionableError && staleItems.length > 0 && (
          <section>
            <button
              onClick={() => setShowAllStale(!showAllStale)}
              className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity"
            >
              <h2 className="text-xl font-semibold text-white">Stale</h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
                {staleItems.length}
              </span>
              <span className="text-slate-500 text-sm">
                {showAllStale ? "▼" : "▶"}
              </span>
            </button>
            {showAllStale && (
              <div className="space-y-3">
                {staleItems.map((item) => (
                  <ActionableItemCard key={item.pr?.id || item.linearIssue?.id} item={item} now={now} />
                ))}
              </div>
            )}
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

// Component for task selection with drag-and-drop reordering by category
function TaskSelectionWithDnd({
  activeItems,
  excludedItemIds,
  onToggleExclude,
  customHourEstimates,
  onSetCustomHours,
  itemOrder,
  onItemOrderChange,
}: {
  activeItems: ActionableItem[];
  excludedItemIds: Set<string>;
  onToggleExclude: (itemId: string) => void;
  customHourEstimates: Map<string, number>;
  onSetCustomHours: (itemId: string, hours: number | null) => void;
  itemOrder: Record<string, string[]>;
  onItemOrderChange: (order: Record<string, string[]>) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group items by category
  const categorizedItems = useMemo(() => {
    const groups: Record<CategoryKey, ActionableItem[]> = {
      "urgent": [],
      "pr": [],
      "inprogress-high": [],
      "inprogress-medium": [],
      "inprogress-low": [],
      "inprogress-none": [],
      "todo-high": [],
      "todo-medium": [],
      "todo-low": [],
      "todo-none": [],
    };

    for (const item of activeItems) {
      const category = getCategoryKey(item);
      groups[category].push(item);
    }

    // Sort each category by custom order if available, otherwise by sortPriority
    for (const category of CATEGORY_ORDER) {
      const categoryItems = groups[category];
      const order = itemOrder[category] || [];

      categoryItems.sort((a, b) => {
        const aId = String(a.pr?.id || a.linearIssue?.id);
        const bId = String(b.pr?.id || b.linearIssue?.id);
        const aIndex = order.indexOf(aId);
        const bIndex = order.indexOf(bId);

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return (a.sortPriority || 999) - (b.sortPriority || 999);
      });
    }

    return groups;
  }, [activeItems, itemOrder]);

  // Handle drag end - reorder within category
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find which category contains the active item
    let activeCategory: CategoryKey | null = null;
    for (const category of CATEGORY_ORDER) {
      const items = categorizedItems[category];
      if (items.some(item => String(item.pr?.id || item.linearIssue?.id) === active.id)) {
        activeCategory = category;
        break;
      }
    }

    if (!activeCategory) return;

    // Check if over item is in the same category
    const categoryItems = categorizedItems[activeCategory];
    const overInSameCategory = categoryItems.some(
      item => String(item.pr?.id || item.linearIssue?.id) === over.id
    );

    if (!overInSameCategory) return; // Don't allow cross-category drops

    // Get current order for this category
    const currentIds = categoryItems.map(item => String(item.pr?.id || item.linearIssue?.id));
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentIds, oldIndex, newIndex);

    onItemOrderChange({
      ...itemOrder,
      [activeCategory]: newOrder,
    });
  }, [categorizedItems, itemOrder, onItemOrderChange]);

  if (activeItems.length === 0) return null;

  // Get categories that have items
  const nonEmptyCategories = CATEGORY_ORDER.filter(
    category => categorizedItems[category].length > 0
  );

  return (
    <div className="mb-6 text-left">
      <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Tasks to Include</p>
      <p className="text-slate-500 text-xs mb-2">Drag to reorder within each category</p>
      <div className="max-h-[40vh] overflow-y-auto bg-slate-800/30 rounded-lg p-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {nonEmptyCategories.map((category) => {
            const items = categorizedItems[category];
            const itemIds = items.map(item => String(item.pr?.id || item.linearIssue?.id));

            return (
              <div key={category} className="mb-3 last:mb-0">
                <p className="text-slate-500 text-xs font-medium mb-1 px-1">{CATEGORY_LABELS[category]}</p>
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <SortableTaskItem
                        key={String(item.pr?.id || item.linearIssue?.id)}
                        item={item}
                        isExcluded={excludedItemIds.has(String(item.pr?.id || item.linearIssue?.id))}
                        onToggleExclude={onToggleExclude}
                        customHours={customHourEstimates.get(String(item.pr?.id || item.linearIssue?.id))}
                        onSetCustomHours={onSetCustomHours}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </DndContext>
      </div>
      {(excludedItemIds.size > 0 || customHourEstimates.size > 0) && (
        <div className="mt-2 pt-2 border-t border-slate-800 flex justify-end gap-4 text-xs">
          {customHourEstimates.size > 0 && (
            <span className="text-blue-400">{customHourEstimates.size} custom hrs</span>
          )}
          <span className="text-red-400">{excludedItemIds.size} excluded</span>
        </div>
      )}
    </div>
  );
}

// Sortable item component for drag-and-drop reordering
function SortableTaskItem({
  item,
  isExcluded,
  onToggleExclude,
  customHours,
  onSetCustomHours,
}: {
  item: ActionableItem;
  isExcluded: boolean;
  onToggleExclude: (itemId: string) => void;
  customHours: number | undefined;
  onSetCustomHours: (itemId: string, hours: number | null) => void;
}) {
  const itemId = String(item.pr?.id || item.linearIssue?.id);
  const title = item.linearIssue?.title || item.pr?.title || "";
  const identifier = item.linearIssue?.identifier || (item.pr ? `#${item.pr.number}` : "");
  const priorityLabel = item.linearIssue?.priorityLabel;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded ${isExcluded ? "opacity-40" : ""} ${isDragging ? "bg-slate-700/50 shadow-lg z-10" : "hover:bg-slate-800/50"}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 hover:bg-slate-700"
        title="Drag to reorder"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </button>
      <button
        onClick={() => onToggleExclude(itemId)}
        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
          isExcluded
            ? "bg-red-500/30 text-red-400"
            : "bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300"
        }`}
        title={isExcluded ? "Include" : "Exclude"}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <span className={`text-xs flex-1 truncate ${isExcluded ? "text-slate-500 line-through" : "text-slate-300"}`}>
        {title}
      </span>
      {identifier && (
        <span className="text-xs text-slate-500 flex-shrink-0">{identifier}</span>
      )}
      {priorityLabel && (
        <span className={`px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${
          priorityLabel === "Urgent" ? "bg-red-500/20 text-red-400" :
          priorityLabel === "High" ? "bg-orange-500/20 text-orange-400" :
          priorityLabel === "Medium" ? "bg-yellow-500/20 text-yellow-400" :
          "bg-slate-700 text-slate-400"
        }`}>
          {priorityLabel}
        </span>
      )}
      <input
        type="number"
        min="0.5"
        max="8"
        step="0.5"
        placeholder="hrs"
        value={customHours || ""}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onSetCustomHours(itemId, isNaN(val) ? null : val);
        }}
        className="w-12 px-1.5 py-0.5 text-xs text-center bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 flex-shrink-0"
        title="Custom hours (leave empty for AI estimate)"
      />
    </div>
  );
}

function TodaysDashSection({
  items,
  totalHours,
  maxHours,
  loading,
  lastRun,
  onGenerate,
  now,
  showConfirm,
  onConfirm,
  onCancelConfirm,
  disabled,
  showHoursPrompt,
  selectedHours,
  onHoursChange,
  onHoursConfirm,
  onHoursCancel,
  activeItemIds,
  calendarEvents,
  calendarLoading,
  selectedEventIds,
  onToggleEvent,
  totalMeetingHours,
  activeItems,
  excludedItemIds,
  onToggleExclude,
  customHourEstimates,
  onSetCustomHours,
  itemOrder,
  onItemOrderChange,
}: {
  items: DailyPlanItem[];
  totalHours: number;
  maxHours: number;
  loading: boolean;
  lastRun: Date | null;
  onGenerate: () => void;
  now: number;
  showConfirm: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  disabled: boolean;
  showHoursPrompt: boolean;
  selectedHours: number;
  onHoursChange: (hours: number) => void;
  onHoursConfirm: () => void;
  onHoursCancel: () => void;
  activeItemIds: Set<number | string | undefined>;
  calendarEvents: CalendarEvent[];
  calendarLoading: boolean;
  selectedEventIds: Set<string>;
  onToggleEvent: (eventId: string) => void;
  totalMeetingHours: number;
  activeItems: ActionableItem[];
  excludedItemIds: Set<string>;
  onToggleExclude: (itemId: string) => void;
  customHourEstimates: Map<string, number>;
  onSetCustomHours: (itemId: string, hours: number | null) => void;
  itemOrder: Record<string, string[]>;
  onItemOrderChange: (order: Record<string, string[]>) => void;
}) {
  const formatLastRun = (date: Date) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "pm" : "am";
    const h = hours % 12 || 12;
    const m = minutes.toString().padStart(2, "0");
    return `${month} ${day}, ${h}:${m}${ampm}`;
  };

  return (
    <div className="relative border border-slate-700 rounded-xl p-4 mb-6">
      <span className="absolute -top-2.5 left-3 px-2 bg-slate-950 text-xs font-medium text-slate-400 uppercase tracking-wide">
        Today&apos;s Dash
      </span>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="absolute inset-0 bg-slate-950/90 rounded-xl flex items-center justify-center z-10">
          <div className="text-center p-4">
            <p className="text-white text-sm mb-3">Already generated today. Refresh?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={onCancelConfirm}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="px-3 py-1.5 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hours Prompt Modal - Full screen overlay */}
      {showHoursPrompt && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <h2 className="text-white text-lg font-semibold mb-4 text-center">Plan Your Day</h2>
            <p className="text-slate-400 text-sm mb-4 text-center">How many hours of focused work today?</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <input
                type="number"
                min="1"
                max="12"
                value={selectedHours}
                onChange={(e) => onHoursChange(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                className="w-16 px-2 py-1.5 text-center text-sm bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-slate-500"
              />
              <span className="text-slate-400 text-sm">hours</span>
            </div>

            {/* Calendar Events Section */}
            {calendarLoading ? (
              <div className="mb-6">
                <div className="h-4 w-32 bg-slate-800 rounded animate-pulse mx-auto" />
              </div>
            ) : calendarEvents.length > 0 && (
              <div className="mb-6 text-left">
                <p className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wide">Meetings</p>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-800/30 rounded-lg p-2">
                  {calendarEvents.filter((e) => !e.isAllDay).map((event) => {
                    const startTime = new Date(event.start);
                    const endTime = new Date(event.end);
                    const timeStr = `${startTime.getHours()}:${startTime.getMinutes().toString().padStart(2, "0")}-${endTime.getHours()}:${endTime.getMinutes().toString().padStart(2, "0")}`;
                    const durationHours = (event.durationMinutes / 60).toFixed(1);
                    return (
                      <label
                        key={event.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-slate-800/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEventIds.has(event.id)}
                          onChange={() => onToggleEvent(event.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="text-slate-500 text-xs font-mono">{timeStr}</span>
                        <span className="text-slate-300 text-xs flex-1 truncate">{event.summary}</span>
                        <span className="text-slate-500 text-xs">{durationHours}h</span>
                      </label>
                    );
                  })}
                </div>
                {totalMeetingHours > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-xs">
                    <span className="text-slate-500">Meetings: {totalMeetingHours.toFixed(1)}h</span>
                    <span className="text-slate-400">Available: <span className="text-white">{Math.max(0, selectedHours - totalMeetingHours).toFixed(1)}h</span></span>
                  </div>
                )}
              </div>
            )}

            {/* Item Selection Section with Drag-and-Drop */}
            <TaskSelectionWithDnd
              activeItems={activeItems}
              excludedItemIds={excludedItemIds}
              onToggleExclude={onToggleExclude}
              customHourEstimates={customHourEstimates}
              onSetCustomHours={onSetCustomHours}
              itemOrder={itemOrder}
              onItemOrderChange={onItemOrderChange}
            />

            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={onHoursCancel}
                className="px-5 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onHoursConfirm}
                className="px-5 py-2.5 text-sm bg-blue-600 text-white hover:bg-blue-500 rounded-lg transition-colors font-medium"
              >
                Generate Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 mt-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-900 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-2 py-6 text-center">
          <p className="text-slate-500 text-sm mb-3">Scope your day with AI-estimated effort</p>
          <button
            onClick={onGenerate}
            disabled={disabled}
            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Today&apos;s Dash
          </button>
        </div>
      ) : (
        <>
          {/* Calendar Events */}
          {calendarEvents.filter((e) => !e.isAllDay && selectedEventIds.has(e.id)).length > 0 && (
            <div className="space-y-2 mt-2 mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Meetings</p>
              {calendarEvents
                .filter((e) => !e.isAllDay && selectedEventIds.has(e.id))
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                .map((event) => {
                  const startTime = new Date(event.start);
                  const endTime = new Date(event.end);
                  const isPast = endTime.getTime() < now;
                  const timeStr = `${startTime.getHours()}:${startTime.getMinutes().toString().padStart(2, "0")}-${endTime.getHours()}:${endTime.getMinutes().toString().padStart(2, "0")}`;
                  const durationHours = (event.durationMinutes / 60).toFixed(1);
                  return (
                    <div
                      key={event.id}
                      className={`flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800 ${isPast ? "opacity-50" : ""}`}
                    >
                      {isPast ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isPast ? "text-slate-400 line-through" : "text-white"}`}>{event.summary}</p>
                        <p className="text-xs text-slate-500">{timeStr}</p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded ${isPast ? "bg-slate-700 text-slate-400" : "bg-amber-500/20 text-amber-400"}`}>
                        {durationHours}h
                      </span>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Tasks */}
          {items.length > 0 && (
            <div className="space-y-2">
              {calendarEvents.filter((e) => !e.isAllDay && selectedEventIds.has(e.id)).length > 0 && (
                <p className="text-xs text-slate-500 uppercase tracking-wide">Tasks</p>
              )}
              <div className="space-y-3">
                {items.map((item) => {
                  const itemId = item.pr?.id || item.linearIssue?.id;
                  const isComplete = !activeItemIds.has(itemId);
                  return (
                    <DailyPlanItemCard key={itemId} item={item} now={now} isComplete={isComplete} />
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {lastRun && (
                <span className="text-xs text-slate-500">
                  Generated at {formatLastRun(lastRun)}
                </span>
              )}
              <button
                onClick={onGenerate}
                disabled={loading}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
            <span className="text-sm text-slate-400">
              {totalMeetingHours > 0 && (
                <span className="mr-3">Meetings: <span className="text-amber-400">{totalMeetingHours.toFixed(1)}h</span></span>
              )}
              Tasks: <span className={`font-medium ${totalHours > maxHours ? "text-amber-400" : "text-white"}`}>{totalHours}h</span>
              {maxHours > 0 && <span className="text-slate-500">/{maxHours}h</span>}
              {totalHours > maxHours && (
                <span className="ml-2 text-xs text-amber-400">(+{(totalHours - maxHours).toFixed(1)}h over)</span>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function CompleteCheckmark() {
  return (
    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0" title="Done">
      <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

function DailyPlanItemCard({ item, now, isComplete }: { item: DailyPlanItem; now: number; isComplete: boolean }) {
  const isOverflow = item.isOverflow;

  if (item.type === "linear" && item.linearIssue) {
    const priorityStyles: Record<number, string> = {
      1: "bg-red-500/20 text-red-400",
      2: "bg-orange-500/20 text-orange-400",
      3: "bg-yellow-500/20 text-yellow-400",
      4: "bg-blue-500/20 text-blue-400",
    };

    return (
      <div className={`flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg ${isComplete ? "opacity-60" : ""}`}>
        <div className="w-8 h-8 rounded-md bg-violet-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-violet-400 text-xs font-bold">
            {item.linearIssue.identifier.split("-")[0]?.slice(0, 2) || "LN"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={item.linearIssue.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-medium hover:text-blue-400 transition-colors truncate block ${isComplete ? "text-slate-400 line-through" : "text-white"}`}
          >
            {item.linearIssue.title}
          </a>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-1.5 py-0.5 text-xs rounded ${priorityStyles[item.linearIssue.priority] || "bg-slate-700 text-slate-400"}`}>
              {item.linearIssue.priorityLabel || "No Priority"}
            </span>
            <span className="text-xs text-slate-500">{item.linearIssue.identifier}</span>
          </div>
        </div>
        {isComplete ? (
          <CompleteCheckmark />
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOverflow && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded" title="Exceeds time budget">
                overflow
              </span>
            )}
            <div className="relative group">
              <div className="px-2 py-1 bg-slate-800 rounded text-xs font-medium text-slate-300 cursor-help">
                {item.hours}h
              </div>
              <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-slate-700 text-xs text-slate-200 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                {item.reasoning}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if ((item.type === "pr" || item.type === "pr_with_linear") && item.pr) {
    const createdAt = new Date(item.pr.created_at);
    const daysAgo = Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return (
      <div className={`flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg ${isComplete ? "opacity-60" : ""}`}>
        <img src={item.pr.user.avatar_url} alt={item.pr.user.login} className="w-8 h-8 rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <a
            href={item.pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-medium hover:text-blue-400 transition-colors truncate block ${isComplete ? "text-slate-400 line-through" : "text-white"}`}
          >
            {item.pr.title}
          </a>
          <div className="flex items-center gap-2 mt-1">
            {item.prReasonLabel && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded">
                {item.prReasonLabel}
              </span>
            )}
            {item.linearIssue && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-violet-500/20 text-violet-400 rounded">
                {item.linearIssue.identifier}
              </span>
            )}
            <span className="text-xs text-slate-500">
              #{item.pr.number} · {daysAgo === 0 ? "today" : `${daysAgo}d`}
            </span>
          </div>
        </div>
        {isComplete ? (
          <CompleteCheckmark />
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOverflow && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded" title="Exceeds time budget">
                overflow
              </span>
            )}
            <div className="relative group">
              <div className="px-2 py-1 bg-slate-800 rounded text-xs font-medium text-slate-300 cursor-help">
                {item.hours}h
              </div>
              <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-slate-700 text-xs text-slate-200 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                {item.reasoning}
              </div>
            </div>
          </div>
        )}
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

  // Use actual state name, fallback to type-based label
  const stateLabel = issue.state.name || (issue.state.type === "started" ? "In Progress" : "To Do");

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
  const supabase = createClient();
  const isDevMode = !supabase;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!isDevMode);

  useEffect(() => {
    if (!supabase) return;

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
  }, [supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Dev mode: render dashboard without auth
  if (isDevMode) {
    return <Dashboard />;
  }

  if (!user) {
    return <MagicLinkForm />;
  }

  return <Dashboard />;
}
