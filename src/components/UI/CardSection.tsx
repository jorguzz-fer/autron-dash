import type { ReactNode } from "react";

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function CardSection({ title, subtitle, actions, children, className = "" }: Props) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border ${className}`}
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {(title || subtitle || actions) && (
        <header
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-soft)" }}
        >
          <div className="min-w-0 leading-tight">
            {title && (
              <h3
                className="text-[15px] font-semibold tracking-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
