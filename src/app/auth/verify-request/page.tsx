"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Zap, ArrowLeft } from "lucide-react";

function VerifyContent() {
  const params = useSearchParams();
  const email = params.get("email");

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

      <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/30 flex items-center justify-center mx-auto mb-5">
        <Mail size={26} className="text-success" />
      </div>

      <h1 className="text-2xl font-bold text-text-primary mb-2">Check your inbox</h1>
      <p className="text-sm text-text-secondary mb-6 leading-relaxed">
        We sent a sign-in link to <span className="font-medium text-text-primary">{email ?? "your email"}</span>.
        <br />
        Click the link in that email to finish signing in.
      </p>

      <p className="text-[11px] text-text-secondary mb-6">
        The link expires in 60 minutes and can only be used once. Check your spam folder if you don&rsquo;t see it.
      </p>

      <Link
        href="/auth/signin"
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <ArrowLeft size={11} /> Use a different email
      </Link>
    </div>
  );
}

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-text-secondary text-sm">Loading…</div>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
