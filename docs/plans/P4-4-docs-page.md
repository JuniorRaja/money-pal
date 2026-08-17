# P4-4 — User docs page with screenshots

**Phase:** 4 · **Depends on:** everything it documents · **Do last**

## Why

> A simple understanding document for anyone who wants to use this, once everything is
> built.

Right — once. Documentation written against a moving feature set is rewritten twice and
trusted zero times.

## Audience

Someone non-technical who has been invited or has self-hosted, and wants to know what the
app does and how to use it. **Not** a developer — `README.md`, `CLAUDE.md`, `docs/PRD.md`
and `docs/DECISIONS.md` already serve that reader well.

## Content

1. **What makes this different** — slices. One real bank balance split into owned /
   earmarked / custodial, so money you hold for someone else never inflates your net worth.
   This is the app's whole premise and the thing no other Indian finance app does. Lead with
   it, with the PRD's ₹77,000 example (₹50,000 for Mom, ₹20,000 mine, ₹7,000 emergency).
2. **Getting started** — add an account, add slices, import a statement.
3. **Importing** — supported banks and formats, what the review deck asks and why, what
   happens when a duplicate is detected, how categorisation learns from corrections.
4. **Budgets and goals** — including the rules that surprise people: no rollover
   (DECISIONS #1), goal progress is contributions not a slice balance (DECISIONS #6).
5. **The rest** — timeline, investments, notifications, the assistant and exactly what data
   it can see (aggregates only, never transaction rows — worth stating plainly, people ask).
6. **Setup** for self-hosters → link to `SETUP.md` from [P4-3](P4-3-self-host.md).

## Screenshots — capture them with Playwright

Playwright is already configured and already starts the dev server. Write a script that
signs into a demo account with seeded data, visits each page, and screenshots it into
`docs/img/`. Re-run it after UI changes.

The point is not automation for its own sake — it is that hand-taken screenshots go stale
invisibly, and a docs page showing last month's UI is worse than none. Seeded demo data also
means no real financial data ends up in a published screenshot.

## Output

A single `docs.html` — self-contained, no build step, no framework. It is a document, not
an app.

## Done when

- Every feature that exists is documented; nothing documented doesn't exist.
- Screenshots regenerate with one command.
- Someone who has never seen the app reads it and can explain what a custodial slice is.

## Out of scope

A docs site, search, versioning, i18n.
