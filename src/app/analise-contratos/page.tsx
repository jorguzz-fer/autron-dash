import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getFaturamentos } from "@/lib/services/faturamento";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import BarCompareChart from "@/components/UI/BarCompareChart";
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
} from "lucide-react";
import type { ReactNode } from "react";

export const metadata = { title: "Análise de Contratos — Autron Dash" };

const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface SP {
  sortC?: string;
  dirC?: string;
  sortP?: string;
  dirP?: string;
}

/** Soma mensal (12 posições) de um array filtrado por ano. */
function monthlyByYear<T>(
  rows: T[],
  getDate: (r: T) => Date | null | undefined,
  getVal: (r: T) => number,
  year: number,
): number[] {
  const arr = new Array(12).fill(0) as number[];
  for (const r of rows) {
    const d = getDate(r);
    if (d && d.getFullYear() === year) arr[d.getMonth()] += getVal(r);
  }
  return arr;
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

  // PVs de contrato → usados pra cruzar com faturamento (Faturamento.noPedido = PV).
  const contratoPVs = new Set(contratos.map((p) => p.numPedido));
  const fatContratos = fats.filter((f) => f.noPedido != null && contratoPVs.has(f.noPedido));

  // ── Comparativo Entrada de Pedidos (contratos) ───────────────────────
  const entradaAnt = monthlyByYear(contratos, (p) => p.dtEmissao, (p) => p.vlrTotal ?? 0, anoAnt);
  const entradaBase = monthlyByYear(contratos, (p) => p.dtEmissao, (p) => p.vlrTotal ?? 0, anoBase);
  const entradaAntTotal = entradaAnt.reduce((a, v) => a + v, 0);
  const entradaBaseTotal = entradaBase.reduce((a, v) => a + v, 0);
  const yoyEntrada = entradaAntTotal === 0 ? null : ((entradaBaseTotal - entradaAntTotal) / entradaAntTotal) * 100;

  // ── Comparativo Faturamento Líquido (contratos) ──────────────────────
  const fatAnt = monthlyByYear(fatContratos, (f) => f.emissao, (f) => f.faturamentoLiquido ?? 0, anoAnt);
  const fatBase = monthlyByYear(fatContratos, (f) => f.emissao, (f) => f.faturamentoLiquido ?? 0, anoBase);
  const fatAntTotal = fatAnt.reduce((a, v) => a + v, 0);
  const fatBaseTotal = fatBase.reduce((a, v) => a + v, 0);
  const yoyFat = fatAntTotal === 0 ? null : ((fatBaseTotal - fatAntTotal) / fatAntTotal) * 100;

  // ── Nº de pedidos de contrato (PVs distintos) por ano ────────────────
  const pvsBase = new Set(contratos.filter((p) => p.dtEmissao?.getFullYear() === anoBase).map((p) => p.numPedido));
  const pvsAnt = new Set(contratos.filter((p) => p.dtEmissao?.getFullYear() === anoAnt).map((p) => p.numPedido));

  // ── Penetração (por valor) no ano-base ───────────────────────────────
  const todosBase = enriched.filter((p) => p.dtEmissao?.getFullYear() === anoBase);
  const valorTotalBase = todosBase.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
  const pctContrato = valorTotalBase === 0 ? 0 : (entradaBaseTotal / valorTotalBase) * 100;

  // ── Razão social por PV (via faturamento) — fallback de nome ─────────
  const razaoByPV = new Map<string, string>();
  for (const f of fats) {
    if (f.noPedido && f.razaoSocial && !razaoByPV.has(f.noPedido)) {
      razaoByPV.set(f.noPedido, f.razaoSocial);
    }
  }

  // ── Visão por Cliente ────────────────────────────────────────────────
  // Número do cliente (código) + razão social, com valor de contrato e
  // quantidade de pedidos. Comparativo anoBase × anoAnt.
  interface ClienteAgg {
    codigo: string;
    razaoSocial: string | null;
    pedidosBase: Set<string>;
    pedidosAnt: Set<string>;
    valorBase: number;
    valorAnt: number;
  }
  const byCli = new Map<string, ClienteAgg>();
  for (const p of contratos) {
    const codigo = p.cliente ?? p.pedCliente ?? "Sem cliente";
    const cur =
      byCli.get(codigo) ??
      ({ codigo, razaoSocial: null, pedidosBase: new Set(), pedidosAnt: new Set(), valorBase: 0, valorAnt: 0 } as ClienteAgg);
    if (!cur.razaoSocial && p.clienteNome) cur.razaoSocial = p.clienteNome;
    if (!cur.razaoSocial && razaoByPV.has(p.numPedido)) cur.razaoSocial = razaoByPV.get(p.numPedido)!;
    const y = p.dtEmissao?.getFullYear();
    if (y === anoBase) {
      cur.pedidosBase.add(p.numPedido);
      cur.valorBase += p.vlrTotal ?? 0;
    } else if (y === anoAnt) {
      cur.pedidosAnt.add(p.numPedido);
      cur.valorAnt += p.vlrTotal ?? 0;
    }
    byCli.set(codigo, cur);
  }
  const clienteRowsBase: ClienteRow[] = Array.from(byCli.values())
    .map((c) => ({
      codigo: c.codigo,
      razaoSocial: c.razaoSocial ?? c.codigo,
      pedidos: c.pedidosBase.size,
      pedidosAnt: c.pedidosAnt.size,
      valor: c.valorBase,
      valorAnt: c.valorAnt,
      deltaPct: c.valorAnt === 0 ? null : ((c.valorBase - c.valorAnt) / c.valorAnt) * 100,
    }))
    .filter((c) => c.valor > 0 || c.valorAnt > 0);
  const clienteRows = sortStateCli
    ? (sortRows(clienteRowsBase as unknown as Record<string, unknown>[], sortStateCli) as unknown as ClienteRow[])
    : [...clienteRowsBase].sort((a, b) => b.valor - a.valor);

  // ── Produtos vendidos ano a ano por cliente ──────────────────────────
  // Detalhe (cliente × produto) com qtd e valor em anoAnt e anoBase.
  interface ProdAgg {
    codigo: string;
    razaoSocial: string | null;
    produto: string;
    descricao: string | null;
    qtdAnt: number;
    valorAnt: number;
    qtdBase: number;
    valorBase: number;
  }
  const byProd = new Map<string, ProdAgg>();
  for (const p of contratos) {
    const y = p.dtEmissao?.getFullYear();
    if (y !== anoBase && y !== anoAnt) continue;
    const codigo = p.cliente ?? p.pedCliente ?? "Sem cliente";
    const key = `${codigo}||${p.produto}`;
    const cur =
      byProd.get(key) ??
      ({
        codigo,
        razaoSocial: byCli.get(codigo)?.razaoSocial ?? codigo,
        produto: p.produto,
        descricao: p.descricaoProduto,
        qtdAnt: 0,
        valorAnt: 0,
        qtdBase: 0,
        valorBase: 0,
      } as ProdAgg);
    if (!cur.descricao && p.descricaoProduto) cur.descricao = p.descricaoProduto;
    if (y === anoBase) {
      cur.qtdBase += p.quantidade;
      cur.valorBase += p.vlrTotal ?? 0;
    } else {
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

  const produtoRowsBase: ProdutoRow[] = Array.from(byProd.values()).map((p) => ({
    codigo: p.codigo,
    razaoSocial: p.razaoSocial ?? p.codigo,
    produto: p.produto,
    descricao: p.descricao ?? "",
    qtdAnt: p.qtdAnt,
    valorAnt: p.valorAnt,
    qtdBase: p.qtdBase,
    valorBase: p.valorBase,
    status: statusProduto(p.qtdAnt, p.qtdBase),
  }));
  const produtoRows = sortStateProd
    ? (sortRows(produtoRowsBase as unknown as Record<string, unknown>[], sortStateProd) as unknown as ProdutoRow[])
    : [...produtoRowsBase].sort((a, b) => Math.max(b.valorBase, b.valorAnt) - Math.max(a.valorBase, a.valorAnt));

  // ── Alerta: produtos que deixaram de ser vendidos ────────────────────
  // Vendidos (em contratos) no ano anterior, mas SEM venda no ano-base.
  const descontinuados = produtoRowsBase
    .filter((p) => p.status === "Descontinuado")
    .sort((a, b) => b.valorAnt - a.valorAnt);
  const valorPerdido = descontinuados.reduce((a, p) => a + p.valorAnt, 0);

  return (
    <AppShell
      title="Análise de Contratos"
      subtitle={`Pedidos de contrato · comparativo ${anoAnt} × ${anoBase} · entrada e faturamento`}
    >
      <div className="space-y-10">
        {/* ── Visão geral ── */}
        <SectionBlock title={`Visão Geral dos Contratos · ${anoBase}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KPICard
              label={`Entrada Contratos ${anoBase}`}
              value={fmtCurrency(entradaBaseTotal, { compact: true })}
              hint={`${anoAnt}: ${fmtCurrency(entradaAntTotal, { compact: true })}`}
              icon={<FileSignature className="size-4" />}
              tone="brand"
            />
            <KPICard
              label={`Faturamento Líq. ${anoBase}`}
              value={fmtCurrency(fatBaseTotal, { compact: true })}
              hint={`${anoAnt}: ${fmtCurrency(fatAntTotal, { compact: true })}`}
              icon={<Wallet className="size-4" />}
              tone="success"
            />
            <KPICard
              label={`Pedidos de Contrato ${anoBase}`}
              value={fmtNum(pvsBase.size)}
              hint={`${anoAnt}: ${fmtNum(pvsAnt.size)} pedidos`}
              icon={<ClipboardList className="size-4" />}
              tone="neutral"
            />
            <KPICard
              label="Penetração (por valor)"
              value={fmtPct(pctContrato)}
              hint={`Contratos / total entrada ${anoBase}`}
              icon={<Activity className="size-4" />}
              tone="neutral"
            />
            <KPICard
              label="Variação Entrada YoY"
              value={yoyEntrada == null ? "—" : `${yoyEntrada >= 0 ? "+" : ""}${fmtPct(yoyEntrada)}`}
              hint={`Entrada contratos vs ${anoAnt}`}
              icon={<TrendingUp className="size-4" />}
              tone={yoyEntrada == null ? "neutral" : yoyEntrada >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Comparativo Entrada de Pedidos ── */}
        <SectionBlock title={`Entrada de Pedidos de Contrato — ${anoAnt} × ${anoBase}`}>
          <CardSection>
            <BarCompareChart
              seriesA={{ name: String(anoAnt), data: entradaAnt }}
              seriesB={{ name: String(anoBase), data: entradaBase }}
              categories={MES_LABELS}
              height={300}
            />
          </CardSection>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <KPICard label={`Total ${anoAnt}`} value={fmtCurrency(entradaAntTotal, { decimals: 0 })} tone="neutral" />
            <KPICard label={`Total ${anoBase}`} value={fmtCurrency(entradaBaseTotal, { decimals: 0 })} tone="brand" />
            <KPICard
              label="Variação YoY"
              value={yoyEntrada == null ? "—" : `${yoyEntrada >= 0 ? "+" : ""}${fmtPct(yoyEntrada, 1)}`}
              hint={yoyEntrada == null ? "Sem base de comparação" : yoyEntrada >= 0 ? `crescimento vs ${anoAnt}` : `queda vs ${anoAnt}`}
              tone={yoyEntrada == null ? "neutral" : yoyEntrada >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Comparativo Faturamento ── */}
        <SectionBlock title={`Faturamento Líquido de Contratos — ${anoAnt} × ${anoBase}`}>
          <CardSection
            title="Faturamento líquido das notas vinculadas a pedidos de contrato"
            subtitle="Cruzamento por Nº do Pedido (PV) entre faturamento e pedidos com flag de contrato"
          >
            <BarCompareChart
              seriesA={{ name: String(anoAnt), data: fatAnt }}
              seriesB={{ name: String(anoBase), data: fatBase }}
              categories={MES_LABELS}
              height={300}
            />
          </CardSection>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <KPICard label={`Total ${anoAnt}`} value={fmtCurrency(fatAntTotal, { decimals: 0 })} tone="neutral" />
            <KPICard label={`Total ${anoBase}`} value={fmtCurrency(fatBaseTotal, { decimals: 0 })} tone="success" />
            <KPICard
              label="Variação YoY"
              value={yoyFat == null ? "—" : `${yoyFat >= 0 ? "+" : ""}${fmtPct(yoyFat, 1)}`}
              hint={yoyFat == null ? "Sem base de comparação" : yoyFat >= 0 ? `crescimento vs ${anoAnt}` : `queda vs ${anoAnt}`}
              tone={yoyFat == null ? "neutral" : yoyFat >= 0 ? "success" : "danger"}
            />
          </div>
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
            subtitle={`Número do cliente e razão social · valor de entrada ${anoBase} (comparado a ${anoAnt})`}
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
                Produtos vendidos em {anoAnt} sem venda em {anoBase} (em contratos)
              </span>
            }
            subtitle={
              descontinuados.length === 0
                ? `Nenhum produto de contrato deixou de ser vendido entre ${anoAnt} e ${anoBase}.`
                : `${fmtNum(descontinuados.length)} produto(s) descontinuado(s) · ${fmtCurrency(valorPerdido, { compact: true })} faturados em ${anoAnt} sem recompra`
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
                Detalhe cliente × produto · {anoAnt} × {anoBase}
              </span>
            }
            subtitle={`${fmtNum(produtoRows.length)} combinações cliente/produto em contratos`}
          >
            <DataTable
              columns={produtoCols(anoBase, anoAnt)}
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

interface ClienteRow {
  codigo: string;
  razaoSocial: string;
  pedidos: number;
  pedidosAnt: number;
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
      cell: (c) => {
        if (c.deltaPct == null) return <span style={{ color: "var(--fg-subtle)" }}>—</span>;
        const tone = c.deltaPct >= 0 ? "success" : "danger";
        return (
          <StatusBadge tone={tone} dot={false}>
            {c.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(c.deltaPct).toFixed(1)}%
          </StatusBadge>
        );
      },
    },
  ];
}

interface ProdutoRow {
  codigo: string;
  razaoSocial: string;
  produto: string;
  descricao: string;
  qtdAnt: number;
  valorAnt: number;
  qtdBase: number;
  valorBase: number;
  status: "Descontinuado" | "Novo" | "Ativo";
}

function produtoCols(anoBase: number, anoAnt: number): Column<ProdutoRow>[] {
  return [
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
    {
      key: "qtdAnt",
      header: `Qtd ${anoAnt}`,
      sortKey: "qtdAnt",
      align: "right",
      cell: (p) => <span className="numeric text-[12px]">{p.qtdAnt > 0 ? fmtNum(p.qtdAnt) : "—"}</span>,
    },
    {
      key: "valorAnt",
      header: `Valor ${anoAnt}`,
      sortKey: "valorAnt",
      align: "right",
      cell: (p) => (
        <span className="numeric text-[12px]">{p.valorAnt > 0 ? fmtCurrency(p.valorAnt, { compact: true }) : "—"}</span>
      ),
    },
    {
      key: "qtdBase",
      header: `Qtd ${anoBase}`,
      sortKey: "qtdBase",
      align: "right",
      cell: (p) => <span className="numeric text-[12px]">{p.qtdBase > 0 ? fmtNum(p.qtdBase) : "—"}</span>,
    },
    {
      key: "valorBase",
      header: `Valor ${anoBase}`,
      sortKey: "valorBase",
      align: "right",
      cell: (p) => (
        <span className="numeric text-[12px] font-medium">
          {p.valorBase > 0 ? fmtCurrency(p.valorBase, { compact: true }) : "—"}
        </span>
      ),
    },
    {
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
    },
  ];
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
      key: "qtdAnt",
      header: `Qtd ${anoAnt}`,
      align: "right",
      cell: (p) => <span className="numeric text-[12px]">{fmtNum(p.qtdAnt)}</span>,
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
