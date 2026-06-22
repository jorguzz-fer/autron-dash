import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Logo from "@/components/Layout/Logo";
import { startMfaSetup } from "@/lib/services/mfa";
import { qrSvg } from "@/lib/qr";
import ConfigurarMfaForm from "./ConfigurarMfaForm";

export const metadata = { title: "Configurar verificação em duas etapas — Autron Dash" };
export const dynamic = "force-dynamic";

const ISSUER = "Autron Dash";

export default async function ConfigurarMfaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/mudar-senha");
  // Já configurado e verificado → não faz sentido reconfigurar aqui.
  if (session.user.mfaEnabled && session.user.mfaVerified) redirect("/dashboard");

  // Gera (ou regenera) o segredo pendente e monta o QR no servidor — o
  // otpauth:// URI carrega o segredo e nunca sai do nosso backend.
  const setup = await startMfaSetup({
    userId: session.user.id,
    account: session.user.email ?? session.user.id,
    issuer: ISSUER,
  });
  const svg = qrSvg(setup.otpauthUri, { scale: 1, border: 2 });

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ backgroundColor: "var(--canvas)" }}
    >
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo height={32} priority />
        </div>

        <div
          className="rounded-2xl border p-6 shadow-sm"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-soft)" }}
        >
          <ConfigurarMfaForm
            qrSvg={svg}
            secretFormatted={setup.secretFormatted}
            otpauthUri={setup.otpauthUri}
          />
        </div>

        <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
          A verificação em duas etapas é obrigatória para acessar o painel.
        </p>
      </div>
    </main>
  );
}
