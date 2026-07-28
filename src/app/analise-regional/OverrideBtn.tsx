"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { salvarOverride } from "./regioes/actions";

export interface RegiaoOption {
  id: string;
  nome: string;
}

/**
 * Corrige a geografia de um cliente que a derivação automática não resolveu
 * (ou resolveu errado). Grava um ClienteGeoOverride pelo nome normalizado.
 */
export default function OverrideBtn({
  clienteKey,
  clienteLabel,
  municipio,
  uf,
  regioes,
}: {
  clienteKey: string;
  clienteLabel: string;
  municipio: string | null;
  uf: string | null;
  regioes: RegiaoOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      clienteKey,
      clienteLabel,
      municipio: String(fd.get("municipio") ?? "").trim() || null,
      uf: String(fd.get("uf") ?? "").trim() || null,
      regiaoId: String(fd.get("regiaoId") ?? "").trim() || null,
    };
    startTransition(async () => {
      const result = await salvarOverride(input);
      if (!result.ok) setError(result.error);
      else {
        setSuccess("Correção salva.");
        setTimeout(() => {
          dialogRef.current?.close();
          setSuccess(null);
        }, 700);
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
        className="ring-focus inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
        title="Corrigir geografia"
      >
        <MapPin className="size-3.5" />
        Corrigir
      </button>

      <dialog ref={dialogRef} className="rounded-2xl border p-0 backdrop:bg-black/50" style={DIALOG_STYLE}>
        <form onSubmit={handleSubmit} className="w-[min(440px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Corrigir geografia
          </h3>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            {clienteLabel}
          </p>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Field label="Cidade">
                <input type="text" name="municipio" maxLength={120} defaultValue={municipio ?? ""}
                  autoComplete="off" className={INPUT_CLASS} style={INPUT_STYLE} />
              </Field>
              <Field label="UF">
                <input type="text" name="uf" maxLength={2} defaultValue={uf ?? ""} placeholder="SP"
                  autoComplete="off" className={`${INPUT_CLASS} uppercase`} style={INPUT_STYLE} />
              </Field>
            </div>
            <Field label="Fixar região" hint="opcional — ignora a resolução por cidade/UF">
              <select name="regiaoId" defaultValue="" className={INPUT_CLASS} style={INPUT_STYLE}>
                <option value="">— resolver por cidade/UF —</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </Field>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
              style={{
                backgroundColor: "color-mix(in srgb, #e11d48 10%, transparent)",
                borderColor: "color-mix(in srgb, #e11d48 30%, var(--border-soft))",
                color: "#e11d48",
              }}>
              {error}
            </div>
          )}
          {success && (
            <div className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
              style={{
                backgroundColor: "color-mix(in srgb, #10b981 10%, transparent)",
                borderColor: "color-mix(in srgb, #10b981 30%, var(--border-soft))",
                color: "#10b981",
              }}>
              {success}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()}
              className="rounded-lg border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)", backgroundColor: "var(--surface)" }}>
              Cancelar
            </button>
            <button type="submit" disabled={pending}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--fg-subtle)" }}>{hint}</span>}
    </label>
  );
}

const DIALOG_STYLE = {
  backgroundColor: "var(--surface)",
  color: "var(--fg)",
  borderColor: "var(--border-soft)",
  boxShadow: "var(--shadow-md)",
} as const;

const INPUT_CLASS = "ring-focus w-full rounded-lg border px-3 py-2 text-[13px] outline-none";
const INPUT_STYLE = {
  backgroundColor: "var(--surface-2)",
  borderColor: "var(--border-soft)",
  color: "var(--fg)",
} as const;
