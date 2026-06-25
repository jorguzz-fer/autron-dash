/**
 * Capacidades de ação (RBAC dinâmico).
 *
 * Enquanto os "módulos" (lib/pageAccess) controlam o que aparece no MENU, as
 * capacidades controlam o que o usuário pode FAZER. Cada perfil carrega uma
 * lista de capacidades; a autorização das Server Actions / rotas usa
 * `requireCapability` (lib/authz).
 *
 * Módulo puro (sem imports server-only) — usável em Server e Client components.
 */

export type Capability =
  | "MANAGE_USERS" // administrar usuários, perfis, permissões e logs
  | "UPLOAD_DATA" // enviar planilhas (datasets gerais)
  | "EDIT_PRONTIDAO" // registrar prazo de engenharia (IND21)
  | "ACCESS_CONCILIACAO" // criar/editar/exportar conciliações
  | "ACCESS_KPI_FINANCEIRO" // ver/enviar KPI Financeiro
  | "ACCESS_COMISSOES"; // ver e gerenciar comissões

export interface CapabilityInfo {
  key: Capability;
  label: string;
  descricao: string;
}

export const CAPABILITIES: CapabilityInfo[] = [
  {
    key: "MANAGE_USERS",
    label: "Administrar usuários",
    descricao: "Criar/editar usuários, perfis, permissões e ver logs de auditoria",
  },
  {
    key: "UPLOAD_DATA",
    label: "Enviar planilhas",
    descricao: "Subir os datasets do Protheus (pedidos, faturamento, estoque, etc.)",
  },
  {
    key: "EDIT_PRONTIDAO",
    label: "Editar prontidão (IND21)",
    descricao: "Registrar prazos de engenharia dos pedidos Ergomec",
  },
  {
    key: "ACCESS_CONCILIACAO",
    label: "Conciliação Fin × Cont",
    descricao: "Criar, editar, excluir e exportar conciliações",
  },
  {
    key: "ACCESS_KPI_FINANCEIRO",
    label: "KPI Financeiro",
    descricao: "Visualizar e enviar a posição de títulos a receber",
  },
  {
    key: "ACCESS_COMISSOES",
    label: "Comissões",
    descricao: "Visualizar e gerenciar vendedores, cargos e extratos de comissão",
  },
];

export const CAPABILITY_KEYS: Capability[] = CAPABILITIES.map((c) => c.key);

const VALID = new Set<string>(CAPABILITY_KEYS);

export function isCapability(value: string): value is Capability {
  return VALID.has(value);
}

/**
 * Capacidades padrão de cada role legado. Espelha exatamente o comportamento de
 * autorização anterior (lib/authz ROLES_*). Usado como fallback quando um
 * usuário não tem perfil atribuído (perfilId nulo).
 */
export const ROLE_DEFAULT_CAPABILITIES: Record<string, Capability[]> = {
  ADMIN: [
    "MANAGE_USERS",
    "UPLOAD_DATA",
    "EDIT_PRONTIDAO",
    "ACCESS_CONCILIACAO",
    "ACCESS_KPI_FINANCEIRO",
    "ACCESS_COMISSOES",
  ],
  DIRETOR: ["UPLOAD_DATA", "EDIT_PRONTIDAO", "ACCESS_COMISSOES"],
  GERENTE: ["UPLOAD_DATA", "EDIT_PRONTIDAO"],
  OPERADOR: ["UPLOAD_DATA"],
  VIEWER: [],
  CONTROLADORIA: ["ACCESS_CONCILIACAO", "ACCESS_KPI_FINANCEIRO", "ACCESS_COMISSOES"],
};

export function getDefaultCapabilities(role: string): Capability[] {
  return ROLE_DEFAULT_CAPABILITIES[role] ?? [];
}
