"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface SegmentOption {
  value: string;
  label: ReactNode;
  /** Tooltip text. */
  hint?: string;
}

interface Props {
  /** Nome do query param. */
  name: string;
  options: SegmentOption[];
  /** Valor atual (lido do searchParams na page). */
  value: string;
  /** Aria label. */
  ariaLabel?: string;
  size?: "sm" | "md";
}

/**
 * Controle segmentado URL-driven (toggle de N opções).
 * Usado pra Granularidade (Dia/Semana/Mês) e Visualização (Bar/Pie/Tabela/Line).
 */
export default function SegmentedControl({
  name,
  options,
  value,
  ariaLabel,
  size = "md",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setValue(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set(name, v);
    else params.delete(name);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const padY = size === "sm" ? "py-1" : "py-1.5";
  const padX = size === "sm" ? "px-2" : "px-3";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-busy={isPending}
      className="inline-flex items-stretch gap-0.5 rounded-lg border p-0.5"
      style={{
        borderColor: "var(--border-strong)",
        backgroundColor: "var(--surface-2)",
        opacity: isPending ? 0.6 : 1,
        pointerEvents: isPending ? "none" : undefined,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => setValue(opt.value)}
            className={`ring-focus inline-flex items-center justify-center gap-1.5 rounded-md ${padX} ${padY} text-[12px] font-medium transition-colors`}
            style={{
              backgroundColor: active ? "var(--surface)" : "transparent",
              color: active ? "var(--fg-strong)" : "var(--fg-muted)",
              boxShadow: active ? "var(--shadow-sm)" : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
