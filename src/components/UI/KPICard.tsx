"use client";

import type { ReactNode } from "react";

type Trend = "up" | "down" | "flat";

export type KPITone = "neutral" | "brand" | "success" | "warning" | "danger";

interface KPICardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: string; trend: Trend };
  /**
   * Ícone JÁ RENDERIZADO (ReactNode) — o caller passa, por exemplo,
   * `icon={<ClipboardList className="size-4" />}`. Importante: passar o
   * COMPONENTE (LucideIcon) direto faria Next 15 tentar serializar
   * `forwardRef` cross-boundary (RSC → Client) e quebrar o render.
   */
  icon?: ReactNode;
  tone?: KPITone;
  /** Se passado, o card vira clicável e dispara o callback (para usar como filtro). */
  onClick?: () => void;
  /** Se true, mostra estado visual de "filtro ativo". */
  active?: boolean;
}

const TONE_ACCENT: Record<KPITone, string> = {
  neutral: "var(--fg-muted)",
  brand: "var(--color-brand-500)",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#e11d48",
};

const TONE_BG_TINT: Record<KPITone, string> = {
  neutral: "color-mix(in srgb, var(--fg-muted) 10%, transparent)",
  brand: "color-mix(in srgb, var(--color-brand-500) 10%, transparent)",
  success: "color-mix(in srgb, #10b981 10%, transparent)",
  warning: "color-mix(in srgb, #f59e0b 10%, transparent)",
  danger: "color-mix(in srgb, #e11d48 10%, transparent)",
};

export default function KPICard({
  label,
  value,
  hint,
  delta,
  icon,
  tone = "neutral",
  onClick,
  active = false,
}: KPICardProps) {
  const accent = TONE_ACCENT[tone];
  const tintBg = TONE_BG_TINT[tone];
  const clickable = !!onClick;

  const Component: React.ElementType = clickable ? "button" : "div";

  return (
    <Component
      type={clickable ? "button" : undefined}
      onClick={onClick}
      aria-pressed={clickable ? active : undefined}
      className={`group ring-focus relative flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
        clickable ? "cursor-pointer hover:-translate-y-px" : ""
      }`}
      style={{
        backgroundColor: "var(--surface)",
        borderColor: active ? accent : "var(--border-soft)",
        boxShadow: active ? `0 0 0 1px ${accent} inset, var(--shadow-sm)` : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)" }}
        >
          {label}
        </div>
        {icon && (
          <div
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: tintBg, color: accent }}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <div
          className="numeric text-[28px] font-semibold leading-none"
          style={{ color: "var(--fg-strong)" }}
        >
          {value}
        </div>
        {delta && (
          <div
            className="numeric text-[11px] font-medium"
            style={{
              color:
                delta.trend === "up"
                  ? "#10b981"
                  : delta.trend === "down"
                  ? "#e11d48"
                  : "var(--fg-muted)",
            }}
          >
            {delta.trend === "up" ? "↑" : delta.trend === "down" ? "↓" : "·"} {delta.value}
          </div>
        )}
      </div>

      {hint && (
        <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {hint}
        </div>
      )}

      {active && (
        <span
          aria-hidden
          className="absolute right-3 top-3 size-1.5 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 0 3px ${tintBg}` }}
        />
      )}
    </Component>
  );
}
