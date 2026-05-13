"use client";

import { useState, useTransition } from "react";
import { criarConciliacaoAction } from "../actions";
import { CheckCircle2, AlertTriangle, Upload, FileSpreadsheet } from "lucide-react";

/** Form client-side que faz upload dos 2 arquivos + metadados pra criação. */
export default function NovaConciliacaoForm({
  dataReferenciaDefault,
}: {
  dataReferenciaDefault: string; // YYYY-MM-DD
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [financeiroFile, setFinanceiroFile] = useState<File | null>(null);
  const [contabilFile, setContabilFile] = useState<File | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      // Em caso de sucesso, a action faz redirect (não retorna).
      // Em caso de erro, retorna { ok: false, error }.
      try {
        const result = await criarConciliacaoAction(formData);
        if (result && !result.ok) setError(result.error);
      } catch (err) {
        // Erros de runtime (rede, etc.). Redirect lança internamente uma exceção
        // "Next.js redirect" que NÃO deve ser tratada — só falhas reais.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("NEXT_REDIRECT")) {
          setError(msg);
        }
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldText
          name="contaContabil"
          label="Conta Contábil"
          placeholder="ex: 1121010001 ou 1.1.2.10.1"
          required
          help="O número exato como aparece no balancete do Protheus."
        />
        <FieldText
          name="dataReferencia"
          label="Data de Referência"
          type="date"
          defaultValue={dataReferenciaDefault}
          required
          help="Geralmente o último dia do mês fechado (ex: 31/03/2026)."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FileUploadField
          name="financeiro"
          label="Relatório Financeiro (Posição de Títulos)"
          help="Excel exportado do Protheus — módulo Financeiro › Contas a Receber › Títulos a Receber."
          file={financeiroFile}
          onChange={setFinanceiroFile}
        />
        <FileUploadField
          name="contabil"
          label="Balancete Contábil"
          help="Excel exportado do Protheus — Contabilidade › Razão da conta de Clientes."
          file={contabilFile}
          onChange={setContabilFile}
        />
      </div>

      <FieldTextarea
        name="observacoes"
        label="Observações (opcional)"
        placeholder="Notas pra a equipe sobre essa conciliação"
        rows={3}
      />

      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border px-4 py-3 text-[13px]"
          style={{
            backgroundColor: "color-mix(in srgb, #e11d48 8%, var(--surface))",
            borderColor: "color-mix(in srgb, #e11d48 25%, var(--border-soft))",
            color: "#e11d48",
          }}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="leading-tight">
            <div className="font-semibold">Erro ao processar</div>
            <div className="mt-0.5">{error}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="ring-focus inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: "var(--color-brand-500)",
            color: "#fff",
          }}
        >
          {pending ? (
            <>
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Processando…
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Processar Conciliação
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function FieldText({
  name,
  label,
  type = "text",
  required,
  placeholder,
  defaultValue,
  help,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
        {required && <span style={{ color: "#e11d48" }}> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="ring-focus block w-full rounded-lg border px-3 py-2 text-[14px] transition-colors"
        style={{
          borderColor: "var(--border-soft)",
          backgroundColor: "var(--surface)",
          color: "var(--fg-strong)",
        }}
      />
      {help && (
        <span className="mt-1 block text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
          {help}
        </span>
      )}
    </label>
  );
}

function FieldTextarea({
  name,
  label,
  placeholder,
  rows = 3,
}: {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
      </span>
      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="ring-focus block w-full resize-y rounded-lg border px-3 py-2 text-[14px]"
        style={{
          borderColor: "var(--border-soft)",
          backgroundColor: "var(--surface)",
          color: "var(--fg-strong)",
        }}
      />
    </label>
  );
}

function FileUploadField({
  name,
  label,
  help,
  file,
  onChange,
}: {
  name: string;
  label: string;
  help?: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <span
        className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
        <span style={{ color: "#e11d48" }}> *</span>
      </span>
      <label
        className="ring-focus flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3.5 transition-colors hover:brightness-105"
        style={{
          borderColor: file ? "var(--color-brand-500)" : "var(--border-soft)",
          backgroundColor: file
            ? "color-mix(in srgb, var(--color-brand-500) 6%, var(--surface))"
            : "var(--surface)",
        }}
      >
        {file ? (
          <FileSpreadsheet
            className="size-5 shrink-0"
            style={{ color: "var(--color-brand-500)" }}
          />
        ) : (
          <Upload className="size-5 shrink-0" style={{ color: "var(--fg-muted)" }} />
        )}
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-medium"
            style={{ color: file ? "var(--fg-strong)" : "var(--fg-muted)" }}
          >
            {file ? file.name : "Clique para selecionar o arquivo .xlsx"}
          </div>
          {file && (
            <div className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
              {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>
        <input
          name={name}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {help && (
        <span className="mt-1 block text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
          {help}
        </span>
      )}
    </div>
  );
}
