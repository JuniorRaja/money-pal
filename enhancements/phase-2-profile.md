# Phase 2: Profile & Preferences

> **Priority:** High  
> **Scope:** Small–Medium  
> **Dependencies:** None  
> **Status:** Not Started

---

## Objective

Enhance the Settings page with editable profile, multiple theme patterns, and display formatting options.

---

## Current State

- Profile tab shows read-only fields (display name, email, currency, week start)
- Appearance tab has light/dark theme and accent colors
- Settings stored in `profiles` table and client session
- Background uses a single "mountain" pattern

---

## Tasks

### 2.1 Profile Editing

**Goal:** Make profile fields editable

- [ ] Update Profile tab UI with editable inputs
- [ ] Fields to edit:
  - Display name (text, max 60 chars)
  - Email (email input, validation)
- [ ] Add Save button with loading state
- [ ] Create/update `saveProfile()` mutation
- [ ] Show success toast on save

**Files to modify:**
- `src/routes/settings.tsx` — Profile tab
- `src/data/mutations.ts` — add `saveProfile()`

---

### 2.2 Background Patterns

**Goal:** Add 5 theme patterns for personalization

**Patterns to implement:**
| Name | Description | Light Mode | Dark Mode |
|------|-------------|------------|-----------|
| Mountain | Current default | Soft peaks | Dark ridges |
| Forest | Tree silhouettes | Green tones | Deep forest |
| Ocean | Wave patterns | Blue gradient | Deep navy |
| Starfield | Star dots | Subtle stars | Bright stars |
| Aurora | Northern lights | Pastel waves | Vibrant waves |

- [ ] Create CSS patterns or SVG backgrounds for each
- [ ] Add `theme_pattern` column to `profiles` table:
  ```sql
  ALTER TABLE public.profiles
  ADD COLUMN theme_pattern text NOT NULL DEFAULT 'mountain'
  CHECK (theme_pattern IN ('mountain', 'forest', 'ocean', 'starfield', 'aurora'));
  ```
- [ ] Store pattern choice in session prefs
- [ ] Apply pattern to app shell background

**Files to create/modify:**
- `src/styles/patterns.css` — pattern definitions
- `src/components/app-shell.tsx` — apply pattern
- `supabase/migrations/...` — add column

---

### 2.3 Pattern Preview Cards

**Goal:** Visual pattern selection in Appearance tab

- [ ] Create pattern preview component
- [ ] Show thumbnail of each pattern in current theme mode
- [ ] Highlight selected pattern
- [ ] Click to select and apply

```tsx
<PatternPicker
  patterns={['mountain', 'forest', 'ocean', 'starfield', 'aurora']}
  value={prefs.pattern}
  theme={prefs.theme}
  onChange={(pattern) => setPrefs({ pattern })}
/>
```

---

### 2.4 Currency Formatting

**Goal:** Currency display preferences

- [ ] Currency symbol position: prefix (₹100) or suffix (100₹)
- [ ] Decimal display: show paise or round to rupees
- [ ] Add to Formatting tab in Settings
- [ ] Update `formatMoney()` to respect preferences

**New prefs fields:**
```typescript
interface AppPrefs {
  // existing...
  currencyPosition: 'prefix' | 'suffix';
  showDecimals: boolean;
}
```

---

### 2.5 Week Start Preference

**Goal:** Ensure week start propagates everywhere

- [ ] Audit all date/calendar components
- [ ] Pass `weekStartsOn` to date pickers
- [ ] Update period calculations if affected
- [ ] Test with both Monday and Sunday starts

**Files to check:**
- Any component using date-fns or date calculations
- Period selectors in transactions, budgets, reports

---

### 2.6 Persist to Database

**Goal:** All new prefs saved to profiles table

- [ ] Update `saveProfile()` mutation to handle:
  - display_name
  - email
  - theme_pattern
  - currency_position (if adding column)
- [ ] Sync session prefs on save
- [ ] Load prefs from DB on session start

---

## Acceptance Criteria

- [ ] Profile tab allows editing display name and email
- [ ] 5 background patterns available in Appearance
- [ ] Pattern previews show correctly in light/dark mode
- [ ] Selected pattern applies to app background
- [ ] Currency formatting options work
- [ ] Week start preference affects all calendars
- [ ] All preferences persist to database

---

## Technical Notes

### CSS Pattern Examples

```css
/* Mountain pattern */
.pattern-mountain {
  background-image: url("data:image/svg+xml,...");
  background-size: cover;
}

/* Starfield pattern */
.pattern-starfield {
  background: radial-gradient(circle at random, white 1px, transparent 1px);
  background-size: 50px 50px;
}
```

### Pattern Application

```tsx
// app-shell.tsx
<div className={cn(
  "min-h-screen",
  `pattern-${prefs.pattern}`,
  prefs.theme === 'dark' && 'pattern-dark'
)}>
```

---

## UI Mockup

### Appearance Tab with Patterns
```
┌─────────────────────────────────────────────────────────────┐
│ Theme                                                       │
│ ┌─────────────────┐  ┌─────────────────┐                   │
│ │   ┌─────────┐   │  │   ┌─────────┐   │                   │
│ │   │ Light   │   │  │   │ Dark    │   │                   │
│ │   └─────────┘   │  │   └─────────┘   │                   │
│ │   Light mode    │  │   Dark mode     │                   │
│ └─────────────────┘  └─────────────────┘                   │
├─────────────────────────────────────────────────────────────┤
│ Background Pattern                                          │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                   │
│ │ ▲▲▲ │ │ 🌲🌲 │ │ ~~~ │ │ ✦ ✦ │ │ ≈≈≈ │                   │
│ │     │ │     │ │     │ │     │ │     │                   │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                   │
│ Mountain Forest  Ocean  Starfield Aurora                   │
│    ✓                                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Definition of Done

- [ ] All tasks completed
- [ ] Profile editing works with validation
- [ ] All 5 patterns render correctly
- [ ] Patterns look good in both themes
- [ ] Preferences persist across sessions
- [ ] No TypeScript errors
- [ ] Code reviewed
