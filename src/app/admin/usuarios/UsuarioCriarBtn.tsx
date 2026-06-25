"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { criarUsuario } from "./actions";

export interface PerfilOption {
  id: string;
  label: string;
}

export default function UsuarioCriarBtn({ perfis }: { perfis: PerfilOption[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      perfilId: String(fd.get("perfilId") ?? ""),
      password: String(fd.get("password") ?? ""),
    };

    startTransition(async () => {
      const result = await criarUsuario(input);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(`Usuário ${input.name} criado.`);
        (e.target as HTMLFormElement).reset();
        // Fecha após 800ms pro usuário ver a confirmação
        setTimeout(() => {
          dialogRef.current?.close();
          setSuccess(null);
        }, 800);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSuccess(null);
          dialogRef.current?.showModal();
        }}
        className="ring-focus inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:opacity-90"
        style={{
          backgroundColor: "var(--color-brand-500)",
          color: "#fff",
        }}
      >
        <UserPlus className="size-3.5" />
        Novo usuário
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={{
          backgroundColor: "var(--surface)",
          color: "var(--fg)",
          borderColor: "var(--border-soft)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <form onSubmit={handleSubmit} className="w-[min(460px,calc(100vw-32px))] p-5">
          <h3
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--fg-strong)" }}
          >
            Criar novo usuário
          </h3>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            O usuário entrará no seu tenant e poderá acessar imediatamente.
          </p>

          <div className="mt-4 space-y-3">
            <Field label="Nome *" hint="mínimo 2 caracteres">
              <input
                type="text"
                name="name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="E-mail *" hint="usado para login (case-insensitive)">
              <input
                type="email"
                name="email"
                required
                maxLength={200}
                autoComplete="off"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Perfil *" hint="define módulos e permissões do usuário">
              <select
                name="perfilId"
                required
                defaultValue=""
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              >
                <option value="" disabled>
                  Selecione um perfil…
                </option>
                {perfis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Senha inicial *"
              hint="mín. 10 caracteres, 3 classes (maiúscula, minúscula, número, símbolo)"
            >
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  name="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className={`${INPUT_CLASS} pr-10`}
                  style={INPUT_STYLE}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}
          {success && <SuccessBox>{success}</SuccessBox>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border px-3 py-1.5 text-[12.5px] font-medium"
              style={{
                borderColor: "var(--border-soft)",
                color: "var(--fg-muted)",
                backgroundColor: "var(--surface)",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
            >
              {pending ? "Criando..." : "Criar usuário"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

const INPUT_CLASS =
  "ring-focus w-full rounded-lg border px-3 py-2 text-[13px] outline-none";
const INPUT_STYLE = {
  backgroundColor: "var(--surface-2)",
  borderColor: "var(--border-soft)",
  color: "var(--fg)",
} as const;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          className="mt-1 block text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        backgroundColor: "color-mix(in srgb, #e11d48 10%, transparent)",
        borderColor: "color-mix(in srgb, #e11d48 30%, var(--border-soft))",
        color: "#e11d48",
      }}
    >
      {children}
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        backgroundColor: "color-mix(in srgb, #10b981 10%, transparent)",
        borderColor: "color-mix(in srgb, #10b981 30%, var(--border-soft))",
        color: "#10b981",
      }}
    >
      {children}
    </div>
  );
}
