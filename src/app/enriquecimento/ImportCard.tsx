"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, FileSpreadsheet, AlertCircle } from "lucide-react";

export default function ImportCard({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/enriquecimento/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Erro ${res.status}`);
        return;
      }
      // Vai para o lote recém-criado (mostra o BatchProgress com "Iniciar").
      router.push(`/enriquecimento?batch=${data.batchId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-soft)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="size-4" style={{ color: "var(--color-brand-500)" }} />
        <h3 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
          Importar cadastros
        </h3>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
        Planilha com colunas <strong>Nome/Razão Social</strong> e <strong>CNPJ/CPF</strong>
        {" "}(abas “Clientes”/“Fornecedores” suportadas).
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-all ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:bg-[var(--surface-2)]"
        }`}
        style={{
          borderColor: dragOver ? "var(--color-brand-500)" : "var(--border-strong)",
          backgroundColor: dragOver ? "color-mix(in srgb, var(--color-brand-500) 5%, transparent)" : "transparent",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={disabled || submitting}
          className="sr-only"
        />
        <div
          className="flex size-10 items-center justify-center rounded-full"
          style={{ color: "var(--color-brand-600)", backgroundColor: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)" }}
        >
          <CloudUpload className="size-5" />
        </div>
        <div className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>
          {submitting ? "Importando…" : "Arraste .xlsx/.csv aqui ou clique para selecionar"}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
          Excel (.xlsx) ou CSV · até 20MB
        </div>
      </label>

      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]"
          style={{
            color: "#e11d48",
            backgroundColor: "color-mix(in srgb, #e11d48 8%, transparent)",
            borderColor: "color-mix(in srgb, #e11d48 28%, transparent)",
          }}
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
