import { createServerFn } from "@tanstack/react-start";

import { getAssistantContext } from "@/data/repository";

export interface AskInput {
  question: string;
  tone: "concise" | "detailed";
  shareContext: boolean;
  history: { role: "user" | "assistant"; content: string }[];
}

interface ResponsesPayload {
  output_text?: string;
  output?: { content?: { type: string; text?: string }[] }[];
  error?: { message?: string };
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: AskInput) => {
    if (!input || typeof input.question !== "string" || !input.question.trim()) {
      throw new Error("A question is required");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const ledger = data.shareContext ? await getAssistantContext() : "No ledger shared by the user.";
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

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        max_output_tokens: data.tone === "concise" ? 320 : 640,
        input: [
          { role: "system", content: system },
          ...data.history.slice(-6),
          { role: "user", content: data.question },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Money Pal is busy right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to keep asking.");
    if (!res.ok) throw new Error(`Assistant unavailable (${res.status}).`);

    const payload = (await res.json()) as ResponsesPayload;
    const text =
      payload.output_text ??
      payload.output
        ?.flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("") ??
      "";

    return { answer: text.trim() || "I could not put an answer together for that one." };
  });
