"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { salvarObservacoesAction } from "../actions";

interface Props {
  id: string;
  initial: string | null;
}

/**
 * Editor inline de observações. Default = read-only com botão "Editar".
 * Quando em modo edição, textarea + Salvar/Cancelar.
 * Salva via server action (que faz audit log e revalidatePath).
 */
export default function ObservacoesEditor({ id, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [savedValue, setSavedValue] = useState(initial ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await salvarObservacoesAction(id, value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedValue(value);
      setEditing(false);
    });
  }

  function handleCancel() {
    setValue(savedValue);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        {savedValue ? (
          <p
            className="whitespace-pre-wrap text-[13px] leading-relaxed"
            style={{ color: "var(--fg)" }}
          >
            {savedValue}
          </p>
        ) : (
          <p className="text-[13px] italic" style={{ color: "var(--fg-muted)" }}>
            Sem observações.
          </p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ring-focus inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:underline"
          style={{ color: "var(--color-brand-600)" }}
        >
          <Pencil className="size-3.5" />
          {savedValue ? "Editar" : "Adicionar observação"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Notas pra a equipe (visíveis pra quem abrir esta conciliação)…"
        className="ring-focus block w-full resize-y rounded-lg border px-3 py-2 text-[13px]"
        style={{
          borderColor: "var(--border-soft)",
          backgroundColor: "var(--surface)",
          color: "var(--fg-strong)",
        }}
      />
      {error && (
        <div className="text-[12px] font-medium" style={{ color: "#e11d48" }}>
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="ring-focus inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
        >
          {pending ? (
            <>
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Salvando…
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              Salvar
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="ring-focus inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--surface-2)", color: "var(--fg)" }}
        >
          <X className="size-3.5" />
          Cancelar
        </button>
      </div>
    </div>
  );
}
