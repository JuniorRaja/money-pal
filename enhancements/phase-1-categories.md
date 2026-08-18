# Phase 1: Categories Master

> **Priority:** High — enables better categorization in later phases  
> **Scope:** Medium  
> **Dependencies:** None  
> **Status:** Not Started

---

## Objective

Build a dedicated category management UI with sensible defaults, icon selection, and parent/subcategory hierarchy.

---

## Current State

- Categories are globally seeded (no per-user customization)
- Schema: `id`, `name`, `group` (income/essentials/lifestyle/transfer/investment), `icon`, `color_token`
- Used in: transaction form, import review, budgets, reports
- Stored in `public.categories` table

---

## Tasks

### 1.1 Database Migration

**Goal:** Support subcategory hierarchy and user-specific categories

- [ ] Add `parent_id` column to `categories` table:
  ```sql
  ALTER TABLE public.categories
  ADD COLUMN parent_id uuid REFERENCES public.categories(id);
  ```
- [ ] Add `user_id` column for user-specific categories:
  ```sql
  ALTER TABLE public.categories
  ADD COLUMN user_id uuid REFERENCES auth.users(id);
  -- NULL user_id = global/seeded category
  ```
- [ ] Add `sort_order` for custom ordering:
  ```sql
  ALTER TABLE public.categories
  ADD COLUMN sort_order smallint NOT NULL DEFAULT 0;
  ```
- [ ] Update RLS policies for user-specific categories
- [ ] Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_categories_hierarchy.sql`

---

### 1.2 Update Category Seed

**Goal:** Populate sensible default categories

Replace/update existing seed with:

| Group | Categories |
|-------|-----------|
| **Income** | Salary, Freelance/Consulting, Interest & Dividends, Rental Income, Gifts Received, Refunds, Other Income |
| **Essentials** | Groceries, Rent/Mortgage, Utilities, Internet & Phone, Insurance, Healthcare & Pharmacy, Transport & Fuel, EMI Payments, Childcare & Education |
| **Lifestyle** | Dining Out, Coffee & Snacks, Shopping, Entertainment, Fitness & Sports, Personal Care, Subscriptions, Hobbies, Gifts & Donations |
| **Transfer** | Account Transfer, Cash Withdrawal, Loan Repayment |
| **Investment** | Mutual Funds, Stocks, Fixed Deposits, Gold, Crypto, Property |

- [ ] Create seed migration with icons for each category
- [ ] Use Lucide icon names (e.g., `wallet`, `home`, `shopping-cart`)
- [ ] Assign color tokens from existing palette

**File:** `supabase/migrations/YYYYMMDDHHMMSS_seed_categories_v2.sql`

---

### 1.3 Categories Settings Route

**Goal:** New page for managing categories

- [ ] Create route: `src/routes/settings.categories.tsx`
- [ ] Add to Settings navigation tabs
- [ ] Layout:
  ```
  ┌─────────────────────────────────────────┐
  │ Categories                    [+ Add]   │
  ├─────────────────────────────────────────┤
  │ ▼ Income                                │
  │   💰 Salary                      [Edit] │
  │   💼 Freelance                   [Edit] │
  │   ...                                   │
  │ ▼ Essentials                            │
  │   🛒 Groceries                   [Edit] │
  │   🏠 Rent/Mortgage               [Edit] │
  │   ...                                   │
  └─────────────────────────────────────────┘
  ```
- [ ] Collapsible groups (accordion)
- [ ] Show icon + name + color indicator
- [ ] Edit/Archive actions per category

---

### 1.4 Category CRUD UI

**Goal:** Add, edit, archive categories

**Add/Edit Dialog:**
- [ ] Name input (required, max 40 chars)
- [ ] Group dropdown (Income, Essentials, Lifestyle, Transfer, Investment)
- [ ] Icon picker (Task 1.5)
- [ ] Color token picker (existing palette)
- [ ] Parent category dropdown (optional, for subcategories)

**Archive:**
- [ ] Soft delete (set `deleted_at`)
- [ ] Warn if category has transactions
- [ ] Option to reassign transactions to another category

**Mutations:**
- [ ] `createCategory(input)` in `mutations.ts`
- [ ] `updateCategory(id, input)` in `mutations.ts`
- [ ] `archiveCategory(id, reassignTo?)` in `mutations.ts`

---

### 1.5 Icon Picker Component

**Goal:** Reusable component for selecting Lucide icons

- [ ] Create `src/components/icon-picker.tsx`
- [ ] Grid layout with search filter
- [ ] Curated subset of ~60 finance-relevant icons:
  - Money: `wallet`, `banknote`, `coins`, `piggy-bank`, `credit-card`
  - Home: `home`, `building`, `key`
  - Food: `utensils`, `coffee`, `shopping-cart`, `shopping-bag`
  - Transport: `car`, `fuel`, `train`, `plane`
  - Health: `heart-pulse`, `pill`, `stethoscope`
  - Entertainment: `tv`, `music`, `gamepad-2`, `film`
  - Work: `briefcase`, `laptop`, `building-2`
  - Utilities: `zap`, `droplet`, `phone`, `wifi`
  - Investment: `trending-up`, `bar-chart`, `landmark`
  - General: `tag`, `gift`, `sparkles`, `star`
- [ ] Show icon preview on hover
- [ ] Return selected icon name on pick

```tsx
<IconPicker
  value={selectedIcon}
  onSelect={(iconName) => setSelectedIcon(iconName)}
/>
```

---

### 1.6 Update Category Dropdowns

**Goal:** Show grouped categories in all forms

- [ ] Create `src/components/category-picker.tsx`
- [ ] Grouped display with parent/children:
  ```
  ── Income ──────────
  Salary
  Freelance
  ── Essentials ──────
  Groceries
  Rent/Mortgage
  ```
- [ ] Show icon next to each category
- [ ] Replace `<select>` in:
  - `add-record-dialog.tsx` (transaction form)
  - `review-deck.tsx` (import review)
  - `budget-dialogs.tsx` (budget forms)
- [ ] Support keyboard navigation

---

### 1.7 Update Schema Types

**Goal:** TypeScript types match new structure

- [ ] Update `Category` interface in `schema.ts`:
  ```typescript
  export interface Category {
    id: string;
    name: string;
    group: "income" | "essentials" | "lifestyle" | "transfer" | "investment";
    icon: string;
    color_token: string;
    parent_id: string | null;  // NEW
    user_id: string | null;    // NEW
    sort_order: number;        // NEW
  }
  ```
- [ ] Update `liveCategories()` to include user-specific categories
- [ ] Sort by: group → sort_order → name

---

### 1.8 Data Migration

**Goal:** Map existing transactions to new categories if structure changes

- [ ] Identify any renamed/merged categories
- [ ] Create migration script to update `category_id` references
- [ ] Handle edge cases (deleted categories with transactions)

---

## Acceptance Criteria

- [ ] Categories management page accessible at `/settings` → Categories tab
- [ ] Can add new categories with name, icon, color, group
- [ ] Can edit existing categories
- [ ] Can archive categories (with transaction reassignment option)
- [ ] Category picker shows grouped, icon-decorated list
- [ ] All existing forms use new category picker
- [ ] TypeScript types updated
- [ ] Database migration runs cleanly
- [ ] Seed data includes all proposed defaults

---

## Technical Notes

### Icon Storage

Store Lucide icon name as string (e.g., `"shopping-cart"`). Render with dynamic import:

```tsx
import * as Icons from "lucide-react";

function CategoryIcon({ name }: { name: string }) {
  const Icon = Icons[pascalCase(name)] as Icons.LucideIcon;
  return Icon ? <Icon className="h-4 w-4" /> : null;
}
```

### Color Tokens

Reuse existing color palette from schema:
```typescript
const COLOR_TOKENS = [
  "oklch(0.72 0.11 78)",   // gold
  "oklch(0.58 0.09 195)",  // teal
  "oklch(0.55 0.13 300)",  // violet
  // ... etc
];
```

### RLS for User Categories

```sql
CREATE POLICY "Users can view global + own categories"
ON public.categories FOR SELECT
USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can manage own categories"
ON public.categories FOR ALL
USING (user_id = auth.uid());
```

---

## UI Mockup

### Categories List
```
┌─────────────────────────────────────────────────────────────┐
│ Categories                                      [+ Add New] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ Income                                                    │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ 💰  Salary                                    [···] │  │
│   │ 💼  Freelance/Consulting                      [···] │  │
│   │ 📈  Interest & Dividends                      [···] │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│ ▼ Essentials                                                │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ 🛒  Groceries                                 [···] │  │
│   │ 🏠  Rent/Mortgage                             [···] │  │
│   │ ⚡  Utilities                                 [···] │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│ › Lifestyle (7)                                             │
│ › Transfer (3)                                              │
│ › Investment (6)                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Add Category Dialog
```
┌─────────────────────────────────────────┐
│ Add Category                        [×] │
├─────────────────────────────────────────┤
│                                         │
│ Name                                    │
│ ┌─────────────────────────────────────┐ │
│ │ Coffee & Snacks                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Group                                   │
│ ┌─────────────────────────────────────┐ │
│ │ Lifestyle                         ▼ │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Icon                                    │
│ ┌─────────────────────────────────────┐ │
│ │ ☕ coffee                      [Pick]│ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Color                                   │
│ [●] [●] [●] [●] [●] [●]                 │
│                                         │
├─────────────────────────────────────────┤
│               [Cancel]  [Save Category] │
└─────────────────────────────────────────┘
```

---

## Definition of Done

- [ ] All tasks completed
- [ ] Database migration tested
- [ ] Seed data populated correctly
- [ ] UI matches mockups
- [ ] No TypeScript errors
- [ ] Existing functionality unaffected
- [ ] Code reviewed
