import { NextRequest, NextResponse } from "next/server";
import { fetchActionablePullRequests } from "@/lib/github/client";
import { fetchLinearIssues } from "@/lib/linear/client";
import { sendDailyDigest } from "@/lib/slack/notifications";

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
    // Fetch data in parallel (no email = uses viewer/authenticated user)
    const [prResult, linearResult] = await Promise.all([
      fetchActionablePullRequests(),
      fetchLinearIssues(),
    ]);

    if (prResult.error) {
      console.error("Failed to fetch actionable PRs:", prResult.error);
    }

    if (linearResult.error) {
      console.error("Failed to fetch Linear issues:", linearResult.error);
    }

    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL!;

    // Send daily digest
    const slackResult = await sendDailyDigest({
      actionablePRs: prResult.actionablePRs,
      linearIssues: linearResult.issues,
      dashboardUrl,
    });

    if (!slackResult.success) {
      console.error("Failed to send Slack notification:", slackResult.error);
    }

    return NextResponse.json({
      success: true,
      summary: {
        actionablePRs: prResult.actionablePRs.length,
        linearIssues: linearResult.issues.length,
        slackSent: slackResult.success,
        slackError: slackResult.error,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
