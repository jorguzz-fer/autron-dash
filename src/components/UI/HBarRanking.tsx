import { fmtNum } from "@/lib/format";

interface Item {
  label: string;
  value: number;
  /** Valor opcional já formatado para exibição (sobrescreve fmtNum). */
  display?: string;
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
        return (
          <li key={`${i}-${it.label}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span
                className="min-w-0 truncate"
                style={{ color: "var(--fg)" }}
                title={it.label}
              >
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
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--surface-2)" }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, backgroundColor: TONE_BG[tone] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
