import AppShell from "@/components/Layout/AppShell";
import PlaceholderPage from "@/components/UI/PlaceholderPage";
import { Receipt } from "lucide-react";

export const metadata = { title: "Faturamento — Autron Dash" };

export default function FaturamentoPage() {
  return (
    <AppShell title="Faturamento" subtitle="Notas fiscais + margem + top vendedores">
      <PlaceholderPage
        icon={Receipt}
        phaseNumber={9}
        title="Faturamento"
        description="Visão de faturamento bruto, líquido, margem e ranking de vendedores. Export Excel com audit log LGPD."
        bullets={[
          "KPIs: Faturamento Bruto, Líquido, Margem Líquida Média, Notas Fiscais",
          "Bar chart de faturamento líquido por mês (clicável)",
          "Top 10 vendedores (horizontal bar, clicável)",
          "Tabela detalhes com Razão Social, Nome Fantasia, UF, Margem por NF",
          "Export Excel com audit log (quem baixou, quando)",
        ]}
      />
    </AppShell>
  );
}
