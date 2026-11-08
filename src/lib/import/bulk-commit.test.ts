import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const supabaseUrl = process.env["SUPABASE_URL"];
const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
const email = process.env["TESTING_USERID"];
const password = process.env["TESTING_PASSWORD"];
const canRun = Boolean(supabaseUrl && publishableKey && email && password);

type Fixture = { sourceId: string; rowIds: string[]; importHashes: string[] };

describe("bulk import commit RPC", { skip: !canRun }, () => {
  let supabase: SupabaseClient<Database>;
  let userId: string;
  let accountId: string;
  let categoryId: string;
  const fixtures: Fixture[] = [];
  const transactionIds: string[] = [];
  const rulePatterns: string[] = [];

  before(async () => {
    supabase = createClient<Database>(supabaseUrl!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    if (authError || !auth.user) throw new Error(`Test sign-in failed: ${authError?.message}`);
    userId = auth.user.id;

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (accountError || !account)
      throw new Error(`Test account unavailable: ${accountError?.message}`);
    accountId = account.id;

    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (categoryError) throw categoryError;
    categoryId = categories?.id ?? "";
    if (!categoryId) throw new Error("At least one active category is required for this test.");
  });

  after(async () => {
    if (!supabase) return;
    const cleanupErrors: string[] = [];
    for (const transactionId of transactionIds) {
      const { error } = await supabase.rpc("fn_delete_transaction", {
        p_transaction_id: transactionId,
      });
      if (error) cleanupErrors.push(error.message);
    }
    if (rulePatterns.length) {
      const { error } = await supabase.from("import_rules").delete().in("pattern", rulePatterns);
      if (error) cleanupErrors.push(error.message);
    }
    for (const fixture of fixtures) {
      const { error } = await supabase.from("import_sources").delete().eq("id", fixture.sourceId);
      if (error) cleanupErrors.push(error.message);
    }
    await supabase.auth.signOut();
    if (cleanupErrors.length)
      throw new Error(`Fixture cleanup failed: ${cleanupErrors.join("; ")}`);
  });

  async function createPendingRows(count: number): Promise<Fixture> {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .insert({ user_id: userId, kind: "csv", name: `Phase 3 test ${unique}` })
      .select("id")
      .single();
    if (sourceError) throw sourceError;

    const fixture: Fixture = { sourceId: source.id, rowIds: [], importHashes: [] };
    fixtures.push(fixture);
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        user_id: userId,
        source_id: source.id,
        title: `Phase 3 test ${unique}`,
        rows_total: count,
      })
      .select("id")
      .single();
    if (jobError) throw jobError;

    const { data: rows, error: rowsError } = await supabase
      .from("import_job_rows")
      .insert(
        Array.from({ length: count }, (_, index) => ({
          user_id: userId,
          job_id: job.id,
          account_id: accountId,
          occurred_at: "2026-11-01T12:00:00+05:30",
          payee: `Phase 3 test ${unique} ${index}`,
          descriptor: `Phase 3 bulk fixture ${unique} ${index}`,
          amount_paise: 12_345 + index,
          type: "expense" as const,
          import_hash: `${unique}-${index}`,
        })),
      )
      .select("id, import_hash");
    if (rowsError) throw rowsError;
    fixture.rowIds.push(...(rows ?? []).map((row) => row.id));
    fixture.importHashes.push(...(rows ?? []).map((row) => row.import_hash));
    assert.equal(fixture.rowIds.length, count);
    return fixture;
  }

  it("commits every row and persists one learning rule per categorized group", async () => {
    const fixture = await createPendingRows(3);
    const firstRule = `p3-test-${fixture.importHashes[0]}-group-a`;
    const secondRule = `p3-test-${fixture.importHashes[2]}-group-b`;
    rulePatterns.push(firstRule, secondRule);

    const { data, error } = await supabase.rpc("fn_bulk_commit_import_rows", {
      p_rows: [
        { row_id: fixture.rowIds[0], suggested_category_id: categoryId },
        { row_id: fixture.rowIds[1], suggested_category_id: categoryId },
        { row_id: fixture.rowIds[2], suggested_category_id: categoryId },
      ],
      p_rules: [
        {
          pattern: firstRule,
          category_id: categoryId,
          account_id: accountId,
          match_field: "payee",
        },
        {
          pattern: secondRule,
          category_id: categoryId,
          account_id: accountId,
          match_field: "note",
        },
      ],
    });
    if (error) throw error;

    const result = data as {
      rows: { row_id: string; transaction_id: string | null }[];
      rule_ids: string[];
    };
    transactionIds.push(
      ...result.rows.flatMap((row) => (row.transaction_id ? [row.transaction_id] : [])),
    );
    assert.equal(result.rows.length, 3);
    assert.ok(result.rows.every((row) => row.transaction_id));
    assert.equal(result.rule_ids.length, 2);

    const { data: savedRows, error: savedRowsError } = await supabase
      .from("import_job_rows")
      .select("id, status, suggested_category_id, transaction_id")
      .in("id", fixture.rowIds);
    if (savedRowsError) throw savedRowsError;
    assert.equal(savedRows?.length, 3);
    assert.ok(savedRows?.every((row) => row.status === "imported" && row.transaction_id));
    assert.ok(savedRows?.every((row) => row.suggested_category_id === categoryId));

    const { data: savedRules, error: savedRulesError } = await supabase
      .from("import_rules")
      .select("pattern, category_id, match_field")
      .in("pattern", [firstRule, secondRule]);
    if (savedRulesError) throw savedRulesError;
    assert.equal(savedRules?.length, 2);
    assert.deepEqual(
      savedRules
        ?.map((rule) => ({
          pattern: rule.pattern,
          category_id: rule.category_id,
          match_field: rule.match_field,
        }))
        .sort((left, right) => left.pattern.localeCompare(right.pattern)),
      [
        { pattern: firstRule, category_id: categoryId, match_field: "payee" },
        { pattern: secondRule, category_id: categoryId, match_field: "note" },
      ].sort((left, right) => left.pattern.localeCompare(right.pattern)),
    );
  });

  it("rolls back all rows and rules when any row has an invalid category", async () => {
    const fixture = await createPendingRows(2);
    const rulePattern = `p3-test-${fixture.importHashes[0]}-rollback`;
    rulePatterns.push(rulePattern);

    const { data, error } = await supabase.rpc("fn_bulk_commit_import_rows", {
      p_rows: [
        { row_id: fixture.rowIds[0], suggested_category_id: categoryId },
        {
          row_id: fixture.rowIds[1],
          suggested_category_id: "00000000-0000-0000-0000-000000000000",
        },
      ],
      p_rules: [
        {
          pattern: rulePattern,
          category_id: categoryId,
          account_id: accountId,
          match_field: "payee",
        },
      ],
    });
    if (!error && data) {
      const result = data as { rows: { transaction_id: string | null }[] };
      transactionIds.push(
        ...result.rows.flatMap((row) => (row.transaction_id ? [row.transaction_id] : [])),
      );
    }
    assert.match(error?.message ?? "", /category not found/i);

    const { data: rows, error: rowsError } = await supabase
      .from("import_job_rows")
      .select("status, suggested_category_id, transaction_id")
      .in("id", fixture.rowIds);
    if (rowsError) throw rowsError;
    assert.equal(rows?.length, 2);
    assert.ok(
      rows?.every(
        (row) =>
          row.status === "pending" &&
          row.suggested_category_id === null &&
          row.transaction_id === null,
      ),
    );

    const { data: savedRules, error: rulesError } = await supabase
      .from("import_rules")
      .select("id")
      .eq("pattern", rulePattern);
    if (rulesError) throw rulesError;
    assert.equal(savedRules?.length, 0);
  });
});
