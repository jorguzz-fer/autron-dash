import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import HBarRanking from "@/components/UI/HBarRanking";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import FilterSelect from "@/components/UI/FilterSelect";
import SegmentedControl from "@/components/UI/SegmentedControl";
import UploadCard from "@/app/uploads/UploadCard";
import HistoricoMensal, { contarChaves } from "../HistoricoMensal";
import type { HistoricoDim } from "../histTypes";
import { getUserAccess } from "@/lib/services/perfis";
import {
  getAnaliseCarteira,
  makeDonoResolver,
  reatribuirPorCarteira,
  SEM_CARTEIRA,
  type CarteiraResumo,
  type ClienteCarteiraRow,
} from "@/lib/services/carteira";
import {
  getFaturamentoMensalRegional,
  getPedidosMensalRegional,
} from "@/lib/services/regiaoVendas";
import { getFaturamentoDateBounds } from "@/lib/services/faturamento";
import { fmtCurrency, fmtDate, fmtNum } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import type { ChurnStatus, ClasseAbc } from "@/lib/domain/regiaoVendas";
import {
  ArrowLeft,
  Wallet,
  Users,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Download,
  Repeat,
  Link2Off,
} from "lucide-react";

export const metadata = { title: "Análise de Carteira — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  churn?: string;
  /** Carteira (dono) selecionada; vazio = todas. */
  cart?: string;
  /** Fonte do histórico: "faturamento" | "pedidos". */
  fonte?: string;
  /** Dimensão do pivô: "vendedor" (= carteira) | "cliente". */
  histDim?: string;
  /** Agrupamento do histórico: "atual" (dono da carteira) | "epoca" (vendedor da NF). */
  grupo?: string;
  /** Ordenação da tabela de clientes (coluna / direção). */
  sortC?: string;
  dirC?: string;
}

const CHURN_OPTS = [
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "24", label: "24 meses" },
];

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

const HIST_LIMIT = 40;

export default async function AnaliseCarteiraPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const tenantId = session.user.tenantId;

  const sp = await searchParams;
  const churnPreset = sp.churn === "6" || sp.churn === "24" ? sp.churn : "12";
  const { emRiscoMeses, perdidoMeses } = churnWindows(churnPreset);
  const fonte: "faturamento" | "pedidos" = sp.fonte === "pedidos" ? "pedidos" : "faturamento";
  const histDim: HistoricoDim = sp.histDim === "cliente" ? "cliente" : "vendedor";
  const grupo: "atual" | "epoca" = sp.grupo === "epoca" ? "epoca" : "atual";

  const bounds = await getFaturamentoDateBounds(tenantId);
  const dataInicio = parseDateInput(sp.from) ?? bounds.min ?? undefined;
  const dataFim = parseDateInput(sp.to) ?? bounds.max ?? undefined;
  const filtros = { tenantId, dataInicio, dataFim, emRiscoMeses, perdidoMeses };

  const [data, mensalFat, mensalPed, access, lastUpload] = await Promise.all([
    getAnaliseCarteira(filtros),
    getFaturamentoMensalRegional(filtros),
    getPedidosMensalRegional(filtros),
    getUserAccess(tenantId, session.user.id),
    prisma.dataUpload.findFirst({
      where: { tenantId, dataset: "CARTEIRA_CLIENTE", status: "SUCCESS" },
      orderBy: { startedAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);
  const canUpload = access.capabilities.includes("UPLOAD_DATA");

  const fromValue = (dataInicio ?? bounds.min)?.toISOString().slice(0, 10);
  const toValue = (dataFim ?? bounds.max)?.toISOString().slice(0, 10);

  const uploadBlock = (
    <CardSection
      title="Base da carteira — clientes_com_vendedor.xlsx"
      subtitle="Relatório do Protheus com o campo “nome vendedor”, que define o dono ATUAL de cada cliente. Cada upload substitui a base inteira."
    >
      <div className="space-y-3">
        <UploadCard
          dataset="CARTEIRA_CLIENTE"
          label="Carteira de clientes (clientes_com_vendedor.xlsx)"
          disabled={!canUpload}
          lastUpload={
            lastUpload
              ? {
                  filename: lastUpload.filename,
                  rowCount: lastUpload.rowCount,
                  finishedAt: lastUpload.finishedAt?.toISOString() ?? null,
                  userName: lastUpload.user.name,
                }
              : null
          }
        />
        {data.base.totalCadastros > 0 && (
          <p className="text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
            {fmtNum(data.base.totalCadastros)} cadastro(s) na base · {fmtNum(data.base.donos.length)}{" "}
            dono(s) de carteira
            {data.base.cadastrosSemDono > 0 && ` · ${fmtNum(data.base.cadastrosSemDono)} sem vendedor`}
            {data.base.conflitos > 0 &&
              ` · ${fmtNum(data.base.conflitos)} cliente(s) com lojas em carteiras diferentes (vence a de mais cadastros)`}
            {data.cadastrosSemHistorico > 0 &&
              ` · ${fmtNum(data.cadastrosSemHistorico)} cliente(s) da base sem histórico no período`}
          </p>
        )}
      </div>
    </CardSection>
  );

  // Sem base carregada: a tela inteira vira o passo de upload.
  if (data.base.totalCadastros === 0) {
    return (
      <AppShell
        title="Análise de Carteira"
        subtitle="Histórico de faturamento e entrada de pedidos reagrupado pelo dono ATUAL da carteira"
      >
        <div className="space-y-6">
          <VoltarLink />
          <div
            className="rounded-xl border px-4 py-3 text-[13px]"
            style={{
              color: "#b45309",
              backgroundColor: "color-mix(in srgb, #f59e0b 8%, transparent)",
              borderColor: "color-mix(in srgb, #f59e0b 30%, transparent)",
            }}
          >
            Nenhuma base de carteira carregada ainda. Suba o relatório{" "}
            <strong>clientes com vendedor</strong> do Protheus para reagrupar o histórico pelo dono
            atual de cada cliente.
          </div>
          {uploadBlock}
        </div>
      </AppShell>
    );
  }

  // Carteira selecionada (dono) — recorta clientes e histórico.
  const carteiraOpts = [
    ...data.carteiras
      .filter((c) => c.dono !== SEM_CARTEIRA)
      .map((c) => ({ value: c.dono, label: c.dono })),
    ...(data.carteiras.some((c) => c.dono === SEM_CARTEIRA)
      ? [{ value: SEM_CARTEIRA, label: SEM_CARTEIRA }]
      : []),
  ];
  const selecionada = sp.cart ?? "";
  const carteira = selecionada ? data.carteiras.find((c) => c.dono === selecionada) ?? null : null;

  const clientesEscopo = [...data.clientes]
    .filter((c) => !selecionada || c.dono === selecionada)
    .sort((a, b) => b.receita - a.receita);

  // Histórico mês a mês. "atual" reatribui cada linha ao dono da carteira;
  // "epoca" mantém o vendedor da NF/pedido — o contraste é o ponto da análise.
  const resolver = makeDonoResolver(data.base);
  const mensalRaw = fonte === "pedidos" ? mensalPed : mensalFat;
  const mensalGrupo =
    grupo === "atual"
      ? reatribuirPorCarteira(mensalRaw, resolver)
      : mensalRaw.map((r) => ({ ...r, vendedor: r.vendedor?.trim() || "Sem vendedor" }));
  // Com carteira selecionada: em "atual" basta a linha já reatribuída; em
  // "epoca" recortamos pelos CLIENTES da carteira (o vendedor da linha é outro).
  const chavesEscopo = new Set(clientesEscopo.map((c) => c.clienteKey));
  const mensalRows = selecionada
    ? mensalGrupo.filter((r) =>
        grupo === "atual" ? r.vendedor === selecionada : chavesEscopo.has(r.clienteKey),
      )
    : mensalGrupo;
  const histTotalChaves = contarChaves(mensalRows, histDim);

  // ── Colunas de venda ano a ano por cliente ──────────────────────────────
  // Soma o mensal da FONTE atual (faturamento/pedidos), respeitando o filtro
  // de período — mes = "YYYY-MM". Reaproveita o dado já buscado (sem query
  // nova). Cada valor por ano fica achatado como `ano<AAAA>` na linha, pra o
  // sortRows conseguir ordenar por coluna de ano.
  const anosSet = new Set<string>();
  const anoPorCliente = new Map<string, Record<string, number>>();
  for (const r of mensalRaw) {
    const ano = r.mes.slice(0, 4);
    anosSet.add(ano);
    let rec = anoPorCliente.get(r.clienteKey);
    if (!rec) {
      rec = {};
      anoPorCliente.set(r.clienteKey, rec);
    }
    rec[ano] = (rec[ano] ?? 0) + r.receita;
  }
  const anos = [...anosSet].sort(); // ascendente: 2022 … 2026

  // Top 100 por faturamento (critério de seleção fixo) → depois ordena p/ exibir.
  const clientesTop100: ClienteRowView[] = clientesEscopo.slice(0, 100).map((c) => {
    const rec = anoPorCliente.get(c.clienteKey) ?? {};
    const anoFields: Record<string, number> = {};
    for (const ano of anos) anoFields[`ano${ano}`] = rec[ano] ?? 0;
    return { ...c, ...anoFields } as ClienteRowView;
  });
  const sortStateCli = parseSort(sp.sortC, sp.dirC);
  const clientesOrdenados = sortRows(
    clientesTop100 as unknown as Record<string, unknown>[],
    sortStateCli,
  ) as unknown as ClienteRowView[];
  const fonteAnoLabel = fonte === "pedidos" ? "entrada de pedidos" : "faturamento";

  // KPIs do escopo (carteira selecionada ou consolidado).
  const kpiReceita = carteira ? carteira.receita : data.totalReceita;
  const kpiPedidos = carteira ? carteira.pedidos : data.totalPedidos;
  const kpiAberto = carteira
    ? carteira.pedidosEmAberto
    : data.carteiras.reduce((s, c) => s + c.pedidosEmAberto, 0);
  const kpiClientes = carteira ? carteira.qtdClientes : data.totalClientes;
  const kpiAtivos = carteira ? carteira.ativos : data.carteiras.reduce((s, c) => s + c.ativos, 0);
  const kpiRisco = carteira ? carteira.emRisco : data.carteiras.reduce((s, c) => s + c.emRisco, 0);
  const kpiPerdidos = carteira
    ? carteira.perdidos
    : data.carteiras.reduce((s, c) => s + c.perdidos, 0);
  const kpiHerdados = carteira
    ? carteira.herdados
    : data.carteiras.reduce((s, c) => s + c.herdados, 0);
  const coberturaPct =
    data.totalClientes > 0 ? (data.clientesNaBase / data.totalClientes) * 100 : 0;

  const exportQs = new URLSearchParams({
    ...(sp.from ? { from: sp.from } : {}),
    ...(sp.to ? { to: sp.to } : {}),
    ...(sp.churn ? { churn: sp.churn } : {}),
    ...(selecionada ? { cart: selecionada } : {}),
  }).toString();

  return (
    <AppShell
      title="Análise de Carteira"
      subtitle="Faturamento e entrada de pedidos reagrupados pelo dono ATUAL da carteira — histórico independente do vendedor da época"
    >
      <div className="space-y-6">
        <VoltarLink />

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFilter label="Emissão" fromValue={fromValue} toValue={toValue} />
          <div className="space-y-1">
            <span
              className="block text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--fg-muted)" }}
            >
              Janela de churn
            </span>
            <SegmentedControl name="churn" options={CHURN_OPTS} value={churnPreset} ariaLabel="Janela de churn" />
          </div>
          <FilterSelect
            name="cart"
            label="Carteira (dono atual)"
            options={carteiraOpts}
            value={selecionada}
            allLabel="Todas as carteiras"
          />
          <div className="ml-auto flex items-end">
            <a
              href={`/analise-regional/carteiras/export${exportQs ? `?${exportQs}` : ""}`}
              className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg)" }}
            >
              <Download className="size-3.5" />
              Baixar CSV
            </a>
          </div>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard
            label="Faturamento (líquido)"
            value={fmtCurrency(kpiReceita, { decimals: 0 })}
            hint={carteira ? carteira.dono : "todas as carteiras"}
            icon={<Wallet className="size-4" />}
          />
          <KPICard
            label="Entrada de pedidos"
            value={fmtCurrency(kpiPedidos, { decimals: 0 })}
            hint={`${fmtCurrency(kpiAberto, { decimals: 0 })} em aberto`}
            icon={<ClipboardList className="size-4" />}
          />
          <KPICard label="Clientes" value={fmtNum(kpiClientes)} icon={<Users className="size-4" />} />
          <KPICard
            label="Herdados"
            value={fmtNum(kpiHerdados)}
            hint="faturados por outro vendedor na época"
            icon={<Repeat className="size-4" />}
          />
        </section>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard label="Ativos" value={fmtNum(kpiAtivos)} hint={`últimos ${emRiscoMeses}m`} icon={<CheckCircle2 className="size-4" />} />
          <KPICard label="Em risco" value={fmtNum(kpiRisco)} hint={`${emRiscoMeses}–${perdidoMeses}m`} icon={<AlertTriangle className="size-4" />} />
          <KPICard label="Perdidos" value={fmtNum(kpiPerdidos)} hint={`> ${perdidoMeses}m sem faturar`} icon={<UserX className="size-4" />} />
          <KPICard
            label="Cobertura da base"
            value={`${coberturaPct.toFixed(1)}%`}
            hint={`${fmtNum(data.clientesNaBase)}/${fmtNum(data.totalClientes)} clientes com dono`}
            icon={<Link2Off className="size-4" />}
          />
        </section>

        {data.receitaSemCarteira > 0 && (
          <p className="text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
            {fmtCurrency(data.receitaSemCarteira, { decimals: 0 })} de faturamento no período vieram
            de clientes que não estão na base de carteira — aparecem agrupados como{" "}
            <strong>{SEM_CARTEIRA}</strong>.
          </p>
        )}

        {/* Ranking das carteiras */}
        <CardSection
          title="Ranking das carteiras"
          subtitle="Faturamento do período atribuído ao dono ATUAL de cada cliente · clique para focar numa carteira"
        >
          {data.carteiras.length === 0 ? (
            <Empty>Sem histórico no período.</Empty>
          ) : (
            <HBarRanking
              topN={25}
              items={data.carteiras.map((c) => ({
                label: `${c.classe} · ${c.dono}`,
                value: c.receita,
                display: `${fmtCurrency(c.receita, { decimals: 0 })} · ${fmtNum(c.qtdClientes)} cli.`,
                href: `/analise-regional/carteiras?${new URLSearchParams({
                  ...(sp.from ? { from: sp.from } : {}),
                  ...(sp.to ? { to: sp.to } : {}),
                  ...(sp.churn ? { churn: sp.churn } : {}),
                  ...(sp.fonte ? { fonte: sp.fonte } : {}),
                  ...(sp.histDim ? { histDim: sp.histDim } : {}),
                  ...(sp.grupo ? { grupo: sp.grupo } : {}),
                  cart: selecionada === c.dono ? "" : c.dono,
                }).toString()}`,
              }))}
            />
          )}
        </CardSection>

        {/* Resumo por carteira */}
        <CardSection
          title="Carteiras — resumo por dono atual"
          subtitle={`${fmtNum(data.carteiras.length)} carteira(s) · faturamento + entrada de pedidos do período`}
        >
          <DataTable
            columns={resumoColumns}
            rows={data.carteiras}
            rowKey={(c) => c.dono}
            emptyMessage="—"
          />
        </CardSection>

        {/* Histórico mês a mês reagrupado */}
        <CardSection
          title="Histórico mês a mês"
          subtitle={
            `${carteira ? carteira.dono : "Todas as carteiras"} · ${
              fonte === "pedidos" ? "entrada de pedidos (valor)" : "faturamento líquido"
            } · agrupado pelo ${grupo === "atual" ? "dono ATUAL da carteira" : "vendedor da ÉPOCA"}` +
            (histTotalChaves > HIST_LIMIT
              ? ` · top ${HIST_LIMIT} de ${fmtNum(histTotalChaves)}`
              : "")
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                name="fonte"
                value={fonte}
                ariaLabel="Fonte do histórico"
                size="sm"
                options={[
                  { value: "faturamento", label: "Faturamento" },
                  { value: "pedidos", label: "Entrada de pedidos" },
                ]}
              />
              <SegmentedControl
                name="grupo"
                value={grupo}
                ariaLabel="Agrupamento do histórico"
                size="sm"
                options={[
                  { value: "atual", label: "Dono atual" },
                  { value: "epoca", label: "Vendedor da época" },
                ]}
              />
              <SegmentedControl
                name="histDim"
                value={histDim}
                ariaLabel="Dimensão do histórico"
                size="sm"
                options={[
                  { value: "vendedor", label: "Por carteira" },
                  { value: "cliente", label: "Por cliente" },
                ]}
              />
            </div>
          }
        >
          <div className="space-y-4">
            <HistoricoMensal rows={mensalRows} dim={histDim} limit={HIST_LIMIT} />
            <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              Em <strong>Dono atual</strong>, todo o histórico do cliente — inclusive o que foi
              vendido por outro vendedor — soma na linha do dono de hoje. Alterne para{" "}
              <strong>Vendedor da época</strong> para ver a atribuição original da NF/pedido.
            </p>
          </div>
        </CardSection>

        {/* Clientes do escopo */}
        <CardSection
          title={carteira ? `Clientes — ${carteira.dono}` : "Clientes (todas as carteiras)"}
          subtitle={`Top ${Math.min(100, clientesEscopo.length)} por faturamento · classe ABC dentro da carteira · colunas por ano = ${fonteAnoLabel} (no período) · clique nos cabeçalhos para ordenar`}
        >
          <DataTable
            columns={clienteColumns(anos)}
            rows={clientesOrdenados}
            rowKey={(c) => c.clienteKey}
            sortParam="sortC"
            dirParam="dirC"
            emptyMessage="Sem clientes no escopo selecionado."
          />
        </CardSection>

        {uploadBlock}
      </div>
    </AppShell>
  );
}

function VoltarLink() {
  return (
    <Link
      href="/analise-regional"
      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
      style={{ color: "var(--fg-muted)" }}
    >
      <ArrowLeft className="size-3.5" />
      Voltar para a análise regional
    </Link>
  );
}

// ── Colunas ─────────────────────────────────────────────────────────────────

const resumoColumns: Column<CarteiraResumo>[] = [
  {
    key: "dono",
    header: "Carteira (dono atual)",
    cell: (c) => (
      <div className="flex items-center gap-2">
        <StatusBadge tone={CLASSE_TONE[c.classe]}>{c.classe}</StatusBadge>
        <Link
          href={`/analise-regional/carteiras?cart=${encodeURIComponent(c.dono)}`}
          className="text-[12.5px] font-medium hover:underline"
          style={{ color: "var(--fg-strong)" }}
        >
          {c.dono}
        </Link>
      </div>
    ),
  },
  {
    key: "receita",
    header: "Faturamento",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12.5px]" style={{ color: "var(--fg)" }}>
        {fmtCurrency(c.receita, { decimals: 0 })}
      </span>
    ),
  },
  {
    key: "pedidos",
    header: "Entrada de pedidos",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>
        {fmtCurrency(c.pedidos, { decimals: 0 })}
      </span>
    ),
  },
  {
    key: "aberto",
    header: "Pedidos em aberto",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {fmtCurrency(c.pedidosEmAberto, { decimals: 0 })}
      </span>
    ),
  },
  {
    key: "clientes",
    header: "Clientes",
    align: "right",
    cell: (c) => <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>{fmtNum(c.qtdClientes)}</span>,
  },
  {
    key: "abc",
    header: "A / B / C",
    align: "center",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {c.clientesA} / {c.clientesB} / {c.clientesC}
      </span>
    ),
  },
  {
    key: "churn",
    header: "Ativos / Risco / Perdidos",
    align: "center",
    cell: (c) => (
      <span className="numeric text-[12px]">
        <span style={{ color: "#10b981" }}>{c.ativos}</span>
        <span style={{ color: "var(--fg-subtle)" }}> / </span>
        <span style={{ color: "#f59e0b" }}>{c.emRisco}</span>
        <span style={{ color: "var(--fg-subtle)" }}> / </span>
        <span style={{ color: "#e11d48" }}>{c.perdidos}</span>
      </span>
    ),
  },
  {
    key: "herdados",
    header: "Herdados",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {fmtNum(c.herdados)}
      </span>
    ),
  },
  {
    key: "ticket",
    header: "Ticket médio",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {fmtCurrency(c.ticketMedio, { decimals: 0 })}
      </span>
    ),
  },
];

/** Linha da tabela de clientes + os valores por ano achatados (`ano2022`…). */
type ClienteRowView = ClienteCarteiraRow & Record<`ano${string}`, number>;

/** Colunas da tabela de clientes, com uma coluna por ano com dados. Todas
 *  ordenáveis (sortKey) — o DataTable renderiza o header clicável. */
function clienteColumns(anos: string[]): Column<ClienteRowView>[] {
  return [
    {
      key: "cliente",
      header: "Cliente",
      sortKey: "cliente",
      cell: (c) => (
        <div className="flex items-center gap-2">
          <StatusBadge tone={CLASSE_TONE[c.classe]}>{c.classe}</StatusBadge>
          <span className="text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }}>
            {c.cliente}
          </span>
        </div>
      ),
    },
    {
      key: "dono",
      header: "Dono atual",
      sortKey: "dono",
      cell: (c) => (
        <span className="text-[12px]" style={{ color: c.naBase ? "var(--fg)" : "var(--fg-subtle)" }}>
          {c.dono}
        </span>
      ),
    },
    {
      key: "epoca",
      header: "Vendedor da época",
      sortKey: "vendedorEpoca",
      cell: (c) => (
        <span
          className="text-[12px]"
          style={{ color: c.trocouDeDono ? "#f59e0b" : "var(--fg-muted)" }}
          title={c.trocouDeDono ? "Cliente herdado: faturou com outro vendedor no período" : undefined}
        >
          {c.vendedorEpoca ?? "—"}
        </span>
      ),
    },
    // Uma coluna por ano com dados (2022 … 2026), valor da fonte selecionada.
    ...anos.map(
      (ano): Column<ClienteRowView> => ({
        key: `ano${ano}`,
        header: ano,
        sortKey: `ano${ano}`,
        align: "right",
        cell: (c) => {
          const v = (c as Record<string, number>)[`ano${ano}`] ?? 0;
          return (
            <span
              className="numeric text-[12px]"
              style={{ color: v ? "var(--fg)" : "var(--fg-subtle)" }}
            >
              {v ? fmtCurrency(v, { decimals: 0 }) : "—"}
            </span>
          );
        },
      }),
    ),
    {
      key: "receita",
      header: "Faturamento",
      sortKey: "receita",
      align: "right",
      cell: (c) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>
          {fmtCurrency(c.receita, { decimals: 0 })}
        </span>
      ),
    },
    {
      key: "pedidos",
      header: "Pedidos",
      sortKey: "pedidos",
      align: "right",
      cell: (c) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {fmtCurrency(c.pedidos, { decimals: 0 })}
        </span>
      ),
    },
    {
      key: "ultima",
      header: "Última NF",
      sortKey: "ultimaEmissaoISO",
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
      sortKey: "churn",
      align: "center",
      cell: (c) => <StatusBadge tone={CHURN_TONE[c.churn]}>{CHURN_LABEL[c.churn]}</StatusBadge>,
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
