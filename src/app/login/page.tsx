import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { Lock } from "lucide-react";
import Logo from "@/components/Layout/Logo";

export const metadata = {
  title: "Entrar — Autron Dash",
};

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* ── Brand panel (left) — tudo centralizado vertical e horizontalmente ── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12 text-white">
        {/* Background: deep brand gradient + grid sutil + halo difuso */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, #1d4ed8 0%, #0c1e44 48%, #050817 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/4 size-[520px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 60%)" }}
        />

        <div className="relative flex max-w-md flex-col items-center text-center">
          {/* Logo grande no centro */}
          <Logo height={64} priority />

          {/* Pill */}
          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Operações em tempo real
          </div>

          {/* Tagline */}
          <h1 className="mt-5 text-[34px] font-semibold leading-[1.1] tracking-tight">
            Pedidos, follow-up, estoque e faturamento{" "}
            <span className="text-brand-300">em uma tela só.</span>
          </h1>

          {/* Description */}
          <p className="mt-4 max-w-sm text-[14.5px] leading-relaxed text-white/65">
            Visão de prontidão de produção em tempo real, com alocação automática de
            estoque por prioridade e detecção de erros de cadastro.
          </p>

          {/* Stats */}
          <div className="mt-10 grid w-full grid-cols-3 gap-2.5">
            {[
              { v: "5.4k", l: "Pedidos" },
              { v: "4.2k", l: "Em estoque" },
              { v: "6.1k", l: "NFs" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5 text-left"
              >
                <div className="numeric text-[22px] font-semibold leading-none text-white">
                  {s.v}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-white/55">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Form panel (right) ─────────────────────────────────────────── */}
      <section
        className="flex items-center justify-center p-6 sm:p-12"
        style={{ backgroundColor: "var(--canvas)" }}
      >
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo (só aparece quando o painel esquerdo está oculto) */}
          <div className="flex justify-center lg:hidden">
            <Logo height={28} priority />
          </div>

          <div className="space-y-1.5">
            <h2
              className="text-[24px] font-semibold tracking-tight"
              style={{ color: "var(--fg-strong)" }}
            >
              Bem-vindo de volta
            </h2>
            <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
              Entre com suas credenciais para acessar o painel.
            </p>
          </div>

          <LoginForm />

          <div
            className="flex items-center justify-center gap-1.5 text-[11px]"
            style={{ color: "var(--fg-subtle)" }}
          >
            <Lock className="size-3" />
            Conexão segura — dados criptografados
          </div>

          <p className="text-center text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
            Ao entrar, você concorda com nossa{" "}
            <a
              href="/privacidade"
              className="underline underline-offset-4 transition-colors hover:text-[color:var(--fg)]"
            >
              política de privacidade
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
