import { NextResponse } from "next/server";
import { estimateEffort, scopeToWorkday } from "@/lib/openai/client";

interface ActionableItemInput {
  type: "pr" | "linear" | "pr_with_linear";
  pr?: {
    id: number;
    number: number;
    title: string;
    html_url: string;
  };
  prRepository?: { owner: string; repo: string };
  prReasonLabel?: string;
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

    if (items.length === 0) {
      return NextResponse.json({ items: [], totalHours: 0 });
    }

    // Transform to format expected by estimateEffort
    const taskItems = items.map((item) => {
      // Use identifier (ENG-123) for Linear issues as it's more meaningful for the LLM
      const id =
        item.type === "linear"
          ? item.linearIssue?.identifier || ""
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
        title:
          item.type === "linear"
            ? item.linearIssue?.title || ""
            : item.pr?.title || "",
        description: truncate(item.linearIssue?.description, 500),
        repo: item.prRepository
          ? `${item.prRepository.owner}/${item.prRepository.repo}`
          : undefined,
        prNumber: item.pr?.number,
        linearIdentifier: item.linearIssue?.identifier,
        linearPriority: item.linearIssue?.priorityLabel,
        linearState: item.linearIssue?.state?.name,
        linearEstimate: item.linearIssue?.estimate,
        recentComments,
        reason: item.prReasonLabel,
      };
    });

    const estimated = await estimateEffort(taskItems);
    const { items: scopedItems, totalHours } = scopeToWorkday(estimated, 8);

    // Map back to include original item data with hours
    const result = scopedItems.map((estimated) => {
      const original = items.find((item) => {
        if (item.type === "linear") {
          return item.linearIssue?.identifier === estimated.id;
        }
        return `pr-${item.pr?.id}` === estimated.id;
      });

      return {
        ...original,
        hours: estimated.hours,
        reasoning: estimated.reasoning,
      };
    });

    return NextResponse.json({ items: result, totalHours });
  } catch (error) {
    console.error("Error in daily-plan:", error);
    return NextResponse.json(
      { error: "Failed to generate daily plan" },
      { status: 500 }
    );
  }
}
