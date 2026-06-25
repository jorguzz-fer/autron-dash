"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  Percent,
  Receipt,
  Scale,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Logo from "./Logo";
import { useSidebar } from "./SidebarProvider";
import { type ModuleKey } from "@/lib/pageAccess";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  moduleKey?: ModuleKey;
  badge?: string;
}

const NAV_PRIMARY: NavItem[] = [
  { label: "Dashboard",            href: "/dashboard",            icon: LayoutDashboard,  moduleKey: "DASHBOARD" },
  { label: "Visão Geral",          href: "/visao-geral",          icon: BarChart3,         moduleKey: "VISAO_GERAL" },
  { label: "Entrada de Pedidos",   href: "/entrada-pedidos",      icon: ClipboardList,     moduleKey: "ENTRADA_PEDIDOS" },
  { label: "Análise de Contratos", href: "/analise-contratos",    icon: FileSignature,     moduleKey: "ANALISE_CONTRATOS" },
  { label: "Prontidão",            href: "/prontidao",            icon: CheckCircle2,      moduleKey: "PRONTIDAO" },
  { label: "Previsão Entrega",     href: "/previsao-entrega",     icon: CalendarClock,     moduleKey: "PREVISAO_ENTREGA" },
  { label: "Estoque & SC/OP",      href: "/estoque",              icon: Package,           moduleKey: "ESTOQUE" },
  { label: "Faturamento",          href: "/faturamento",          icon: Receipt,           moduleKey: "FATURAMENTO" },
  { label: "Previsão Faturamento", href: "/previsao-faturamento", icon: LineChart,         moduleKey: "PREVISAO_FATURAMENTO" },
  { label: "Comparativo Ploomes",  href: "/comparativo-ploomes",  icon: GitCompareArrows,  moduleKey: "COMPARATIVO_PLOOMES" },
];

const NAV_TOOLS: NavItem[] = [
  { label: "Upload de planilhas", href: "/uploads",        icon: Upload,    moduleKey: "UPLOADS" },
  { label: "Enriquecimento CNPJ", href: "/enriquecimento", icon: Building2, moduleKey: "ENRIQUECIMENTO" },
  { label: "Chat IA",             href: "/chat-ia",        icon: Sparkles,  moduleKey: "CHAT_IA" },
];

const NAV_CONTROLADORIA: NavItem[] = [
  { label: "Conciliação Fin × Cont", href: "/conciliacao",   icon: Scale,  moduleKey: "CONCILIACAO" },
];

const NAV_KPI_FINANCEIRO: NavItem[] = [
  { label: "KPI Financeiro", href: "/kpi-financeiro", icon: Wallet, moduleKey: "KPI_FINANCEIRO" },
];

const NAV_COMISSOES: NavItem[] = [
  { label: "Visão Geral", href: "/comissoes",           icon: Percent,    moduleKey: "COMISSOES" },
  { label: "Extrato",     href: "/comissoes/extrato",   icon: ScrollText, moduleKey: "COMISSOES" },
  { label: "Vendedores",  href: "/comissoes/vendedores", icon: Users,     moduleKey: "COMISSOES" },
  { label: "Upload",      href: "/comissoes/upload",    icon: Upload,     moduleKey: "COMISSOES" },
];

const NAV_ADMIN: NavItem[] = [
  { label: "Usuários",    href: "/admin/usuarios",   icon: Users },
  { label: "Perfis",      href: "/admin/perfis",     icon: ShieldCheck },
  { label: "Permissões",  href: "/admin/permissoes", icon: SlidersHorizontal },
  { label: "Logs",        href: "/admin/logs",       icon: ScrollText },
];

interface SidebarProps {
  user: {
    name: string;
    email: string;
    role: string;
    tenantSlug: string;
    /** Módulos efetivos (já resolvidos do perfil/override no AppShell). */
    modules: string[];
    /** Capacidades efetivas do usuário. */
    capabilities: string[];
  };
  /** Server Action de sign-out (passada como prop a partir do AppShell). */
  onSignOut: () => Promise<void>;
  /** Quando false, esconde o link "Chat IA" (env vars não configuradas). */
  chatIaEnabled?: boolean;
}

export default function Sidebar({ user, onSignOut, chatIaEnabled = false }: SidebarProps) {
  const canManageUsers = user.capabilities.includes("MANAGE_USERS");
  const { collapsed } = useSidebar();

  const moduleSet = new Set(user.modules);
  function moduleVisible(key: ModuleKey): boolean {
    return moduleSet.has(key);
  }

  const navPrimaryVisible = NAV_PRIMARY.filter(
    (item) => !item.moduleKey || moduleVisible(item.moduleKey),
  );

  const navToolsVisible = NAV_TOOLS.filter((item) => {
    if (!item.moduleKey || !moduleVisible(item.moduleKey)) return false;
    if (item.moduleKey === "CHAT_IA" && !chatIaEnabled) return false;
    return true;
  });

  const showControladoria = moduleVisible("CONCILIACAO");
  const showKpiFinanceiro = moduleVisible("KPI_FINANCEIRO");
  const showComissoes = moduleVisible("COMISSOES");

  // Quando collapsed: sidebar fica completamente oculta (transição suave de largura).
  // Em telas menores que lg, segue oculta também (responsivo).
  return (
    <aside
      className={`h-screen shrink-0 flex-col sticky top-0 z-30 overflow-hidden transition-[width] duration-200 ease-out ${
        collapsed ? "w-0 lg:w-0" : "hidden w-64 lg:flex"
      }`}
      style={{
        backgroundColor: "var(--sidebar-bg)",
        borderRight: collapsed ? "0" : "1px solid var(--sidebar-border)",
      }}
    >
      {/* Header — wordmark centralizado */}
      <div
        className="flex items-center justify-center px-5 py-5"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <Logo height={34} priority />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navPrimaryVisible.length > 0 && (
          <>
            <SectionLabel>Operações</SectionLabel>
            <ul className="space-y-0.5">
              {navPrimaryVisible.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
          </>
        )}

        {navToolsVisible.length > 0 && (
          <>
            <SectionLabel className="mt-6">Ferramentas</SectionLabel>
            <ul className="space-y-0.5">
              {navToolsVisible.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
          </>
        )}

        {showControladoria && (
          <>
            <SectionLabel className="mt-6">Controladoria</SectionLabel>
            <ul className="space-y-0.5">
              {NAV_CONTROLADORIA.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
          </>
        )}

        {showKpiFinanceiro && (
          <>
            <SectionLabel className="mt-6">Financeiro</SectionLabel>
            <ul className="space-y-0.5">
              {NAV_KPI_FINANCEIRO.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
          </>
        )}

        {showComissoes && (
          <>
            <SectionLabel className="mt-6">Comissões</SectionLabel>
            <ul className="space-y-0.5">
              {NAV_COMISSOES.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
          </>
        )}

        {canManageUsers && (
          <>
            <SectionLabel className="mt-6">Administração</SectionLabel>
            <ul className="space-y-0.5">
              {NAV_ADMIN.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* User block + signout (form action — padrão idiomático Next 15) */}
      <div className="px-3 py-3" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div
            className="flex size-9 items-center justify-center rounded-full text-[12px] font-semibold text-[color:var(--sidebar-fg-strong)]"
            style={{ backgroundColor: "rgb(0 157 164 / 0.22)" }}
          >
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[12.5px] font-medium text-[color:var(--sidebar-fg-strong)] truncate">
              {user.name}
            </div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--sidebar-fg)]">
              <span
                className="inline-block size-1 rounded-full"
                style={{ backgroundColor: "#10b981" }}
              />
              {user.role}
            </div>
          </div>
          <form action={onSignOut}>
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="ring-focus flex size-8 items-center justify-center rounded-md text-[color:var(--sidebar-fg)] transition-colors hover:bg-[color:var(--sidebar-elev)] hover:text-[color:var(--sidebar-fg-strong)]"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname?.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className="group ring-focus relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors"
        style={{
          color: active ? "var(--sidebar-active-fg)" : "var(--sidebar-fg)",
          backgroundColor: active ? "var(--sidebar-active-bg)" : "transparent",
        }}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ backgroundColor: "var(--sidebar-active-bar)" }}
          />
        )}
        <Icon
          className="size-[17px] shrink-0 transition-colors"
          style={{ color: active ? "var(--sidebar-active-fg)" : undefined }}
        />
        <span className="flex-1 truncate font-medium">{item.label}</span>
        {item.badge && (
          <span
            className="rounded px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wider"
            style={{ color: "var(--sidebar-fg)", backgroundColor: "rgb(255 255 255 / 0.04)" }}
          >
            {item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] ${className}`}
      style={{ color: "var(--sidebar-fg)" }}
    >
      {children}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
