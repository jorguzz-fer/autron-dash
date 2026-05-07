"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  name: string;
  label: string;
  options: FilterOption[];
  value?: string;
  /** Texto pra "todos" (default: "Todos"). */
  allLabel?: string;
}

/**
 * Select que reflete num query param (URL-driven). Mantém renderização server-side
 * — a página é um Server Component que lê `searchParams` e re-renderiza filtrado.
 */
export default function FilterSelect({
  name,
  label,
  options,
  value,
  allLabel = "Todos",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) params.set(name, e.target.value);
    else params.delete(name);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-1">
      <label
        className="block text-[11px] font-medium uppercase tracking-[0.06em]"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
      </label>
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={onChange}
          className="ring-focus w-full appearance-none rounded-lg border bg-[var(--surface)] px-3 py-2 pr-9 text-[13px] text-[color:var(--fg-strong)] outline-none transition focus:border-[var(--color-brand-500)]"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2"
          style={{ color: "var(--fg-muted)" }}
        />
      </div>
    </div>
  );
}
