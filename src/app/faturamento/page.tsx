import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFaturamentos, type FaturamentoRow } from "@/lib/services/faturamento";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import HBarRanking from "@/components/UI/HBarRanking";
import { fmtCurrency, fmtDate, fmtNum, fmtPct, monthKey, monthLabel } from "@/lib/format";
import { Receipt, TrendingUp, FileText, Percent } from "lucide-react";

export const metadata = { title: "Faturamento — Autron Dash" };

export default async function FaturamentoPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const fats = await getFaturamentos({ tenantId: session.user.tenantId });

  if (fats.length === 0) {
    return (
      <AppShell title="Faturamento" subtitle="Notas fiscais + margem + top vendedores">
        <CardSection
          title="Sem dados de faturamento"
          subtitle="Faça upload do faturamento.xlsx em /uploads para ver este painel."
        >
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Os dados aparecerão aqui assim que a planilha for processada.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  // KPIs
  const totalBruto = fats.reduce((a, r) => a + (r.faturamentoBruto ?? 0), 0);
  const totalLiquido = fats.reduce((a, r) => a + (r.faturamentoLiquido ?? 0), 0);
  const totalMargemR = fats.reduce((a, r) => a + (r.margemLiquidaR ?? 0), 0);
  const margemMediaPct = totalLiquido === 0 ? 0 : (totalMargemR / totalLiquido) * 100;
  const totalNFs = new Set(fats.map((r) => r.numDocto)).size;

  // Por mês
  const byMonth = new Map<string, number>();
  for (const r of fats) {
    if (!r.emissao) continue;
    const k = monthKey(r.emissao);
    byMonth.set(k, (byMonth.get(k) ?? 0) + (r.faturamentoLiquido ?? 0));
  }
  const monthsSorted = Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-12);

  // Top vendedores por fat. líquido
  const byVendedor = new Map<string, number>();
  for (const r of fats) {
    const v = r.nomeVendedor ?? "Sem vendedor";
    byVendedor.set(v, (byVendedor.get(v) ?? 0) + (r.faturamentoLiquido ?? 0));
  }
  const topVendedores = Array.from(byVendedor.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Top clientes por fat. líquido
  const byCliente = new Map<string, number>();
  for (const r of fats) {
    const c = r.razaoSocial ?? "Sem cliente";
    byCliente.set(c, (byCliente.get(c) ?? 0) + (r.faturamentoLiquido ?? 0));
  }
  const topClientes = Array.from(byCliente.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Tabela: ordenado por emissao desc, top 50
  const tabela = fats.slice(0, 50);

  return (
    <AppShell title="Faturamento" subtitle="Notas fiscais + margem + top vendedores">
      <div className="space-y-5">
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
          <CardSection title="Faturamento líquido por mês" subtitle="Últimos 12 meses">
            <HBarRanking
              items={monthsSorted.map(([k, v]) => ({
                label: monthLabel(k),
                value: v,
                display: fmtCurrency(v, { compact: true }),
              }))}
              tone="brand"
            />
          </CardSection>
          <CardSection title="Top vendedores" subtitle="Por faturamento líquido">
            <HBarRanking
              items={topVendedores.map((v) => ({
                ...v,
                display: fmtCurrency(v.value, { compact: true }),
              }))}
              tone="success"
            />
          </CardSection>
          <CardSection title="Top clientes" subtitle="Por faturamento líquido">
            <HBarRanking
              items={topClientes.map((v) => ({
                ...v,
                display: fmtCurrency(v.value, { compact: true }),
              }))}
              tone="brand"
            />
          </CardSection>
        </section>

        <CardSection
          title="Notas fiscais recentes"
          subtitle={`Top 50 mais recentes de ${fmtNum(fats.length)} itens`}
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
    cell: (r) => <span className="numeric text-[12px]">{fmtDate(r.emissao)}</span>,
  },
  { key: "nf", header: "NF", cell: (r) => <span className="numeric">{r.numDocto}</span> },
  { key: "pv", header: "PV", cell: (r) => <span className="numeric">{r.noPedido ?? "—"}</span> },
  {
    key: "produto",
    header: "Produto",
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
  { key: "vendedor", header: "Vendedor", cell: (r) => <span className="text-[12px]">{r.nomeVendedor ?? "—"}</span> },
  {
    key: "qtd",
    header: "Qtd",
    align: "right",
    cell: (r) => <span className="numeric">{fmtNum(r.quantidade)}</span>,
  },
  {
    key: "bruto",
    header: "Bruto",
    align: "right",
    cell: (r) => <span className="numeric text-[12px]">{fmtCurrency(r.faturamentoBruto, { compact: true })}</span>,
  },
  {
    key: "liquido",
    header: "Líquido",
    align: "right",
    cell: (r) => <span className="numeric font-medium">{fmtCurrency(r.faturamentoLiquido, { compact: true })}</span>,
  },
  {
    key: "margem",
    header: "Margem",
    align: "right",
    cell: (r) => <span className="numeric text-[12px]">{fmtPct(r.margemLiquidaPct ?? null, 1)}</span>,
  },
];
