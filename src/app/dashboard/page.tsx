import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getFaturamentos } from "@/lib/services/faturamento";
import { getPloomes } from "@/lib/services/ploomes";
import { getMetas } from "@/lib/services/metas";
import KPICard from "@/components/UI/KPICard";
import NavCard from "@/components/UI/NavCard";
import { fmtCurrency, fmtNum, fmtPct } from "@/lib/format";
import {
  ClipboardList,
  Boxes,
  Truck,
  Receipt,
  BarChart3,
  CheckCircle2,
  CalendarClock,
  Package,
  LineChart,
  GitCompareArrows,
} from "lucide-react";

export const metadata = { title: "Dashboard — Autron Dash" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;

  const [enriched, fats, ploomes, metas, estoqueCount] = await Promise.all([
    getEnrichedPedidos({ tenantId }),
    getFaturamentos({ tenantId }),
    getPloomes({ tenantId }),
    getMetas(tenantId, new Date().getFullYear()),
    prisma.estoque.count({ where: { tenantId } }),
  ]);

  // ── KPIs principais ──────────────────────────────────────────────
  const emAberto = enriched.filter((p) => p.statusPedido === "EM ABERTO");
  const valorEmAberto = emAberto.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
  const atrasados = emAberto.filter((p) => (p.diasAtrasoCliente ?? 0) > 0);
  const totalPVsAbertos = new Set(emAberto.map((p) => p.numPedido)).size;

  const anoAtual = new Date().getFullYear();
  const fatsAno = fats.filter((f) => f.emissao?.getFullYear() === anoAtual);
  const totalFatLiquido = fatsAno.reduce((a, f) => a + (f.faturamentoLiquido ?? 0), 0);
  const totalNFs = new Set(fats.map((f) => f.numDocto)).size;

  // ── Métricas pra cards de navegação ──────────────────────────────
  const totalPVs = new Set(enriched.map((p) => p.numPedido)).size;
  const valorTotal = enriched.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);

  const prontos = emAberto.filter((p) => p.prontoParaFazer === "SIM").length;
  const errosCadastro = emAberto.filter((p) => p.acaoNecessaria === "ERRO no CADASTRO").length;
  const necessitamSC = emAberto.filter((p) => p.acaoNecessaria === "Necessario gerar SC").length;
  const necessitamOP = emAberto.filter((p) => p.acaoNecessaria === "Necessario gerar OP").length;

  const metaGrupoAno = metas
    .filter((m) => m.unidade === "GRUPO" && m.categoria === "ENTRADA_PEDIDO")
    .reduce((a, m) => a + m.valor, 0);
  const valorEntradaAno = enriched
    .filter((p) => p.dtEmissao?.getFullYear() === anoAtual)
    .reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
  const pctAtingimento = metaGrupoAno === 0 ? 0 : (valorEntradaAno / metaGrupoAno) * 100;

  const ploomesGanhas = ploomes.length;
  const ploomesValorTotal = ploomes.reduce((a, o) => a + (o.valor ?? 0), 0);

  return (
    <AppShell title="Dashboard" subtitle={`Visão consolidada — @${session.user.tenantSlug}`}>
      <div className="space-y-6">
        {/* KPIs principais com dados reais */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard
            label="Pedidos em aberto"
            value={fmtNum(emAberto.length)}
            hint={`${fmtNum(totalPVsAbertos)} PVs · ${fmtCurrency(valorEmAberto, { compact: true })}`}
            tone="brand"
            icon={<ClipboardList className="size-4" />}
          />
          <KPICard
            label="Itens em estoque"
            value={fmtNum(estoqueCount)}
            hint="Códigos com saldo no Protheus"
            tone="neutral"
            icon={<Boxes className="size-4" />}
          />
          <KPICard
            label="Pedidos atrasados"
            value={fmtNum(atrasados.length)}
            hint="vs DT. Fat. Cli"
            tone="danger"
            icon={<Truck className="size-4" />}
            active={atrasados.length > 0}
          />
          <KPICard
            label="Faturamento líquido"
            value={fmtCurrency(totalFatLiquido, { compact: true })}
            hint={`${anoAtual} · ${fmtNum(totalNFs)} NFs`}
            tone="success"
            icon={<Receipt className="size-4" />}
          />
        </section>

        {/* Greeting */}
        <section
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border-soft)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                Olá, {session.user.name}.
              </h2>
              <p className="mt-0.5 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                Você está logado como{" "}
                <span className="font-medium" style={{ color: "var(--fg)" }}>
                  {session.user.role}
                </span>{" "}
                no tenant{" "}
                <span className="font-medium" style={{ color: "var(--fg)" }}>
                  @{session.user.tenantSlug}
                </span>
                . Acesse uma das áreas abaixo para análise detalhada.
              </p>
            </div>
            <div
              className="hidden text-right text-[11.5px] sm:block"
              style={{ color: "var(--fg-muted)" }}
            >
              <div>Última atualização</div>
              <div className="numeric font-medium" style={{ color: "var(--fg)" }}>
                {new Date().toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
        </section>

        {/* 8 cards de navegação pras abas operacionais */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NavCard
            href="/visao-geral"
            tone="brand"
            icon={BarChart3}
            title="Visão Geral"
            subtitle="Status macro e entrada por mês"
            stat={`${fmtNum(totalPVs)} PVs · ${fmtCurrency(valorTotal, { compact: true })}`}
          />
          <NavCard
            href="/entrada-pedidos"
            tone="indigo"
            icon={ClipboardList}
            title="Entrada de Pedidos"
            subtitle={`Meta x Realizado ${anoAtual}`}
            stat={
              metaGrupoAno > 0
                ? `${fmtPct(pctAtingimento, 0)} da meta · ${fmtCurrency(valorEntradaAno, { compact: true })}`
                : "Sem meta cadastrada"
            }
          />
          <NavCard
            href="/prontidao"
            tone="violet"
            icon={CheckCircle2}
            title="Prontidão"
            subtitle="Pronto p/ Fazer + ações necessárias"
            stat={`${fmtNum(prontos)} prontos · ${fmtNum(errosCadastro)} erros`}
          />
          <NavCard
            href="/previsao-entrega"
            tone="amber"
            icon={CalendarClock}
            title="Previsão Entrega"
            subtitle="Atrasos e semana de entrega"
            stat={`${fmtNum(atrasados.length)} atrasados`}
          />
          <NavCard
            href="/estoque"
            tone="cyan"
            icon={Package}
            title="Estoque & SC/OP"
            subtitle="Disponibilidade e alocação FIFO"
            stat={`${fmtNum(necessitamSC)} SC · ${fmtNum(necessitamOP)} OP`}
          />
          <NavCard
            href="/faturamento"
            tone="emerald"
            icon={Receipt}
            title="Faturamento"
            subtitle="Notas fiscais + margem"
            stat={`${fmtCurrency(totalFatLiquido, { compact: true })} · ${fmtNum(totalNFs)} NFs`}
          />
          <NavCard
            href="/previsao-faturamento"
            tone="emerald"
            icon={LineChart}
            title="Previsão Faturamento"
            subtitle="Pipeline + projeção"
            stat={`Pipeline ${fmtCurrency(valorEmAberto, { compact: true })}`}
          />
          <NavCard
            href="/comparativo-ploomes"
            tone="rose"
            icon={GitCompareArrows}
            title="Comparativo Ploomes"
            subtitle="CRM × Pedidos efetivados"
            stat={
              ploomesGanhas > 0
                ? `${fmtNum(ploomesGanhas)} ganhas · ${fmtCurrency(ploomesValorTotal, { compact: true })}`
                : "Sem dados Ploomes"
            }
          />
        </section>
      </div>
    </AppShell>
  );
}
