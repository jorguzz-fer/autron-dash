"use server";

import { signOut } from "@/lib/auth";

/**
 * Server action de sign-out, exportada de arquivo dedicado pra ser passada
 * como prop pra Client Components com segurança (ex: <Sidebar onSignOut={...}>).
 *
 * Server Actions definidas inline dentro de RSCs (`async function foo() {
 * "use server"; ... }` aninhada) podem causar problemas de serialização
 * intermitentes em produção (Next 15 + Turbopack). Esta forma top-level é
 * estável e idiomática.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
