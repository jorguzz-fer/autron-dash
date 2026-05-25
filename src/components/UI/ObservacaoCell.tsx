"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { salvarObservacaoPV } from "@/app/prontidao/actions";
import { fmtDate } from "@/lib/format";

interface Props {
  numPedido: string;
  texto: string | null;
  atualizadoEm: Date | null;
  atualizadoPorNome: string | null;
  canEdit: boolean;
}

const MAX_LEN = 1000;

export default function ObservacaoCell({
  numPedido,
  texto,
  atualizadoEm,
  atualizadoPorNome,
  canEdit,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const novoTexto = String(fd.get("texto") ?? "").trim();
    startTransition(async () => {
      const result = await salvarObservacaoPV({ numPedido, texto: novoTexto });
      if (!result.ok) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  const dialogStyle = {
    backgroundColor: "var(--surface)",
    color: "var(--fg)",
    borderColor: "var(--border-soft)",
    boxShadow: "var(--shadow-md)",
  } as const;

  const temTexto = !!texto && texto.trim().length > 0;

  return (
    <div className="flex max-w-[260px] items-start gap-2">
      <div className="flex min-w-0 flex-col">
        {temTexto ? (
          <>
            <span
              className="line-clamp-2 text-[12px]"
              title={texto ?? ""}
              style={{ color: "var(--fg)" }}
            >
              {texto}
            </span>
            {atualizadoEm && (
              <span className="text-[10.5px]" style={{ color: "var(--fg-muted)" }}>
                últ. {fmtDate(atualizadoEm)}
                {atualizadoPorNome ? ` · ${atualizadoPorNome}` : ""}
              </span>
            )}
          </>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            —
          </span>
        )}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            dialogRef.current?.showModal();
          }}
          className="shrink-0 rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
          style={{
            color: "var(--color-brand-600)",
            borderColor: "color-mix(in srgb, var(--color-brand-500) 40%, var(--border-soft))",
          }}
        >
          {temTexto ? "Editar" : "Adicionar"}
        </button>
      )}

      {canEdit && (
        <dialog
          ref={dialogRef}
          className="rounded-2xl border p-0 backdrop:bg-black/50"
          style={dialogStyle}
        >
          <form onSubmit={handleSubmit} className="w-[min(460px,calc(100vw-32px))] p-5">
            <h3
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--fg-strong)" }}
            >
              Observação do PV
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
              PV <span className="numeric font-medium">{numPedido}</span> · observação geral
              visível nas tabelas de Prontidão.
            </p>

            <div className="mt-4">
              <textarea
                name="texto"
                rows={4}
                maxLength={MAX_LEN}
                defaultValue={texto ?? ""}
                placeholder="Ex.: Cliente solicitou antecipação — aguardando aprovação de crédito."
                className="ring-focus w-full resize-y rounded-lg border px-3 py-2 text-[13px]"
                style={{
                  backgroundColor: "var(--surface-2)",
                  borderColor: "var(--border-soft)",
                  color: "var(--fg)",
                }}
              />
              <p className="mt-1 text-[10.5px]" style={{ color: "var(--fg-muted)" }}>
                Deixe em branco para remover a observação.
              </p>
            </div>

            {error && (
              <div
                className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
                style={{
                  backgroundColor: "color-mix(in srgb, #e11d48 10%, transparent)",
                  borderColor: "color-mix(in srgb, #e11d48 30%, var(--border-soft))",
                  color: "#e11d48",
                }}
              >
                {error}
              </div>
            )}

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
                {pending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
