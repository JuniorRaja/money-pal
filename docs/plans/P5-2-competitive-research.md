# P5-2 — Competitive research

**Phase:** 5 · **Depends on:** nothing technically · **Do when:** there is something to
differentiate — after Phase 2, not before

## Why the timing

> Research other financial apps in India like CRED etc, find their moat, what's different,
> what can we implement here.

Worth doing, but researching competitors before your own core works produces a feature
wishlist rather than a strategy. After Phase 2 you will know what your app is actually good
at, and the research becomes "where do I not need to compete" — which is the useful output.

## Who to look at

- **CRED** — credit card management, rewards. Moat is a curated high-credit-score user base
  and the rewards flywheel, not the software.
- **Jupiter / Fi Money** — neobanks with money management layered on. Moat is being the bank
  account itself.
- **INDmoney** — investment tracking and aggregation, including US stocks. Closest to your
  investments feature.
- **Walnut / Axio** — SMS-based expense tracking, the original Indian category.
- **Money Manager / Wallet / Monefy** — the manual-entry category you actually compete with.
- **YNAB and Actual Budget** — non-Indian, but envelope budgeting is the closest concept to
  slices, and Actual is open-source and self-hosted like yours.

## Questions worth answering

1. **Who else models money you hold but don't own?** Your custodial slice concept excludes
   held money from net worth. Envelope budgeting (YNAB, Actual) partitions *your* money for
   *your* spending — that's a different idea. If nobody does custodial, that's the finding.
2. **How does each get transaction data in?** Account aggregator, SMS parsing, email, manual,
   statement upload. India's Account Aggregator framework is the structural answer — worth
   understanding what it takes to access, since it would obsolete much of your import work
   *if* it's reachable for an individual developer. Find out whether it is.
3. **What do their users complain about?** App store reviews and r/IndiaInvestments. Cheaper
   signal than feature lists.
4. **What is genuinely not worth competing on?** Rewards, bank partnerships, and anything
   needing an NBFC licence. Knowing where not to go matters more than the feature list.

## Your likely position, to test rather than assume

A privacy-first, self-hostable, statement-driven tracker where the differentiator is the
ownership model — custodial and earmarked money handled as a first-class concept rather
than a tag. Nothing else on that list is self-hostable, and nothing else models held money.

## Output

A short `docs/COMPETITIVE.md` — findings and what (if anything) to steal. Keep it short; the
value is in the decisions, not the survey.

## Out of scope

Building anything. This is a read-and-decide task; anything it generates becomes its own
plan.
