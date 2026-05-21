import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signSsoJwt } from "@/lib/iaSso";
import { logAudit } from "@/lib/audit";
import { Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * GET /chat-ia
 *
 * Handshake SSO com o Chat IA (Open WebUI via mini-proxy).
 * Verifica sessão, emite JWT curto, registra audit e redireciona
 * para `${IA_CHAT_URL}/sso?token=<jwt>`.
 *
 * Spec: docs/superpowers/specs/2026-05-20-chat-ia-openwebui-sso-design.md §4
 *
 * Se IA_SSO_SECRET ou IA_CHAT_URL não estiverem configurados (ambiente de
 * deploy onde a integração ainda não foi habilitada), renderiza uma página
 * amigável em vez de crashar com "Application error".
 */
export default async function ChatIaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.email) redirect("/login");

  const secret = process.env.IA_SSO_SECRET;
  const url = process.env.IA_CHAT_URL;
  if (!secret || !url) {
    return (
      <AppShell
        title="Chat IA"
        subtitle="Assistente de IA empresarial — integração ainda não configurada"
      >
        <div
          className="mx-auto max-w-2xl rounded-2xl border p-8 text-center"
          style={{
            borderColor: "var(--border-soft)",
            backgroundColor: "var(--surface)",
          }}
        >
          <div
            className="mx-auto flex size-12 items-center justify-center rounded-full"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-brand-500) 14%, transparent)",
              color: "var(--color-brand-600)",
            }}
          >
            <Wrench className="size-5" />
          </div>
          <h2
            className="mt-4 text-[18px] font-semibold"
            style={{ color: "var(--fg-strong)" }}
          >
            Chat IA ainda não disponível
          </h2>
          <p
            className="mt-2 text-[13.5px] leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            A integração com o assistente de IA ainda não foi habilitada neste
            ambiente. Avise o administrador do sistema para configurar as
            variáveis <code className="font-mono">IA_SSO_SECRET</code> e{" "}
            <code className="font-mono">IA_CHAT_URL</code>.
          </p>
        </div>
      </AppShell>
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
