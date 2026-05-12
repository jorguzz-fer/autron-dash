"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  Receipt,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import Logo from "./Logo";
import { useSidebar } from "./SidebarProvider";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

const NAV_PRIMARY: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Visão Geral", href: "/visao-geral", icon: BarChart3 },
  { label: "Entrada de Pedidos", href: "/entrada-pedidos", icon: ClipboardList },
  { label: "Prontidão", href: "/prontidao", icon: CheckCircle2 },
  { label: "Previsão Entrega", href: "/previsao-entrega", icon: CalendarClock },
  { label: "Estoque & SC/OP", href: "/estoque", icon: Package },
  { label: "Faturamento", href: "/faturamento", icon: Receipt },
  { label: "Previsão Faturamento", href: "/previsao-faturamento", icon: LineChart },
  { label: "Comparativo Ploomes", href: "/comparativo-ploomes", icon: GitCompareArrows },
];

const NAV_TOOLS: NavItem[] = [
  { label: "Upload de planilhas", href: "/uploads", icon: Upload },
];

const NAV_ADMIN: NavItem[] = [
  { label: "Usuários", href: "/admin/usuarios", icon: Users },
];

interface SidebarProps {
  user: {
    name: string;
    email: string;
    role: string;
    tenantSlug: string;
  };
  /** Server Action de sign-out (passada como prop a partir do AppShell). */
  onSignOut: () => Promise<void>;
}

export default function Sidebar({ user, onSignOut }: SidebarProps) {
  const isAdmin = user.role === "ADMIN";
  const { collapsed } = useSidebar();
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
        <SectionLabel>Operações</SectionLabel>
        <ul className="space-y-0.5">
          {NAV_PRIMARY.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </ul>

        <SectionLabel className="mt-6">Ferramentas</SectionLabel>
        <ul className="space-y-0.5">
          {NAV_TOOLS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </ul>

        {isAdmin && (
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
