import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getMetas, type Unidade } from "@/lib/services/metas";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import SegmentedControl from "@/components/UI/SegmentedControl";
import TimeSeriesChart from "@/components/UI/TimeSeriesChart";
import { fmtCurrency, fmtNum, fmtPct } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";
import { aggregateByGranularity, parseGranularity, type Granularity } from "@/lib/aggregate";
import {
  ClipboardList,
  TrendingUp,
  Wallet,
  Target,
  Activity,
  Building2,
  FileSignature,
} from "lucide-react";

export const metadata = { title: "Entrada de Pedidos — Autron Dash" };

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface SP { sort?: string; dir?: string; gran?: string }

const GRAN_OPTS = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

export default async function EntradaPedidosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const sortState = parseSort(sp.sort, sp.dir);
  const gran: Granularity = parseGranularity(sp.gran, "month");

  const tenantId = session.user.tenantId;
  const all = await getEnrichedPedidos({ tenantId });

  // Ano-base = ano atual no servidor (ou maior ano com dados)
  const anosComDados = Array.from(
    new Set(all.filter((p) => p.dtEmissao).map((p) => p.dtEmissao!.getFullYear())),
  ).sort();
  const anoBase = anosComDados.length > 0 ? Math.max(...anosComDados) : new Date().getFullYear();

  const [metas] = await Promise.all([getMetas(tenantId, anoBase)]);
  const metasOutroAno = await getMetas(tenantId, anoBase - 1);

  // ── KPIs ──────────────────────────────────────────────────────────
  const totalPVs = new Set(all.map((p) => p.numPedido)).size;
  const totalLinhas = all.length;
  const valorTotal = all.reduce((acc, p) => acc + (p.vlrTotal ?? 0), 0);
  const pedidosAno = all.filter((p) => p.dtEmissao?.getFullYear() === anoBase);
  const valorAno = pedidosAno.reduce((acc, p) => acc + (p.vlrTotal ?? 0), 0);

  const metaGrupoAno = metas
    .filter((m) => m.unidade === "GRUPO" && m.categoria === "ENTRADA_PEDIDO")
    .reduce((acc, m) => acc + m.valor, 0);
  const pctAtingimentoGrupo =
    metaGrupoAno === 0 ? 0 : (valorAno / metaGrupoAno) * 100;

  // ── Histórico (granularidade configurável) ────────────────────────
  const entradaSeries = aggregateByGranularity(
    all,
    (p) => p.dtEmissao,
    (p) => p.vlrTotal ?? 0,
    gran,
  ).slice(gran === "month" ? -24 : gran === "week" ? -26 : -60);

  // ── Por Unidade de Negócio (no anoBase) ───────────────────────────
  const byUnidade = new Map<string, { pvs: Set<string>; pecas: number; valor: number }>();
  for (const p of pedidosAno) {
    const u = p.unidadeNegocio ?? "Sem unidade";
    const cur = byUnidade.get(u) ?? { pvs: new Set(), pecas: 0, valor: 0 };
    cur.pvs.add(p.numPedido);
    cur.pecas += p.quantidade;
    cur.valor += p.vlrTotal ?? 0;
    byUnidade.set(u, cur);
  }
  const unidades = Array.from(byUnidade.entries())
    .map(([u, v]) => ({ unidade: u, pvs: v.pvs.size, pecas: v.pecas, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor);

  // ── Pedidos de Contrato ───────────────────────────────────────────
  const contratosAno = pedidosAno.filter((p) => p.contrato).length;
  const linhasAno = pedidosAno.length;
  const pctContrato = linhasAno === 0 ? 0 : (contratosAno / linhasAno) * 100;
  const pedidosAnoAnterior = all.filter((p) => p.dtEmissao?.getFullYear() === anoBase - 1);
  const contratosAnoAnt = pedidosAnoAnterior.filter((p) => p.contrato).length;
  const pctContratoAnt =
    pedidosAnoAnterior.length === 0 ? 0 : (contratosAnoAnt / pedidosAnoAnterior.length) * 100;
  const deltaPenetracao = pctContrato - pctContratoAnt;

  // ── Por Cliente (top) ─────────────────────────────────────────────
  const byCliente = new Map<string, { pvs: Set<string>; pecas: number; valor: number; valorAnt: number }>();
  for (const p of all) {
    const cli = p.cliente ?? p.pedCliente ?? "Sem cliente";
    const cur = byCliente.get(cli) ?? { pvs: new Set(), pecas: 0, valor: 0, valorAnt: 0 };
    if (p.dtEmissao?.getFullYear() === anoBase) {
      cur.pvs.add(p.numPedido);
      cur.pecas += p.quantidade;
      cur.valor += p.vlrTotal ?? 0;
    } else if (p.dtEmissao?.getFullYear() === anoBase - 1) {
      cur.valorAnt += p.vlrTotal ?? 0;
    }
    byCliente.set(cli, cur);
  }
  const topClientes = Array.from(byCliente.entries())
    .map(([cliente, v]) => ({
      cliente,
      pvs: v.pvs.size,
      pecas: v.pecas,
      valor: v.valor,
      valorAnt: v.valorAnt,
      deltaPct: v.valorAnt === 0 ? null : ((v.valor - v.valorAnt) / v.valorAnt) * 100,
    }))
    .filter((c) => c.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 15);

  // ── Meta x Realizado mensal ───────────────────────────────────────
  function metaRealizadoMensal(unidade: Unidade | "AUTRON_SEM_ERGOMEC") {
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      let meta = 0;
      if (unidade === "AUTRON_SEM_ERGOMEC") {
        meta = metas
          .filter((m) => m.unidade === "AUTRON" && m.categoria === "ENTRADA_PEDIDO" && m.mes === mes)
          .reduce((a, m) => a + m.valor, 0);
      } else {
        meta = metas
          .filter((m) => m.unidade === unidade && m.categoria === "ENTRADA_PEDIDO" && m.mes === mes)
          .reduce((a, m) => a + m.valor, 0);
      }

      const realizado = pedidosAno
        .filter((p) => {
          if (p.dtEmissao?.getMonth() !== mes - 1) return false;
          if (unidade === "ERGOMEC") return p.unidadeNegocio === "IND21";
          if (unidade === "AUTRON_SEM_ERGOMEC") return p.unidadeNegocio !== "IND21";
          // GRUPO ou AUTRON: tudo
          return true;
        })
        .reduce((a, p) => a + (p.vlrTotal ?? 0), 0);

      return { mes, label: MONTH_LABELS[i], meta, realizado, atingimento: meta === 0 ? null : (realizado / meta) * 100 };
    });
  }

  const mxrGrupo = metaRealizadoMensal("GRUPO");
  const mxrAutron = metaRealizadoMensal("AUTRON_SEM_ERGOMEC");
  const mxrErgomec = metaRealizadoMensal("ERGOMEC");

  return (
    <AppShell
      title="Entrada de Pedidos"
      subtitle={`Análise de entrada por mês, unidade e meta · ano-base ${anoBase}`}
    >
      <div className="space-y-5">
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KPICard label="Total PVs" value={fmtNum(totalPVs)} hint={`${fmtNum(totalLinhas)} linhas`} icon={<ClipboardList className="size-4" />} tone="brand" />
          <KPICard label="Valor total" value={fmtCurrency(valorTotal, { compact: true })} hint="Acumulado histórico" icon={<Wallet className="size-4" />} tone="neutral" />
          <KPICard label={`Valor ${anoBase}`} value={fmtCurrency(valorAno, { compact: true })} hint={`${fmtNum(pedidosAno.length)} linhas no ano`} icon={<TrendingUp className="size-4" />} tone="brand" />
          <KPICard label={`Meta ${anoBase} Grupo`} value={fmtCurrency(metaGrupoAno, { compact: true })} hint={metaGrupoAno > 0 ? "Plano anual GRUPO" : "Sem meta cadastrada"} icon={<Target className="size-4" />} tone="warning" />
          <KPICard
            label={`Atingimento ${anoBase}`}
            value={fmtPct(pctAtingimentoGrupo)}
            hint={metaGrupoAno > 0 ? "Realizado / Meta GRUPO" : "Carregue Metas em /uploads"}
            icon={<Activity className="size-4" />}
            tone={pctAtingimentoGrupo >= 100 ? "success" : pctAtingimentoGrupo >= 70 ? "warning" : "danger"}
            active={pctAtingimentoGrupo >= 100}
          />
        </section>

        {/* Histórico (granularidade dinâmica) */}
        <CardSection
          title="Entrada de pedidos — valor"
          subtitle={
            gran === "day" ? "Últimos 60 dias" : gran === "week" ? "Últimas 26 semanas" : "Últimos 24 meses"
          }
          actions={
            <SegmentedControl name="gran" value={gran} options={GRAN_OPTS} size="sm" ariaLabel="Granularidade" />
          }
        >
          <TimeSeriesChart
            data={entradaSeries}
            type="bar"
            valueFormat="currencyCompact"
            seriesName="Valor"
            height={320}
          />
        </CardSection>

        {/* Análise por Unidade de Negócio */}
        <CardSection
          title={
            <span className="flex items-center gap-2">
              <Building2 className="size-4" />
              Análise por Unidade de Negócio · {anoBase}
            </span>
          }
          subtitle={metasOutroAno.length === 0 ? `Sem dados de ${anoBase - 1} para comparar` : undefined}
        >
          <DataTable
            columns={unidadeCols}
            rows={sortRows(unidades as unknown as Record<string, unknown>[], sortState) as unknown as typeof unidades}
            rowKey={(u) => u.unidade}
            emptyMessage={`Sem pedidos em ${anoBase}.`}
          />
        </CardSection>

        {/* Pedidos de Contrato */}
        <CardSection
          title={
            <span className="flex items-center gap-2">
              <FileSignature className="size-4" />
              Pedidos de Contrato — Penetração {anoBase}
            </span>
          }
          subtitle={`${fmtNum(contratosAno)} pedidos com contrato em ${anoBase} · ${fmtPct(pctContrato)} de penetração`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard label="Contratos no ano" value={fmtNum(contratosAno)} icon={<FileSignature className="size-4" />} tone="brand" />
            <KPICard label="% Penetração" value={fmtPct(pctContrato)} hint={`Ano anterior: ${fmtPct(pctContratoAnt)}`} icon={<Activity className="size-4" />} tone="neutral" />
            <KPICard
              label="Variação vs ano anterior"
              value={`${deltaPenetracao >= 0 ? "+" : ""}${deltaPenetracao.toFixed(1)} p.p.`}
              hint="Pontos percentuais"
              icon={<TrendingUp className="size-4" />}
              tone={deltaPenetracao >= 0 ? "success" : "danger"}
            />
          </div>
        </CardSection>

        {/* Por Cliente (Grupo Vend.) */}
        <CardSection
          title="Por Cliente — Top 15"
          subtitle={`Comparativo ${anoBase} vs ${anoBase - 1}`}
        >
          <DataTable
            columns={clienteCols(anoBase)}
            rows={sortRows(topClientes as unknown as Record<string, unknown>[], sortState) as unknown as typeof topClientes}
            rowKey={(c) => c.cliente}
            emptyMessage="Sem dados de cliente."
          />
        </CardSection>

        {/* Meta x Realizado — 3 versões */}
        <section className="space-y-5">
          <MetaXRealizadoCard title={`Meta x Realizado — Grupo · ${anoBase}`} rows={mxrGrupo} />
          <MetaXRealizadoCard title={`Meta x Realizado — Autron (sem Ergomec) · ${anoBase}`} rows={mxrAutron} />
          <MetaXRealizadoCard title={`Meta x Realizado — Ergomec (IND21) · ${anoBase}`} rows={mxrErgomec} />
        </section>
      </div>
    </AppShell>
  );
}

// ─── Components & cells ─────────────────────────────────────────────

interface MxRRow {
  mes: number;
  label: string;
  meta: number;
  realizado: number;
  atingimento: number | null;
}

function MetaXRealizadoCard({ title, rows }: { title: string; rows: MxRRow[] }) {
  const totalMeta = rows.reduce((a, r) => a + r.meta, 0);
  const totalReal = rows.reduce((a, r) => a + r.realizado, 0);
  const atingTotal = totalMeta === 0 ? null : (totalReal / totalMeta) * 100;
  const hasMeta = totalMeta > 0;

  return (
    <CardSection
      title={title}
      subtitle={
        hasMeta
          ? `Meta anual ${fmtCurrency(totalMeta, { compact: true })} · Realizado ${fmtCurrency(totalReal, { compact: true })} · Atingimento ${fmtPct(atingTotal ?? 0)}`
          : "Sem meta cadastrada — faça upload do dataset META em /uploads"
      }
    >
      <DataTable
        columns={mxrCols}
        rows={rows}
        rowKey={(r) => String(r.mes)}
        emptyMessage="Sem dados."
      />
    </CardSection>
  );
}

const mxrCols: Column<MxRRow>[] = [
  { key: "mes", header: "Mês", cell: (r) => <span className="capitalize">{r.label}</span>, width: "70px" },
  { key: "meta", header: "Meta", align: "right", cell: (r) => <span className="numeric text-[12px]">{fmtCurrency(r.meta, { compact: true })}</span> },
  { key: "real", header: "Realizado", align: "right", cell: (r) => <span className="numeric font-medium">{fmtCurrency(r.realizado, { compact: true })}</span> },
  {
    key: "ating",
    header: "Atingimento",
    align: "right",
    cell: (r) => {
      if (r.atingimento == null) return <span style={{ color: "var(--fg-subtle)" }}>—</span>;
      const tone = r.atingimento >= 100 ? "success" : r.atingimento >= 70 ? "warning" : "danger";
      return <StatusBadge tone={tone}>{fmtPct(r.atingimento)}</StatusBadge>;
    },
  },
];

interface UnidadeRow {
  unidade: string;
  pvs: number;
  pecas: number;
  valor: number;
}

const unidadeCols: Column<UnidadeRow>[] = [
  { key: "un", header: "Unidade", sortKey: "unidade", cell: (u) => <span className="font-medium">{u.unidade}</span>, width: "120px" },
  { key: "pvs", header: "PVs", sortKey: "pvs", align: "right", cell: (u) => <span className="numeric">{fmtNum(u.pvs)}</span> },
  { key: "pec", header: "Peças", sortKey: "pecas", align: "right", cell: (u) => <span className="numeric">{fmtNum(u.pecas)}</span> },
  { key: "val", header: "Valor", sortKey: "valor", align: "right", cell: (u) => <span className="numeric font-medium">{fmtCurrency(u.valor, { compact: true })}</span> },
];

interface ClienteRow {
  cliente: string;
  pvs: number;
  pecas: number;
  valor: number;
  valorAnt: number;
  deltaPct: number | null;
}

function clienteCols(anoBase: number): Column<ClienteRow>[] {
  return [
    {
      key: "cli",
      header: "Cliente",
      sortKey: "cliente",
      cell: (c) => (
        <span className="block max-w-[280px] truncate" title={c.cliente}>
          {c.cliente}
        </span>
      ),
    },
    { key: "pvs", header: "PVs", sortKey: "pvs", align: "right", cell: (c) => <span className="numeric">{fmtNum(c.pvs)}</span> },
    { key: "pec", header: "Peças", sortKey: "pecas", align: "right", cell: (c) => <span className="numeric">{fmtNum(c.pecas)}</span> },
    { key: "val", header: `Valor ${anoBase}`, sortKey: "valor", align: "right", cell: (c) => <span className="numeric font-medium">{fmtCurrency(c.valor, { compact: true })}</span> },
    { key: "ant", header: `Valor ${anoBase - 1}`, sortKey: "valorAnt", align: "right", cell: (c) => <span className="numeric text-[12px]">{c.valorAnt > 0 ? fmtCurrency(c.valorAnt, { compact: true }) : "—"}</span> },
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
