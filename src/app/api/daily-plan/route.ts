import { NextResponse } from "next/server";
import { estimateEffort } from "@/lib/openai/client";

interface ActionableItemInput {
  type: "pr" | "linear" | "pr_with_linear";
  sortPriority: number;
  pr?: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    body?: string | null;
    additions?: number;
    deletions?: number;
    changed_files?: number;
    commits?: number;
    comments?: number;
    review_comments?: number;
  };
  prRepository?: { owner: string; repo: string };
  prReasonLabel?: string;
  prReviewComments?: Array<{ body: string; user: { login: string }; created_at: string }>;
  linearIssue?: {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    url: string;
    priorityLabel: string;
    estimate?: number;
    state: { name: string; type: string };
    comments?: {
      nodes: Array<{ body: string; createdAt: string }>;
    };
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items: ActionableItemInput[] = body.items || [];
    const maxHours: number = body.maxHours || 6;
    const customHours: Record<string, number> = body.customHours || {};
    const itemOrder: Record<string, string[]> = body.itemOrder || {};

    if (items.length === 0) {
      return NextResponse.json({ items: [], totalHours: 0 });
    }

    // Category definitions matching the frontend
    type CategoryKey = "urgent" | "pr" | "inprogress-high" | "inprogress-medium" | "inprogress-low" | "inprogress-none" | "todo-high" | "todo-medium" | "todo-low" | "todo-none";
    const CATEGORY_ORDER: CategoryKey[] = [
      "urgent", "pr", "inprogress-high", "inprogress-medium", "inprogress-low", "inprogress-none",
      "todo-high", "todo-medium", "todo-low", "todo-none"
    ];

    // Helper to get category from an item
    const getCategoryKey = (item: ActionableItemInput): CategoryKey => {
      const sortPriority = item.sortPriority || 999;
      const section = Math.floor(sortPriority / 100);
      const priority = item.linearIssue ?
        (item.linearIssue.priorityLabel === "Urgent" ? 1 :
         item.linearIssue.priorityLabel === "High" ? 2 :
         item.linearIssue.priorityLabel === "Medium" ? 3 :
         item.linearIssue.priorityLabel === "Low" ? 4 : 0) : 0;

      if (section === 1) return "urgent";
      if (section === 2) return "pr";
      if (section === 3) {
        if (priority === 1 || priority === 2) return "inprogress-high";
        if (priority === 3) return "inprogress-medium";
        if (priority === 4) return "inprogress-low";
        return "inprogress-none";
      }
      if (priority === 1 || priority === 2) return "todo-high";
      if (priority === 3) return "todo-medium";
      if (priority === 4) return "todo-low";
      return "todo-none";
    };

    // Helper to get item's unique ID (for matching with itemOrder)
    const getItemId = (item: ActionableItemInput): string => {
      return item.pr?.id ? String(item.pr.id) : item.linearIssue?.id || "";
    };

    // Sort items strictly by category order, then by custom itemOrder within category
    const sortedItems = [...items].sort((a, b) => {
      const aCategory = getCategoryKey(a);
      const bCategory = getCategoryKey(b);

      // First by category order
      const aCatIndex = CATEGORY_ORDER.indexOf(aCategory);
      const bCatIndex = CATEGORY_ORDER.indexOf(bCategory);
      if (aCatIndex !== bCatIndex) {
        return aCatIndex - bCatIndex;
      }

      // Within same category, use custom order if available
      const aId = getItemId(a);
      const bId = getItemId(b);
      const categoryOrder = itemOrder[aCategory] || [];
      const aOrderIndex = categoryOrder.indexOf(aId);
      const bOrderIndex = categoryOrder.indexOf(bId);

      if (aOrderIndex !== -1 && bOrderIndex !== -1) {
        return aOrderIndex - bOrderIndex;
      }
      if (aOrderIndex !== -1) return -1;
      if (bOrderIndex !== -1) return 1;

      // Fall back to original sortPriority
      return (a.sortPriority || 999) - (b.sortPriority || 999);
    });

    // Re-transform to match sorted order for estimation
    const sortedTaskItems = sortedItems.map((item) => {
      const hasLinear = item.type === "linear" || item.type === "pr_with_linear";
      const id = hasLinear && item.linearIssue?.identifier
        ? item.linearIssue.identifier
        : `pr-${item.pr?.id}`;

      const truncate = (str: string | undefined, max: number) =>
        str && str.length > max ? str.slice(0, max) + "..." : str;

      const recentComments = item.linearIssue?.comments?.nodes
        ?.slice(0, 3)
        .map((c) => truncate(c.body, 200))
        .join(" | ");

      return {
        id,
        type: item.type,
        title: hasLinear && item.linearIssue?.title
          ? item.linearIssue.title
          : item.pr?.title || "",
        description: truncate(item.linearIssue?.description, 500),
        repo: item.prRepository
          ? `${item.prRepository.owner}/${item.prRepository.repo}`
          : undefined,
        prNumber: item.pr?.number,
        prBody: truncate(item.pr?.body || undefined, 500),
        prAdditions: item.pr?.additions,
        prDeletions: item.pr?.deletions,
        prChangedFiles: item.pr?.changed_files,
        prCommits: item.pr?.commits,
        prComments: item.pr?.comments,
        prReviewComments: item.pr?.review_comments,
        reviewCommentsContent: item.prReviewComments?.slice(0, 10).map(c => ({
          body: truncate(c.body, 300),
          user: c.user.login,
        })),
        linearIdentifier: item.linearIssue?.identifier,
        linearPriority: item.linearIssue?.priorityLabel,
        linearState: item.linearIssue?.state?.name,
        linearEstimate: item.linearIssue?.estimate,
        recentComments,
        reason: item.prReasonLabel,
      };
    });

    // Estimate effort for all items
    const estimated = await estimateEffort(sortedTaskItems);

    // Apply custom hour overrides while preserving order
    const withCustomHours = estimated.map((item, index) => {
      const original = sortedItems[index];
      const itemId = getItemId(original);
      const customHourValue = customHours[itemId];

      if (customHourValue) {
        return {
          ...item,
          hours: customHourValue,
          reasoning: `Custom estimate: ${customHourValue}h`,
        };
      }
      return item;
    });

    // Include items in order until we hit limit, allow exactly 1 overflow item, then stop
    let runningTotal = 0;
    let cutoffIndex = withCustomHours.length; // Default: include all
    let overflowIndex: number | null = null;

    for (let i = 0; i < withCustomHours.length; i++) {
      const prevTotal = runningTotal;
      runningTotal += withCustomHours[i].hours;

      if (prevTotal >= maxHours) {
        // We already hit or exceeded the limit, stop here (don't include this item)
        cutoffIndex = i;
        break;
      }

      if (runningTotal > maxHours && overflowIndex === null) {
        // This is the first item that causes overflow - include it but mark it
        overflowIndex = i;
        // Continue to next iteration to set cutoffIndex properly
      }
    }

    // If we found an overflow item, cut off after it
    if (overflowIndex !== null) {
      cutoffIndex = overflowIndex + 1;
      runningTotal = 0;
      for (let i = 0; i < cutoffIndex; i++) {
        runningTotal += withCustomHours[i].hours;
      }
    }

    const totalHours = runningTotal;

    // Map only the included items, preserving exact order
    const result = withCustomHours.slice(0, cutoffIndex).map((estimated, index) => {
      const original = sortedItems[index];
      const isOverflow = overflowIndex !== null && index === overflowIndex;

      return {
        ...original,
        hours: estimated.hours,
        reasoning: estimated.reasoning,
        isOverflow,
      };
    });

    const sortedResult = result;

    return NextResponse.json({ items: sortedResult, totalHours, maxHours, isOverTime: totalHours > maxHours });
  } catch (error) {
    console.error("Error in daily-plan:", error);
    return NextResponse.json(
      { error: "Failed to generate daily plan" },
      { status: 500 }
    );
  }
}
