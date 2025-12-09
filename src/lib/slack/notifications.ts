import type { ActionablePR } from "@/types/github";

interface SlackTextBlock {
  type: "section" | "header" | "divider";
  text?: { type: "mrkdwn" | "plain_text"; text: string; emoji?: boolean };
  accessory?: {
    type: "button";
    text: { type: "plain_text"; text: string; emoji: boolean };
    url: string;
  };
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

function formatPRForSlack(pr: ActionablePR): SlackTextBlock {
  const emoji = getReasonEmoji(pr.reason);
  const repoName = `${pr.repository.owner}/${pr.repository.repo}`;

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        `${emoji} *<${pr.pr.html_url}|#${pr.pr.number}: ${pr.pr.title}>*\n` +
        `_${repoName}_ | ${pr.reasonLabel} | by @${pr.pr.user.login}`,
    },
    accessory: {
      type: "button",
      text: { type: "plain_text", text: "View PR", emoji: true },
      url: pr.pr.html_url,
    },
  };
}

export async function sendSlackNotification(
  newActionablePRs: ActionablePR[]
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return { success: false, error: "SLACK_WEBHOOK_URL not configured" };
  }

  if (newActionablePRs.length === 0) {
    return { success: true };
  }

  const headerText =
    newActionablePRs.length === 1
      ? "New PR Needs Your Attention"
      : `${newActionablePRs.length} PRs Need Your Attention`;

  const blocks: SlackTextBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    { type: "divider" },
    ...newActionablePRs.map(formatPRForSlack),
  ];

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
