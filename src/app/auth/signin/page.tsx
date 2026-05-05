"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Mail, ArrowRight, AlertCircle, Zap } from "lucide-react";

function SignInForm() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const errorParam  = params.get("error");
  const [email, setEmail] = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(errorMessage(errorParam));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const result = await signIn("email", {
        email: email.trim(),
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        setErr(result.error);
        setBusy(false);
        return;
      }
      // Success → NextAuth redirects to /auth/verify-request automatically when redirect:true,
      // but with redirect:false we navigate ourselves.
      window.location.href = `/auth/verify-request?email=${encodeURIComponent(email.trim())}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send sign-in link");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-glow-blue">
          <Zap size={18} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-base font-bold text-text-primary tracking-widest">NEXUS</div>
          <div className="text-[10px] text-primary/70 uppercase tracking-[0.2em] font-medium">Schedule Intelligence</div>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-text-primary mb-1">Sign in</h1>
      <p className="text-sm text-text-secondary mb-6">
        We&rsquo;ll email you a one-time link to sign in. No password.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1.5">
            Work email
          </label>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-overlay/[0.04] border border-border rounded-lg text-text-primary placeholder:text-text-secondary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {err && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-danger/30 bg-danger/8 text-danger text-xs">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Sending link…" : (<>Send sign-in link <ArrowRight size={13} /></>)}
        </button>
      </form>

      <p className="text-[11px] text-text-secondary mt-8 leading-relaxed">
        By signing in you agree to the platform terms. The link is valid for 60 minutes and can only be used once.
      </p>
    </div>
  );
}

function errorMessage(error: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case "Verification": return "That sign-in link is no longer valid. Request a new one.";
    case "Configuration": return "Authentication is misconfigured. Check email provider settings.";
    case "AccessDenied":   return "Access denied for this email.";
    case "OAuthAccountNotLinked": return "Email already linked to a different sign-in method.";
    default: return `Sign-in error (${error}). Please try again.`;
  }
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-text-secondary text-sm">Loading…</div>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
