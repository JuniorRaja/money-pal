# P4-1 — Multi-user hardening

**Phase:** 4 · **Depends on:** P0-1 (server-side guards are impossible without it) ·
**Blocks: every invite. Do this before anyone else signs up.**

## Why

The app is multi-user by design — every table has `user_id`, every RLS policy is
`user_id = auth.uid()`, RLS is on everywhere, and views are `security_invoker = true`. The
foundation is sound. But three things were deliberately loosened for solo use and must be
tightened before real people have accounts.

## The three

### 1. Signup is effectively open and unverified

`supabase/migrations/20260811150600_auto_confirm_email.sql` adds
`fn_auto_confirm_user()` + an `on_auth_user_auto_confirm` trigger that confirms **every**
signup. Its own comment says it "keeps personal use unblocked".

With this live, anyone who finds the URL can create an account with any address, including
one that isn't theirs. Remove the trigger and enable real email confirmation. If you want
invite-only, add an allowlist check in the signup path — you said "a few trusted people on
my running instance", so an allowlist is likely the right shape.

### 2. Route protection is client-side only

`src/components/app-shell.tsx:295-297` is a `useEffect` that navigates to `/login` when not
authenticated. So an unauthenticated visitor receives the **full app shell markup** from the
server before the client redirects. No `beforeLoad` guard exists anywhere.

P0-1 is what makes a server-side guard possible. Add a `beforeLoad` that validates with
`getClaims()` — **not `getSession()`**, which does not revalidate the token — and redirects
before rendering.

Also delete `src/hooks/use-require-auth.ts`: **no route imports it**, and it duplicates the
inline effect. (Also listed in P2-3.)

### 3. RLS is asserted nowhere

Policies exist but nothing tests them. Write a suite that signs in as user A and attempts
to read user B's `accounts`, `transactions`, `import_rules`, `import_jobs`, `goals`,
`budgets`, `holdings`, and every view. Expect **empty results, not errors** — an error can
mean a policy is missing rather than working.

Pay attention to the places that rely on RLS *implicitly*:
- `findExistingExternalRefs` (`src/lib/mutations.functions.ts:1221-1239`) has no explicit
  `user_id` filter.
- P0-3's `findNearDuplicates` inherits the same pattern.
- `src/integrations/supabase/client.server.ts` is a **service-role client that bypasses RLS
  entirely**. Audit every use.

## Also

- Global categories are `user_id = null` and readable by everyone — correct, but confirm no
  user can *write* one.
- `fn_handle_new_user()` creates a `profiles` row on signup; `ensureProfile()` in
  `src/components/session.tsx` is belt-and-braces on top. Confirm both still work with email
  confirmation enabled, since the trigger timing changes.
- Password reset does not exist. `src/routes/login.tsx` is email + password only — no OAuth,
  no magic link, no reset. Add reset before other people have accounts, or you become their
  password reset mechanism.

## Done when

- A new signup requires a real confirmed email (or an invite).
- An unauthenticated request to a data route redirects server-side, with no app-shell flash.
- The RLS suite passes and fails loudly if a policy is dropped.
- Password reset works.

## Out of scope

Roles/permissions, org accounts, sharing between users.
