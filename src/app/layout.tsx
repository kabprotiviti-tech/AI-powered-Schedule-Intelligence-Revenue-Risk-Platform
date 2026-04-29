import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { PersonaProvider } from "@/components/layout/PersonaContext";
import { ThemeProvider } from "@/components/layout/ThemeContext";
import { ScheduleProvider } from "@/lib/schedule/ScheduleProvider";
import { BenchmarkProvider } from "@/lib/schedule/BenchmarkContext";

export const metadata: Metadata = {
  title: "NEXUS — Schedule Intelligence & Revenue Risk Platform",
  description: "Tier-1 enterprise schedule intelligence for ALDAR Properties",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-text-primary antialiased theme-transition">
        <ThemeProvider>
        <ScheduleProvider>
        <BenchmarkProvider>
        <PersonaProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <TopNav />
              <main className="flex-1 overflow-y-auto p-6 bg-canvas">
                {children}
              </main>
            </div>
          </div>
        </PersonaProvider>
        </BenchmarkProvider>
        </ScheduleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
