"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dataset } from "@prisma/client";
import { CloudUpload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";

interface LastUpload {
  filename: string;
  rowCount: number;
  finishedAt: string | null;
  userName: string;
}

interface UploadCardProps {
  dataset: Dataset;
  label: string;
  disabled: boolean;
  lastUpload: LastUpload | null;
}

export default function UploadCard({ dataset, label, disabled, lastUpload }: UploadCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/uploads/${dataset.toLowerCase()}`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Erro ${res.status}`);
        return;
      }
      const warn =
        Array.isArray(data?.warnings) && data.warnings.length > 0
          ? ` (${data.warnings.join("; ")})`
          : "";
      setSuccess(
        `${data.rowCount.toLocaleString("pt-BR")} linha(s) importadas` +
          (data.skipped ? `, ${data.skipped} ignorada(s)` : "") +
          warn,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const accept = dataset === "CLASSIFICACAO" ? ".csv" : ".xlsx";

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" style={{ color: "var(--color-brand-500)" }} />
            <h3 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
              {label}
            </h3>
          </div>
          {lastUpload ? (
            <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Último: <span className="numeric font-medium" style={{ color: "var(--fg)" }}>
                {lastUpload.rowCount.toLocaleString("pt-BR")}
              </span> linhas por {lastUpload.userName}
              {lastUpload.finishedAt && (
                <> em {new Date(lastUpload.finishedAt).toLocaleString("pt-BR")}</>
              )}
            </p>
          ) : (
            <p className="mt-1 text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Nenhum upload ainda.
            </p>
          )}
        </div>
        <code
          className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px]"
          style={{ color: "var(--fg-muted)", backgroundColor: "var(--surface-2)" }}
        >
          {dataset}
        </code>
      </div>

      {/* Dropzone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-all ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "hover:bg-[var(--surface-2)]"
        }`}
        style={{
          borderColor: dragOver
            ? "var(--color-brand-500)"
            : "var(--border-strong)",
          backgroundColor: dragOver
            ? "color-mix(in srgb, var(--color-brand-500) 5%, transparent)"
            : "transparent",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          disabled={disabled || submitting}
          className="sr-only"
        />
        <div
          className="flex size-10 items-center justify-center rounded-full"
          style={{
            color: "var(--color-brand-600)",
            backgroundColor: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)",
          }}
        >
          <CloudUpload className="size-5" />
        </div>
        <div className="text-[13px] font-medium" style={{ color: "var(--fg-strong)" }}>
          {submitting ? "Enviando…" : `Arraste o ${accept} aqui ou clique para selecionar`}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
          {dataset === "CLASSIFICACAO" ? "CSV (latin-1, separador ;)" : "Planilha Excel (.xlsx)"} · até 20MB
        </div>
      </label>

      {/* Feedback */}
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
      {success && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]"
          style={{
            color: "#059669",
            backgroundColor: "color-mix(in srgb, #10b981 8%, transparent)",
            borderColor: "color-mix(in srgb, #10b981 28%, transparent)",
          }}
        >
          <CheckCircle2 className="mt-px size-3.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
}
