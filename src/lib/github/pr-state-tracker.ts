import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionablePR } from "@/types/github";

interface StoredPRState {
  id: string;
  pr_id: number;
  pr_number: number;
  repo_owner: string;
  repo_name: string;
  reason: string;
  reason_label: string;
  pr_title: string;
  pr_url: string;
  pr_author: string;
  first_seen_at: string;
  last_seen_at: string;
  notified_at: string | null;
}

interface SyncResult {
  newPRs: ActionablePR[];
  removedCount: number;
  updatedCount: number;
}

export async function syncActionablePRStates(
  currentPRs: ActionablePR[]
): Promise<SyncResult> {
  const supabase = createAdminClient();

  // Fetch all current stored states
  const { data: storedStates, error: fetchError } = await supabase
    .from("actionable_pr_states")
    .select("*");

  if (fetchError) {
    throw new Error(`Failed to fetch stored states: ${fetchError.message}`);
  }

  const storedMap = new Map<string, StoredPRState>();
  for (const state of storedStates || []) {
    const key = `${state.pr_id}-${state.reason}`;
    storedMap.set(key, state);
  }

  const newPRs: ActionablePR[] = [];
  const seenKeys = new Set<string>();
  let updatedCount = 0;

  // Process current actionable PRs
  for (const pr of currentPRs) {
    const key = `${pr.pr.id}-${pr.reason}`;
    seenKeys.add(key);

    const existing = storedMap.get(key);

    if (!existing) {
      // New actionable PR
      newPRs.push(pr);

      const { error: insertError } = await supabase
        .from("actionable_pr_states")
        .insert({
          pr_id: pr.pr.id,
          pr_number: pr.pr.number,
          repo_owner: pr.repository.owner,
          repo_name: pr.repository.repo,
          reason: pr.reason,
          reason_label: pr.reasonLabel,
          pr_title: pr.pr.title,
          pr_url: pr.pr.html_url,
          pr_author: pr.pr.user.login,
        });

      if (insertError) {
        console.error("Failed to insert PR state:", insertError);
      }
    } else {
      // Update existing PR - refresh last_seen_at and title
      const { error: updateError } = await supabase
        .from("actionable_pr_states")
        .update({
          last_seen_at: new Date().toISOString(),
          pr_title: pr.pr.title,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Failed to update PR state:", updateError);
      }
      updatedCount++;
    }
  }

  // Remove PRs that are no longer actionable
  const keysToRemove = Array.from(storedMap.keys()).filter(
    (key) => !seenKeys.has(key)
  );

  let removedCount = 0;
  for (const key of keysToRemove) {
    const state = storedMap.get(key)!;
    const { error: deleteError } = await supabase
      .from("actionable_pr_states")
      .delete()
      .eq("id", state.id);

    if (deleteError) {
      console.error("Failed to delete stale state:", deleteError);
    } else {
      removedCount++;
    }
  }

  return { newPRs, removedCount, updatedCount };
}

export async function markAsNotified(
  prIds: number[],
  reasons: string[]
): Promise<void> {
  const supabase = createAdminClient();

  for (let i = 0; i < prIds.length; i++) {
    const { error } = await supabase
      .from("actionable_pr_states")
      .update({ notified_at: new Date().toISOString() })
      .eq("pr_id", prIds[i])
      .eq("reason", reasons[i]);

    if (error) {
      console.error("Failed to mark PR as notified:", error);
    }
  }
}
