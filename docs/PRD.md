# Money Mate — PRD

**Version 2.1** · supersedes v1.0 entirely · 2026-08-09

v1.0 described a local-first .NET desktop app. That direction is dead.
This document is the only authority. Where `Domain.md`, `Features.md`,
`readme.md`, or `docs/phases/` disagree, they are stale.

---

## 1. What it is

A personal finance app whose defining feature is **Labels**: one real
bank account balance, split into named funds.

₹77,000 in HDFC is not one number. It is ₹50,000 held for Mom, ₹20,000
mine, ₹7,000 emergency reserve. A transaction can draw from several at
once. Net worth counts what is mine and excludes what is not.

Every other finance app forces you to choose between fake accounts and
lying to yourself. That is the whole product.

## 2. Who it is for

Me, first. People who track money in spreadsheets because no app models
their reality — money that passes through their accounts but isn't
theirs, shared trip funds, parents' money parked in their savings.

Distribution is a link. Not an installer.

## 3. Non-goals

Not a bank, payment app, trading platform, accounting ERP, tax filer,
or invoicing tool. No bank API integration. No P&L or balance-sheet
reports — this is double-entry for correctness, not for accountants.

---

## 4. Stack

| Layer  | Choice                                               |
| ------ | ---------------------------------------------------- |
| App    | Next.js 15, App Router, TypeScript strict            |
| API    | Route handlers. **No separate backend service.**     |
| DB     | Neon Postgres (hosted) · `postgres:17` (self-host)   |
| ORM    | Drizzle                                              |
| Auth   | Neon Managed Better Auth (beta) → self-hosted later  |
| Driver | `postgres.js`. **Never** `@neondatabase/serverless`. |
| UI     | Tailwind, TanStack Query, RHF + Zod, Recharts        |
| Deploy | Vercel → `app.prasannar.com`                         |

`backend/` is deleted. The Next.js frontend is kept and extended.

**Portability rule.** Self-host is two containers: the app image plus
plain Postgres. So: no Postgres-only types, UUIDs generated in TS,
migrations run on container boot, `DATABASE_URL` is the only thing that
differs between shapes.

---

## 5. Domain

### 5.1 Terminology

The concept is called **Label** — in the UI, in the code, in the schema,
in conversation. Not Allocation, not Layer, not Bucket, not Envelope.
One word.

### 5.2 The model

Three tables. Everything else derives.

```
transactions   the event        "rent, 5 Jul, ₹28,000"
entries        the ledger       which accounts and categories moved
labels         the ownership    whose money, inside one account
```

An **entry** has exactly one of `account_id` or `category_id`, and a
signed `amount_minor`. Accounts are real containers — bank, cash, card,
loan, broker. Categories are the counterparty for money entering or
leaving the system.

Rent ₹28,000, split between own funds and a trip fund:

| account | category | label | amount  |
| ------- | -------- | ----- | ------- |
| HDFC    | —        | Mine  | −18,000 |
| HDFC    | —        | Trip  | −10,000 |
| —       | Rent     | —     | +28,000 |

Transfer HDFC → ICICI:

| account | category | label | amount  |
| ------- | -------- | ----- | ------- |
| HDFC    | —        | Mine  | −50,000 |
| ICICI   | —        | Mine  | +50,000 |

Transfers need no special type and no pairing table. They are two
account-side entries.

### 5.3 The two invariants

**I1 — entries balance.** `SUM(amount_minor) = 0` per transaction.
Enforced by a deferrable Postgres constraint trigger, not by
application discipline.

**I2 — labels cannot drift.** Every account-side entry has
`label_id NOT NULL`. Therefore `sum(labels of an account) == that
account's balance` by construction. There is nothing to reconcile and
nothing to repair.

Each account is created with a system label `Unassigned`. Anything not
deliberately assigned lands there. It is never deleted or renamed.

### 5.4 Label kinds

| kind        | meaning                                | in net worth              |
| ----------- | -------------------------------------- | ------------------------- |
| `OWNED`     | mine, spendable                        | yes                       |
| `EARMARK`   | mine, reserved (emergency, goal, trip) | yes                       |
| `CUSTODIAL` | held for someone else                  | **no** — reported as owed |

This field is the reason net worth is correct. It did not exist in v1.0.

### 5.5 Scope and rules

- **Lent-out money is an account, not a disappearance.** An account of
  kind `RECEIVABLE` holds it. Lending is a transfer out, repayment a
  transfer back. Otherwise net worth silently understates for as long as
  the money is out.
- **`Unassigned` and a user's surplus label are different things.**
  Unassigned means nobody said whose it was. A label like "Excess" means
  a deliberate decision to park it. Movement between them is the user
  making a choice, and the UI should show it.
- A label belongs to **one account**. "Trip" in HDFC and "Trip" in Cash
  are two labels. They may share a name; never an id.
- **Negative labels are allowed.** Spending past a label's balance is
  permitted and flagged in the UI. Never blocked at write time.
- **Entries are append-only.** Corrections insert a reversing set plus a
  new one. `amount_minor` is never updated.
- Money is `bigint` minor units (paise). Never float, never `numeric`.
- Balances are never stored. Always `SUM(entries)`.
- `ledger_id` scopes every table and leads every composite index.

### 5.6 Derived, never stored

Account balance · label balance · category totals · budget progress ·
goal progress · net worth · amount owed to others · savings rate ·
credit utilisation.

All are one `SUM` with a different `WHERE`.

---

## 6. Build plan

Phases, not layers. No dates and no estimates — a phase is done when its
success criteria pass, and not before.

Each phase ships usable UI **and** backend. No phase delivers a backend
nobody can open.

**Order is fixed.** Every phase depends on the one before it. Do not
start a phase while the previous one has a failing criterion.

---

### Phase 1 — Ledger foundation

**Scope.** Auth, schema, the ledger engine, and the Accounts screen. The
hardest and least visible phase. Everything downstream assumes it is
correct.

**Action items**

- Delete `backend/`, `.kiro/`, `docs/phases/`, the two dead
  `CLAUDE.md — *.md` files. Move `frontend/*` to root.
- `/design-import` the Claude Design bundle. Tokens land in
  `globals.css` before any component is written.
- Neon project, Managed Better Auth, `lib/auth/session.ts` returning
  `{ userId, ledgerId }`.
- Schema: `accounts`, `labels`, `categories`, `transactions`, `entries`.
  Deferrable constraint trigger for zero-sum. `label_id NOT NULL` on
  account-side entries.
- `lib/ledger/` — post a transaction, reverse one, read balances. No
  `next/*` imports.
- System `Unassigned` label auto-created with every account.
- Accounts screen: create, archive, list with label breakdown visible
  without a click.

**Success criteria**

- `/invariant` passes: 200 random transactions, labels still sum to
  account balances
- Unbalanced entry set is rejected by the database, not the app
- Account-side entry without a label is rejected
- Cross-ledger leak test returns zero rows
- I can log in, create HDFC, add labels Mine and Mum's, and see the split

---

### Phase 2 — Transactions

**Scope.** Recording money by hand, split across labels. The screen used
most.

**Action items**

- Transaction form: date, description, amount, category, account
- Label split UI — 1 to ~5 labels, remainder auto-lands in `Unassigned`
- Transfers between accounts, including to a `RECEIVABLE` account
- Transaction list: filter by account, label, category, date
- Search across description, merchant, amount, label
- Reversal flow — never an edit of `amount_minor`

**Success criteria**

- The July walkthrough reproduces exactly: salary → Mum's 20K → EB from
  Mum's → fuel from Mine → loan repaid into Excess. Balances match by
  hand.
- A transfer moves money without touching net worth
- Lending to `RECEIVABLE` leaves net worth unchanged
- A label can go negative and says so plainly
- Search finds a transaction three ways

---

### Phase 3 — Dashboard

**Scope.** The screen opened every morning. Answers "where is my money"
in one look.

**Action items**

- Net worth: `OWNED + EARMARK` only, with owed-to-others stated
  separately and never silently folded in
- Label overview across accounts, grouped by `counterparty`
- Money in / money out by month
- Spend by category, current month
- Recent activity

**Success criteria**

- Mum's ₹50K is visibly excluded from net worth, and the exclusion is
  explained on screen
- Every figure traces to a `SUM(entries)` — nothing cached, nothing
  computed client-side
- Loads with one account and no transactions without looking broken

---

### Phase 4 — CSV / Excel import

**Scope.** The end of manual entry. HDFC and DBS first.

**Action items**

- Client-side parse. Raw file never leaves the browser.
- Column mapping UI, persisted per account as `import_profiles` rows
- `import_hash` idempotency including row index
- Review screen: new rows, skipped duplicates, unmapped columns,
  suspected transfers
- Rules-first categorisation; corrections write rules
- Commit assigns `Unassigned` unless a rule says otherwise

**Success criteria**

- A real HDFC statement imports with correct balances
- The same file imported twice changes nothing
- Two genuine same-day same-amount charges both survive
- Transfers are offered, never auto-merged
- Second import of the same account needs no re-mapping

---

### Phase 5 — Budgets

**Scope.** Category budgets. Read-only over the ledger.

**Action items**

- Monthly budget per category
- Progress = `SUM(entries WHERE category_id AND month)` versus target
- Over-budget state, visible before month end
- Rollover behaviour decided and documented in `DECISIONS.md`

**Success criteria**

- No budget has a stored balance anywhere
- Deleting a transaction updates budget progress with no reconciliation
  step
- Over-budget is obvious at a glance, not buried in a number

---

### Phase 6 — Goals

**Scope.** Targets funded by `EARMARK` labels.

**Action items**

- Goal: name, target amount, optional deadline
- Link a goal to an `EARMARK` label — progress is that label's balance
- Contribution flow = move money between labels, not a new concept

**Success criteria**

- Goal progress equals its label balance, always, with no sync step
- Goals hold no money of their own
- Deleting a goal leaves its label and its money untouched

---

> **MVP line.** Phases 1–6 replace the spreadsheet. Stop here, use it for
> a full statement cycle, and let real use decide what comes next.

---

### Phase 7 — Gmail import

**Scope.** Transaction alert emails. Cheaper per bank than PDF and
covers the same banks.

**Action items**

- Google OAuth, `gmail.readonly`. **Start app verification early** — it
  takes weeks and caps at 100 users until granted.
- Bank detection, then one isolated parser per bank per alert type
- Same normalise → dedupe → review → commit path as CSV. No second
  pipeline.
- HDFC, DBS, IndusInd, Axis first

**Success criteria**

- An alert email and its CSV row deduplicate to one transaction
- A new bank is one parser file and nothing else
- Alerts never overwrite a CSV-imported balance — they are an event
  feed, not a reconciliation source

---

### Phase 8 — PDF import

**Scope.** Statement parsing. Last because it is hardest.

**Action items**

- Password-protected PDF handling
- One bank end to end before generalising
- Scanned statements: detect and decline clearly rather than guess
- Same review path

**Success criteria**

- One real password-protected statement imports with correct balances
- A layout change fails loudly and imports nothing, rather than
  importing wrong numbers
- Second bank costs materially less than the first

---

### Bank coverage

Own accounts: HDFC, DBS. Credit cards: HDFC, IndusInd, Axis.
Obtainable: IndusInd, Axis, IOB, SBI, IDFC.

| format      | per-bank cost | why                                         |
| ----------- | ------------- | ------------------------------------------- |
| CSV / Excel | **none**      | the mapping UI covers every bank, no code   |
| Gmail       | small         | alert emails are short and templated        |
| PDF         | large         | password-locked, layout drift, some scanned |

**Out of scope until the MVP line is crossed:** Timeline, AI chat,
Reports, investments, crypto, credit-card cycle tracking, debt payoff,
financial health score, family sharing, notifications, Docker self-host,
encryption at rest.

### Definition of done — every phase

Typecheck clean · invariant tests pass · `/check` returns CLEAN · works
at 375px · dark and light both correct · loading, empty and error states
designed · no console errors · **a person can open it and use it**.

---

## 7. Auth and access

**Neon Managed Better Auth** to start — chosen for speed. Not the older
Stack Auth integration: Managed Better Auth is Neon's hosted wrapper
around the same Better Auth library, so moving to the self-hosted
library later is a config change, not a migration.

It is in beta. Everything goes behind `lib/auth/session.ts` returning
`{ userId, ledgerId }`. That is the only file that changes on rewrite —
nothing else imports the auth provider.

Public signup disabled. Users added by hand.

`ledger_id` scoping lives in the domain layer, passed explicitly into
every repository call. Postgres RLS is a second lock on top, never the
only one — the app connects as a restricted role without `BYPASSRLS`.

One test, running in CI forever: open a connection as ledger A, assert
zero rows from ledger B.

**Data handling.** Statements are parsed in the browser and discarded.
Raw files never reach the server. Deletion is real deletion, including
append-only rows. Users are told plainly: alpha software, and everything
they enter can be erased on request.

---

## 8. Import

CSV and Excel only. Client-side parse.

Column mapping is a UI, persisted per account as data — a new bank is a
config row, never a release. Idempotency by
`sha256(account|date|amount|description|rowIndex)`, unique per ledger,
so re-import is a no-op.

Two-phase commit: parsed rows land in a review screen showing new rows,
skipped duplicates, unmapped columns, and suspected transfers. Nothing
enters `entries` until the user confirms.

Categorisation is rules-first: cached merchant match, then user regex
rules, then an LLM call on unknowns only, cached by cleaned merchant
stem. Every correction writes a rule — accuracy rises and cost falls
with use.

---

## 9. AI — when it arrives

Not in the MVP. The contract, for when it arrives:

- AI never computes a balance and never writes to the ledger
- It calls typed metric functions — `getNetWorth`, `getCashflow`,
  `getLabelBalances` — and reasons over their output
- No LLM-generated SQL, ever
- Chat receives computed aggregates, not transaction rows. A few hundred
  tokens: totals by category, by label kind, by month. No merchant
  names, no account numbers, no counterparties.
- When a question genuinely needs raw rows, show the user exactly what
  will be sent and require confirmation

---

## 9a. Design system

The UI exists in Claude Design as project `money-mate`. It is a handoff,
not a rebuild.

Export → **Send to Claude Code** produces a bundle with the component
structure as a machine-readable spec, the design tokens used on canvas,
the layout hierarchy, and assets. Download the zip as backup. Or connect
the MCP server and use `/design-sync` from the terminal.

**Import at the start of Phase 1, before any component is hand-written.**
The bundle's tokens become `app/globals.css`; `ui-conventions/SKILL.md`
is rewritten to reference the real variable names. Importing later means
reconciling two design systems.

`/design-import <bundle>` does exactly this.

---

## 10. Open, and deliberately unanswered

1. **Financial health score** — appears in v1.0 docs with no formula.
   Decoration until defined. Not in MVP.
2. **Multi-currency** — single currency (INR) assumed throughout. FX
   would need a rate table and a revaluation policy.
3. **Investment pricing provider** — deferred with investments.
4. **PDF and Gmail import** — each is multi-day. Neither starts without
   an explicit decision.
5. **Docker self-host** — architecture keeps the door open; ships when
   someone asks.

---

## 11. Success

I import my own bank statement, see ₹50,000 correctly excluded from my
net worth because it is Mom's, and stop opening the spreadsheet.

Second test: one non-technical person clicks a link, signs in, adds an
account, and understands what a Label is without being told twice.
