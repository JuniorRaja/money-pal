# Phase 7: Analysis Logic Improvements

> **Priority:** Medium  
> **Scope:** Medium  
> **Dependencies:** Phase 0 (Performance), Phase 1 (Categories)  
> **Status:** Not Started

---

## Objective

Make spending analysis smarter and user-configurable. Move away from hardcoded thresholds toward personalized, context-aware insights.

---

## Current State

From `src/lib/timeline.ts`:

```typescript
const LARGE_FACTOR = 3;        // 3× median = "unusual"
const LARGE_FLOOR = 100_000;   // ₹1,000 minimum
const LARGE_MIN_HISTORY = 5;   // need 5+ transactions
```

Issues:
- Hardcoded thresholds don't fit all users
- All-time median doesn't adapt to lifestyle changes
- No way to mute annoying insights
- Limited insight types

---

## Tasks

### 7.1 Configurable Thresholds

**Goal:** Let users adjust sensitivity

- [ ] Add analysis settings to profiles table:
  ```sql
  ALTER TABLE profiles
  ADD COLUMN analysis_factor numeric(3,1) NOT NULL DEFAULT 3.0,
  ADD COLUMN analysis_floor bigint NOT NULL DEFAULT 100000;
  ```
- [ ] Add UI in Settings → a new "Insights" or "Analysis" tab
- [ ] Slider for sensitivity: Conservative (5×) ↔ Sensitive (2×)
- [ ] Floor amount input (₹500 to ₹5,000)

```tsx
<Panel title="Spending Insights">
  <p className="text-sm text-muted-foreground mb-4">
    Control when Money Pal flags unusual spending.
  </p>
  
  <label className="block mb-4">
    <span className="text-xs">Sensitivity</span>
    <input
      type="range"
      min="2"
      max="5"
      step="0.5"
      value={factor}
      onChange={(e) => setFactor(e.target.value)}
    />
    <span className="text-xs">
      Flag spending over {factor}× your usual
    </span>
  </label>
  
  <label className="block">
    <span className="text-xs">Minimum amount</span>
    <input
      type="number"
      value={floor / 100}
      onChange={(e) => setFloor(e.target.value * 100)}
    />
    <span className="text-xs">
      Ignore transactions under ₹{floor / 100}
    </span>
  </label>
</Panel>
```

---

### 7.2 Per-Category Configuration

**Goal:** Custom thresholds per category

Some categories are always "large" (rent, insurance) and shouldn't trigger alerts.

- [ ] Add `category_analysis_overrides` table:
  ```sql
  CREATE TABLE category_analysis_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    category_id uuid NOT NULL REFERENCES categories(id),
    override_type text NOT NULL CHECK (override_type IN ('mute', 'custom')),
    custom_factor numeric(3,1),
    custom_floor bigint,
    UNIQUE(user_id, category_id)
  );
  ```
- [ ] UI to mute or customize per category
- [ ] Quick mute from timeline insight card

---

### 7.3 Trailing Window Analysis

**Goal:** Use recent history, not all-time

Current: Median of ALL transactions in category
Problem: Lifestyle changes (new job, new city) make old data irrelevant

- [ ] Change to 6-month trailing window
- [ ] Configuration option for window size (3, 6, 12 months)
- [ ] Fall back to all-time if < LARGE_MIN_HISTORY in window

```typescript
function getTrailingTransactions(
  transactions: Transaction[],
  categoryId: string,
  windowMonths: number = 6
): Transaction[] {
  const cutoff = subMonths(new Date(), windowMonths);
  return transactions.filter(t => 
    t.category_id === categoryId &&
    new Date(t.occurred_at) >= cutoff
  );
}
```

---

### 7.4 Seasonal Awareness (Optional)

**Goal:** Detect and adjust for seasonal patterns

Categories like Travel, Gifts often spike seasonally (holidays, summer).

- [ ] Track monthly category totals over 12+ months
- [ ] Detect seasonal patterns (coefficient of variation)
- [ ] Adjust "usual" baseline for current month
- [ ] Mark as "seasonal" in category settings

**Implementation approach:**
1. Build 12-month histogram per category
2. If CV > threshold, flag as seasonal
3. Compare to same-month historical, not global median

**Complexity:** High — consider making this Phase 8 or optional

---

### 7.5 New Insight Types

**Goal:** More actionable insights

Currently: Only "Unusually large {category} spend"

Add:
- [ ] **Month-over-month change**: "Dining out up 45% vs last month"
- [ ] **Budget pace alert**: "At current pace, you'll exceed Groceries budget by ₹2,000"
- [ ] **Recurring spike**: "Third month in a row Shopping exceeded budget"
- [ ] **Goal milestone**: "Emergency Fund is 75% complete!"
- [ ] **Savings opportunity**: "You saved ₹5,000 less than last month"

```typescript
// New insight generators in timeline.ts
function monthOverMonthInsights(input: TimelineInputs): TimelineEvent[] { ... }
function budgetPaceInsights(input: TimelineInputs): TimelineEvent[] { ... }
function recurringOverspendInsights(input: TimelineInputs): TimelineEvent[] { ... }
```

---

### 7.6 Mute Specific Insights

**Goal:** Dismiss recurring unwanted insights

- [ ] Add "Don't show this again" to insight cards
- [ ] Store muted insights:
  ```sql
  CREATE TABLE muted_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    insight_type text NOT NULL,  -- 'large_spend', 'budget_pace', etc.
    category_id uuid REFERENCES categories(id),  -- null = all categories
    muted_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- [ ] Filter muted insights from timeline
- [ ] UI to manage muted insights in Settings

---

## Acceptance Criteria

- [ ] Users can adjust global sensitivity
- [ ] Users can mute or customize per category
- [ ] Analysis uses trailing window (configurable)
- [ ] New insight types implemented
- [ ] Mute functionality works
- [ ] Settings UI for all configurations
- [ ] No hardcoded values in analysis code

---

## Technical Notes

### Shared Analysis Module

Create `src/lib/analysis.ts`:

```typescript
export interface AnalysisConfig {
  factor: number;        // e.g., 3.0
  floor: Paise;          // e.g., 100_000
  windowMonths: number;  // e.g., 6
  categoryOverrides: Map<string, CategoryOverride>;
  mutedInsights: MutedInsight[];
}

export function getEffectiveConfig(
  userId: string,
  categoryId: string,
  globalConfig: AnalysisConfig
): { factor: number; floor: Paise } {
  const override = globalConfig.categoryOverrides.get(categoryId);
  if (override?.override_type === 'mute') return { factor: Infinity, floor: Infinity };
  if (override?.override_type === 'custom') {
    return {
      factor: override.custom_factor ?? globalConfig.factor,
      floor: override.custom_floor ?? globalConfig.floor,
    };
  }
  return { factor: globalConfig.factor, floor: globalConfig.floor };
}
```

### Timeline Integration

```typescript
// timeline.ts
export function deriveTimelineEvents(
  input: TimelineInputs,
  config: AnalysisConfig  // NEW parameter
): TimelineEvent[] {
  return [
    ...budgetEvents(input),
    ...goalEvents(input),
    ...largeTransactionEvents(input, config),  // Pass config
    ...monthOverMonthEvents(input, config),    // NEW
    ...budgetPaceEvents(input, config),        // NEW
    // ...
  ].filter(e => !isMuted(e, config.mutedInsights));
}
```

---

## UI Mockup

### Settings → Insights Tab
```
┌─────────────────────────────────────────────────────────────┐
│ Spending Insights                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Sensitivity                                                 │
│ Conservative ──────●────── Sensitive                        │
│               Flag spending over 3× your usual              │
│                                                             │
│ Minimum amount                                              │
│ ┌─────────────────┐                                        │
│ │ ₹ 1,000         │                                        │
│ └─────────────────┘                                        │
│ Ignore smaller transactions                                 │
│                                                             │
│ Analysis window                                             │
│ ┌─────────────────┐                                        │
│ │ 6 months      ▼ │                                        │
│ └─────────────────┘                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Category Overrides                                          │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ 🏠 Rent/Mortgage                          [Muted] [×] │  │
│ │ 🛡️ Insurance                              [Muted] [×] │  │
│ └───────────────────────────────────────────────────────┘  │
│                                        [+ Add Override]     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Muted Insight Types                                         │
│                                                             │
│ ☑ Unusually large spend                                    │
│ ☐ Month-over-month changes                                 │
│ ☑ Budget pace alerts                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Definition of Done

- [ ] All tasks completed
- [ ] Configurable thresholds working
- [ ] Per-category overrides functional
- [ ] Trailing window implemented
- [ ] At least 3 new insight types added
- [ ] Mute functionality complete
- [ ] Settings UI polished
- [ ] No TypeScript errors
- [ ] Code reviewed
- [ ] Documentation updated
