import AppShell from "@/components/Layout/AppShell";
import PlaceholderPage from "@/components/UI/PlaceholderPage";
import { CheckCircle2 } from "lucide-react";

export const metadata = { title: "Prontidão — Autron Dash" };

export default function ProntidaoPage() {
  return (
    <AppShell title="Prontidão" subtitle="Pronto para fazer? Análise estoque + follow-up">
      <PlaceholderPage
        icon={CheckCircle2}
        phaseNumber={6}
        title="Prontidão de produção"
        description="Quais itens estão prontos para serem fabricados/entregues. KPIs clicáveis filtram a tabela detalhada."
        bullets={[
          "KPIs clicáveis: Prontos, Parcialmente Prontos, Não Prontos, ERROS Cadastro",
          "Pie chart Pronto p/ Fazer (SIM/PARCIAL/NAO, clicável)",
          "Bar chart Comprando vs Produzindo (clicável)",
          "Tabela com colorização por status, ação necessária, prazo de entrega",
        ]}
      />
    </AppShell>
  );
}
