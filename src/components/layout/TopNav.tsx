"use client";
import { Bell } from "lucide-react";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { SearchBox } from "./SearchBox";

export function TopNav() {
  return (
    <header className="h-14 flex items-center px-5 gap-4 flex-shrink-0 glass border-b border-border sticky top-0 z-40">
      <SearchBox />

      <div className="flex-1" />

      {/* Persona */}
      <PersonaSwitcher />

      {/* Notifications */}
      <button className="relative w-8 h-8 rounded-xl bg-white/[0.04] border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-subtle/80 transition-all">
        <Bell size={14} />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full text-[9px] text-white flex items-center justify-center font-bold shadow-glow-red">3</span>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* User */}
      <div className="flex items-center gap-2.5 cursor-pointer group">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/40 to-blue-600/40 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
          BS
        </div>
        <div className="hidden sm:block">
          <div className="text-xs font-semibold text-text-primary leading-none mb-0.5">Badal Shah</div>
          <div className="text-[10px] text-text-secondary">PMO Director</div>
        </div>
      </div>
    </header>
  );
}
