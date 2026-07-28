import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRegioes } from "@/lib/services/regiaoVendas";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import {
  RegiaoCriarBtn,
  RegiaoEditarBtn,
  RegiaoExcluirBtn,
  type VendedorOption,
  type RegiaoData,
} from "./RegiaoBtns";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Regiões & Carteiras — Autron Dash" };

type RegiaoRow = Awaited<ReturnType<typeof getRegioes>>[number];

function columns(vendedores: VendedorOption[], nomePorCodigo: Map<string, string>): Column<RegiaoRow>[] {
  return [
    {
      key: "nome",
      header: "Região",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: r.cor ?? "var(--color-brand-500)" }}
          />
          <span className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>
            {r.nome}
          </span>
        </div>
      ),
    },
    {
      key: "vendedor",
      header: "Vendedor",
      cell: (r) => (
        <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {r.vendedorCodigo
            ? nomePorCodigo.get(r.vendedorCodigo) ?? r.vendedorCodigo
            : r.nomeVendedor ?? "—"}
        </span>
      ),
    },
    {
      key: "ufs",
      header: "UFs",
      cell: (r) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>
          {r.ufs.length ? r.ufs.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "municipios",
      header: "Municípios",
      align: "right",
      cell: (r) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {r.municipios.length}
        </span>
      ),
    },
    {
      key: "ordem",
      header: "Ordem",
      align: "center",
      cell: (r) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-muted)" }}>{r.ordem}</span>
      ),
    },
    {
      key: "ativo",
      header: "Status",
      cell: (r) =>
        r.ativo ? <StatusBadge tone="success">Ativa</StatusBadge> : <StatusBadge tone="muted">Inativa</StatusBadge>,
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <RegiaoEditarBtn
            vendedores={vendedores}
            regiao={{
              id: r.id,
              nome: r.nome,
              descricao: r.descricao,
              cor: r.cor,
              vendedorCodigo: r.vendedorCodigo,
              nomeVendedor: r.nomeVendedor,
              ufs: r.ufs,
              municipios: r.municipios,
              ordem: r.ordem,
              ativo: r.ativo,
            } satisfies RegiaoData}
          />
          <RegiaoExcluirBtn id={r.id} nome={r.nome} />
        </div>
      ),
    },
  ];
}

export default async function RegioesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const tenantId = session.user.tenantId;

  const [regioes, vendedoresDb] = await Promise.all([
    getRegioes(tenantId),
    prisma.comissaoVendedor.findMany({
      where: { tenantId, ativo: true },
      select: { codigoProtheus: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const vendedores: VendedorOption[] = vendedoresDb.map((v) => ({
    codigoProtheus: v.codigoProtheus,
    nome: v.nome,
  }));
  const nomePorCodigo = new Map(vendedores.map((v) => [v.codigoProtheus, v.nome]));

  return (
    <AppShell
      title="Regiões & Carteiras"
      subtitle={`${regioes.length} região${regioes.length !== 1 ? "ões" : ""} configurada${regioes.length !== 1 ? "s" : ""}`}
    >
      <div className="space-y-5">
        <Link
          href="/analise-regional"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          style={{ color: "var(--fg-muted)" }}
        >
          <ArrowLeft className="size-3.5" />
          Voltar para a análise
        </Link>

        <CardSection
          title="Territórios"
          subtitle="Monte cada região com UFs e/ou municípios; atribua um vendedor para simular carteiras (ex.: uma 3ª pessoa para o Vale)."
          actions={<RegiaoCriarBtn vendedores={vendedores} />}
        >
          <DataTable
            columns={columns(vendedores, nomePorCodigo)}
            rows={regioes}
            rowKey={(r) => r.id}
            emptyMessage="Nenhuma região configurada. Clique em Nova região para começar (ex.: Litoral SP = Santos/SP, Guarujá/SP)."
          />
        </CardSection>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Um município listado numa região vence a UF — dá para recortar SP e cruzar estados (Vale do
          Paraíba + Volta Redonda/RJ). Todas as alterações são auditadas.
        </p>
      </div>
    </AppShell>
  );
}
