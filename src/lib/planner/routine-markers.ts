import type { Item } from "@/data/inventory-mock";
import type { PlannedTask } from "@/lib/db/map-rows";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function routineMarkerId(itemId: string, dateISO: string): string {
  return `routine:${itemId}:${dateISO}`;
}

export function isRoutineMarkerId(id: string): boolean {
  return id.startsWith("routine:");
}

function weekdayName(dateISO: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

/** The length the person set. A routine never grows into a default hour. */
export function routineMinutes(item: { type: string; estimated_minutes: number }): number | null {
  if (item.type !== "anchor") return null;
  const minutes = item.estimated_minutes;
  if (!Number.isFinite(minutes) || minutes <= 0) return 15;
  return Math.round(minutes);
}

function endClock(start: string, minutes: number): string {
  const match = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return start;
  const total = Number(match[1]) * 60 + Number(match[2]) + Math.max(5, Math.round(minutes));
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * A routine with set days still shows on those days when no saved instance exists.
 * A saved row wins, so a drag or a check-off is not covered by a second copy.
 */
export function routineMarkers(items: Item[], dateISOs: string[], existing: PlannedTask[]): PlannedTask[] {
  const saved = new Set(existing.map((task) => `${task.item_id}|${task.scheduled_date}`));
  const markers: PlannedTask[] = [];
  for (const item of items) {
    if (item.type !== "anchor" || item.is_archived) continue;
    if (!item.preferred_days?.length) continue;
    const days = new Set(item.preferred_days.map((day) => day.toLowerCase()));
    for (const dateISO of dateISOs) {
      if (!days.has(weekdayName(dateISO))) continue;
      if (saved.has(`${item.id}|${dateISO}`)) continue;
      const start = item.fixed_start_time;
      markers.push({
        id: routineMarkerId(item.id, dateISO),
        item_id: item.id,
        title_snapshot: item.title,
        scheduled_date: dateISO,
        scheduled_time_start: start,
        scheduled_time_end: start ? endClock(start, routineMinutes(item) ?? item.estimated_minutes) : null,
        status: "planned",
        priority_override: null,
        notes: null,
        created_at: "",
        updated_at: "",
      });
    }
  }
  return markers;
}
