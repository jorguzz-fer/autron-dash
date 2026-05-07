import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

export type NavTone = "brand" | "violet" | "amber" | "emerald" | "rose" | "cyan" | "indigo";

interface NavCardProps {
  href: string;
  title: string;
  subtitle: string;
  /** Pequena estatística/destaque no rodapé (ex: "159 PVs · R$ 5.4M"). */
  stat?: string;
  /** Ícone como ReactNode (ex: <Activity className="size-5" />). Aceita ReactNode em vez de LucideIcon para evitar problemas de serialização em Client Components futuros. */
  icon: ReactNode;
  tone: NavTone;
}

const TONE_PALETTE: Record<
  NavTone,
  { fg: string; iconBg: string; cardBg: string; border: string }
> = {
  brand: {
    fg: "var(--color-brand-700)",
    iconBg: "color-mix(in srgb, var(--color-brand-500) 18%, transparent)",
    cardBg: "color-mix(in srgb, var(--color-brand-500) 5%, var(--surface))",
    border: "color-mix(in srgb, var(--color-brand-500) 22%, var(--border-soft))",
  },
  violet: {
    fg: "#7c3aed",
    iconBg: "color-mix(in srgb, #8b5cf6 18%, transparent)",
    cardBg: "color-mix(in srgb, #8b5cf6 5%, var(--surface))",
    border: "color-mix(in srgb, #8b5cf6 22%, var(--border-soft))",
  },
  amber: {
    fg: "#b45309",
    iconBg: "color-mix(in srgb, #f59e0b 18%, transparent)",
    cardBg: "color-mix(in srgb, #f59e0b 5%, var(--surface))",
    border: "color-mix(in srgb, #f59e0b 22%, var(--border-soft))",
  },
  emerald: {
    fg: "#047857",
    iconBg: "color-mix(in srgb, #10b981 18%, transparent)",
    cardBg: "color-mix(in srgb, #10b981 5%, var(--surface))",
    border: "color-mix(in srgb, #10b981 22%, var(--border-soft))",
  },
  rose: {
    fg: "#be123c",
    iconBg: "color-mix(in srgb, #f43f5e 18%, transparent)",
    cardBg: "color-mix(in srgb, #f43f5e 5%, var(--surface))",
    border: "color-mix(in srgb, #f43f5e 22%, var(--border-soft))",
  },
  cyan: {
    fg: "#0e7490",
    iconBg: "color-mix(in srgb, #06b6d4 18%, transparent)",
    cardBg: "color-mix(in srgb, #06b6d4 5%, var(--surface))",
    border: "color-mix(in srgb, #06b6d4 22%, var(--border-soft))",
  },
  indigo: {
    fg: "#4338ca",
    iconBg: "color-mix(in srgb, #6366f1 18%, transparent)",
    cardBg: "color-mix(in srgb, #6366f1 5%, var(--surface))",
    border: "color-mix(in srgb, #6366f1 22%, var(--border-soft))",
  },
};

export default function NavCard({ href, title, subtitle, stat, icon, tone }: NavCardProps) {
  const p = TONE_PALETTE[tone];
  return (
    <Link
      href={href}
      className="ring-focus group relative flex flex-col gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
      style={{
        backgroundColor: p.cardBg,
        borderColor: p.border,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex size-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: p.iconBg, color: p.fg }}
        >
          {icon}
        </div>
        <div
          className="flex size-7 items-center justify-center rounded-full transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          style={{ color: p.fg, backgroundColor: "transparent" }}
        >
          <ArrowUpRight className="size-4" />
        </div>
      </div>

      <div className="space-y-1 leading-tight">
        <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
          {title}
        </h3>
        <p className="text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
          {subtitle}
        </p>
      </div>

      {stat && (
        <div
          className="numeric mt-auto rounded-lg border px-2.5 py-1.5 text-[12px] font-medium"
          style={{
            color: p.fg,
            backgroundColor: "color-mix(in srgb, var(--surface) 70%, transparent)",
            borderColor: p.border,
          }}
        >
          {stat}
        </div>
      )}
    </Link>
  );
}
