import AppShell from "@/components/Layout/AppShell";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listAuditLogs, listAuditActions } from "@/lib/services/auditLogs";
import { listUsersByTenant } from "@/lib/services/users";
import { ROLES_ADMIN, type Role } from "@/lib/authz";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import FilterSelect from "@/components/UI/FilterSelect";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import { fmtNum } from "@/lib/format";
import { parseDateInput } from "@/lib/sort";
import { ScrollText, Activity, Users as UsersIcon } from "lucide-react";

export const metadata = { title: "Logs — Autron Dash" };

interface SP {
  usuario?: string;
  acao?: string;
  from?: string;
  to?: string;
  page?: string;
}

interface LogRow {
  id: string;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const userRole = session.user.role as Role;
  if (!ROLES_ADMIN.includes(userRole)) {
    return (
      <AppShell title="Logs" subtitle="Auditoria de atividades do tenant">
        <CardSection title="Acesso restrito">
          <p className="text-[13.5px]" style={{ color: "var(--fg-muted)" }}>
            Apenas usuários com perfil <strong>ADMIN</strong> podem consultar
            os logs de auditoria. Solicite o acesso ao administrador do seu tenant.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const tenantId = session.user.tenantId;
  const from = parseDateInput(sp.from);
  const to = parseDateInput(sp.to, true);
  const page = Math.max(1, Number(sp.page) || 1);

  const [result, actions, users] = await Promise.all([
    listAuditLogs({
      tenantId,
      userId: sp.usuario || undefined,
      action: sp.acao || undefined,
      from,
      to,
      page,
    }),
    listAuditActions(tenantId),
    listUsersByTenant(tenantId),
  ]);

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));
  const actionOptions = actions.map((a) => ({ value: a, label: a }));

  // Helper: monta querystring preservando filtros, trocando só a página.
  function pageHref(target: number) {
    const usp = new URLSearchParams();
    if (sp.usuario) usp.set("usuario", sp.usuario);
    if (sp.acao) usp.set("acao", sp.acao);
    if (sp.from) usp.set("from", sp.from);
    if (sp.to) usp.set("to", sp.to);
    if (target > 1) usp.set("page", String(target));
    const qs = usp.toString();
    return qs ? `/admin/logs?${qs}` : "/admin/logs";
  }

  return (
    <AppShell
      title="Logs"
      subtitle={`Auditoria de atividades · @${session.user.tenantSlug}`}
    >
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KPICard
            label="Eventos (filtro atual)"
            value={fmtNum(result.total)}
            hint={`página ${result.page} de ${result.totalPages}`}
            tone="brand"
            icon={<ScrollText className="size-4" />}
          />
          <KPICard
            label="Tipos de ação"
            value={fmtNum(actions.length)}
            hint="categorias distintas registradas"
            tone="neutral"
            icon={<Activity className="size-4" />}
          />
          <KPICard
            label="Usuários no tenant"
            value={fmtNum(users.length)}
            hint="cadastrados"
            tone="neutral"
            icon={<UsersIcon className="size-4" />}
          />
        </section>

        <CardSection
          title="Log de auditoria"
          subtitle={`${fmtNum(result.total)} evento(s) · mais recentes primeiro`}
        >
          {/* Filtros */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              name="usuario"
              label="Usuário"
              options={userOptions}
              value={sp.usuario}
              allLabel="Todos os usuários"
            />
            <FilterSelect
              name="acao"
              label="Ação"
              options={actionOptions}
              value={sp.acao}
              allLabel="Todas as ações"
            />
            <div className="sm:col-span-2">
              <DateRangeFilter label="Período" fromValue={sp.from} toValue={sp.to} />
            </div>
          </div>

          <DataTable
            columns={logCols}
            rows={result.rows as LogRow[]}
            rowKey={(r) => r.id}
            emptyMessage="Nenhum evento com os filtros selecionados."
          />

          {/* Paginação */}
          {result.totalPages > 1 && (
            <div
              className="mt-4 flex items-center justify-between text-[12.5px]"
              style={{ color: "var(--fg-muted)" }}
            >
              <span>
                Página <strong>{result.page}</strong> de {result.totalPages} ·{" "}
                {fmtNum(result.total)} eventos
              </span>
              <div className="flex items-center gap-2">
                {result.page > 1 ? (
                  <Link
                    href={pageHref(result.page - 1)}
                    className="ring-focus rounded-lg border px-3 py-1.5 font-medium transition-colors hover:bg-[var(--surface-2)]"
                    style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)" }}
                  >
                    ← Anterior
                  </Link>
                ) : (
                  <span
                    className="rounded-lg border px-3 py-1.5 opacity-40"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    ← Anterior
                  </span>
                )}
                {result.page < result.totalPages ? (
                  <Link
                    href={pageHref(result.page + 1)}
                    className="ring-focus rounded-lg border px-3 py-1.5 font-medium transition-colors hover:bg-[var(--surface-2)]"
                    style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)" }}
                  >
                    Próxima →
                  </Link>
                ) : (
                  <span
                    className="rounded-lg border px-3 py-1.5 opacity-40"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    Próxima →
                  </span>
                )}
              </div>
            </div>
          )}
        </CardSection>
      </div>
    </AppShell>
  );
}

const logCols: Column<LogRow>[] = [
  {
    key: "createdAt",
    header: "Data / Hora",
    cell: (r) => (
      <span className="numeric whitespace-nowrap text-[12px]">
        {r.createdAt.toLocaleString("pt-BR")}
      </span>
    ),
    width: "160px",
  },
  {
    key: "user",
    header: "Usuário",
    cell: (r) => (
      <div className="min-w-0">
        <div className="truncate text-[12.5px]" style={{ color: "var(--fg)" }}>
          {r.userName ?? "—"}
        </div>
        {r.userEmail && (
          <div
            className="max-w-[200px] truncate text-[11px]"
            style={{ color: "var(--fg-muted)" }}
            title={r.userEmail}
          >
            {r.userEmail}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "action",
    header: "Ação",
    cell: (r) => (
      <code
        className="whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11.5px]"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-brand-500) 10%, transparent)",
          color: "var(--color-brand-600)",
        }}
      >
        {r.action}
      </code>
    ),
  },
  {
    key: "entity",
    header: "Entidade",
    cell: (r) => (
      <span className="whitespace-nowrap text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {r.entity}
        {r.entityId ? ` · ${r.entityId.slice(0, 12)}` : ""}
      </span>
    ),
  },
  {
    key: "ip",
    header: "IP",
    cell: (r) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {r.ip ?? "—"}
      </span>
    ),
    width: "130px",
  },
];
