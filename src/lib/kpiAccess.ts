/**
 * Controle de acesso da seção KPI Financeiro.
 *
 * Regra de negócio (Autron/Controladoria): a seção é visível APENAS para
 * usuários ADMIN e para a Daiana (Controladoria — controladoria@autron.com.br).
 * Módulo puro (sem imports server-only) pra ser usado tanto no Sidebar (client)
 * quanto nas páginas/rotas (server).
 */
export const KPI_FINANCEIRO_EMAIL = "controladoria@autron.com.br";

export function canSeeKpiFinanceiro(
  user: { role?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return (user.email ?? "").trim().toLowerCase() === KPI_FINANCEIRO_EMAIL;
}
