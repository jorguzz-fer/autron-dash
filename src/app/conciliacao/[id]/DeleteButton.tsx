"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { excluirConciliacaoAction } from "../actions";

interface Props {
  id: string;
  label: string; // ex: "Conciliação 31/03/2026 · conta 1.1.2.10.1"
}

/**
 * Botão "Excluir" + dialog HTML nativo de confirmação. Servidor faz o delete
 * em cascade (divergencias caem junto). Audit log gravado.
 */
export default function DeleteButton({ id, label }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await excluirConciliacaoAction(id);
        // Sucesso: a action faz redirect, então não voltamos aqui.
        if (r && !r.ok) setError(r.error);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("NEXT_REDIRECT")) setError(msg);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:brightness-105"
        style={{
          borderColor: "color-mix(in srgb, #e11d48 30%, var(--border-soft))",
          color: "#e11d48",
          backgroundColor: "transparent",
        }}
      >
        <Trash2 className="size-3.5" />
        Excluir
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border p-0 backdrop:bg-black/45"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border-soft)",
          color: "var(--fg)",
          maxWidth: "440px",
          width: "calc(100vw - 2rem)",
        }}
        onClick={(e) => {
          // Click fora fecha
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="p-5">
          <h2
            className="text-[16px] font-bold tracking-tight"
            style={{ color: "var(--fg-strong)" }}
          >
            Excluir conciliação?
          </h2>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--fg-muted)" }}>
            <strong style={{ color: "var(--fg)" }}>{label}</strong>
            <br />
            Esta ação <strong>não pode ser desfeita</strong>. Os arquivos originais
            (Financeiro e Contábil) também serão removidos do armazenamento.
          </p>

          {error && (
            <div className="mt-3 text-[12.5px] font-medium" style={{ color: "#e11d48" }}>
              {error}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="ring-focus rounded-lg px-3 py-2 text-[13px] font-medium transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: "var(--surface-2)", color: "var(--fg)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="ring-focus inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: "#e11d48", color: "#fff" }}
            >
              {pending ? (
                <>
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Excluindo…
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Excluir definitivamente
                </>
              )}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
