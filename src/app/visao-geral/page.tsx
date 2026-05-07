import AppShell from "@/components/Layout/AppShell";
import PlaceholderPage from "@/components/UI/PlaceholderPage";
import { BarChart3 } from "lucide-react";

export const metadata = { title: "Visão Geral — Autron Dash" };

export default function VisaoGeralPage() {
  return (
    <AppShell title="Visão Geral" subtitle="KPIs do período + entrada de pedidos por mês">
      <PlaceholderPage
        icon={BarChart3}
        phaseNumber={5}
        title="Visão Geral"
        description="Dashboard executivo — status macro de todos os pedidos, com filtro global por período."
        bullets={[
          "KPIs: Total PVs, Linhas, Em Aberto, Finalizados, Valor Em Aberto, % Conclusão",
          "Gráfico de pedidos por mês (barras, clicável)",
          "Pie chart de status (FINALIZADO vs EM ABERTO, clicável)",
          "Pedidos por vendedor (stacked bar, clicável → filtra a tabela)",
        ]}
      />
    </AppShell>
  );
}
