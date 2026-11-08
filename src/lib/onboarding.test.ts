import assert from "node:assert/strict";
import test from "node:test";

import { onboardingRedirect } from "./onboarding";

test("zero-account users are sent to onboarding from app routes", () => {
  assert.equal(onboardingRedirect("/transactions", 0, null), "/onboarding");
  assert.equal(onboardingRedirect("/onboarding", 0, null), null);
  assert.equal(onboardingRedirect("/login", 0, null), null);
});

test("existing-account users cannot enter onboarding unless resuming it", () => {
  assert.equal(onboardingRedirect("/onboarding", 1, null), "/");
  assert.equal(onboardingRedirect("/onboarding", 1, { userId: "user-1", step: "teach" }), null);
  assert.equal(onboardingRedirect("/onboarding", 1, { userId: "user-1", step: "done" }), null);
  assert.equal(onboardingRedirect("/transactions", 1, null), null);
});
