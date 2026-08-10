# New comments — Accounts + Timeline

Three open comments, all UI-level.

## 1. Global "Add new +" button with dropdown (Accounts sidebar comment)

Add a primary **Add new +** button at the top of the sidebar, just under the money-pal logo (collapses to an icon-only button when the sidebar is collapsed). Clicking opens a dropdown menu with:

- Transaction
- Account
- Goal
- Budget
- Investment

Each item opens a modal form with the right fields for that record, and saving adds the row to the session's in-memory data so it shows up on the matching page immediately (refreshes on reload, since there is no database yet).

Fields per form:
- Transaction — date, account, merchant/description, amount, direction (in/out), category, optional label, optional note
- Account — name, institution, kind (bank / cash / credit card / investment / loan), opening balance, credit limit (cards only)
- Goal — name, target amount, target date, linked account, monthly contribution
- Budget — category, monthly planned amount, period
- Investment — holding name, asset class, units, average cost, current price, linked investment account

Validation: required fields, positive amounts, valid dates; inline errors, disabled Save until valid. Success shows a toast.

## 2. Section icon next to the card title (Accounts)

On Accounts, the group icon currently sits on its own line under the panel header. Move it inline, immediately before the section title ("Cash & Bank Accounts", "Credit Cards", "Investments", "Loans"), so it reads as one title row with the account count still on the right.

## 3. Custom scrollbar in the Timeline feed

The global slim gold scrollbar is already in place, but the Timeline feed's inner scroll area still reads as a plain rail. Give scrollable inner panels a dedicated styled rail: inset gold thumb with rounded caps, faint parchment track, wider hit area on hover, and a soft top/bottom fade mask on the timeline feed so content dissolves at the edges instead of cutting off. Applied to the Timeline feed first, then reused on other inner scroll areas (transactions table, assistant thread).

## Technical notes

- Sidebar button lives in `src/components/app-shell.tsx`, using the existing shadcn `dropdown-menu` and `dialog` primitives.
- New `src/components/add-record-dialog.tsx` holds the five forms; a small `src/components/records-store.tsx` React context layers session-added rows on top of the repository reads so pages pick them up without touching `src/data/seed/*`. Repository signatures stay unchanged for the later Postgres swap.
- Accounts icon change is a markup tweak in the `Group` helper in `src/routes/accounts.tsx`.
- Scrollbar work is a `.scroll-rail` utility in `src/styles.css` plus the class applied to the scroll containers; no logic changes.
- Reply on each of the three comment threads once its work is verified.
