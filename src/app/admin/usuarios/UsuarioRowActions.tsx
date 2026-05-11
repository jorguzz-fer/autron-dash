"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { MoreVertical, Pencil, KeyRound, UserMinus, UserCheck } from "lucide-react";
import type { Role } from "@/lib/authz";
import { atualizarUsuario, resetarSenha, setUsuarioAtivo } from "./actions";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "VIEWER", label: "VIEWER" },
  { value: "OPERADOR", label: "OPERADOR" },
  { value: "GERENTE", label: "GERENTE" },
  { value: "DIRETOR", label: "DIRETOR" },
  { value: "ADMIN", label: "ADMIN" },
];

interface Props {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** É o próprio admin logado? Bloqueia desativação/rebaixamento. */
  isSelf: boolean;
}

export default function UsuarioRowActions({
  id,
  name,
  email,
  role,
  active,
  isSelf,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const editRef = useRef<HTMLDialogElement>(null);
  const pwdRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setMenuOpen(false);
  }

  function onEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      id,
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      role: String(fd.get("role") ?? role),
    };
    startTransition(async () => {
      const r = await atualizarUsuario(input);
      if (!r.ok) setError(r.error);
      else editRef.current?.close();
    });
  }

  function onPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    startTransition(async () => {
      const r = await resetarSenha({ id, password });
      if (!r.ok) setError(r.error);
      else {
        (e.target as HTMLFormElement).reset();
        pwdRef.current?.close();
      }
    });
  }

  function onToggleActive() {
    setError(null);
    const next = !active;
    if (
      !next &&
      !confirm(`Desativar ${name}? Ele(a) perderá acesso imediatamente.`)
    ) {
      return;
    }
    startTransition(async () => {
      const r = await setUsuarioAtivo({ id, active: next });
      if (!r.ok) alert(r.error);
    });
    close();
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label="Ações do usuário"
        onClick={() => setMenuOpen((v) => !v)}
        onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
        className="ring-focus rounded-md border p-1.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
      >
        <MoreVertical className="size-4" />
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 z-10 mt-1 w-48 rounded-lg border p-1 text-[12.5px]"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border-soft)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <MenuItem
            icon={<Pencil className="size-3.5" />}
            label="Editar"
            onClick={() => {
              close();
              setError(null);
              editRef.current?.showModal();
            }}
          />
          <MenuItem
            icon={<KeyRound className="size-3.5" />}
            label="Resetar senha"
            onClick={() => {
              close();
              setError(null);
              pwdRef.current?.showModal();
            }}
          />
          {!isSelf && (
            <MenuItem
              icon={active ? <UserMinus className="size-3.5" /> : <UserCheck className="size-3.5" />}
              label={active ? "Desativar" : "Reativar"}
              onClick={onToggleActive}
              tone={active ? "danger" : "success"}
            />
          )}
        </div>
      )}

      {/* Editar */}
      <dialog
        ref={editRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={DIALOG_STYLE}
      >
        <form onSubmit={onEditSubmit} className="w-[min(420px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--fg-strong)" }}>
            Editar usuário
          </h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
            Para alterar a senha, use &ldquo;Resetar senha&rdquo;.
          </p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className={LABEL_CLASS} style={LABEL_STYLE}>Nome</span>
              <input
                name="name"
                type="text"
                required
                minLength={2}
                defaultValue={name}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS} style={LABEL_STYLE}>E-mail</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={email}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS} style={LABEL_STYLE}>Perfil</span>
              <select
                name="role"
                required
                defaultValue={role}
                disabled={isSelf}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {isSelf && (
                <span className="mt-1 block text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                  Você não pode alterar seu próprio perfil para evitar perda de acesso.
                </span>
              )}
            </label>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => editRef.current?.close()}
              className={BTN_CANCEL_CLASS}
              style={BTN_CANCEL_STYLE}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={BTN_SUBMIT_CLASS}
              style={BTN_SUBMIT_STYLE}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </dialog>

      {/* Resetar senha */}
      <dialog
        ref={pwdRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={DIALOG_STYLE}
      >
        <form onSubmit={onPasswordSubmit} className="w-[min(420px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--fg-strong)" }}>
            Resetar senha de {name}
          </h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
            Comunique a nova senha ao usuário por canal seguro. Sessões ativas
            continuam válidas até expirarem.
          </p>

          <label className="mt-4 block">
            <span className={LABEL_CLASS} style={LABEL_STYLE}>Nova senha</span>
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
            <span className="mt-1 block text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              Mín. 10 caracteres, 3 classes (maiúscula, minúscula, número, símbolo).
            </span>
          </label>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => pwdRef.current?.close()}
              className={BTN_CANCEL_CLASS}
              style={BTN_CANCEL_STYLE}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={BTN_SUBMIT_CLASS}
              style={BTN_SUBMIT_STYLE}
            >
              {pending ? "Salvando..." : "Resetar senha"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger" | "success";
}) {
  const color =
    tone === "danger" ? "#e11d48" : tone === "success" ? "#10b981" : "var(--fg)";
  return (
    <button
      type="button"
      // Use onMouseDown pra disparar ANTES do onBlur do botão pai fechar o menu
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
      style={{ color }}
    >
      {icon}
      {label}
    </button>
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

const DIALOG_STYLE = {
  backgroundColor: "var(--surface)",
  color: "var(--fg)",
  borderColor: "var(--border-soft)",
  boxShadow: "var(--shadow-md)",
} as const;
const LABEL_CLASS = "mb-1 block text-[11.5px] font-medium uppercase tracking-wider";
const LABEL_STYLE = { color: "var(--fg-muted)" } as const;
const INPUT_CLASS = "ring-focus w-full rounded-lg border px-3 py-2 text-[13px] outline-none";
const INPUT_STYLE = {
  backgroundColor: "var(--surface-2)",
  borderColor: "var(--border-soft)",
  color: "var(--fg)",
} as const;
const BTN_CANCEL_CLASS = "rounded-lg border px-3 py-1.5 text-[12.5px] font-medium";
const BTN_CANCEL_STYLE = {
  borderColor: "var(--border-soft)",
  color: "var(--fg-muted)",
  backgroundColor: "var(--surface)",
} as const;
const BTN_SUBMIT_CLASS = "rounded-lg px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60";
const BTN_SUBMIT_STYLE = {
  backgroundColor: "var(--color-brand-500)",
  color: "#fff",
} as const;
