import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import KPICard from "@/components/UI/KPICard";
import { ArrowUpRight, Boxes, ClipboardList, Receipt, Truck } from "lucide-react";

export const metadata = { title: "Dashboard — Autron Dash" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <AppShell title="Dashboard" subtitle={`Visão consolidada — @${session.user.tenantSlug}`}>
      <div className="space-y-6">
        {/* KPI strip — placeholder com dados estáticos.
            Vão receber dados reais via getEnrichedPedidos() na Fase 5. */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard
            label="Pedidos em aberto"
            value="—"
            hint="Aguardando dados reais"
            tone="brand"
            icon={<ClipboardList className="size-4" />}
          />
          <KPICard
            label="Itens em estoque"
            value="—"
            hint="Snapshot atual"
            tone="neutral"
            icon={<Boxes className="size-4" />}
          />
          <KPICard
            label="Pedidos atrasados"
            value="—"
            hint="vs DT. Fat. Cli"
            tone="danger"
            icon={<Truck className="size-4" />}
          />
          <KPICard
            label="Faturamento líquido"
            value="—"
            hint="Período selecionado"
            tone="success"
            icon={<Receipt className="size-4" />}
          />
        </section>

        {/* Status card — Fase 4 em andamento */}
        <section
          className="rounded-2xl border p-6"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border-soft)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                style={{
                  color: "var(--color-brand-700)",
                  backgroundColor:
                    "color-mix(in srgb, var(--color-brand-500) 10%, transparent)",
                  borderColor:
                    "color-mix(in srgb, var(--color-brand-500) 28%, transparent)",
                }}
              >
                <span className="size-1.5 rounded-full bg-[var(--color-brand-500)]" />
                Fase 4 — UI base em construção
              </div>
              <h2
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                Olá, {session.user.name}.
              </h2>
              <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
                Sidebar, top bar, KPIs, login e tema dark/light estão prontos. As 5 abas
                operacionais (Visão Geral, Prontidão, Previsão Entrega, Estoque, Faturamento)
                vão consumir <code className="font-mono">getEnrichedPedidos()</code> nas
                próximas fases.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NextStep
              num="5"
              title="Aba Visão Geral"
              detail="KPIs do período + pedidos por mês + status pie + por vendedor."
            />
            <NextStep
              num="6"
              title="Aba Prontidão"
              detail="Pronto p/ Fazer + ações necessárias + colorização da tabela."
            />
            <NextStep
              num="7"
              title="Aba Previsão Entrega"
              detail="Atrasados + média de atraso + top 10 + semana de entrega."
            />
            <NextStep
              num="8"
              title="Aba Estoque & SC/OP"
              detail="Disponibilidade + alocação FIFO + ERROS de cadastro."
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function NextStep({ num, title, detail }: { num: string; title: string; detail: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-3"
      style={{
        backgroundColor: "var(--surface-2)",
        borderColor: "var(--border-soft)",
      }}
    >
      <div
        className="numeric flex size-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-brand-500) 14%, transparent)",
          color: "var(--color-brand-700)",
        }}
      >
        {num}
      </div>
      <div className="min-w-0 leading-snug">
        <div
          className="flex items-center gap-1 text-[13.5px] font-medium"
          style={{ color: "var(--fg-strong)" }}
        >
          {title}
          <ArrowUpRight className="size-3.5" style={{ color: "var(--fg-subtle)" }} />
        </div>
        <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
          {detail}
        </div>
      </div>
    </div>
  );
}
