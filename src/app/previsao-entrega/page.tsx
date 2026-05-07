import AppShell from "@/components/Layout/AppShell";
import PlaceholderPage from "@/components/UI/PlaceholderPage";
import { CalendarClock } from "lucide-react";

export const metadata = { title: "Previsão Entrega — Autron Dash" };

export default function PrevisaoEntregaPage() {
  return (
    <AppShell title="Previsão Entrega" subtitle="Atrasos vs cliente + semana de entrega">
      <PlaceholderPage
        icon={CalendarClock}
        phaseNumber={7}
        title="Previsão de entrega"
        description="Tracking de atrasos: quantos dias cada pedido está atrasado em relação à data solicitada pelo cliente (DT. Fat. Cli)."
        bullets={[
          "KPIs clicáveis: Atrasados, No Prazo, Sem Data, Média de Atraso",
          "Bar chart de pedidos por semana de entrega (clicável)",
          "Top 10 pedidos mais atrasados (horizontal bar)",
          "Tabela com Dias de Atraso colorido (vermelho >30d, amarelo 0-30d, verde <0)",
        ]}
      />
    </AppShell>
  );
}
