import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getVendedores, getCargos } from "@/lib/services/comissao";
import { type Role } from "@/lib/authz";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import { VendedorCriarBtn, VendedorEditarBtn } from "./VendedorBtns";
import { CargoCriarBtn, CargoEditarBtn } from "./CargoBtns";
import { Users, Briefcase } from "lucide-react";

export const metadata = { title: "Vendedores & Cargos — Comissões" };

const ALLOWED_ROLES: Role[] = ["ADMIN", "DIRETOR", "CONTROLADORIA"];

type VendedorRow = Awaited<ReturnType<typeof getVendedores>>[number];
type CargoRow = Awaited<ReturnType<typeof getCargos>>[number];

const TIPO_TONE: Record<string, "brand" | "success" | "warning"> = {
  CLT: "brand",
  PJ: "warning",
  REPRESENTANTE: "success",
};

function fmtPct(val: string | number | null | undefined): string {
  if (val == null || val === "") return "—";
  const n = Number(val);
  return isNaN(n) ? "—" : `${(n * 100).toFixed(2)}%`;
}

const vendedorColumns: Column<VendedorRow>[] = [
  {
    key: "codigoProtheus",
    header: "Código",
    sortKey: "codigoProtheus",
    cell: (v) => (
      <span className="numeric text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }}>
        {v.codigoProtheus}
      </span>
    ),
  },
  {
    key: "nome",
    header: "Nome",
    sortKey: "nome",
    cell: (v) => (
      <span className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>
        {v.nome}
      </span>
    ),
  },
  {
    key: "cargo",
    header: "Cargo",
    sortKey: "cargo",
    cell: (v) => (
      <span className="text-[12.5px]" style={{ color: "var(--fg)" }}>
        {v.cargo}
      </span>
    ),
  },
  {
    key: "tipo",
    header: "Tipo",
    sortKey: "tipo",
    cell: (v) => (
      <StatusBadge tone={TIPO_TONE[v.tipo] ?? "muted"}>{v.tipo}</StatusBadge>
    ),
  },
  {
    key: "nivel",
    header: "Nível",
    align: "center",
    cell: (v) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {v.nivel ?? "—"}
      </span>
    ),
  },
  {
    key: "gatilhoOverride",
    header: "Gatilho override",
    align: "right",
    cell: (v) => (
      <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
        {fmtPct(v.gatilhoOverride?.toString())}
      </span>
    ),
  },
  {
    key: "ativo",
    header: "Status",
    sortKey: "ativo",
    cell: (v) =>
      v.ativo ? (
        <StatusBadge tone="success">Ativo</StatusBadge>
      ) : (
        <StatusBadge tone="muted">Inativo</StatusBadge>
      ),
  },
  {
    key: "actions",
    header: "",
    cell: (v) => (
      <VendedorEditarBtn
        vendedor={{
          id: v.id,
          codigoProtheus: v.codigoProtheus,
          nome: v.nome,
          cargo: v.cargo,
          tipo: v.tipo,
          nivel: v.nivel ?? null,
          gatilhoOverride: v.gatilhoOverride?.toString() ?? null,
          ativo: v.ativo,
        }}
      />
    ),
  },
];

const BASE_TONE: Record<string, "brand" | "success" | "warning"> = {
  INDIVIDUAL: "brand",
  COLETIVO: "success",
  CARTEIRA: "warning",
};

const cargoColumns: Column<CargoRow>[] = [
  {
    key: "ano",
    header: "Ano",
    sortKey: "ano",
    cell: (c) => (
      <span className="numeric text-[12.5px] font-medium" style={{ color: "var(--fg-strong)" }}>
        {c.ano}
      </span>
    ),
  },
  {
    key: "cargo",
    header: "Cargo",
    sortKey: "cargo",
    cell: (c) => (
      <span className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>
        {c.cargo}
      </span>
    ),
  },
  {
    key: "comissaoPct",
    header: "Comissão %",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12.5px]" style={{ color: "var(--fg)" }}>
        {fmtPct(c.comissaoPct?.toString())}
      </span>
    ),
  },
  {
    key: "gatilhoPct",
    header: "Gatilho %",
    align: "right",
    cell: (c) => (
      <span className="numeric text-[12.5px]" style={{ color: "var(--fg)" }}>
        {fmtPct(c.gatilhoPct?.toString())}
      </span>
    ),
  },
  {
    key: "base",
    header: "Base",
    cell: (c) => (
      <StatusBadge tone={BASE_TONE[c.base] ?? "muted"}>{c.base}</StatusBadge>
    ),
  },
  {
    key: "actions",
    header: "",
    cell: (c) => (
      <CargoEditarBtn
        cargo={{
          id: c.id,
          ano: c.ano,
          cargo: c.cargo,
          comissaoPct: c.comissaoPct?.toString() ?? "0",
          gatilhoPct: c.gatilhoPct?.toString() ?? "0",
          base: c.base,
        }}
      />
    ),
  },
];

export default async function VendedoresPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userRole = session.user.role as Role;
  if (!ALLOWED_ROLES.includes(userRole)) {
    return (
      <AppShell title="Vendedores & Cargos" subtitle="Cadastro de comissões">
        <CardSection title="Acesso restrito">
          <p className="text-[13.5px]" style={{ color: "var(--fg-muted)" }}>
            Esta página é restrita a <strong>ADMIN</strong>, <strong>DIRETOR</strong> e{" "}
            <strong>CONTROLADORIA</strong>. Solicite o acesso ao administrador.
          </p>
        </CardSection>
      </AppShell>
    );
  }

  const tenantId = session.user.tenantId;
  const [vendedores, cargos] = await Promise.all([
    getVendedores(tenantId),
    getCargos(tenantId),
  ]);

  const ativos = vendedores.filter((v) => v.ativo).length;
  const anoAtual = new Date().getFullYear();
  const cargosAno = cargos.filter((c) => c.ano === anoAtual).length;

  return (
    <AppShell
      title="Vendedores & Cargos"
      subtitle={`Cadastro de regras de comissão · ${vendedores.length} vendedor${vendedores.length !== 1 ? "es" : ""}`}
    >
      <div className="space-y-6">
        {/* KPIs rápidos */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            className="rounded-xl border p-4"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border-soft)",
            }}
          >
            <div className="flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <Users className="size-4" />
              <span className="text-[11.5px] font-medium uppercase tracking-wider">Vendedores</span>
            </div>
            <p className="mt-1 text-[24px] font-semibold numeric" style={{ color: "var(--fg-strong)" }}>
              {vendedores.length}
            </p>
            <p className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>{ativos} ativo{ativos !== 1 ? "s" : ""}</p>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border-soft)",
            }}
          >
            <div className="flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <Briefcase className="size-4" />
              <span className="text-[11.5px] font-medium uppercase tracking-wider">Cargos {anoAtual}</span>
            </div>
            <p className="mt-1 text-[24px] font-semibold numeric" style={{ color: "var(--fg-strong)" }}>
              {cargosAno}
            </p>
            <p className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>{cargos.length} total (todos os anos)</p>
          </div>
        </section>

        {/* Tabela de vendedores */}
        <CardSection
          title="Vendedores"
          subtitle={`${vendedores.length} cadastrado${vendedores.length !== 1 ? "s" : ""} · ativos primeiro`}
          actions={<VendedorCriarBtn />}
        >
          <DataTable
            columns={vendedorColumns}
            rows={vendedores}
            rowKey={(v) => v.id}
            emptyMessage="Nenhum vendedor cadastrado. Clique em Novo vendedor para começar."
            sortParam="vsort"
            dirParam="vdir"
          />
        </CardSection>

        {/* Tabela de cargos */}
        <CardSection
          title="Tabela de cargos / comissões"
          subtitle={`${cargos.length} regra${cargos.length !== 1 ? "s" : ""} · ordenadas por ano desc`}
          actions={<CargoCriarBtn />}
        >
          <DataTable
            columns={cargoColumns}
            rows={cargos}
            rowKey={(c) => c.id}
            emptyMessage="Nenhuma regra de cargo cadastrada. Clique em Novo cargo para começar."
            sortParam="csort"
            dirParam="cdir"
          />
        </CardSection>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Todas as alterações são auditadas.{" "}
          <a href="/admin/logs" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Ver logs
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}
