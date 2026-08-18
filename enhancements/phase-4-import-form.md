# Phase 4: Import Form Enhancement

> **Priority:** High  
> **Scope:** Large  
> **Dependencies:** Phase 1 (Categories), Phase 3 (Form patterns)  
> **Status:** Not Started

---

## Objective

Major overhaul of the import review experience: add Transfer type, improve rule matching with notes, fix animation performance, and add table view mode.

---

## Current State

- Import review uses "tinder-style" card swiping (`review-deck.tsx`)
- Only Income/Expense types supported (no Transfer)
- Rules match only merchant field, not notes
- Animation is laggy with many cards
- No batch operations or alternative views

---

## Tasks

### 4.1 Transfer Type in Import

**Goal:** Support transfers (e.g., cash withdrawals) in import

- [ ] Add "Transfer" to type options in import row
- [ ] When Transfer selected, show destination account picker
- [ ] Update `toStageDrafts()` to handle transfer type
- [ ] Update `commitImportRow()` to create transfer transactions
- [ ] Default ATM/withdrawal patterns to Transfer type

**Schema change for import_job_rows:**
```sql
-- type column already allows: 'income' | 'expense'
-- Update check constraint to allow 'transfer'
ALTER TABLE import_job_rows
DROP CONSTRAINT import_job_rows_type_check,
ADD CONSTRAINT import_job_rows_type_check 
CHECK (type IN ('income', 'expense', 'transfer'));

-- Add destination account for transfers
ALTER TABLE import_job_rows
ADD COLUMN to_account_id uuid REFERENCES accounts(id);
```

---

### 4.2 Notes-Based Categorization

**Goal:** Include transaction notes in rule matching

- [ ] Extend `findImportRule()` to also search `note` field
- [ ] Priority: merchant match > notes match
- [ ] Update rule creation to optionally include notes pattern

**Updated logic:**
```typescript
export function findImportRule(
  merchant: string,
  notes: string | null,  // NEW
  rules: ImportRule[],
  accountId: string,
): ImportRule | null {
  // 1. Try merchant match first
  const merchantMatch = matchMerchant(merchant, rules, accountId);
  if (merchantMatch) return merchantMatch;
  
  // 2. Try notes match
  if (notes) {
    return matchNotes(notes, rules, accountId);
  }
  
  return null;
}
```

---

### 4.3 Rule Matching Enhancement

**Goal:** More flexible rule configuration

- [ ] Add `match_field` to import_rules: 'merchant' | 'notes' | 'both'
- [ ] UI in Settings > Import Rules to configure match field
- [ ] Show which field matched when rule applies

**Migration:**
```sql
ALTER TABLE import_rules
ADD COLUMN match_field text NOT NULL DEFAULT 'merchant'
CHECK (match_field IN ('merchant', 'notes', 'both'));
```

---

### 4.4 Animation Performance Fix

**Goal:** Smooth card swiping even with many items

Current issues:
- Transform recalculations on every frame
- Too many cards in DOM
- Layout thrashing

Fixes:
- [ ] Add `will-change: transform` to animated cards
- [ ] Reduce peek stack from 4 to 2 cards
- [ ] Use CSS transitions instead of JS animation where possible
- [ ] Virtualize: only render current + 2 peek cards
- [ ] Profile with Chrome DevTools, target 60fps

**Files to modify:**
- `src/components/import/review-deck.tsx`

---

### 4.5 Table View Mode

**Goal:** Alternative bulk review interface

- [ ] Create `ReviewTable` component
- [ ] Full-width table layout:
  | Select | Date | Merchant | Amount | Type | Category | Actions |
- [ ] Inline editing for category (dropdown) and type (toggle)
- [ ] Sortable columns
- [ ] Pagination or virtual scroll for large imports

**Component structure:**
```tsx
// review-table.tsx
<table>
  <thead>...</thead>
  <tbody>
    {rows.map(row => (
      <ReviewTableRow
        key={row.id}
        row={row}
        categories={categories}
        onAccept={...}
        onSkip={...}
      />
    ))}
  </tbody>
</table>
```

---

### 4.6 View Mode Toggle

**Goal:** Switch between Card and Table view

- [ ] Add toggle button group in review header
- [ ] Icons: Cards icon / Table icon
- [ ] Persist preference in session storage
- [ ] Animate transition between views (optional)

```tsx
<ToggleGroup value={viewMode} onValueChange={setViewMode}>
  <ToggleGroupItem value="cards" aria-label="Card view">
    <LayoutGrid className="h-4 w-4" />
  </ToggleGroupItem>
  <ToggleGroupItem value="table" aria-label="Table view">
    <TableIcon className="h-4 w-4" />
  </ToggleGroupItem>
</ToggleGroup>
```

---

### 4.7 Batch Actions in Table

**Goal:** Process multiple rows at once

- [ ] Checkbox column for multi-select
- [ ] "Select all" in header
- [ ] Floating action bar when items selected:
  - Accept selected
  - Skip selected
  - Set category for selected
  - Hold selected
- [ ] Confirmation for bulk actions
- [ ] Progress indicator for batch operations

---

### 4.8 Modal Background Enhancement

**Goal:** Better visual backdrop for import modal

Current: Plain background
Target: Subtle pattern/blur matching app theme

- [ ] Add backdrop blur to modal overlay
- [ ] Use current theme pattern at low opacity
- [ ] Ensure content remains readable
- [ ] Test in both light/dark modes

```css
.import-modal-backdrop {
  backdrop-filter: blur(8px);
  background: oklch(var(--background) / 0.8);
}
```

---

## Acceptance Criteria

- [ ] Transfer type available in import review
- [ ] ATM withdrawals can be imported as transfers
- [ ] Notes field included in auto-categorization
- [ ] Card animations run at 60fps
- [ ] Table view mode available and functional
- [ ] Batch actions work correctly
- [ ] View preference persists
- [ ] Modal backdrop looks polished
- [ ] No regressions in existing import flow

---

## Technical Notes

### Transfer Transaction Creation

Transfers create two entries:
```typescript
// From fn_record_transaction
{
  type: 'transfer',
  account_id: fromAccountId,      // negative amount
  to_account_id: toAccountId,     // positive amount
  category_id: transferCategoryId // system transfer category
}
```

### Animation Optimization

```tsx
// Before
<div style={{ transform: `translateX(${dragX}px)` }}>

// After
<div 
  className="will-change-transform"
  style={{ 
    transform: `translateX(${dragX}px)`,
    transition: isDragging ? 'none' : 'transform 0.3s ease-out'
  }}
>
```

### Virtual Scrolling for Table

For 500+ rows, consider `@tanstack/react-virtual`:
```tsx
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => tableRef.current,
  estimateSize: () => 48,
});
```

---

## UI Mockup

### Table View
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Import Review                    [Cards] [Table]        142 remaining   │
├─────────────────────────────────────────────────────────────────────────┤
│ ☑ Select all                                                            │
├───┬────────────┬──────────────────┬───────────┬──────────┬─────────────┤
│ ☐ │ 07 Aug     │ Swiggy           │ ₹ 450     │ Expense▼ │ Dining Out▼ │
│ ☑ │ 07 Aug     │ Amazon           │ ₹ 2,999   │ Expense▼ │ Shopping ▼  │
│ ☑ │ 06 Aug     │ ATM Withdrawal   │ ₹ 10,000  │ Transfer▼│ [To: Cash]  │
│ ☐ │ 06 Aug     │ Netflix          │ ₹ 649     │ Expense▼ │ Subscript▼  │
│ ☐ │ 05 Aug     │ Uber             │ ₹ 234     │ Expense▼ │ Transport▼  │
└───┴────────────┴──────────────────┴───────────┴──────────┴─────────────┘
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │  2 selected     [Accept]  [Skip]  [Set Category ▼]  [Hold]          ││
│ └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Card View (Optimized)
```
┌─────────────────────────────────────────┐
│            142 left in this job         │
│                                         │
│         ┌───────────────────────┐       │
│         │  Peek card 2          │       │
│       ┌─┴─────────────────────┬─┘       │
│       │  Peek card 1          │         │
│     ┌─┴───────────────────────┴─┐       │
│     │                           │       │
│     │  07 Aug 2026              │       │
│     │  Swiggy                   │       │
│     │                    ₹ 450  │       │
│     │  Dining Out               │       │
│     │                           │       │
│     │  [Edit]                   │       │
│     └───────────────────────────┘       │
│                                         │
│   [Skip]              [Accept]          │
│                                         │
└─────────────────────────────────────────┘
```

---

## Definition of Done

- [ ] All tasks completed
- [ ] Transfer imports work end-to-end
- [ ] Rules match notes correctly
- [ ] Animation smooth on mobile devices
- [ ] Table view fully functional
- [ ] Batch actions tested
- [ ] Performance benchmarked
- [ ] No TypeScript errors
- [ ] Code reviewed
