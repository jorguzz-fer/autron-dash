import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import HBarRanking from "@/components/UI/HBarRanking";
import StatusBadge from "@/components/UI/StatusBadge";
import { fmtCurrency, fmtDate, fmtNum, fmtPct, monthKey, monthLabel } from "@/lib/format";
import { ClipboardList, Activity, CheckCircle2, Wallet } from "lucide-react";
import type { PedidoEnriched } from "@/lib/domain";

export const metadata = { title: "Visão Geral — Autron Dash" };

export default async function VisaoGeralPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const pedidos = await getEnrichedPedidos({ tenantId: session.user.tenantId });

  // ── KPIs ──────────────────────────────────────────────────────────
  const totalPVs = new Set(pedidos.map((p) => p.numPedido)).size;
  const totalLinhas = pedidos.length;
  const emAberto = pedidos.filter((p) => p.statusPedido === "EM ABERTO");
  const finalizados = pedidos.filter((p) => p.statusPedido === "FINALIZADO");
  const valorEmAberto = emAberto.reduce((acc, p) => acc + (p.vlrTotal ?? 0), 0);
  const pctConclusao = totalLinhas === 0 ? 0 : (finalizados.length / totalLinhas) * 100;

  // ── Pedidos por mês (últimos 12) ──────────────────────────────────
  const byMonth = new Map<string, number>();
  for (const p of pedidos) {
    if (!p.dtEmissao) continue;
    const k = monthKey(p.dtEmissao);
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  const monthsSorted = Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-12);

  // ── Top vendedores (por # linhas) ─────────────────────────────────
  const byVendedor = new Map<string, number>();
  for (const p of pedidos) {
    const v = p.nomeVendedor ?? "Sem vendedor";
    byVendedor.set(v, (byVendedor.get(v) ?? 0) + 1);
  }
  const topVendedores = Array.from(byVendedor.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ── Tabela: pedidos em aberto ordenados por valor ─────────────────
  const tabela = [...emAberto].sort((a, b) => (b.vlrTotal ?? 0) - (a.vlrTotal ?? 0)).slice(0, 30);

  return (
    <AppShell title="Visão Geral" subtitle="Status macro e entrada de pedidos por mês">
      <div className="space-y-5">
        {/* KPIs */}
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

        {/* Mês + Vendedores */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CardSection title="Pedidos por mês" subtitle="Últimos 12 meses">
            <HBarRanking
              items={monthsSorted.map(([k, v]) => ({ label: monthLabel(k), value: v }))}
              tone="brand"
            />
          </CardSection>
          <CardSection title="Top vendedores" subtitle="Por número de linhas">
            <HBarRanking items={topVendedores} tone="success" topN={8} />
          </CardSection>
        </section>

        {/* Tabela top em aberto */}
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
  { key: "pv", header: "PV", cell: (p) => <span className="numeric">{p.numPedido}</span>, width: "90px" },
  { key: "item", header: "Item", cell: (p) => <span className="numeric">{p.item}</span>, width: "60px" },
  { key: "produto", header: "Produto", cell: (p) => <code className="font-mono text-[12px]">{p.produto}</code>, width: "140px" },
  {
    key: "desc",
    header: "Descrição",
    cell: (p) => (
      <span className="block max-w-[280px] truncate" title={p.descricaoProduto ?? ""}>
        {p.descricaoProduto ?? "—"}
      </span>
    ),
  },
  { key: "qtd", header: "Qtd", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.quantidade)}</span> },
  {
    key: "vlr",
    header: "Valor",
    align: "right",
    cell: (p) => <span className="numeric font-medium">{fmtCurrency(p.vlrTotal)}</span>,
  },
  { key: "vendedor", header: "Vendedor", cell: (p) => <span className="truncate">{p.nomeVendedor ?? "—"}</span> },
  {
    key: "emissao",
    header: "Emissão",
    cell: (p) => <span className="numeric text-[12px]">{fmtDate(p.dtEmissao)}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: () => <StatusBadge tone="warning">Em aberto</StatusBadge>,
  },
];
