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

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          role: string;
          tenantId: string;
          tenantSlug: string;
        };
        token.id = u.id;
        token.role = u.role;
        token.tenantId = u.tenantId;
        token.tenantSlug = u.tenantSlug;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantSlug = token.tenantSlug as string;
      return session;
    },
  },
});
