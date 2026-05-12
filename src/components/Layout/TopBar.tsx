import ThemeToggle from "./ThemeToggle";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-20 flex h-14 items-center gap-3 px-6 backdrop-blur"
      style={{
        backgroundColor: "color-mix(in srgb, var(--canvas) 88%, transparent)",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div className="min-w-0 flex-1 leading-tight">
        <h1
          className="truncate text-[17px] font-bold tracking-tight"
          style={{ color: "var(--fg-strong)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      <ThemeToggle />
    </header>
  );
}
