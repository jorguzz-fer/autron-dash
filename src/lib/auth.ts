import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();

        const ipHeader = (req as { headers?: Headers })?.headers;
        const ip =
          ipHeader?.get?.("x-forwarded-for")?.split(",")[0].trim() ||
          ipHeader?.get?.("x-real-ip") ||
          "unknown";

        const [ipOk, emailOk] = await Promise.all([
          rateLimit({ key: `login:ip:${ip}`, windowSec: 900, max: 20 }),
          rateLimit({ key: `login:email:${email}`, windowSec: 3600, max: 10 }),
        ]);
        if (!ipOk.allowed || !emailOk.allowed) return null;

        const user = await prisma.user.findFirst({
          where: { email, active: true },
          include: { tenant: true },
        });
        if (!user || !user.tenant.active) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
          mustChangePassword: user.mustChangePassword,
          mfaEnabled: user.mfaEnabled,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as {
          id: string;
          role: string;
          tenantId: string;
          tenantSlug: string;
          mustChangePassword: boolean;
          mfaEnabled: boolean;
        };
        token.id = u.id;
        token.role = u.role;
        token.tenantId = u.tenantId;
        token.tenantSlug = u.tenantSlug;
        token.mustChangePassword = u.mustChangePassword;
        token.mfaEnabled = u.mfaEnabled;
        // Cada login novo começa NÃO verificado: o usuário precisa passar pelo
        // segundo fator (ou configurá-lo) antes de acessar o app. Refresh de
        // token (updateAge) preserva o valor já verificado.
        token.mfaVerified = false;
      }
      // Atualização server-side via unstable_update (ex.: após confirmar o
      // setup ou validar o código TOTP). Aceita o payload tanto em
      // `session.user` quanto na raiz.
      if (trigger === "update" && session) {
        const data = (((session as Record<string, unknown>).user as Record<string, unknown>) ??
          (session as Record<string, unknown>)) as Record<string, unknown>;
        if (typeof data.mfaVerified === "boolean") token.mfaVerified = data.mfaVerified;
        if (typeof data.mfaEnabled === "boolean") token.mfaEnabled = data.mfaEnabled;
        if (typeof data.mustChangePassword === "boolean") {
          token.mustChangePassword = data.mustChangePassword;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      session.user.mfaEnabled = token.mfaEnabled as boolean;
      session.user.mfaVerified = token.mfaVerified as boolean;
      return session;
    },
  },
});
