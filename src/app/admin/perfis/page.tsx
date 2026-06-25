import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listPerfisByTenant, getUserAccess } from "@/lib/services/perfis";
import { CAPABILITIES } from "@/lib/capabilities";
import { MODULES } from "@/lib/pageAccess";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import PerfilEditor from "./PerfilEditor";
import PerfilDeleteBtn from "./PerfilDeleteBtn";
import { ShieldCheck, Lock } from "lucide-react";

export const metadata = { title: "Perfis — Autron Dash" };

const CAP_LABEL = new Map<string, string>(CAPABILITIES.map((c) => [c.key, c.label]));
const MODULE_LABEL = new Map<string, string>(MODULES.map((m) => [m.key, m.label]));

export default async function PerfisPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("MANAGE_USERS")) {
    return (
      <AppShell title="Perfis" subtitle="Controle de acesso por perfil">
        <CardSection title="Acesso restrito">
          <p className="text-[13.5px]" style={{ color: "var(--fg-muted)" }}>
            Você não tem a permissão <strong>Administrar usuários</strong>,
            necessária para gerenciar perfis.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const perfis = await listPerfisByTenant(session.user.tenantId);
  const sistema = perfis.filter((p) => p.isSystem).length;
  const customizados = perfis.length - sistema;

  return (
    <AppShell title="Perfis" subtitle={`Acesso por perfil · @${session.user.tenantSlug}`}>
      <div className="space-y-5">
        <CardSection
          title="Perfis de acesso"
          subtitle={`${perfis.length} perfis · ${sistema} de sistema, ${customizados} personalizados`}
          actions={<PerfilEditor />}
        >
          <div className="space-y-3">
            {perfis.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--surface)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="flex size-8 items-center justify-center rounded-lg"
                        style={{ backgroundColor: "var(--surface-2)" }}
                      >
                        {p.isSystem ? (
                          <Lock className="size-4" style={{ color: "var(--fg-muted)" }} />
                        ) : (
                          <ShieldCheck className="size-4" style={{ color: "var(--color-brand-600)" }} />
                        )}
                      </span>
                      <span className="text-[14px] font-semibold" style={{ color: "var(--fg-strong)" }}>
                        {p.label}
                      </span>
                      {p.isSystem ? (
                        <StatusBadge tone="muted">Sistema</StatusBadge>
                      ) : (
                        <StatusBadge tone="brand">Personalizado</StatusBadge>
                      )}
                      <span className="text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
                        {p.userCount} usuário{p.userCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {p.descricao && (
                      <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
                        {p.descricao}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PerfilEditor
                      perfil={{
                        id: p.id,
                        label: p.label,
                        descricao: p.descricao,
                        isSystem: p.isSystem,
                        baseRole: p.baseRole,
                        modules: p.modules,
                        capabilities: p.capabilities,
                      }}
                    />
                    {!p.isSystem && (
                      <PerfilDeleteBtn id={p.id} label={p.label} userCount={p.userCount} />
                    )}
                  </div>
                </div>

                {/* Resumo de permissões */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.capabilities.length === 0 && (
                    <span className="text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
                      Somente leitura (sem permissões de ação)
                    </span>
                  )}
                  {p.capabilities.map((c) => (
                    <Chip key={c} tone="brand">
                      {CAP_LABEL.get(c) ?? c}
                    </Chip>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="text-[10.5px] uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>
                    {p.modules.length} módulos:
                  </span>
                  {p.modules.slice(0, 8).map((m) => (
                    <Chip key={m} tone="muted">
                      {MODULE_LABEL.get(m) ?? m}
                    </Chip>
                  ))}
                  {p.modules.length > 8 && (
                    <Chip tone="muted">+{p.modules.length - 8}</Chip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardSection>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Perfis de sistema não podem ser excluídos, mas seus módulos e permissões
          são editáveis. Atribua perfis aos usuários em{" "}
          <a href="/admin/usuarios" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Administração → Usuários
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "brand" | "muted" }) {
  const brand = tone === "brand";
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{
        color: brand ? "var(--color-brand-700)" : "var(--fg-muted)",
        backgroundColor: brand
          ? "color-mix(in srgb, var(--color-brand-500) 12%, transparent)"
          : "var(--surface-2)",
      }}
    >
      {children}
    </span>
  );
}
