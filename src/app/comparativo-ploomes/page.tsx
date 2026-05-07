import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getPloomes, type PloomesOportunidade } from "@/lib/services/ploomes";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import SegmentedControl from "@/components/UI/SegmentedControl";
import DistributionChart, { type DistributionView } from "@/components/UI/DistributionChart";
import { fmtCurrency, fmtDate, fmtNum, fmtPct, monthKey, monthLabel } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import {
  Trophy,
  Wallet,
  ArrowRightCircle,
  Activity,
  Target,
  GitCompareArrows,
} from "lucide-react";

export const metadata = { title: "Comparativo Ploomes — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  respView?: string;
  cliView?: string;
}

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

export default async function ComparativoPloomesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const desde = parseDateInput(sp.from);
  const ate = parseDateInput(sp.to, true);
  const sortState = parseSort(sp.sort, sp.dir);
  const respView = parseView(sp.respView, "bar");
  const cliView = parseView(sp.cliView, "bar");

  const tenantId = session.user.tenantId;
  const [oportunidades, enriched] = await Promise.all([
    getPloomes({ tenantId, desde, ate }),
    getEnrichedPedidos({ tenantId }),
  ]);

  if (oportunidades.length === 0) {
    return (
      <AppShell title="Comparativo Ploomes" subtitle="CRM × Pedidos efetivados">
        <DateRangeFilter label="Ganho em" fromValue={sp.from} toValue={sp.to} />
        <CardSection
          title="Sem oportunidades no período"
          subtitle="Faça upload do Ganhas.xlsx em /uploads ou amplie o filtro de datas."
        >
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Este painel cruza as oportunidades GANHAS no Ploomes com os pedidos
            efetivamente entrados, e calcula a taxa de conversão CRM → Pedido.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const pedidosPorPC = new Map<string, typeof enriched[number][]>();
  for (const p of enriched) {
    const pc = p.pedCliente;
    if (!pc) continue;
    const arr = pedidosPorPC.get(pc) ?? [];
    arr.push(p);
    pedidosPorPC.set(pc, arr);
  }

  const oportunidadesEnriched = oportunidades.map((op) => {
    const pcKey = op.pedidoCompraCliente;
    const pedidosBatentes = pcKey ? pedidosPorPC.get(pcKey) ?? [] : [];
    const valorPedidos = pedidosBatentes.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
    return {
      ...op,
      virouPedido: pedidosBatentes.length > 0,
      pedidosCount: pedidosBatentes.length,
      valorPedidos,
    };
  });

  const totalGanhas = oportunidades.length;
  const valorGanhasTotal = oportunidades.reduce((a, o) => a + (o.valor ?? 0), 0);
  const ticketMedio = totalGanhas === 0 ? 0 : valorGanhasTotal / totalGanhas;
  const comPC = oportunidadesEnriched.filter((o) => o.pedidoCompraCliente).length;
  const viraramPedido = oportunidadesEnriched.filter((o) => o.virouPedido).length;
  const conversao = comPC === 0 ? 0 : (viraramPedido / comPC) * 100;
  const valorBatente = oportunidadesEnriched
    .filter((o) => o.virouPedido)
    .reduce((a, o) => a + (o.valorPedidos ?? 0), 0);

  const anos = Array.from(
    new Set(oportunidades.filter((o) => o.termino).map((o) => o.termino!.getFullYear())),
  ).sort();
  const anoBase = anos.length > 0 ? Math.max(...anos) : new Date().getFullYear();

  const oppByMonth = new Map<string, { count: number; valor: number }>();
  for (const o of oportunidades) {
    if (!o.termino) continue;
    if (o.termino.getFullYear() !== anoBase) continue;
    const k = monthKey(o.termino);
    const cur = oppByMonth.get(k) ?? { count: 0, valor: 0 };
    cur.count++;
    cur.valor += o.valor ?? 0;
    oppByMonth.set(k, cur);
  }
  const pedByMonth = new Map<string, { pvs: Set<string>; valor: number }>();
  for (const p of enriched) {
    if (!p.dtEmissao || p.dtEmissao.getFullYear() !== anoBase) continue;
    const k = monthKey(p.dtEmissao);
    const cur = pedByMonth.get(k) ?? { pvs: new Set(), valor: 0 };
    cur.pvs.add(p.numPedido);
    cur.valor += p.vlrTotal ?? 0;
    pedByMonth.set(k, cur);
  }
  const allMonthKeys = Array.from(
    new Set([...oppByMonth.keys(), ...pedByMonth.keys()]),
  ).sort();

  const byResp = new Map<string, { count: number; valor: number }>();
  for (const o of oportunidades) {
    const r = o.responsavel ?? "Sem responsável";
    const cur = byResp.get(r) ?? { count: 0, valor: 0 };
    cur.count++;
    cur.valor += o.valor ?? 0;
    byResp.set(r, cur);
  }
  const topResponsaveis = Array.from(byResp.entries())
    .map(([label, v]) => ({ label, value: v.valor, count: v.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const byCliente = new Map<string, { count: number; valor: number }>();
  for (const o of oportunidades) {
    const c = o.cliente ?? "Sem cliente";
    const cur = byCliente.get(c) ?? { count: 0, valor: 0 };
    cur.count++;
    cur.valor += o.valor ?? 0;
    byCliente.set(c, cur);
  }
  const topClientes = Array.from(byCliente.entries())
    .map(([label, v]) => ({ label, value: v.valor }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const baseTabela = oportunidadesEnriched.slice(0, 60);
  const tabela = sortRows(
    baseTabela as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as TabelaRow[];

  return (
    <AppShell
      title="Comparativo Ploomes"
      subtitle={`CRM × Pedidos — ${fmtNum(totalGanhas)} oportunidades no período`}
    >
      <div className="space-y-5">
        <DateRangeFilter label="Ganho em" fromValue={sp.from} toValue={sp.to} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KPICard
            label="Oportunidades ganhas"
            value={fmtNum(totalGanhas)}
            hint="Total no CRM"
            icon={<Trophy className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="Valor ganhas"
            value={fmtCurrency(valorGanhasTotal, { compact: true })}
            hint={`Ticket médio: ${fmtCurrency(ticketMedio, { compact: true })}`}
            icon={<Wallet className="size-4" />}
            tone="success"
          />
          <KPICard
            label="Viraram pedido"
            value={fmtNum(viraramPedido)}
            hint={`De ${fmtNum(comPC)} com PO informada`}
            icon={<ArrowRightCircle className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="Conversão CRM → Pedido"
            value={fmtPct(conversao)}
            hint="Apenas oport. com PO informada"
            icon={<Activity className="size-4" />}
            tone={conversao >= 60 ? "success" : conversao >= 30 ? "warning" : "danger"}
          />
          <KPICard
            label="Valor convertido"
            value={fmtCurrency(valorBatente, { compact: true })}
            hint="Soma vlrTotal dos pedidos batentes"
            icon={<Target className="size-4" />}
            tone="brand"
          />
        </section>

        <CardSection
          title={
            <span className="flex items-center gap-2">
              <GitCompareArrows className="size-4" />
              Oportunidades vs Pedidos · {anoBase}
            </span>
          }
          subtitle="Tendência mensal: contagem e valor de oportunidades ganhas no CRM vs pedidos entrados"
        >
          <DataTable
            columns={mesCols}
            rows={allMonthKeys.map((k) => {
              const o = oppByMonth.get(k);
              const p = pedByMonth.get(k);
              return {
                key: k,
                label: monthLabel(k),
                ganhasCount: o?.count ?? 0,
                ganhasValor: o?.valor ?? 0,
                pedidosCount: p?.pvs.size ?? 0,
                pedidosValor: p?.valor ?? 0,
              };
            })}
            rowKey={(m) => m.key}
            emptyMessage="Sem dados."
          />
        </CardSection>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CardSection
            title="Top responsáveis"
            subtitle="Por valor de oportunidades ganhas"
            actions={
              <SegmentedControl name="respView" value={respView} options={VIEW_OPTS} size="sm" ariaLabel="Visualização" />
            }
          >
            <DistributionChart
              data={topResponsaveis.map((r) => ({
                label: `${r.label} (${r.count})`,
                value: r.value,
                display: fmtCurrency(r.value, { compact: true }),
              }))}
              view={respView}
              valueFormat="currencyCompact"
              hbarTone="success"
            />
          </CardSection>
          <CardSection
            title="Top clientes"
            subtitle="Por valor de oportunidades ganhas"
            actions={
              <SegmentedControl name="cliView" value={cliView} options={VIEW_OPTS} size="sm" ariaLabel="Visualização" />
            }
          >
            <DistributionChart
              data={topClientes.map((c) => ({
                ...c,
                display: fmtCurrency(c.value, { compact: true }),
              }))}
              view={cliView}
              valueFormat="currencyCompact"
              hbarTone="brand"
            />
          </CardSection>
        </section>

        <CardSection
          title="Oportunidades — cruzamento com pedidos"
          subtitle="Top 60 · clique em qualquer coluna pra ordenar"
        >
          <DataTable<TabelaRow>
            columns={tabelaCols}
            rows={tabela}
            rowKey={(o) => o.id}
            emptyMessage="Sem oportunidades."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

interface MesRow {
  key: string;
  label: string;
  ganhasCount: number;
  ganhasValor: number;
  pedidosCount: number;
  pedidosValor: number;
}

const mesCols: Column<MesRow>[] = [
  { key: "mes", header: "Mês", cell: (m) => <span className="capitalize">{m.label}</span>, width: "100px" },
  { key: "gc", header: "Ganhas (qtd)", sortKey: "ganhasCount", align: "right", cell: (m) => <span className="numeric">{fmtNum(m.ganhasCount)}</span> },
  { key: "gv", header: "Ganhas (R$)", sortKey: "ganhasValor", align: "right", cell: (m) => <span className="numeric font-medium">{m.ganhasValor > 0 ? fmtCurrency(m.ganhasValor, { compact: true }) : "—"}</span> },
  { key: "pc", header: "PVs (qtd)", sortKey: "pedidosCount", align: "right", cell: (m) => <span className="numeric">{fmtNum(m.pedidosCount)}</span> },
  { key: "pv", header: "PVs (R$)", sortKey: "pedidosValor", align: "right", cell: (m) => <span className="numeric font-medium">{m.pedidosValor > 0 ? fmtCurrency(m.pedidosValor, { compact: true }) : "—"}</span> },
];

interface TabelaRow extends PloomesOportunidade {
  virouPedido: boolean;
  pedidosCount: number;
  valorPedidos: number;
}

const tabelaCols: Column<TabelaRow>[] = [
  {
    key: "termino",
    header: "Ganhou em",
    sortKey: "termino",
    cell: (o) => <span className="numeric text-[12px]">{fmtDate(o.termino)}</span>,
    width: "120px",
  },
  {
    key: "titulo",
    header: "Oportunidade",
    sortKey: "titulo",
    cell: (o) => (
      <span className="block max-w-[300px] truncate" title={o.titulo}>
        {o.titulo}
      </span>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    sortKey: "cliente",
    cell: (o) => (
      <span className="block max-w-[200px] truncate" title={o.cliente ?? ""}>
        {o.cliente ?? "—"}
      </span>
    ),
  },
  { key: "resp", header: "Responsável", sortKey: "responsavel", cell: (o) => <span className="text-[12px]">{o.responsavel ?? "—"}</span> },
  {
    key: "valor",
    header: "Valor",
    sortKey: "valor",
    align: "right",
    cell: (o) => <span className="numeric font-medium">{fmtCurrency(o.valor)}</span>,
  },
  {
    key: "pc",
    header: "PO Cliente",
    sortKey: "pedidoCompraCliente",
    cell: (o) => <span className="numeric text-[12px]">{o.pedidoCompraCliente ?? "—"}</span>,
  },
  {
    key: "convertida",
    header: "Convertida?",
    sortKey: "virouPedido",
    cell: (o) => {
      if (!o.pedidoCompraCliente) return <StatusBadge tone="muted">Sem PO</StatusBadge>;
      if (o.virouPedido)
        return (
          <StatusBadge tone="success">
            ✓ {fmtNum(o.pedidosCount)} PV{o.pedidosCount > 1 ? "s" : ""}
          </StatusBadge>
        );
      return <StatusBadge tone="danger">Não bateu</StatusBadge>;
    },
  },
];
