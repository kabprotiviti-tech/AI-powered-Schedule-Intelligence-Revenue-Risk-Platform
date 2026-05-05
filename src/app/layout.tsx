import type { Metadata } from "next";
import "./globals.css";
import { PersonaProvider } from "@/components/layout/PersonaContext";
import { ThemeProvider } from "@/components/layout/ThemeContext";
import { ScheduleProvider } from "@/lib/schedule/ScheduleProvider";
import { BenchmarkProvider } from "@/lib/schedule/BenchmarkContext";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "NEXUS — Schedule Intelligence & EPMO Platform",
  description: "Tier-1 enterprise schedule intelligence and EPMO operating platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-text-primary antialiased theme-transition">
        <SessionProvider>
        <ThemeProvider>
        <ScheduleProvider>
        <BenchmarkProvider>
        <PersonaProvider>
          <AppShell>{children}</AppShell>
        </PersonaProvider>
        </BenchmarkProvider>
        </ScheduleProvider>
        </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
