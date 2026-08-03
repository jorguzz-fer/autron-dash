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
import {
  getAnaliseVendedores,
  getPedidosPorVendedor,
  type VendedorClienteRow,
  type VendedorCarteira,
  type PedidosVendedor,
} from "@/lib/services/regiaoVendas";
import { getFaturamentoDateBounds } from "@/lib/services/faturamento";
import { fmtCurrency, fmtDate, fmtNum } from "@/lib/format";
import { parseDateInput } from "@/lib/sort";
import type { ChurnStatus, ClasseAbc } from "@/lib/domain/regiaoVendas";
import { ArrowLeft, Wallet, Users, CheckCircle2, AlertTriangle, UserX, ClipboardList } from "lucide-react";

export const metadata = { title: "Carteira por Vendedor — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  churn?: string;
  vend?: string; // vendedor selecionado (nome) ou vazio = todos
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

export default async function CarteiraVendedorPage({ searchParams }: { searchParams: Promise<SP> }) {
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

  const [data, pedidos] = await Promise.all([
    getAnaliseVendedores({ tenantId, dataInicio, dataFim, emRiscoMeses, perdidoMeses }),
    getPedidosPorVendedor({ tenantId, dataInicio, dataFim }),
  ]);

  const pedidosByVend = new Map(pedidos.map((p) => [p.vendedor, p]));

  const vendedorOptions = data.vendedores.map((v) => ({ value: v.vendedor, label: v.vendedor }));
  const selectedVend = sp.vend ?? "";
  const vendedor = selectedVend ? data.vendedores.find((v) => v.vendedor === selectedVend) ?? null : null;

  const fromValue = (dataInicio ?? bounds.min)?.toISOString().slice(0, 10);
  const toValue = (dataFim ?? bounds.max)?.toISOString().slice(0, 10);

  // KPIs: do vendedor selecionado, ou consolidado de todos.
  const kpiReceita = vendedor ? vendedor.receita : data.totalReceita;
  const kpiClientes = vendedor
    ? vendedor.qtdClientes
    : data.vendedores.reduce((s, v) => s + v.qtdClientes, 0);
  const kpiAtivos = vendedor ? vendedor.ativos : data.vendedores.reduce((s, v) => s + v.ativos, 0);
  const kpiRisco = vendedor ? vendedor.emRisco : data.vendedores.reduce((s, v) => s + v.emRisco, 0);
  const kpiPerdidos = vendedor
    ? vendedor.perdidos
    : data.vendedores.reduce((s, v) => s + v.perdidos, 0);
  const pedidoVend = vendedor ? pedidosByVend.get(vendedor.vendedor) : null;
  const pedidoAbertoTotal = vendedor
    ? pedidoVend?.valorEmAberto ?? 0
    : pedidos.reduce((s, p) => s + p.valorEmAberto, 0);

  return (
    <AppShell
      title="Carteira por Vendedor"
      subtitle="Curva ABC de vendedores e de clientes, TOP clientes e TOP churn — base: faturamento líquido + entrada de pedidos"
    >
      <div className="space-y-6">
        <Link
          href="/analise-regional"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          style={{ color: "var(--fg-muted)" }}
        >
          <ArrowLeft className="size-3.5" />
          Voltar para a análise regional
        </Link>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFilter label="Emissão" fromValue={fromValue} toValue={toValue} />
          <div className="space-y-1">
            <span className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
              Janela de churn
            </span>
            <SegmentedControl name="churn" options={CHURN_OPTS} value={churnPreset} ariaLabel="Janela de churn" />
          </div>
          <FilterSelect
            name="vend"
            label="Vendedor"
            options={vendedorOptions}
            value={selectedVend}
            allLabel="Todos os vendedores"
          />
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KPICard label="Receita (líquida)" value={fmtCurrency(kpiReceita, { decimals: 0 })} icon={<Wallet className="size-4" />} />
          <KPICard label="Clientes" value={fmtNum(kpiClientes)} icon={<Users className="size-4" />} />
          <KPICard label="Ativos" value={fmtNum(kpiAtivos)} hint={`últimos ${emRiscoMeses}m`} icon={<CheckCircle2 className="size-4" />} />
          <KPICard label="Em risco" value={fmtNum(kpiRisco)} hint={`${emRiscoMeses}–${perdidoMeses}m`} icon={<AlertTriangle className="size-4" />} />
          <KPICard label="Perdidos" value={fmtNum(kpiPerdidos)} hint={`> ${perdidoMeses}m`} icon={<UserX className="size-4" />} />
          <KPICard label="Pedidos em aberto" value={fmtCurrency(pedidoAbertoTotal, { decimals: 0 })} hint="a faturar" icon={<ClipboardList className="size-4" />} />
        </section>

        {/* Curva ABC de vendedores */}
        <CardSection
          title="Curva ABC de vendedores"
          subtitle="Classe ABC por receita (Pareto: A ≤ 80%, B ≤ 95%, C o restante). Clique para focar num vendedor."
        >
          {data.vendedores.length === 0 ? (
            <Empty>Sem faturamento no período.</Empty>
          ) : (
            <HBarRanking
              items={data.vendedores.map((v) => ({
                label: `${v.classe} · ${v.vendedor}`,
                value: v.receita,
                display: `${fmtCurrency(v.receita, { decimals: 0 })} · ${fmtNum(v.qtdClientes)} cli.`,
                href: `/analise-regional/vendedores?${new URLSearchParams({
                  ...(sp.from ? { from: sp.from } : {}),
                  ...(sp.to ? { to: sp.to } : {}),
                  ...(sp.churn ? { churn: sp.churn } : {}),
                  vend: selectedVend === v.vendedor ? "" : v.vendedor,
                }).toString()}`,
              }))}
            />
          )}
        </CardSection>

        {/* Resumo geral por vendedor (quando nenhum selecionado) */}
        {!vendedor && (
          <CardSection
            title="Carteiras — resumo por vendedor"
            subtitle={`${fmtNum(data.vendedores.length)} vendedor(es) · faturamento + pedidos em aberto`}
          >
            <DataTable
              columns={resumoColumns(pedidosByVend)}
              rows={data.vendedores}
              rowKey={(v) => v.vendedor}
              emptyMessage="—"
            />
          </CardSection>
        )}

        {/* TOP clientes + TOP churn do vendedor selecionado */}
        {vendedor && (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <KPICard label="Clientes A" value={fmtNum(vendedor.clientesA)} hint="80% da receita" icon={<Users className="size-4" />} />
              <KPICard label="Clientes B" value={fmtNum(vendedor.clientesB)} icon={<Users className="size-4" />} />
              <KPICard label="Clientes C" value={fmtNum(vendedor.clientesC)} icon={<Users className="size-4" />} />
              <KPICard label="Ticket médio" value={fmtCurrency(vendedor.ticketMedio, { decimals: 0 })} hint="receita / clientes" icon={<Wallet className="size-4" />} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <CardSection
                title={`TOP clientes — ${vendedor.vendedor}`}
                subtitle={`Top ${Math.min(15, vendedor.topClientes.length)} por receita · classe ABC na carteira`}
              >
                {vendedor.topClientes.length === 0 ? (
                  <Empty>Sem clientes na carteira.</Empty>
                ) : (
                  <DataTable columns={clienteColumns} rows={vendedor.topClientes} rowKey={(c) => c.cliente} emptyMessage="—" />
                )}
              </CardSection>

              <CardSection
                title={`TOP churn — ${vendedor.vendedor}`}
                subtitle={`${fmtNum(vendedor.topChurn.length)} cliente(s) em risco ou perdidos · priorize recuperação`}
              >
                {vendedor.topChurn.length === 0 ? (
                  <Empty>Nenhum cliente em risco/perdido nesta carteira. 🎉</Empty>
                ) : (
                  <DataTable columns={churnColumns} rows={vendedor.topChurn} rowKey={(c) => c.cliente} emptyMessage="—" />
                )}
              </CardSection>
            </div>

            {pedidoVend && (
              <CardSection
                title={`Entrada de pedidos — ${vendedor.vendedor}`}
                subtitle="Pipeline de pedidos (PVs) do vendedor no período"
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KPICard label="Valor total" value={fmtCurrency(pedidoVend.valorTotal, { decimals: 0 })} icon={<ClipboardList className="size-4" />} />
                  <KPICard label="Em aberto (a faturar)" value={fmtCurrency(pedidoVend.valorEmAberto, { decimals: 0 })} tone="brand" icon={<Wallet className="size-4" />} />
                  <KPICard label="PVs" value={fmtNum(pedidoVend.qtdPVs)} icon={<ClipboardList className="size-4" />} />
                  <KPICard label="Clientes c/ pedido" value={fmtNum(pedidoVend.qtdClientes)} icon={<Users className="size-4" />} />
                </div>
              </CardSection>
            )}
          </>
        )}

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Vendedor = <code>nomeVendedor</code> da nota fiscal mais recente de cada cliente (faturamento) e da
          entrada de pedidos. A curva ABC de clientes é recalculada dentro de cada carteira.
        </p>
      </div>
    </AppShell>
  );
}

// ── Colunas ─────────────────────────────────────────────────────────────────

function resumoColumns(
  pedidosByVend: Map<string, PedidosVendedor>,
): Column<VendedorCarteira>[] {
  return [
    {
      key: "vendedor",
      header: "Vendedor",
      cell: (v) => (
        <div className="flex items-center gap-2">
          <StatusBadge tone={CLASSE_TONE[v.classe]}>{v.classe}</StatusBadge>
          <Link
            href={`/analise-regional/vendedores?vend=${encodeURIComponent(v.vendedor)}`}
            className="text-[12.5px] font-medium hover:underline"
            style={{ color: "var(--fg-strong)" }}
          >
            {v.vendedor}
          </Link>
        </div>
      ),
    },
    {
      key: "receita",
      header: "Receita",
      align: "right",
      cell: (v) => <span className="numeric text-[12.5px]" style={{ color: "var(--fg)" }}>{fmtCurrency(v.receita, { decimals: 0 })}</span>,
    },
    {
      key: "clientes",
      header: "Clientes",
      align: "right",
      cell: (v) => <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>{fmtNum(v.qtdClientes)}</span>,
    },
    {
      key: "abc",
      header: "A / B / C",
      align: "center",
      cell: (v) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {v.clientesA} / {v.clientesB} / {v.clientesC}
        </span>
      ),
    },
    {
      key: "churn",
      header: "Ativos / Risco / Perdidos",
      align: "center",
      cell: (v) => (
        <span className="numeric text-[12px]">
          <span style={{ color: "#10b981" }}>{v.ativos}</span>
          <span style={{ color: "var(--fg-subtle)" }}> / </span>
          <span style={{ color: "#f59e0b" }}>{v.emRisco}</span>
          <span style={{ color: "var(--fg-subtle)" }}> / </span>
          <span style={{ color: "#e11d48" }}>{v.perdidos}</span>
        </span>
      ),
    },
    {
      key: "pedAberto",
      header: "Pedidos em aberto",
      align: "right",
      cell: (v) => {
        const p = pedidosByVend.get(v.vendedor);
        return (
          <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {p ? fmtCurrency(p.valorEmAberto, { decimals: 0 }) : "—"}
          </span>
        );
      },
    },
    {
      key: "ticket",
      header: "Ticket médio",
      align: "right",
      cell: (v) => <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>{fmtCurrency(v.ticketMedio, { decimals: 0 })}</span>,
    },
  ];
}

const clienteColumns: Column<VendedorClienteRow>[] = [
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
    key: "status",
    header: "Status",
    align: "center",
    cell: (c) => <StatusBadge tone={CHURN_TONE[c.churn]}>{CHURN_LABEL[c.churn]}</StatusBadge>,
  },
];

const churnColumns: Column<VendedorClienteRow>[] = [
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
      {children}
    </p>
  );
}
