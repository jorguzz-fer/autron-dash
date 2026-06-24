import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ROLES_ADMIN, type Role } from "@/lib/authz";
import { listUsersByTenant, type UserRow } from "@/lib/services/users";
import { getDefaultModules, getEffectiveModules } from "@/lib/pageAccess";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import PermissoesEditor from "./PermissoesEditor";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Permissões — Autron Dash" };

const ROLE_TONE: Record<Role, "danger" | "warning" | "brand" | "success" | "muted"> = {
  ADMIN: "danger",
  DIRETOR: "warning",
  GERENTE: "brand",
  OPERADOR: "success",
  VIEWER: "muted",
  CONTROLADORIA: "brand",
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "ADMIN",
  DIRETOR: "GESTÃO",
  GERENTE: "SUPERVISÃO",
  OPERADOR: "OPERADOR",
  VIEWER: "VIEWER",
  CONTROLADORIA: "CONTROLADORIA",
};

export default async function PermissoesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userRole = session.user.role as Role;
  const isAdmin = ROLES_ADMIN.includes(userRole);

  if (!isAdmin) {
    return (
      <AppShell title="Permissões" subtitle="Controle de acesso por módulo">
        <CardSection title="Acesso restrito">
          <p className="text-[13.5px]" style={{ color: "var(--fg-muted)" }}>
            Apenas usuários com perfil <strong>ADMIN</strong> podem gerenciar permissões.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const users = await listUsersByTenant(session.user.tenantId);
  const ativos = users.filter((u) => u.active);
  const customCount = ativos.filter((u) => u.allowedModules.length > 0).length;

  return (
    <AppShell
      title="Permissões"
      subtitle={`Controle de acesso por módulo · @${session.user.tenantSlug}`}
    >
      <div className="space-y-5">
        {/* Resumo */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Usuários ativos" value={ativos.length} hint="com acesso ao sistema" />
          <StatCard
            label="Perfil padrão"
            value={ativos.length - customCount}
            hint="módulos conforme perfil"
          />
          <StatCard
            label="Acesso personalizado"
            value={customCount}
            hint="módulos customizados"
            highlight
          />
        </section>

        <CardSection
          title="Permissões por usuário"
          subtitle="Configure quais módulos cada usuário pode acessar. Usuários ADMIN sempre têm acesso total."
        >
          <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
            {users.map((user) => (
              <UserPermRow
                key={user.id}
                user={user}
                isSelf={user.id === session.user.id}
              />
            ))}
          </div>
        </CardSection>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Alterações de permissão são auditadas. Consulte em{" "}
          <a href="/admin/logs" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Administração → Logs
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}

function UserPermRow({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const hasOverride = user.allowedModules.length > 0;
  const effectiveModules = getEffectiveModules(user);
  const defaultModules = getDefaultModules(user.role);
  const role = user.role as Role;

  return (
    <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      {/* Info do usuário */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium" style={{ color: "var(--fg-strong)" }}>
            {user.name}
            {isSelf && (
              <span
                className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-brand-500) 16%, transparent)",
                  color: "var(--color-brand-600)",
                }}
              >
                Você
              </span>
            )}
          </span>
          <StatusBadge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</StatusBadge>
          {!user.active && <StatusBadge tone="muted">Inativo</StatusBadge>}
        </div>
        <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
          {user.email}
        </div>
      </div>

      {/* Status de permissão */}
      <div className="hidden shrink-0 text-right lg:block">
        {hasOverride ? (
          <div>
            <span
              className="text-[12px] font-medium"
              style={{ color: "var(--color-brand-600)" }}
            >
              {effectiveModules.length} módulos personalizados
            </span>
            <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
              padrão seria {defaultModules.length}
            </div>
          </div>
        ) : (
          <div>
            <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Padrão do perfil
            </span>
            <div className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              {defaultModules.length} módulos
            </div>
          </div>
        )}
      </div>

      {/* Ação */}
      <PermissoesEditor
        user={{
          id: user.id,
          name: user.name,
          role: user.role,
          allowedModules: user.allowedModules,
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: number;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl border p-4"
      style={{
        backgroundColor: highlight
          ? "color-mix(in srgb, var(--color-brand-500) 6%, var(--surface))"
          : "var(--surface)",
        borderColor: highlight
          ? "color-mix(in srgb, var(--color-brand-500) 30%, transparent)"
          : "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: highlight
            ? "color-mix(in srgb, var(--color-brand-500) 14%, transparent)"
            : "var(--surface-2)",
        }}
      >
        <ShieldCheck
          className="size-5"
          style={{ color: highlight ? "var(--color-brand-600)" : "var(--fg-muted)" }}
        />
      </div>
      <div className="min-w-0">
        <div
          className="text-[22px] font-bold leading-none tracking-tight"
          style={{ color: highlight ? "var(--color-brand-600)" : "var(--fg-strong)" }}
        >
          {value}
        </div>
        <div className="mt-0.5 text-[11.5px] font-medium" style={{ color: "var(--fg-muted)" }}>
          {label}
        </div>
        <div className="text-[10.5px]" style={{ color: "var(--fg-subtle)" }}>
          {hint}
        </div>
      </div>
    </div>
  );
}
