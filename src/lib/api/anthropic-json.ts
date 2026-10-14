type AnthropicBlock = { type?: string; text?: string };

type AnthropicMessage = {
  stop_reason?: string;
  content?: AnthropicBlock[];
};

export type JsonCompletion = {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh";
};

/**
 * Ask Anthropic for JSON that matches a schema.
 * Retries once if the reply is cut off. Does not set temperature.
 */
export async function completeStructuredJson(
  apiKey: string,
  input: JsonCompletion,
): Promise<{ json: unknown } | { error: string; status: number }> {
  let maxTokens = input.maxTokens ?? 8000;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: maxTokens,
          system: input.system,
          messages: [{ role: "user", content: input.user }],
          output_config: {
            effort: input.effort ?? "medium",
            format: { type: "json_schema", schema: input.schema },
          },
        }),
      });
    } catch (e) {
      console.error(e);
      return { error: "Could not reach the AI service. Try again in a moment.", status: 502 };
    }

    if (!res.ok) {
      console.error("Anthropic API error:", res.status, await res.text());
      return { error: "Could not reach the AI service. Try again in a moment.", status: 502 };
    }

    const data = (await res.json()) as AnthropicMessage;
    if (data.stop_reason === "max_tokens" && attempt === 0) {
      maxTokens = Math.min(maxTokens * 2, 32000);
      continue;
    }
    if (data.stop_reason === "refusal") {
      return { error: "Keeper could not answer that request.", status: 422 };
    }

    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    if (!text) {
      return { error: "Empty model response.", status: 502 };
    }

    try {
      return { json: JSON.parse(text) as unknown };
    } catch (e) {
      console.error(e);
      return { error: "Failed to parse AI response.", status: 502 };
    }
  }

  return { error: "The AI reply was too long. Try a smaller request.", status: 502 };
}
