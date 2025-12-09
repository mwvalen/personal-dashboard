import { fetchAllPullRequests } from "@/lib/github/client";
import { NextResponse } from "next/server";

export async function GET() {
  const results = await fetchAllPullRequests();
  return NextResponse.json(results);
}
