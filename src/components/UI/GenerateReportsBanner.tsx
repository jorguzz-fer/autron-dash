"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Sparkles,
  Activity,
  Boxes,
  Clock,
  CircleAlert,
} from "lucide-react";
import { runReports, type ReportsSummary } from "@/app/actions";

interface DatasetState {
  loaded: number; // 0..5
  total: number; // 5
}

interface Props {
  state: DatasetState;
}

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; summary: ReportsSummary }
  | { kind: "error"; message: string };

export default function GenerateReportsBanner({ state }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [, startTransition] = useTransition();

  const ready = state.loaded === state.total;
  const fraction = state.loaded / state.total;

  function onGenerate() {
    setPhase({ kind: "running" });
    startTransition(async () => {
      const r = await runReports();
      if (!r.ok) {
        setPhase({ kind: "error", message: r.error });
      } else {
        setPhase({ kind: "done", summary: r.summary });
      }
    });
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: ready ? "var(--color-brand-500)" : "var(--border-soft)",
        boxShadow: ready
          ? `0 0 0 1px var(--color-brand-500) inset, var(--shadow-md)`
          : "var(--shadow-sm)",
      }}
    >
      {/* Loading bar (sticky no topo, indeterminate) */}
      {phase.kind === "running" && (
        <div
          className="absolute left-0 right-0 top-0 h-1 overflow-hidden"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-500) 14%, transparent)" }}
        >
          <div
            className="loadbar h-full w-1/3 rounded-r-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--color-brand-500), transparent)",
            }}
          />
          <style>{`
            @keyframes loadbar {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(400%); }
            }
            .loadbar { animation: loadbar 1.4s var(--ease-out-expo, cubic-bezier(0.16,1,0.3,1)) infinite; }
          `}</style>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {phase.kind === "idle" && (
          <Idle ready={ready} state={state} fraction={fraction} onGenerate={onGenerate} />
        )}
        {phase.kind === "running" && <Running />}
        {phase.kind === "done" && (
          <Done summary={phase.summary} onGoToDashboard={() => router.push("/visao-geral")} />
        )}
        {phase.kind === "error" && <ErrorState message={phase.message} onRetry={onGenerate} />}
      </div>
    </section>
  );
}

// ─── Phases ──────────────────────────────────────────────────────────────

function Idle({
  ready,
  state,
  fraction,
  onGenerate,
}: {
  ready: boolean;
  state: DatasetState;
  fraction: number;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: ready
              ? "color-mix(in srgb, var(--color-brand-500) 14%, transparent)"
              : "var(--surface-2)",
            color: ready ? "var(--color-brand-600)" : "var(--fg-muted)",
          }}
        >
          {ready ? <Sparkles className="size-5" /> : <Activity className="size-5" />}
        </div>
        <div className="space-y-1.5">
          <h2
            className="text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--fg-strong)" }}
          >
            {ready ? "Dados prontos para análise" : "Carregue todas as planilhas"}
          </h2>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            {ready
              ? `Os ${state.total} datasets foram importados com sucesso. Gere os relatórios para enriquecer os pedidos com alocação de estoque, prontidão e ações necessárias.`
              : `${state.loaded} de ${state.total} datasets carregados. Faltam ${
                  state.total - state.loaded
                } pra você poder gerar os relatórios.`}
          </p>
          {/* Progresso visual (steps) */}
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: state.total }, (_, i) => (
              <div
                key={i}
                className="h-1.5 w-8 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i < state.loaded
                      ? "var(--color-brand-500)"
                      : "var(--surface-2)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={!ready}
        className="ring-focus group flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: ready ? "var(--color-brand-600)" : "var(--surface-2)",
          color: ready ? "#fff" : "var(--fg-muted)",
        }}
      >
        <Sparkles className="size-4" />
        Gerar relatórios
        {ready && (
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
    </div>
  );
}

function Running() {
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-brand-500) 14%, transparent)",
          color: "var(--color-brand-600)",
        }}
      >
        <Loader2 className="size-5 animate-spin" />
      </div>
      <div className="space-y-1">
        <h2
          className="text-[16px] font-semibold tracking-tight"
          style={{ color: "var(--fg-strong)" }}
        >
          Processando…
        </h2>
        <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
          Aplicando regras de alocação FIFO de estoque, consolidação de follow-up e
          árvore de decisão de ação necessária. Em segundos você terá o sumário.
        </p>
      </div>
    </div>
  );
}

function Done({
  summary,
  onGoToDashboard,
}: {
  summary: ReportsSummary;
  onGoToDashboard: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: "color-mix(in srgb, #10b981 14%, transparent)",
              color: "#059669",
            }}
          >
            <Sparkles className="size-5" />
          </div>
          <div className="space-y-1">
            <h2
              className="text-[16px] font-semibold tracking-tight"
              style={{ color: "var(--fg-strong)" }}
            >
              Relatórios gerados em{" "}
              <span className="numeric">{(summary.durationMs / 1000).toFixed(2)}s</span>
            </h2>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Pipeline completo aplicado:{" "}
              <span className="numeric font-medium" style={{ color: "var(--fg)" }}>
                {summary.totalPedidos.toLocaleString("pt-BR")}
              </span>{" "}
              pedidos enriquecidos.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToDashboard}
          className="ring-focus group flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-600)] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--color-brand-700)]"
        >
          Abrir Visão Geral
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SummaryStat
          icon={<Boxes className="size-4" />}
          label="Em aberto"
          value={summary.emAberto}
          tone="brand"
        />
        <SummaryStat
          icon={<Clock className="size-4" />}
          label="Atrasados"
          value={summary.atrasados}
          tone="danger"
        />
        <SummaryStat
          icon={<Sparkles className="size-4" />}
          label="Prontos"
          value={summary.prontos}
          tone="success"
        />
        <SummaryStat
          icon={<CircleAlert className="size-4" />}
          label="Erros cadastro"
          value={summary.errosCadastro}
          tone="warning"
        />
      </div>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "brand" | "success" | "warning" | "danger";
}) {
  const colorMap = {
    brand: { fg: "var(--color-brand-600)", tint: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)" },
    success: { fg: "#059669", tint: "color-mix(in srgb, #10b981 12%, transparent)" },
    warning: { fg: "#b45309", tint: "color-mix(in srgb, #f59e0b 14%, transparent)" },
    danger: { fg: "#e11d48", tint: "color-mix(in srgb, #e11d48 12%, transparent)" },
  } as const;
  const c = colorMap[tone];
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        backgroundColor: "var(--surface-2)",
        borderColor: "var(--border-soft)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10.5px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)" }}
        >
          {label}
        </span>
        <span
          className="flex size-6 items-center justify-center rounded-md"
          style={{ backgroundColor: c.tint, color: c.fg }}
        >
          {icon}
        </span>
      </div>
      <div
        className="numeric mt-1.5 text-[22px] font-semibold leading-none"
        style={{ color: "var(--fg-strong)" }}
      >
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "color-mix(in srgb, #e11d48 12%, transparent)",
            color: "#e11d48",
          }}
        >
          <AlertCircle className="size-5" />
        </div>
        <div className="space-y-1">
          <h2
            className="text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--fg-strong)" }}
          >
            Falha ao gerar relatórios
          </h2>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            {message}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="ring-focus shrink-0 rounded-lg border px-4 py-2 text-[13px] font-medium transition hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-strong)", color: "var(--fg)" }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
