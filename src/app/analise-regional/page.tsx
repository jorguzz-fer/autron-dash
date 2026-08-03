import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import HBarRanking from "@/components/UI/HBarRanking";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import FilterSelect from "@/components/UI/FilterSelect";
import SegmentedControl from "@/components/UI/SegmentedControl";
import OverrideBtn, { type RegiaoOption } from "./OverrideBtn";
import HistoricoMensal, { contarChaves } from "./HistoricoMensal";
import type { HistoricoDim } from "./histTypes";
import {
  getAnaliseRegional,
  getFaturamentoMensalRegional,
  type ClienteRegiaoRow,
  type RegiaoResumo,
} from "@/lib/services/regiaoVendas";
import { getFaturamentoDateBounds } from "@/lib/services/faturamento";
import { fmtCurrency, fmtDate, fmtNum } from "@/lib/format";
import { parseDateInput } from "@/lib/sort";
import type { ChurnStatus, ClasseAbc } from "@/lib/domain/regiaoVendas";
import { Wallet, Users, CheckCircle2, AlertTriangle, UserX, MapPinOff, Map, Download } from "lucide-react";

export const metadata = { title: "Análise Regional — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  churn?: string; // janela "perdido" em meses: "6" | "12" | "24"
  regiao?: string; // id da região, "__sem__", ou vazio (todas)
  histDim?: string; // dimensão do histórico mês a mês: "vendedor" | "cliente"
}

const CHURN_OPTS = [
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "24", label: "24 meses" },
];

/** Preset da janela → duas janelas do aging de churn (EM_RISCO / PERDIDO). */
function churnWindows(preset: string): { emRiscoMeses: number; perdidoMeses: number } {
  switch (preset) {
    case "6":
      return { emRiscoMeses: 3, perdidoMeses: 6 };
    case "24":
      return { emRiscoMeses: 12, perdidoMeses: 24 };
    default:
      return { emRiscoMeses: 6, perdidoMeses: 12 };
  }
}

const CHURN_TONE: Record<ChurnStatus, "success" | "warning" | "danger" | "muted"> = {
  ATIVO: "success",
  EM_RISCO: "warning",
  PERDIDO: "danger",
  SEM_HISTORICO: "muted",
};
const CHURN_LABEL: Record<ChurnStatus, string> = {
  ATIVO: "Ativo",
  EM_RISCO: "Em risco",
  PERDIDO: "Perdido",
  SEM_HISTORICO: "Sem histórico",
};
const CLASSE_TONE: Record<ClasseAbc, "brand" | "warning" | "muted"> = {
  A: "brand",
  B: "warning",
  C: "muted",
};

export default async function AnaliseRegionalPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const tenantId = session.user.tenantId;

  const sp = await searchParams;
  const churnPreset = sp.churn === "6" || sp.churn === "24" ? sp.churn : "12";
  const { emRiscoMeses, perdidoMeses } = churnWindows(churnPreset);

  const bounds = await getFaturamentoDateBounds(tenantId);
  const fromParsed = parseDateInput(sp.from);
  const toParsed = parseDateInput(sp.to);
  const dataInicio = fromParsed ?? bounds.min ?? undefined;
  const dataFim = toParsed ?? bounds.max ?? undefined;

  const histDim: HistoricoDim = sp.histDim === "cliente" ? "cliente" : "vendedor";

  const [data, mensalRaw] = await Promise.all([
    getAnaliseRegional({
      tenantId,
      dataInicio,
      dataFim,
      emRiscoMeses,
      perdidoMeses,
    }),
    getFaturamentoMensalRegional({ tenantId, dataInicio, dataFim }),
  ]);

  const regiaoOptions: RegiaoOption[] = data.regioes.map((r) => ({ id: r.id, nome: r.nome }));
  const filterOptions = [
    ...data.regioes.map((r) => ({ value: r.id, label: r.nome })),
    { value: "__sem__", label: "Sem região" },
  ];
  const selectedRegiao = sp.regiao ?? "";
  const regiaoNome =
    selectedRegiao === "__sem__"
      ? "Sem região"
      : data.regioes.find((r) => r.id === selectedRegiao)?.nome ?? null;

  // Clientes do escopo selecionado (todas as regiões, ou uma).
  const escopo: ClienteRegiaoRow[] = selectedRegiao
    ? data.clientes.filter((c) => (selectedRegiao === "__sem__" ? c.regiaoId == null : c.regiaoId === selectedRegiao))
    : data.clientes;
  const escopoOrdenado = [...escopo].sort((a, b) => b.receita - a.receita);

  // Histórico mês a mês recortado pela MESMA região selecionada: filtra as
  // linhas mensais pelos clientes do escopo (mesma atribuição de região).
  const mensalRows = selectedRegiao
    ? (() => {
        const scopeKeys = new Set(escopo.map((c) => c.clienteKey));
        return mensalRaw.filter((r) => scopeKeys.has(r.clienteKey));
      })()
    : mensalRaw;
  const histTotalChaves = contarChaves(mensalRows, histDim);
  const HIST_LIMIT = 40;

  const churnList = escopoOrdenado.filter((c) => c.churn === "EM_RISCO" || c.churn === "PERDIDO");
  const naoResolvidos = data.clientes
    .filter((c) => c.fonteGeo === "UF" || c.fonteGeo === "NENHUMA")
    .sort((a, b) => b.receita - a.receita);

  const fromValue = (dataInicio ?? bounds.min)?.toISOString().slice(0, 10);
  const toValue = (dataFim ?? bounds.max)?.toISOString().slice(0, 10);

  return (
    <AppShell
      title="Análise Regional de Vendas"
      subtitle="Curva ABC de clientes por região, churn e simulação de carteiras — base: faturamento líquido"
    >
      <div className="space-y-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFilter label="Emissão" fromValue={fromValue} toValue={toValue} />
          <div className="space-y-1">
            <span className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
              Janela de churn
            </span>
            <SegmentedControl name="churn" options={CHURN_OPTS} value={churnPreset} ariaLabel="Janela de churn" />
          </div>
          <FilterSelect name="regiao" label="Região" options={filterOptions} value={selectedRegiao} allLabel="Todas as regiões" />
          <div className="ml-auto flex items-end gap-2">
            <Link
              href="/analise-regional/regioes"
              className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg)" }}
            >
              <Map className="size-3.5" />
              Regiões & carteiras
            </Link>
            <a
              href="/analise-regional/export"
              className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg)" }}
            >
              <Download className="size-3.5" />
              Baixar CSV
            </a>
          </div>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KPICard label="Receita (líquida)" value={fmtCurrency(data.totalReceita, { decimals: 0 })} icon={<Wallet className="size-4" />} />
          <KPICard label="Clientes" value={fmtNum(data.totalClientes)} icon={<Users className="size-4" />} />
          <KPICard label="Ativos" value={fmtNum(data.ativos)} hint={`últimos ${emRiscoMeses}m`} icon={<CheckCircle2 className="size-4" />} />
          <KPICard label="Em risco" value={fmtNum(data.emRisco)} hint={`${emRiscoMeses}–${perdidoMeses}m`} icon={<AlertTriangle className="size-4" />} />
          <KPICard label="Perdidos" value={fmtNum(data.perdidos)} hint={`> ${perdidoMeses}m sem faturar`} icon={<UserX className="size-4" />} />
          <KPICard label="Não resolvidos" value={fmtNum(data.naoResolvidos)} hint="sem cidade" icon={<MapPinOff className="size-4" />} />
        </section>

        {/* Resumo por região */}
        <CardSection
          title="Resumo por região"
          subtitle={`${data.resumoPorRegiao.length} região(ões) · ${fmtNum(data.semRegiao)} cliente(s) sem região`}
        >
          <DataTable columns={resumoColumns} rows={data.resumoPorRegiao} rowKey={(r) => r.id ?? "__sem__"}
            emptyMessage="Nenhuma região configurada. Crie territórios em Regiões & carteiras." />
        </CardSection>

        {/* Histórico mês a mês — por vendedor ou por cliente */}
        <CardSection
          title="Histórico mês a mês"
          subtitle={
            `${regiaoNome ? regiaoNome : "Todas as regiões"} · faturamento líquido por mês` +
            (histTotalChaves > HIST_LIMIT
              ? ` · top ${HIST_LIMIT} ${histDim === "vendedor" ? "vendedores" : "clientes"} de ${fmtNum(histTotalChaves)}`
              : "")
          }
          actions={
            <SegmentedControl
              name="histDim"
              value={histDim}
              ariaLabel="Dimensão do histórico"
              size="sm"
              options={[
                { value: "vendedor", label: "Por vendedor" },
                { value: "cliente", label: "Por cliente" },
              ]}
            />
          }
        >
          <HistoricoMensal rows={mensalRows} dim={histDim} limit={HIST_LIMIT} />
        </CardSection>

        {/* Curva ABC do escopo */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <CardSection
            title={regiaoNome ? `Curva ABC — ${regiaoNome}` : "Maiores clientes (todas as regiões)"}
            subtitle={`Top ${Math.min(25, escopoOrdenado.length)} por receita · classe ABC ${regiaoNome ? "dentro da região" : "por região"}`}
          >
            {escopoOrdenado.length === 0 ? (
              <Empty>Sem clientes no escopo selecionado.</Empty>
            ) : (
              <HBarRanking
                topN={25}
                items={escopoOrdenado.map((c) => ({
                  label: `${c.classe} · ${c.cliente}`,
                  value: c.receita,
                  display: fmtCurrency(c.receita, { decimals: 0 }),
                }))}
              />
            )}
          </CardSection>

          {/* Churn do escopo */}
          <CardSection
            title="Churn — clientes a recuperar"
            subtitle={`${fmtNum(churnList.length)} cliente(s) em risco ou perdidos ${regiaoNome ? `em ${regiaoNome}` : "(todas as regiões)"}`}
          >
            {churnList.length === 0 ? (
              <Empty>Nenhum cliente em risco/perdido no escopo. 🎉</Empty>
            ) : (
              <DataTable columns={churnColumns} rows={churnList.slice(0, 50)} rowKey={(c) => c.clienteKey}
                emptyMessage="—" />
            )}
          </CardSection>
        </div>

        {/* Não resolvidos (cobertura da derivação) */}
        {naoResolvidos.length > 0 && (
          <CardSection
            title="Clientes sem cidade resolvida"
            subtitle={`${fmtNum(naoResolvidos.length)} cliente(s) só têm UF (ou nada) — corrija para entrarem nas sub-regiões de SP`}
          >
            <DataTable
              columns={naoResolvidosColumns(regiaoOptions)}
              rows={naoResolvidos.slice(0, 50)}
              rowKey={(c) => c.clienteKey}
              emptyMessage="—"
            />
          </CardSection>
        )}

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          A cidade de cada cliente é derivada do Enriquecimento CNPJ e do Ploomes pelo nome. Ajuste os
          territórios em{" "}
          <Link href="/analise-regional/regioes" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Regiões &amp; carteiras
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}

// ── Colunas ─────────────────────────────────────────────────────────────────

const resumoColumns: Column<RegiaoResumo>[] = [
  {
    key: "nome",
    header: "Região",
    cell: (r) => (
      <div className="flex items-center gap-2">
        <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: r.cor ?? (r.id ? "var(--color-brand-500)" : "var(--fg-subtle)") }} />
        <span className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>{r.nome}</span>
      </div>
    ),
  },
  {
    key: "vendedor",
    header: "Vendedor",
    cell: (r) => (
      <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>{r.nomeVendedor ?? r.vendedorCodigo ?? "—"}</span>
    ),
  },
  {
    key: "receita",
    header: "Receita",
    align: "right",
    cell: (r) => (
      <span className="numeric text-[12.5px]" style={{ color: "var(--fg)" }}>{fmtCurrency(r.receita, { decimals: 0 })}</span>
    ),
  },
  {
    key: "qtdClientes",
    header: "Clientes",
    align: "right",
    cell: (r) => <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>{fmtNum(r.qtdClientes)}</span>,
  },
  {
    key: "abc",
    header: "A / B / C",
    align: "center",
    cell: (r) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {r.clientesA} / {r.clientesB} / {r.clientesC}
      </span>
    ),
  },
  {
    key: "churn",
    header: "Ativos / Risco / Perdidos",
    align: "center",
    cell: (r) => (
      <span className="numeric text-[12px]">
        <span style={{ color: "#10b981" }}>{r.ativos}</span>
        <span style={{ color: "var(--fg-subtle)" }}> / </span>
        <span style={{ color: "#f59e0b" }}>{r.emRisco}</span>
        <span style={{ color: "var(--fg-subtle)" }}> / </span>
        <span style={{ color: "#e11d48" }}>{r.perdidos}</span>
      </span>
    ),
  },
  {
    key: "ticket",
    header: "Ticket médio",
    align: "right",
    cell: (r) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>{fmtCurrency(r.ticketMedio, { decimals: 0 })}</span>
    ),
  },
];

const churnColumns: Column<ClienteRegiaoRow>[] = [
  {
    key: "cliente",
    header: "Cliente",
    cell: (c) => (
      <div className="flex items-center gap-2">
        <StatusBadge tone={CLASSE_TONE[c.classe]}>{c.classe}</StatusBadge>
        <span className="text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }}>{c.cliente}</span>
      </div>
    ),
  },
  {
    key: "receita",
    header: "Receita",
    align: "right",
    cell: (c) => <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>{fmtCurrency(c.receita, { decimals: 0 })}</span>,
  },
  {
    key: "ultima",
    header: "Última NF",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {c.ultimaEmissaoISO ? fmtDate(new Date(c.ultimaEmissaoISO)) : "—"}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    align: "center",
    cell: (c) => <StatusBadge tone={CHURN_TONE[c.churn]}>{CHURN_LABEL[c.churn]}</StatusBadge>,
  },
];

function naoResolvidosColumns(regioes: RegiaoOption[]): Column<ClienteRegiaoRow>[] {
  return [
    {
      key: "cliente",
      header: "Cliente",
      cell: (c) => <span className="text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }}>{c.cliente}</span>,
    },
    {
      key: "uf",
      header: "UF",
      align: "center",
      cell: (c) => <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>{c.uf ?? "—"}</span>,
    },
    {
      key: "receita",
      header: "Receita",
      align: "right",
      cell: (c) => <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>{fmtCurrency(c.receita, { decimals: 0 })}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <OverrideBtn clienteKey={c.clienteKey} clienteLabel={c.cliente} municipio={c.municipio} uf={c.uf} regioes={regioes} />
      ),
    },
  ];
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
      {children}
    </p>
  );
}
