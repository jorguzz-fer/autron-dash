"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dataset } from "@prisma/client";

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

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-100">{label}</h3>
          <code className="text-xs text-slate-500">{dataset}</code>
        </div>
        {lastUpload ? (
          <p className="text-xs text-slate-500 mt-1">
            Último: {lastUpload.rowCount.toLocaleString("pt-BR")} linhas por{" "}
            {lastUpload.userName}{" "}
            {lastUpload.finishedAt &&
              `em ${new Date(lastUpload.finishedAt).toLocaleString("pt-BR")}`}
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-1">Nenhum upload ainda.</p>
        )}
      </div>

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={dataset === "CLASSIFICACAO" ? ".csv" : ".xlsx"}
          onChange={onChange}
          disabled={disabled || submitting}
          className="block w-full text-xs text-slate-400
            file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
            file:text-sm file:font-medium file:bg-blue-500/10 file:text-blue-300
            hover:file:bg-blue-500/20 file:cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {submitting && (
        <p className="text-xs text-amber-400 flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
          Enviando e processando…
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {success}
        </p>
      )}
    </div>
  );
}
