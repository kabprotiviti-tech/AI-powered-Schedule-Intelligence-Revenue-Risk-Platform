"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut, User as UserIcon, ChevronDown, Loader2 } from "lucide-react";

export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-2.5 h-8 rounded-xl bg-overlay/[0.04] border border-border text-text-secondary text-xs">
        <Loader2 size={12} className="animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 transition-colors text-xs font-semibold"
      >
        <LogIn size={12} />
        Sign in
      </button>
    );
  }

  const name = session.user.name ?? session.user.email ?? "User";
  const email = session.user.email ?? "";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || (email[0] ?? "U").toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 cursor-pointer group"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/40 to-blue-600/40 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-xs font-semibold text-text-primary leading-none mb-0.5 truncate max-w-[140px]">{name}</div>
          <div className="text-[10px] text-text-secondary truncate max-w-[140px]">{email}</div>
        </div>
        <ChevronDown size={11} className={`text-text-secondary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-scale-in">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-xs font-semibold text-text-primary truncate">{name}</div>
            <div className="text-[11px] text-text-secondary truncate">{email}</div>
          </div>
          <ul className="py-1">
            <li>
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-overlay/[0.04] transition-colors"
              >
                <UserIcon size={12} className="text-text-secondary" />
                Account
              </Link>
            </li>
            <li>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-overlay/[0.04] transition-colors text-left"
              >
                <LogOut size={12} className="text-text-secondary" />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
