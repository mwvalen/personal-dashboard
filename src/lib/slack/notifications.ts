import type { ActionablePR } from "@/types/github";
import type { LinearIssue } from "@/types/linear";

interface SlackBlock {
  type: "section" | "header" | "divider" | "context" | "actions";
  text?: { type: "mrkdwn" | "plain_text"; text: string; emoji?: boolean };
  elements?: Array<{
    type: "mrkdwn" | "button";
    text?: string | { type: "plain_text"; text: string; emoji?: boolean };
    url?: string;
  }>;
}

function getReasonEmoji(reason: string): string {
  const emojiMap: Record<string, string> = {
    review_ready: ":eyes:",
    review_ongoing: ":hourglass_flowing_sand:",
    qa_needed: ":test_tube:",
    fixes_needed: ":wrench:",
    changes_requested: ":memo:",
    has_comments: ":speech_balloon:",
  };
  return emojiMap[reason] || ":bell:";
}

interface DailyDigestParams {
  actionablePRs: ActionablePR[];
  linearIssues: LinearIssue[];
  dashboardUrl: string;
}

export async function sendDailyDigest({
  actionablePRs,
  linearIssues,
  dashboardUrl,
}: DailyDigestParams): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return { success: false, error: "SLACK_WEBHOOK_URL not configured" };
  }

  // Categorize Linear issues
  const inProgress = linearIssues.filter((i) => i.state.type === "started");
  const toDo = linearIssues.filter((i) => i.state.type === "unstarted");

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Daily Status Report", emoji: true },
    },
    { type: "divider" },
  ];

  // PRs Section
  if (actionablePRs.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:git-pull-request: PRs Needing Action: ${actionablePRs.length}*`,
      },
    });

    // List each PR
    const prLines = actionablePRs.map((pr) => {
      const emoji = getReasonEmoji(pr.reason);
      return `${emoji} <${pr.pr.html_url}|#${pr.pr.number}: ${pr.pr.title}> — _${pr.reasonLabel}_`;
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: prLines.join("\n"),
      },
    });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*:git-pull-request: PRs Needing Action: 0* :white_check_mark:",
      },
    });
  }

  blocks.push({ type: "divider" });

  // Linear Section
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*:linear: Linear Issues: ${linearIssues.length} total*\n• In Progress: ${inProgress.length}\n• To Do: ${toDo.length}`,
    },
  });

  blocks.push({ type: "divider" });

  // Dashboard Link
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View Dashboard", emoji: true },
        url: dashboardUrl,
      },
    ],
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Slack API error: ${response.status} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send Slack notification",
    };
  }
}
