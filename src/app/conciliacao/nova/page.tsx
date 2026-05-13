import AppShell from "@/components/Layout/AppShell";
import CardSection from "@/components/UI/CardSection";
import { auth } from "@/lib/auth";
import { ROLES_CONTROLADORIA, type Role } from "@/lib/authz";
import { redirect } from "next/navigation";
import NovaConciliacaoForm from "./NovaConciliacaoForm";

export const metadata = { title: "Nova Conciliação — Autron Dash" };

/** Calcula o último dia do mês anterior em formato YYYY-MM-DD (fechamento típico). */
function ultimoDiaMesAnterior(): string {
  const hoje = new Date();
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function NovaConciliacaoPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role as Role;
  if (!ROLES_CONTROLADORIA.includes(role)) redirect("/dashboard");

  return (
    <AppShell
      title="Nova Conciliação"
      subtitle="Compara Posição de Títulos (Financeiro) × Balancete (Contábil) por NF"
    >
      <div className="mx-auto max-w-4xl">
        <CardSection
          title="Suba os 2 arquivos do Protheus"
          subtitle="O sistema vai identificar as divergências por número de NF e mostrar onde há diferença."
        >
          <NovaConciliacaoForm dataReferenciaDefault={ultimoDiaMesAnterior()} />
        </CardSection>
      </div>
    </AppShell>
  );
}
