"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { MapPlus, Pencil, Trash2 } from "lucide-react";
import { criarRegiao, atualizarRegiao, excluirRegiao } from "./actions";

export interface VendedorOption {
  codigoProtheus: string;
  nome: string;
}

export interface RegiaoData {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  vendedorCodigo: string | null;
  nomeVendedor: string | null;
  ufs: string[];
  municipios: string[];
  ordem: number;
  ativo: boolean;
}

function readForm(fd: FormData) {
  return {
    nome: String(fd.get("nome") ?? "").trim(),
    descricao: String(fd.get("descricao") ?? "").trim() || null,
    cor: String(fd.get("cor") ?? "").trim() || null,
    vendedorCodigo: String(fd.get("vendedorCodigo") ?? "").trim() || null,
    nomeVendedor: String(fd.get("nomeVendedor") ?? "").trim() || null,
    ufsText: String(fd.get("ufsText") ?? ""),
    municipiosText: String(fd.get("municipiosText") ?? ""),
    ordem: fd.get("ordem") ? Number(fd.get("ordem")) : 0,
    ativo: fd.get("ativo") === "on",
  };
}

// ── Criar ───────────────────────────────────────────────────────────────────

export function RegiaoCriarBtn({ vendedores = [] }: { vendedores?: VendedorOption[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const input = readForm(new FormData(e.currentTarget));
    startTransition(async () => {
      const result = await criarRegiao(input);
      if (!result.ok) setError(result.error);
      else {
        setSuccess("Região criada com sucesso.");
        (e.target as HTMLFormElement).reset();
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
        className="ring-focus inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:opacity-90"
        style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
      >
        <MapPlus className="size-3.5" />
        Nova região
      </button>

      <dialog ref={dialogRef} className="rounded-2xl border p-0 backdrop:bg-black/50" style={DIALOG_STYLE}>
        <form onSubmit={handleSubmit} className="w-[min(560px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Nova região
          </h3>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            Monte o território com UFs inteiras e/ou uma lista de municípios. Um município listado
            vence a UF — dá pra recortar SP em litoral/Vale/interior e cruzar estados.
          </p>
          <RegiaoFields vendedores={vendedores} />
          {error && <ErrorBox>{error}</ErrorBox>}
          {success && <SuccessBox>{success}</SuccessBox>}
          <DialogButtons pending={pending} dialogRef={dialogRef} submitLabel="Criar região" />
        </form>
      </dialog>
    </>
  );
}

// ── Editar ──────────────────────────────────────────────────────────────────

export function RegiaoEditarBtn({
  regiao,
  vendedores = [],
}: {
  regiao: RegiaoData;
  vendedores?: VendedorOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const input = readForm(new FormData(e.currentTarget));
    startTransition(async () => {
      const result = await atualizarRegiao(regiao.id, input);
      if (!result.ok) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Editar região"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className="ring-focus rounded-md border p-1.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-soft)", color: "var(--fg-muted)" }}
        title="Editar"
      >
        <Pencil className="size-4" />
      </button>

      <dialog ref={dialogRef} className="rounded-2xl border p-0 backdrop:bg-black/50" style={DIALOG_STYLE}>
        <form onSubmit={handleSubmit} className="w-[min(560px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Editar região
          </h3>
          <RegiaoFields vendedores={vendedores} regiao={regiao} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <DialogButtons pending={pending} dialogRef={dialogRef} submitLabel="Salvar" />
        </form>
      </dialog>
    </>
  );
}

// ── Excluir ─────────────────────────────────────────────────────────────────

export function RegiaoExcluirBtn({ id, nome }: { id: string; nome: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Excluir a região "${nome}"? Os clientes voltam a ser resolvidos pelas demais regiões.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await excluirRegiao(id);
      if (!result.ok) {
        setError(result.error);
        alert(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      aria-label="Excluir região"
      onClick={handleDelete}
      disabled={pending}
      className="ring-focus rounded-md border p-1.5 transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50"
      style={{ borderColor: "var(--border-soft)", color: error ? "#e11d48" : "var(--fg-muted)" }}
      title="Excluir"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

// ── Campos compartilhados ────────────────────────────────────────────────────

function RegiaoFields({ vendedores, regiao }: { vendedores: VendedorOption[]; regiao?: RegiaoData }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Nome *">
          <input type="text" name="nome" required minLength={2} maxLength={80} defaultValue={regiao?.nome}
            autoComplete="off" className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Cor" hint="hex, ex #009da4">
          <input type="text" name="cor" maxLength={7} defaultValue={regiao?.cor ?? ""} placeholder="#009da4"
            className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </div>

      <Field label="Descrição" hint="opcional">
        <input type="text" name="descricao" maxLength={280} defaultValue={regiao?.descricao ?? ""}
          className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendedor (carteira)" hint="atribuição p/ simulação; opcional">
          <select name="vendedorCodigo" defaultValue={regiao?.vendedorCodigo ?? ""} className={INPUT_CLASS} style={INPUT_STYLE}>
            <option value="">— sem vendedor —</option>
            {vendedores.map((v) => (
              <option key={v.codigoProtheus} value={v.codigoProtheus}>
                {v.codigoProtheus} — {v.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordem" hint="menor aparece/casa primeiro">
          <input type="number" name="ordem" min={0} max={9999} step={1} defaultValue={regiao?.ordem ?? 0}
            className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </div>

      <Field label="UFs" hint="estados inteiros — ex: PR, SC, RS">
        <input type="text" name="ufsText" defaultValue={regiao?.ufs.join(", ") ?? ""} placeholder="PR, SC, RS"
          autoComplete="off" className={INPUT_CLASS} style={INPUT_STYLE} />
      </Field>

      <Field label="Municípios" hint='uma "Cidade/UF" por linha — ex: Santos/SP, Guarujá/SP'>
        <textarea name="municipiosText" rows={4} defaultValue={regiao?.municipios.join("\n") ?? ""}
          placeholder={"Santos/SP\nGuarujá/SP\nVolta Redonda/RJ"}
          className={`${INPUT_CLASS} resize-y`} style={INPUT_STYLE} />
      </Field>

      <label className="flex items-center gap-2 cursor-pointer text-[13px]" style={{ color: "var(--fg)" }}>
        <input type="checkbox" name="ativo" defaultChecked={regiao ? regiao.ativo : true} className="size-4 rounded" />
        Ativa
      </label>
    </div>
  );
}

function DialogButtons({
  pending,
  dialogRef,
  submitLabel,
}: {
  pending: boolean;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  submitLabel: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" onClick={() => dialogRef.current?.close()} className={BTN_CANCEL_CLASS} style={BTN_CANCEL_STYLE}>
        Cancelar
      </button>
      <button type="submit" disabled={pending} className={BTN_SUBMIT_CLASS} style={BTN_SUBMIT_STYLE}>
        {pending ? "Salvando..." : submitLabel}
      </button>
    </div>
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

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        backgroundColor: "color-mix(in srgb, #e11d48 10%, transparent)",
        borderColor: "color-mix(in srgb, #e11d48 30%, var(--border-soft))",
        color: "#e11d48",
      }}>
      {children}
    </div>
  );
}

function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
      style={{
        backgroundColor: "color-mix(in srgb, #10b981 10%, transparent)",
        borderColor: "color-mix(in srgb, #10b981 30%, var(--border-soft))",
        color: "#10b981",
      }}>
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
const BTN_SUBMIT_STYLE = { backgroundColor: "var(--color-brand-500)", color: "#fff" } as const;
