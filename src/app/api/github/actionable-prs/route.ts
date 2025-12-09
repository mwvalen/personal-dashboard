import { fetchActionablePullRequests } from "@/lib/github/client";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await fetchActionablePullRequests();
  return NextResponse.json(result);
}
