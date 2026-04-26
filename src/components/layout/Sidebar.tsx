"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, AlertTriangle, BarChart3, FileDown, Settings } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { label: "Portfolio", href: "/", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Risk Register", href: "/risks", icon: AlertTriangle },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Reports", href: "/reports", icon: FileDown },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white font-bold text-xs tracking-wider">NX</span>
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary tracking-wide">NEXUS</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest">Schedule Intelligence</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-border-subtle"
              )}
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-1">
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-border-subtle transition-all">
          <Settings size={16} strokeWidth={1.8} />
          Settings
        </Link>
        <div className="px-3 py-3 rounded-lg bg-border-subtle mt-2">
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mb-1">Platform</div>
          <div className="text-xs text-text-primary font-medium">ALDAR Properties</div>
          <div className="text-[11px] text-text-secondary">8 Active Projects</div>
        </div>
      </div>
    </aside>
  );
}
