import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Signature } from "@/components/signature";
import { useSession } from "@/components/session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Unlock Money Mate — Private Finance OS" },
      {
        name: "description",
        content:
          "Unlock the Money Mate ledger with a passphrase and a six digit code. Everything stays on this machine.",
      },
      { property: "og:title", content: "Unlock Money Mate" },
      { property: "og:description", content: "Passphrase and 2FA unlock for your local finance ledger." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { unlocked, unlock } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<"passphrase" | "code">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (unlocked) navigate({ to: "/" });
  }, [unlocked, navigate]);

  function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.trim().length < 4) {
      setError("Passphrase needs at least 4 characters.");
      return;
    }
    setError(null);
    setStep("code");
    window.setTimeout(() => boxes.current[0]?.focus(), 60);
  }

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) boxes.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) {
      window.setTimeout(() => unlock(), 260);
    }
  }

  return (
    <div className="flex min-h-screen min-w-[1180px]">
      <div className="flex w-[46%] flex-col justify-center px-24">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="h-9 w-9 text-primary" aria-hidden="true">
            <path
              d="M6 32 V10 L20 26 L34 10 V32"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="20" cy="8" r="2" fill="currentColor" />
          </svg>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">money-pal</p>
            <p className="text-[11px] text-muted-foreground">Financial OS</p>
          </div>
        </div>

        {step === "passphrase" ? (
          <form onSubmit={submitPassphrase} className="rise mt-14 max-w-[420px]">
            <h1 className="text-[44px] leading-tight">Welcome back, PR.</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your ledger lives on this machine. Unlock to pick up where you left off.
            </p>

            <label className="mt-10 block text-sm text-foreground" htmlFor="passphrase">
              Passphrase
            </label>
            <input
              id="passphrase"
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="••••••••••"
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none transition-colors focus:border-primary/60"
            />
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              className="mt-4 h-12 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-transform duration-200 hover:brightness-105 active:scale-[0.99]"
            >
              Unlock
            </button>
            <button
              type="button"
              onClick={() => {
                setPassphrase("touch-id");
                setStep("code");
                window.setTimeout(() => boxes.current[0]?.focus(), 60);
              }}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm transition-colors hover:bg-accent"
            >
              <Fingerprint className="h-4 w-4" /> Use Touch ID
            </button>

            <div className="mt-10 flex items-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Encrypted locally. No account, no cloud, no telemetry.
            </div>
          </form>
        ) : (
          <div className="rise mt-14 max-w-[420px]">
            <h1 className="text-[44px] leading-tight">Two-step check.</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Enter the six digit code from your authenticator. Any six digits work in this demo.
            </p>

            <div className="mt-10 flex gap-3">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  value={digit}
                  inputMode="numeric"
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !code[i] && i > 0) boxes.current[i - 1]?.focus();
                  }}
                  className="numeric h-14 w-14 rounded-xl border border-border bg-card text-center text-xl outline-none transition-colors focus:border-primary/60"
                />
              ))}
            </div>

            <button
              onClick={() => unlock()}
              className="mt-6 h-12 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-transform duration-200 hover:brightness-105 active:scale-[0.99]"
            >
              Verify and open ledger
            </button>
            <button
              onClick={() => setStep("passphrase")}
              className="mt-3 h-12 w-full rounded-xl border border-border bg-card text-sm transition-colors hover:bg-accent"
            >
              Back
            </button>
          </div>
        )}
      </div>

      <div className="relative isolate flex w-[54%] flex-col justify-end overflow-hidden bg-accent/60 p-12">
        <Signature variant="login" />
        <div className="relative border-t border-border/60 pt-6 text-xs text-muted-foreground">
          <p>Money Mate 0.9.4 · Local database</p>
          <p className="mt-1">~/Library/MoneyMate/ledger.db</p>
        </div>
      </div>
    </div>
  );
}
