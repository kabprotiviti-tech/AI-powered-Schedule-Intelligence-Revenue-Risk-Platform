// NextAuth v4 configuration — single source of truth for auth.
//
// Provider: Email (magic link) via Resend HTTP API.
// Adapter:  Prisma — writes Users/Accounts/Sessions/VerificationTokens to Postgres.
// Strategy: Database sessions (cookie carries opaque session token; lookup in DB).
//
// Future phases will add OAuth providers (Microsoft, Google, GitHub) + SAML SSO.

import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";

const resend = new Resend(process.env.RESEND_API_KEY ?? "");

const APP_NAME = "NEXUS Schedule Intelligence";
const FROM     = process.env.EMAIL_FROM ?? "NEXUS <onboarding@resend.dev>";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 24 * 30,        // 30 days
    updateAge: 60 * 60 * 24,          // refresh once a day
  },
  pages: {
    signIn:        "/auth/signin",
    verifyRequest: "/auth/verify-request",
    error:         "/auth/error",
  },
  providers: [
    EmailProvider({
      // No SMTP — we use Resend HTTP API directly.
      from: FROM,
      maxAge: 60 * 60,                // magic link valid for 60 min
      // server is required-ish for typing; we override sendVerificationRequest.
      server: { host: "noop", port: 0, auth: { user: "", pass: "" } },
      sendVerificationRequest: async ({ identifier, url }) => {
        const subject = `Sign in to ${APP_NAME}`;
        const { html, text } = renderMagicLinkEmail({ url, host: new URL(url).host });
        const result = await resend.emails.send({
          from: FROM,
          to: identifier,
          subject,
          html,
          text,
        });
        if (result.error) {
          throw new Error(`Resend send failed: ${result.error.message}`);
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Surface user id in session for downstream queries
      if (session.user) {
        (session.user as { id?: string }).id = user.id;
      }
      return session;
    },
  },
};

function renderMagicLinkEmail({ url, host }: { url: string; host: string }) {
  // Branded but minimal — corporate email clients strip aggressively.
  const html = `<!doctype html>
<html><body style="background:#f6f9fc;margin:0;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="560" align="center" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
    <tr><td>
      <div style="font-size:14px;letter-spacing:.12em;color:#3b82f6;font-weight:600;text-transform:uppercase;margin-bottom:8px">${escape(APP_NAME)}</div>
      <h1 style="margin:0 0 16px;font-size:24px;color:#0f172a">Sign in to your account</h1>
      <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px">
        Click the button below to sign in to <strong>${escape(host)}</strong>.<br/>
        This link expires in 60 minutes and can only be used once.
      </p>
      <a href="${escape(url)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px">Sign in to ${escape(APP_NAME)}</a>
      <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.5">
        If you didn&rsquo;t request this, you can safely ignore this email.<br/>
        Or copy &amp; paste this URL into your browser:<br/>
        <code style="font-size:11px;color:#475569;word-break:break-all">${escape(url)}</code>
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text = `Sign in to ${APP_NAME}

Click this link to sign in to ${host}:

${url}

This link expires in 60 minutes and can only be used once.

If you didn't request this, you can safely ignore this email.`;

  return { html, text };
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
