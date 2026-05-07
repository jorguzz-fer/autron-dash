import { type LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  icon: LucideIcon;
  phaseNumber: number;
  title: string;
  description: string;
  bullets: string[];
}

export default function PlaceholderPage({
  icon: Icon,
  phaseNumber,
  title,
  description,
  bullets,
}: PlaceholderPageProps) {
  return (
    <div
      className="rounded-2xl border p-8"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start gap-5">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            color: "var(--color-brand-600)",
            backgroundColor: "color-mix(in srgb, var(--color-brand-500) 14%, transparent)",
          }}
        >
          <Icon className="size-6" />
        </div>
        <div className="flex-1 space-y-3">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em]"
            style={{
              color: "var(--fg-muted)",
              backgroundColor: "var(--surface-2)",
              borderColor: "var(--border-soft)",
            }}
          >
            Fase {phaseNumber} — em construção
          </div>
          <h2
            className="text-[20px] font-semibold tracking-tight"
            style={{ color: "var(--fg-strong)" }}
          >
            {title}
          </h2>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {description}
          </p>
          <ul className="space-y-1.5 pt-1">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px]"
                style={{ color: "var(--fg)" }}
              >
                <span
                  className="mt-1.5 size-1 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--color-brand-500)" }}
                />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
