import { fetchMyLinearIssues } from "@/lib/linear/client";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await fetchMyLinearIssues();
  return NextResponse.json(result);
}
