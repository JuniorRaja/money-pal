import type { Category } from "@/data/schema";

export type CategorizationGroup = {
  id: string;
  label: string;
  kind: "note" | "keyword" | "payee";
  count: number;
  direction: "income" | "expense";
  cadence: "monthly" | "irregular" | null;
  amountStability: "exact" | "near" | "variable" | null;
  humanRound: boolean | null;
  magnitude: "small" | "medium" | "large";
};

export type CategorizationCategory = Pick<Category, "id" | "name" | "group">;

export type CategorizationSuggestion = {
  groupId: string;
  categoryId: string | null;
  categoryName: string | null;
  isNew: boolean;
  kind: Category["group"] | null;
  confidence: number;
};

export type CategorizationPayload = {
  groups: CategorizationGroup[];
  categories: CategorizationCategory[];
};

export const IMPORT_CATEGORIZATION_SYSTEM_PROMPT = [
  "You categorize transaction groups for an Indian personal-finance app.",
  'Return JSON only: {"suggestions":[{"id":string,"categoryId":string|null,"categoryName":string|null,"isNew":boolean,"kind":string|null,"confidence":number}]}.',
  "Return exactly one suggestion for every supplied group id and do not invent group ids or category ids.",
  "Use only listed category ids for existing categories. You may propose at most five new categories total, with isNew=true and a valid kind.",
  "Return null categoryId, categoryName, and kind when the group cannot be categorized confidently, especially person-to-person payments.",
  "A large or recurring amount does not imply Rent or Salary. Exact recurring amounts suggest a contract shape, not whether it is EMI, insurance, SIP, or anything else.",
  "Use only the supplied derived labels and payment shape. Do not ask for or infer hidden transaction details.",
].join(" ");

const categoryKinds: readonly Category["group"][] = [
  "income",
  "essentials",
  "lifestyle",
  "transfer",
  "investment",
];

export function buildCategorizationPayload(
  groups: readonly CategorizationGroup[],
  categories: readonly CategorizationCategory[],
): CategorizationPayload {
  return {
    groups: groups.map((group) => ({
      id: group.id,
      label: group.label,
      kind: group.kind,
      count: group.count,
      direction: group.direction,
      cadence: group.cadence,
      amountStability: group.amountStability,
      humanRound: group.humanRound,
      magnitude: group.magnitude,
    })),
    categories: categories.map(({ id, name, group }) => ({ id, name, group })),
  };
}

function emptySuggestion(groupId: string): CategorizationSuggestion {
  return {
    groupId,
    categoryId: null,
    categoryName: null,
    isNew: false,
    kind: null,
    confidence: 0,
  };
}

function directionAllows(
  direction: CategorizationGroup["direction"],
  kind: Category["group"],
): boolean {
  return direction === "income" ? kind === "income" || kind === "transfer" : kind !== "income";
}

export function validateCategorizationResponse(
  raw: string,
  groups: readonly CategorizationGroup[],
  categories: readonly CategorizationCategory[],
): CategorizationSuggestion[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { suggestions?: unknown }).suggestions)
  ) {
    return null;
  }

  const allowedGroups = new Map(groups.map((group) => [group.id, group]));
  const allowedCategories = new Map(categories.map((category) => [category.id, category]));
  const returned = new Map<string, Record<string, unknown>>();
  for (const candidate of (parsed as { suggestions: unknown[] }).suggestions) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.id !== "string" || !allowedGroups.has(item.id) || returned.has(item.id))
      continue;
    returned.set(item.id, item);
  }
  if (groups.some((group) => !returned.has(group.id))) return null;

  let newCategories = 0;
  return groups.map((group) => {
    const item = returned.get(group.id)!;
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.min(0.75, Math.max(0, item.confidence))
        : 0;
    if (item.isNew === true) {
      const name = typeof item.categoryName === "string" ? item.categoryName.trim() : "";
      const kind = item.kind;
      if (
        newCategories >= 5 ||
        !name ||
        name.length > 40 ||
        !categoryKinds.includes(kind as Category["group"]) ||
        !directionAllows(group.direction, kind as Category["group"])
      ) {
        return emptySuggestion(group.id);
      }
      newCategories += 1;
      return {
        groupId: group.id,
        categoryId: null,
        categoryName: name,
        isNew: true,
        kind: kind as Category["group"],
        confidence,
      };
    }

    if (typeof item.categoryId !== "string") return emptySuggestion(group.id);
    const category = allowedCategories.get(item.categoryId);
    if (!category || !directionAllows(group.direction, category.group))
      return emptySuggestion(group.id);
    return {
      groupId: group.id,
      categoryId: category.id,
      categoryName: category.name,
      isNew: false,
      kind: category.group,
      confidence,
    };
  });
}

export function unresolvedCategorizationGroups<T extends { suggestedCategoryName: string | null }>(
  groups: readonly T[],
): T[] {
  return groups.filter((group) => !group.suggestedCategoryName);
}

export async function requestCategorizationWithRetry(
  groups: readonly CategorizationGroup[],
  categories: readonly CategorizationCategory[],
  request: (payload: CategorizationPayload, signal: AbortSignal) => Promise<string>,
  options: { enabled: boolean; available: boolean; timeoutMs?: number },
): Promise<CategorizationSuggestion[]> {
  if (!options.enabled || !options.available || groups.length === 0) return [];
  const payload = buildCategorizationPayload(groups, categories);
  const timeoutMs = options.timeoutMs ?? 8_000;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("categorization timed out"));
        }, timeoutMs);
      });
      const raw = await Promise.race([request(payload, controller.signal), timedOut]);
      const result = validateCategorizationResponse(raw, groups, categories);
      if (result) return result;
    } catch {
      // AI is an optional import enhancement; failure leaves the groups untouched.
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return [];
}
