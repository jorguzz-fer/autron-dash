/**
 * Controle de acesso por módulo do dashboard.
 *
 * Cada usuário pode ter uma whitelist explícita (allowedModules).
 * Quando vazia, o acesso é determinado pelo padrão do perfil (role).
 * Módulo puro (sem imports server-only) — usável em Server e Client components.
 */

export type ModuleKey =
  | "DASHBOARD"
  | "VISAO_GERAL"
  | "ENTRADA_PEDIDOS"
  | "ANALISE_CONTRATOS"
  | "PRONTIDAO"
  | "PREVISAO_ENTREGA"
  | "ESTOQUE"
  | "FATURAMENTO"
  | "PREVISAO_FATURAMENTO"
  | "COMPARATIVO_PLOOMES"
  | "UPLOADS"
  | "ENRIQUECIMENTO"
  | "CHAT_IA"
  | "CONCILIACAO"
  | "KPI_FINANCEIRO"
  | "COMISSOES";

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  href: string;
  section: string;
}

export const MODULES: ModuleInfo[] = [
  { key: "DASHBOARD",            label: "Dashboard",              href: "/dashboard",            section: "Operações" },
  { key: "VISAO_GERAL",          label: "Visão Geral",            href: "/visao-geral",          section: "Operações" },
  { key: "ENTRADA_PEDIDOS",      label: "Entrada de Pedidos",     href: "/entrada-pedidos",      section: "Operações" },
  { key: "ANALISE_CONTRATOS",    label: "Análise de Contratos",   href: "/analise-contratos",    section: "Operações" },
  { key: "PRONTIDAO",            label: "Prontidão",              href: "/prontidao",            section: "Operações" },
  { key: "PREVISAO_ENTREGA",     label: "Previsão de Entrega",    href: "/previsao-entrega",     section: "Operações" },
  { key: "ESTOQUE",              label: "Estoque & SC/OP",        href: "/estoque",              section: "Operações" },
  { key: "FATURAMENTO",          label: "Faturamento",            href: "/faturamento",          section: "Operações" },
  { key: "PREVISAO_FATURAMENTO", label: "Previsão Faturamento",   href: "/previsao-faturamento", section: "Operações" },
  { key: "COMPARATIVO_PLOOMES",  label: "Comparativo Ploomes",    href: "/comparativo-ploomes",  section: "Operações" },
  { key: "UPLOADS",              label: "Upload de planilhas",    href: "/uploads",              section: "Ferramentas" },
  { key: "ENRIQUECIMENTO",       label: "Enriquecimento CNPJ",    href: "/enriquecimento",       section: "Ferramentas" },
  { key: "CHAT_IA",              label: "Chat IA",                href: "/chat-ia",              section: "Ferramentas" },
  { key: "CONCILIACAO",          label: "Conciliação Fin × Cont", href: "/conciliacao",          section: "Controladoria" },
  { key: "KPI_FINANCEIRO",       label: "KPI Financeiro",         href: "/kpi-financeiro",       section: "Financeiro" },
  { key: "COMISSOES",            label: "Comissões",              href: "/comissoes",            section: "Comissões" },
];

export const HREF_TO_MODULE: Record<string, ModuleKey> = Object.fromEntries(
  MODULES.map((m) => [m.href, m.key]),
);

export const MODULE_SECTIONS = [...new Set(MODULES.map((m) => m.section))];

// Módulos padrão por perfil (quando allowedModules está vazio)
const ROLE_DEFAULT_MODULES: Record<string, ModuleKey[]> = {
  ADMIN: [
    "DASHBOARD", "VISAO_GERAL", "ENTRADA_PEDIDOS", "ANALISE_CONTRATOS",
    "PRONTIDAO", "PREVISAO_ENTREGA", "ESTOQUE", "FATURAMENTO",
    "PREVISAO_FATURAMENTO", "COMPARATIVO_PLOOMES",
    "UPLOADS", "ENRIQUECIMENTO", "CHAT_IA", "CONCILIACAO", "KPI_FINANCEIRO", "COMISSOES",
  ],
  DIRETOR: [
    "DASHBOARD", "VISAO_GERAL", "ENTRADA_PEDIDOS", "ANALISE_CONTRATOS",
    "PRONTIDAO", "PREVISAO_ENTREGA", "ESTOQUE", "FATURAMENTO",
    "PREVISAO_FATURAMENTO", "COMPARATIVO_PLOOMES",
  ],
  GERENTE: [
    "DASHBOARD", "VISAO_GERAL", "ENTRADA_PEDIDOS", "ANALISE_CONTRATOS",
    "PRONTIDAO", "PREVISAO_ENTREGA", "ESTOQUE", "FATURAMENTO",
    "PREVISAO_FATURAMENTO", "COMPARATIVO_PLOOMES", "UPLOADS",
  ],
  OPERADOR: [
    "DASHBOARD", "VISAO_GERAL", "ENTRADA_PEDIDOS", "ANALISE_CONTRATOS",
    "PRONTIDAO", "PREVISAO_ENTREGA", "ESTOQUE", "FATURAMENTO",
    "PREVISAO_FATURAMENTO", "COMPARATIVO_PLOOMES", "UPLOADS",
  ],
  VIEWER: [
    "DASHBOARD", "VISAO_GERAL", "ENTRADA_PEDIDOS", "ANALISE_CONTRATOS",
    "PRONTIDAO", "PREVISAO_ENTREGA", "ESTOQUE", "FATURAMENTO",
    "PREVISAO_FATURAMENTO", "COMPARATIVO_PLOOMES",
  ],
  CONTROLADORIA: [
    "DASHBOARD", "VISAO_GERAL", "CONCILIACAO", "KPI_FINANCEIRO",
  ],
};

export function getDefaultModules(role: string): ModuleKey[] {
  return (ROLE_DEFAULT_MODULES[role] ?? ["DASHBOARD"]) as ModuleKey[];
}

// Enriquecimento é um módulo restrito: por perfil, só ADMIN o vê (via
// ROLE_DEFAULT_MODULES). Além disso, liberamos para e-mails específicos abaixo —
// independentemente do perfil ou da whitelist (allowedModules) do usuário.
const ENRIQUECIMENTO_ALLOWED_EMAILS = new Set(["spereira@autron.com.br"]);

export type ModuleAccessUser = {
  role: string;
  allowedModules: string[];
  email?: string | null;
};

export function getEffectiveModules(user: ModuleAccessUser): ModuleKey[] {
  const base: ModuleKey[] =
    user.allowedModules.length > 0
      ? (user.allowedModules as ModuleKey[])
      : getDefaultModules(user.role);

  const email = user.email?.trim().toLowerCase();
  if (email && ENRIQUECIMENTO_ALLOWED_EMAILS.has(email) && !base.includes("ENRIQUECIMENTO")) {
    return [...base, "ENRIQUECIMENTO"];
  }
  return base;
}

export function canAccessModule(user: ModuleAccessUser, moduleKey: ModuleKey): boolean {
  return getEffectiveModules(user).includes(moduleKey);
}
