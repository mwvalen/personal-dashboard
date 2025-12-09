import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.GITHUB_PAT;

  if (!token) {
    return NextResponse.json({ error: "GitHub token not configured" }, { status: 500 });
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: response.status });
  }

  const user = await response.json();
  return NextResponse.json({
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    html_url: user.html_url,
  });
}
