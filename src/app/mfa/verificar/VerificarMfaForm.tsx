"use client";

import { useState, useTransition, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { verificarCodigo } from "./actions";

export default function VerificarMfaForm({ remainingBackup }: { remainingBackup: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "");
    startTransition(async () => {
      const r = await verificarCodigo({ code });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Navegação "hard": garante que o cookie de sessão recém-atualizado
      // (mfaVerified) seja enviado ao middleware na próxima requisição.
      // Um router.push (soft) pode correr antes do cookie ser aplicado.
      window.location.assign("/dashboard");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)" }}
        >
          <ShieldCheck className="size-6" style={{ color: "var(--color-brand-500)" }} />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Verificação em duas etapas
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--fg-muted)" }}>
            {useBackup
              ? "Digite um dos seus códigos de recuperação."
              : "Digite o código de 6 dígitos do seu app autenticador."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          id="code"
          name="code"
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={useBackup ? 9 : 6}
          required
          autoFocus
          placeholder={useBackup ? "XXXX-XXXX" : "000000"}
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 text-center font-mono text-[18px] tracking-[0.3em] text-[color:var(--fg-strong)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[color:var(--color-brand-500)]/20"
          style={{ borderColor: "var(--border-strong)" }}
        />

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]"
            style={{
              color: "#e11d48",
              backgroundColor: "color-mix(in srgb, #e11d48 8%, transparent)",
              borderColor: "color-mix(in srgb, #e11d48 28%, transparent)",
            }}
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--color-brand-600)" }}
        >
          {pending ? "Verificando…" : "Verificar"}
        </button>
      </form>

      <div className="flex flex-col items-center gap-2 text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setUseBackup((v) => !v);
          }}
          className="underline underline-offset-4 transition-colors hover:text-[color:var(--fg)]"
        >
          {useBackup
            ? "Usar código do app autenticador"
            : `Usar código de recuperação${remainingBackup > 0 ? ` (${remainingBackup} restantes)` : ""}`}
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="transition-colors hover:text-[color:var(--fg)]"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
