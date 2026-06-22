import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Logo from "@/components/Layout/Logo";
import { countUnusedBackupCodes } from "@/lib/services/mfa";
import VerificarMfaForm from "./VerificarMfaForm";

export const metadata = { title: "Verificação em duas etapas — Autron Dash" };
export const dynamic = "force-dynamic";

export default async function VerificarMfaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/mudar-senha");
  if (!session.user.mfaEnabled) redirect("/mfa/configurar");
  if (session.user.mfaVerified) redirect("/dashboard");

  const remainingBackup = await countUnusedBackupCodes(session.user.id);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <Logo height={32} priority />
        </div>

        <div
          className="rounded-2xl border p-6 shadow-sm"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-soft)" }}
        >
          <VerificarMfaForm remainingBackup={remainingBackup} />
        </div>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          Abra seu app autenticador para ver o código atual.
        </p>
      </div>
    </main>
  );
}
