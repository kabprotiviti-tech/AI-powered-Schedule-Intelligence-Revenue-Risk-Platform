"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Zap } from "lucide-react";

const MESSAGES: Record<string, string> = {
  Configuration:    "Server is misconfigured for sign-in. Contact your administrator.",
  AccessDenied:     "Access denied for this email.",
  Verification:     "That sign-in link is no longer valid (expired or already used).",
  OAuthSignin:      "Could not start the OAuth flow.",
  OAuthCallback:    "OAuth provider returned an error.",
  OAuthCreateAccount: "Could not create an OAuth account.",
  EmailCreateAccount: "Could not create an email account.",
  Callback:         "Sign-in callback failed.",
  OAuthAccountNotLinked: "Email already linked to a different sign-in method.",
  EmailSignin:      "Could not send the sign-in email.",
  CredentialsSignin: "Invalid credentials.",
  SessionRequired:  "You must be signed in to view that page.",
  Default:          "Unable to sign in.",
};

function ErrorContent() {
  const params = useSearchParams();
  const error  = params.get("error") ?? "Default";
  const message = MESSAGES[error] ?? MESSAGES.Default;

  return (
    <div className="w-full max-w-md text-center">
      <div className="flex items-center gap-3 mb-8 justify-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-glow-blue">
          <Zap size={18} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="text-left">
          <div className="text-base font-bold text-text-primary tracking-widest">NEXUS</div>
          <div className="text-[10px] text-primary/70 uppercase tracking-[0.2em] font-medium">Schedule Intelligence</div>
        </div>
      </div>

      <div className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/30 flex items-center justify-center mx-auto mb-5">
        <AlertCircle size={26} className="text-danger" />
      </div>

      <h1 className="text-2xl font-bold text-text-primary mb-2">Sign-in failed</h1>
      <p className="text-sm text-text-secondary mb-1 leading-relaxed">{message}</p>
      <p className="text-[10px] text-text-secondary mb-6 font-mono">code: {error}</p>

      <Link
        href="/auth/signin"
        className="inline-block text-xs px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90"
      >
        Try again
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-text-secondary text-sm">Loading…</div>}>
        <ErrorContent />
      </Suspense>
    </div>
  );
}
