import AppShell from "@/components/Layout/AppShell";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import { auth } from "@/lib/auth";
import { ROLES_CONTROLADORIA, type Role } from "@/lib/authz";
import { fmtCurrency, fmtDate, fmtNum } from "@/lib/format";
import { listarConciliacoesPorTenant } from "@/lib/services/conciliacao";
import { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Conciliações — Autron Dash" };

type ConciliacaoLinha = {
  id: string;
  contaContabil: string;
  descricaoConta: string | null;
  dataReferencia: Date;
  totalFinanceiro: Prisma.Decimal;
  totalContabil: Prisma.Decimal;
  diferencaTotal: Prisma.Decimal;
  qtdDivergencias: number;
  status: "RASCUNHO" | "OK" | "DIVERGENTE";
  createdAt: Date;
  user: { name: string } | null;
};

export default async function ConciliacaoListPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role as Role;
  if (!ROLES_CONTROLADORIA.includes(role)) redirect("/dashboard");

  const linhas = (await listarConciliacoesPorTenant(session.user.tenantId)) as ConciliacaoLinha[];

  return (
    <AppShell
      title="Conciliações"
      subtitle="Financeiro × Contábil — confronto por NF, fechamento mensal"
      actions={
        <Link
          href="/conciliacao/nova"
          className="ring-focus inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors hover:brightness-110"
          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
        >
          <Plus className="size-4" /> Nova Conciliação
        </Link>
      }
    >
      <div className="space-y-5">
        <CardSection
          title={`Histórico (${fmtNum(linhas.length)})`}
          subtitle="Mais recentes primeiro — clique numa linha pra ver as divergências."
        >
          {linhas.length === 0 ? (
            <div
              className="rounded-lg border border-dashed px-6 py-10 text-center text-[13px]"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
            >
              Nenhuma conciliação ainda. Clique em <strong>Nova Conciliação</strong> pra começar.
            </div>
          ) : (
            <DataTable
              columns={listaCols}
              rows={linhas}
              rowKey={(c) => c.id}
              emptyMessage=""
            />
          )}
        </CardSection>
      </div>
    </AppShell>
  );
}

function statusBadge(s: ConciliacaoLinha["status"]) {
  if (s === "OK") return <StatusBadge tone="success">Conciliada</StatusBadge>;
  if (s === "DIVERGENTE") return <StatusBadge tone="danger">Divergente</StatusBadge>;
  return <StatusBadge tone="muted">Rascunho</StatusBadge>;
}

const listaCols: Column<ConciliacaoLinha>[] = [
  {
    key: "dataRef",
    header: "Referência",
    sortKey: "dataReferencia",
    cell: (c) => (
      <Link
        href={`/conciliacao/${c.id}`}
        className="numeric whitespace-nowrap text-[12.5px] font-medium transition-colors hover:underline"
        style={{ color: "var(--color-brand-600)" }}
      >
        {fmtDate(c.dataReferencia)}
      </Link>
    ),
    width: "110px",
  },
  {
    key: "conta",
    header: "Conta",
    sortKey: "contaContabil",
    cell: (c) => (
      <div className="min-w-0">
        <div className="numeric whitespace-nowrap text-[12.5px]" style={{ color: "var(--fg-strong)" }}>
          {c.contaContabil}
        </div>
        {c.descricaoConta && (
          <div className="truncate text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {c.descricaoConta}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "totalFin",
    header: "Fin. (R$)",
    sortKey: "totalFinanceiro",
    align: "right",
    cell: (c) => (
      <span className="numeric whitespace-nowrap text-[12.5px]">
        {fmtCurrency(Number(c.totalFinanceiro), { compact: true })}
      </span>
    ),
  },
  {
    key: "totalCont",
    header: "Cont. (R$)",
    sortKey: "totalContabil",
    align: "right",
    cell: (c) => (
      <span className="numeric whitespace-nowrap text-[12.5px]">
        {fmtCurrency(Number(c.totalContabil), { compact: true })}
      </span>
    ),
  },
  {
    key: "dif",
    header: "Diferença",
    sortKey: "diferencaTotal",
    align: "right",
    cell: (c) => {
      const v = Number(c.diferencaTotal);
      const bate = Math.abs(v) <= 0.01;
      return (
        <span
          className="numeric whitespace-nowrap text-[12.5px] font-medium"
          style={{ color: bate ? "var(--fg-muted)" : "#e11d48" }}
        >
          {fmtCurrency(v, { compact: true })}
        </span>
      );
    },
  },
  {
    key: "qtdDiv",
    header: "Divergências",
    sortKey: "qtdDivergencias",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12.5px]">
        {c.qtdDivergencias === 0 ? "—" : fmtNum(c.qtdDivergencias)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortKey: "status",
    cell: (c) => <span className="whitespace-nowrap">{statusBadge(c.status)}</span>,
  },
  {
    key: "user",
    header: "Por",
    cell: (c) => (
      <span
        className="block max-w-[140px] truncate text-[12px]"
        style={{ color: "var(--fg-muted)" }}
        title={c.user?.name ?? ""}
      >
        {c.user?.name ?? "—"}
      </span>
    ),
  },
];
