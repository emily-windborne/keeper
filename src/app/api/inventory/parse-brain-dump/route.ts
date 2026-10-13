import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeStructuredJson } from "@/lib/api/anthropic-json";
import type { BrainDumpItemDraft, ParseBrainDumpResponseBody } from "@/lib/api/brain-dump-types";
import { sanitizeBrainDumpItem } from "@/lib/inventory/brain-dump-sanitize";

export const runtime = "nodejs";

const MODEL = "claude-haiku-5-5";

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
- flexibility: "Fixed" only when times/days are rigid in the text.
- Split distinct responsibilities into separate items.
- If the text is empty of obligations, return "items": [].`;

function blankToNull(value: unknown): unknown {
  if (value === "none" || value === "" || value === 0) return null;
  return value;
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

  const userPrompt = `Parse the following into structured inventory items:\n\n${text}`;

  const completed = await completeStructuredJson(apiKey, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    schema: BRAIN_DUMP_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 16000,
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
          preferred_days: Array.isArray(source.preferred_days) && source.preferred_days.length === 0
            ? null
            : source.preferred_days,
        }
      : row;
    const sanitized = sanitizeBrainDumpItem(normalized);
    if (sanitized) items.push(sanitized);
  }

  const out: ParseBrainDumpResponseBody = { items };
  return NextResponse.json(out);
}
