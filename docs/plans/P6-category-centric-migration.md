# P6: Category-Centric Migration

> Shift from merchant-centric to category-centric transaction model.

## Summary

Currently the system treats **merchant** as the primary identifier — it's the headline in the UI, the main signal for auto-categorization, and the basis for import rules. This migration flips the model: **category** becomes the primary KPI and display element, with merchant/payee, notes, and narration serving as supporting data that helps the system auto-categorize.

## Decisions

### D1: Rename merchant → payee
The `merchant` field becomes `payee` throughout the system. It remains stored but is demoted to secondary metadata. Rationale: "payee" better describes what it actually is — the counterparty in a transaction.

### D2: Store full narration
Add a `narration` column to store the complete bank statement narration. Currently we extract merchant and discard the rest. Storing the full narration enables better pattern matching and future AI categorization.

### D3: Note takes precedence in categorization
The categorization priority order:
1. **Note** (user-typed text at payment time, e.g., "TEA" in UPI transactions)
2. **Narration** (full bank statement text)
3. **Payee** (extracted counterparty name)

### D4: Import rules support multiple match fields
Rules can now specify what field to match against:
- `note` — matches against extracted/user note
- `narration` — matches against full narration (default, backward compatible)
- `payee` — matches against extracted payee name

### D5: Category is the UI headline
Transaction list and detail views show category as the primary identifier. Payee becomes secondary. Note gets its own visible column.

### D6: Fresh start for data
Existing seeded data will be cleared. New seed data will follow the category-centric model. No migration of existing transactions or rules needed.

### D7: Search prioritizes category and note
Search now matches against: category name → note → payee → descriptor (in that order of relevance).

---

## Action Plan

### Phase 1: Database Schema ✅

**Task 1.1**: Create migration file `20260820100000_category_centric.sql` ✅
- ✅ Rename `transactions.merchant` → `transactions.payee`
- ✅ Add `transactions.narration` column (nullable text)
- ✅ Rename `import_job_rows.merchant` → `import_job_rows.payee`
- ✅ Add `import_job_rows.narration` column (nullable text)
- ✅ Create enum `import_match_field` with values: `note`, `narration`, `payee`
- ✅ Add `import_rules.match_field` column (default: `narration`)
- ✅ Rename `import_rules.match` → `import_rules.pattern`

**Task 1.2**: Update database views ✅
- ✅ `v_transactions_flat`: rename merchant → payee, add narration
- ✅ `v_credit_card_cycles`: no changes needed (doesn't use merchant)

**Task 1.3**: Update RPCs ✅
- ✅ `fn_record_transaction`: add `p_narration` parameter (now 16 params)
- ✅ `fn_update_transaction`: add `p_narration` parameter (now 18 params)
- ✅ `fn_commit_import_row`: pass narration through

**Task 1.4**: Update seed data
- Clear existing demo transactions
- Create new seed transactions with proper category assignments
- Seed sample import rules using new match_field

### Phase 2: TypeScript Types ✅

**Task 2.1**: Update `src/data/schema.ts` ✅
- ✅ `Transaction`: rename `merchant` → `payee`, add `narration`
- ✅ `ImportJobRow`: rename `merchant` → `payee`, add `narration`
- ✅ `ImportRule`: rename `match` → `pattern`, add `match_field`
- ✅ Add `ImportMatchField` type
- ✅ `PossibleDuplicate`: rename `merchant` → `payee`
- ✅ `GoalContribution`: rename `merchant` → `payee`

**Task 2.2**: Update `src/integrations/supabase/types.ts` ✅
- ✅ Update `transactions` table types (payee, narration)
- ✅ Update `import_job_rows` table types (payee, narration)
- ✅ Update `import_rules` table types (pattern, match_field)
- ✅ Update `v_transactions_flat` view types (payee, narration)
- ✅ Update RPC function signatures (fn_record_transaction, fn_update_transaction)
- ✅ Add `import_match_field` enum

### Phase 3: Data Layer ✅

**Task 3.1**: Update `src/data/live.ts` ✅
- ✅ `liveTransactions`: map payee and narration
- ✅ `liveGoalContributions`: map payee (was merchant)
- ✅ `liveImportJobRows`: map payee and narration
- ✅ `liveImportRules`: map pattern and match_field
- ✅ `attachNearDuplicates`: use payee field
- ✅ `mapReviewItem`: use payee for title

**Task 3.2**: Update `src/data/repository.ts` ✅
- ✅ `filterTransactions`: search note, payee (was merchant)
- ✅ Rename `getMerchantSuggestions` → `getPayeeSuggestions`
- ✅ Update `MerchantSuggestion` → `PayeeSuggestion` interface

**Task 3.3**: Update `src/data/mutations.ts` ✅
- ✅ `NewTransactionInput`: rename merchant → payee, add narration
- ✅ `EditTransactionInput`: same changes
- ✅ Update all transaction mutation calls

**Task 3.4**: Update `src/lib/mutations.functions.ts` ✅
- ✅ `CreateTransactionInput`: rename merchant → payee, add narration
- ✅ `UpdateTransactionInput`: same changes, add p_clear_narration
- ✅ `ImportRowDraft`: rename merchant → payee, add narration
- ✅ `CommitImportRowInput`: rename merchant → payee, match → pattern, add match_field
- ✅ `UpsertImportRuleInput`: rename match → pattern, add match_field
- ✅ `upsertImportRuleRow`: use pattern and match_field
- ✅ Update RPC call parameters (p_payee, p_narration)

### Phase 4: Import Pipeline

**Task 4.1**: Update `src/lib/import/types.ts`
- `MappedImportRow`: rename merchant → payee, add narration
- `HeuristicSuggestion`: rename merchant → payee, add narration

**Task 4.2**: Update `src/lib/import/heuristics.ts`
- `applyHeuristics`: return narration in output
- `extractMerchant`: rename to `extractPayee` (internal rename, logic unchanged)
- Update keyword matching to check note first, then narration

**Task 4.3**: Update `src/lib/import/stage.ts`
- `findImportRule`: check `match_field` to determine which field to match
- `applyImportRules`: pass full row context (note, narration, payee)
- `toStageDrafts`: include narration in output

**Task 4.4**: Update `src/lib/import/parse.ts` and `map.ts`
- Ensure narration is preserved through parsing
- Pass narration to heuristics

### Phase 5: UI Components

**Task 5.1**: Update `src/routes/transactions.tsx`
- Table columns: Category | Payee | Account | Note | Amount
- Detail panel: Category as headline, payee as subtitle
- Search placeholder: "Search category, payee, or note..."
- Edit dialog: rename Merchant field to Payee

**Task 5.2**: Update `src/components/add-record-dialog.tsx`
- Reorder: Category picker more prominent (move up)
- Rename "Merchant" label → "Payee"
- Keep Note field as-is

**Task 5.3**: Update `src/components/import/review-deck.tsx`
- Card display: Category as headline
- Show payee as secondary info
- Display note if present

**Task 5.4**: Update `src/components/import/import-wizard.tsx`
- Any merchant references → payee

**Task 5.5**: Update `src/routes/settings.tsx`
- Import rules section: show match_field selector
- Allow editing pattern and match_field
- Display rules grouped by match_field

### Phase 6: Supporting Files

**Task 6.1**: Update `src/lib/import/near-duplicate.ts`
- Rename merchant references → payee

**Task 6.2**: Update `src/lib/timeline.ts`
- Any merchant references in event generation → payee

**Task 6.3**: Update `src/routes/index.tsx` (Overview)
- Any transaction displays → use payee

**Task 6.4**: Update `src/routes/assistant.tsx`
- Context generation: use payee terminology

**Task 6.5**: Update test files
- `src/lib/import/heuristics.test.ts`
- `src/lib/import/near-duplicate.test.ts`
- Any other tests referencing merchant

### Phase 7: Documentation

**Task 7.1**: Update `docs/DECISIONS.md`
- Add decision: "Category is the primary transaction identifier"
- Add decision: "Import rules support note/narration/payee matching"
- Add decision: "Note takes precedence in auto-categorization"

**Task 7.2**: Update `README.md`
- Any user-facing documentation about transactions

---

## Testing Plan

### Unit Tests

| Test | File | Validates |
|------|------|-----------|
| Heuristics note priority | `heuristics.test.ts` | Note-based matches return higher confidence than narration-only |
| Rule matching by field | `stage.test.ts` | Rules with different match_field values work correctly |
| Payee extraction | `heuristics.test.ts` | extractPayee returns same results as old extractMerchant |
| Near-duplicate matching | `near-duplicate.test.ts` | Still works with payee field |

### Integration Tests

| Test | Validates |
|------|-----------|
| Import CSV → Review → Commit | Full pipeline works with new fields |
| Create transaction manually | Payee and narration saved correctly |
| Edit transaction | Can update payee, narration, note |
| Import rule creation | New rules save with match_field |
| Import rule application | Rules match against correct field |

### E2E Tests

| Test | File | Validates |
|------|------|-----------|
| Transaction CRUD | `transactions-crud.spec.ts` | Create/edit with payee field |
| Import flow | `imports.spec.ts` | Full import with category-centric display |
| Transaction display | `transactions-ui.spec.ts` | Category shown as primary |

---

## Success Metrics

### Functional
- [ ] Transactions display category as the headline in list view
- [ ] Transactions display category as the headline in detail panel
- [ ] Payee field stores and displays correctly (renamed from merchant)
- [ ] Narration field stores full bank statement text
- [ ] Note field displays in transaction list
- [ ] Import rules can specify match_field (note/narration/payee)
- [ ] Auto-categorization checks note first, then narration
- [ ] Search finds transactions by category name
- [ ] Search finds transactions by note content

### Data Integrity
- [ ] All existing views work after migration
- [ ] No orphaned foreign keys
- [ ] Import hash still works (doesn't include renamed fields)

### Performance
- [ ] Transaction list loads in <500ms
- [ ] Import categorization speed unchanged
- [ ] Search response time unchanged

---

## Manual Verification Checklist

### After Migration

1. **Database**
   - [ ] Run `npm run db:reset` — completes without errors
   - [ ] Check `transactions` table has `payee` and `narration` columns
   - [ ] Check `import_job_rows` table has `payee` and `narration` columns
   - [ ] Check `import_rules` table has `pattern` and `match_field` columns
   - [ ] Verify `v_transactions_flat` view returns `payee` not `merchant`

2. **Seed Data**
   - [ ] Sign in as demo@moneypal.local / demo1234
   - [ ] Verify transactions exist with proper categories
   - [ ] Verify sample import rules exist with different match_field values

### Transaction List Page

3. **Display**
   - [ ] Column order is: Date | Category | Payee | Account | Note | Amount
   - [ ] Category name is clearly visible (not just an icon)
   - [ ] Payee shows where merchant used to show
   - [ ] Note column shows user notes when present
   - [ ] Empty notes show as blank (not "—" or "null")

4. **Detail Panel**
   - [ ] Click a transaction → panel opens
   - [ ] Category is the headline (large text at top)
   - [ ] Payee shows below category (smaller, secondary)
   - [ ] Note section shows the note content

5. **Search**
   - [ ] Type a category name → matching transactions appear
   - [ ] Type a note keyword → matching transactions appear
   - [ ] Type a payee name → matching transactions appear

### Add Transaction Dialog

6. **Form Layout**
   - [ ] Category picker is prominent (not buried)
   - [ ] Field is labeled "Payee" not "Merchant"
   - [ ] Note field exists and works

7. **Smart Defaults**
   - [ ] Type a known payee → category auto-fills from history
   - [ ] This still works with the renamed field

### Edit Transaction

8. **Edit Dialog**
   - [ ] Open edit on any transaction
   - [ ] Payee field shows current value
   - [ ] Can change payee and save
   - [ ] Can change category and save
   - [ ] Can add/edit note and save

### Import Flow

9. **CSV Import**
   - [ ] Drop a bank statement CSV
   - [ ] Columns map correctly
   - [ ] Preview shows Category and Payee columns
   - [ ] Narration is extracted and stored

10. **Review Cards**
    - [ ] Cards show category as headline
    - [ ] Payee shows as secondary info
    - [ ] Note shows if extracted from narration

11. **Auto-Categorization**
    - [ ] Import a row with a note like "TEA" or "LUNCH"
    - [ ] If a rule exists for that note, category is suggested
    - [ ] Confidence is higher for note matches than narration-only

### Import Rules (Settings)

12. **Rules List**
    - [ ] Navigate to Settings → Import Rules
    - [ ] Rules show pattern and match_field
    - [ ] Can see which field each rule matches against

13. **Create Rule**
    - [ ] Create a new rule
    - [ ] Can select match_field: Note / Narration / Payee
    - [ ] Rule saves correctly

14. **Rule Application**
    - [ ] Create a rule: pattern="coffee", match_field="note", category="Dining"
    - [ ] Import a transaction with note containing "coffee"
    - [ ] Verify it gets categorized as Dining

15. **Rule Priority**
    - [ ] Create two rules for same pattern, different match_fields
    - [ ] Verify note-based rule takes precedence

### Edge Cases

16. **Empty Fields**
    - [ ] Transaction with no note → displays cleanly
    - [ ] Transaction with no payee → shows fallback (category or "—")
    - [ ] Import row with no extractable note → still categorizes via narration

17. **Long Content**
    - [ ] Long category name → truncates with ellipsis
    - [ ] Long payee name → truncates with ellipsis
    - [ ] Long note → truncates in list, full in detail

18. **Transfers**
    - [ ] Create a transfer transaction
    - [ ] Payee field is optional (can be blank)
    - [ ] Category is auto-set to "Transfer"

---

## Rollback Plan

If critical issues are found:

1. Keep the migration file but create a revert migration
2. Revert migration renames `payee` → `merchant`, drops new columns
3. Git revert the TypeScript changes
4. Run `npm run db:reset` with reverted migrations

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Database | 2 hours |
| Phase 2: Types | 30 minutes |
| Phase 3: Data Layer | 1.5 hours |
| Phase 4: Import Pipeline | 2 hours |
| Phase 5: UI Components | 2 hours |
| Phase 6: Supporting Files | 1 hour |
| Phase 7: Documentation | 30 minutes |
| Testing & Fixes | 2 hours |
| **Total** | **~12 hours** |

---

## Open Questions

1. **Note extraction behavior**: Keep extracting notes from narration tails automatically, or make notes purely user-entered?
   - **Recommendation**: Keep extraction — it captures useful context like "TEA" or "LUNCH" that users type at payment time.

2. **Narration storage**: Store raw narration or cleaned/normalized version?
   - **Recommendation**: Store raw. Normalization can happen at match time. Raw preserves information.

3. **Keyword rules update**: Current KEYWORD_RULES match on narration. Add note-specific rules?
   - **Recommendation**: Keep as-is for now. Note matching uses the same keywords. Can add note-specific rules later based on user patterns.

4. **Confidence scoring adjustment**: Should note matches get higher base confidence?
   - **Recommendation**: Yes. Note match = 0.95, Narration match = current values, Payee-only = 0.4.
