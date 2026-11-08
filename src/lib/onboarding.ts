export type OnboardingStep = "account" | "upload" | "teach" | "done";

export type OnboardingProgress = {
  userId: string;
  step: OnboardingStep;
  jobId?: string;
  accountId?: string;
  accountName?: string;
  accountInstitution?: string;
  accountKind?: "bank" | "cash" | "credit_card" | "investment" | "loan";
  assignments?: Record<string, { categoryId: string; categoryName: string }>;
  committed?: boolean;
};

export const ONBOARDING_STORAGE_KEY = "money-mate.onboarding";

export function readOnboardingProgress(userId: string | undefined): OnboardingProgress | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const progress = JSON.parse(raw) as Partial<OnboardingProgress>;
    const steps: readonly OnboardingStep[] = ["account", "upload", "teach", "done"];
    if (progress.userId !== userId || !steps.includes(progress.step as OnboardingStep)) {
      return null;
    }
    const rawAssignments =
      progress.assignments && typeof progress.assignments === "object"
        ? Object.entries(progress.assignments)
        : [];
    const assignments = Object.fromEntries(
      rawAssignments.filter(
        ([key, value]) =>
          /^g\d+$/.test(key) &&
          typeof value?.categoryId === "string" &&
          typeof value.categoryName === "string",
      ),
    );
    const accountKinds = ["bank", "cash", "credit_card", "investment", "loan"] as const;
    return {
      userId,
      step: progress.step as OnboardingStep,
      ...(typeof progress.jobId === "string" ? { jobId: progress.jobId } : {}),
      ...(typeof progress.accountId === "string" ? { accountId: progress.accountId } : {}),
      ...(typeof progress.accountName === "string" ? { accountName: progress.accountName } : {}),
      ...(typeof progress.accountInstitution === "string"
        ? { accountInstitution: progress.accountInstitution }
        : {}),
      ...(accountKinds.includes(progress.accountKind as (typeof accountKinds)[number])
        ? { accountKind: progress.accountKind as OnboardingProgress["accountKind"] }
        : {}),
      ...(Object.keys(assignments).length ? { assignments } : {}),
      ...(progress.committed === true ? { committed: true } : {}),
    };
  } catch {
    return null;
  }
}

export function onboardingRedirect(
  pathname: string,
  accountCount: number,
  progress: OnboardingProgress | null,
): "/onboarding" | "/" | null {
  if (pathname === "/login") return null;
  if (accountCount === 0) return pathname === "/onboarding" ? null : "/onboarding";
  if (pathname === "/onboarding" && !progress) return "/";
  return null;
}
