import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFaturamentos, type FaturamentoRow } from "@/lib/services/faturamento";
import { getMetas } from "@/lib/services/metas";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
// Paridade com Streamlit: a aba Faturamento inclui pedidos cancelados na carteira
// (Status_Pedido é apenas EM_ABERTO vs FINALIZADO — sem distinguir CAN).
// Por isso NÃO usamos filterByStatus aqui (que excluiria cancelados); a Prontidão sim.
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import BarCompareChart from "@/components/UI/BarCompareChart";
import DataTable, { type Column } from "@/components/UI/DataTable";
import HBarRanking from "@/components/UI/HBarRanking";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import { fmtCurrency, fmtDate, fmtNum, fmtPct, monthKey } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import {
  Target,
  TrendingUp,
  Wallet,
  ShoppingCart,
  Package,
  FileText,
  Percent,
} from "lucide-react";
import type { ReactNode } from "react";

export const metadata = { title: "Faturamento — Autron Dash" };

const FATOR_LIQUIDO = 0.83; // desconto 17%
const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const Q1_MONTHS = [1, 2, 3];
const Q2_MONTHS = [4, 5, 6];

interface SP {
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
}

export default async function FaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const tenantId = session.user.tenantId;

  const sp = await searchParams;
  const sortState = parseSort(sp.sort, sp.dir);

  // Filtro de data para Emissão NF (aplica a toda a aba de faturamento)
  const dataInicio = parseDateInput(sp.from);
  const dataFim = parseDateInput(sp.to, true);

  const now = new Date();
  const anoAtual = now.getFullYear();
  const anoAnterior = anoAtual - 1;
  const mesAtual = now.getMonth() + 1; // 1-12
  // Mês fechado = mês anterior; se janeiro, volta pro dezembro do ano passado
  const mesFechado = mesAtual === 1 ? 12 : mesAtual - 1;
  const anoMesFechado = mesAtual === 1 ? anoAnterior : anoAtual;

  const [fats, metas, enriched] = await Promise.all([
    getFaturamentos({ tenantId, dataInicio, dataFim }),
    getMetas(tenantId, anoAtual),
    getEnrichedPedidos({ tenantId }),
  ]);

  // ── Faturamento líquido por mês "YYYY-MM" ─────────────────────
  const fatLiqByMes = new Map<string, number>();
  for (const r of fats) {
    if (!r.emissao) continue;
    const k = monthKey(r.emissao);
    fatLiqByMes.set(k, (fatLiqByMes.get(k) ?? 0) + (r.faturamentoLiquido ?? 0));
  }

  // ── Meta RECEITA GRUPO por mês (1-12) ─────────────────────────
  const metaReceita = new Map<number, number>();
  for (const m of metas) {
    if (m.unidade === "GRUPO" && m.categoria === "RECEITA" && m.ano === anoAtual) {
      metaReceita.set(m.mes, (metaReceita.get(m.mes) ?? 0) + m.valor);
    }
  }

  // ── Carteira EM ABERTO por mês (paridade Streamlit app.py:2095-2100) ──
  //   abertos_all = df[df['Status_Pedido'] == 'EM ABERTO']
  //   a_faturar_mes = abertos_all[abertos_all['Mes_Entrega'] != 'Sem data'].groupby('Mes_Entrega')
  // Regras:
  //   - statusPedido === "EM ABERTO" (INCLUI cancelados, igual ao Streamlit)
  //   - usa SÓ dtEntrega (campo "Entrega" do entrada_pedido) — sem fallback
  //   - pedidos sem dtEntrega ("Sem data") são EXCLUÍDOS do agrupamento por mês
  //     (mas aparecem nos totais agregados de Total de Carteira mais abaixo)
  const emAberto = enriched.filter((p) => p.statusPedido === "EM ABERTO");
  const carteiraByMes = new Map<string, number>();
  for (const p of emAberto) {
    if (!p.dtEntrega) continue;
    const k = `${p.dtEntrega.getFullYear()}-${String(p.dtEntrega.getMonth() + 1).padStart(2, "0")}`;
    carteiraByMes.set(k, (carteiraByMes.get(k) ?? 0) + (p.vlrTotal ?? 0));
  }
  const carteiraBrutoTotal = emAberto.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
  const carteiraLiqTotal = carteiraBrutoTotal * FATOR_LIQUIDO;
  const carteiraLinhas = emAberto.length;
  const carteiraPVs = new Set(emAberto.map((p) => p.numPedido)).size;

  // ── Helpers ────────────────────────────────────────────────────
  function mesKey(ano: number, m: number) {
    return `${ano}-${String(m).padStart(2, "0")}`;
  }
  function fatMes(ano: number, m: number) {
    return fatLiqByMes.get(mesKey(ano, m)) ?? 0;
  }
  function cartMes(m: number) {
    // Paridade Streamlit (app.py:2120): para meses FECHADOS, Total_a_Faturar = 0
    // (a receita já foi realizada, não há mais "a faturar"). Sem essa regra,
    // Q1 e meses fechados ficavam superestimados (somando carteira que já virou NF).
    if (m < mesAtual) return 0;
    return carteiraByMes.get(mesKey(anoAtual, m)) ?? 0;
  }

  // ── Resultado mês fechado ──────────────────────────────────────
  const fatFechado = fatMes(anoMesFechado, mesFechado);
  const metaFechado = metaReceita.get(mesFechado) ?? 0;
  const atgFechado = metaFechado === 0 ? 0 : (fatFechado / metaFechado) * 100;
  const diffFechado = fatFechado - metaFechado;

  // ── Resultado mês atual ────────────────────────────────────────
  const fatAtual = fatMes(anoAtual, mesAtual);
  const metaAtual = metaReceita.get(mesAtual) ?? 0;
  const cartAtualBruto = cartMes(mesAtual);
  const cartAtualLiq = cartAtualBruto * FATOR_LIQUIDO;
  const totalProjetadoAtual = fatAtual + cartAtualLiq;
  const atgProjetadoAtual = metaAtual === 0 ? 0 : (totalProjetadoAtual / metaAtual) * 100;

  // ── Consolidado Q1 (jan-mar) ───────────────────────────────────
  const fatQ = (months: number[], ano = anoAtual) =>
    months.reduce((a, m) => a + fatMes(ano, m), 0);
  const cartLiqQ = (months: number[]) =>
    months.reduce((a, m) => a + cartMes(m), 0) * FATOR_LIQUIDO;
  const metaQ = (months: number[]) =>
    months.reduce((a, m) => a + (metaReceita.get(m) ?? 0), 0);

  const metaQ1 = metaQ(Q1_MONTHS);
  const fatQ1 = fatQ(Q1_MONTHS);
  const cartQ1Liq = cartLiqQ(Q1_MONTHS);
  const totalQ1 = fatQ1 + cartQ1Liq;
  const diffQ1 = totalQ1 - metaQ1;
  const atgQ1 = metaQ1 === 0 ? 0 : (totalQ1 / metaQ1) * 100;

  const metaQ2 = metaQ(Q2_MONTHS);
  const fatQ2 = fatQ(Q2_MONTHS);
  const cartQ2Liq = cartLiqQ(Q2_MONTHS);
  const totalQ2 = fatQ2 + cartQ2Liq;
  const diffQ2 = totalQ2 - metaQ2;
  const atgQ2 = metaQ2 === 0 ? 0 : (totalQ2 / metaQ2) * 100;

  // ── YoY por mês ────────────────────────────────────────────────
  const seriesAnoAnt = {
    name: String(anoAnterior),
    data: Array.from({ length: 12 }, (_, i) => fatMes(anoAnterior, i + 1)),
  };
  const seriesAnoAt = {
    name: String(anoAtual),
    data: Array.from({ length: 12 }, (_, i) => fatMes(anoAtual, i + 1)),
  };
  const totalAnoAnt = seriesAnoAnt.data.reduce((a, v) => a + v, 0);
  const totalAnoAt = seriesAnoAt.data.reduce((a, v) => a + v, 0);
  const variacaoYoY = totalAnoAnt === 0 ? 0 : ((totalAnoAt - totalAnoAnt) / totalAnoAnt) * 100;

  // ── Quadro Meta × Realizado (12 meses × 5 linhas) ─────────────
  const quadroRows: { label: string; bold?: boolean; values: (number | null)[] }[] = [
    {
      label: "Receita Líquida (Meta)",
      values: Array.from({ length: 12 }, (_, i) => metaReceita.get(i + 1) ?? null),
    },
    {
      label: "Total a Faturar (Cart. Bruta)",
      values: Array.from({ length: 12 }, (_, i) => {
        const v = cartMes(i + 1);
        return v > 0 ? v : null;
      }),
    },
    {
      label: "Faturamento Líquido",
      values: Array.from({ length: 12 }, (_, i) => {
        const v = fatMes(anoAtual, i + 1);
        return v > 0 ? v : null;
      }),
    },
    {
      label: "Total Líq. a Faturar (-17%)",
      values: Array.from({ length: 12 }, (_, i) => {
        const b = cartMes(i + 1);
        return b > 0 ? b * FATOR_LIQUIDO : null;
      }),
    },
    {
      label: "Total Líquido",
      bold: true,
      values: Array.from({ length: 12 }, (_, i) => {
        const fat = fatMes(anoAtual, i + 1);
        const cart = cartMes(i + 1) * FATOR_LIQUIDO;
        return fat + cart > 0 ? fat + cart : null;
      }),
    },
  ];

  // Labels de cabeçalho dos meses
  const labelMesFechado = `${MES_LABELS[mesFechado - 1].toUpperCase()}/${String(anoMesFechado).slice(2)}`;
  const labelMesAtual = `${MES_LABELS[mesAtual - 1].toUpperCase()}/${String(anoAtual).slice(2)}`;

  // ── Detalhamento (paridade com Streamlit tab5: app.py:1494-1581) ─────
  // Trabalha em cima de TODAS as notas (sem filtro de período).
  const fatBrutoTotal = fats.reduce((a, r) => a + (r.faturamentoBruto ?? 0), 0);
  const fatLiquidoTotal = fats.reduce((a, r) => a + (r.faturamentoLiquido ?? 0), 0);

  // Margem média simples (não ponderada), igual ao .mean() do pandas (app.py:1496).
  const margensPct = fats.map((r) => r.margemLiquidaPct).filter((v): v is number => v != null);
  const margemMediaPct =
    margensPct.length > 0 ? margensPct.reduce((a, v) => a + v, 0) / margensPct.length : 0;

  // Contagem de NFs únicas (app.py:1497).
  const nfsUnicas = new Set(fats.map((r) => r.numDocto)).size;

  // Top 10 vendedores por faturamento líquido (app.py:1526-1540).
  const liqByVendedor = new Map<string, number>();
  for (const r of fats) {
    const v = r.nomeVendedor ?? "—";
    liqByVendedor.set(v, (liqByVendedor.get(v) ?? 0) + (r.faturamentoLiquido ?? 0));
  }
  const topVendedores = Array.from(liqByVendedor.entries())
    .map(([label, value]) => ({
      label,
      value,
      display: fmtCurrency(value, { compact: true }),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Detalhe ordenado por emissão desc por default (app.py:1579), com override URL-driven.
  const fatDetalheDefault = [...fats].sort(
    (a, b) => (b.emissao?.getTime() ?? 0) - (a.emissao?.getTime() ?? 0),
  );
  const fatDetalhe = sortState
    ? (sortRows(
        fatDetalheDefault as unknown as Record<string, unknown>[],
        sortState,
      ) as unknown as FaturamentoRow[])
    : fatDetalheDefault;

  return (
    <AppShell title="Faturamento" subtitle="Meta × Realizado · Carteira · Comparativo Anual">
      <div className="space-y-10">

        {/* ── Filtro de data Emissão NF ── */}
        <div className="flex items-center gap-4">
          <DateRangeFilter
            label="Emissão NF"
            fromValue={sp.from}
            toValue={sp.to}
          />
          {(dataInicio || dataFim) && (
            <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Filtro aplicado às NFs e aos resultados de Meta × Realizado.
            </p>
          )}
        </div>

        {/* ── Resultado mês fechado ── */}
        <SectionBlock title={`Resultado ${labelMesFechado}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard
              label="Meta Receita"
              value={fmtCurrency(metaFechado, { compact: true })}
              hint="GRUPO · RECEITA"
              tone="neutral"
              icon={<Target className="size-4" />}
            />
            <KPICard
              label="Fat. Líquido"
              value={fmtCurrency(fatFechado, { compact: true })}
              hint="realizado"
              tone="success"
              icon={<TrendingUp className="size-4" />}
            />
            <KPICard
              label="Atingimento"
              value={fmtPct(atgFechado, 1)}
              hint="fat / meta"
              tone={atgFechado >= 100 ? "success" : atgFechado >= 80 ? "warning" : "danger"}
            />
            <KPICard
              label="Diferença"
              value={fmtCurrency(Math.abs(diffFechado), { compact: true })}
              hint={diffFechado >= 0 ? "acima da meta" : "abaixo da meta"}
              tone={diffFechado >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Resultado mês atual ── */}
        <SectionBlock title={`Resultado ${labelMesAtual}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KPICard
              label="Meta Receita"
              value={fmtCurrency(metaAtual, { compact: true })}
              hint="GRUPO · RECEITA"
              tone="neutral"
              icon={<Target className="size-4" />}
            />
            <KPICard
              label="Fat. Líq. Faturado"
              value={fmtCurrency(fatAtual, { compact: true })}
              hint="realizado até hoje"
              tone="success"
              icon={<TrendingUp className="size-4" />}
            />
            <KPICard
              label="Carteira Líq. (-17%)"
              value={fmtCurrency(cartAtualLiq, { compact: true })}
              hint={`bruto: ${fmtCurrency(cartAtualBruto, { compact: true })}`}
              tone="brand"
              icon={<Wallet className="size-4" />}
            />
            <KPICard
              label="Total Projetado"
              value={fmtCurrency(totalProjetadoAtual, { compact: true })}
              hint="fat + cart. líq."
              tone={totalProjetadoAtual >= metaAtual ? "success" : "warning"}
            />
            <KPICard
              label="Atingimento Proj."
              value={fmtPct(atgProjetadoAtual, 1)}
              hint="total proj. / meta"
              tone={atgProjetadoAtual >= 100 ? "success" : atgProjetadoAtual >= 80 ? "warning" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Consolidados Q1 e Q2 ── */}
        <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
          <SectionBlock title="Consolidado Q1 (Jan–Mar)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KPICard
                label="Meta Q1"
                value={fmtCurrency(metaQ1, { compact: true })}
                tone="neutral"
                icon={<Target className="size-4" />}
              />
              <KPICard
                label="Fat. Líquido"
                value={fmtCurrency(fatQ1, { compact: true })}
                tone="success"
                icon={<TrendingUp className="size-4" />}
              />
              <KPICard
                label="Cart. Líq. (-17%)"
                value={fmtCurrency(cartQ1Liq, { compact: true })}
                tone="brand"
                icon={<Wallet className="size-4" />}
              />
              <KPICard
                label="Total Líquido"
                value={fmtCurrency(totalQ1, { compact: true })}
                hint="fat + cart. líq."
                tone={totalQ1 >= metaQ1 ? "success" : "warning"}
              />
              <KPICard
                label="Diferença"
                value={fmtCurrency(Math.abs(diffQ1), { compact: true })}
                hint={diffQ1 >= 0 ? "acima" : "abaixo"}
                tone={diffQ1 >= 0 ? "success" : "danger"}
              />
              <KPICard
                label="Atingimento"
                value={fmtPct(atgQ1, 1)}
                tone={atgQ1 >= 100 ? "success" : atgQ1 >= 80 ? "warning" : "danger"}
              />
            </div>
          </SectionBlock>

          <SectionBlock title="Consolidado Q2 (Abr–Jun)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KPICard
                label="Meta Q2"
                value={fmtCurrency(metaQ2, { compact: true })}
                tone="neutral"
                icon={<Target className="size-4" />}
              />
              <KPICard
                label="Fat. Líquido"
                value={fmtCurrency(fatQ2, { compact: true })}
                tone="success"
                icon={<TrendingUp className="size-4" />}
              />
              <KPICard
                label="Cart. Líq. (-17%)"
                value={fmtCurrency(cartQ2Liq, { compact: true })}
                tone="brand"
                icon={<Wallet className="size-4" />}
              />
              <KPICard
                label="Total Líquido"
                value={fmtCurrency(totalQ2, { compact: true })}
                hint="fat + cart. líq."
                tone={totalQ2 >= metaQ2 ? "success" : "warning"}
              />
              <KPICard
                label="Diferença"
                value={fmtCurrency(Math.abs(diffQ2), { compact: true })}
                hint={diffQ2 >= 0 ? "acima" : "abaixo"}
                tone={diffQ2 >= 0 ? "success" : "danger"}
              />
              <KPICard
                label="Atingimento"
                value={fmtPct(atgQ2, 1)}
                tone={atgQ2 >= 100 ? "success" : atgQ2 >= 80 ? "warning" : "danger"}
              />
            </div>
          </SectionBlock>
        </div>

        {/* ── Total de Carteira ── */}
        <SectionBlock title="Total de Carteira">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard
              label="Valor Bruto"
              value={fmtCurrency(carteiraBrutoTotal, { compact: true })}
              hint="pedidos EM ABERTO"
              tone="neutral"
              icon={<ShoppingCart className="size-4" />}
            />
            <KPICard
              label="Valor Líq. (-17%)"
              value={fmtCurrency(carteiraLiqTotal, { compact: true })}
              hint="estimativa recebível"
              tone="brand"
              icon={<Wallet className="size-4" />}
            />
            <KPICard
              label="PVs em Aberto"
              value={fmtNum(carteiraPVs)}
              hint="pedidos únicos"
              tone="neutral"
              icon={<Package className="size-4" />}
            />
            <KPICard
              label="Linhas em Aberto"
              value={fmtNum(carteiraLinhas)}
              hint="itens de pedido"
              tone="neutral"
            />
          </div>
        </SectionBlock>

        {/* ── Comparativo Anual ── */}
        <SectionBlock title={`Faturamento Líquido — ${anoAnterior} × ${anoAtual}`}>
          <CardSection>
            <BarCompareChart
              seriesA={seriesAnoAnt}
              seriesB={seriesAnoAt}
              categories={MES_LABELS}
              height={300}
            />
          </CardSection>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <KPICard
              label={`Total ${anoAnterior}`}
              value={fmtCurrency(totalAnoAnt, { compact: true })}
              tone="neutral"
            />
            <KPICard
              label={`Total ${anoAtual}`}
              value={fmtCurrency(totalAnoAt, { compact: true })}
              tone="brand"
            />
            <KPICard
              label="Variação YoY"
              value={`${variacaoYoY >= 0 ? "+" : ""}${fmtPct(variacaoYoY, 1)}`}
              hint={variacaoYoY >= 0 ? `crescimento vs ${anoAnterior}` : `queda vs ${anoAnterior}`}
              tone={variacaoYoY >= 0 ? "success" : "danger"}
            />
          </div>
        </SectionBlock>

        {/* ── Quadro Meta × Realizado ── */}
        <SectionBlock title={`Quadro Meta × Realizado ${anoAtual}`}>
          <CardSection>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr
                    className="text-[10.5px] uppercase tracking-wider"
                    style={{
                      color: "var(--fg-muted)",
                      backgroundColor: "var(--surface-2)",
                      borderBottom: "1px solid var(--border-soft)",
                    }}
                  >
                    <th
                      className="px-3 py-2.5 text-left font-semibold"
                      style={{ minWidth: 200 }}
                    >
                      —
                    </th>
                    {MES_LABELS.map((m, i) => (
                      <th
                        key={m}
                        className="px-2 py-2.5 text-right font-semibold"
                        style={{
                          color:
                            i + 1 === mesAtual
                              ? "var(--color-brand-500)"
                              : "var(--fg-muted)",
                          minWidth: 72,
                        }}
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quadroRows.map((row) => (
                    <tr
                      key={row.label}
                      style={{
                        borderTop: "1px solid var(--border-soft)",
                        backgroundColor: row.bold
                          ? "color-mix(in srgb, var(--color-brand-500) 5%, var(--surface))"
                          : undefined,
                      }}
                    >
                      <td
                        className={`px-3 py-2 ${row.bold ? "font-semibold" : "font-medium"}`}
                        style={{ color: row.bold ? "var(--fg-strong)" : "var(--fg)" }}
                      >
                        {row.label}
                      </td>
                      {row.values.map((v, ci) => (
                        <td
                          key={ci}
                          className="numeric px-2 py-2 text-right"
                          style={{
                            color:
                              v == null
                                ? "var(--fg-muted)"
                                : row.bold
                                ? "var(--fg-strong)"
                                : "var(--fg)",
                            fontWeight: row.bold && v != null ? 600 : undefined,
                          }}
                        >
                          {v == null ? "—" : fmtCurrency(v, { compact: true })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardSection>
        </SectionBlock>

        {/* ── Detalhamento do Faturamento (paridade com Streamlit tab5) ── */}
        <SectionBlock title="Detalhamento do Faturamento">
          {/* 4 KPIs principais */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPICard
              label="Faturamento Bruto"
              value={fmtCurrency(fatBrutoTotal, { compact: true })}
              hint="soma de todas as NFs"
              tone="neutral"
              icon={<TrendingUp className="size-4" />}
            />
            <KPICard
              label="Faturamento Líquido"
              value={fmtCurrency(fatLiquidoTotal, { compact: true })}
              hint="soma após impostos"
              tone="success"
              icon={<Wallet className="size-4" />}
            />
            <KPICard
              label="Margem Líquida Média"
              value={fmtPct(margemMediaPct, 1)}
              hint="média simples por NF"
              tone={margemMediaPct >= 30 ? "success" : "warning"}
              icon={<Percent className="size-4" />}
            />
            <KPICard
              label="Notas Fiscais"
              value={fmtNum(nfsUnicas)}
              hint="documentos únicos"
              tone="neutral"
              icon={<FileText className="size-4" />}
            />
          </div>

          {/* Top 10 Vendedores */}
          <CardSection
            title="Top 10 Vendedores"
            subtitle="Por faturamento líquido acumulado"
          >
            <HBarRanking items={topVendedores} tone="brand" />
          </CardSection>

          {/* Tabela de detalhe */}
          <CardSection
            title="Detalhe das Notas"
            subtitle={`${fmtNum(fatDetalhe.length)} notas · ordenadas por emissão desc`}
          >
            <DataTable
              columns={faturamentoCols}
              rows={fatDetalhe}
              rowKey={(r) => r.id}
              emptyMessage="Nenhuma nota fiscal carregada."
            />
          </CardSection>
        </SectionBlock>

      </div>
    </AppShell>
  );
}

// Colunas espelham o Streamlit antigo (app.py:1574-1578):
// Emissao, Num. Docto., No do Pedido, Produto, Descricao Produto, Quantidade,
// Razao Social, Nome Fantasia, UF, Faturamento Bruto, Faturamento Liquido,
// Margem Liquida (R$), Margem Liquida (%), Nome do Vendedor, Tipo Negocio.
const faturamentoCols: Column<FaturamentoRow>[] = [
  {
    key: "emissao",
    header: "Emissão",
    sortKey: "emissao",
    cell: (r) => (
      <span className="numeric text-[12px]">{r.emissao ? fmtDate(r.emissao) : "—"}</span>
    ),
    width: "110px",
  },
  {
    key: "numDocto",
    header: "Num. Docto.",
    sortKey: "numDocto",
    cell: (r) => <span className="numeric text-[12px]">{r.numDocto}</span>,
    width: "110px",
  },
  {
    key: "noPedido",
    header: "No do Pedido",
    sortKey: "noPedido",
    cell: (r) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {r.noPedido ?? "—"}
      </span>
    ),
    width: "100px",
  },
  {
    key: "produto",
    header: "Produto",
    sortKey: "produto",
    cell: (r) => (
      <div>
        <code className="font-mono text-[12px]">{r.produto}</code>
        <div
          className="max-w-[220px] truncate text-[11.5px]"
          title={r.descricaoProduto ?? ""}
          style={{ color: "var(--fg-muted)" }}
        >
          {r.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  {
    key: "qtd",
    header: "Qtd",
    sortKey: "quantidade",
    align: "right",
    cell: (r) => <span className="numeric text-[12px]">{fmtNum(r.quantidade)}</span>,
  },
  {
    key: "razaoSocial",
    header: "Razão Social",
    sortKey: "razaoSocial",
    cell: (r) => (
      <span
        className="block max-w-[180px] truncate text-[12px]"
        title={r.razaoSocial ?? ""}
        style={{ color: "var(--fg)" }}
      >
        {r.razaoSocial ?? "—"}
      </span>
    ),
  },
  {
    key: "nomeFantasia",
    header: "Nome Fantasia",
    sortKey: "nomeFantasia",
    cell: (r) => (
      <span
        className="block max-w-[160px] truncate text-[12px]"
        title={r.nomeFantasia ?? ""}
        style={{ color: "var(--fg-muted)" }}
      >
        {r.nomeFantasia ?? "—"}
      </span>
    ),
  },
  {
    key: "uf",
    header: "UF",
    sortKey: "uf",
    align: "center",
    cell: (r) => <span className="numeric text-[12px]">{r.uf ?? "—"}</span>,
    width: "55px",
  },
  {
    key: "fatBruto",
    header: "Fat. Bruto",
    sortKey: "faturamentoBruto",
    align: "right",
    cell: (r) => (
      <span className="numeric text-[12px]">
        {r.faturamentoBruto != null ? fmtCurrency(r.faturamentoBruto) : "—"}
      </span>
    ),
  },
  {
    key: "fatLiquido",
    header: "Fat. Líquido",
    sortKey: "faturamentoLiquido",
    align: "right",
    cell: (r) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-strong)" }}>
        {r.faturamentoLiquido != null ? fmtCurrency(r.faturamentoLiquido) : "—"}
      </span>
    ),
  },
  {
    key: "margemR",
    header: "Margem R$",
    sortKey: "margemLiquidaR",
    align: "right",
    cell: (r) => (
      <span className="numeric text-[12px]">
        {r.margemLiquidaR != null ? fmtCurrency(r.margemLiquidaR) : "—"}
      </span>
    ),
  },
  {
    key: "margemPct",
    header: "Margem %",
    sortKey: "margemLiquidaPct",
    align: "right",
    cell: (r) => {
      const v = r.margemLiquidaPct;
      if (v == null)
        return (
          <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
            —
          </span>
        );
      const color = v >= 30 ? "#10b981" : v >= 15 ? "#f59e0b" : "#e11d48";
      return (
        <span className="numeric text-[12px] font-medium" style={{ color }}>
          {fmtPct(v, 1)}
        </span>
      );
    },
  },
  {
    key: "vendedor",
    header: "Vendedor",
    sortKey: "nomeVendedor",
    cell: (r) => (
      <span
        className="block max-w-[140px] truncate text-[12px]"
        title={r.nomeVendedor ?? ""}
        style={{ color: "var(--fg)" }}
      >
        {r.nomeVendedor ?? "—"}
      </span>
    ),
  },
  {
    key: "tipoNegocio",
    header: "Tipo Negócio",
    sortKey: "tipoNegocio",
    cell: (r) => (
      <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {r.tipoNegocio ?? "—"}
      </span>
    ),
  },
];

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="space-y-4 rounded-2xl px-6 py-5"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-brand-500) 4%, var(--canvas))",
        border: "1px solid color-mix(in srgb, var(--color-brand-500) 14%, var(--border-soft))",
      }}
    >
      {/* Título da seção com barra lateral teal */}
      <div className="flex items-center gap-3">
        <span
          className="block h-6 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        />
        <h2
          className="text-[20px] font-bold tracking-tight"
          style={{ color: "var(--fg-strong)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
