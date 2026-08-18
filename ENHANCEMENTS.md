# Money Pal — Enhancement Master Plan

> **Version:** 1.0  
> **Date:** August 2026  
> **Status:** Ready for implementation

---

## Overview

This document is the master index for all planned enhancements. Each phase has its own detailed document with implementation tasks, acceptance criteria, and technical notes.

---

## Phase Summary

| Phase | Name | Priority | Scope | Dependencies | Status |
|-------|------|----------|-------|--------------|--------|
| 0 | [Performance Audit](./enhancements/phase-0-performance.md) | Critical | Medium | None | Not Started |
| 1 | [Categories Master](./enhancements/phase-1-categories.md) | High | Medium | None | Not Started |
| 2 | [Profile & Preferences](./enhancements/phase-2-profile.md) | High | Small | None | Not Started |
| 3 | [Transaction Form](./enhancements/phase-3-transaction-form.md) | High | Medium | Phase 1 | Not Started |
| 4 | [Import Form](./enhancements/phase-4-import-form.md) | High | Large | Phase 1, 3 | Not Started |
| 5 | [Loaders & Skeletons](./enhancements/phase-5-loaders.md) | Medium | Small | None | Not Started |
| 6 | [Email Alerts](./enhancements/phase-6-email.md) | Medium | Medium | Phase 0 | Not Started |
| 7 | [Analysis Logic](./enhancements/phase-7-analysis.md) | Medium | Medium | Phase 0, 1 | Not Started |

---

## Dependency Graph

```
Phase 0: Performance Audit ──┬──────────────────────────────────────────┐
                             │                                          │
Phase 1: Categories Master ──┼── Phase 3: Transaction Form ─────────────┤
                             │                                          │
Phase 2: Profile/Prefs ──────┤                                          │
                             │                                          ▼
Phase 5: Loaders ────────────┼── Phase 4: Import Form ──── Phase 6: Email
(parallel)                   │                                          │
                             │                                          ▼
                             └───────────────────────────── Phase 7: Analysis
```

---

## Recommended Implementation Order

1. **Phase 0** — Performance foundation; do first
2. **Phase 1 + 2** — Run in parallel; independent of each other
3. **Phase 5** — Can run alongside any phase; low risk
4. **Phase 3** — After Phase 1 (needs grouped categories)
5. **Phase 4** — After Phase 1 + 3 (reuses form patterns)
6. **Phase 6** — After Phase 0 (needs accurate data)
7. **Phase 7** — Last; builds on all previous work

---

## Quick Reference

### Key Files by Area

| Area | Primary Files |
|------|---------------|
| Data fetching | `src/data/repository.ts`, `src/data/live.ts` |
| Schema/Types | `src/data/schema.ts` |
| Mutations | `src/data/mutations.ts` |
| Transaction form | `src/components/add-record-dialog.tsx` |
| Import review | `src/components/import/review-deck.tsx` |
| Import rules | `src/lib/import/stage.ts` |
| Settings | `src/routes/settings.tsx` |
| Timeline/Analysis | `src/lib/timeline.ts` |
| Email | `src/lib/notify-email.ts`, `src/lib/notify.functions.ts` |
| UI components | `src/components/mm-ui.tsx`, `src/components/ui/*` |

### Tech Stack

- **Framework:** TanStack Start (React 19 + TanStack Router + Vite)
- **Database:** Supabase (PostgreSQL with RLS)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Icons:** Lucide React
- **Charts:** Recharts

---

## Notes

1. **Multi-currency** — Out of scope; currency is display-only
2. **Budget presets** — Existing 50/30/20 template is sufficient
3. **Background patterns** — 5 nature/space themes TBD
4. **Large imports** — Consider virtual scrolling for 500+ rows in table view
