import { createServerFn } from "@tanstack/react-start";

import { getAssistantContext } from "@/data/repository";

export interface AskInput {
  question: string;
  tone: "concise" | "detailed";
  shareContext: boolean;
  history: { role: "user" | "assistant"; content: string }[];
}

const ANTHROPIC_MODEL = "claude-opus-5";
// OpenRouter slugs are catalog-specific — override if yours differs.
const OPENROUTER_MODEL = process.env["OPENROUTER_MODEL"] ?? "anthropic/claude-opus-5";

async function ask(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
): Promise<Response> {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (anthropicKey) {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        // Opus 5 thinks by default and max_tokens covers thinking + answer;
        // low effort keeps a short finance answer from being crowded out.
        output_config: { effort: "low" },
        system,
        messages,
      }),
    });
  }

  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  if (!openRouterKey) throw new Error("Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY");

  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${openRouterKey}` },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
}

// Anthropic returns content blocks; OpenRouter returns OpenAI-shaped choices.
interface AskPayload {
  content?: { type: string; text?: string }[];
  choices?: { message?: { content?: string } }[];
}

function readAnswer(payload: AskPayload): string {
  if (payload.content) {
    return payload.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
  }
  return payload.choices?.[0]?.message?.content ?? "";
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: AskInput) => {
    if (!input || typeof input.question !== "string" || !input.question.trim()) {
      throw new Error("A question is required");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const ledger = data.shareContext
      ? await getAssistantContext()
      : "No ledger shared by the user.";
    const system = [
      "You are Money Pal, a calm personal-finance assistant for an Indian user.",
      "Amounts are Indian rupees; use lakh/crore phrasing where natural.",
      data.tone === "concise"
        ? "Answer in at most 4 short sentences or 4 bullets."
        : "Answer in at most 8 sentences, with a short takeaway line.",
      "Use only the ledger digest below for numbers. If something is not in it, say so plainly.",
      "Never invent transactions or give regulated investment advice.",
      "",
      "LEDGER DIGEST:",
      ledger,
    ].join("\n");

    const res = await ask(
      system,
      [...data.history.slice(-6), { role: "user", content: data.question }],
      data.tone === "concise" ? 1024 : 2048,
    );

    if (res.status === 429) throw new Error("Money Pal is busy right now — try again in a moment.");
    if (res.status === 402)
      throw new Error("AI credits are exhausted. Add credits to keep asking.");
    if (!res.ok) throw new Error(`Assistant unavailable (${res.status}).`);

    const text = readAnswer((await res.json()) as AskPayload);

    return { answer: text.trim() || "I could not put an answer together for that one." };
  });
