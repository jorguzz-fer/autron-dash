import AppShell from "@/components/Layout/AppShell";
import PlaceholderPage from "@/components/UI/PlaceholderPage";
import { Package } from "lucide-react";

export const metadata = { title: "Estoque & SC/OP — Autron Dash" };

export default function EstoquePage() {
  return (
    <AppShell title="Estoque & SC/OP" subtitle="Disponibilidade + alocação FIFO + erros de cadastro">
      <PlaceholderPage
        icon={Package}
        phaseNumber={8}
        title="Estoque & SC/OP"
        description="Gestão de estoque alocado por prioridade FIFO + rastreamento de Solicitações de Compra e Ordens de Produção."
        bullets={[
          "KPIs clicáveis: Com Estoque, Estoque Parcial, Sem Estoque, Necessitam SC, Necessitam OP",
          "Pie chart de disponibilidade de estoque",
          "Bar chart de ações necessárias",
          "Alerta especial: ERROS DE CADASTRO (Comprando que possui OP)",
        ]}
      />
    </AppShell>
  );
}
