# Phase 3: Transaction Form Enhancement

> **Priority:** High  
> **Scope:** Medium  
> **Dependencies:** Phase 1 (Categories Master)  
> **Status:** Not Started

---

## Objective

Replace the plain dropdown-based transaction form with an interactive, visually-guided experience that reduces cognitive load.

---

## Current State

- Form in `add-record-dialog.tsx`
- Uses native `<select>` dropdowns for type, account, category
- Plain text inputs for merchant, amount, notes
- All fields visible at once
- No autocomplete or smart defaults

---

## Tasks

### 3.1 Type Toggle Tabs

**Goal:** Replace type dropdown with segmented control

- [ ] Create `SegmentedControl` component (or use shadcn Tabs)
- [ ] Three segments: Income / Expense / Transfer
- [ ] Visual indication of selected type (color, icon)
- [ ] Form adapts based on selection:
  - Income: hide "to account"
  - Expense: hide "to account"  
  - Transfer: show "from" and "to" accounts, hide category

```tsx
<SegmentedControl
  options={[
    { value: 'income', label: 'Income', icon: ArrowDownLeft },
    { value: 'expense', label: 'Expense', icon: ArrowUpRight },
    { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  ]}
  value={type}
  onChange={setType}
/>
```

---

### 3.2 Merchant Autocomplete

**Goal:** Suggest merchants from transaction history

- [ ] Create `Combobox` component with search
- [ ] Fetch distinct merchants from recent transactions
- [ ] Sort by frequency (most used first)
- [ ] Show last-used category as hint
- [ ] Filter as user types
- [ ] Allow new entries (freeform)

**Data query:**
```sql
SELECT DISTINCT merchant, category_id, COUNT(*) as freq
FROM transactions
WHERE user_id = $1 AND merchant IS NOT NULL
GROUP BY merchant, category_id
ORDER BY freq DESC
LIMIT 50
```

**Files to create:**
- `src/components/combobox.tsx` — generic combobox
- `src/data/repository.ts` — add `getMerchantSuggestions()`

---

### 3.3 Description/Notes Autocomplete

**Goal:** Suggest notes based on selected merchant

- [ ] After merchant selected, fetch recent notes for that merchant
- [ ] Show as autocomplete suggestions
- [ ] Allow freeform entry

**Example flow:**
1. User types "Swiggy" in merchant
2. Notes field shows suggestions: "Dinner", "Lunch order", "Late night snack"

---

### 3.4 Smart Defaults

**Goal:** Pre-fill fields based on merchant history

When user selects a merchant from autocomplete:
- [ ] Pre-fill category with last-used category for that merchant
- [ ] Pre-fill account with last-used account for that merchant
- [ ] Show "Based on your history" hint
- [ ] Allow override

```typescript
const defaults = await getMerchantDefaults(merchant);
// { category_id: "abc", account_id: "xyz", typical_amount: 45000 }
```

---

### 3.5 Visual Amount Input

**Goal:** Make amount entry more prominent and clear

- [ ] Larger font size (text-2xl or text-3xl)
- [ ] Currency symbol prefix (₹)
- [ ] Numpad-friendly `inputMode="decimal"`
- [ ] Format with thousand separators as user types
- [ ] Clear visual feedback for valid/invalid

```tsx
<AmountInput
  value={amount}
  onChange={setAmount}
  currency="₹"
  className="text-3xl font-medium"
/>
```

---

### 3.6 Category Icon Grid

**Goal:** Visual category selection instead of dropdown

- [ ] Grid of category icons (grouped by parent)
- [ ] Show icon + name on hover/focus
- [ ] Highlight selected category
- [ ] Collapsible groups
- [ ] Search/filter option for many categories
- [ ] Reuse `CategoryPicker` from Phase 1

**Layout:**
```
┌─────────────────────────────────────────┐
│ Category                                │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┐  │
│ │ 🛒  │ 🍽️  │ ☕  │ 🛍️  │ 🎬  │ ... │  │
│ └─────┴─────┴─────┴─────┴─────┴─────┘  │
│ Groceries                    [selected] │
└─────────────────────────────────────────┘
```

---

### 3.7 Slice Picker Enhancement

**Goal:** Better UX for selecting account slices

- [ ] Only show slice picker for sliceable accounts (bank, cash)
- [ ] Use visual chips instead of dropdown
- [ ] Show slice name + color
- [ ] "No slice" option

```tsx
<SlicePicker
  accountId={selectedAccount}
  value={labelId}
  onChange={setLabelId}
/>
```

---

### 3.8 Form Layout Redesign

**Goal:** Progressive disclosure, less overwhelming

- [ ] Step-by-step or section-based layout:
  1. Type selection (tabs at top)
  2. Amount (prominent)
  3. Who/What (merchant + category)
  4. Where (account + slice)
  5. When + Notes (collapsible details)
- [ ] Mobile-friendly with touch targets
- [ ] Keyboard navigation support

---

## Acceptance Criteria

- [ ] Type selection uses segmented control
- [ ] Merchant field has working autocomplete
- [ ] Notes field suggests based on merchant
- [ ] Smart defaults pre-fill from history
- [ ] Amount input is visually prominent
- [ ] Category uses icon grid (from Phase 1)
- [ ] Slice picker shows only for relevant accounts
- [ ] Form is mobile-friendly
- [ ] Keyboard navigation works

---

## Technical Notes

### Combobox Pattern

Use Radix/shadcn Combobox or build with:
- `<input>` for search
- `<Popover>` for dropdown
- Keyboard: Arrow keys to navigate, Enter to select, Escape to close

### Merchant Suggestions API

Add to repository:
```typescript
export interface MerchantSuggestion {
  merchant: string;
  category_id: string | null;
  category_name: string | null;
  account_id: string | null;
  count: number;
}

export async function getMerchantSuggestions(
  search?: string
): Promise<MerchantSuggestion[]>
```

### Amount Formatting

```typescript
function formatAmountInput(value: string): string {
  const num = parseFloat(value.replace(/,/g, ''));
  if (isNaN(num)) return value;
  return num.toLocaleString('en-IN');
}
```

---

## UI Mockup

### Redesigned Transaction Form
```
┌─────────────────────────────────────────────────────────────┐
│ New Transaction                                         [×] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────┬─────────────┬─────────────┐                │
│ │   Income    │  ✓ Expense  │  Transfer   │                │
│ └─────────────┴─────────────┴─────────────┘                │
│                                                             │
│                      ₹ 1,250                                │
│                   ───────────                               │
│                                                             │
│ Merchant                                                    │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Swiggy                                              [▼] ││
│ └─────────────────────────────────────────────────────────┘│
│   💡 Usually: Dining Out • HDFC Bank                        │
│                                                             │
│ Category                                                    │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐         │
│ │ 🍽️  │ ☕  │ 🛒  │ 🛍️  │ 🎬  │ 💊  │ ⛽  │ ... │         │
│ └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘         │
│ Dining Out ✓                                               │
│                                                             │
│ Account                                                     │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ HDFC Bank ••••1234                                  [▼] ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ▸ More options (date, notes)                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Add Transaction]    │
└─────────────────────────────────────────────────────────────┘
```

---

## Definition of Done

- [ ] All tasks completed
- [ ] Autocomplete works with history
- [ ] Smart defaults populate correctly
- [ ] Form validates properly
- [ ] Mobile layout is usable
- [ ] Keyboard accessible
- [ ] No TypeScript errors
- [ ] Existing functionality preserved
- [ ] Code reviewed
