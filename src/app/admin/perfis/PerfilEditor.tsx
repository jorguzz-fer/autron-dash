"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { MODULES, MODULE_SECTIONS } from "@/lib/pageAccess";
import { CAPABILITIES } from "@/lib/capabilities";
import { criarPerfilAction, atualizarPerfilAction } from "./actions";

const ROLE_OPTIONS = [
  { value: "VIEWER", label: "Visualizador (somente leitura)" },
  { value: "OPERADOR", label: "Operador" },
  { value: "GERENTE", label: "Supervisão" },
  { value: "DIRETOR", label: "Gestão" },
  { value: "CONTROLADORIA", label: "Controladoria" },
  { value: "ADMIN", label: "Administrador" },
] as const;

export interface PerfilData {
  id: string;
  label: string;
  descricao: string | null;
  isSystem: boolean;
  baseRole: string;
  modules: string[];
  capabilities: string[];
}

interface Props {
  /** Perfil a editar. Ausente = modo criação. */
  perfil?: PerfilData;
}

export default function PerfilEditor({ perfil }: Props) {
  const isEdit = !!perfil;
  // Perfil de sistema ADMIN: trava baseRole e a capacidade MANAGE_USERS (anti-lockout).
  const isAdminSystem = !!(perfil?.isSystem && perfil.baseRole === "ADMIN");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [label, setLabel] = useState(perfil?.label ?? "");
  const [descricao, setDescricao] = useState(perfil?.descricao ?? "");
  const [baseRole, setBaseRole] = useState(perfil?.baseRole ?? "VIEWER");
  const [modules, setModules] = useState<Set<string>>(new Set(perfil?.modules ?? []));
  const [capabilities, setCapabilities] = useState<Set<string>>(
    new Set(perfil?.capabilities ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setLabel(perfil?.label ?? "");
    setDescricao(perfil?.descricao ?? "");
    setBaseRole(perfil?.baseRole ?? "VIEWER");
    setModules(new Set(perfil?.modules ?? []));
    setCapabilities(new Set(perfil?.capabilities ?? []));
    setError(null);
  }

  function open() {
    reset();
    dialogRef.current?.showModal();
  }

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  function save() {
    setError(null);
    const payload = {
      label: label.trim(),
      descricao: descricao.trim() || null,
      baseRole,
      modules: [...modules],
      capabilities: [...capabilities],
    };
    if (payload.label.length < 2) {
      setError("Informe um nome para o perfil (mín. 2 caracteres).");
      return;
    }
    startTransition(async () => {
      const result = isEdit
        ? await atualizarPerfilAction({ id: perfil!.id, ...payload })
        : await criarPerfilAction(payload);
      if (!result.ok) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={open}
          className="ring-focus flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
        >
          <Pencil className="size-3.5" />
          Editar
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className="ring-focus inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
        >
          <Plus className="size-3.5" />
          Novo perfil
        </button>
      )}

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
        <div className="flex max-h-[85vh] w-[min(640px,calc(100vw-32px))] flex-col">
          {/* Cabeçalho */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-soft)" }}>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--fg-strong)" }}>
              {isEdit ? `Editar perfil — ${perfil!.label}` : "Novo perfil"}
            </h3>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Defina os módulos visíveis e as permissões de ação deste perfil.
            </p>
          </div>

          {/* Corpo rolável */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL_CLASS} style={LABEL_STYLE}>Nome do perfil</span>
                <input
                  type="text"
                  value={label}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
                  maxLength={60}
                  placeholder="ex.: Financeiro Jr"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLASS} style={LABEL_STYLE}>
                  Nível de segurança base
                </span>
                <select
                  value={baseRole}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBaseRole(e.target.value)}
                  disabled={isAdminSystem}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className={LABEL_CLASS} style={LABEL_STYLE}>Descrição (opcional)</span>
              <input
                type="text"
                value={descricao}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescricao(e.target.value)}
                maxLength={200}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </label>

            {/* Capacidades */}
            <div>
              <div className="mb-2 text-[12px] font-semibold" style={{ color: "var(--fg-strong)" }}>
                Permissões de ação
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {CAPABILITIES.map((c) => {
                  const checked = capabilities.has(c.key);
                  const locked = isAdminSystem && c.key === "MANAGE_USERS";
                  return (
                    <label
                      key={c.key}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
                        locked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-[var(--surface-2)]"
                      }`}
                      style={{
                        borderColor: checked
                          ? "color-mix(in srgb, var(--color-brand-500) 50%, transparent)"
                          : "var(--border-soft)",
                        backgroundColor: checked
                          ? "color-mix(in srgb, var(--color-brand-500) 8%, transparent)"
                          : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggle(capabilities, c.key, setCapabilities)}
                        className="mt-0.5 size-3.5 rounded accent-[var(--color-brand-500)]"
                      />
                      <span>
                        <span className="block font-medium" style={{ color: "var(--fg)" }}>
                          {c.label}
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                          {c.descricao}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Módulos */}
            <div>
              <div className="mb-2 text-[12px] font-semibold" style={{ color: "var(--fg-strong)" }}>
                Módulos visíveis no menu
              </div>
              <div className="space-y-3">
                {MODULE_SECTIONS.map((section) => (
                  <div key={section}>
                    <div
                      className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {section}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {MODULES.filter((m) => m.section === section).map((m) => {
                        const checked = modules.has(m.key);
                        return (
                          <label
                            key={m.key}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors hover:bg-[var(--surface-2)]"
                            style={{
                              borderColor: checked
                                ? "color-mix(in srgb, var(--color-brand-500) 50%, transparent)"
                                : "var(--border-soft)",
                              backgroundColor: checked
                                ? "color-mix(in srgb, var(--color-brand-500) 8%, transparent)"
                                : "transparent",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(modules, m.key, setModules)}
                              className="size-3.5 rounded accent-[var(--color-brand-500)]"
                            />
                            <span style={{ color: "var(--fg)" }}>{m.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div
                className="rounded-lg border px-3 py-2 text-[12px]"
                style={{
                  backgroundColor: "color-mix(in srgb, #e11d48 10%, transparent)",
                  borderColor: "color-mix(in srgb, #e11d48 30%, var(--border-soft))",
                  color: "#e11d48",
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div
            className="flex justify-end gap-2 px-5 py-4"
            style={{ borderTop: "1px solid var(--border-soft)" }}
          >
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
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
            >
              {pending ? "Salvando..." : isEdit ? "Salvar perfil" : "Criar perfil"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

const LABEL_CLASS = "mb-1 block text-[11.5px] font-medium uppercase tracking-wider";
const LABEL_STYLE = { color: "var(--fg-muted)" } as const;
const INPUT_CLASS = "ring-focus w-full rounded-lg border px-3 py-2 text-[13px] outline-none";
const INPUT_STYLE = {
  backgroundColor: "var(--surface-2)",
  borderColor: "var(--border-soft)",
  color: "var(--fg)",
} as const;
