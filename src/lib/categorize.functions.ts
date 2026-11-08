import { createServerFn } from "@tanstack/react-start";
import type { Category } from "@/data/schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMPORT_CATEGORIZATION_SYSTEM_PROMPT,
  requestCategorizationWithRetry,
  type CategorizationCategory,
  type CategorizationGroup,
} from "@/lib/import/categorize";

const ANTHROPIC_MODEL = "claude-haiku-5-5";
const OPENROUTER_MODEL = process.env["IMPORT_OPENROUTER_MODEL"] ?? "anthropic/claude-haiku-5-5";

export interface CategorizeGroupsInput {
  enabled: boolean;
  groups: CategorizationGroup[];
}

function validateInput(input: CategorizeGroupsInput): CategorizeGroupsInput {
  if (!input || typeof input.enabled !== "boolean" || !Array.isArray(input.groups)) {
    throw new Error("Invalid categorization request");
  }
  if (input.groups.length > 200) throw new Error("Too many groups to categorize");

  const ids = new Set<string>();
  const groups = input.groups.map((group) => {
    if (
      !group ||
      !/^g\d{1,4}$/.test(group.id) ||
      ids.has(group.id) ||
      typeof group.label !== "string" ||
      !group.label.trim() ||
      group.label.length > 100 ||
      !["note", "keyword", "payee"].includes(group.kind) ||
      !Number.isInteger(group.count) ||
      group.count < 1 ||
      group.count > 10_000 ||
      !["income", "expense"].includes(group.direction) ||
      ![null, "monthly", "irregular"].includes(group.cadence) ||
      ![null, "exact", "near", "variable"].includes(group.amountStability) ||
      !(group.humanRound === null || typeof group.humanRound === "boolean") ||
      !["small", "medium", "large"].includes(group.magnitude)
    ) {
      throw new Error("Invalid categorization group");
    }
    ids.add(group.id);
    return {
      id: group.id,
      label: group.label.trim(),
      kind: group.kind,
      count: group.count,
      direction: group.direction,
      cadence: group.cadence,
      amountStability: group.amountStability,
      humanRound: group.humanRound,
      magnitude: group.magnitude,
    };
  });
  return { enabled: input.enabled, groups };
}

type ProviderPayload = {
  content?: { type: string; text?: string }[];
  choices?: { message?: { content?: string } }[];
};

async function requestModel(
  payload: { groups: CategorizationGroup[]; categories: CategorizationCategory[] },
  signal: AbortSignal,
): Promise<string> {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  let response: Response;

  if (anthropicKey) {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1600,
        system: IMPORT_CATEGORIZATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });
  } else {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${openRouterKey}` },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1600,
        messages: [
          { role: "system", content: IMPORT_CATEGORIZATION_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
  }

  if (!response.ok) throw new Error(`Categorization provider returned ${response.status}`);
  const result = (await response.json()) as ProviderPayload;
  if (result.content) {
    return result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
  }
  return result.choices?.[0]?.message?.content ?? "";
}

export const categorizeGroupsFn = createServerFn({ method: "POST" })
  .inputValidator(validateInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const available = Boolean(
      process.env["ANTHROPIC_API_KEY"] || process.env["OPENROUTER_API_KEY"],
    );
    if (!data.enabled || !available || data.groups.length === 0) return { suggestions: [] };

    try {
      const { data: rows, error } = await context.supabase
        .from("categories")
        .select("id, name, kind")
        .is("deleted_at", null)
        .eq("is_active", true);
      if (error) return { suggestions: [] };

      const categories = (rows ?? []).map((category): CategorizationCategory => ({
        id: category.id,
        name: category.name,
        group: category.kind as Category["group"],
      }));
      const suggestions = await requestCategorizationWithRetry(
        data.groups,
        categories,
        (payload, signal) => requestModel(payload, signal),
        { enabled: true, available: true },
      );
      return { suggestions };
    } catch {
      return { suggestions: [] };
    }
  });
