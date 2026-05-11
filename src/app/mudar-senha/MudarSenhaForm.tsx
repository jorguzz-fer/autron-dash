"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { alterarSenhaPropria } from "./actions";

export default function MudarSenhaForm() {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");

    startTransition(async () => {
      const r = await alterarSenhaPropria({ password, confirm });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
      // Aguarda 1.5s para o usuário ler a confirmação, depois encerra a sessão
      setTimeout(() => {
        signOut({ callbackUrl: "/login?changed=1" });
      }, 1500);
    });
  }

  if (done) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border px-6 py-8 text-center"
        style={{
          backgroundColor: "color-mix(in srgb, #10b981 8%, transparent)",
          borderColor: "color-mix(in srgb, #10b981 28%, transparent)",
        }}
      >
        <CheckCircle2 className="size-8" style={{ color: "#10b981" }} />
        <p className="text-[14px] font-medium" style={{ color: "#10b981" }}>
          Senha atualizada! Redirecionando para o login…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PwdField
        id="password"
        name="password"
        label="Nova senha"
        show={showPwd}
        onToggle={() => setShowPwd((v) => !v)}
        autoComplete="new-password"
        hint="Mín. 10 caracteres, 3 classes (maiúscula, minúscula, número, símbolo)"
      />

      <PwdField
        id="confirm"
        name="confirm"
        label="Confirmar nova senha"
        show={showConfirm}
        onToggle={() => setShowConfirm((v) => !v)}
        autoComplete="new-password"
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
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}

function PwdField({
  id,
  name,
  label,
  show,
  onToggle,
  autoComplete,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[12.5px] font-medium" style={{ color: "var(--fg)" }}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={10}
          autoComplete={autoComplete}
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 pr-10 text-[14px] text-[color:var(--fg-strong)] placeholder:text-[color:var(--fg-subtle)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[color:var(--color-brand-500)]/20"
          style={{ borderColor: "var(--border-strong)" }}
          placeholder="••••••••••"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors"
          style={{ color: "var(--fg-subtle)" }}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint && (
        <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
