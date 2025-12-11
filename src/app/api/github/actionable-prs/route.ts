import { fetchActionablePullRequests } from "@/lib/github/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // userId is now the GitHub username directly
  const targetUsername = searchParams.get("userId") || undefined;

  const result = await fetchActionablePullRequests(targetUsername);
  return NextResponse.json(result);
}
