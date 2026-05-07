import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import HBarRanking from "@/components/UI/HBarRanking";
import { fmtDate, fmtNum } from "@/lib/format";
import { Clock, CheckCircle2, HelpCircle, Timer } from "lucide-react";
import type { PedidoEnriched } from "@/lib/domain";

export const metadata = { title: "Previsão Entrega — Autron Dash" };

export default async function PrevisaoEntregaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const all = await getEnrichedPedidos({ tenantId: session.user.tenantId });
  const pedidos = all.filter((p) => p.statusPedido === "EM ABERTO");

  // KPIs
  const atrasados = pedidos.filter((p) => (p.diasAtrasoCliente ?? 0) > 0);
  const noPrazo = pedidos.filter((p) => p.diasAtrasoCliente != null && p.diasAtrasoCliente <= 0);
  const semData = pedidos.filter((p) => p.diasAtrasoCliente == null);
  const mediaAtraso =
    atrasados.length > 0
      ? Math.round(atrasados.reduce((a, p) => a + (p.diasAtrasoCliente ?? 0), 0) / atrasados.length)
      : 0;

  // Top 10 mais atrasados
  const top10 = [...atrasados]
    .sort((a, b) => (b.diasAtrasoCliente ?? 0) - (a.diasAtrasoCliente ?? 0))
    .slice(0, 10);

  // Por semana de entrega (pasta)
  const bySemana = new Map<string, number>();
  for (const p of pedidos) {
    const k = p.semanaEntrega ?? "Sem semana";
    bySemana.set(k, (bySemana.get(k) ?? 0) + 1);
  }
  const semanas = Array.from(bySemana.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Tabela: ordenado por atraso desc
  const tabela = [...pedidos]
    .sort((a, b) => (b.diasAtrasoCliente ?? -9999) - (a.diasAtrasoCliente ?? -9999))
    .slice(0, 50);

  return (
    <AppShell title="Previsão Entrega" subtitle="Atrasos vs DT. Fat. Cli + semana de entrega">
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPICard
            label="Atrasados"
            value={fmtNum(atrasados.length)}
            hint={`Média: ${mediaAtraso} dias`}
            icon={<Clock className="size-4" />}
            tone="danger"
            active={atrasados.length > 0}
          />
          <KPICard
            label="No prazo"
            value={fmtNum(noPrazo.length)}
            hint="DT. Fat. Cli ainda no futuro"
            icon={<CheckCircle2 className="size-4" />}
            tone="success"
          />
          <KPICard
            label="Sem data"
            value={fmtNum(semData.length)}
            hint="Pedidos sem DT. Fat. Cli"
            icon={<HelpCircle className="size-4" />}
            tone="warning"
          />
          <KPICard
            label="Média de atraso"
            value={`${mediaAtraso}d`}
            hint={atrasados.length > 0 ? "Considera apenas atrasados" : "Sem atrasados"}
            icon={<Timer className="size-4" />}
            tone="neutral"
          />
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CardSection title="Top 10 mais atrasados" subtitle="Por dias de atraso vs cliente">
            <HBarRanking
              items={top10.map((p) => ({
                label: `PV ${p.numPedido}/${p.item} · ${p.produto}`,
                value: p.diasAtrasoCliente ?? 0,
                display: `${p.diasAtrasoCliente}d`,
              }))}
              tone="danger"
            />
          </CardSection>
          <CardSection title="Pedidos por semana de entrega" subtitle="Pasta do follow-up">
            <HBarRanking items={semanas} tone="brand" />
          </CardSection>
        </section>

        <CardSection
          title="Pedidos por urgência"
          subtitle="Top 50 ordenados por dias de atraso (mais atrasados primeiro)"
        >
          <DataTable
            columns={previsaoCols}
            rows={tabela}
            rowKey={(p) => p.id}
            emptyMessage="Sem pedidos em aberto."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

function atrasoBadge(d: number | null) {
  if (d == null) return <StatusBadge tone="muted">Sem data</StatusBadge>;
  if (d > 30) return <StatusBadge tone="danger">{d}d atrasado</StatusBadge>;
  if (d > 0) return <StatusBadge tone="warning">{d}d atrasado</StatusBadge>;
  if (d === 0) return <StatusBadge tone="brand">Hoje</StatusBadge>;
  return <StatusBadge tone="success">{Math.abs(d)}d no prazo</StatusBadge>;
}

const previsaoCols: Column<PedidoEnriched>[] = [
  { key: "pv", header: "PV", cell: (p) => <span className="numeric">{p.numPedido}</span>, width: "90px" },
  { key: "item", header: "Item", cell: (p) => <span className="numeric">{p.item}</span>, width: "60px" },
  {
    key: "produto",
    header: "Produto",
    cell: (p) => (
      <div>
        <code className="font-mono text-[12px]">{p.produto}</code>
        <div
          className="max-w-[260px] truncate text-[11.5px]"
          title={p.descricaoProduto ?? ""}
          style={{ color: "var(--fg-muted)" }}
        >
          {p.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  { key: "qtd", header: "Qtd", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.quantidade)}</span> },
  {
    key: "fatcli",
    header: "DT. Fat. Cli",
    cell: (p) => <span className="numeric text-[12px]">{fmtDate(p.dtFatCli)}</span>,
  },
  {
    key: "ofertada",
    header: "Ofertada",
    cell: (p) => <span className="numeric text-[12px]">{fmtDate(p.dtOfertada)}</span>,
  },
  {
    key: "prazo",
    header: "Prazo real",
    cell: (p) => (
      <span className="numeric text-[12px]">
        {p.prazoRealEntrega instanceof Date ? fmtDate(p.prazoRealEntrega) : p.prazoRealEntrega ?? "—"}
      </span>
    ),
  },
  { key: "semana", header: "Semana", cell: (p) => <span className="text-[12px]">{p.semanaEntrega ?? "—"}</span> },
  { key: "atraso", header: "Atraso", cell: (p) => atrasoBadge(p.diasAtrasoCliente) },
];
