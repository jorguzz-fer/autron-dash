import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import Logo from "@/components/Layout/Logo";
import MudarSenhaForm from "./MudarSenhaForm";

export const metadata = { title: "Criar nova senha — Autron Dash" };

export default async function MudarSenhaPage() {
  const session = await auth();

  // Não autenticado → login
  if (!session) redirect("/login");

  // Já trocou a senha → dashboard
  if (!session.user.mustChangePassword) redirect("/dashboard");

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <Logo height={32} priority />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-6 shadow-sm"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border-soft)",
          }}
        >
          {/* Header */}
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div
              className="flex size-12 items-center justify-center rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)",
              }}
            >
              <ShieldAlert className="size-6" style={{ color: "var(--color-brand-500)" }} />
            </div>
            <div>
              <h1
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                Criar nova senha
              </h1>
              <p className="mt-1 text-[13px]" style={{ color: "var(--fg-muted)" }}>
                Por segurança, defina uma senha pessoal antes de continuar.
              </p>
            </div>
          </div>

          <MudarSenhaForm />
        </div>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Após salvar, você será redirecionado ao login com a nova senha.
        </p>
      </div>
    </main>
  );
}
