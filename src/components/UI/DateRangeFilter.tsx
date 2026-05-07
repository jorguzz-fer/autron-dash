"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange, X } from "lucide-react";

interface Props {
  /** Nome do query param de "de". Default: "from". */
  fromParam?: string;
  /** Nome do query param de "até". Default: "to". */
  toParam?: string;
  fromValue?: string;
  toValue?: string;
  /** Rótulo principal (ex: "Emissão", "Faturamento"). */
  label?: string;
}

/**
 * Filtro de range de datas — input nativo type="date", URL-driven.
 * Server Component da página lê os params e ordena/filtra antes de render.
 */
export default function DateRangeFilter({
  fromParam = "from",
  toParam = "to",
  fromValue,
  toValue,
  label = "Período",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(fromParam);
    params.delete(toParam);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilter = !!(fromValue || toValue);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)" }}
        >
          <CalendarRange className="size-3" />
          {label} — De
        </label>
        <input
          type="date"
          value={fromValue ?? ""}
          onChange={(e) => setParam(fromParam, e.target.value)}
          className="ring-focus rounded-lg border bg-[var(--surface)] px-3 py-2 text-[13px] outline-none transition focus:border-[var(--color-brand-500)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)" }}
        />
      </div>
      <div className="space-y-1">
        <label
          className="block text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)" }}
        >
          Até
        </label>
        <input
          type="date"
          value={toValue ?? ""}
          onChange={(e) => setParam(toParam, e.target.value)}
          className="ring-focus rounded-lg border bg-[var(--surface)] px-3 py-2 text-[13px] outline-none transition focus:border-[var(--color-brand-500)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)" }}
        />
      </div>
      {hasFilter && (
        <button
          type="button"
          onClick={clear}
          className="ring-focus inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[12px] transition hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg-muted)" }}
        >
          <X className="size-3.5" />
          Limpar
        </button>
      )}
    </div>
  );
}
