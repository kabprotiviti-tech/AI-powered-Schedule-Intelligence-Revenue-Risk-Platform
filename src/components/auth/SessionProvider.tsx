"use client";
// Wrapper around next-auth's SessionProvider so the rest of the app can stay
// purely server-component-friendly until they actually need the session.
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
