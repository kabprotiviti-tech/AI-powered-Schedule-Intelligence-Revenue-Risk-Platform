"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, AlertTriangle,
  BarChart3, FileDown, Settings, Zap, Upload, GitCompare,
} from "lucide-react";
import clsx from "clsx";
import { useSchedule } from "@/lib/schedule/ScheduleProvider";

const NAV = [
  { label: "Dashboard",       href: "/",          icon: LayoutDashboard },
  { label: "Import Schedule", href: "/upload",    icon: Upload },
  { label: "Compare",         href: "/compare",   icon: GitCompare },
  { label: "Projects",        href: "/projects",  icon: FolderKanban },
  { label: "Risk Register",   href: "/risks",     icon: AlertTriangle },
  { label: "Analytics",       href: "/analytics", icon: BarChart3 },
  { label: "Reports",         href: "/reports",   icon: FileDown },
];

export function Sidebar() {
  const pathname = usePathname();
  const { selected, all } = useSchedule();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border relative">
      {/* Subtle vertical gradient top edge */}
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-border/0 via-border to-border/0 pointer-events-none" />

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0">
        <div className="relative">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-glow-blue">
            <Zap size={15} className="text-white" strokeWidth={2.5} />
          </div>
          {/* Subtle glow under logo */}
          <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md -z-10" />
        </div>
        <div>
          <div className="text-sm font-bold text-text-primary tracking-widest">NEXUS</div>
          <div className="text-[9px] text-primary/70 uppercase tracking-[0.2em] font-medium">Intelligence</div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-overlay/[0.04]",
              )}
            >
              {/* Active left bar */}
              {active && (
                <span className="nav-active-bar absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full" />
              )}

              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.7}
                className={clsx(
                  "transition-transform duration-200",
                  active ? "text-primary" : "text-text-secondary group-hover:text-text-primary",
                  "group-hover:scale-110",
                )}
              />
              <span>{label}</span>

              {/* Hover background shimmer */}
              {!active && (
                <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-overlay/[0.03] to-transparent pointer-events-none" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-2.5 pb-4 space-y-1 border-t border-border pt-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-overlay/[0.04] transition-all group"
        >
          <Settings size={16} strokeWidth={1.7} className="group-hover:rotate-45 transition-transform duration-300" />
          Settings
        </Link>

        {/* Platform badge */}
        <div className="mx-1 mt-2 rounded-xl p-3 bg-gradient-to-br from-overlay/[0.04] to-transparent border border-border/60">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-success font-medium uppercase tracking-wider">Live</span>
          </div>
          <div className="text-xs font-semibold text-text-primary truncate">
            {selected.length === 0 ? "No schedule selected" :
             selected.length === 1 ? selected[0].project.name :
                                     `${selected.length} schedules`}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            {all.length === 0 ? "Import a schedule to begin" :
             `${selected.reduce((s, x) => s + x.activities.length, 0).toLocaleString()} activities · ${all.length} imported`}
          </div>
        </div>
      </div>
    </aside>
  );
}
