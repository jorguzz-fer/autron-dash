import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "./Sidebar";
import SidebarProvider from "./SidebarProvider";
import TopBar from "./TopBar";
import { signOutAction } from "@/app/actions";
import { getUserAllowedModules } from "@/lib/services/users";

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
 * O SidebarProvider (client) envolve tudo pra que Sidebar e TopBar
 * compartilhem o estado "collapsed" (com persistência localStorage).
 */
export default async function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const session = await auth();
  if (!session) redirect("/login");

  // Mostra o link do Chat IA apenas quando a integração está configurada
  // (avita que o user clique e veja "ainda não disponível").
  const chatIaEnabled = !!process.env.IA_SSO_SECRET && !!process.env.IA_CHAT_URL;

  const allowedModules = await getUserAllowedModules(session.user.tenantId, session.user.id);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar
          user={{
            name: session.user.name ?? "Usuário",
            email: session.user.email ?? "",
            role: session.user.role,
            tenantSlug: session.user.tenantSlug,
            allowedModules,
          }}
          onSignOut={signOutAction}
          chatIaEnabled={chatIaEnabled}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar title={title} subtitle={subtitle} actions={actions} />
          <main className="flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
