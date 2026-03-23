import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  RefineApiAction,
  RefineChange,
  RefineRequestBody,
  RefineResponseBody,
} from "@/lib/api/refine-types";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are Keeper's planning assistant. You output only valid JSON, no markdown fences, no preamble, no commentary outside the JSON object.

The user will send a JSON payload describing their inventory items and planned tasks for the week. You must propose a small set of concrete schedule changes.

Rules:
- Prioritize items with flexibility "Fixed" and cadence_pressure "Must stay on cadence" when deciding what stays put.
- Never invent item_ids or planned_task_ids. Every id in your output must appear in the provided context.
- If no changes are needed, return an empty changes array with a short note.
- The "note" must be one calm, practical sentence in plain language. No cheerleading, no life coaching, no exclamation marks. Avoid em dashes.

Response shape (exact keys):
{
  "changes": Array<
    | { "action": "move", "planned_task_id": string, "to_date": "YYYY-MM-DD" }
    | { "action": "add", "item_id": string, "to_date": "YYYY-MM-DD", "scheduled_time_start"?: "HH:MM" }
    | { "action": "remove", "planned_task_id": string }
  >,
  "note": string
}`;

function isRefineAction(x: unknown): x is RefineApiAction {
  return (
    x === "plan_week" ||
    x === "lighten_day" ||
    x === "one_hour" ||
    x === "rebalance" ||
    x === "custom"
  );
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

function isValidChange(change: unknown, validTaskIds: Set<string>, validItemIds: Set<string>): change is RefineChange {
  if (!change || typeof change !== "object") return false;
  const c = change as Record<string, unknown>;
  if (c.action === "move") {
    return (
      typeof c.planned_task_id === "string" &&
      validTaskIds.has(c.planned_task_id) &&
      typeof c.to_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.to_date)
    );
  }
  if (c.action === "add") {
    return (
      typeof c.item_id === "string" &&
      validItemIds.has(c.item_id) &&
      typeof c.to_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.to_date) &&
      (c.scheduled_time_start === undefined ||
        (typeof c.scheduled_time_start === "string" && /^\d{2}:\d{2}$/.test(c.scheduled_time_start)))
    );
  }
  if (c.action === "remove") {
    return typeof c.planned_task_id === "string" && validTaskIds.has(c.planned_task_id);
  }
  return false;
}

function buildUserPrompt(body: RefineRequestBody): string {
  if (body.action === "custom") {
    const text = body.custom_prompt?.trim() ?? "";
    return JSON.stringify(
      {
        instruction: `The user request: ${text}`,
        action: "custom",
        context: body.context,
      },
      null,
      2,
    );
  }

  const actionLabels: Record<Exclude<RefineApiAction, "custom">, string> = {
    plan_week: "Plan the week: suggest adds/moves/removes so the week is balanced and realistic.",
    lighten_day:
      "Lighten the target day: reduce overload by moving or removing lower-priority planned work.",
    one_hour:
      "Fit roughly one hour of work tonight (or the target evening): trim or reschedule other tasks so about one hour remains for focused work.",
    rebalance: "Rebalance the week: spread load more evenly across days using moves/adds/removes as needed.",
  };

  return JSON.stringify(
    {
      instruction: actionLabels[body.action],
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
    },
  };

  const validTaskIds = new Set(reqBody.context.planned_tasks.map((t) => t.id));
  const validItemIds = new Set(reqBody.context.items.map((i) => i.id));

  const userPrompt = buildUserPrompt(reqBody);

  let anthropicJson: unknown;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      return NextResponse.json(
        { error: "Could not reach the AI service. Try again in a moment." },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "Empty model response." }, { status: 502 });
    }

    anthropicJson = extractJsonObject(text);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to parse AI response." }, { status: 502 });
  }

  if (!anthropicJson || typeof anthropicJson !== "object") {
    return NextResponse.json({ error: "Invalid AI response shape." }, { status: 502 });
  }

  const parsed = anthropicJson as { changes?: unknown; note?: unknown };
  const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
  const changes: RefineChange[] = rawChanges.filter((c) => isValidChange(c, validTaskIds, validItemIds));

  const note =
    typeof parsed.note === "string" && parsed.note.trim().length > 0
      ? parsed.note.trim().slice(0, 500)
      : "No changes suggested.";

  const out: RefineResponseBody = { changes, note };
  return NextResponse.json(out);
}
