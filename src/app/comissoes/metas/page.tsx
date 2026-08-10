import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/services/perfis";
import { getMetasGrid } from "@/lib/services/metasComissao";
import MetasGrid from "./MetasGrid";

export const metadata = { title: "Metas de Comissão — Autron Dash" };

interface SP {
  ano?: string;
}

export default async function MetasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("ACCESS_COMISSOES")) redirect("/dashboard");

  const sp = await searchParams;
  const anoAtual = new Date().getFullYear();
  const ano = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : anoAtual;

  const rows = await getMetasGrid(session.user.tenantId, ano);
  const anosOpts = [anoAtual - 1, anoAtual, anoAtual + 1];

  return (
    <AppShell
      title="Metas de Comissão"
      subtitle="Metas mensais por vendedor · edite direto na grade ou importe a planilha do RH"
    >
      <MetasGrid ano={ano} anosOpts={anosOpts} rows={rows} />
    </AppShell>
  );
}
