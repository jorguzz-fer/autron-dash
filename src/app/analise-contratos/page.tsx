import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getFaturamentos } from "@/lib/services/faturamento";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import TimeSeriesChart from "@/components/UI/TimeSeriesChart";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import { fmtCurrency, fmtNum, fmtPct } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";
import {
  FileSignature,
  TrendingUp,
  Wallet,
  ClipboardList,
  Activity,
  Building2,
  Boxes,
  AlertTriangle,
  CalendarRange,
} from "lucide-react";
import type { ReactNode } from "react";

export const metadata = { title: "Análise de Contratos — Autron Dash" };

const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Ano mais antigo incluído no comparativo multi-ano. */
const ANO_INICIO = 2023;

interface SP {
  sortC?: string;
  dirC?: string;
  sortP?: string;
  dirP?: string;
}

export default async function AnaliseContratosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const tenantId = session.user.tenantId;

  const sp = await searchParams;
  const sortStateCli = parseSort(sp.sortC, sp.dirC);
  const sortStateProd = parseSort(sp.sortP, sp.dirP);

  const [enriched, fats] = await Promise.all([
    getEnrichedPedidos({ tenantId }),
    getFaturamentos({ tenantId }),
  ]);

  // ── Pedidos de contrato (universo desta aba) ─────────────────────────
  const contratos = enriched.filter((p) => p.contrato);

  // Ano-base = maior ano com pedidos de contrato (fallback: ano corrente).
  const anosContrato = Array.from(
    new Set(contratos.filter((p) => p.dtEmissao).map((p) => p.dtEmissao!.getFullYear())),
  ).sort();
  const anoBase = anosContrato.length > 0 ? Math.max(...anosContrato) : new Date().getFullYear();
  const anoAnt = anoBase - 1;

  // ── Mês fechado / mesmo período ──────────────────────────────────────
  // Toda comparação usa a MESMA janela temporal: jan → mês fechado (mês
  // anterior ao corrente). Ex.: em junho/2026 compara jan→mai de cada ano —
  // assim 2026 (parcial) não é medido contra anos inteiros.
  // Quando o ano-base não é o corrente (dados antigos), usa o ano cheio.
  const hoje = new Date();
  const anoCorrente = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const mesFechado = mesAtual === 1 ? 12 : mesAtual - 1;
  const periodoMes = anoBase === anoCorrente ? mesFechado : 12;
  const periodoLabel = `jan→${MES_LABELS[periodoMes - 1]}`;
  const dentroPeriodo = (d: Date | null | undefined) => d != null && d.getMonth() + 1 <= periodoMes;

  // Anos do comparativo multi-ano (ANO_INICIO … anoBase).
  const anoInicio = Math.min(ANO_INICIO, anoBase);
  const anosMulti: number[] = [];
  for (let y = anoInicio; y <= anoBase; y++) anosMulti.push(y);

  // PVs de contrato → usados pra cruzar com faturamento (Faturamento.noPedido = PV).
  const contratoPVs = new Set(contratos.map((p) => p.numPedido));
  const fatContratos = fats.filter((f) => f.noPedido != null && contratoPVs.has(f.noPedido));

  // ── Totais por ano NO MESMO PERÍODO (jan → mês fechado) ──────────────
  const entradaSP = new Map<number, number>();
  const pvsSP = new Map<number, Set<string>>();
  for (const p of contratos) {
    if (!dentroPeriodo(p.dtEmissao)) continue;
    const y = p.dtEmissao!.getFullYear();
    entradaSP.set(y, (entradaSP.get(y) ?? 0) + (p.vlrTotal ?? 0));
    const s = pvsSP.get(y) ?? new Set<string>();
    s.add(p.numPedido);
    pvsSP.set(y, s);
  }
  const fatSP = new Map<number, number>();
  for (const f of fatContratos) {
    if (!dentroPeriodo(f.emissao)) continue;
    const y = f.emissao!.getFullYear();
    fatSP.set(y, (fatSP.get(y) ?? 0) + (f.faturamentoLiquido ?? 0));
  }

  // Escalares do ano-base × ano anterior (mesmo período).
  const entradaBaseYTD = entradaSP.get(anoBase) ?? 0;
  const entradaAntYTD = entradaSP.get(anoAnt) ?? 0;
  const fatBaseYTD = fatSP.get(anoBase) ?? 0;
  const fatAntYTD = fatSP.get(anoAnt) ?? 0;
  const pvsBase = (pvsSP.get(anoBase) ?? new Set()).size;
  const pvsAnt = (pvsSP.get(anoAnt) ?? new Set()).size;
  const yoyEntrada = entradaAntYTD === 0 ? null : ((entradaBaseYTD - entradaAntYTD) / entradaAntYTD) * 100;
  const yoyFat = fatAntYTD === 0 ? null : ((fatBaseYTD - fatAntYTD) / fatAntYTD) * 100;

  // Totais de ano cheio do ano anterior — referência ("Ano completo").
  const entradaAntTotal = contratos
    .filter((p) => p.dtEmissao?.getFullYear() === anoAnt)
    .reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
  const fatAntTotal = fatContratos
    .filter((f) => f.emissao?.getFullYear() === anoAnt)
    .reduce((a, f) => a + (f.faturamentoLiquido ?? 0), 0);

  // ── Penetração (por valor) no mesmo período do ano-base ──────────────
  const valorTotalBaseYTD = enriched
    .filter((p) => p.dtEmissao?.getFullYear() === anoBase && dentroPeriodo(p.dtEmissao))
    .reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
  const pctContrato = valorTotalBaseYTD === 0 ? 0 : (entradaBaseYTD / valorTotalBaseYTD) * 100;

  // ── Séries anuais (mesmo período) para os gráficos ───────────────────
  const entradaSPSeries = anosMulti.map((y) => ({ key: String(y), label: String(y), value: entradaSP.get(y) ?? 0 }));
  const fatSPSeries = anosMulti.map((y) => ({ key: String(y), label: String(y), value: fatSP.get(y) ?? 0 }));

  // ── Resumo anual (tabela) ────────────────────────────────────────────
  const anoRows: AnoRow[] = anosMulti.map((y, i) => {
    const entrada = entradaSP.get(y) ?? 0;
    const fat = fatSP.get(y) ?? 0;
    const prevEntrada = i > 0 ? entradaSP.get(anosMulti[i - 1]) ?? 0 : 0;
    const prevFat = i > 0 ? fatSP.get(anosMulti[i - 1]) ?? 0 : 0;
    return {
      ano: y,
      entrada,
      entradaDelta: i > 0 && prevEntrada > 0 ? ((entrada - prevEntrada) / prevEntrada) * 100 : null,
      fat,
      fatDelta: i > 0 && prevFat > 0 ? ((fat - prevFat) / prevFat) * 100 : null,
      pedidos: (pvsSP.get(y) ?? new Set()).size,
    };
  });

  // ── Razão social por PV (via faturamento) — fallback de nome ─────────
  const razaoByPV = new Map<string, string>();
  for (const f of fats) {
    if (f.noPedido && f.razaoSocial && !razaoByPV.has(f.noPedido)) {
      razaoByPV.set(f.noPedido, f.razaoSocial);
    }
  }

  // ── Visão por Cliente (mesmo período: anoBase × anoAnt) ──────────────
  interface ClienteAgg {
    codigo: string;
    razaoSocial: string | null;
    pedidosBase: Set<string>;
    valorBase: number;
    valorAnt: number;
  }
  const byCli = new Map<string, ClienteAgg>();
  for (const p of contratos) {
    const codigo = p.cliente ?? p.pedCliente ?? "Sem cliente";
    const cur =
      byCli.get(codigo) ??
      ({ codigo, razaoSocial: null, pedidosBase: new Set(), valorBase: 0, valorAnt: 0 } as ClienteAgg);
    if (!cur.razaoSocial && p.clienteNome) cur.razaoSocial = p.clienteNome;
    if (!cur.razaoSocial && razaoByPV.has(p.numPedido)) cur.razaoSocial = razaoByPV.get(p.numPedido)!;
    if (dentroPeriodo(p.dtEmissao)) {
      const y = p.dtEmissao!.getFullYear();
      if (y === anoBase) {
        cur.pedidosBase.add(p.numPedido);
        cur.valorBase += p.vlrTotal ?? 0;
      } else if (y === anoAnt) {
        cur.valorAnt += p.vlrTotal ?? 0;
      }
    }
    byCli.set(codigo, cur);
  }
  const clienteRowsBase: ClienteRow[] = Array.from(byCli.values())
    .map((c) => ({
      codigo: c.codigo,
      razaoSocial: c.razaoSocial ?? c.codigo,
      pedidos: c.pedidosBase.size,
      valor: c.valorBase,
      valorAnt: c.valorAnt,
      deltaPct: c.valorAnt === 0 ? null : ((c.valorBase - c.valorAnt) / c.valorAnt) * 100,
    }))
    .filter((c) => c.valor > 0 || c.valorAnt > 0);
  const clienteRows = sortStateCli
    ? (sortRows(clienteRowsBase as unknown as Record<string, unknown>[], sortStateCli) as unknown as ClienteRow[])
    : [...clienteRowsBase].sort((a, b) => b.valor - a.valor);

  // ── Produtos vendidos ano a ano por cliente (mesmo período) ──────────
  interface ProdAgg {
    codigo: string;
    razaoSocial: string | null;
    produto: string;
    descricao: string | null;
    valByYear: Map<number, number>;
    qtdAnt: number;
    qtdBase: number;
    valorAnt: number;
    valorBase: number;
  }
  const byProd = new Map<string, ProdAgg>();
  for (const p of contratos) {
    if (!dentroPeriodo(p.dtEmissao)) continue;
    const y = p.dtEmissao!.getFullYear();
    if (y < anoInicio || y > anoBase) continue;
    const codigo = p.cliente ?? p.pedCliente ?? "Sem cliente";
    const key = `${codigo}||${p.produto}`;
    const cur =
      byProd.get(key) ??
      ({
        codigo,
        razaoSocial: byCli.get(codigo)?.razaoSocial ?? codigo,
        produto: p.produto,
        descricao: p.descricaoProduto,
        valByYear: new Map<number, number>(),
        qtdAnt: 0,
        qtdBase: 0,
        valorAnt: 0,
        valorBase: 0,
      } as ProdAgg);
    if (!cur.descricao && p.descricaoProduto) cur.descricao = p.descricaoProduto;
    cur.valByYear.set(y, (cur.valByYear.get(y) ?? 0) + (p.vlrTotal ?? 0));
    if (y === anoBase) {
      cur.qtdBase += p.quantidade;
      cur.valorBase += p.vlrTotal ?? 0;
    } else if (y === anoAnt) {
      cur.qtdAnt += p.quantidade;
      cur.valorAnt += p.vlrTotal ?? 0;
    }
    byProd.set(key, cur);
  }

  function statusProduto(qtdAnt: number, qtdBase: number): "Descontinuado" | "Novo" | "Ativo" {
    if (qtdAnt > 0 && qtdBase === 0) return "Descontinuado";
    if (qtdAnt === 0 && qtdBase > 0) return "Novo";
    return "Ativo";
  }

  const produtoRowsBase: ProdutoRow[] = Array.from(byProd.values()).map((p) => {
    const valByYear: Record<number, number> = {};
    for (const y of anosMulti) valByYear[y] = p.valByYear.get(y) ?? 0;
    return {
      codigo: p.codigo,
      razaoSocial: p.razaoSocial ?? p.codigo,
      produto: p.produto,
      descricao: p.descricao ?? "",
      valByYear,
      valorAnt: p.valorAnt,
      valorBase: p.valorBase,
      status: statusProduto(p.qtdAnt, p.qtdBase),
    };
  });
  const produtoRows = sortStateProd
    ? (sortRows(produtoRowsBase as unknown as Record<string, unknown>[], sortStateProd) as unknown as ProdutoRow[])
    : [...produtoRowsBase].sort((a, b) => Math.max(b.valorBase, b.valorAnt) - Math.max(a.valorBase, a.valorAnt));

  // ── Alerta: produtos que deixaram de ser vendidos (mesmo período) ────
  const descontinuados = produtoRowsBase
    .filter((p) => p.status === "Descontinuado")
    .sort((a, b) => b.valorAnt - a.valorAnt);
  const valorPerdido = descontinuados.reduce((a, p) => a + p.valorAnt, 0);

  return (
    <AppShell
      title="Análise de Contratos"
      subtitle={`Pedidos de contrato · mesmo período ${periodoLabel} · ${anoInicio}–${anoBase}`}
    >
      <div className="space-y-10">
        {/* ── Visão geral ── */}
        <SectionBlock title={`Visão Geral dos Contratos · ${anoBase} · mesmo período (${periodoLabel})`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KPICard
              label={`Entrada Contratos ${anoBase}`}
              value={fmtCurrency(entradaBaseYTD, { compact: true })}
              hint={`${periodoLabel} · ${anoAnt}: ${fmtCurrency(entradaAntYTD, { compact: true })}`}
              icon={<FileSignature className="size-4" />}
              tone="brand"
            />
            <KPICard
              label={`Faturamento Líq. ${anoBase}`}
              value={fmtCurrency(fatBaseYTD, { compact: true })}
              hint={`${periodoLabel} · ${anoAnt}: ${fmtCurrency(fatAntYTD, { compact: true })}`}
              icon={<Wallet className="size-4" />}
              tone="success"
            />
            <KPICard
              label={`Pedidos de Contrato ${anoBase}`}
              value={fmtNum(pvsBase)}
              hint={`${periodoLabel} · ${anoAnt}: ${fmtNum(pvsAnt)} pedidos`}
              icon={<ClipboardList className="size-4" />}
              tone="neutral"
            />
            <KPICard
              label="Penetração (por valor)"
              value={fmtPct(pctContrato)}
              hint={`Contratos / total entrada · ${periodoLabel}`}
              icon={<Activity className="size-4" />}
              tone="neutral"
            />
            <KPICard
              label="Variação Entrada YoY"
              value={yoyEntrada == null ? "—" : `${yoyEntrada >= 0 ? "+" : ""}${fmtPct(yoyEntrada)}`}
              hint={`Mesmo período vs ${anoAnt}`}
              icon={<TrendingUp className="size-4" />}
              tone={yoyEntrada == null ? "neutral" : yoyEntrada >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Entrada de Pedidos — mesmo período por ano ── */}
        <SectionBlock title={`Entrada de Pedidos de Contrato — Mesmo Período por Ano`}>
          <CardSection
            title={`Entrada de contratos · ${periodoLabel} por ano`}
            subtitle={`Cada barra soma de janeiro até o mês fechado (${MES_LABELS[periodoMes - 1]}) do respectivo ano · ${anoInicio}–${anoBase}`}
          >
            <TimeSeriesChart
              data={entradaSPSeries}
              type="bar"
              valueFormat="currencyCompact"
              seriesName={`Entrada (${periodoLabel})`}
              height={300}
            />
          </CardSection>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <KPICard
              label={`${anoAnt} · ${periodoLabel}`}
              value={fmtCurrency(entradaAntYTD, { decimals: 0 })}
              hint={`Ano completo: ${fmtCurrency(entradaAntTotal, { compact: true })}`}
              tone="neutral"
            />
            <KPICard label={`${anoBase} · ${periodoLabel}`} value={fmtCurrency(entradaBaseYTD, { decimals: 0 })} tone="brand" />
            <KPICard
              label="Variação YoY (mesmo período)"
              value={yoyEntrada == null ? "—" : `${yoyEntrada >= 0 ? "+" : ""}${fmtPct(yoyEntrada, 1)}`}
              hint={yoyEntrada == null ? "Sem base de comparação" : yoyEntrada >= 0 ? `crescimento vs ${anoAnt}` : `queda vs ${anoAnt}`}
              tone={yoyEntrada == null ? "neutral" : yoyEntrada >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Faturamento — mesmo período por ano ── */}
        <SectionBlock title={`Faturamento Líquido de Contratos — Mesmo Período por Ano`}>
          <CardSection
            title={`Faturamento líquido de contratos · ${periodoLabel} por ano`}
            subtitle={`Notas vinculadas a pedidos de contrato (cruzamento por PV) · soma jan até ${MES_LABELS[periodoMes - 1]} de cada ano`}
          >
            <TimeSeriesChart
              data={fatSPSeries}
              type="bar"
              color="#10b981"
              valueFormat="currencyCompact"
              seriesName={`Faturamento líq. (${periodoLabel})`}
              height={300}
            />
          </CardSection>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <KPICard
              label={`${anoAnt} · ${periodoLabel}`}
              value={fmtCurrency(fatAntYTD, { decimals: 0 })}
              hint={`Ano completo: ${fmtCurrency(fatAntTotal, { compact: true })}`}
              tone="neutral"
            />
            <KPICard label={`${anoBase} · ${periodoLabel}`} value={fmtCurrency(fatBaseYTD, { decimals: 0 })} tone="success" />
            <KPICard
              label="Variação YoY (mesmo período)"
              value={yoyFat == null ? "—" : `${yoyFat >= 0 ? "+" : ""}${fmtPct(yoyFat, 1)}`}
              hint={yoyFat == null ? "Sem base de comparação" : yoyFat >= 0 ? `crescimento vs ${anoAnt}` : `queda vs ${anoAnt}`}
              tone={yoyFat == null ? "neutral" : yoyFat >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Resumo anual ── */}
        <SectionBlock title="Resumo Anual — Mesmo Período">
          <CardSection
            title={
              <span className="flex items-center gap-2">
                <CalendarRange className="size-4" />
                Entrada, faturamento e pedidos por ano ({periodoLabel})
              </span>
            }
            subtitle={`Variação calculada contra o ano imediatamente anterior, sempre no mesmo período`}
          >
            <DataTable
              columns={anoCols}
              rows={anoRows}
              rowKey={(r) => String(r.ano)}
              emptyMessage="Sem dados de contrato."
              maxHeight={null}
            />
          </CardSection>
        </SectionBlock>

        {/* ── Por Cliente ── */}
        <SectionBlock title="Contratos por Cliente">
          <CardSection
            title={
              <span className="flex items-center gap-2">
                <Building2 className="size-4" />
                Valor de contrato e quantidade de pedidos por cliente
              </span>
            }
            subtitle={`Número do cliente e razão social · mesmo período ${periodoLabel} · ${anoBase} vs ${anoAnt}`}
          >
            <DataTable
              columns={clienteCols(anoBase, anoAnt)}
              rows={clienteRows}
              rowKey={(c) => c.codigo}
              emptyMessage="Sem pedidos de contrato por cliente."
              sortParam="sortC"
              dirParam="dirC"
            />
          </CardSection>
        </SectionBlock>

        {/* ── Alerta: produtos descontinuados ── */}
        <SectionBlock title="Alerta — Produtos que Deixaram de Ser Vendidos">
          <CardSection
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" style={{ color: "#f59e0b" }} />
                Vendidos em {anoAnt} ({periodoLabel}) sem venda em {anoBase} no mesmo período
              </span>
            }
            subtitle={
              descontinuados.length === 0
                ? `Nenhum produto de contrato deixou de ser vendido (mesmo período ${periodoLabel}).`
                : `${fmtNum(descontinuados.length)} produto(s) sem recompra · ${fmtCurrency(valorPerdido, { compact: true })} faturados em ${anoAnt} (${periodoLabel})`
            }
          >
            <DataTable
              columns={alertaCols(anoAnt)}
              rows={descontinuados}
              rowKey={(p) => `${p.codigo}||${p.produto}`}
              emptyMessage={`Nenhum produto deixou de ser vendido em ${anoBase}.`}
            />
          </CardSection>
        </SectionBlock>

        {/* ── Produtos ano a ano por cliente ── */}
        <SectionBlock title="Produtos Vendidos Ano a Ano por Cliente">
          <CardSection
            title={
              <span className="flex items-center gap-2">
                <Boxes className="size-4" />
                Valor por ano · cliente × produto ({periodoLabel})
              </span>
            }
            subtitle={`${fmtNum(produtoRows.length)} combinações cliente/produto · valores no mesmo período de cada ano (${anoInicio}–${anoBase})`}
          >
            <DataTable
              columns={produtoCols(anosMulti)}
              rows={produtoRows}
              rowKey={(p) => `${p.codigo}||${p.produto}`}
              emptyMessage="Sem produtos vendidos em contratos."
              sortParam="sortP"
              dirParam="dirP"
            />
          </CardSection>
        </SectionBlock>
      </div>
    </AppShell>
  );
}

// ─── Tipos e colunas ─────────────────────────────────────────────────

interface AnoRow {
  ano: number;
  entrada: number;
  entradaDelta: number | null;
  fat: number;
  fatDelta: number | null;
  pedidos: number;
}

function deltaBadge(delta: number | null): ReactNode {
  if (delta == null) return <span style={{ color: "var(--fg-subtle)" }}>—</span>;
  const tone = delta >= 0 ? "success" : "danger";
  return (
    <StatusBadge tone={tone} dot={false}>
      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </StatusBadge>
  );
}

const anoCols: Column<AnoRow>[] = [
  { key: "ano", header: "Ano", cell: (r) => <span className="numeric font-semibold">{r.ano}</span>, width: "80px" },
  {
    key: "entrada",
    header: "Entrada (período)",
    align: "right",
    cell: (r) => <span className="numeric font-medium">{fmtCurrency(r.entrada, { compact: true })}</span>,
  },
  { key: "entradaDelta", header: "Var. YoY", align: "right", cell: (r) => deltaBadge(r.entradaDelta) },
  {
    key: "fat",
    header: "Faturamento Líq. (período)",
    align: "right",
    cell: (r) => <span className="numeric font-medium">{fmtCurrency(r.fat, { compact: true })}</span>,
  },
  { key: "fatDelta", header: "Var. YoY", align: "right", cell: (r) => deltaBadge(r.fatDelta) },
  {
    key: "pedidos",
    header: "Pedidos",
    align: "right",
    cell: (r) => <span className="numeric">{fmtNum(r.pedidos)}</span>,
  },
];

interface ClienteRow {
  codigo: string;
  razaoSocial: string;
  pedidos: number;
  valor: number;
  valorAnt: number;
  deltaPct: number | null;
}

function clienteCols(anoBase: number, anoAnt: number): Column<ClienteRow>[] {
  return [
    {
      key: "codigo",
      header: "Nº Cliente",
      sortKey: "codigo",
      cell: (c) => <code className="font-mono text-[12px]">{c.codigo}</code>,
      width: "110px",
    },
    {
      key: "razao",
      header: "Razão Social",
      sortKey: "razaoSocial",
      cell: (c) => (
        <span className="block max-w-[280px] truncate" title={c.razaoSocial}>
          {c.razaoSocial}
        </span>
      ),
    },
    {
      key: "pedidos",
      header: `Pedidos ${anoBase}`,
      sortKey: "pedidos",
      align: "right",
      cell: (c) => <span className="numeric">{fmtNum(c.pedidos)}</span>,
    },
    {
      key: "valor",
      header: `Valor Contrato ${anoBase}`,
      sortKey: "valor",
      align: "right",
      cell: (c) => <span className="numeric font-medium">{fmtCurrency(c.valor, { compact: true })}</span>,
    },
    {
      key: "valorAnt",
      header: `Valor ${anoAnt}`,
      sortKey: "valorAnt",
      align: "right",
      cell: (c) => (
        <span className="numeric text-[12px]">{c.valorAnt > 0 ? fmtCurrency(c.valorAnt, { compact: true }) : "—"}</span>
      ),
    },
    {
      key: "delta",
      header: "Var. YoY",
      sortKey: "deltaPct",
      align: "right",
      cell: (c) => deltaBadge(c.deltaPct),
    },
  ];
}

interface ProdutoRow {
  codigo: string;
  razaoSocial: string;
  produto: string;
  descricao: string;
  valByYear: Record<number, number>;
  valorAnt: number;
  valorBase: number;
  status: "Descontinuado" | "Novo" | "Ativo";
}

function produtoCols(anos: number[]): Column<ProdutoRow>[] {
  const cols: Column<ProdutoRow>[] = [
    {
      key: "razao",
      header: "Cliente",
      sortKey: "razaoSocial",
      cell: (p) => (
        <div>
          <span className="block max-w-[200px] truncate" title={p.razaoSocial}>
            {p.razaoSocial}
          </span>
          <code className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {p.codigo}
          </code>
        </div>
      ),
    },
    {
      key: "produto",
      header: "Produto",
      sortKey: "produto",
      cell: (p) => (
        <div>
          <code className="font-mono text-[12px]">{p.produto}</code>
          <div className="max-w-[220px] truncate text-[11.5px]" title={p.descricao} style={{ color: "var(--fg-muted)" }}>
            {p.descricao}
          </div>
        </div>
      ),
    },
  ];
  for (const y of anos) {
    cols.push({
      key: `v${y}`,
      header: `Valor ${y}`,
      align: "right",
      cell: (p) => {
        const v = p.valByYear[y] ?? 0;
        return <span className="numeric text-[12px]">{v > 0 ? fmtCurrency(v, { compact: true }) : "—"}</span>;
      },
    });
  }
  cols.push({
    key: "status",
    header: "Status",
    sortKey: "status",
    align: "center",
    cell: (p) => {
      if (p.status === "Descontinuado")
        return (
          <StatusBadge tone="danger" dot={false}>
            ⚠ Parou de vender
          </StatusBadge>
        );
      if (p.status === "Novo")
        return (
          <StatusBadge tone="brand" dot={false}>
            Novo
          </StatusBadge>
        );
      return (
        <StatusBadge tone="success" dot={false}>
          Ativo
        </StatusBadge>
      );
    },
  });
  return cols;
}

function alertaCols(anoAnt: number): Column<ProdutoRow>[] {
  return [
    {
      key: "razao",
      header: "Cliente",
      cell: (p) => (
        <div>
          <span className="block max-w-[220px] truncate" title={p.razaoSocial}>
            {p.razaoSocial}
          </span>
          <code className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {p.codigo}
          </code>
        </div>
      ),
    },
    {
      key: "produto",
      header: "Produto",
      cell: (p) => (
        <div>
          <code className="font-mono text-[12px]">{p.produto}</code>
          <div className="max-w-[260px] truncate text-[11.5px]" title={p.descricao} style={{ color: "var(--fg-muted)" }}>
            {p.descricao}
          </div>
        </div>
      ),
    },
    {
      key: "valorAnt",
      header: `Valor ${anoAnt}`,
      align: "right",
      cell: (p) => <span className="numeric text-[12px] font-medium">{fmtCurrency(p.valorAnt, { compact: true })}</span>,
    },
    {
      key: "status",
      header: "",
      align: "center",
      cell: () => (
        <StatusBadge tone="danger" dot={false}>
          ⚠ Sem recompra
        </StatusBadge>
      ),
    },
  ];
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="space-y-4 rounded-2xl px-6 py-5"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-brand-500) 4%, var(--canvas))",
        border: "1px solid color-mix(in srgb, var(--color-brand-500) 14%, var(--border-soft))",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="block h-6 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        />
        <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--fg-strong)" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
