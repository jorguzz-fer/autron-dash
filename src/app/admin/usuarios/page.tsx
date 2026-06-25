import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listUsersByTenant } from "@/lib/services/users";
import { getUserAccess, listPerfisAtivos } from "@/lib/services/perfis";
import { type Role } from "@/lib/authz";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import UsuarioCriarBtn from "./UsuarioCriarBtn";
import UsuarioRowActions from "./UsuarioRowActions";
import { fmtNum, fmtDate } from "@/lib/format";
import { Users, ShieldCheck, UserCheck, UserX } from "lucide-react";

export const metadata = { title: "Usuários — Autron Dash" };

interface UserRowData {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mfaEnabled: boolean;
  perfilId: string | null;
  perfilLabel: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export default async function UsuariosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Requer a capacidade de administrar usuários. Quem não tem vê "acesso negado".
  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("MANAGE_USERS")) {
    return (
      <AppShell title="Usuários" subtitle="Gestão de acessos do tenant">
        <CardSection title="Acesso restrito">
          <p className="text-[13.5px]" style={{ color: "var(--fg-muted)" }}>
            Você não tem a permissão <strong>Administrar usuários</strong>.
            Solicite o acesso ao administrador do seu tenant.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const [users, perfis] = await Promise.all([
    listUsersByTenant(session.user.tenantId),
    listPerfisAtivos(session.user.tenantId),
  ]);

  const ativos = users.filter((u) => u.active).length;
  const inativos = users.length - ativos;
  const admins = users.filter((u) => u.role === "ADMIN" && u.active).length;

  return (
    <AppShell
      title="Usuários"
      subtitle={`Gestão de acessos · @${session.user.tenantSlug}`}
    >
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard
            label="Total"
            value={fmtNum(users.length)}
            hint="cadastrados no tenant"
            tone="brand"
            icon={<Users className="size-4" />}
          />
          <KPICard
            label="Ativos"
            value={fmtNum(ativos)}
            hint="acesso liberado"
            tone="success"
            icon={<UserCheck className="size-4" />}
          />
          <KPICard
            label="Inativos"
            value={fmtNum(inativos)}
            hint="sem acesso ao sistema"
            tone="neutral"
            icon={<UserX className="size-4" />}
          />
          <KPICard
            label="Admins ativos"
            value={fmtNum(admins)}
            hint="podem gerenciar usuários"
            tone="warning"
            icon={<ShieldCheck className="size-4" />}
          />
        </section>

        <CardSection
          title="Lista de usuários"
          subtitle={`${fmtNum(users.length)} ${users.length === 1 ? "usuário" : "usuários"} · ativos primeiro`}
          actions={<UsuarioCriarBtn perfis={perfis} />}
        >
          <DataTable
            columns={getColumns(session.user.id, perfis)}
            rows={users as UserRowData[]}
            rowKey={(u) => u.id}
            emptyMessage="Nenhum usuário cadastrado neste tenant."
          />
        </CardSection>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Todas as ações são auditadas. Consulte em{" "}
          <a href="/admin/logs" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Administração → Logs
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}

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

interface PerfilOption {
  id: string;
  label: string;
  baseRole: Role;
}

function getColumns(currentUserId: string, perfis: PerfilOption[]): Column<UserRowData>[] {
  return [
    {
      key: "name",
      header: "Nome",
      sortKey: "name",
      cell: (u) => (
        <div className="flex flex-col leading-tight">
          <span style={{ color: "var(--fg-strong)" }} className="font-medium">
            {u.name}
            {u.id === currentUserId && (
              <span
                className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-brand-500) 16%, transparent)",
                  color: "var(--color-brand-600)",
                }}
              >
                Você
              </span>
            )}
          </span>
          <span className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
            {u.email}
          </span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Perfil",
      sortKey: "perfilLabel",
      cell: (u) => (
        <StatusBadge tone={ROLE_TONE[u.role]}>
          {u.perfilLabel ?? ROLE_LABEL[u.role]}
        </StatusBadge>
      ),
    },
    {
      key: "active",
      header: "Status",
      sortKey: "active",
      cell: (u) =>
        u.active ? (
          <StatusBadge tone="success">Ativo</StatusBadge>
        ) : (
          <StatusBadge tone="muted">Inativo</StatusBadge>
        ),
    },
    {
      key: "mfa",
      header: "MFA",
      sortKey: "mfaEnabled",
      cell: (u) =>
        u.mfaEnabled ? (
          <StatusBadge tone="success">Ativo</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Pendente</StatusBadge>
        ),
    },
    {
      key: "lastLogin",
      header: "Último login",
      sortKey: "lastLoginAt",
      cell: (u) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Nunca"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Criado em",
      sortKey: "createdAt",
      cell: (u) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {fmtDate(u.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (u) => (
        <UsuarioRowActions
          id={u.id}
          name={u.name}
          email={u.email}
          perfilId={u.perfilId}
          perfis={perfis}
          active={u.active}
          mfaEnabled={u.mfaEnabled}
          isSelf={u.id === currentUserId}
        />
      ),
    },
  ];
}
