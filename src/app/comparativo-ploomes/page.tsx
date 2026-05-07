import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getPloomes, type PloomesOportunidade } from "@/lib/services/ploomes";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import HBarRanking from "@/components/UI/HBarRanking";
import { fmtCurrency, fmtDate, fmtNum, fmtPct, monthKey, monthLabel } from "@/lib/format";
import {
  Trophy,
  Wallet,
  ArrowRightCircle,
  Activity,
  Target,
  GitCompareArrows,
} from "lucide-react";

export const metadata = { title: "Comparativo Ploomes — Autron Dash" };

export default async function ComparativoPloomesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;
  const [oportunidades, enriched] = await Promise.all([
    getPloomes({ tenantId }),
    getEnrichedPedidos({ tenantId }),
  ]);

  if (oportunidades.length === 0) {
    return (
      <AppShell title="Comparativo Ploomes" subtitle="CRM × Pedidos efetivados">
        <CardSection
          title="Sem dados do Ploomes"
          subtitle="Faça upload do Ganhas.xlsx (export do CRM) em /uploads → card 'Ploomes — Oportunidades Ganhas'."
        >
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Este painel cruza as oportunidades GANHAS no Ploomes com os pedidos
            efetivamente entrados, e calcula a taxa de conversão CRM → Pedido por mês,
            por responsável e por cliente.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  // ── Cruzamento Ploomes × Pedido ───────────────────────────────────
  // Chave: pedidoCompraCliente (Ploomes) ≈ pedCliente (Pedido)
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

  // ── KPIs ──────────────────────────────────────────────────────────
  const totalGanhas = oportunidades.length;
  const valorGanhasTotal = oportunidades.reduce((a, o) => a + (o.valor ?? 0), 0);
  const ticketMedio = totalGanhas === 0 ? 0 : valorGanhasTotal / totalGanhas;
  const comPC = oportunidadesEnriched.filter((o) => o.pedidoCompraCliente).length;
  const viraramPedido = oportunidadesEnriched.filter((o) => o.virouPedido).length;
  const conversao = comPC === 0 ? 0 : (viraramPedido / comPC) * 100;
  const valorBatente = oportunidadesEnriched
    .filter((o) => o.virouPedido)
    .reduce((a, o) => a + (o.valorPedidos ?? 0), 0);

  // ── Ano-base (último ano com oportunidades) ───────────────────────
  const anos = Array.from(
    new Set(oportunidades.filter((o) => o.termino).map((o) => o.termino!.getFullYear())),
  ).sort();
  const anoBase = anos.length > 0 ? Math.max(...anos) : new Date().getFullYear();

  // ── Mês a mês (anoBase): Oportunidades vs Pedidos ─────────────────
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

  // ── Top responsáveis (por # ganhas e valor) ───────────────────────
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

  // ── Top clientes ───────────────────────────────────────────────────
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

  // ── Tabela: oportunidades recentes ────────────────────────────────
  const tabela = oportunidadesEnriched.slice(0, 60);

  return (
    <AppShell
      title="Comparativo Ploomes"
      subtitle={`CRM × Pedidos efetivados — base ${fmtNum(totalGanhas)} oportunidades ganhas`}
    >
      <div className="space-y-5">
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

        {/* Comparativo mensal */}
        <CardSection
          title={
            <span className="flex items-center gap-2">
              <GitCompareArrows className="size-4" />
              Oportunidades vs Pedidos · {anoBase}
            </span>
          }
          subtitle="Tendência mensal: contagem e valor de oportunidades ganhas no CRM vs pedidos entrados no Protheus"
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
          <CardSection title="Top responsáveis" subtitle="Por valor de oportunidades ganhas">
            <HBarRanking
              items={topResponsaveis.map((r) => ({
                label: `${r.label} (${r.count})`,
                value: r.value,
                display: fmtCurrency(r.value, { compact: true }),
              }))}
              tone="success"
            />
          </CardSection>
          <CardSection title="Top clientes" subtitle="Por valor de oportunidades ganhas">
            <HBarRanking
              items={topClientes.map((c) => ({
                ...c,
                display: fmtCurrency(c.value, { compact: true }),
              }))}
              tone="brand"
            />
          </CardSection>
        </section>

        <CardSection
          title="Oportunidades recentes — cruzamento com pedidos"
          subtitle="Ordenadas por data de Término (mais recentes). Badge ✓ quando o PC bate com pedCliente"
        >
          <DataTable<typeof tabela[number]>
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
  { key: "gc", header: "Ganhas (qtd)", align: "right", cell: (m) => <span className="numeric">{fmtNum(m.ganhasCount)}</span> },
  { key: "gv", header: "Ganhas (R$)", align: "right", cell: (m) => <span className="numeric font-medium">{m.ganhasValor > 0 ? fmtCurrency(m.ganhasValor, { compact: true }) : "—"}</span> },
  { key: "pc", header: "PVs (qtd)", align: "right", cell: (m) => <span className="numeric">{fmtNum(m.pedidosCount)}</span> },
  { key: "pv", header: "PVs (R$)", align: "right", cell: (m) => <span className="numeric font-medium">{m.pedidosValor > 0 ? fmtCurrency(m.pedidosValor, { compact: true }) : "—"}</span> },
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
    cell: (o) => <span className="numeric text-[12px]">{fmtDate(o.termino)}</span>,
    width: "120px",
  },
  {
    key: "titulo",
    header: "Oportunidade",
    cell: (o) => (
      <span className="block max-w-[300px] truncate" title={o.titulo}>
        {o.titulo}
      </span>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    cell: (o) => (
      <span className="block max-w-[200px] truncate" title={o.cliente ?? ""}>
        {o.cliente ?? "—"}
      </span>
    ),
  },
  { key: "resp", header: "Responsável", cell: (o) => <span className="text-[12px]">{o.responsavel ?? "—"}</span> },
  {
    key: "valor",
    header: "Valor",
    align: "right",
    cell: (o) => <span className="numeric font-medium">{fmtCurrency(o.valor)}</span>,
  },
  {
    key: "pc",
    header: "PO Cliente",
    cell: (o) => <span className="numeric text-[12px]">{o.pedidoCompraCliente ?? "—"}</span>,
  },
  {
    key: "convertida",
    header: "Convertida?",
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
