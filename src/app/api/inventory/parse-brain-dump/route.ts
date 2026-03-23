import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BrainDumpItemDraft, ParseBrainDumpResponseBody } from "@/lib/api/brain-dump-types";
import { sanitizeBrainDumpItem } from "@/lib/inventory/brain-dump-sanitize";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are Keeper's inventory parser. The user will paste a free-form brain dump of recurring tasks, routines, and life responsibilities.

Output only valid JSON (no markdown fences, no preamble) with this exact shape:
{
  "items": [
    {
      "title": string (required, concise),
      "category": "Home" | "Family" | "Personal" | "Work" | "Upkeep" | "Health",
      "type": "recurring" | "one_off" | "goal",
      "frequency_type": "daily" | "weekly" | "biweekly" | "monthly" | "custom" | null,
      "frequency_value": number | null,
      "preferred_days": string[] | null,
      "preferred_time_of_day": "morning" | "afternoon" | "evening" | "anytime" | null,
      "estimated_minutes": number,
      "priority": "Critical" | "Important" | "Standard" | "Optional",
      "flexibility": "Fixed" | "Preferred window" | "Flexible anytime",
      "cadence_pressure": "Must stay on cadence" | "Can slide a little" | "Can defer",
      "minimum_success_threshold": string | null,
      "notes": string | null
    }
  ]
}

Rules:
- Infer category from context (kids/school → Family, house chores → Home, exercise → Health, job → Work, etc.).
- Use type "recurring" for habits and repeating chores; "one_off" for single errands; "goal" for longer aims.
- For recurring/goal: set frequency_type and frequency_value (e.g. weekly + 1, or custom + 1.5 for every 6 weeks approximated).
- For one_off: frequency_type and frequency_value must be null.
- preferred_days: lowercase English weekday names when the text implies fixed days, else null.
- estimated_minutes: realistic (5–180 for most home tasks unless clearly longer).
- cadence_pressure: "Must stay on cadence" for strict medical/kid deadlines; "Can defer" for low stakes.
- flexibility: "Fixed" only when times/days are rigid in the text.
- Split distinct responsibilities into separate items.
- If the text is empty of obligations, return "items": [].`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
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

  let parsed: unknown;
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
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic brain-dump error:", await res.text());
      return NextResponse.json(
        { error: "Could not reach the AI service. Try again in a moment." },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const outText = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    if (!outText) {
      return NextResponse.json({ error: "Empty model response." }, { status: 502 });
    }

    parsed = extractJsonObject(outText);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to parse AI response." }, { status: 502 });
  }

  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "Invalid AI response shape." }, { status: 502 });
  }

  const itemsRaw = (parsed as { items?: unknown }).items;
  if (!Array.isArray(itemsRaw)) {
    return NextResponse.json({ error: "Invalid AI response: missing items array." }, { status: 502 });
  }

  const items: BrainDumpItemDraft[] = [];
  for (const row of itemsRaw) {
    const sanitized = sanitizeBrainDumpItem(row);
    if (sanitized) items.push(sanitized);
  }

  const out: ParseBrainDumpResponseBody = { items };
  return NextResponse.json(out);
}
