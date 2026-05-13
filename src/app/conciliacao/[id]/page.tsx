import AppShell from "@/components/Layout/AppShell";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import KPICard from "@/components/UI/KPICard";
import StatusBadge from "@/components/UI/StatusBadge";
import { auth } from "@/lib/auth";
import { ROLES_CONTROLADORIA, type Role } from "@/lib/authz";
import { fmtCurrency, fmtDate, fmtNum } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";
import { getConciliacaoById } from "@/lib/services/conciliacao";
import { Prisma } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DeleteButton from "./DeleteButton";
import ObservacoesEditor from "./ObservacoesEditor";

export const metadata = { title: "Conciliação — Autron Dash" };

// Linha plana — valores Decimal já convertidos para number, pra que sortRows
// (que tem branch numérico) ordene corretamente. Sem a conversão prévia, os
// Decimals caem no branch de string e "1000" vinha antes de "999".
type DivergenciaRow = {
  id: string;
  numeroNF: string;
  codigoCliente: string | null;
  nomeCliente: string | null;
  lado: "SO_FINANCEIRO" | "SO_CONTABIL" | "DIVERGENTE";
  saldoFinanceiro: number | null;
  saldoContabil: number | null;
  diferenca: number | null;
};

function toNum(d: Prisma.Decimal | null | undefined): number | null {
  return d == null ? null : Number(d);
}

interface SP {
  lado?: string; // filtro: "DIVERGENTE" | "SO_FINANCEIRO" | "SO_CONTABIL"
  sort?: string;
  dir?: string;
}

export default async function ConciliacaoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role as Role;
  if (!ROLES_CONTROLADORIA.includes(role)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
  const conc = await getConciliacaoById(id, session.user.tenantId);
  if (!conc) notFound();

  const totalFin = Number(conc.totalFinanceiro);
  const totalCont = Number(conc.totalContabil);
  const dif = Number(conc.diferencaTotal);
  const bateuTotal = Math.abs(dif) <= 0.01;

  // Decimal → number antes de filtrar/ordenar, pra que sortRows trate os
  // saldos como números (não como strings, o que ordenaria "1000" antes de "999").
  const divergenciasPlanas: DivergenciaRow[] = conc.divergencias.map((d) => ({
    id: d.id,
    numeroNF: d.numeroNF,
    codigoCliente: d.codigoCliente,
    nomeCliente: d.nomeCliente,
    lado: d.lado,
    saldoFinanceiro: toNum(d.saldoFinanceiro),
    saldoContabil: toNum(d.saldoContabil),
    diferenca: toNum(d.diferenca),
  }));

  const divergenciasFiltradasBase = sp.lado
    ? divergenciasPlanas.filter((d) => d.lado === sp.lado)
    : divergenciasPlanas;

  // URL-driven sort (clique nos cabeçalhos da DataTable). Default: ordenação
  // do banco — DIVERGENTE primeiro, depois maior diff absoluta.
  const sortState = parseSort(sp.sort, sp.dir);
  const divergenciasFiltradas = sortState
    ? (sortRows(
        divergenciasFiltradasBase as unknown as Record<string, unknown>[],
        sortState,
      ) as unknown as DivergenciaRow[])
    : divergenciasFiltradasBase;

  const porLado = {
    DIVERGENTE: conc.divergencias.filter((d) => d.lado === "DIVERGENTE").length,
    SO_CONTABIL: conc.divergencias.filter((d) => d.lado === "SO_CONTABIL").length,
    SO_FINANCEIRO: conc.divergencias.filter((d) => d.lado === "SO_FINANCEIRO").length,
  };

  function buildHref(lado: string): string {
    const usp = new URLSearchParams();
    if (sp.lado !== lado) usp.set("lado", lado);
    const qs = usp.toString();
    return qs ? `/conciliacao/${id}?${qs}` : `/conciliacao/${id}`;
  }

  return (
    <AppShell
      title={`Conciliação · ${conc.descricaoConta ?? conc.contaContabil}`}
      subtitle={`${fmtDate(conc.dataReferencia)} · conta ${conc.contaContabil} · processada por ${conc.user?.name ?? "—"}`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/conciliacao"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-colors hover:underline"
            style={{ color: "var(--color-brand-600)" }}
          >
            <ArrowLeft className="size-3.5" /> Todas as conciliações
          </Link>
          <div className="flex items-center gap-2">
            <a
              href={`/api/conciliacao/${conc.id}/export`}
              className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:brightness-110"
              style={{
                borderColor: "var(--border-soft)",
                backgroundColor: "var(--color-brand-500)",
                color: "#fff",
              }}
              download
            >
              <Download className="size-3.5" />
              Exportar Excel
            </a>
            <DeleteButton
              id={conc.id}
              label={`${fmtDate(conc.dataReferencia)} · conta ${conc.contaContabil}`}
            />
          </div>
        </div>

        {/* KPIs principais */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard
            label="Total Financeiro"
            value={fmtCurrency(totalFin, { compact: true })}
            hint="soma dos saldos a receber"
            icon={<TrendingUp className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="Total Contábil"
            value={fmtCurrency(totalCont, { compact: true })}
            hint="saldo anterior + lançamentos"
            icon={<TrendingDown className="size-4" />}
            tone="neutral"
          />
          <KPICard
            label="Diferença Total"
            value={fmtCurrency(Math.abs(dif), { compact: true })}
            hint={
              bateuTotal
                ? "totais conciliam ✅"
                : dif > 0
                ? "financeiro > contábil"
                : "contábil > financeiro"
            }
            icon={
              bateuTotal ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />
            }
            tone={bateuTotal ? "success" : "danger"}
          />
          <KPICard
            label="Divergências"
            value={fmtNum(conc.qtdDivergencias)}
            hint={
              conc.qtdDivergencias === 0
                ? "nenhuma identificada"
                : "NFs com diferença ou ausentes"
            }
            icon={<Layers className="size-4" />}
            tone={conc.qtdDivergencias === 0 ? "success" : "warning"}
          />
        </section>

        {/* Filtros KPI clicáveis */}
        {conc.qtdDivergencias > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
              Filtrar por tipo:
            </span>
            <FilterChip
              label={`Divergentes (${porLado.DIVERGENTE})`}
              tone="danger"
              active={sp.lado === "DIVERGENTE"}
              href={buildHref("DIVERGENTE")}
            />
            <FilterChip
              label={`Só Contábil (${porLado.SO_CONTABIL})`}
              tone="warning"
              active={sp.lado === "SO_CONTABIL"}
              href={buildHref("SO_CONTABIL")}
            />
            <FilterChip
              label={`Só Financeiro (${porLado.SO_FINANCEIRO})`}
              tone="neutral"
              active={sp.lado === "SO_FINANCEIRO"}
              href={buildHref("SO_FINANCEIRO")}
            />
            {sp.lado && (
              <Link
                href={`/conciliacao/${id}`}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors hover:brightness-110"
                style={{ backgroundColor: "var(--surface-2)", color: "var(--fg)" }}
              >
                Limpar ✕
              </Link>
            )}
          </div>
        )}

        {/* Arquivos originais (pra auditoria) */}
        <CardSection
          title="Arquivos originais"
          subtitle="Mantidos em armazenamento pra rastreabilidade"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FilePill nome={conc.financeiroFileName} label="Relatório Financeiro" />
            <FilePill nome={conc.contabilFileName} label="Balancete Contábil" />
          </div>
        </CardSection>

        {/* Tabela de divergências */}
        <CardSection
          title={`Divergências${sp.lado ? ` · ${ladoLabel(sp.lado)}` : ""}`}
          subtitle={
            divergenciasFiltradas.length === 0
              ? "Nenhuma divergência neste filtro."
              : `${fmtNum(divergenciasFiltradas.length)} ${
                  divergenciasFiltradas.length === 1 ? "registro" : "registros"
                } · clique no cabeçalho pra ordenar`
          }
        >
          {divergenciasFiltradas.length > 0 ? (
            <DataTable
              columns={divergenciasCols}
              rows={divergenciasFiltradas}
              rowKey={(d) => d.id}
              emptyMessage=""
            />
          ) : (
            <div
              className="rounded-lg border border-dashed px-6 py-10 text-center text-[13px]"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
            >
              {bateuTotal && conc.qtdDivergencias === 0
                ? "✅ Os totais batem e nenhuma NF apresenta divergência. Conciliação aprovada."
                : "Nenhuma divergência nesse filtro — tente outra categoria."}
            </div>
          )}
        </CardSection>

        {/* Observações — editável */}
        <CardSection
          title="Observações"
          subtitle="Notas internas sobre essa conciliação (editáveis por qualquer usuário com acesso)"
        >
          <ObservacoesEditor id={conc.id} initial={conc.observacoes} />
        </CardSection>
      </div>
    </AppShell>
  );
}

function ladoLabel(lado: string): string {
  switch (lado) {
    case "DIVERGENTE":
      return "Saldos divergentes";
    case "SO_CONTABIL":
      return "Só no contábil";
    case "SO_FINANCEIRO":
      return "Só no financeiro";
    default:
      return lado;
  }
}

function FilterChip({
  label,
  href,
  active,
  tone,
}: {
  label: string;
  href: string;
  active: boolean;
  tone: "danger" | "warning" | "neutral";
}) {
  const colors: Record<typeof tone, { bg: string; fg: string }> = {
    danger: { bg: "color-mix(in srgb, #e11d48 14%, transparent)", fg: "#e11d48" },
    warning: { bg: "color-mix(in srgb, #f59e0b 18%, transparent)", fg: "#b45309" },
    neutral: {
      bg: "color-mix(in srgb, var(--fg-muted) 14%, transparent)",
      fg: "var(--fg)",
    },
  };
  const c = colors[tone];
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-medium transition-all hover:brightness-110"
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        outline: active ? `2px solid ${c.fg}` : "none",
        outlineOffset: "2px",
      }}
    >
      {label}
    </Link>
  );
}

function FilePill({ nome, label }: { nome: string; label: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--surface-2)" }}
    >
      <FileSpreadsheet className="size-4 shrink-0" style={{ color: "var(--color-brand-500)" }} />
      <div className="min-w-0 flex-1">
        <div
          className="text-[10.5px] font-medium uppercase tracking-wider"
          style={{ color: "var(--fg-muted)" }}
        >
          {label}
        </div>
        <div className="truncate text-[13px]" style={{ color: "var(--fg-strong)" }} title={nome}>
          {nome}
        </div>
      </div>
    </div>
  );
}

function ladoBadge(lado: DivergenciaRow["lado"]) {
  if (lado === "DIVERGENTE") return <StatusBadge tone="danger">Divergente</StatusBadge>;
  if (lado === "SO_CONTABIL") return <StatusBadge tone="warning">Só Contábil</StatusBadge>;
  return <StatusBadge tone="muted">Só Financeiro</StatusBadge>;
}

const divergenciasCols: Column<DivergenciaRow>[] = [
  {
    key: "lado",
    header: "Tipo",
    sortKey: "lado",
    cell: (d) => <span className="whitespace-nowrap">{ladoBadge(d.lado)}</span>,
    width: "130px",
  },
  {
    key: "nf",
    header: "NF",
    sortKey: "numeroNF",
    cell: (d) => <span className="numeric whitespace-nowrap text-[12.5px]">{d.numeroNF}</span>,
    width: "90px",
  },
  {
    key: "cliente",
    header: "Cliente",
    sortKey: "nomeCliente",
    cell: (d) => (
      <div className="min-w-0">
        <div
          className="truncate text-[12.5px]"
          title={d.nomeCliente ?? ""}
          style={{ color: "var(--fg)" }}
        >
          {d.nomeCliente ?? "—"}
        </div>
        {d.codigoCliente && (
          <div
            className="numeric truncate text-[11px]"
            style={{ color: "var(--fg-muted)" }}
          >
            {d.codigoCliente}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "saldoFin",
    header: "Saldo Financeiro",
    sortKey: "saldoFinanceiro",
    align: "right",
    cell: (d) => (
      <span
        className="numeric whitespace-nowrap text-[12.5px]"
        style={{ color: d.saldoFinanceiro == null ? "var(--fg-muted)" : "var(--fg)" }}
      >
        {d.saldoFinanceiro == null ? "—" : fmtCurrency(d.saldoFinanceiro)}
      </span>
    ),
  },
  {
    key: "saldoCont",
    header: "Saldo Contábil",
    sortKey: "saldoContabil",
    align: "right",
    cell: (d) => (
      <span
        className="numeric whitespace-nowrap text-[12.5px]"
        style={{ color: d.saldoContabil == null ? "var(--fg-muted)" : "var(--fg)" }}
      >
        {d.saldoContabil == null ? "—" : fmtCurrency(d.saldoContabil)}
      </span>
    ),
  },
  {
    key: "diferenca",
    header: "Diferença",
    sortKey: "diferenca",
    align: "right",
    cell: (d) => {
      if (d.diferenca == null)
        return (
          <span className="numeric text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            —
          </span>
        );
      const cor = Math.abs(d.diferenca) > 0.01 ? "#e11d48" : "var(--fg-muted)";
      return (
        <span
          className="numeric whitespace-nowrap text-[12.5px] font-medium"
          style={{ color: cor }}
        >
          {fmtCurrency(d.diferenca)}
        </span>
      );
    },
  },
];
