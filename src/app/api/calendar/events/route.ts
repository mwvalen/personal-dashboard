import { NextResponse } from "next/server";
import { fetchTodaysCalendarEvents } from "@/lib/google-calendar/client";
import { getUserByGithubUsername } from "@/lib/users/config";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // userId is now the GitHub username
  const githubUsername = searchParams.get("userId");

  let targetEmail: string | undefined;
  if (githubUsername) {
    const user = getUserByGithubUsername(githubUsername);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!user.email) {
      return NextResponse.json({ events: [], error: "No email configured for this user" });
    }
    targetEmail = user.email;
  }

  const result = await fetchTodaysCalendarEvents(targetEmail);

  if (result.error) {
    console.error("Calendar API error:", result.error);
  }

  return NextResponse.json(result);
}
