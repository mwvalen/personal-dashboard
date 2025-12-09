import { NextRequest, NextResponse } from "next/server";
import { fetchActionablePullRequests } from "@/lib/github/client";
import {
  syncActionablePRStates,
  markAsNotified,
} from "@/lib/github/pr-state-tracker";
import { sendSlackNotification } from "@/lib/slack/notifications";

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn("Unauthorized cron request attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch current actionable PRs from GitHub
    const { actionablePRs, error: fetchError } =
      await fetchActionablePullRequests();

    if (fetchError) {
      console.error("Failed to fetch actionable PRs:", fetchError);
      return NextResponse.json(
        { error: fetchError, processed: false },
        { status: 500 }
      );
    }

    // Sync with database and detect new items
    const { newPRs, removedCount, updatedCount } =
      await syncActionablePRStates(actionablePRs);

    // Send Slack notification for new actionable items
    let slackResult: { success: boolean; error?: string } = { success: true };
    if (newPRs.length > 0) {
      slackResult = await sendSlackNotification(newPRs);

      if (slackResult.success) {
        await markAsNotified(
          newPRs.map((pr) => pr.pr.id),
          newPRs.map((pr) => pr.reason)
        );
      } else {
        console.error("Failed to send Slack notification:", slackResult.error);
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalActionable: actionablePRs.length,
        newItems: newPRs.length,
        removedItems: removedCount,
        updatedItems: updatedCount,
        slackNotificationSent: slackResult.success && newPRs.length > 0,
        slackError: slackResult.error,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        processed: false,
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
