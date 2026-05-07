import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import HBarRanking from "@/components/UI/HBarRanking";
import FilterSelect from "@/components/UI/FilterSelect";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import {
  CheckCircle2,
  AlertTriangle,
  Circle,
  CircleAlert,
  ShoppingCart,
  Factory,
  CalendarCheck,
  CalendarX,
  CalendarOff,
  Layers,
  Percent,
} from "lucide-react";
import type {
  AcaoNecessaria,
  PedidoEnriched,
  ProntoParaFazer,
} from "@/lib/domain";

export const metadata = { title: "Prontidão — Autron Dash" };

interface SP {
  dispo?: string;
  tipo?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
}

export default async function ProntidaoPage({
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

  const all = await getEnrichedPedidos({
    tenantId: session.user.tenantId,
    dataInicio,
    dataFim,
  });
  const pedidos = all.filter((p) => p.statusPedido === "EM ABERTO");

  const sim = pedidos.filter((p) => p.prontoParaFazer === "SIM").length;
  const parcialFU = pedidos.filter((p) => p.prontoParaFazer === "PARCIAL - Sem Follow-up").length;
  const parcialEst = pedidos.filter((p) => p.prontoParaFazer === "PARCIAL - Sem Estoque").length;
  const nao = pedidos.filter((p) => p.prontoParaFazer === "NAO").length;
  const erros = pedidos.filter((p) => p.acaoNecessaria === "ERRO no CADASTRO").length;
  const comprando = pedidos.filter((p) => p.tipoProduto === "Comprando").length;
  const produzindo = pedidos.filter((p) => p.tipoProduto === "Produzindo").length;

  const pvBuckets = new Map<string, { hasUndefined: boolean; maxAtraso: number }>();
  for (const p of pedidos) {
    const cur = pvBuckets.get(p.numPedido) ?? { hasUndefined: false, maxAtraso: -Infinity };
    if (p.dtFatCli == null) cur.hasUndefined = true;
    if (p.diasAtrasoCliente != null && p.diasAtrasoCliente > cur.maxAtraso) {
      cur.maxAtraso = p.diasAtrasoCliente;
    }
    pvBuckets.set(p.numPedido, cur);
  }
  let pvDentro = 0;
  let pvFora = 0;
  let pvSem = 0;
  for (const b of pvBuckets.values()) {
    if (b.hasUndefined) pvSem++;
    else if (b.maxAtraso > 0) pvFora++;
    else pvDentro++;
  }
  const totalPVs = pvBuckets.size;
  const pvDecidiveis = pvDentro + pvFora;
  const pctDentro = pvDecidiveis === 0 ? 0 : (pvDentro / pvDecidiveis) * 100;
  const pctFora = pvDecidiveis === 0 ? 0 : (pvFora / pvDecidiveis) * 100;

  const byAcao = new Map<string, number>();
  for (const p of pedidos) byAcao.set(p.acaoNecessaria, (byAcao.get(p.acaoNecessaria) ?? 0) + 1);
  const acoesRanking = Array.from(byAcao.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const ordemPront: Record<ProntoParaFazer, number> = {
    "FINALIZADO": 99,
    "Servico": 5,
    "SIM": 4,
    "PARCIAL - Sem Follow-up": 3,
    "PARCIAL - Sem Estoque": 2,
    "NAO": 1,
  };
  const filtered = pedidos.filter((p) => {
    if (sp.dispo && p.disponibilidadeEstoque !== sp.dispo) return false;
    if (sp.tipo && p.tipoProduto !== sp.tipo) return false;
    return true;
  });
  const baseTabela = [...filtered]
    .sort((a, b) => {
      const eA = a.acaoNecessaria === "ERRO no CADASTRO" ? 0 : 1;
      const eB = b.acaoNecessaria === "ERRO no CADASTRO" ? 0 : 1;
      if (eA !== eB) return eA - eB;
      return ordemPront[a.prontoParaFazer] - ordemPront[b.prontoParaFazer];
    })
    .slice(0, 100);
  const tabela = sortRows(
    baseTabela as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as PedidoEnriched[];

  return (
    <AppShell title="Prontidão" subtitle="Pronto para fazer? Estoque + follow-up + ação necessária">
      <div className="space-y-5">
        <DateRangeFilter label="Emissão" fromValue={sp.from} toValue={sp.to} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KPICard label="Prontos" value={fmtNum(sim)} icon={<CheckCircle2 className="size-4" />} tone="success" />
          <KPICard label="Sem follow-up" value={fmtNum(parcialFU)} hint="Estoque ok, falta confirmação" icon={<Circle className="size-4" />} tone="warning" />
          <KPICard label="Sem estoque" value={fmtNum(parcialEst)} hint="Confirmado, falta material" icon={<AlertTriangle className="size-4" />} tone="warning" />
          <KPICard label="Não prontos" value={fmtNum(nao)} hint="Sem estoque e sem follow-up" icon={<Circle className="size-4" />} tone="danger" />
          <KPICard label="Erros cadastro" value={fmtNum(erros)} hint="Comprando com OP" icon={<CircleAlert className="size-4" />} tone="danger" active={erros > 0} />
        </section>

        <CardSection
          title="Datas por PV — atendimento do prazo do cliente"
          subtitle="Consolidado por PV (não por linha): MAX(atraso) entre os itens. Sem prazo = ao menos 1 item sem DT. Fat. Cli."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KPICard label="Total PVs" value={fmtNum(totalPVs)} icon={<Layers className="size-4" />} tone="brand" />
            <KPICard label="Dentro do prazo" value={fmtNum(pvDentro)} hint={fmtPct(pctDentro)} icon={<CalendarCheck className="size-4" />} tone="success" />
            <KPICard label="Fora do prazo" value={fmtNum(pvFora)} hint={fmtPct(pctFora)} icon={<CalendarX className="size-4" />} tone="danger" />
            <KPICard
              label="% Dentro / Fora"
              value={`${pctDentro.toFixed(0)}% / ${pctFora.toFixed(0)}%`}
              hint="Apenas PVs com prazo definido"
              icon={<Percent className="size-4" />}
              tone="neutral"
            />
            <KPICard label="Sem prazo definido" value={fmtNum(pvSem)} hint="Sem DT. Fat. Cli em algum item" icon={<CalendarOff className="size-4" />} tone="warning" />
          </div>

          <div className="mt-5">
            <HBarRanking
              items={[
                { label: "Sem prazo definido", value: pvSem, display: `${fmtNum(pvSem)} (${((pvSem / Math.max(1, totalPVs)) * 100).toFixed(1)}%)` },
                { label: "Dentro do prazo", value: pvDentro, display: `${fmtNum(pvDentro)} (${((pvDentro / Math.max(1, totalPVs)) * 100).toFixed(1)}%)` },
                { label: "Fora do prazo", value: pvFora, display: `${fmtNum(pvFora)} (${((pvFora / Math.max(1, totalPVs)) * 100).toFixed(1)}%)` },
              ]}
              tone="brand"
            />
          </div>
        </CardSection>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <CardSection title="Tipo de produto" subtitle="Comprando vs Produzindo (em aberto)">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--surface-2)" }}>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="size-4" style={{ color: "var(--color-brand-600)" }} />
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>Comprando</span>
                </div>
                <div className="numeric mt-2 text-[24px] font-semibold" style={{ color: "var(--fg-strong)" }}>{fmtNum(comprando)}</div>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--surface-2)" }}>
                <div className="flex items-center gap-2">
                  <Factory className="size-4" style={{ color: "#059669" }} />
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>Produzindo</span>
                </div>
                <div className="numeric mt-2 text-[24px] font-semibold" style={{ color: "var(--fg-strong)" }}>{fmtNum(produzindo)}</div>
              </div>
            </div>
          </CardSection>

          <div className="lg:col-span-2">
            <CardSection title="Ações necessárias" subtitle="Distribuição por categoria">
              <HBarRanking items={acoesRanking} tone="brand" />
            </CardSection>
          </div>
        </section>

        <CardSection
          title="Pedidos com atenção"
          subtitle={`${fmtNum(filtered.length)} de ${fmtNum(pedidos.length)} pedidos em aberto · top 100 (erros e bloqueios primeiro)`}
        >
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              name="dispo"
              label="Disponibilidade"
              value={sp.dispo}
              options={[
                { value: "SIM", label: "Com estoque" },
                { value: "PARCIAL", label: "Parcial" },
                { value: "NAO", label: "Sem estoque" },
                { value: "Servico", label: "Serviço" },
              ]}
            />
            <FilterSelect
              name="tipo"
              label="Tipo de produto"
              value={sp.tipo}
              options={[
                { value: "Comprando", label: "Comprando" },
                { value: "Produzindo", label: "Produzindo" },
                { value: "Indefinido", label: "Indefinido" },
              ]}
            />
          </div>
          <DataTable
            columns={prontidaoCols}
            rows={tabela}
            rowKey={(p) => p.id}
            emptyMessage="Sem pedidos com os filtros selecionados."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

function prontidaoBadge(p: ProntoParaFazer) {
  if (p === "SIM") return <StatusBadge tone="success">Pronto</StatusBadge>;
  if (p === "PARCIAL - Sem Follow-up") return <StatusBadge tone="warning">Sem FU</StatusBadge>;
  if (p === "PARCIAL - Sem Estoque") return <StatusBadge tone="warning">Sem est.</StatusBadge>;
  if (p === "Servico") return <StatusBadge tone="muted">Serviço</StatusBadge>;
  if (p === "FINALIZADO") return <StatusBadge tone="muted">Finalizado</StatusBadge>;
  return <StatusBadge tone="danger">Não</StatusBadge>;
}

function acaoBadge(a: AcaoNecessaria) {
  switch (a) {
    case "Estoque OK":
      return <StatusBadge tone="success">{a}</StatusBadge>;
    case "ERRO no CADASTRO":
      return <StatusBadge tone="danger">{a}</StatusBadge>;
    case "Necessario gerar SC":
    case "Necessario gerar OP":
      return <StatusBadge tone="warning">{a}</StatusBadge>;
    case "Finalizado":
      return <StatusBadge tone="muted">{a}</StatusBadge>;
    default:
      return <StatusBadge tone="brand">{a}</StatusBadge>;
  }
}

const prontidaoCols: Column<PedidoEnriched>[] = [
  { key: "pv", header: "PV", sortKey: "numPedido", cell: (p) => <span className="numeric">{p.numPedido}</span>, width: "90px" },
  { key: "item", header: "Item", sortKey: "item", cell: (p) => <span className="numeric">{p.item}</span>, width: "60px" },
  {
    key: "produto",
    header: "Produto",
    sortKey: "produto",
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
  {
    key: "tipo",
    header: "Tipo",
    sortKey: "tipoProduto",
    cell: (p) => <StatusBadge tone={p.tipoProduto === "Indefinido" ? "warning" : "muted"}>{p.tipoProduto}</StatusBadge>,
  },
  { key: "qtd", header: "Qtd", sortKey: "quantidade", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.quantidade)}</span> },
  { key: "estoque", header: "Estoque", sortKey: "estoqueDisponivel", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.estoqueDisponivel)}</span> },
  { key: "pronto", header: "Pronto?", sortKey: "prontoParaFazer", cell: (p) => prontidaoBadge(p.prontoParaFazer) },
  { key: "acao", header: "Ação", sortKey: "acaoNecessaria", cell: (p) => acaoBadge(p.acaoNecessaria) },
  {
    key: "prazo",
    header: "Prazo",
    cell: (p) => (
      <span className="numeric text-[12px]">
        {p.prazoRealEntrega instanceof Date ? fmtDate(p.prazoRealEntrega) : p.prazoRealEntrega ?? "—"}
      </span>
    ),
  },
];
