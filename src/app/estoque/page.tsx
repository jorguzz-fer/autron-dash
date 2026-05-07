import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import KPICard from "@/components/UI/KPICard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import CardSection from "@/components/UI/CardSection";
import StatusBadge from "@/components/UI/StatusBadge";
import DateRangeFilter from "@/components/UI/DateRangeFilter";
import { fmtDate, fmtNum } from "@/lib/format";
import { parseDateInput, parseSort, sortRows } from "@/lib/sort";
import {
  CheckCircle2,
  CircleSlash,
  AlertTriangle,
  ShoppingCart,
  Factory,
  CircleAlert,
} from "lucide-react";
import type { DisponibilidadeEstoque, PedidoEnriched } from "@/lib/domain";

export const metadata = { title: "Estoque & SC/OP — Autron Dash" };

interface SP {
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
}

export default async function EstoquePage({
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

  const sim = pedidos.filter((p) => p.disponibilidadeEstoque === "SIM").length;
  const parcial = pedidos.filter((p) => p.disponibilidadeEstoque === "PARCIAL").length;
  const nao = pedidos.filter((p) => p.disponibilidadeEstoque === "NAO").length;
  const necSC = pedidos.filter((p) => p.acaoNecessaria === "Necessario gerar SC").length;
  const necOP = pedidos.filter((p) => p.acaoNecessaria === "Necessario gerar OP").length;
  const erros = pedidos.filter((p) => p.acaoNecessaria === "ERRO no CADASTRO");

  const baseTabela = [...pedidos]
    .sort((a, b) => {
      const ordem: Record<DisponibilidadeEstoque, number> = {
        "NAO": 1,
        "PARCIAL": 2,
        "SIM": 3,
        "Servico": 4,
        "N/A": 5,
      };
      const eA = a.acaoNecessaria === "ERRO no CADASTRO" ? 0 : 1;
      const eB = b.acaoNecessaria === "ERRO no CADASTRO" ? 0 : 1;
      if (eA !== eB) return eA - eB;
      return ordem[a.disponibilidadeEstoque] - ordem[b.disponibilidadeEstoque];
    })
    .slice(0, 100);
  const tabela = sortRows(
    baseTabela as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as PedidoEnriched[];

  return (
    <AppShell title="Estoque & SC/OP" subtitle="Disponibilidade + alocação FIFO + erros de cadastro">
      <div className="space-y-5">
        <DateRangeFilter label="Emissão" fromValue={sp.from} toValue={sp.to} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KPICard
            label="Com estoque"
            value={fmtNum(sim)}
            hint="Disponibilidade SIM"
            icon={<CheckCircle2 className="size-4" />}
            tone="success"
          />
          <KPICard
            label="Estoque parcial"
            value={fmtNum(parcial)}
            hint="Saldo insuficiente"
            icon={<AlertTriangle className="size-4" />}
            tone="warning"
          />
          <KPICard
            label="Sem estoque"
            value={fmtNum(nao)}
            hint="Disponibilidade NÃO"
            icon={<CircleSlash className="size-4" />}
            tone="danger"
          />
          <KPICard
            label="Necessitam SC"
            value={fmtNum(necSC)}
            hint="Comprando sem SC"
            icon={<ShoppingCart className="size-4" />}
            tone="brand"
          />
          <KPICard
            label="Necessitam OP"
            value={fmtNum(necOP)}
            hint="Produzindo sem OP"
            icon={<Factory className="size-4" />}
            tone="brand"
          />
        </section>

        {erros.length > 0 && (
          <CardSection
            title={
              <span className="flex items-center gap-2" style={{ color: "#e11d48" }}>
                <CircleAlert className="size-4" />
                {fmtNum(erros.length)} erro(s) de cadastro detectado(s)
              </span>
            }
            subtitle="Itens classificados como 'Comprando' que possuem OP gerada — verificar cadastro."
          >
            <DataTable
              columns={errosCols}
              rows={erros.slice(0, 20)}
              rowKey={(p) => p.id}
              emptyMessage=""
            />
          </CardSection>
        )}

        <CardSection
          title="Pedidos por disponibilidade"
          subtitle={`${fmtNum(tabela.length)} pedidos · clique em qualquer coluna pra ordenar`}
        >
          <DataTable
            columns={estoqueCols}
            rows={tabela}
            rowKey={(p) => p.id}
            emptyMessage="Sem pedidos em aberto."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}

function dispoBadge(d: DisponibilidadeEstoque) {
  if (d === "SIM") return <StatusBadge tone="success">SIM</StatusBadge>;
  if (d === "PARCIAL") return <StatusBadge tone="warning">PARCIAL</StatusBadge>;
  if (d === "NAO") return <StatusBadge tone="danger">NÃO</StatusBadge>;
  if (d === "Servico") return <StatusBadge tone="muted">Serviço</StatusBadge>;
  return <StatusBadge tone="muted">{d}</StatusBadge>;
}

const estoqueCols: Column<PedidoEnriched>[] = [
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
          className="max-w-[240px] truncate text-[11.5px]"
          title={p.descricaoProduto ?? ""}
          style={{ color: "var(--fg-muted)" }}
        >
          {p.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  { key: "tipo", header: "Tipo", sortKey: "tipoProduto", cell: (p) => <span className="text-[12px]">{p.tipoProduto}</span> },
  { key: "qtd", header: "Qtd", sortKey: "quantidade", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.quantidade)}</span> },
  { key: "estoque", header: "Estoque", sortKey: "estoqueDisponivel", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.estoqueDisponivel)}</span> },
  { key: "alocada", header: "Alocada", sortKey: "qtdAlocada", align: "right", cell: (p) => <span className="numeric">{fmtNum(p.qtdAlocada)}</span> },
  { key: "dispo", header: "Disp.", sortKey: "disponibilidadeEstoque", cell: (p) => dispoBadge(p.disponibilidadeEstoque) },
  { key: "sc", header: "SC", sortKey: "numeroSC", cell: (p) => <span className="numeric text-[12px]">{p.numeroSC ?? "—"}</span> },
  { key: "op", header: "OP", cell: (p) => <span className="numeric text-[12px]">{p.numeroOP ?? p.fuOpNaSC ?? "—"}</span> },
];

const errosCols: Column<PedidoEnriched>[] = [
  { key: "pv", header: "PV", cell: (p) => <span className="numeric">{p.numPedido}</span>, width: "90px" },
  { key: "item", header: "Item", cell: (p) => <span className="numeric">{p.item}</span>, width: "60px" },
  {
    key: "produto",
    header: "Produto",
    sortKey: "produto",
    cell: (p) => (
      <div>
        <code className="font-mono text-[12px]">{p.produto}</code>
        <div
          className="max-w-[280px] truncate text-[11.5px]"
          title={p.descricaoProduto ?? ""}
          style={{ color: "var(--fg-muted)" }}
        >
          {p.descricaoProduto ?? ""}
        </div>
      </div>
    ),
  },
  { key: "tipo", header: "Tipo", cell: (p) => <StatusBadge tone="warning">{p.tipoProduto}</StatusBadge> },
  { key: "op_pv", header: "OP (Pedido)", cell: (p) => <span className="numeric text-[12px]">{p.numeroOP ?? "—"}</span> },
  { key: "op_sc", header: "OP (Follow-up)", cell: (p) => <span className="numeric text-[12px]">{p.fuOpNaSC ?? "—"}</span> },
  {
    key: "emissao",
    header: "Emissão",
    cell: (p) => <span className="numeric text-[12px]">{fmtDate(p.dtEmissao)}</span>,
  },
];
