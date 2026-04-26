"use client";
import { Bell, Search, ChevronDown } from "lucide-react";
import { PersonaSwitcher } from "./PersonaSwitcher";

export function TopNav() {
  return (
    <header className="h-14 flex items-center px-6 border-b border-border bg-surface gap-4 flex-shrink-0">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-border-subtle border border-border rounded-lg text-sm text-text-secondary flex-1 max-w-xs cursor-pointer hover:border-primary/40 transition-colors">
        <Search size={14} />
        <span>Search projects, activities…</span>
        <span className="ml-auto text-[11px] bg-card px-1.5 py-0.5 rounded border border-border">⌘K</span>
      </div>

      <div className="flex-1" />

      {/* Persona Switcher */}
      <PersonaSwitcher />

      {/* Notifications */}
      <button className="relative w-8 h-8 rounded-lg bg-border-subtle border border-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors">
        <Bell size={15} />
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-danger rounded-full text-[9px] text-white flex items-center justify-center font-bold">3</span>
      </button>

      {/* User */}
      <div className="flex items-center gap-2 pl-3 border-l border-border">
        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">PM</div>
        <div className="hidden sm:block">
          <div className="text-xs font-medium text-text-primary">PMO Director</div>
          <div className="text-[11px] text-text-secondary">ALDAR Properties</div>
        </div>
        <ChevronDown size={13} className="text-text-secondary" />
      </div>
    </header>
  );
}
