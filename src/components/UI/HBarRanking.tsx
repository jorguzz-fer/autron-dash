import Link from "next/link";
import { fmtNum } from "@/lib/format";

interface Item {
  label: string;
  value: number;
  /** Valor opcional já formatado para exibição (sobrescreve fmtNum). */
  display?: string;
  /** Se passado, a linha vira clicável (URL-driven, ex: filtro da tabela). */
  href?: string;
  /** Marca a linha como filtro ativo (destaque visual). */
  active?: boolean;
}

interface Props {
  items: Item[];
  /** Cor da barra. Default: brand. */
  tone?: "brand" | "success" | "warning" | "danger";
  /** Limita ao top N (default: items.length). */
  topN?: number;
}

const TONE_BG: Record<NonNullable<Props["tone"]>, string> = {
  brand: "var(--color-brand-500)",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#e11d48",
};

/** Bar chart horizontal minimalista — sem JS de gráfico, render-on-server-friendly. */
export default function HBarRanking({ items, tone = "brand", topN }: Props) {
  const top = topN ? items.slice(0, topN) : items;
  const max = Math.max(1, ...top.map((it) => it.value));

  if (top.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
        Sem dados.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {top.map((it, i) => {
        const pct = (it.value / max) * 100;
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span
                className="min-w-0 truncate"
                style={{ color: it.active ? TONE_BG[tone] : "var(--fg)" }}
                title={it.label}
              >
                {it.active && "✓ "}
                {it.label}
              </span>
              <span
                className="numeric shrink-0 font-medium"
                style={{ color: "var(--fg-strong)" }}
              >
                {it.display ?? fmtNum(it.value)}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--surface-2)" }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, backgroundColor: TONE_BG[tone] }}
              />
            </div>
          </>
        );

        if (it.href) {
          return (
            <li key={`${i}-${it.label}`}>
              <Link
                href={it.href}
                aria-current={it.active ? "true" : undefined}
                className="ring-focus block rounded-md px-2 py-1.5 no-underline transition-colors hover:bg-[var(--surface-2)]"
                style={{
                  backgroundColor: it.active
                    ? "color-mix(in srgb, var(--color-brand-500) 8%, transparent)"
                    : undefined,
                }}
              >
                {inner}
              </Link>
            </li>
          );
        }

        return (
          <li key={`${i}-${it.label}`} className="space-y-1">
            {inner}
          </li>
        );
      })}
    </ul>
  );
}
