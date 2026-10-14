import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeStructuredJson } from "@/lib/api/anthropic-json";
import type { BrainDumpItemDraft, ParseBrainDumpResponseBody } from "@/lib/api/brain-dump-types";
import { sanitizeBrainDumpItem } from "@/lib/inventory/brain-dump-sanitize";
import { REASONING_MODEL } from "@/lib/api/models";
import {
  clockPrompt,
  draftsFromPlaced,
  leftoverLifeDump,
  repairModelDrafts,
  scheduleLifeDump,
  type LifeClock,
} from "@/lib/planner/life-dump";
import { protectedWindowsFromUnknown } from "@/lib/planner/protected-time";
import { loadProtectedTimes } from "@/lib/settings/protected-times";

export const runtime = "nodejs";

const MODEL = REASONING_MODEL;

const BRAIN_DUMP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "category",
          "type",
          "frequency_type",
          "frequency_value",
          "frequency_unit",
          "preferred_days",
          "preferred_time_of_day",
          "estimated_minutes",
          "priority",
          "flexibility",
          "cadence_pressure",
          "minimum_success_threshold",
          "notes",
          "fixed_start_time",
          "next_due_date",
        ],
        properties: {
          title: { type: "string" },
          category: { type: "string", enum: ["Home", "Family", "Personal", "Work", "Upkeep", "Health"] },
          type: { type: "string", enum: ["recurring", "one_off", "goal", "anchor"] },
          frequency_type: {
            type: "string",
            enum: ["daily", "weekly", "biweekly", "monthly", "custom", "none"],
          },
          frequency_value: { type: "integer" },
          frequency_unit: { type: "string", enum: ["days", "weeks", "months", "none"] },
          preferred_days: { type: "array", items: { type: "string" } },
          preferred_time_of_day: {
            type: "string",
            enum: ["morning", "afternoon", "evening", "anytime", "none"],
          },
          estimated_minutes: { type: "integer" },
          priority: { type: "string", enum: ["Critical", "Important", "Standard", "Optional"] },
          flexibility: { type: "string", enum: ["Fixed", "Preferred window", "Flexible anytime"] },
          cadence_pressure: {
            type: "string",
            enum: ["Must stay on cadence", "Can slide a little", "Can defer"],
          },
          minimum_success_threshold: { type: "string" },
          notes: { type: "string" },
          fixed_start_time: { type: "string" },
          next_due_date: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are Keeper's inventory parser. The user will paste a free-form brain dump of recurring tasks, routines, and life responsibilities.

Output only valid JSON (no markdown fences, no preamble) with this exact shape:
{
  "items": [
    {
      "title": string (required, concise),
      "category": "Home" | "Family" | "Personal" | "Work" | "Upkeep" | "Health",
      "type": "recurring" | "one_off" | "goal" | "anchor",
      "frequency_type": "daily" | "weekly" | "biweekly" | "monthly" | "custom" | "none",
      "frequency_value": number,
      "frequency_unit": "days" | "weeks" | "months" | "none",
      "preferred_days": string[],
      "preferred_time_of_day": "morning" | "afternoon" | "evening" | "anytime" | "none",
      "estimated_minutes": number,
      "priority": "Critical" | "Important" | "Standard" | "Optional",
      "flexibility": "Fixed" | "Preferred window" | "Flexible anytime",
      "cadence_pressure": "Must stay on cadence" | "Can slide a little" | "Can defer",
      "minimum_success_threshold": string,
      "notes": string
    }
  ]
}

Rules:
- Infer category from context (kids/school → Family, house chores → Home, exercise → Health, job → Work, etc.).
- Use type "recurring" for habits and repeating chores; "one_off" for single errands; "goal" for longer aims; "anchor" for a quiet routine such as bedtime or skincare.
- Use "none" for frequency_type, frequency_unit, and preferred_time_of_day when they do not apply. Use 0 for frequency_value when there is no repeat. Use an empty array for preferred_days and an empty string for notes and minimum_success_threshold when there is nothing to add.
- For recurring/goal: set frequency_unit to days, weeks, or months and frequency_value to how many of those units. "Every 10 days" is frequency_unit "days" and frequency_value 10. Never store that number as months, and never put the schedule into notes.
- For one_off: frequency_type and frequency_unit are "none", and frequency_value is 0.
- notes is only extra detail the person wrote. Leave notes as an empty string when the text is just the schedule.
- preferred_days: lowercase English weekday names when the text implies fixed days, otherwise an empty array.
- estimated_minutes: realistic (5–180 for most home tasks unless clearly longer).
- cadence_pressure: "Must stay on cadence" for strict medical/kid deadlines; "Can defer" for low stakes.
- flexibility: "Fixed" when the person names a date and a clock time, or a start and end such as 2 to 5 PM. Set fixed_start_time to 24-hour HH:MM and next_due_date to YYYY-MM-DD. The duration is the difference, so 2 to 5 PM is 180 minutes starting at 14:00. Leave both strings empty when there is no stated day or time.
- Errands at a business (UPS, a store, auto parts, a shop, a pickup) stay between 9:00 AM and 5:00 PM unless the person names another time. Respect "before 5 PM" and "after" ordering.
- Do not schedule ordinary tasks before wake time or after wind-down. A stated fixed time may sit outside that window.
- Do not schedule ordinary tasks inside protected time. A clock time the person names may sit inside it.
- Meetings and calls the person already has are fixed events and count as busy.
- Write notes in 12-hour time, such as 5:20 PM, never 17:20.
- Split distinct responsibilities into separate items.
- If the text is empty of obligations, return "items": [].`;

function blankToNull(value: unknown): unknown {
  if (value === "none" || value === "" || value === 0) return null;
  return value;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text =
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (text.length < 8) {
    return NextResponse.json({ error: "Add a bit more detail so Keeper can parse your list." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const clock = readClock(body);
  const savedWindows = await loadProtectedTimes(supabase);
  clock.protectedWindows = savedWindows.length > 0 ? savedWindows : protectedWindowsFromUnknown(
    (body as { protected_windows?: unknown }).protected_windows,
  );
  const placed = scheduleLifeDump(text, clock);
  const known = draftsFromPlaced(placed);
  const leftover = leftoverLifeDump(text, clock);

  if (leftover.trim().length < 8) {
    const out: ParseBrainDumpResponseBody = { items: known };
    return NextResponse.json(out);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    if (known.length > 0) {
      const out: ParseBrainDumpResponseBody = { items: known };
      return NextResponse.json(out);
    }
    return NextResponse.json({ error: "Server missing ANTHROPIC_API_KEY." }, { status: 503 });
  }

  const userPrompt = `${clockPrompt(clock)}\n\nParse the following into structured inventory items:\n\n${leftover}`;

  const completed = await completeStructuredJson(apiKey, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    schema: BRAIN_DUMP_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 16000,
    effort: "high",
  });
  if ("error" in completed) {
    return NextResponse.json({ error: completed.error }, { status: completed.status });
  }
  const parsed = completed.json;

  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "Invalid AI response shape." }, { status: 502 });
  }

  const itemsRaw = (parsed as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) {
    return NextResponse.json({ error: "Invalid AI response: missing items array." }, { status: 502 });
  }

  const items: BrainDumpItemDraft[] = [];
  for (const row of itemsRaw) {
    const source = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const normalized = source
      ? {
          ...source,
          frequency_type: blankToNull(source.frequency_type),
          frequency_value: blankToNull(source.frequency_value),
          frequency_unit: blankToNull(source.frequency_unit),
          preferred_time_of_day: blankToNull(source.preferred_time_of_day),
          notes: blankToNull(source.notes),
          minimum_success_threshold: blankToNull(source.minimum_success_threshold),
          fixed_start_time: blankToNull(source.fixed_start_time),
          next_due_date: blankToNull(source.next_due_date),
          preferred_days: Array.isArray(source.preferred_days) && source.preferred_days.length === 0
            ? null
            : source.preferred_days,
        }
      : row;
    const sanitized = sanitizeBrainDumpItem(normalized);
    if (sanitized) items.push(sanitized);
  }

  const out: ParseBrainDumpResponseBody = { items: [...known, ...repairModelDrafts(items, clock)] };
  return NextResponse.json(out);
}

function readClock(body: unknown): LifeClock {
  const raw = body as { now?: { date?: unknown; time?: unknown; time_zone?: unknown }; wake_minutes?: unknown; wind_down_minutes?: unknown };
  const date = typeof raw.now?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.now.date) ? raw.now.date : todayUTC();
  const time = typeof raw.now?.time === "string" ? raw.now.time.match(/^(\d{1,2}):(\d{2})$/) : null;
  const nowMinutes = time ? Number(time[1]) * 60 + Number(time[2]) : 8 * 60;
  const timeZone = typeof raw.now?.time_zone === "string" && raw.now.time_zone.trim() ? raw.now.time_zone.trim().slice(0, 80) : "UTC";
  const wake = typeof raw.wake_minutes === "number" ? raw.wake_minutes : undefined;
  const wind = typeof raw.wind_down_minutes === "number" ? raw.wind_down_minutes : undefined;
  return { todayISO: date, nowMinutes, timeZone, wakeMin: wake, windMin: wind };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
