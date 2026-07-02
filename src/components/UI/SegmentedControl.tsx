"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Se a navegação não completar nesse tempo, força reload (recupera de 503/RSC preso). */
const NAV_TIMEOUT_MS = 8000;

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
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A URL mudou → navegação concluiu → cancela o watchdog.
  useEffect(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
  }, [searchParams]);
  useEffect(() => () => { if (watchdog.current) clearTimeout(watchdog.current); }, []);

  function setValue(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set(name, v);
    else params.delete(name);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    // Guarda o scroll — se a nav RSC cair em 503, o Next recarrega a página
    // inteira; o <ScrollRestore> devolve a posição no load.
    try {
      sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY));
    } catch {}
    startTransition(() => {
      router.push(url, { scroll: false });
    });
    // Rede de segurança: navegação RSC presa em 503 deixaria isPending=true
    // e o controle desabilitado para sempre. Após NAV_TIMEOUT_MS sem a URL
    // mudar, força reload (reexecuta e cai numa janela saudável).
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      const current = window.location.pathname + window.location.search;
      if (current !== url) window.location.href = url;
    }, NAV_TIMEOUT_MS);
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
