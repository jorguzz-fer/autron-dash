"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { PlusCircle, Pencil } from "lucide-react";
import { criarCargo, atualizarCargo } from "./actions";

const BASE_OPTIONS = [
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "COLETIVO", label: "Coletivo" },
  { value: "CARTEIRA", label: "Carteira" },
] as const;

interface CargoData {
  id: string;
  ano: number;
  cargo: string;
  comissaoPct: string | number;
  gatilhoPct: string | number;
  base: string;
}

// ─────────────────────────── Criar Cargo ─────────────────────────────────────

export function CargoCriarBtn() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const anoAtual = new Date().getFullYear();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fd = new FormData(e.currentTarget);
    const input = {
      ano: Number(fd.get("ano") ?? anoAtual),
      cargo: String(fd.get("cargo") ?? "").trim(),
      comissaoPct: Number(fd.get("comissaoPct") ?? 0),
      gatilhoPct: Number(fd.get("gatilhoPct") ?? 0),
      base: String(fd.get("base") ?? "INDIVIDUAL"),
    };

    startTransition(async () => {
      const result = await criarCargo(input);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess("Cargo criado com sucesso.");
        (e.target as HTMLFormElement).reset();
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
        style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
      >
        <PlusCircle className="size-3.5" />
        Novo cargo
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={DIALOG_STYLE}
      >
        <form onSubmit={handleSubmit} className="w-[min(460px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Novo cargo / regra de comissão
          </h3>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            Defina a tabela de comissão e gatilho para o cargo no ano.
          </p>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ano *">
                <input
                  type="number"
                  name="ano"
                  required
                  min={2020}
                  max={2099}
                  step={1}
                  defaultValue={anoAtual}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Base *">
                <select name="base" required defaultValue="INDIVIDUAL" className={INPUT_CLASS} style={INPUT_STYLE}>
                  {BASE_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Cargo *" hint="ex: INSIDE, HUNTER, KEY ACCOUNT">
              <input
                type="text"
                name="cargo"
                required
                maxLength={60}
                autoComplete="off"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Comissão %" hint="ex: 0.05 = 5%">
                <input
                  type="number"
                  name="comissaoPct"
                  required
                  min={0}
                  max={9.9999}
                  step={0.0001}
                  defaultValue={0}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Gatilho %" hint="ex: 0.7 = 70%">
                <input
                  type="number"
                  name="gatilhoPct"
                  required
                  min={0}
                  max={9.9999}
                  step={0.0001}
                  defaultValue={0}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}
          {success && <SuccessBox>{success}</SuccessBox>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className={BTN_CANCEL_CLASS} style={BTN_CANCEL_STYLE}>
              Cancelar
            </button>
            <button type="submit" disabled={pending} className={BTN_SUBMIT_CLASS} style={BTN_SUBMIT_STYLE}>
              {pending ? "Criando..." : "Criar cargo"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

// ─────────────────────────── Editar Cargo ────────────────────────────────────

export function CargoEditarBtn({ cargo }: { cargo: CargoData }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const input = {
      ano: Number(fd.get("ano") ?? cargo.ano),
      cargo: String(fd.get("cargo") ?? "").trim(),
      comissaoPct: Number(fd.get("comissaoPct") ?? 0),
      gatilhoPct: Number(fd.get("gatilhoPct") ?? 0),
      base: String(fd.get("base") ?? "INDIVIDUAL"),
    };

    startTransition(async () => {
      const result = await atualizarCargo(cargo.id, input);
      if (!result.ok) {
        setError(result.error);
      } else {
        dialogRef.current?.close();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Editar cargo"
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

      <dialog
        ref={dialogRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={DIALOG_STYLE}
      >
        <form onSubmit={handleSubmit} className="w-[min(460px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Editar cargo / regra
          </h3>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ano *">
                <input
                  type="number"
                  name="ano"
                  required
                  min={2020}
                  max={2099}
                  step={1}
                  defaultValue={cargo.ano}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Base *">
                <select name="base" required defaultValue={cargo.base} className={INPUT_CLASS} style={INPUT_STYLE}>
                  {BASE_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Cargo *">
              <input
                type="text"
                name="cargo"
                required
                maxLength={60}
                defaultValue={cargo.cargo}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Comissão %">
                <input
                  type="number"
                  name="comissaoPct"
                  required
                  min={0}
                  max={9.9999}
                  step={0.0001}
                  defaultValue={Number(cargo.comissaoPct)}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Gatilho %">
                <input
                  type="number"
                  name="gatilhoPct"
                  required
                  min={0}
                  max={9.9999}
                  step={0.0001}
                  defaultValue={Number(cargo.gatilhoPct)}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className={BTN_CANCEL_CLASS} style={BTN_CANCEL_STYLE}>
              Cancelar
            </button>
            <button type="submit" disabled={pending} className={BTN_SUBMIT_CLASS} style={BTN_SUBMIT_STYLE}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

// ─────────────────────────── Shared helpers ──────────────────────────────────

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
        <span className="mt-1 block text-[11px]" style={{ color: "var(--fg-subtle)" }}>
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

const DIALOG_STYLE = {
  backgroundColor: "var(--surface)",
  color: "var(--fg)",
  borderColor: "var(--border-soft)",
  boxShadow: "var(--shadow-md)",
} as const;

const INPUT_CLASS =
  "ring-focus w-full rounded-lg border px-3 py-2 text-[13px] outline-none";
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

const BTN_SUBMIT_CLASS =
  "rounded-lg px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60";
const BTN_SUBMIT_STYLE = {
  backgroundColor: "var(--color-brand-500)",
  color: "#fff",
} as const;
