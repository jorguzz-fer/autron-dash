import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getPrazosEngByTenant } from "@/lib/services/prazoEngenhariaIND21";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import HBarRanking from "@/components/UI/HBarRanking";
import FilterSelect from "@/components/UI/FilterSelect";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import PrazoEngCell from "@/components/UI/PrazoEngCell";
import { fmtCurrency, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import { ROLES_MANAGE, type Role } from "@/lib/authz";
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
  Wrench,
} from "lucide-react";
import type {
  AcaoNecessaria,
  PedidoEnriched,
  ProntoParaFazer,
} from "@/lib/domain";

export const metadata = { title: "Prontidão — Autron Dash" };

interface SP {
  status?: string;  // "finalizado" | default = em aberto
  dispo?: string;
  tipo?: string;
  atend?: string;   // dentro | fora | sem
  mesFat?: string;  // 1..12 (mês de prazoRealEntrega)
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  // tabela Ergomec (IND21):
  eAtend?: string;
  eMesFat?: string;
  eSort?: string;
  eDir?: string;
}

const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_OPTIONS = MES_LABELS.map((nome, i) => ({
  value: String(i + 1),
  label: `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`,
}));
const ATEND_OPTIONS = [
  { value: "dentro", label: "Dentro do prazo" },
  { value: "fora", label: "Fora do prazo" },
  { value: "sem", label: "Sem prazo definido" },
];

/**
 * Tipo de atendimento de prazo do pedido — derivado de diasAtrasoCliente.
 * Espelha os 3 buckets do print do Streamlit.
 */
function classifAtend(p: PedidoEnriched): "dentro" | "fora" | "sem" {
  if (p.dtFatCli == null) return "sem";
  if (p.diasAtrasoCliente != null && p.diasAtrasoCliente > 0) return "fora";
  return "dentro";
}

/**
 * Mês (1-12) do prazo real de entrega — usado pelo filtro "Mês de Faturamento".
 * Quando prazoRealEntrega é "A definir" ou null, retorna null e o pedido fica
 * fora do filtro quando há mês selecionado.
 */
function mesFatKey(p: PedidoEnriched): number | null {
  const prazo = p.prazoRealEntrega;
  if (prazo instanceof Date) return prazo.getMonth() + 1;
  if (p.dtFatCli) return p.dtFatCli.getMonth() + 1;
  return null;
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
  const sortStateErg = parseSort(sp.eSort, sp.eDir);

  const userRole = session.user.role as Role;
  const canEditPrazoEng = ROLES_MANAGE.includes(userRole);

  const [all, prazosEngMap] = await Promise.all([
    getEnrichedPedidos({
      tenantId: session.user.tenantId,
      dataInicio,
      dataFim,
    }),
    getPrazosEngByTenant(session.user.tenantId),
  ]);

  // "Em Aberto" é o padrão. "finalizado" mostra os itens fora de EM ABERTO.
  const pedidos = all.filter((p) =>
    sp.status === "finalizado"
      ? p.statusPedido !== "EM ABERTO"
      : p.statusPedido === "EM ABERTO",
  );

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
    if (sp.atend && classifAtend(p) !== sp.atend) return false;
    if (sp.mesFat) {
      const m = mesFatKey(p);
      if (m == null || m !== Number(sp.mesFat)) return false;
    }
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

  // ─── Pedidos Ergomec (IND21) — visualização separada com prazo de engenharia
  const ergomecPedidos = pedidos.filter((p) => p.unidadeNegocio === "IND21");
  const ergomecFiltrados = ergomecPedidos.filter((p) => {
    if (sp.eAtend && classifAtend(p) !== sp.eAtend) return false;
    if (sp.eMesFat) {
      const m = mesFatKey(p);
      if (m == null || m !== Number(sp.eMesFat)) return false;
    }
    return true;
  });
  // Ordenar Ergomec por prazo de engenharia (atual ou null) ASC, depois por dtFatCli
  const ergomecOrdenado = [...ergomecFiltrados].sort((a, b) => {
    const pa = prazosEngMap.get(a.numPedido)?.prazoAtual?.getTime() ?? Number.POSITIVE_INFINITY;
    const pb = prazosEngMap.get(b.numPedido)?.prazoAtual?.getTime() ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const fa = a.dtFatCli?.getTime() ?? Number.POSITIVE_INFINITY;
    const fb = b.dtFatCli?.getTime() ?? Number.POSITIVE_INFINITY;
    return fa - fb;
  });
  const ergomecTabela = sortRows(
    ergomecOrdenado as unknown as Record<string, unknown>[],
    sortStateErg,
  ) as unknown as PedidoEnriched[];

  const ergomecPVsUnicos = new Set(ergomecPedidos.map((p) => p.numPedido)).size;
  const ergomecPVsComPrazo = new Set(
    ergomecPedidos
      .filter((p) => prazosEngMap.get(p.numPedido)?.prazoAtual != null)
      .map((p) => p.numPedido),
  ).size;
  const ergomecPVsSemPrazo = ergomecPVsUnicos - ergomecPVsComPrazo;

  return (
    <AppShell title="Prontidão" subtitle="Pronto para fazer? Estoque + follow-up + ação necessária">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <DateRangeFilter label="Emissão" fromValue={sp.from} toValue={sp.to} />
          <div className="w-52 shrink-0">
            <FilterSelect
              name="status"
              label="Status do Pedido"
              value={sp.status}
              allLabel="Em Aberto"
              options={[{ value: "finalizado", label: "Finalizado" }]}
            />
          </div>
        </div>

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
          title="Pedidos"
          subtitle={`${fmtNum(filtered.length)} de ${fmtNum(pedidos.length)} pedidos · top 100 (erros e bloqueios primeiro)`}
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
            <FilterSelect
              name="atend"
              label="Atendimento Prazo"
              value={sp.atend}
              options={ATEND_OPTIONS}
            />
            <FilterSelect
              name="mesFat"
              label="Mês de Faturamento"
              value={sp.mesFat}
              options={MES_OPTIONS}
            />
          </div>
          <DataTable
            columns={prontidaoCols}
            rows={tabela}
            rowKey={(p) => p.id}
            emptyMessage="Sem pedidos com os filtros selecionados."
          />
        </CardSection>

        <CardSection
          title="Pedidos Ergomec (IND21) — Controle de Prazo de Engenharia"
          subtitle={`${fmtNum(ergomecFiltrados.length)} de ${fmtNum(ergomecPedidos.length)} linhas em aberto · ${fmtNum(ergomecPVsUnicos)} PVs (${fmtNum(ergomecPVsComPrazo)} com prazo · ${fmtNum(ergomecPVsSemPrazo)} pendentes)`}
          actions={
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)",
                color: "var(--color-brand-600)",
              }}
            >
              <Wrench className="size-3.5" /> Ergomec
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect
              name="eMesFat"
              label="Mês de Faturamento"
              value={sp.eMesFat}
              options={MES_OPTIONS}
            />
            <FilterSelect
              name="eAtend"
              label="Atendimento Prazo"
              value={sp.eAtend}
              options={ATEND_OPTIONS}
            />
            <div
              className="flex items-end justify-end pb-1 text-[11.5px]"
              style={{ color: "var(--fg-muted)" }}
            >
              {canEditPrazoEng
                ? "Você pode atualizar prazos."
                : "Acesso somente leitura — perfil ADMIN/DIRETOR/GERENTE necessário para editar."}
            </div>
          </div>
          <DataTable
            columns={ergomecCols(prazosEngMap, canEditPrazoEng)}
            rows={ergomecTabela}
            rowKey={(p) => p.id}
            emptyMessage={
              ergomecPedidos.length === 0
                ? "Nenhum pedido IND21 em aberto."
                : "Sem pedidos com os filtros selecionados."
            }
            sortParam="eSort"
            dirParam="eDir"
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
    case "SC Manual":
      return <StatusBadge tone="brand">{a}</StatusBadge>;
    case "Finalizado":
      return <StatusBadge tone="muted">{a}</StatusBadge>;
    default:
      return <StatusBadge tone="brand">{a}</StatusBadge>;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function diasEntre(de: Date | null, ate: Date | null): number | null {
  if (!de || !ate) return null;
  const a = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const b = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Semana ISO: "W19.26" a partir de uma data. */
function semanaStr(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `W${String(week).padStart(2, "0")}.${String(d.getUTCFullYear()).slice(2)}`;
}

/** "SC 5576" | "OP 20437" | "—" */
function scOpCell(p: PedidoEnriched) {
  const txt = p.numeroSC ? `SC ${p.numeroSC}` : p.numeroOP ? `OP ${p.numeroOP}` : null;
  return (
    <span className="numeric text-[12px]" style={{ color: txt ? "var(--fg)" : "var(--fg-muted)" }}>
      {txt ?? "—"}
    </span>
  );
}

/** Disponibilidade colorida: SIM=verde, PARCIAL=laranja, NAO=vermelho */
function dispoCell(dispo: string) {
  const color =
    dispo === "SIM" ? "#10b981" : dispo === "NAO" ? "#e11d48" : dispo.startsWith("PARCIAL") ? "#f59e0b" : "var(--fg-muted)";
  return (
    <span className="text-[12px] font-medium" style={{ color }}>
      {dispo}
    </span>
  );
}

/** Texto de atendimento de prazo (igual ao classifAtend mas como texto corrido). */
function atendTexto(p: PedidoEnriched) {
  const c = classifAtend(p);
  const label = c === "dentro" ? "Dentro do prazo" : c === "fora" ? "Fora do prazo" : "Sem prazo definido";
  const color = c === "dentro" ? "#10b981" : c === "fora" ? "#e11d48" : "var(--fg-muted)";
  return <span className="text-[12px]" style={{ color }}>{label}</span>;
}

const prontidaoCols: Column<PedidoEnriched>[] = [
  {
    key: "pv",
    header: "PV",
    sortKey: "numPedido",
    cell: (p) => <span className="numeric text-[12px]">{p.numPedido}</span>,
    width: "90px",
  },
  {
    key: "item",
    header: "Item",
    sortKey: "item",
    cell: (p) => <span className="numeric text-[12px]">{p.item}</span>,
    width: "55px",
  },
  {
    key: "produto",
    header: "Produto",
    sortKey: "produto",
    cell: (p) => (
      <div>
        <code className="font-mono text-[12px]">{p.produto}</code>
        <div className="max-w-[220px] truncate text-[11.5px]" title={p.descricaoProduto ?? ""} style={{ color: "var(--fg-muted)" }}>
          {p.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    sortKey: "cliente",
    cell: (p) => (
      <span className="block max-w-[160px] truncate text-[12px]" title={p.cliente ?? ""} style={{ color: "var(--fg)" }}>
        {p.cliente ?? "—"}
      </span>
    ),
  },
  {
    key: "tipo",
    header: "Tipo",
    sortKey: "tipoProduto",
    cell: (p) => <StatusBadge tone={p.tipoProduto === "Indefinido" ? "warning" : "muted"}>{p.tipoProduto}</StatusBadge>,
  },
  {
    key: "qtd",
    header: "Qtd",
    sortKey: "quantidade",
    align: "right",
    cell: (p) => <span className="numeric text-[12px]">{fmtNum(p.quantidade)}</span>,
  },
  {
    key: "vlrTotal",
    header: "Valor Total",
    sortKey: "vlrTotal",
    align: "right",
    cell: (p) => (
      <span className="numeric text-[12px]">
        {p.vlrTotal != null ? fmtCurrency(Number(p.vlrTotal)) : "—"}
      </span>
    ),
  },
  {
    key: "dispo",
    header: "Disponível?",
    sortKey: "disponibilidadeEstoque",
    cell: (p) => dispoCell(p.disponibilidadeEstoque),
  },
  {
    key: "estoque",
    header: "Estoque",
    sortKey: "estoqueDisponivel",
    align: "right",
    cell: (p) => <span className="numeric text-[12px]">{fmtNum(p.estoqueDisponivel)}</span>,
  },
  {
    key: "scop",
    header: "SC / OP",
    cell: scOpCell,
  },
  {
    key: "acao",
    header: "Ação",
    sortKey: "acaoNecessaria",
    cell: (p) => acaoBadge(p.acaoNecessaria),
  },
  {
    key: "dtNec",
    header: "Dt. Necessidade Cliente",
    sortKey: "dtFatCli",
    cell: (p) => <span className="numeric text-[12px]">{p.dtFatCli ? fmtDate(p.dtFatCli) : "—"}</span>,
  },
  {
    key: "dtAdapt",
    header: "Dt. Entrega Adaptada",
    cell: (p) => (
      <span className="numeric text-[12px]">
        {p.prazoRealEntrega instanceof Date ? fmtDate(p.prazoRealEntrega) : p.prazoRealEntrega ?? "—"}
      </span>
    ),
  },
  {
    key: "prazoEnt",
    header: "Prazo Entrega",
    sortKey: "fuDtChegadaAutron",
    cell: (p) => (
      <span className="numeric text-[12px]">{p.fuDtChegadaAutron ? fmtDate(p.fuDtChegadaAutron) : "—"}</span>
    ),
  },
  {
    key: "atend",
    header: "Atendimento Prazo",
    cell: atendTexto,
  },
  {
    key: "semana",
    header: "Semana",
    cell: (p) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {p.fuDtChegadaAutron ? semanaStr(p.fuDtChegadaAutron) : "—"}
      </span>
    ),
  },
  {
    key: "pedCliente",
    header: "Ped. Cliente",
    sortKey: "pedCliente",
    cell: (p) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {p.pedCliente ?? "—"}
      </span>
    ),
  },
];

function atendBadge(p: PedidoEnriched) {
  const c = classifAtend(p);
  if (c === "dentro") return <StatusBadge tone="success">Dentro</StatusBadge>;
  if (c === "fora") return <StatusBadge tone="danger">Fora</StatusBadge>;
  return <StatusBadge tone="muted">Sem prazo</StatusBadge>;
}

function ergomecCols(
  prazosMap: Awaited<ReturnType<typeof getPrazosEngByTenant>>,
  canEdit: boolean,
): Column<PedidoEnriched>[] {
  return [
    {
      key: "pv",
      header: "PV",
      sortKey: "numPedido",
      cell: (p) => <span className="numeric">{p.numPedido}</span>,
      width: "90px",
    },
    {
      key: "item",
      header: "Item",
      sortKey: "item",
      cell: (p) => <span className="numeric">{p.item}</span>,
      width: "60px",
    },
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
      key: "qtd",
      header: "Qtd",
      sortKey: "quantidade",
      align: "right",
      cell: (p) => <span className="numeric">{fmtNum(p.quantidade)}</span>,
    },
    {
      key: "dtOfertada",
      header: "Dt. Ofertada",
      sortKey: "dtOfertada",
      cell: (p) => (
        <span className="numeric text-[12px]">
          {p.dtOfertada ? fmtDate(p.dtOfertada) : "—"}
        </span>
      ),
    },
    {
      key: "dtFatCli",
      header: "Dt. Fat. Cli.",
      sortKey: "dtFatCli",
      cell: (p) => (
        <span className="numeric text-[12px]">
          {p.dtFatCli ? fmtDate(p.dtFatCli) : "—"}
        </span>
      ),
    },
    {
      key: "atend",
      header: "Atendim.",
      cell: atendBadge,
    },
    {
      key: "pronto",
      header: "Pronto?",
      sortKey: "prontoParaFazer",
      cell: (p) => prontidaoBadge(p.prontoParaFazer),
    },
    {
      key: "prazoEng",
      header: "Prazo Engenharia",
      cell: (p) => {
        const info = prazosMap.get(p.numPedido);
        return (
          <PrazoEngCell
            numPedido={p.numPedido}
            prazoAtual={info?.prazoAtual ?? null}
            ultimaAtualizacao={info?.ultimaAtualizacao ?? null}
            historico={info?.historico ?? []}
            canEdit={canEdit}
          />
        );
      },
    },
  ];
}
