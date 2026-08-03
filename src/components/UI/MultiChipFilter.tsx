"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface ChipOption {
  value: string;
  label: string;
}

interface Props {
  /** Nome do query param (valores separados por vírgula). */
  name: string;
  label: string;
  options: ChipOption[];
  /** Valores atualmente selecionados (lidos do param na página). */
  selected: string[];
  /** Máx. de chips visíveis antes de "+N" (default 14). */
  maxVisible?: number;
  /** Texto do chip que limpa a seleção (default "Todos"). */
  allLabel?: string;
}

/**
 * Filtro multi-seleção URL-driven por chips (toggle). Marca vários valores de
 * uma vez — usado para compor territórios (estados/cidades/vendedores) e
 * "simular regiões de atendimento". O estado mora na URL (param `name` com os
 * valores separados por vírgula), preservando os demais filtros.
 */
export default function MultiChipFilter({
  name,
  label,
  options,
  selected,
  maxVisible = 14,
  allLabel = "Todos",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const selectedSet = new Set(selected);

  function apply(values: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (values.length > 0) params.set(name, values.join(","));
    else params.delete(name);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Serializa na ordem das opções e PRESERVA seleções fora da lista visível
    // (ex.: cidade escolhida antes de estreitar por UF não pode ser perdida).
    const optionVals = new Set(options.map((o) => o.value));
    const inOptions = options.filter((o) => next.has(o.value)).map((o) => o.value);
    const extras = Array.from(next).filter((v) => !optionVals.has(v));
    apply([...inOptions, ...extras]);
  }

  const visible = expanded ? options : options.slice(0, maxVisible);
  const hidden = options.length - visible.length;

  return (
    <div className="space-y-1" aria-busy={isPending} style={{ opacity: isPending ? 0.6 : 1 }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
          {label}
        </span>
        {selectedSet.size > 0 && (
          <span className="text-[10.5px] font-semibold" style={{ color: "var(--color-brand-500)" }}>
            {selectedSet.size} selec.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={selectedSet.size === 0} onClick={() => apply([])}>
          {allLabel}
        </Chip>
        {visible.map((o) => (
          <Chip key={o.value} active={selectedSet.has(o.value)} onClick={() => toggle(o.value)}>
            {o.label}
          </Chip>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ring-focus rounded-full px-2 py-1 text-[11.5px] font-medium underline underline-offset-2"
            style={{ color: "var(--fg-muted)" }}
          >
            +{hidden}
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="ring-focus inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
      style={{
        backgroundColor: active ? "var(--color-brand-500)" : "var(--surface-2)",
        color: active ? "#fff" : "var(--fg-muted)",
        border: `1px solid ${active ? "var(--color-brand-500)" : "var(--border-soft)"}`,
      }}
    >
      {children}
    </button>
  );
}
