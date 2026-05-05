"use client";
// Conditional shell — renders dashboard chrome (Sidebar + TopNav) for app routes,
// or just the bare children for /auth/* and other "naked" routes.
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";

const NAKED_PREFIXES = ["/auth/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const naked = NAKED_PREFIXES.some((p) => pathname.startsWith(p));

  if (naked) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-6 bg-canvas">{children}</main>
      </div>
    </div>
  );
}
