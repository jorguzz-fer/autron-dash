import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signSsoJwt } from "@/lib/iaSso";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /chat-ia
 *
 * Handshake SSO com o Chat IA (Open WebUI via mini-proxy).
 * Verifica sessão, emite JWT curto, registra audit e redireciona
 * para `${IA_CHAT_URL}/sso?token=<jwt>`.
 *
 * Spec: docs/superpowers/specs/2026-05-20-chat-ia-openwebui-sso-design.md §4
 */
export default async function ChatIaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.email) redirect("/login");

  const secret = process.env.IA_SSO_SECRET;
  const url = process.env.IA_CHAT_URL;
  if (!secret || !url) {
    throw new Error(
      "Chat IA não configurado — defina IA_SSO_SECRET e IA_CHAT_URL no ambiente",
    );
  }

  const token = await signSsoJwt(
    {
      email: session.user.email,
      name: session.user.name ?? session.user.email,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    },
    secret,
  );

  const reqHeaders = await headers();
  const xff = reqHeaders.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : reqHeaders.get("x-real-ip");

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "ia.chat.access",
    entity: "IA",
    meta: { provider: "open-webui" },
    ip,
    userAgent: reqHeaders.get("user-agent"),
  });

  redirect(`${url}/sso?token=${token}`);
}
