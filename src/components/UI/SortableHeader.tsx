"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  sortKey: string;
  children: ReactNode;
  /** Nome do query param de sort. Default: "sort". */
  sortParam?: string;
  /** Nome do query param de direção. Default: "dir". */
  dirParam?: string;
  align?: "left" | "right" | "center";
}

/**
 * Cabeçalho de coluna clicável que alterna sort: nada → asc → desc → nada.
 * Atualiza URL params, mantendo render server-side.
 */
export default function SortableHeader({
  sortKey,
  children,
  sortParam = "sort",
  dirParam = "dir",
  align = "left",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentKey = searchParams.get(sortParam);
  const currentDir = searchParams.get(dirParam);
  const isActive = currentKey === sortKey;

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (!isActive) {
      params.set(sortParam, sortKey);
      params.set(dirParam, "asc");
    } else if (currentDir === "asc") {
      params.set(dirParam, "desc");
    } else {
      params.delete(sortParam);
      params.delete(dirParam);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const Icon = !isActive ? ArrowUpDown : currentDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--surface)] ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
      style={{
        color: isActive ? "var(--fg-strong)" : "var(--fg-muted)",
      }}
    >
      <span>{children}</span>
      <Icon className="size-3" style={{ opacity: isActive ? 1 : 0.5 }} />
    </button>
  );
}
