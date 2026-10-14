import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeStructuredJson } from "@/lib/api/anthropic-json";
import type {
  RefineApiAction,
  RefineChange,
  RefineRequestBody,
  RefineResponseBody,
} from "@/lib/api/refine-types";
import { REFINE_OUTPUT_SCHEMA } from "@/lib/api/refine-types";
import { REASONING_MODEL } from "@/lib/api/models";

export const runtime = "nodejs";

const MODEL = REASONING_MODEL;

const SYSTEM_PROMPT = `You are Keeper's planning assistant. You decide what should be added, moved, or removed. You do not choose clock times. The app finds an open time after you answer.

Rules:
- Prioritize items with flexibility "Fixed" and cadence_pressure "Must stay on cadence" when deciding what stays put.
- Never invent item_ids or planned_task_ids. Every id must appear in the provided context.
- For add: set item_id, leave planned_task_id as an empty string. to_date is YYYY-MM-DD when a particular day matters, or an empty string when any remaining day this week is fine.
- For move: set planned_task_id. to_date is the day to aim for, or empty when any remaining day is fine. The app will pick a new time. Do not keep or invent a clock time.
- For remove: set planned_task_id and leave item_id and to_date empty.
- Do not put a time of day in any field.
- If no changes are needed, return an empty changes array with a short note.
- The note is one calm, practical sentence. No cheerleading, no exclamation marks, no em dashes.
- context.now is the user's actual current date, local time, and time zone. Resolve tomorrow and weekday phrases from that date. Do not invent a different today.
- Do not move or remove an item whose flexibility is Fixed. It already has a clock time.
- Do not suggest a day that is already past.`;

function isRefineAction(x: unknown): x is RefineApiAction {
  return (
    x === "plan_week" ||
    x === "lighten_day" ||
    x === "one_hour" ||
    x === "rebalance" ||
    x === "custom"
  );
}

function isDateOrEmpty(value: string): boolean {
  return value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidChange(change: unknown, validTaskIds: Set<string>, validItemIds: Set<string>): change is RefineChange {
  if (!change || typeof change !== "object") return false;
  const c = change as Record<string, unknown>;
  const toDate = typeof c.to_date === "string" ? c.to_date : "";
  if (!isDateOrEmpty(toDate)) return false;
  if (c.action === "move") {
    return typeof c.planned_task_id === "string" && validTaskIds.has(c.planned_task_id);
  }
  if (c.action === "add") {
    return typeof c.item_id === "string" && validItemIds.has(c.item_id);
  }
  if (c.action === "remove") {
    return typeof c.planned_task_id === "string" && validTaskIds.has(c.planned_task_id);
  }
  return false;
}

function readNow(raw: unknown): RefineRequestBody["context"]["now"] {
  if (!raw || typeof raw !== "object") return undefined;
  const now = raw as Record<string, unknown>;
  if (typeof now.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(now.date)) return undefined;
  if (typeof now.time !== "string" || !/^\d{2}:\d{2}$/.test(now.time)) return undefined;
  const zone = typeof now.time_zone === "string" && now.time_zone.trim() ? now.time_zone.trim() : "UTC";
  return { date: now.date, time: now.time, time_zone: zone.slice(0, 80) };
}

function buildUserPrompt(body: RefineRequestBody): string {
  const actionLabels: Record<Exclude<RefineApiAction, "custom">, string> = {
    plan_week: "Plan the week: suggest adds, moves, and removes so the week is balanced and realistic.",
    lighten_day: "Lighten the target day: move or remove lower-priority planned work.",
    one_hour:
      "Fit roughly one hour of work tonight: trim or reschedule other tasks so about one hour remains.",
    rebalance: "Rebalance the week: spread the load more evenly across the remaining days.",
  };

  const instruction =
    body.action === "custom"
      ? `The user request: ${body.custom_prompt?.trim() ?? ""}`
      : actionLabels[body.action];

  return JSON.stringify(
    {
      instruction,
      action: body.action,
      context: body.context,
    },
    null,
    2,
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Server missing ANTHROPIC_API_KEY." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Partial<RefineRequestBody>;
  if (!b || !isRefineAction(b.action) || !b.context) {
    return NextResponse.json({ error: "Expected { action, context }." }, { status: 400 });
  }

  const ctx = b.context;
  if (!Array.isArray(ctx.items) || !Array.isArray(ctx.planned_tasks) || typeof ctx.week_start !== "string") {
    return NextResponse.json({ error: "Invalid context shape." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const customPrompt =
    typeof (b as { custom_prompt?: unknown }).custom_prompt === "string"
      ? (b as { custom_prompt: string }).custom_prompt.trim()
      : undefined;

  if (b.action === "custom" && !customPrompt) {
    return NextResponse.json({ error: "custom_prompt is required for custom action." }, { status: 400 });
  }

  const reqBody: RefineRequestBody = {
    action: b.action,
    ...(customPrompt ? { custom_prompt: customPrompt } : {}),
    context: {
      items: ctx.items as RefineRequestBody["context"]["items"],
      planned_tasks: ctx.planned_tasks as RefineRequestBody["context"]["planned_tasks"],
      week_start: ctx.week_start,
      target_date: typeof ctx.target_date === "string" ? ctx.target_date : undefined,
      available_minutes: typeof ctx.available_minutes === "number" ? ctx.available_minutes : undefined,
      now: readNow((ctx as { now?: unknown }).now),
    },
  };

  const validTaskIds = new Set(reqBody.context.planned_tasks.map((t) => t.id));
  const validItemIds = new Set(reqBody.context.items.map((i) => i.id));

  const completed = await completeStructuredJson(apiKey, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(reqBody),
    schema: REFINE_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
    effort: "high",
  });

  if ("error" in completed) {
    return NextResponse.json({ error: completed.error }, { status: completed.status });
  }

  if (!completed.json || typeof completed.json !== "object") {
    return NextResponse.json({ error: "Invalid AI response shape." }, { status: 502 });
  }

  const parsed = completed.json as { changes?: unknown; note?: unknown };
  const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
  const changes: RefineChange[] = rawChanges
    .filter((c) => isValidChange(c, validTaskIds, validItemIds))
    .map((c) => {
      if (c.action === "add") return { action: "add", item_id: c.item_id, to_date: c.to_date };
      if (c.action === "move") {
        return { action: "move", planned_task_id: c.planned_task_id, to_date: c.to_date };
      }
      return { action: "remove", planned_task_id: c.planned_task_id };
    });

  const note =
    typeof parsed.note === "string" && parsed.note.trim().length > 0
      ? parsed.note.trim().slice(0, 500)
      : "No changes suggested.";

  const out: RefineResponseBody = { changes, note };
  return NextResponse.json(out);
}
