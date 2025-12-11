import { fetchLinearIssues } from "@/lib/linear/client";
import { NextResponse } from "next/server";
import { getUserByGithubUsername } from "@/lib/users/config";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // userId is the GitHub username
  const githubUsername = searchParams.get("userId");

  let targetEmail: string | undefined;
  if (githubUsername) {
    const user = getUserByGithubUsername(githubUsername);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!user.email) {
      return NextResponse.json({
        issues: [],
        linearUnavailable: true,
        message: "No email configured for this user - cannot fetch Linear issues",
      });
    }
    targetEmail = user.email;
  }

  const result = await fetchLinearIssues(targetEmail);
  return NextResponse.json(result);
}
