# Money Mate: the plans in plain English

A 10-minute read covering where the app stands, what each plan is for, the choices only you can
make, and what to do next. Codes like (P0-1) point to the original plan if you want the detail.

## 1. Where the app is today

- **Works:** You can import bank statements as CSV, Excel, or PDF (PDF only for HDFC savings). The
  file is read on your computer and never uploaded. First-time setup groups similar payments, so a
  whole statement takes a few taps.
- **Works:** Accounts split into "slices" (yours, held for someone else, set aside). Also working:
  budgets, goals, credit card bills, daily investment prices, a Telegram daily summary, a monthly
  email, and an AI chat that only sees your totals.
- **Already fixed:** Pages no longer go blank on refresh. The fake bills and made-up percentages on
  the dashboard are gone. Sign-up is invite-only, and password reset works.
- **Broken (biggest issue):** Money moved between your own accounts (card bill payments, EMIs,
  self-transfers) counts as spending on one side and income on the other. Balances and net worth are
  right, but **spending, budgets and reports show too much spending**.
- **Broken:** The app detects likely duplicates, but the review screen you now use never shows the
  warning, so a duplicate can get through without you noticing.
- **Broken:** Some categories are confidently wrong. "PARENTS" becomes Rent because it contains
  "rent", and the app then remembers that mistake.
- **Broken:** After about 500 transactions, older ones quietly drop out of reports, goals and
  insights.
- **Placeholder or untested:** The app knows only three bank layouts (HDFC savings, HDFC credit card,
  DBS). Gmail import is a "coming soon" tile. The investment trend chart shows sample data. No one
  has tested "next month's statement mostly sorts itself" on a real statement.

## 2. The plans, in one table

### Must fix (trust & safety)

| Plain name | What it means for you | Why it matters | Size | Status |
|---|---|---|---|---|
| Own-account transfers (merges the "one place" audit's top gap, P3-2, and the transfer part of enhancement 4) | Card payments and self-transfers stop counting as spending | Budgets and reports overstate spending | Medium | Not started (only a one-at-a-time manual fix exists) |
| Duplicate warnings (P0-3) | Possible duplicates are flagged where you review | Stops double-counting | Small | Partly: detected but not shown |
| No confident wrong categories (categorisation audit) | If the app is unsure, it leaves the category blank | A wrong guess hides, and the app learns it | Small–Medium | Not started |
| Keep all history (performance enhancement and audit) | Reports and goals use every transaction, not just the latest 500 | Old data silently disappears | Medium | Partly: the Transactions page is fixed |
| Pages load and errors are honest (P0-1, P0-2) | Refresh works, and real errors say so | A blank screen can't be trusted | Medium | Done |
| Remove fake numbers (P0-5, P3-5) | Every figure comes from your data | Trust | Small | Done |
| Lock the door (P4-1) | Invite-only sign-up, password reset, private data | Needed before others join | Medium | Done |
| Automatic sum checks (P2-1, P2-2) | The computer re-checks the maths after changes | Catches broken totals early | Medium | Partly: written, but the test login was broken at one point |
| Security review (P2-3) | A one-off check for leaks | Peace of mind | Small | Done (2 small leftovers) |
| Put it online (P2-4) | Runs at a real web address | Phone access | Small | Mostly done; confirm the live site works |

### Makes daily use easier

| Plain name | What it means for you | Why it matters | Size | Status |
|---|---|---|---|---|
| Smarter sorting and first-run setup (merges P7, P6, P5-1, P1-5, enhancement 4's rules part) | Payments are grouped and pre-sorted, with AI as a backup | ~100 decisions becomes a few taps | Big | Done, but never measured |
| See and edit learned rules (P1-2) | A Settings list of "this payee = this category" rules | Fix a bad rule yourself | Small | Done |
| More banks, remembered layouts (P1-3, import coverage audit) | Your other banks are recognised, and layouts aren't forgotten | Less hand-matching | Medium per bank | Not started |
| PDF statements (P1-1) | Drop in a PDF | Some banks only give PDFs | Medium | Done for HDFC savings only |
| Slices from statements (slices spec) | Money from Mom lands in Mom's slice automatically | Today everything lands in "Mine", so net worth reads too high | Medium | Not started |
| Smoother second account ("one place" audit) | Adding bank #2 is as easy as bank #1 | A statement can land in the wrong account today | Medium | Not started |
| Transaction form (enhancement 3, P1-5) | Faster entry with icons and smart defaults | Daily logging | Medium | Done for adding; editing still uses the old form, and payee is still required |
| Categories, profile, looks (enhancements 1 and 2) | Your own categories, themes, display name | Personal fit | Medium | Done |
| Timeline, bell, upcoming bills (P3-1) | "Budget 80% used", "card due soon" | You get told instead of having to check | Medium | Done |
| Card bills and EMIs (P3-2) | Card payments show against the card | Correct card and loan balances | Small | Done (by hand) |
| Telegram and email reports (P3-3) | Daily digest, monthly summary | Stay informed | Medium | Done |
| Investment prices (P3-4) | Funds and stocks update daily | A real portfolio value | Medium | Done |
| Small comforts (P0-4, P1-4, enhancement 5) | A past-imports page, Ctrl+K search, loading placeholders | Polish | Small | Done or mostly done |
| Old review screens (rest of enhancement 4) | Swipe cards and a table view | **No longer used**: the new setup screen replaced them | Medium | Drop it |

### Nice to have later

| Plain name | What it means for you | Why it matters | Size | Status |
|---|---|---|---|---|
| Bank emails as a source (P4-2) | Forwarded bank alerts show up for review | No monthly downloads | Big | Not started |
| Smart signals (P5-0, stage 2) | Subscription totals, "you'll run short on the 23rd" | Useful, and needs no AI | Medium each | Not started |
| AI settings and spending cap (P5-0, stage 1) | Choose your AI provider, with a monthly limit | **Overkill for one person** | Medium | Not started |
| Ask your ledger (P5-0, stage 5) | The chat looks up figures as you ask | Risky until everything else is solid | Big | Not started |
| Self-host kit (P4-3) | Friends run their own copy | **Overkill** unless friends ask for it | Medium | Partly |
| User guide (P4-4) | An explainer page with screenshots | Helps invited friends | Small | Partly |
| Design polish (P1-0) | One consistent look, accessibility check | Looks trustworthy | Medium | Partly |
| Email upgrades (enhancement 6) | Weekly option, delivery status, nicer layout | **Mostly overkill.** Keep only the "numbers match the app" check | Medium | Not started |
| Insight tuning (enhancement 7) | Sliders, per-category mutes, seasonal patterns | **Overkill.** A "mute this" button and a 6-month comparison cover it | Medium | Not started |
| Net worth history (P3-5, part B) | Exact month-by-month net worth | Only if the estimate starts to bother you | Medium | Not started |
| Competitor research (P5-2) | A short look at CRED, INDmoney, YNAB | Confirms what makes slices special | Small | Not started |

## 3. Decisions you need to make

1. **Own-account transfers: fix them by hand, or have the app suggest pairs for you to confirm?** By
   hand, spending stays overstated. Suggestions take some build work. *Recommend: suggest, you
   confirm, never automatic.*
2. **When the app is unsure of a category, guess or leave it blank?** A guess saves taps but can be
   silently wrong. *Recommend: blank.*
3. **Should payments under ₹200 keep importing with no category?** It's faster, but tea and autos
   never reach your budgets. *Recommend: show them on one quick "sort these" card.*
4. **Should the app learn quietly, or ask "remember this?" each time?** The written rules say ask;
   the app learns quietly. *Recommend: learn quietly, show a summary at the end, and update the
   written rule.*
5. **Should slices come from a rule ("from Mom → Mom's slice") or from picking each transaction?**
   Rules save effort but can misfire, and picking is repetitive. *Recommend: rules per account, with
   a per-transaction override later. First list your slices and which ones hold others' money.*
6. **Which banks, and is CSV enough or do you need PDF?** Each bank is set up and tested one at a
   time. *Recommend: only banks you use. Use CSV or Excel where offered, and PDF only where that's
   all the bank gives.*
7. **Who is the app for: you alone, or friends too?** This decides whether the self-host kit, the AI
   caps and the email upgrades are worth building. *Recommend: you plus a few invited friends on your
   copy. Skip the self-host kit.*
8. **Auto-fetching from email: now or later?** It's big work, and it adds more overlap with
   statements. *Recommend: later, after transfers and duplicates are reliable.*

## 4. Suggested order

1. **Fix own-account transfers.** It's the largest error in your spending numbers.
2. **Show duplicate warnings again.** Today a payment can be counted twice without you knowing.
3. **Stop confident wrong categories.** These mistakes are silent, and the app learns them.
4. **Remove the 500-transaction limit.** Otherwise your history shrinks as you use the app.
5. **Test it on your real statements, then add your other banks.** That proves whether "next month
   sorts itself" is true and shows which bank to add next.
