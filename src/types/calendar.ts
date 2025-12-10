export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  durationMinutes: number;
  isAllDay: boolean;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
}

export interface CalendarEventsResult {
  events: CalendarEvent[];
  error?: string;
}
