"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { registrarPrazoEngenharia } from "@/app/prontidao/actions";
import { fmtDate } from "@/lib/format";

export interface PrazoEngHistEntryProp {
  id: string;
  dataPrazo: Date;
  observacao: string | null;
  criadoEm: Date;
  criadoPorNome: string | null;
}

interface Props {
  numPedido: string;
  prazoAtual: Date | null;
  ultimaAtualizacao: Date | null;
  historico: PrazoEngHistEntryProp[];
  canEdit: boolean;
}

export default function PrazoEngCell({
  numPedido,
  prazoAtual,
  ultimaAtualizacao,
  historico,
  canEdit,
}: Props) {
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const histDialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const dataPrazo = String(fd.get("dataPrazo") ?? "").trim();
    const observacao = String(fd.get("observacao") ?? "").trim() || null;
    if (!dataPrazo) {
      setError("Informe a data");
      return;
    }
    startTransition(async () => {
      const result = await registrarPrazoEngenharia({ numPedido, dataPrazo, observacao });
      if (!result.ok) setError(result.error);
      else editDialogRef.current?.close();
    });
  }

  const dialogStyle = {
    backgroundColor: "var(--surface)",
    color: "var(--fg)",
    borderColor: "var(--border-soft)",
    boxShadow: "var(--shadow-md)",
  } as const;

  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-col">
        <span
          className="numeric text-[12.5px] font-medium"
          style={{ color: prazoAtual ? "var(--fg-strong)" : "var(--fg-muted)" }}
        >
          {prazoAtual ? fmtDate(prazoAtual) : "—"}
        </span>
        {ultimaAtualizacao && (
          <span className="text-[10.5px]" style={{ color: "var(--fg-muted)" }}>
            últ. {fmtDate(ultimaAtualizacao)}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-0.5">
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              editDialogRef.current?.showModal();
            }}
            className="rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
            style={{
              color: "var(--color-brand-600)",
              borderColor: "color-mix(in srgb, var(--color-brand-500) 40%, var(--border-soft))",
            }}
          >
            Atualizar
          </button>
        )}
        {historico.length > 0 && (
          <button
            type="button"
            onClick={() => histDialogRef.current?.showModal()}
            className="text-[10.5px] underline underline-offset-2"
            style={{ color: "var(--fg-muted)" }}
          >
            {historico.length} {historico.length === 1 ? "alteração" : "alterações"}
          </button>
        )}
      </div>

      {canEdit && (
        <dialog
          ref={editDialogRef}
          className="rounded-2xl border p-0 backdrop:bg-black/50"
          style={dialogStyle}
        >
          <form onSubmit={handleSubmit} className="w-[min(420px,calc(100vw-32px))] p-5">
            <h3
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--fg-strong)" }}
            >
              Atualizar prazo de engenharia
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
              PV <span className="numeric font-medium">{numPedido}</span> · novo registro
              preserva o histórico.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span
                  className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Nova data combinada *
                </span>
                <input
                  type="date"
                  name="dataPrazo"
                  required
                  defaultValue={prazoAtual ? toIsoDate(prazoAtual) : ""}
                  className="ring-focus w-full rounded-lg border px-3 py-2 text-[13px]"
                  style={{
                    backgroundColor: "var(--surface-2)",
                    borderColor: "var(--border-soft)",
                    color: "var(--fg)",
                  }}
                />
              </label>

              <label className="block">
                <span
                  className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Observação (opcional)
                </span>
                <textarea
                  name="observacao"
                  rows={3}
                  maxLength={500}
                  placeholder="Ex.: Definido em reunião 08/05 — aguarda chegada de motor X"
                  className="ring-focus w-full resize-y rounded-lg border px-3 py-2 text-[13px]"
                  style={{
                    backgroundColor: "var(--surface-2)",
                    borderColor: "var(--border-soft)",
                    color: "var(--fg)",
                  }}
                />
              </label>
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
                onClick={() => editDialogRef.current?.close()}
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
                style={{
                  backgroundColor: "var(--color-brand-500)",
                  color: "#fff",
                }}
              >
                {pending ? "Salvando..." : "Salvar prazo"}
              </button>
            </div>
          </form>
        </dialog>
      )}

      <dialog
        ref={histDialogRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={dialogStyle}
      >
        <div className="w-[min(520px,calc(100vw-32px))] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                className="text-[15px] font-semibold tracking-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                Histórico de prazo — PV{" "}
                <span className="numeric">{numPedido}</span>
              </h3>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
                {historico.length} {historico.length === 1 ? "registro" : "registros"} ·
                mais recente primeiro
              </p>
            </div>
            <button
              type="button"
              onClick={() => histDialogRef.current?.close()}
              className="rounded-md border px-2 py-1 text-[11px] font-medium"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
            >
              Fechar
            </button>
          </div>

          <ol className="mt-4 space-y-2.5">
            {historico.map((h, i) => (
              <li
                key={h.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: i === 0
                    ? "color-mix(in srgb, var(--color-brand-500) 35%, var(--border-soft))"
                    : "var(--border-soft)",
                  backgroundColor: i === 0
                    ? "color-mix(in srgb, var(--color-brand-500) 5%, var(--surface-2))"
                    : "var(--surface-2)",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="numeric text-[13px] font-semibold"
                    style={{ color: "var(--fg-strong)" }}
                  >
                    {fmtDate(h.dataPrazo)}
                  </span>
                  {i === 0 && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--color-brand-500) 18%, transparent)",
                        color: "var(--color-brand-600)",
                      }}
                    >
                      Atual
                    </span>
                  )}
                </div>
                <div
                  className="mt-1 text-[11.5px]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Registrado em {fmtDate(h.criadoEm)}
                  {h.criadoPorNome ? ` por ${h.criadoPorNome}` : ""}
                </div>
                {h.observacao && (
                  <div
                    className="mt-2 rounded-md border-l-2 pl-2 text-[12px]"
                    style={{
                      borderColor: "var(--color-brand-500)",
                      color: "var(--fg)",
                    }}
                  >
                    {h.observacao}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </dialog>
    </div>
  );
}

function toIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
