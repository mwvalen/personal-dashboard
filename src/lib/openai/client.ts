interface TaskItem {
  id: string;
  type: "pr" | "linear" | "pr_with_linear";
  title: string;
  description?: string;
  repo?: string;
  prNumber?: number;
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
        if (item.linearIdentifier) {
          parts.push(`Linked Linear: ${item.linearIdentifier} (${item.linearPriority}, ${item.linearState})`);
          if (item.description) {
            parts.push(`Description: ${item.description}`);
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

Guidelines:
- PR reviews: 0.5-1h for small, 1-2h for medium, 2-4h for large/complex
- Bug fixes: 1-2h for clear issues, 2-4h for debugging needed, 4-8h for complex
- New features: Consider scope from description, 2-8h typically
- If story points are provided, roughly: 1pt=1h, 2pt=2h, 3pt=4h, 5pt=8h
- "In Progress" items may need less time than "To Do" items
- Use description and comments to gauge actual complexity

Items:
${itemDescriptions}

Respond with ONLY a JSON array, no other text. Format: [{"id": "item_id", "hours": 2, "reasoning": "brief 5-10 word reason based on the task details"}, ...]
Use the IDs exactly as provided. Make reasoning specific to each task.`;

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
    if (item.reason?.includes("Review")) return { hours: 1, reasoning: "Standard PR review" };
    if (item.reason?.includes("Changes") || item.reason?.includes("Fix")) return { hours: 2, reasoning: "Code changes requested" };
    return { hours: 1, reasoning: "PR action needed" };
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
