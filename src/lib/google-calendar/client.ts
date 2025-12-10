import { google } from "googleapis";
import { CalendarEvent, CalendarEventsResult } from "@/types/calendar";

function getServiceAccountCredentials() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    return null;
  }
  try {
    return JSON.parse(key);
  } catch {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY");
    return null;
  }
}

export async function fetchTodaysCalendarEvents(): Promise<CalendarEventsResult> {
  const credentials = getServiceAccountCredentials();
  const userEmail = process.env.GOOGLE_CALENDAR_USER_EMAIL;

  if (!credentials) {
    return { events: [], error: "Google Calendar not configured" };
  }

  if (!userEmail) {
    return { events: [], error: "GOOGLE_CALENDAR_USER_EMAIL not set" };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    // Create a JWT client to impersonate the user
    const authClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      subject: userEmail, // Impersonate this user via domain-wide delegation
    });

    const calendar = google.calendar({ version: "v3", auth: authClient });

    // Get today's date range
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: CalendarEvent[] = (response.data.items || [])
      .filter((event) => {
        // Filter out cancelled events
        if (event.status === "cancelled") return false;
        // Filter out events user declined
        const selfAttendee = event.attendees?.find((a) => a.self);
        if (selfAttendee?.responseStatus === "declined") return false;
        return true;
      })
      .map((event) => {
        const isAllDay = !event.start?.dateTime;
        const start = event.start?.dateTime || event.start?.date || "";
        const end = event.end?.dateTime || event.end?.date || "";

        // Calculate duration in minutes
        let durationMinutes = 0;
        if (!isAllDay && start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
        }

        // Get response status
        const selfAttendee = event.attendees?.find((a) => a.self);
        const responseStatus = selfAttendee?.responseStatus as CalendarEvent["responseStatus"];

        return {
          id: event.id || "",
          summary: event.summary || "(No title)",
          start,
          end,
          durationMinutes,
          isAllDay,
          responseStatus,
        };
      });

    return { events };
  } catch (error) {
    console.error("Failed to fetch calendar events:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { events: [], error: message };
  }
}
