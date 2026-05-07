import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "muted";

interface Props {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}

const PALETTE: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: {
    fg: "var(--fg)",
    bg: "var(--surface-2)",
    border: "var(--border-soft)",
  },
  muted: {
    fg: "var(--fg-muted)",
    bg: "var(--surface-2)",
    border: "var(--border-soft)",
  },
  brand: {
    fg: "var(--color-brand-700)",
    bg: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-brand-500) 28%, transparent)",
  },
  success: {
    fg: "#059669",
    bg: "color-mix(in srgb, #10b981 12%, transparent)",
    border: "color-mix(in srgb, #10b981 28%, transparent)",
  },
  warning: {
    fg: "#b45309",
    bg: "color-mix(in srgb, #f59e0b 14%, transparent)",
    border: "color-mix(in srgb, #f59e0b 30%, transparent)",
  },
  danger: {
    fg: "#e11d48",
    bg: "color-mix(in srgb, #e11d48 12%, transparent)",
    border: "color-mix(in srgb, #e11d48 28%, transparent)",
  },
};

export default function StatusBadge({ children, tone = "neutral", dot = true, className = "" }: Props) {
  const p = PALETTE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${className}`}
      style={{ color: p.fg, backgroundColor: p.bg, borderColor: p.border }}
    >
      {dot && <span className="size-1 rounded-full" style={{ backgroundColor: p.fg }} />}
      {children}
    </span>
  );
}
