"use client";
import { Bell } from "lucide-react";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { SearchBox } from "./SearchBox";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { UserMenu } from "./UserMenu";

export function TopNav() {
  return (
    <header className="h-14 flex items-center px-5 gap-4 flex-shrink-0 glass border-b border-border sticky top-0 z-40">
      <SearchBox />

      <div className="flex-1" />

      <PersonaSwitcher />

      <ThemeSwitcher />

      {/* Notifications — placeholder until P2 alert engine is wired */}
      <button className="relative w-8 h-8 rounded-xl bg-overlay/[0.04] border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-subtle/80 transition-all">
        <Bell size={14} />
      </button>

      <div className="w-px h-5 bg-border" />

      <UserMenu />
    </header>
  );
}
