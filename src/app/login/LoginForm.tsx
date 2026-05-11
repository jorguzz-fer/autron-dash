"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import PasswordInput from "@/components/UI/PasswordInput";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordChanged = searchParams.get("changed") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);
    if (res?.error || !res?.ok) {
      setError("Credenciais inválidas, conta inativa ou limite de tentativas atingido.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-[12.5px] font-medium"
          style={{ color: "var(--fg)" }}
        >
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[color:var(--fg-strong)] placeholder:text-[color:var(--fg-subtle)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[color:var(--color-brand-500)]/20"
          style={{ borderColor: "var(--border-strong)" }}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="password"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--fg)" }}
          >
            Senha
          </label>
          <span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            Min. 10 caracteres
          </span>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
        />
      </div>

      {passwordChanged && !error && (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]"
          style={{
            color: "#10b981",
            backgroundColor: "color-mix(in srgb, #10b981 8%, transparent)",
            borderColor: "color-mix(in srgb, #10b981 28%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0 mt-px" />
          <span>Senha atualizada com sucesso. Entre com a nova senha.</span>
        </div>
      )}

      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]"
          style={{
            color: "#e11d48",
            backgroundColor: "color-mix(in srgb, #e11d48 8%, transparent)",
            borderColor: "color-mix(in srgb, #e11d48 28%, transparent)",
          }}
        >
          <AlertCircle className="size-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="ring-focus group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[var(--color-brand-600)] px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Entrando..." : "Entrar"}
        {!submitting && (
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
    </form>
  );
}
