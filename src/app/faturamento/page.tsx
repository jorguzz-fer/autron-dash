import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFaturamentos, type FaturamentoRow } from "@/lib/services/faturamento";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import SegmentedControl from "@/components/UI/SegmentedControl";
import TimeSeriesChart from "@/components/UI/TimeSeriesChart";
import DistributionChart, { type DistributionView } from "@/components/UI/DistributionChart";
import { fmtCurrency, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import { aggregateByGranularity, parseGranularity, type Granularity } from "@/lib/aggregate";
import { Receipt, TrendingUp, FileText, Percent } from "lucide-react";

export const metadata = { title: "Faturamento — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  gran?: string;
  vendView?: string;
  cliView?: string;
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
function parseView(v: string | undefined, fb: DistributionView = "bar"): DistributionView {
  return (["bar", "pie", "donut", "line", "table"] as const).includes(v as DistributionView)
    ? (v as DistributionView)
    : fb;
}

export default async function FaturamentoPage({
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
  const cliView = parseView(sp.cliView, "bar");

  const fats = await getFaturamentos({
    tenantId: session.user.tenantId,
    dataInicio,
    dataFim,
  });

  if (fats.length === 0) {
    return (
      <AppShell title="Faturamento" subtitle="Notas fiscais + margem + top vendedores">
        <DateRangeFilter label="Emissão" fromValue={sp.from} toValue={sp.to} />
        <CardSection
          title="Sem dados de faturamento no período"
          subtitle="Faça upload do faturamento.xlsx em /uploads ou amplie o filtro de datas."
        >
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Os dados aparecerão aqui assim que a planilha for processada.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const totalBruto = fats.reduce((a, r) => a + (r.faturamentoBruto ?? 0), 0);
  const totalLiquido = fats.reduce((a, r) => a + (r.faturamentoLiquido ?? 0), 0);
  const totalMargemR = fats.reduce((a, r) => a + (r.margemLiquidaR ?? 0), 0);
  const margemMediaPct = totalLiquido === 0 ? 0 : (totalMargemR / totalLiquido) * 100;
  const totalNFs = new Set(fats.map((r) => r.numDocto)).size;

  const fatSeries = aggregateByGranularity(
    fats,
    (r) => r.emissao,
    (r) => r.faturamentoLiquido ?? 0,
    gran,
  ).slice(gran === "month" ? -12 : gran === "week" ? -16 : -30);

  const byVendedor = new Map<string, number>();
  for (const r of fats) {
    const v = r.nomeVendedor ?? "Sem vendedor";
    byVendedor.set(v, (byVendedor.get(v) ?? 0) + (r.faturamentoLiquido ?? 0));
  }
  const topVendedores = Array.from(byVendedor.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const byCliente = new Map<string, number>();
  for (const r of fats) {
    const c = r.razaoSocial ?? "Sem cliente";
    byCliente.set(c, (byCliente.get(c) ?? 0) + (r.faturamentoLiquido ?? 0));
  }
  const topClientes = Array.from(byCliente.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const baseTabela = fats.slice(0, 50);
  const tabela = sortRows(
    baseTabela as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as FaturamentoRow[];

  return (
    <AppShell title="Faturamento" subtitle="Notas fiscais + margem + top vendedores">
      <div className="space-y-5">
        <DateRangeFilter label="Emissão" fromValue={sp.from} toValue={sp.to} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard
            label="Faturamento bruto"
            value={fmtCurrency(totalBruto, { compact: true })}
            hint={`${fmtNum(fats.length)} itens em NF`}
            icon={<Receipt className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="Faturamento líquido"
            value={fmtCurrency(totalLiquido, { compact: true })}
            hint="Sem impostos"
            icon={<TrendingUp className="size-4" />}
            tone="success"
          />
          <KPICard
            label="Margem média"
            value={fmtPct(margemMediaPct, 1)}
            hint={fmtCurrency(totalMargemR, { compact: true })}
            icon={<Percent className="size-4" />}
            tone={margemMediaPct >= 30 ? "success" : "warning"}
          />
          <KPICard
            label="Notas fiscais"
            value={fmtNum(totalNFs)}
            hint="Documentos únicos"
            icon={<FileText className="size-4" />}
            tone="neutral"
          />
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <CardSection
            title="Faturamento líquido"
            subtitle={
              gran === "day" ? "Últimos 30 dias" : gran === "week" ? "Últimas 16 semanas" : "Últimos 12 meses"
            }
            actions={
              <SegmentedControl name="gran" value={gran} options={GRAN_OPTS} size="sm" ariaLabel="Granularidade" />
            }
          >
            <TimeSeriesChart
              data={fatSeries}
              type="area"
              valueFormat="currencyCompact"
              seriesName="Faturamento líquido"
            />
          </CardSection>
          <CardSection
            title="Top vendedores"
            subtitle="Por faturamento líquido"
            actions={
              <SegmentedControl name="vendView" value={vendView} options={VIEW_OPTS} size="sm" ariaLabel="Visualização" />
            }
          >
            <DistributionChart
              data={topVendedores.map((v) => ({ ...v, display: fmtCurrency(v.value, { compact: true }) }))}
              view={vendView}
              valueFormat="currencyCompact"
              hbarTone="success"
            />
          </CardSection>
          <CardSection
            title="Top clientes"
            subtitle="Por faturamento líquido"
            actions={
              <SegmentedControl name="cliView" value={cliView} options={VIEW_OPTS} size="sm" ariaLabel="Visualização" />
            }
          >
            <DistributionChart
              data={topClientes.map((v) => ({ ...v, display: fmtCurrency(v.value, { compact: true }) }))}
              view={cliView}
              valueFormat="currencyCompact"
              hbarTone="brand"
            />
          </CardSection>
        </section>

        <CardSection
          title="Notas fiscais"
          subtitle={`${fmtNum(tabela.length)} de ${fmtNum(fats.length)} itens — clique em qualquer coluna pra ordenar`}
        >
          <DataTable
            columns={fatCols}
            rows={tabela}
            rowKey={(r) => r.id}
            emptyMessage="Sem dados."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

const fatCols: Column<FaturamentoRow>[] = [
  {
    key: "emissao",
    header: "Emissão",
    sortKey: "emissao",
    cell: (r) => <span className="numeric text-[12px]">{fmtDate(r.emissao)}</span>,
  },
  { key: "nf", header: "NF", sortKey: "numDocto", cell: (r) => <span className="numeric">{r.numDocto}</span> },
  { key: "pv", header: "PV", sortKey: "noPedido", cell: (r) => <span className="numeric">{r.noPedido ?? "—"}</span> },
  {
    key: "produto",
    header: "Produto",
    sortKey: "produto",
    cell: (r) => (
      <div>
        <code className="font-mono text-[12px]">{r.produto}</code>
        <div
          className="max-w-[240px] truncate text-[11.5px]"
          title={r.descricaoProduto ?? ""}
          style={{ color: "var(--fg-muted)" }}
        >
          {r.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    sortKey: "razaoSocial",
    cell: (r) => (
      <div>
        <span className="block max-w-[200px] truncate" title={r.razaoSocial ?? ""}>
          {r.razaoSocial ?? "—"}
        </span>
        {r.uf && (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {r.uf}
          </span>
        )}
      </div>
    ),
  },
  { key: "vendedor", header: "Vendedor", sortKey: "nomeVendedor", cell: (r) => <span className="text-[12px]">{r.nomeVendedor ?? "—"}</span> },
  {
    key: "qtd",
    header: "Qtd",
    sortKey: "quantidade",
    align: "right",
    cell: (r) => <span className="numeric">{fmtNum(r.quantidade)}</span>,
  },
  {
    key: "bruto",
    header: "Bruto",
    sortKey: "faturamentoBruto",
    align: "right",
    cell: (r) => <span className="numeric text-[12px]">{fmtCurrency(r.faturamentoBruto, { compact: true })}</span>,
  },
  {
    key: "liquido",
    header: "Líquido",
    sortKey: "faturamentoLiquido",
    align: "right",
    cell: (r) => <span className="numeric font-medium">{fmtCurrency(r.faturamentoLiquido, { compact: true })}</span>,
  },
  {
    key: "margem",
    header: "Margem",
    sortKey: "margemLiquidaPct",
    align: "right",
    cell: (r) => <span className="numeric text-[12px]">{fmtPct(r.margemLiquidaPct ?? null, 1)}</span>,
  },
];
