import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import SegmentedControl from "@/components/UI/SegmentedControl";
import TimeSeriesChart from "@/components/UI/TimeSeriesChart";
import DistributionChart, { type DistributionView } from "@/components/UI/DistributionChart";
import { fmtCurrency, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import { aggregateByGranularity, parseGranularity, type Granularity } from "@/lib/aggregate";
import { ClipboardList, Activity, CheckCircle2, Wallet } from "lucide-react";
import type { PedidoEnriched } from "@/lib/domain";

export const metadata = { title: "Visão Geral — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  gran?: string;
  vendView?: string;
}

const GRAN_OPTS = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

const VIEW_OPTS = [
  { value: "bar", label: "Barras" },
  { value: "pie", label: "Pizza" },
  { value: "table", label: "Tabela" },
];

function parseView(v: string | undefined, fallback: DistributionView = "bar"): DistributionView {
  return (["bar", "pie", "donut", "line", "table"] as const).includes(v as DistributionView)
    ? (v as DistributionView)
    : fallback;
}

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const dataInicio = parseDateInput(sp.from);
  const dataFim = parseDateInput(sp.to, true);
  const sortState = parseSort(sp.sort, sp.dir);
  const gran: Granularity = parseGranularity(sp.gran, "month");
  const vendView = parseView(sp.vendView, "bar");

  const pedidos = await getEnrichedPedidos({
    tenantId: session.user.tenantId,
    dataInicio,
    dataFim,
  });

  const totalPVs = new Set(pedidos.map((p) => p.numPedido)).size;
  const totalLinhas = pedidos.length;
  const emAberto = pedidos.filter((p) => p.statusPedido === "EM ABERTO");
  const finalizados = pedidos.filter((p) => p.statusPedido === "FINALIZADO");
  const valorEmAberto = emAberto.reduce((acc, p) => acc + (p.vlrTotal ?? 0), 0);
  const pctConclusao = totalLinhas === 0 ? 0 : (finalizados.length / totalLinhas) * 100;

  const entradaSeries = aggregateByGranularity(
    pedidos,
    (p) => p.dtEmissao,
    () => 1,
    gran,
  ).slice(gran === "month" ? -12 : gran === "week" ? -16 : -30);

  const byVendedor = new Map<string, number>();
  for (const p of pedidos) {
    const v = p.nomeVendedor ?? "Sem vendedor";
    byVendedor.set(v, (byVendedor.get(v) ?? 0) + 1);
  }
  const topVendedores = Array.from(byVendedor.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Tabela default: top 30 por valor desc. Se houver sort URL, aplica em cima do top 30.
  const baseTabela = [...emAberto]
    .sort((a, b) => (b.vlrTotal ?? 0) - (a.vlrTotal ?? 0))
    .slice(0, 30);
  const tabela = sortRows(baseTabela as unknown as Record<string, unknown>[], sortState) as unknown as PedidoEnriched[];

  return (
    <AppShell title="Visão Geral" subtitle="Status macro e entrada de pedidos por mês">
      <div className="space-y-5">
        <DateRangeFilter label="Emissão" fromValue={sp.from} toValue={sp.to} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard
            label="Total de PVs"
            value={fmtNum(totalPVs)}
            hint={`${fmtNum(totalLinhas)} linhas`}
            icon={<ClipboardList className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="Em aberto"
            value={fmtNum(emAberto.length)}
            hint={fmtCurrency(valorEmAberto, { compact: true })}
            icon={<Activity className="size-4" />}
            tone="warning"
          />
          <KPICard
            label="Finalizados"
            value={fmtNum(finalizados.length)}
            hint={fmtPct(pctConclusao, 1) + " conclusão"}
            icon={<CheckCircle2 className="size-4" />}
            tone="success"
          />
          <KPICard
            label="Valor em aberto"
            value={fmtCurrency(valorEmAberto, { compact: true })}
            hint="Total de PVs ainda não faturados"
            icon={<Wallet className="size-4" />}
            tone="neutral"
          />
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CardSection
            title="Entrada de pedidos"
            subtitle={
              gran === "day" ? "Últimos 30 dias" : gran === "week" ? "Últimas 16 semanas" : "Últimos 12 meses"
            }
            actions={
              <SegmentedControl
                name="gran"
                value={gran}
                options={GRAN_OPTS}
                size="sm"
                ariaLabel="Granularidade"
              />
            }
          >
            <TimeSeriesChart data={entradaSeries} type="bar" seriesName="Pedidos" />
          </CardSection>
          <CardSection
            title="Top vendedores"
            subtitle="Por número de linhas"
            actions={
              <SegmentedControl
                name="vendView"
                value={vendView}
                options={VIEW_OPTS}
                size="sm"
                ariaLabel="Visualização"
              />
            }
          >
            <DistributionChart data={topVendedores} view={vendView} hbarTone="brand" />
          </CardSection>
        </section>

        <CardSection
          title="Maiores pedidos em aberto"
          subtitle={`${fmtNum(tabela.length)} de ${fmtNum(emAberto.length)} pedidos em aberto, ordenados por valor`}
        >
          <DataTable
            columns={visaoGeralCols}
            rows={tabela}
            rowKey={(p) => p.id}
            emptyMessage="Sem pedidos em aberto."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

const visaoGeralCols: Column<PedidoEnriched>[] = [
  { key: "pv", header: "PV", sortKey: "numPedido", cell: (p) => <span className="numeric">{p.numPedido}</span>, width: "90px" },
  { key: "item", header: "Item", sortKey: "item", cell: (p) => <span className="numeric">{p.item}</span>, width: "60px" },
  { key: "produto", header: "Produto", sortKey: "produto", cell: (p) => <code className="font-mono text-[12px]">{p.produto}</code>, width: "140px" },
  {
    key: "desc",
    header: "Descrição",
    sortKey: "descricaoProduto",
    cell: (p) => (
      <span className="block max-w-[280px] truncate" title={p.descricaoProduto ?? ""}>
        {p.descricaoProduto ?? "—"}
      </span>
    ),
  },
  { key: "qtd", header: "Qtd", sortKey: "quantidade", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.quantidade)}</span> },
  {
    key: "vlr",
    header: "Valor",
    sortKey: "vlrTotal",
    align: "right",
    cell: (p) => <span className="numeric font-medium">{fmtCurrency(p.vlrTotal)}</span>,
  },
  { key: "vendedor", header: "Vendedor", sortKey: "nomeVendedor", cell: (p) => <span className="truncate">{p.nomeVendedor ?? "—"}</span> },
  {
    key: "emissao",
    header: "Emissão",
    sortKey: "dtEmissao",
    cell: (p) => <span className="numeric text-[12px]">{fmtDate(p.dtEmissao)}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: () => <StatusBadge tone="warning">Em aberto</StatusBadge>,
  },
];
