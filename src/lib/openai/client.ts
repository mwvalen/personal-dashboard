interface TaskItem {
  id: string;
  type: "pr" | "linear" | "pr_with_linear";
  title: string;
  description?: string;
  repo?: string;
  prNumber?: number;
  prBody?: string;
  prAdditions?: number;
  prDeletions?: number;
  prChangedFiles?: number;
  prCommits?: number;
  prComments?: number;
  prReviewComments?: number;
  reviewCommentsContent?: Array<{ body?: string; user: string }>;
  linearIdentifier?: string;
  linearPriority?: string;
  linearState?: string;
  linearEstimate?: number;
  recentComments?: string;
  reason?: string;
}

interface EstimatedItem extends TaskItem {
  hours: number;
  reasoning: string;
}

export async function estimateEffort(items: TaskItem[]): Promise<EstimatedItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Return default estimates if no API key
    return items.map((item) => ({
      ...item,
      hours: getDefaultEstimate(item).hours,
      reasoning: getDefaultEstimate(item).reasoning,
    }));
  }

  const itemDescriptions = items
    .map((item) => {
      const parts: string[] = [];

      if (item.type === "pr" || item.type === "pr_with_linear") {
        parts.push(`ID: ${item.id}`);
        parts.push(`[PR] "${item.title}"`);
        parts.push(`Repo: ${item.repo}, Action needed: ${item.reason}`);
        // PR diff stats for complexity assessment
        if (item.prAdditions !== undefined || item.prDeletions !== undefined) {
          const additions = item.prAdditions ?? 0;
          const deletions = item.prDeletions ?? 0;
          const files = item.prChangedFiles ?? 0;
          const commits = item.prCommits ?? 0;
          parts.push(`Diff: +${additions} -${deletions} lines, ${files} files, ${commits} commits`);
        }
        if (item.prComments || item.prReviewComments) {
          parts.push(`Discussion: ${item.prComments ?? 0} comments, ${item.prReviewComments ?? 0} review comments`);
        }
        // Include actual review comment content for "Has Review Comments" PRs
        if (item.reviewCommentsContent && item.reviewCommentsContent.length > 0) {
          const commentsText = item.reviewCommentsContent
            .map(c => `  - ${c.user}: "${c.body}"`)
            .join("\n");
          parts.push(`Review comments to address:\n${commentsText}`);
        }
        if (item.prBody) {
          parts.push(`PR description: ${item.prBody}`);
        }
        if (item.linearIdentifier) {
          parts.push(`Linked Linear: ${item.linearIdentifier} (${item.linearPriority}, ${item.linearState})`);
          if (item.description) {
            parts.push(`Linear description: ${item.description}`);
          }
          if (item.linearEstimate) {
            parts.push(`Story points: ${item.linearEstimate}`);
          }
          if (item.recentComments) {
            parts.push(`Recent comments: ${item.recentComments}`);
          }
        }
      } else {
        parts.push(`ID: ${item.id}`);
        parts.push(`[Linear] "${item.title}" (${item.linearIdentifier})`);
        parts.push(`Priority: ${item.linearPriority}, State: ${item.linearState}`);
        if (item.linearEstimate) {
          parts.push(`Story points: ${item.linearEstimate}`);
        }
        if (item.description) {
          parts.push(`Description: ${item.description}`);
        }
        if (item.recentComments) {
          parts.push(`Recent comments: ${item.recentComments}`);
        }
      }

      return parts.join("\n");
    })
    .join("\n\n");

  const prompt = `You are estimating work effort for a software engineer's daily tasks.
Given these items with their descriptions and context, estimate hours for each.
Use only these values: 0.5, 1, 2, 4, or 8.

Guidelines for PR reviews (use diff stats as primary signal):
- Tiny (<100 lines, 1-3 files): 0.5h
- Small (100-400 lines, 3-8 files): 0.5h
- Medium (400-1000 lines, 8-15 files): 0.5h
- Large (1000-2000 lines, 15-30 files): 1h
- Very large (>2000 lines or >30 files): 2h
- Add time for: "Changes Requested" (re-review), complex domains
- Reduce time for: simple refactors, config changes, test-only changes, React components, styling

Guidelines for "Has Review Comments" PRs (responding to reviewer feedback):
- This is usually QUICK - just addressing feedback, not full review
- Read the actual review comments provided and estimate based on their complexity
- Simple comments (typos, naming, small tweaks): 0.5h total
- Medium comments (logic changes, refactors): 0.5-1h
- Complex comments (architectural changes, rethink approach): 1-2h
- Default to 0.5h unless comments clearly require significant work

Guidelines for Linear issues:
- If story points provided: 1pt=0.5h, 2pt=1h, 3pt=2h, 5pt=4h, 8pt=8h
- Bug fixes: 1-2h for clear issues, 2-4h for debugging needed
- New features: Consider scope from description, 2-8h typically
- "In Progress" items may need less time than "To Do" items

Use description and comments to gauge actual complexity.

Items:
${itemDescriptions}

Respond with ONLY a JSON array, no other text. Format: [{"id": "item_id", "hours": 2, "reasoning": "brief 5-10 word reason based on the task details"}, ...]
Use the IDs exactly as provided. Make reasoning specific to each task, referencing diff size or other concrete details.`;

  try {
    console.log("Sending to OpenAI, item count:", items.length);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return items.map((item) => {
        const est = getDefaultEstimate(item);
        return { ...item, hours: est.hours, reasoning: est.reasoning };
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    console.log("OpenAI response:", content);

    if (!content) {
      return items.map((item) => {
        const est = getDefaultEstimate(item);
        return { ...item, hours: est.hours, reasoning: est.reasoning };
      });
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.startsWith("```")) {
      jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }

    const estimates: { id: string; hours: number; reasoning: string }[] = JSON.parse(jsonStr);
    const estimateMap = new Map(estimates.map((e) => [e.id, { hours: e.hours, reasoning: e.reasoning }]));

    return items.map((item) => {
      const est = estimateMap.get(item.id);
      const fallback = getDefaultEstimate(item);
      return {
        ...item,
        hours: est?.hours ?? fallback.hours,
        reasoning: est?.reasoning ?? fallback.reasoning,
      };
    });
  } catch (error) {
    console.error("Error estimating effort:", error);
    return items.map((item) => {
      const est = getDefaultEstimate(item);
      return { ...item, hours: est.hours, reasoning: est.reasoning };
    });
  }
}

function getDefaultEstimate(item: TaskItem): { hours: number; reasoning: string } {
  // Heuristic defaults when OpenAI is unavailable
  if (item.type === "pr" || item.type === "pr_with_linear") {
    // Use diff stats if available
    const totalLines = (item.prAdditions ?? 0) + (item.prDeletions ?? 0);
    const files = item.prChangedFiles ?? 0;

    let hours = 1;
    let reasoning = "Standard PR review";

    if (totalLines > 0 || files > 0) {
      if (totalLines < 100 && files <= 3) {
        hours = 0.5;
        reasoning = `Tiny PR: ${totalLines} lines, ${files} files`;
      } else if (totalLines < 400 && files <= 8) {
        hours = 0.5;
        reasoning = `Small PR: ${totalLines} lines, ${files} files`;
      } else if (totalLines < 1000 && files <= 15) {
        hours = 0.5;
        reasoning = `Medium PR: ${totalLines} lines, ${files} files`;
      } else if (totalLines < 2000 && files <= 30) {
        hours = 1;
        reasoning = `Large PR: ${totalLines} lines, ${files} files`;
      } else {
        hours = 2;
        reasoning = `Very large PR: ${totalLines} lines, ${files} files`;
      }
    }

    // Adjust for action type
    if (item.reason?.includes("Has Review Comments")) {
      // Responding to review comments is usually quick
      return { hours: 0.5, reasoning: "Addressing review feedback" };
    }
    if (item.reason?.includes("Changes") || item.reason?.includes("Fix")) {
      hours = Math.min(hours + 0.5, 4);
      reasoning = `Changes requested - ${reasoning}`;
    }

    return { hours, reasoning };
  }
  // Linear issues
  if (item.linearPriority === "Urgent") return { hours: 4, reasoning: "Urgent priority task" };
  if (item.linearPriority === "High") return { hours: 2, reasoning: "High priority task" };
  if (item.linearPriority === "Medium") return { hours: 1, reasoning: "Medium priority task" };
  return { hours: 0.5, reasoning: "Low priority quick task" };
}

export function scopeToWorkday(
  items: EstimatedItem[],
  maxHours: number = 8
): { items: EstimatedItem[]; totalHours: number } {
  const selected: EstimatedItem[] = [];
  let totalHours = 0;

  for (const item of items) {
    if (totalHours + item.hours <= maxHours) {
      selected.push(item);
      totalHours += item.hours;
    } else if (totalHours === 0) {
      // Always include at least one item even if it exceeds maxHours
      selected.push(item);
      totalHours += item.hours;
      break;
    }
  }

  return { items: selected, totalHours };
}
