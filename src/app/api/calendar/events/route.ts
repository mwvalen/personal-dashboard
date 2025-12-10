import { NextResponse } from "next/server";
import { fetchTodaysCalendarEvents } from "@/lib/google-calendar/client";

export async function GET() {
  const result = await fetchTodaysCalendarEvents();

  if (result.error) {
    console.error("Calendar API error:", result.error);
  }

  return NextResponse.json(result);
}
