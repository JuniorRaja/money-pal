# Roadmap: from manual entry to "drop in statements"

The goal in one line: **drop in your bank and card statements → the app sorts them → it asks only
about the unclear ones → it learns from your answers → you see where your money went, with other
people's money kept apart.**

Built from what you have today: HDFC savings, DBS savings, IndusInd credit cards, and two years of
Money Manager history. No more files needed; the team tests on made-up copies of these layouts
(`src/lib/import/fixtures/`), so your real statements never leave your computer.

## Where we start, and why

Charts and AI are only as good as the numbers under them. Today the numbers are wrong in four
ways, so we fix those first, then teach the app, then add the nice parts.

## Milestone 1: "My statements import correctly, and the totals are right"

| #   | What changes for you                                                                                  | Size |
| --- | ----------------------------------------------------------------------------------------------------- | ---- |
| 1   | IndusInd card statements import (all 3 cards, both statement styles)                                  | S    |
| 2   | HDFC Excel statements are recognised as HDFC automatically                                            | S    |
| 3   | Paying your card bill from HDFC counts once, as a move, not as spending + income                      | M    |
| 4   | Self-transfers (HDFC ↔ DBS) and daily gold/SIP debits show as moves or savings, not spending          | M    |
| 5   | Possible duplicates are flagged on the review screen you actually use                                 | S    |
| 6   | If the app isn't sure of a category, it leaves it blank instead of guessing wrong                     | S    |
| 7   | Reports and goals use all your history, not just the latest 500 entries                               | M    |
| 8   | Net worth is correct when a slice holds someone else's money (a test catches it as ₹123.45 off today) | S    |

**Done when:** you import Sep–Nov from all three banks, and the month's spending matches what you
believe you spent.

## Milestone 2: "It already knows me"

| #   | What changes for you                                                                               | Size |
| --- | -------------------------------------------------------------------------------------------------- | ---- |
| 1   | Import your Money Manager history as _lessons_: Swiggy → Food, Airtel → Communication, etc.        | M    |
| 2   | Where old entries line up with bank lines (same date + amount), learn the exact reason             | M    |
| 3   | Your old "categories" that were really money moves (Dad, HDFC, Credit Card) are treated as moves   | S    |
| 4   | Payments to people: the app suggests your usual reason ("Ravi → usually Food"), you tap to confirm | M    |

**Done when:** a fresh month needs you to answer only the payments that are new or to people.

## Milestone 3: "Slices fill themselves"

Money that comes in from someone stays income, but is marked to their slice, so it's excluded from
your own net worth. You set the rule once per person ("from Mom → Mom's slice").

## Milestone 4: "Catch the why on the spot" (Discord)

After paying someone, you send the bot a 3-word note: `500 ravi lunch`. When the statement
arrives, the app matches the note to the payment by amount and date, and sorts it for you.

## Milestone 5: "See my patterns"

Money Manager-style views: a calendar of spending, a category breakdown, and a month-by-month trend.
Then simple, no-AI alerts: subscriptions total, "you'll run short on the 23rd", "food is up 30%".

## Not doing (for now)

Fancy AI or "vector graph" matching (simple memory does the job for one person), a self-host kit,
AI spending caps, email-report upgrades, insight sliders. Revisit when colleagues start using it.

## How the work flows to you

1. A milestone becomes a **PRD issue** on GitHub. The planning agent splits it into small tickets.
2. You **approve** a ticket by adding the `status:approved` label.
3. The daily run (09:00 IST) builds one approved ticket and opens a **draft pull request**.
4. Every pull request automatically runs the checks and posts a **preview link**. Open it, try the
   "How to test" steps in the PR description, then merge if it's good. Merging puts it live.
