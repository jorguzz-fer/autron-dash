import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import Image from "next/image";
import { Lock } from "lucide-react";

export const metadata = {
  title: "Entrar — Autron Dash",
};

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* ── Brand panel (left) ─────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 text-white">
        {/* Background: deep brand gradient + grid + soft halo */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 18%, #1d4ed8 0%, #0c1e44 42%, #050817 100%)",
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
              "radial-gradient(ellipse at 30% 30%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -right-40 -top-40 size-[480px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, #3b82f6 0%, transparent 60%)",
          }}
        />

        {/* Header */}
        <div className="relative flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Autron"
            width={48}
            height={48}
            className="rounded-xl"
            priority
          />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Autron Dash</div>
            <div className="text-[11px] text-white/55">Painel de gestão</div>
          </div>
        </div>

        {/* Pitch */}
        <div className="relative max-w-md">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Operações em tempo real
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight">
            Pedidos, follow-up, estoque e faturamento{" "}
            <span className="text-brand-300">em uma tela só.</span>
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-white/65">
            Visão de prontidão de produção em tempo real, com alocação automática de
            estoque por prioridade e detecção de erros de cadastro.
          </p>
        </div>

        {/* Stats strip */}
        <div className="relative grid max-w-md grid-cols-3 gap-2.5">
          {[
            { v: "5.4k", l: "Pedidos" },
            { v: "4.2k", l: "Em estoque" },
            { v: "6.1k", l: "NFs" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5"
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
      </aside>

      {/* ── Form panel (right) ─────────────────────────────────────────── */}
      <section
        className="flex items-center justify-center p-6 sm:p-12"
        style={{ backgroundColor: "var(--canvas)" }}
      >
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              src="/logo.png"
              alt="Autron"
              width={36}
              height={36}
              className="rounded-lg"
              priority
            />
            <div className="text-[14px] font-semibold tracking-tight">Autron Dash</div>
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

          <div className="flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
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
