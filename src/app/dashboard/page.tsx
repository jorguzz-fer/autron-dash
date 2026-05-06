import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Dashboard — Autron Dash",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen px-6 py-10 bg-slate-950">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
            <p className="text-sm text-slate-400">
              Olá, {session.user.name} —{" "}
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
                {session.user.role}
              </span>
              <span className="ml-2 text-slate-500">@ {session.user.tenantSlug}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/uploads"
              className="px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-sm border border-blue-500/20 transition"
            >
              Upload de planilhas
            </a>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm border border-slate-700 transition"
              >
                Sair
              </button>
            </form>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20 mb-4">
            <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
            Fase 1 concluída — auth + multi-tenant + LGPD
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Próximas fases</h2>
          <ul className="text-sm text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Fase 2: schema dos 5 datasets + upload de planilhas</li>
            <li>Fase 3: regras de negócio (alocação FIFO, prontidão, ação) em TS + testes</li>
            <li>Fase 4: UI Trezo + filtro global de data + componentes reutilizáveis</li>
            <li>Fases 5–9: as 5 abas (Visão Geral, Prontidão, Entrega, Estoque, Faturamento)</li>
            <li>Fase 10: code review de segurança + Coolify deploy</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
