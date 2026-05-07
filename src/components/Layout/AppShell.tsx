import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface AppShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Casca do app autenticado: sidebar + topbar + conteúdo.
 * Server component — checa sessão e propaga dados do usuário pro Sidebar.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────────┐
 *   │              │  TopBar (sticky)                 │
 *   │   Sidebar    ├──────────────────────────────────┤
 *   │  (sempre     │                                  │
 *   │   dark)      │   Conteúdo (theme: dark/light)   │
 *   │              │                                  │
 *   └──────────────┴──────────────────────────────────┘
 */
export default async function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const session = await auth();
  if (!session) redirect("/login");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: session.user.name ?? "Usuário",
          email: session.user.email ?? "",
          role: session.user.role,
          tenantSlug: session.user.tenantSlug,
        }}
        onSignOut={handleSignOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} subtitle={subtitle} actions={actions} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
