"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { UserPlus, Pencil } from "lucide-react";
import { criarVendedor, atualizarVendedor } from "./actions";

const TIPO_OPTIONS = [
  { value: "CLT", label: "CLT" },
  { value: "PJ", label: "PJ" },
  { value: "REPRESENTANTE", label: "Representante" },
] as const;

interface VendedorData {
  id: string;
  codigoProtheus: string;
  nome: string;
  cargo: string;
  tipo: string;
  nivel: number | null;
  gatilhoOverride: string | number | null;
  comissaoOverride: string | number | null;
  supervisorCodigo: string | null;
  garantidoValor: string | number | null;
  garantidoInicio: string | null; // "YYYY-MM"
  garantidoMeses: number | null;
  ativo: boolean;
}

export interface SupervisorOption {
  codigoProtheus: string;
  nome: string;
}

/** Lê os campos comuns (supervisor + garantido) de um FormData. */
function readExtraFields(fd: FormData) {
  return {
    supervisorCodigo: String(fd.get("supervisorCodigo") ?? "").trim() || null,
    garantidoValor: fd.get("garantidoValor") ? Number(fd.get("garantidoValor")) : null,
    garantidoInicio: String(fd.get("garantidoInicio") ?? "").trim() || null,
    garantidoMeses: fd.get("garantidoMeses") ? Number(fd.get("garantidoMeses")) : null,
  };
}

// ─────────────────────────── Criar Vendedor ──────────────────────────────────

export function VendedorCriarBtn({ supervisores = [] }: { supervisores?: SupervisorOption[] }) {
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
      codigoProtheus: String(fd.get("codigoProtheus") ?? "").trim(),
      nome: String(fd.get("nome") ?? "").trim(),
      cargo: String(fd.get("cargo") ?? "").trim(),
      tipo: String(fd.get("tipo") ?? "CLT"),
      nivel: fd.get("nivel") ? Number(fd.get("nivel")) : null,
      gatilhoOverride: fd.get("gatilhoOverride") ? Number(fd.get("gatilhoOverride")) : null,
      comissaoOverride: fd.get("comissaoOverride") ? Number(fd.get("comissaoOverride")) : null,
      ...readExtraFields(fd),
      ativo: fd.get("ativo") === "on",
    };

    startTransition(async () => {
      const result = await criarVendedor(input);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess("Vendedor criado com sucesso.");
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
        <UserPlus className="size-3.5" />
        Novo vendedor
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border p-0 backdrop:bg-black/50"
        style={DIALOG_STYLE}
      >
        <form onSubmit={handleSubmit} className="w-[min(480px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Novo vendedor
          </h3>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            Preencha os dados do vendedor para vinculá-lo às regras de comissão.
          </p>

          <div className="mt-4 space-y-3">
            <Field label="Código Protheus *">
              <input
                type="text"
                name="codigoProtheus"
                required
                maxLength={30}
                autoComplete="off"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Nome *">
              <input
                type="text"
                name="nome"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo *" hint="ex: INSIDE, HUNTER, REGIONAL">
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

              <Field label="Tipo *">
                <select name="tipo" required defaultValue="CLT" className={INPUT_CLASS} style={INPUT_STYLE}>
                  {TIPO_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nível" hint="1–10, opcional">
                <input
                  type="number"
                  name="nivel"
                  min={1}
                  max={10}
                  step={1}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Gatilho override" hint="ex: 0.7 = 70%, opcional">
                <input
                  type="number"
                  name="gatilhoOverride"
                  min={0}
                  max={9.9999}
                  step={0.0001}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
            </div>

            <Field label="Comissão override" hint="% individual — ex: 0.015 = 1,5%. Vazio usa o % do cargo.">
              <input
                type="number"
                name="comissaoOverride"
                min={0}
                max={9.9999}
                step={0.0001}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Supervisor (carteira)" hint="gestor cuja carteira soma este vendedor; opcional">
              <SupervisorSelect supervisores={supervisores} />
            </Field>

            <GarantidoFields />

            <label className="flex items-center gap-2 cursor-pointer text-[13px]" style={{ color: "var(--fg)" }}>
              <input type="checkbox" name="ativo" defaultChecked className="size-4 rounded" />
              Ativo
            </label>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}
          {success && <SuccessBox>{success}</SuccessBox>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className={BTN_CANCEL_CLASS} style={BTN_CANCEL_STYLE}>
              Cancelar
            </button>
            <button type="submit" disabled={pending} className={BTN_SUBMIT_CLASS} style={BTN_SUBMIT_STYLE}>
              {pending ? "Criando..." : "Criar vendedor"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

// ─────────────────────────── Editar Vendedor ─────────────────────────────────

export function VendedorEditarBtn({
  vendedor,
  supervisores = [],
}: {
  vendedor: VendedorData;
  supervisores?: SupervisorOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const input = {
      codigoProtheus: String(fd.get("codigoProtheus") ?? "").trim(),
      nome: String(fd.get("nome") ?? "").trim(),
      cargo: String(fd.get("cargo") ?? "").trim(),
      tipo: String(fd.get("tipo") ?? "CLT"),
      nivel: fd.get("nivel") ? Number(fd.get("nivel")) : null,
      gatilhoOverride: fd.get("gatilhoOverride") ? Number(fd.get("gatilhoOverride")) : null,
      comissaoOverride: fd.get("comissaoOverride") ? Number(fd.get("comissaoOverride")) : null,
      ...readExtraFields(fd),
      ativo: fd.get("ativo") === "on",
    };

    startTransition(async () => {
      const result = await atualizarVendedor(vendedor.id, input);
      if (!result.ok) {
        setError(result.error);
      } else {
        dialogRef.current?.close();
      }
    });
  }

  const gatilhoNum =
    vendedor.gatilhoOverride != null ? Number(vendedor.gatilhoOverride) : "";
  const comissaoNum =
    vendedor.comissaoOverride != null ? Number(vendedor.comissaoOverride) : "";

  return (
    <>
      <button
        type="button"
        aria-label="Editar vendedor"
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
        <form onSubmit={handleSubmit} className="w-[min(480px,calc(100vw-32px))] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Editar vendedor
          </h3>

          <div className="mt-4 space-y-3">
            <Field label="Código Protheus *">
              <input
                type="text"
                name="codigoProtheus"
                required
                maxLength={30}
                defaultValue={vendedor.codigoProtheus}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Nome *">
              <input
                type="text"
                name="nome"
                required
                minLength={2}
                maxLength={120}
                defaultValue={vendedor.nome}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo *">
                <input
                  type="text"
                  name="cargo"
                  required
                  maxLength={60}
                  defaultValue={vendedor.cargo}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Tipo *">
                <select name="tipo" required defaultValue={vendedor.tipo} className={INPUT_CLASS} style={INPUT_STYLE}>
                  {TIPO_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nível">
                <input
                  type="number"
                  name="nivel"
                  min={1}
                  max={10}
                  step={1}
                  defaultValue={vendedor.nivel ?? ""}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>

              <Field label="Gatilho override">
                <input
                  type="number"
                  name="gatilhoOverride"
                  min={0}
                  max={9.9999}
                  step={0.0001}
                  defaultValue={gatilhoNum}
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </Field>
            </div>

            <Field label="Comissão override" hint="% individual — ex: 0.015 = 1,5%. Vazio usa o % do cargo.">
              <input
                type="number"
                name="comissaoOverride"
                min={0}
                max={9.9999}
                step={0.0001}
                defaultValue={comissaoNum}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Supervisor (carteira)" hint="gestor cuja carteira soma este vendedor; opcional">
              <SupervisorSelect
                supervisores={supervisores.filter((s) => s.codigoProtheus !== vendedor.codigoProtheus)}
                value={vendedor.supervisorCodigo ?? ""}
              />
            </Field>

            <GarantidoFields
              valor={vendedor.garantidoValor != null ? Number(vendedor.garantidoValor) : undefined}
              inicio={vendedor.garantidoInicio ?? undefined}
              meses={vendedor.garantidoMeses ?? undefined}
            />

            <label className="flex items-center gap-2 cursor-pointer text-[13px]" style={{ color: "var(--fg)" }}>
              <input
                type="checkbox"
                name="ativo"
                defaultChecked={vendedor.ativo}
                className="size-4 rounded"
              />
              Ativo
            </label>
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

// ─────────────────────────── Supervisor & Garantido ──────────────────────────

function SupervisorSelect({
  supervisores,
  value = "",
}: {
  supervisores: SupervisorOption[];
  value?: string;
}) {
  return (
    <select name="supervisorCodigo" defaultValue={value} className={INPUT_CLASS} style={INPUT_STYLE}>
      <option value="">— sem supervisor (individual) —</option>
      {supervisores.map((s) => (
        <option key={s.codigoProtheus} value={s.codigoProtheus}>
          {s.codigoProtheus} — {s.nome}
        </option>
      ))}
    </select>
  );
}

function GarantidoFields({
  valor,
  inicio,
  meses,
}: {
  valor?: number;
  inicio?: string;
  meses?: number;
}) {
  return (
    <fieldset
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--border-soft)" }}
    >
      <legend className="px-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
        Garantido (opcional)
      </legend>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Valor/mês" hint="ex: 2000">
          <input
            type="number"
            name="garantidoValor"
            min={0}
            step={0.01}
            defaultValue={valor ?? ""}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
        <Field label="Início" hint="mês/ano">
          <input
            type="month"
            name="garantidoInicio"
            defaultValue={inicio ?? ""}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
        <Field label="Meses" hint="3–4">
          <input
            type="number"
            name="garantidoMeses"
            min={1}
            max={12}
            step={1}
            defaultValue={meses ?? ""}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
      </div>
    </fieldset>
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
