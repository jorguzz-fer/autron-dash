"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, RefreshCw, Download, Loader2, CheckCircle2 } from "lucide-react";

type Status = "PENDING" | "RUNNING" | "PAUSED" | "DONE" | "FAILED";

interface Counters {
  status: Status;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export default function BatchProgress({
  batchId,
  filename,
  canWrite,
  initial,
}: {
  batchId: string;
  filename: string;
  canWrite: boolean;
  initial: Counters;
}) {
  const router = useRouter();
  const [c, setC] = useState<Counters>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza quando o batch selecionado muda (navegação entre lotes).
  useEffect(() => setC(initial), [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/enriquecimento/${batchId}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Counters;
      setC(data);
      if (data.status === "DONE" || data.status === "FAILED") {
        router.refresh(); // atualiza as tabelas do server
      }
    } catch {
      /* mantém o último estado em erro de rede transitório */
    }
  }, [batchId, router]);

  // Loop de polling enquanto está rodando (intervalo estável, só re-arma quando
  // o status muda — evita parar caso um poll não traga progresso).
  useEffect(() => {
    if (c.status !== "RUNNING") return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [c.status, poll]);

  async function trigger(retry = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/enriquecimento/${batchId}/run${retry ? "?retry=1" : ""}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Erro ${res.status}`);
        return;
      }
      setC((prev) => ({ ...prev, status: "RUNNING" }));
      setTimeout(poll, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  }

  const pct = c.total > 0 ? Math.round((c.processed / c.total) * 100) : 0;
  const running = c.status === "RUNNING";
  const done = c.status === "DONE";
  const pendentesRestantes = c.total - c.processed;

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-soft)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold tracking-tight" title={filename} style={{ color: "var(--fg-strong)" }}>
            {filename}
          </h3>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {c.processed.toLocaleString("pt-BR")} / {c.total.toLocaleString("pt-BR")} processados
          </p>
        </div>
        {done && <CheckCircle2 className="size-5 shrink-0" style={{ color: "#059669" }} />}
        {running && <Loader2 className="size-5 shrink-0 animate-spin" style={{ color: "var(--color-brand-500)" }} />}
      </div>

      {/* Barra de progresso */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--surface-2)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: done ? "#10b981" : "var(--color-brand-500)" }}
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="OK" value={c.succeeded} color="#059669" />
        <Stat label="Erros" value={c.failed} color="#e11d48" />
        <Stat label="Ignorados" value={c.skipped} color="var(--fg-muted)" />
        <Stat label="Restam" value={Math.max(0, pendentesRestantes)} color="var(--fg)" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canWrite && (c.status === "PENDING" || (running && pendentesRestantes > 0)) && (
          <button
            onClick={() => trigger(false)}
            disabled={busy}
            className="ring-focus inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-brand-600)" }}
          >
            {running ? <RefreshCw className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? "Continuar" : "Iniciar enriquecimento"}
          </button>
        )}
        {canWrite && done && c.failed > 0 && (
          <button
            onClick={() => trigger(true)}
            disabled={busy}
            className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
            style={{ borderColor: "var(--border-strong)", color: "var(--fg)" }}
          >
            <RefreshCw className="size-3.5" /> Re-tentar falhas
          </button>
        )}
        <a
          href={`/api/enriquecimento/${batchId}/export`}
          className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg)" }}
        >
          <Download className="size-3.5" /> Exportar Excel
        </a>
      </div>

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: "#e11d48" }}>{error}</p>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ backgroundColor: "var(--surface-2)" }}>
      <div className="numeric text-[15px] font-semibold" style={{ color }}>{value.toLocaleString("pt-BR")}</div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>{label}</div>
    </div>
  );
}
