import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getFaturamentos } from "@/lib/services/faturamento";
import { getMetas } from "@/lib/services/metas";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import { fmtCurrency, fmtNum, fmtPct, monthKey, monthLabel } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";
import {
  TrendingUp,
  Wallet,
  Target,
  Activity,
  Sparkles,
  CalendarRange,
  Hourglass,
  Layers,
} from "lucide-react";
import type { PedidoEnriched } from "@/lib/domain";

export const metadata = { title: "Previsão Faturamento — Autron Dash" };

const HISTORICO_MESES = 12;
const PROJECAO_MESES = 6;
const CONVERSAO_DEFAULT = 0.6; // fallback quando não há histórico suficiente

function shiftMonth(date: Date, deltaMonths: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + deltaMonths, 1);
}

interface SP { sort?: string; dir?: string }

export default async function PrevisaoFaturamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const sortState = parseSort(sp.sort, sp.dir);

  const tenantId = session.user.tenantId;
  const [enriched, fats, metasAtual, metasAnterior] = await Promise.all([
    getEnrichedPedidos({ tenantId }),
    getFaturamentos({ tenantId }),
    getMetas(tenantId, new Date().getFullYear()),
    getMetas(tenantId, new Date().getFullYear() - 1),
  ]);

  const today = new Date();
  const anoAtual = today.getFullYear();
  const mesAtual = today.getMonth() + 1;
  const metas = [...metasAtual, ...metasAnterior];

  // ── Realizado mensal (faturamento líquido) ────────────────────────
  const fatByMonth = new Map<string, number>();
  for (const f of fats) {
    if (!f.emissao) continue;
    fatByMonth.set(
      monthKey(f.emissao),
      (fatByMonth.get(monthKey(f.emissao)) ?? 0) + (f.faturamentoLiquido ?? 0),
    );
  }

  // ── Pipeline mensal (pedidos em aberto agrupados pelo mês alvo) ───
  const emAberto = enriched.filter((p) => p.statusPedido === "EM ABERTO");
  const pipelineByMonth = new Map<string, number>();
  let pipelineSemPrazo = 0;
  for (const p of emAberto) {
    const target =
      p.prazoRealEntrega instanceof Date
        ? p.prazoRealEntrega
        : p.dtFatCli ?? null;
    const valor = p.vlrTotal ?? 0;
    if (!target) {
      pipelineSemPrazo += valor;
      continue;
    }
    const k = monthKey(target);
    pipelineByMonth.set(k, (pipelineByMonth.get(k) ?? 0) + valor);
  }
  const pipelineTotal = emAberto.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);

  // ── Meta mensal (categoria RECEITA, unidade GRUPO) ────────────────
  const metaByMonth = new Map<string, number>();
  for (const m of metas.filter((mm) => mm.unidade === "GRUPO" && mm.categoria === "RECEITA")) {
    const k = `${m.ano}-${String(m.mes).padStart(2, "0")}`;
    metaByMonth.set(k, (metaByMonth.get(k) ?? 0) + m.valor);
  }
  const metaAnualGrupo = metasAtual
    .filter((m) => m.unidade === "GRUPO" && m.categoria === "RECEITA")
    .reduce((a, m) => a + m.valor, 0);

  // ── Taxa de conversão histórica (lookback 90→30 dias) ─────────────
  const cutoffStart = new Date(today);
  cutoffStart.setDate(cutoffStart.getDate() - 90);
  const cutoffEnd = new Date(today);
  cutoffEnd.setDate(cutoffEnd.getDate() - 30);
  const candidatos = enriched.filter(
    (p) => p.dtEmissao && p.dtEmissao >= cutoffStart && p.dtEmissao <= cutoffEnd,
  );
  const convertidos = candidatos.filter((p) => p.statusPedido === "FINALIZADO").length;
  const conversaoHist =
    candidatos.length === 0 ? CONVERSAO_DEFAULT : convertidos / candidatos.length;

  // ── KPIs ──────────────────────────────────────────────────────────
  const realizadoYTD = fats
    .filter((f) => f.emissao && f.emissao.getFullYear() === anoAtual)
    .reduce((a, f) => a + (f.faturamentoLiquido ?? 0), 0);

  const metaYTD = metasAtual
    .filter((m) => m.unidade === "GRUPO" && m.categoria === "RECEITA" && m.mes <= mesAtual)
    .reduce((a, m) => a + m.valor, 0);

  const projecao = realizadoYTD + pipelineTotal * conversaoHist;
  const pctAtingimento = metaAnualGrupo === 0 ? 0 : (projecao / metaAnualGrupo) * 100;

  // ── Linha temporal de meses (HISTORICO + PROJECAO) ────────────────
  const meses: Array<{
    key: string;
    label: string;
    isPast: boolean;
    isCurrent: boolean;
    realizado: number;
    pipeline: number;
    meta: number;
    projetado: number;
  }> = [];
  for (let offset = -HISTORICO_MESES; offset <= PROJECAO_MESES; offset++) {
    const d = shiftMonth(new Date(anoAtual, mesAtual - 1, 1), offset);
    const k = monthKey(d);
    const isPast = offset < 0;
    const isCurrent = offset === 0;
    const realizado = fatByMonth.get(k) ?? 0;
    const pipeline = pipelineByMonth.get(k) ?? 0;
    const meta = metaByMonth.get(k) ?? 0;
    // Projetado: passado = realizado; presente/futuro = realizado + pipeline*conversão
    const projetado = isPast ? realizado : realizado + pipeline * conversaoHist;
    meses.push({ key: k, label: monthLabel(k), isPast, isCurrent, realizado, pipeline, meta, projetado });
  }

  // ── Composição pipeline por janela de prazo ───────────────────────
  const fim30 = new Date(today);
  fim30.setDate(fim30.getDate() + 30);
  const fim60 = new Date(today);
  fim60.setDate(fim60.getDate() + 60);
  const fim90 = new Date(today);
  fim90.setDate(fim90.getDate() + 90);
  let pipeAte30 = 0;
  let pipeAte60 = 0;
  let pipeAte90 = 0;
  let pipeMais90 = 0;
  for (const p of emAberto) {
    const target =
      p.prazoRealEntrega instanceof Date
        ? p.prazoRealEntrega
        : p.dtFatCli ?? null;
    if (!target) continue;
    const v = p.vlrTotal ?? 0;
    if (target <= fim30) pipeAte30 += v;
    else if (target <= fim60) pipeAte60 += v;
    else if (target <= fim90) pipeAte90 += v;
    else pipeMais90 += v;
  }

  // ── Top 10 pedidos abertos ────────────────────────────────────────
  const baseTop10 = [...emAberto]
    .sort((a, b) => (b.vlrTotal ?? 0) - (a.vlrTotal ?? 0))
    .slice(0, 10);
  const top10Abertos = sortRows(
    baseTop10 as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as PedidoEnriched[];

  const mesesSorted = sortRows(
    meses as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as typeof meses;

  return (
    <AppShell
      title="Previsão Faturamento"
      subtitle={`Realizado YTD + pipeline × conversão (${(conversaoHist * 100).toFixed(0)}%) — ano ${anoAtual}`}
    >
      <div className="space-y-5">
        {/* KPIs principais */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KPICard
            label="Realizado YTD"
            value={fmtCurrency(realizadoYTD, { compact: true })}
            hint={`${fmtNum(fats.length)} itens em NF`}
            icon={<Wallet className="size-4" />}
            tone="success"
          />
          <KPICard
            label="Pipeline (Em aberto)"
            value={fmtCurrency(pipelineTotal, { compact: true })}
            hint={`${fmtNum(emAberto.length)} pedidos`}
            icon={<Layers className="size-4" />}
            tone="brand"
          />
          <KPICard
            label={`Meta ${anoAtual} Grupo`}
            value={fmtCurrency(metaAnualGrupo, { compact: true })}
            hint={metaAnualGrupo > 0 ? `YTD: ${fmtCurrency(metaYTD, { compact: true })}` : "Sem meta de receita"}
            icon={<Target className="size-4" />}
            tone="warning"
          />
          <KPICard
            label="Projeção fim do ano"
            value={fmtCurrency(projecao, { compact: true })}
            hint={`Conversão hist.: ${(conversaoHist * 100).toFixed(0)}%`}
            icon={<Sparkles className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="% Atingimento projetado"
            value={fmtPct(pctAtingimento)}
            hint={metaAnualGrupo > 0 ? "Projeção / Meta" : "Sem meta"}
            icon={<Activity className="size-4" />}
            tone={pctAtingimento >= 100 ? "success" : pctAtingimento >= 70 ? "warning" : "danger"}
            active={pctAtingimento >= 100}
          />
        </section>

        {/* Composição pipeline */}
        <CardSection
          title="Composição do pipeline por urgência"
          subtitle={`Total pipeline ${fmtCurrency(pipelineTotal, { compact: true })} · sem prazo: ${fmtCurrency(pipelineSemPrazo, { compact: true })}`}
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPICard
              label="≤ 30 dias"
              value={fmtCurrency(pipeAte30, { compact: true })}
              hint={fmtPct(pipelineTotal === 0 ? 0 : (pipeAte30 / pipelineTotal) * 100)}
              icon={<Hourglass className="size-4" />}
              tone="danger"
            />
            <KPICard
              label="31 – 60 dias"
              value={fmtCurrency(pipeAte60, { compact: true })}
              hint={fmtPct(pipelineTotal === 0 ? 0 : (pipeAte60 / pipelineTotal) * 100)}
              icon={<Hourglass className="size-4" />}
              tone="warning"
            />
            <KPICard
              label="61 – 90 dias"
              value={fmtCurrency(pipeAte90, { compact: true })}
              hint={fmtPct(pipelineTotal === 0 ? 0 : (pipeAte90 / pipelineTotal) * 100)}
              icon={<CalendarRange className="size-4" />}
              tone="brand"
            />
            <KPICard
              label="> 90 dias"
              value={fmtCurrency(pipeMais90, { compact: true })}
              hint={fmtPct(pipelineTotal === 0 ? 0 : (pipeMais90 / pipelineTotal) * 100)}
              icon={<TrendingUp className="size-4" />}
              tone="neutral"
            />
          </div>
        </CardSection>

        {/* Linha do tempo Realizado vs Pipeline vs Meta */}
        <CardSection
          title="Realizado, pipeline e meta — mês a mês"
          subtitle={`${HISTORICO_MESES} meses passados + ${PROJECAO_MESES} à frente. Mês corrente destacado.`}
        >
          <DataTable<{
            key: string;
            label: string;
            isPast: boolean;
            isCurrent: boolean;
            realizado: number;
            pipeline: number;
            meta: number;
            projetado: number;
          }>
            columns={timelineCols}
            rows={mesesSorted}
            rowKey={(m) => m.key}
            emptyMessage="Sem dados."
          />
        </CardSection>

        {/* Top 10 pedidos abertos */}
        <CardSection
          title="Top 10 pedidos abertos"
          subtitle="Maiores valores em aberto que vão alimentar o pipeline"
        >
          <DataTable<PedidoEnriched>
            columns={topPedidosCols}
            rows={top10Abertos}
            rowKey={(p) => p.id}
            emptyMessage="Sem pedidos em aberto."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

const timelineCols: Column<{
  key: string;
  label: string;
  isPast: boolean;
  isCurrent: boolean;
  realizado: number;
  pipeline: number;
  meta: number;
  projetado: number;
}>[] = [
  {
    key: "mes",
    header: "Mês",
    sortKey: "key",
    cell: (m) => (
      <span className="flex items-center gap-2 capitalize">
        {m.label}
        {m.isCurrent && <StatusBadge tone="brand">Mês atual</StatusBadge>}
        {!m.isPast && !m.isCurrent && <StatusBadge tone="muted">Projeção</StatusBadge>}
      </span>
    ),
    width: "180px",
  },
  {
    key: "real",
    header: "Realizado",
    sortKey: "realizado",
    align: "right",
    cell: (m) => (
      <span className="numeric font-medium" style={{ color: m.realizado > 0 ? "var(--fg-strong)" : "var(--fg-subtle)" }}>
        {m.realizado > 0 ? fmtCurrency(m.realizado, { compact: true }) : "—"}
      </span>
    ),
  },
  {
    key: "pipe",
    header: "Pipeline",
    sortKey: "pipeline",
    align: "right",
    cell: (m) => (
      <span className="numeric text-[12px]" style={{ color: m.pipeline > 0 ? "var(--color-brand-700)" : "var(--fg-subtle)" }}>
        {m.pipeline > 0 ? fmtCurrency(m.pipeline, { compact: true }) : "—"}
      </span>
    ),
  },
  {
    key: "meta",
    header: "Meta",
    sortKey: "meta",
    align: "right",
    cell: (m) => (
      <span className="numeric text-[12px]" style={{ color: m.meta > 0 ? "var(--fg-muted)" : "var(--fg-subtle)" }}>
        {m.meta > 0 ? fmtCurrency(m.meta, { compact: true }) : "—"}
      </span>
    ),
  },
  {
    key: "proj",
    header: "Projetado",
    sortKey: "projetado",
    align: "right",
    cell: (m) => {
      if (m.projetado === 0) return <span style={{ color: "var(--fg-subtle)" }}>—</span>;
      const pct = m.meta === 0 ? null : (m.projetado / m.meta) * 100;
      return (
        <span className="numeric text-[12px]">
          {fmtCurrency(m.projetado, { compact: true })}
          {pct != null && (
            <span
              className="ml-2"
              style={{
                color: pct >= 100 ? "#059669" : pct >= 70 ? "#b45309" : "#e11d48",
              }}
            >
              ({fmtPct(pct, 0)})
            </span>
          )}
        </span>
      );
    },
  },
];

const topPedidosCols: Column<PedidoEnriched>[] = [
  { key: "pv", header: "PV", sortKey: "numPedido", cell: (p) => <span className="numeric">{p.numPedido}</span>, width: "90px" },
  { key: "item", header: "Item", sortKey: "item", cell: (p) => <span className="numeric">{p.item}</span>, width: "60px" },
  {
    key: "cli",
    header: "Cliente",
    cell: (p) => (
      <span className="block max-w-[220px] truncate" title={p.cliente ?? ""}>
        {p.cliente ?? p.pedCliente ?? "—"}
      </span>
    ),
  },
  {
    key: "produto",
    header: "Produto",
    cell: (p) => (
      <div>
        <code className="font-mono text-[12px]">{p.produto}</code>
        <div
          className="max-w-[240px] truncate text-[11.5px]"
          title={p.descricaoProduto ?? ""}
          style={{ color: "var(--fg-muted)" }}
        >
          {p.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  {
    key: "vlr",
    header: "Valor",
    sortKey: "vlrTotal",
    align: "right",
    cell: (p) => <span className="numeric font-medium">{fmtCurrency(p.vlrTotal)}</span>,
  },
  {
    key: "prazo",
    header: "Prazo previsto",
    cell: (p) => {
      const t = p.prazoRealEntrega instanceof Date ? p.prazoRealEntrega : p.dtFatCli;
      return (
        <span className="numeric text-[12px]">
          {t ? t.toLocaleDateString("pt-BR") : <StatusBadge tone="warning">Sem prazo</StatusBadge>}
        </span>
      );
    },
  },
];
