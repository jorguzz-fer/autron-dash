import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFaturamentos } from "@/lib/services/faturamento";
import { getMetas } from "@/lib/services/metas";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import BarCompareChart from "@/components/UI/BarCompareChart";
import { fmtCurrency, fmtNum, fmtPct, monthKey } from "@/lib/format";
import { Target, TrendingUp, Wallet, ShoppingCart, Package } from "lucide-react";
import type { ReactNode } from "react";

export const metadata = { title: "Faturamento — Autron Dash" };

const FATOR_LIQUIDO = 0.83; // desconto 17%
const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const Q1_MONTHS = [1, 2, 3];
const Q2_MONTHS = [4, 5, 6];

export default async function FaturamentoPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const tenantId = session.user.tenantId;

  const now = new Date();
  const anoAtual = now.getFullYear();
  const anoAnterior = anoAtual - 1;
  const mesAtual = now.getMonth() + 1; // 1-12
  // Mês fechado = mês anterior; se janeiro, volta pro dezembro do ano passado
  const mesFechado = mesAtual === 1 ? 12 : mesAtual - 1;
  const anoMesFechado = mesAtual === 1 ? anoAnterior : anoAtual;

  const [fats, metas, enriched] = await Promise.all([
    getFaturamentos({ tenantId }),
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

  // ── Carteira EM ABERTO por mês de dtFatCli ────────────────────
  const emAberto = enriched.filter((p) => p.statusPedido === "EM ABERTO");
  const carteiraByMes = new Map<string, number>();
  for (const p of emAberto) {
    if (!p.dtFatCli) continue;
    const k = monthKey(p.dtFatCli);
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

  return (
    <AppShell title="Faturamento" subtitle="Meta × Realizado · Carteira · Comparativo Anual">
      <div className="space-y-7">

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

      </div>
    </AppShell>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2
        className="text-[16px] font-semibold tracking-tight"
        style={{ color: "var(--fg-strong)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}
