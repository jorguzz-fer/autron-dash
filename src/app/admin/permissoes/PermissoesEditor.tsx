"use client";

import { useRef, useState, useTransition } from "react";
import { Sliders } from "lucide-react";
import { MODULES, MODULE_SECTIONS, getDefaultModules, type ModuleKey } from "@/lib/pageAccess";
import { salvarPermissoes } from "./actions";

interface UserInfo {
  id: string;
  name: string;
  role: string;
  allowedModules: string[];
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "ADMIN",
  DIRETOR: "GESTÃO",
  GERENTE: "SUPERVISÃO",
  OPERADOR: "OPERADOR",
  VIEWER: "VIEWER",
  CONTROLADORIA: "CONTROLADORIA",
};

export default function PermissoesEditor({ user }: { user: UserInfo }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isDefaultRef = user.allowedModules.length === 0;

  const [useDefault, setUseDefault] = useState(isDefaultRef);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(isDefaultRef ? getDefaultModules(user.role) : user.allowedModules),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    const isDefault = user.allowedModules.length === 0;
    setUseDefault(isDefault);
    setSelected(new Set(isDefault ? getDefaultModules(user.role) : user.allowedModules));
    setError(null);
    dialogRef.current?.showModal();
  }

  function toggleModule(key: string) {
    setSelected((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleToggleDefault(checked: boolean) {
    setUseDefault(checked);
    if (!checked) {
      // Ao desativar padrão, inicia com os módulos do perfil selecionados
      setSelected(new Set(getDefaultModules(user.role)));
    }
  }

  function save() {
    setError(null);
    const modules = useDefault ? [] : [...selected];
    startTransition(async () => {
      const result = await salvarPermissoes({ userId: user.id, modules });
      if (!result.ok) {
        setError(result.error ?? "Erro ao salvar");
      } else {
        dialogRef.current?.close();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="ring-focus flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
      >
        <Sliders className="size-3.5" />
        Editar
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
        <div className="w-[min(580px,calc(100vw-32px))]">
          {/* Cabeçalho */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-soft)" }}>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--fg-strong)" }}>
              Permissões de {user.name}
            </h3>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Perfil base: <strong>{ROLE_LABEL[user.role] ?? user.role}</strong>
            </p>
          </div>

          {/* Corpo */}
          <div className="space-y-4 p-5">
            {/* Toggle padrão */}
            <label
              className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3"
              style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--surface-2)" }}
            >
              <input
                type="checkbox"
                checked={useDefault}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToggleDefault(e.target.checked)}
                className="mt-0.5 size-4 rounded accent-[var(--color-brand-500)]"
              />
              <div>
                <div className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>
                  Usar padrão do perfil
                </div>
                <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
                  {useDefault
                    ? `Módulos padrão do perfil ${ROLE_LABEL[user.role] ?? user.role} aplicados automaticamente`
                    : "Módulos customizados — sobrepõem o padrão do perfil"}
                </div>
              </div>
            </label>

            {/* Lista de módulos */}
            <div className="max-h-[340px] space-y-4 overflow-y-auto pr-1">
              {MODULE_SECTIONS.map((section) => {
                const items = MODULES.filter((m) => m.section === section);
                return (
                  <div key={section}>
                    <div
                      className="mb-2 text-[10.5px] font-medium uppercase tracking-wider"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {section}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map((m) => {
                        const isChecked = selected.has(m.key);
                        return (
                          <label
                            key={m.key}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                              useDefault ? "cursor-not-allowed opacity-60" : "hover:bg-[var(--surface-2)]"
                            }`}
                            style={{
                              borderColor: isChecked
                                ? "color-mix(in srgb, var(--color-brand-500) 50%, transparent)"
                                : "var(--border-soft)",
                              backgroundColor: isChecked
                                ? "color-mix(in srgb, var(--color-brand-500) 8%, transparent)"
                                : "transparent",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={useDefault}
                              onChange={() => toggleModule(m.key)}
                              className="size-3.5 rounded accent-[var(--color-brand-500)]"
                            />
                            <span style={{ color: "var(--fg)" }}>{m.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {!useDefault && (
              <p className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
                {selected.size} módulo{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
              </p>
            )}

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
              {pending ? "Salvando..." : "Salvar permissões"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
