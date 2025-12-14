import { NextResponse } from "next/server";
import { estimateEffort, scopeToWorkday } from "@/lib/openai/client";

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
    const prioritizedIds: string[] = body.prioritizedIds || [];

    if (items.length === 0) {
      return NextResponse.json({ items: [], totalHours: 0 });
    }

    // Build a map of item ID -> sortPriority for reliable sorting later
    const sortPriorityMap = new Map<string, number>();
    for (const item of items) {
      const hasLinear = item.type === "linear" || item.type === "pr_with_linear";
      const id = hasLinear && item.linearIssue?.identifier
        ? item.linearIssue.identifier
        : `pr-${item.pr?.id}`;
      sortPriorityMap.set(id, item.sortPriority);
    }

    // Transform to format expected by estimateEffort
    const taskItems = items.map((item) => {
      // Use identifier (ENG-123) for Linear issues as it's more meaningful for the LLM
      // For pr_with_linear, prefer Linear identifier since it has the linked context
      const hasLinear = item.type === "linear" || item.type === "pr_with_linear";
      const id = hasLinear && item.linearIssue?.identifier
        ? item.linearIssue.identifier
        : `pr-${item.pr?.id}`;

      // Truncate description to avoid token limits
      const truncate = (str: string | undefined, max: number) =>
        str && str.length > max ? str.slice(0, max) + "..." : str;

      // Get recent comments (last 3)
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
        // Include actual review comment content for "Has Review Comments" PRs
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

    const estimated = await estimateEffort(taskItems);

    // Apply custom hour overrides
    const withCustomHours = estimated.map((item) => {
      // Find the original item to get its ID for custom hours lookup
      const original = items.find((orig) => {
        const hasLinear = orig.type === "linear" || orig.type === "pr_with_linear";
        if (hasLinear && orig.linearIssue?.identifier) {
          return orig.linearIssue.identifier === item.id;
        }
        return `pr-${orig.pr?.id}` === item.id;
      });

      // Check for custom hours using both PR id and Linear id
      const prId = original?.pr?.id ? String(original.pr.id) : null;
      const linearId = original?.linearIssue?.id || null;
      const customHourValue = (prId && customHours[prId]) || (linearId && customHours[linearId]);

      if (customHourValue) {
        return {
          ...item,
          hours: customHourValue,
          reasoning: `Custom estimate: ${customHourValue}h`,
        };
      }
      return item;
    });

    // Sort for scoping: by section first, then prioritized within section
    // This ensures PRs are included before lower-priority Linear issues
    const prioritizedSet = new Set(prioritizedIds);
    const sortedForScoping = [...withCustomHours].sort((a, b) => {
      // Get sortPriority from map to determine section
      const aSortPriority = sortPriorityMap.get(a.id) ?? 999;
      const bSortPriority = sortPriorityMap.get(b.id) ?? 999;
      const aSection = Math.floor(aSortPriority / 100);
      const bSection = Math.floor(bSortPriority / 100);

      // First by section (urgent -> PRs -> in progress -> backlog)
      if (aSection !== bSection) {
        return aSection - bSection;
      }

      // Within same section, find original items to get prioritized status
      const aOriginal = items.find((orig) => {
        const hasLinear = orig.type === "linear" || orig.type === "pr_with_linear";
        if (hasLinear && orig.linearIssue?.identifier) {
          return orig.linearIssue.identifier === a.id;
        }
        return `pr-${orig.pr?.id}` === a.id;
      });
      const bOriginal = items.find((orig) => {
        const hasLinear = orig.type === "linear" || orig.type === "pr_with_linear";
        if (hasLinear && orig.linearIssue?.identifier) {
          return orig.linearIssue.identifier === b.id;
        }
        return `pr-${orig.pr?.id}` === b.id;
      });

      const aId = aOriginal?.pr?.id ? String(aOriginal.pr.id) : aOriginal?.linearIssue?.id || "";
      const bId = bOriginal?.pr?.id ? String(bOriginal.pr.id) : bOriginal?.linearIssue?.id || "";

      const aPrioritized = prioritizedSet.has(aId);
      const bPrioritized = prioritizedSet.has(bId);

      // Within same section, prioritized items first
      if (aPrioritized && !bPrioritized) return -1;
      if (!aPrioritized && bPrioritized) return 1;

      // Then by sortPriority within section
      return aSortPriority - bSortPriority;
    });

    // Build a set of prioritized IDs using the task item IDs (Linear identifier or pr-{id})
    const prioritizedTaskIds = new Set<string>();
    for (const item of sortedForScoping) {
      const original = items.find((orig) => {
        const hasLinear = orig.type === "linear" || orig.type === "pr_with_linear";
        if (hasLinear && orig.linearIssue?.identifier) {
          return orig.linearIssue.identifier === item.id;
        }
        return `pr-${orig.pr?.id}` === item.id;
      });
      const origId = original?.pr?.id ? String(original.pr.id) : original?.linearIssue?.id || "";
      if (prioritizedSet.has(origId)) {
        prioritizedTaskIds.add(item.id);
      }
    }

    const { items: scopedItems, totalHours, overflowAt } = scopeToWorkday(sortedForScoping, maxHours, prioritizedTaskIds);

    // Map back to include original item data with hours
    // Calculate overflow based on original scoping order, mark items BEFORE sorting
    const overflowItemIds = new Set<string>();
    if (overflowAt !== null) {
      for (let i = overflowAt; i < scopedItems.length; i++) {
        overflowItemIds.add(scopedItems[i].id);
      }
    }

    const result = scopedItems.map((estimated) => {
      const original = items.find((item) => {
        const hasLinear = item.type === "linear" || item.type === "pr_with_linear";
        if (hasLinear && item.linearIssue?.identifier) {
          return item.linearIssue.identifier === estimated.id;
        }
        return `pr-${item.pr?.id}` === estimated.id;
      });

      // Get sortPriority from map using the estimated.id (which matches map keys)
      const sortPriority = sortPriorityMap.get(estimated.id) ?? 999;

      return {
        ...original,
        sortPriority, // Explicitly set from map to ensure it's never lost
        _taskId: estimated.id, // Store task ID for reliable sorting
        hours: estimated.hours,
        reasoning: estimated.reasoning,
        isOverflow: overflowItemIds.has(estimated.id),
      };
    });

    // Sort by section first, then by prioritized within section
    // Sections: 100s=urgent, 200s=PRs, 300s=in progress, 400s=backlog
    const sortedResult = result.sort((a, b) => {
      // sortPriority is now directly on items from the map
      const aSection = Math.floor(a.sortPriority / 100);
      const bSection = Math.floor(b.sortPriority / 100);

      // First by section (urgent -> PRs -> in progress -> backlog)
      if (aSection !== bSection) {
        return aSection - bSection;
      }

      // Within same section, prioritized items first
      const aId = a.pr?.id ? String(a.pr.id) : a.linearIssue?.id || "";
      const bId = b.pr?.id ? String(b.pr.id) : b.linearIssue?.id || "";
      const aPrioritized = prioritizedSet.has(aId);
      const bPrioritized = prioritizedSet.has(bId);
      if (aPrioritized && !bPrioritized) return -1;
      if (!aPrioritized && bPrioritized) return 1;

      // Then by original sortPriority within section
      return a.sortPriority - b.sortPriority;
    });

    return NextResponse.json({ items: sortedResult, totalHours, maxHours, isOverTime: totalHours > maxHours });
  } catch (error) {
    console.error("Error in daily-plan:", error);
    return NextResponse.json(
      { error: "Failed to generate daily plan" },
      { status: 500 }
    );
  }
}
