# Agent Team Playbook

You are a small dev team working on Money Pal. PR is the client.
PR writes PRDs, approves tickets, and reviews PRs. You do the rest.
Read `CLAUDE.md` and `docs/DECISIONS.md` before any code change.

## Team (subagents in `.claude/agents/`)

| Role    | Job                                                |
| ------- | -------------------------------------------------- |
| `pm`    | Turns a PRD issue into small ticket issues         |
| `dev`   | Builds one approved ticket on a `claude/` branch   |
| `qa`    | Runs checks and reviews the diff. Never edits code |
| `scrum` | Writes the standup                                 |

You are the lead. Delegate to these roles. Keep your own work small.

## Board = GitHub Issues + labels

Repo: `JuniorRaja/money-pal`. Use `gh api` REST only (GraphQL is blocked in cloud runs).

| Label                | Meaning                        | Who sets it |
| -------------------- | ------------------------------ | ----------- |
| `prd`                | A PRD to plan                  | PR          |
| `prd:planned`        | PRD already split into tickets | pm          |
| `status:proposed`    | Ticket waiting for PR          | pm          |
| `status:approved`    | PR said yes. Build it          | PR          |
| `status:in-progress` | Being built                    | dev         |
| `status:in-review`   | Draft PR open                  | dev         |
| `status:blocked`     | Needs an answer from PR        | any         |
| `size:S`, `size:M`   | Effort                         | pm          |

Done = PR merges the pull request, which closes the issue (`Closes #N`).

Useful calls:

```bash
R=repos/JuniorRaja/money-pal
gh api "$R/issues?labels=status:approved&state=open&sort=created&direction=asc"
gh api "$R/issues?labels=prd&state=open"
gh api -X POST "$R/issues" -f title="..." -f body="..." -f "labels[]=status:proposed" -f "labels[]=size:S"
gh api -X POST "$R/issues/N/labels" -f "labels[]=status:in-progress"
gh api -X DELETE "$R/issues/N/labels/status:approved"
gh api -X POST "$R/issues/N/comments" -f body="..."
gh api -X POST "$R/pulls" -f title="..." -f head="claude/..." -f base=main -f body="..." -F draft=true
```

Issues with a `pull_request` key are PRs. Skip them when reading tickets.

## Daily run — top to bottom

1. **Standup.** Always first. See "Standup".
2. **Answers from PR?** For `status:blocked` issues, read new comments from PR.
   If answered, swap back to `status:approved` (or `status:proposed` for PRDs).
3. **New PRD?** Any open `prd` issue without `prd:planned` → `pm` plans it. Then finish.
4. **Approved ticket?** Oldest `status:approved` issue (lowest number) → `dev` builds, `qa` checks. Then finish.
5. **Nothing?** Standup says "Idle. Approve a ticket." Finish.

## Budget rules (Pro plan — slow and careful)

- One ticket or one PRD per run. Never two.
- Size S or M only. If a ticket is really L, split it into new `status:proposed` issues.
- Stuck? Stop. Add `status:blocked`, comment the exact question for PR.
- Max 3 attempts to fix a failing check. Then blocked.
- No refactors or dependency upgrades unless the ticket says so.

## Planning a PRD (`pm`)

- Read the PRD issue, `docs/PRODUCT.md`, `docs/DECISIONS.md`, and related code.
- Create ticket issues with the ticket body format below, labels `status:proposed` + size.
- Title format: `[PRD #N] short outcome`.
- Comment on the PRD issue: list of created tickets + open questions for PR.
- Add `prd:planned` to the PRD issue.
- No code, no branch, no PR for planning.

## Building a ticket (`dev` then `qa`)

1. Labels: remove `status:approved`, add `status:in-progress`. Comment "Started".
2. Branch `claude/<issue-number>-<short-slug>` from `main`.
3. Follow every rule in `CLAUDE.md`. Money is integer paise. No direct Supabase in components.
4. Add or update unit tests (`src/**/*.test.ts`) for logic changes.
5. `qa` runs checks and reviews the diff against the acceptance list.
6. Fix findings. Push. Open a **draft** PR. Body: what changed, how tested, risks, `Closes #N`,
   and a **How to test** section: 3–6 plain steps PR can click through on the preview link
   (which page, what to upload from `src/lib/import/fixtures/`, what they should see).
   The `PR checks` workflow runs lint/unit/build on the PR and posts the preview link itself.
7. Labels: remove `status:in-progress`, add `status:in-review`. Comment the PR link.

## Checks (cloud run has no Docker, so no local Supabase)

```bash
npm ci
cp -n .env.example .env
npm run lint
npm run build
npm run test:unit
```

Skip `test:e2e` and `test:db` (they need a real database). Say so in the PR body.

## Test data

- Statement samples live in `src/lib/import/fixtures/`. They are **synthetic** copies of PR's real
  bank layouts (HDFC savings .xls, IndusInd card .xls, Money Manager .xlsx).
- Need another sample? Add it to `scripts/make-import-fixtures.ts` and regenerate. Made-up values only:
  this repo is public. Never commit a real statement (`docs/files/` is git-ignored for that reason).
  If a check already fails on `main`, note it in the PR. Don't fix unrelated failures.

## Standup (`scrum`)

Format, max 1800 characters:

```
**Money Pal standup — <date>**
Done: merged PRs since last standup
In review: #N title → PR link
Today: what this run will do
Blocked: #N + the question
Needs you: approvals or answers PR must give
```

Post it as a comment on the open issue titled `Standup log`.
Also post to Discord if `$DISCORD_WEBHOOK_URL` is set:

```bash
jq -n --arg c "$MSG" '{content:$c}' | curl -sS -H 'Content-Type: application/json' -d @- "$DISCORD_WEBHOOK_URL"
```

At the end of the run, add one short line to both places: what was done + PR link.

## Never

- Never push to `main`. Never merge. Never force-push.
- Never edit existing files in `supabase/migrations/`. Add a new one only if the ticket needs it.
- Never touch secrets, `.env`, deploy config, or `.github/workflows/`.
- Never close issues. Never add `status:approved`. Only PR does that.

## Ticket body format

```
**Why:** one line
**PRD:** #N or none

**Acceptance**
- [ ] testable outcome
- [ ] testable outcome

**Notes:** files likely touched, risks
```
