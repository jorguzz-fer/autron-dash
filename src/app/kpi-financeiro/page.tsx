import AppShell from "@/components/Layout/AppShell";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import SegmentedControl from "@/components/UI/SegmentedControl";
import HBarRanking from "@/components/UI/HBarRanking";
import UploadCard from "@/app/uploads/UploadCard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canSeeKpiFinanceiro } from "@/lib/kpiAccess";
import { ROLES_WRITE, type Role } from "@/lib/authz";
import { fmtCurrency, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";
import { getAFaturar, getAReceber } from "@/lib/services/kpiFinanceiro";
import {
  AGING_BUCKETS,
  sumAging,
  type AFaturarBase,
  type ClienteAFaturar,
  type ClienteAReceber,
} from "@/lib/domain/kpiFinanceiro";
import { Wallet, AlertTriangle, CalendarClock, Users, FileText, Download, ClipboardList, Scale, Timer } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const metadata = { title: "KPI Financeiro — Autron Dash" };

type View = "receber" | "faturar";

interface SP {
  view?: string;
  base?: string;
  sort?: string;
  dir?: string;
}

export default async function KpiFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeKpiFinanceiro(session.user)) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const role = session.user.role as Role;
  const canUpload = ROLES_WRITE.includes(role) || role === "CONTROLADORIA";

  const sp = await searchParams;
  const view: View = sp.view === "faturar" ? "faturar" : "receber";
  const base: AFaturarBase = sp.base === "entrega" ? "entrega" : "emissao";
  const sortState = parseSort(sp.sort, sp.dir);
  const hoje = new Date();

  return (
    <AppShell
      title="KPI Financeiro"
      subtitle="A receber (vencidos e a vencer) × a faturar — visão da Controladoria"
    >
      <div className="space-y-8">
        <SegmentedControl
          name="view"
          value={view}
          ariaLabel="Indicador"
          options={[
            { value: "receber", label: "A Receber (Vencidos e a Vencer)" },
            { value: "faturar", label: "A Faturar (Pendente)" },
          ]}
        />

        {view === "receber" ? (
          <AReceberSection
            tenantId={tenantId}
            hoje={hoje}
            sortState={sortState}
            canUpload={canUpload}
          />
        ) : (
          <AFaturarSection
            tenantId={tenantId}
            base={base}
            hoje={hoje}
            sortState={sortState}
          />
        )}
      </div>
    </AppShell>
  );
}

// ─── A Receber ──────────────────────────────────────────────────────────────

async function AReceberSection({
  tenantId,
  hoje,
  sortState,
  canUpload,
}: {
  tenantId: string;
  hoje: Date;
  sortState: ReturnType<typeof parseSort>;
  canUpload: boolean;
}) {
  const { clientes, dataReferencia, qtdTitulos, hasData } = await getAReceber(tenantId, hoje);

  const lastUpload = await prisma.dataUpload.findFirst({
    where: { tenantId, dataset: "TITULO_RECEBER", status: "SUCCESS" },
    orderBy: { startedAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  const totalVencido = clientes.reduce((a, c) => a + c.totalVencido, 0);
  const totalCartorio = clientes.reduce((a, c) => a + c.totalCartorio, 0);
  const totalAVencer = clientes.reduce((a, c) => a + c.totalAVencer, 0);
  const total = totalVencido + totalCartorio + totalAVencer;
  const pctAtrasado = total > 0 ? ((totalVencido + totalCartorio) / total) * 100 : 0;
  const hasCartorio = totalCartorio > 0;

  const agingVencido = sumAging(clientes, (c) => c.agingVencido);
  const agingCartorio = sumAging(clientes, (c) => c.agingCartorio);
  const agingAVencer = sumAging(clientes, (c) => c.agingAVencer);

  // Matrizes cliente × período (uma linha por cliente, colunas = faixas de aging).
  const vencidoRows = matrizRows(clientes, (c) => c.agingVencido, (c) => c.totalVencido);
  const aVencerRows = matrizRows(clientes, (c) => c.agingAVencer, (c) => c.totalAVencer);
  const cartorioRows = matrizRows(clientes, (c) => c.agingCartorio, (c) => c.totalCartorio);

  const rows = sortState
    ? (sortRows(clientes as unknown as Record<string, unknown>[], sortState) as unknown as ClienteAReceber[])
    : clientes;

  const uploadBlock = (
    <SectionBlock title="Atualizar base — Títulos a Receber (FINR130)">
      <p className="text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
        Suba o relatório <strong>Posição de Títulos a Receber</strong> (FINR130) exportado do
        Protheus em <code>.xlsx</code>. Cada upload substitui a posição anterior.
      </p>
      <UploadCard
        dataset="TITULO_RECEBER"
        label="Títulos a Receber (FINR130 — Posição dos Títulos)"
        disabled={!canUpload}
        lastUpload={
          lastUpload
            ? {
                filename: lastUpload.filename,
                rowCount: lastUpload.rowCount,
                finishedAt: lastUpload.finishedAt?.toISOString() ?? null,
                userName: lastUpload.user.name,
              }
            : null
        }
      />
    </SectionBlock>
  );

  if (!hasData) {
    return (
      <div className="space-y-8">
        <div
          className="rounded-xl border border-dashed px-6 py-10 text-center text-[13px]"
          style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
        >
          Nenhum título a receber carregado ainda. Suba o relatório FINR130 abaixo para começar.
        </div>
        {uploadBlock}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionBlock
        title="A Receber — Posição de Títulos"
        action={
          <DownloadButton href="/kpi-financeiro/export/receber" label="Baixar por cliente (CSV)" />
        }
        hint={
          dataReferencia
            ? `Posição em ${fmtDate(dataReferencia)} · ${fmtNum(qtdTitulos)} títulos`
            : `${fmtNum(qtdTitulos)} títulos`
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KPICard label="Total a Receber" value={fmtCurrency(total, { decimals: 0 })} tone="brand" icon={<Wallet className="size-4" />} />
          <KPICard label="Vencido" value={fmtCurrency(totalVencido, { decimals: 0 })} hint="fora cartório" tone="danger" icon={<AlertTriangle className="size-4" />} />
          <KPICard label="Em Cartório" value={fmtCurrency(totalCartorio, { decimals: 0 })} hint="em protesto" tone={hasCartorio ? "warning" : "neutral"} icon={<Scale className="size-4" />} />
          <KPICard label="A Vencer" value={fmtCurrency(totalAVencer, { decimals: 0 })} tone="success" icon={<CalendarClock className="size-4" />} />
          <KPICard label="% Atrasado" value={fmtPct(pctAtrasado, 1)} hint="vencido + cartório" tone={pctAtrasado >= 20 ? "danger" : pctAtrasado >= 10 ? "warning" : "success"} />
          <KPICard label="Clientes" value={fmtNum(clientes.length)} hint={`${fmtNum(qtdTitulos)} títulos`} tone="neutral" icon={<Users className="size-4" />} />
        </div>

        <CardSection title="Totais por status" subtitle="Vencidos/cartório por dias de atraso · A vencer por dias até o vencimento">
          <AgingMatrix
            linhas={[
              { label: "Vencido", aging: agingVencido, tone: "danger" },
              ...(hasCartorio ? [{ label: "Em Cartório", aging: agingCartorio, tone: "warning" as const }] : []),
              { label: "A Vencer", aging: agingAVencer, tone: "success" },
            ]}
          />
        </CardSection>
      </SectionBlock>

      <SectionBlock title="Vencidos por cliente" hint="Linhas por cliente · colunas por dias de atraso (fora cartório)">
        <ClienteMatriz rows={vencidoRows} tone="danger" emptyMessage="Nenhum título vencido." />
      </SectionBlock>

      {hasCartorio && (
        <SectionBlock title="Em Cartório por cliente" hint="Títulos em protesto — em tratativa junto ao cartório · colunas por dias de atraso">
          <ClienteMatriz rows={cartorioRows} tone="warning" emptyMessage="Nenhum título em cartório." />
        </SectionBlock>
      )}

      <SectionBlock title="A Vencer por cliente" hint="Linhas por cliente · colunas por dias até o vencimento">
        <ClienteMatriz rows={aVencerRows} tone="success" emptyMessage="Nenhum título a vencer." />
      </SectionBlock>

      <SectionBlock
        title="Resumo por cliente"
        hint="Visão geral somada · clique nas colunas para ordenar"
        action={<DownloadButton href="/kpi-financeiro/export/receber" label="Baixar por cliente (CSV)" />}
      >
        <DataTable
          columns={receberCols}
          rows={rows}
          rowKey={(c) => c.cliente}
          emptyMessage="Sem títulos."
        />
      </SectionBlock>

      {uploadBlock}
    </div>
  );
}

/** Monta as linhas de uma matriz cliente × período para um status. */
function matrizRows(
  clientes: ClienteAReceber[],
  pickAging: (c: ClienteAReceber) => Record<(typeof AGING_BUCKETS)[number], number>,
  pickTotal: (c: ClienteAReceber) => number,
): { cliente: string; unidades: string[]; aging: Record<(typeof AGING_BUCKETS)[number], number>; total: number }[] {
  return clientes
    .map((c) => ({ cliente: c.cliente, unidades: c.unidades, aging: pickAging(c), total: pickTotal(c) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

const receberCols: Column<ClienteAReceber>[] = [
  {
    key: "cliente",
    header: "Cliente",
    sortKey: "cliente",
    cell: (c) => (
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }} title={c.cliente}>
          {c.cliente}
        </div>
        <div
          className="truncate text-[11px]"
          style={{ color: "var(--fg-muted)" }}
          title={c.qtdCadastros > 1 ? c.unidades.join(" · ") : c.codigos.join(", ")}
        >
          {c.qtdCadastros > 1 ? `${c.qtdCadastros} cadastros · ${c.unidades.join(" · ")}` : c.codigos.join(", ")}
        </div>
      </div>
    ),
  },
  { key: "qtdTitulos", header: "Títulos", sortKey: "qtdTitulos", align: "right", cell: (c) => <span className="numeric text-[12px]">{fmtNum(c.qtdTitulos)}</span> },
  {
    key: "vencido",
    header: "Vencido",
    sortKey: "totalVencido",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px] font-medium" style={{ color: c.totalVencido > 0 ? "#e11d48" : "var(--fg-muted)" }}>
        {c.totalVencido > 0 ? fmtCurrency(c.totalVencido, { decimals: 0 }) : "—"}
      </span>
    ),
  },
  {
    key: "cartorio",
    header: "Em Cartório",
    sortKey: "totalCartorio",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: c.totalCartorio > 0 ? "#f59e0b" : "var(--fg-muted)" }}>
        {c.totalCartorio > 0 ? fmtCurrency(c.totalCartorio, { decimals: 0 }) : "—"}
      </span>
    ),
  },
  {
    key: "aVencer",
    header: "A Vencer",
    sortKey: "totalAVencer",
    align: "right",
    cell: (c) => <span className="numeric text-[12px]">{c.totalAVencer > 0 ? fmtCurrency(c.totalAVencer, { decimals: 0 }) : "—"}</span>,
  },
  {
    key: "total",
    header: "Total",
    sortKey: "total",
    align: "right",
    cell: (c) => <span className="numeric text-[12px] font-semibold" style={{ color: "var(--fg-strong)" }}>{fmtCurrency(c.total, { decimals: 0 })}</span>,
  },
  {
    key: "maiorAtraso",
    header: "Maior Atraso",
    sortKey: "maiorAtraso",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: c.maiorAtraso > 90 ? "#e11d48" : c.maiorAtraso > 0 ? "#f59e0b" : "var(--fg-muted)" }}>
        {c.maiorAtraso > 0 ? `${fmtNum(c.maiorAtraso)} d` : "—"}
      </span>
    ),
  },
];

// ─── A Faturar ──────────────────────────────────────────────────────────────

async function AFaturarSection({
  tenantId,
  base,
  hoje,
  sortState,
}: {
  tenantId: string;
  base: AFaturarBase;
  hoje: Date;
  sortState: ReturnType<typeof parseSort>;
}) {
  const clientes = await getAFaturar(tenantId, base, hoje);

  const total = clientes.reduce((a, c) => a + c.total, 0);
  const semData = clientes.reduce((a, c) => a + c.semData, 0);
  const qtdPedidos = clientes.reduce((a, c) => a + c.qtdPedidos, 0);
  const qtdItens = clientes.reduce((a, c) => a + c.qtdItens, 0);
  const aging = sumAging(clientes, (c) => c.aging);

  // Prazo médio emissão → entrega prevista (= previsão de faturamento).
  const leadSomaPonderada = clientes.reduce(
    (a, c) => a + (c.leadMedioDias != null ? c.leadMedioDias * c.qtdComPrazo : 0),
    0,
  );
  const leadQtd = clientes.reduce((a, c) => a + c.qtdComPrazo, 0);
  const leadMedioGeral = leadQtd > 0 ? leadSomaPonderada / leadQtd : null;
  // Ranking de prazo médio por cliente (top 15, só quem tem prazo calculável).
  const leadRanking = clientes
    .filter((c) => c.leadMedioDias != null)
    .map((c) => ({
      label: c.cliente,
      value: Math.round(c.leadMedioDias as number),
      display: `${fmtNum(Math.round(c.leadMedioDias as number))} dias`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const rows = sortState
    ? (sortRows(clientes as unknown as Record<string, unknown>[], sortState) as unknown as ClienteAFaturar[])
    : clientes;

  return (
    <SectionBlock
      title="A Faturar — Carteira Pendente"
      hint="Pedidos EM ABERTO (sem nota fiscal) na base de Pedidos do Dash"
      action={
        <div className="flex items-center gap-3">
          <SegmentedControl
            name="base"
            value={base}
            size="sm"
            ariaLabel="Referência do aging"
            options={[
              { value: "emissao", label: "Por Emissão", hint: "Dias desde a emissão do pedido" },
              { value: "entrega", label: "Por Entrega prevista", hint: "Dias vs. a entrega/faturamento previsto" },
            ]}
          />
          <DownloadButton href={`/kpi-financeiro/export/faturar?base=${base}`} label="Baixar (CSV)" />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard label="Total a Faturar" value={fmtCurrency(total, { decimals: 0 })} tone="brand" icon={<Wallet className="size-4" />} />
        <KPICard label="Clientes" value={fmtNum(clientes.length)} tone="neutral" icon={<Users className="size-4" />} />
        <KPICard label="Pedidos (PVs)" value={fmtNum(qtdPedidos)} tone="neutral" icon={<ClipboardList className="size-4" />} />
        <KPICard label="Itens" value={fmtNum(qtdItens)} tone="neutral" icon={<FileText className="size-4" />} />
        <KPICard
          label="Prazo médio"
          value={leadMedioGeral != null ? `${fmtNum(Math.round(leadMedioGeral))} d` : "—"}
          hint="emissão → entrega prevista"
          tone="neutral"
          icon={<Timer className="size-4" />}
        />
        <KPICard label="Sem data" value={fmtCurrency(semData, { decimals: 0 })} hint={base === "emissao" ? "sem emissão" : "sem entrega prevista"} tone={semData > 0 ? "warning" : "neutral"} />
      </div>

      <CardSection
        title="Prazo médio emissão → previsão de faturamento"
        subtitle={`Média de dias entre a emissão do pedido e a entrega prevista · top ${Math.min(15, leadRanking.length)} clientes${leadMedioGeral != null ? ` · média geral ${fmtNum(Math.round(leadMedioGeral))} dias` : ""}`}
      >
        {leadRanking.length > 0 ? (
          <HBarRanking items={leadRanking} tone="brand" />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Sem pedidos com emissão e entrega prevista preenchidas.
          </p>
        )}
      </CardSection>

      <CardSection title="Aging" subtitle={base === "emissao" ? "Por dias desde a emissão do pedido" : "Por dias em relação à entrega prevista"}>
        <AgingMatrix linhas={[{ label: "A Faturar", aging, tone: "brand" }]} semData={semData} />
      </CardSection>

      <CardSection title={`Por Cliente (${fmtNum(clientes.length)})`} subtitle="Filiais de mesmo nome somadas numa linha · clique nas colunas para ordenar">
        <DataTable columns={faturarCols} rows={rows} rowKey={(c) => c.cliente} emptyMessage="Nenhum pedido em aberto." />
      </CardSection>
    </SectionBlock>
  );
}

const faturarCols: Column<ClienteAFaturar>[] = [
  {
    key: "cliente",
    header: "Cliente",
    sortKey: "cliente",
    cell: (c) => (
      <span className="block max-w-[260px] truncate text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }} title={c.cliente}>
        {c.cliente}
      </span>
    ),
  },
  { key: "qtdPedidos", header: "PVs", sortKey: "qtdPedidos", align: "right", cell: (c) => <span className="numeric text-[12px]">{fmtNum(c.qtdPedidos)}</span> },
  {
    key: "leadMedioDias",
    header: "Prazo médio",
    sortKey: "leadMedioDias",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12px]" style={{ color: c.leadMedioDias != null ? "var(--fg)" : "var(--fg-muted)" }}>
        {c.leadMedioDias != null ? `${fmtNum(Math.round(c.leadMedioDias))} d` : "—"}
      </span>
    ),
  },
  {
    key: "total",
    header: "Total a Faturar",
    sortKey: "total",
    align: "right",
    cell: (c) => <span className="numeric text-[12px] font-semibold" style={{ color: "var(--fg-strong)" }}>{fmtCurrency(c.total, { decimals: 0 })}</span>,
  },
  ...AGING_BUCKETS.map(
    (b): Column<ClienteAFaturar> => ({
      key: `aging-${b}`,
      header: `${b} d`,
      align: "right",
      cell: (c) => {
        const v = c.aging[b];
        return (
          <span className="numeric text-[12px]" style={{ color: v > 0 ? (b === ">120" ? "#e11d48" : "var(--fg)") : "var(--fg-muted)" }}>
            {v > 0 ? fmtCurrency(v, { decimals: 0 }) : "—"}
          </span>
        );
      },
    }),
  ),
];

// ─── Auxiliares de UI ───────────────────────────────────────────────────────

type Tone = "danger" | "success" | "brand" | "warning";
const TONE_COLOR: Record<Tone, string> = {
  danger: "#e11d48",
  success: "#10b981",
  brand: "var(--color-brand-500)",
  warning: "#f59e0b",
};

/** Matriz cliente × período: uma linha por cliente, colunas = faixas de aging. */
function ClienteMatriz({
  rows,
  tone,
  emptyMessage,
}: {
  rows: { cliente: string; unidades: string[]; aging: Record<(typeof AGING_BUCKETS)[number], number>; total: number }[];
  tone: Tone;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed px-6 py-8 text-center text-[13px]"
        style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
      >
        {emptyMessage}
      </div>
    );
  }
  const totais = AGING_BUCKETS.map((b) => rows.reduce((a, r) => a + r.aging[b], 0));
  const totalGeral = rows.reduce((a, r) => a + r.total, 0);
  return (
    <div
      className="overflow-auto rounded-2xl border"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-soft)", maxHeight: "calc(100vh - 240px)" }}
    >
      <table className="w-full text-[12px]">
        <thead>
          <tr
            className="text-[10.5px] uppercase tracking-wider"
            style={{ color: "var(--fg-muted)" }}
          >
            <th className="sticky top-0 z-10 px-4 py-2.5 text-left font-semibold" style={{ backgroundColor: "var(--surface-2)", boxShadow: "inset 0 -1px 0 var(--border-soft)", minWidth: 220 }}>
              Cliente
            </th>
            {AGING_BUCKETS.map((b) => (
              <th key={b} className="sticky top-0 z-10 px-3 py-2.5 text-right font-semibold" style={{ backgroundColor: "var(--surface-2)", boxShadow: "inset 0 -1px 0 var(--border-soft)", minWidth: 104 }}>
                {b} dias
              </th>
            ))}
            <th className="sticky top-0 z-10 px-4 py-2.5 text-right font-semibold" style={{ backgroundColor: "var(--surface-2)", boxShadow: "inset 0 -1px 0 var(--border-soft)", minWidth: 120 }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cliente} className="transition-colors hover:bg-[var(--surface-2)]" style={{ borderTop: "1px solid var(--border-soft)" }}>
              <td className="px-4 py-2">
                <div className="truncate text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }} title={r.unidades.join(" · ")}>
                  {r.cliente}
                </div>
                {r.unidades.length > 1 && (
                  <div className="truncate text-[11px]" style={{ color: "var(--fg-muted)" }} title={r.unidades.join(" · ")}>
                    {r.unidades.length} cadastros
                  </div>
                )}
              </td>
              {AGING_BUCKETS.map((b) => (
                <td key={b} className="numeric px-3 py-2 text-right" style={{ color: r.aging[b] > 0 ? "var(--fg)" : "var(--fg-muted)" }}>
                  {r.aging[b] > 0 ? fmtCurrency(r.aging[b], { decimals: 0 }) : "—"}
                </td>
              ))}
              <td className="numeric px-4 py-2 text-right font-semibold" style={{ color: TONE_COLOR[tone] }}>
                {fmtCurrency(r.total, { decimals: 0 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--border-soft)", backgroundColor: "var(--surface-2)" }}>
            <td className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-strong)" }}>Total</td>
            {totais.map((v, i) => (
              <td key={i} className="numeric px-3 py-2.5 text-right text-[11px] font-bold" style={{ color: "var(--fg-strong)" }}>
                {v > 0 ? fmtCurrency(v, { decimals: 0 }) : "—"}
              </td>
            ))}
            <td className="numeric px-4 py-2.5 text-right text-[11px] font-bold" style={{ color: TONE_COLOR[tone] }}>
              {fmtCurrency(totalGeral, { decimals: 0 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AgingMatrix({
  linhas,
  semData,
}: {
  linhas: { label: string; aging: Record<(typeof AGING_BUCKETS)[number], number>; tone: Tone }[];
  semData?: number;
}) {
  const toneColor = TONE_COLOR;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr
            className="text-[10.5px] uppercase tracking-wider"
            style={{ color: "var(--fg-muted)", backgroundColor: "var(--surface-2)", borderBottom: "1px solid var(--border-soft)" }}
          >
            <th className="px-3 py-2.5 text-left font-semibold" style={{ minWidth: 120 }}>—</th>
            {AGING_BUCKETS.map((b) => (
              <th key={b} className="px-3 py-2.5 text-right font-semibold" style={{ minWidth: 110 }}>{b} dias</th>
            ))}
            <th className="px-3 py-2.5 text-right font-semibold" style={{ minWidth: 130 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const tot = AGING_BUCKETS.reduce((a, b) => a + l.aging[b], 0);
            return (
              <tr key={l.label} style={{ borderTop: "1px solid var(--border-soft)" }}>
                <td className="px-3 py-2 font-semibold" style={{ color: toneColor[l.tone] }}>{l.label}</td>
                {AGING_BUCKETS.map((b) => (
                  <td key={b} className="numeric px-3 py-2 text-right" style={{ color: l.aging[b] > 0 ? "var(--fg)" : "var(--fg-muted)" }}>
                    {l.aging[b] > 0 ? fmtCurrency(l.aging[b], { decimals: 0 }) : "—"}
                  </td>
                ))}
                <td className="numeric px-3 py-2 text-right font-semibold" style={{ color: "var(--fg-strong)" }}>{fmtCurrency(tot, { decimals: 0 })}</td>
              </tr>
            );
          })}
          {semData != null && semData > 0 && (
            <tr style={{ borderTop: "1px solid var(--border-soft)" }}>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--fg-muted)" }}>Sem data</td>
              <td className="numeric px-3 py-2 text-right" style={{ color: "var(--fg-muted)" }} colSpan={AGING_BUCKETS.length}>—</td>
              <td className="numeric px-3 py-2 text-right font-semibold" style={{ color: "#f59e0b" }}>{fmtCurrency(semData, { decimals: 0 })}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DownloadButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="ring-focus inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border-strong)", color: "var(--fg)" }}
    >
      <Download className="size-3.5" /> {label}
    </Link>
  );
}

function SectionBlock({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="space-y-4 rounded-2xl px-6 py-5"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-brand-500) 4%, var(--canvas))",
        border: "1px solid color-mix(in srgb, var(--color-brand-500) 14%, var(--border-soft))",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="block h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: "var(--color-brand-500)" }} />
          <div>
            <h2 className="text-[19px] font-bold tracking-tight" style={{ color: "var(--fg-strong)" }}>{title}</h2>
            {hint && <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
