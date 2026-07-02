import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtNum } from "@/lib/format";

interface Props {
  /** Página atual (1-based, já clampada pela page). */
  page: number;
  pageCount: number;
  /** Path da rota (ex: "/faturamento"). */
  pathname: string;
  /** SearchParams atuais — o link de página preserva todos os outros filtros. */
  searchParams: Record<string, string | undefined>;
  /** Nome do query param da página. Default: "page". */
  paramName?: string;
}

/**
 * Paginação URL-driven server-rendered (zero JS no cliente).
 * Segue o mesmo padrão do SortableHeader: cada página é um <Link> com
 * os demais params preservados.
 */
export default function Pagination({
  page,
  pageCount,
  pathname,
  searchParams,
  paramName = "page",
}: Props) {
  if (pageCount <= 1) return null;

  function hrefFor(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null && k !== paramName) params.set(k, v);
    }
    if (p > 1) params.set(paramName, String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const linkCls =
    "ring-focus inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] no-underline transition hover:bg-[var(--surface-2)]";
  const linkStyle = { borderColor: "var(--border-strong)", color: "var(--fg)" };
  const disabledStyle = {
    borderColor: "var(--border-soft)",
    color: "var(--fg-muted)",
    opacity: 0.5,
    pointerEvents: "none" as const,
  };

  return (
    <nav
      className="flex items-center justify-between gap-3 pt-4"
      aria-label="Paginação"
    >
      <Link
        href={hrefFor(page - 1)}
        aria-disabled={page <= 1}
        className={linkCls}
        style={page <= 1 ? disabledStyle : linkStyle}
      >
        <ChevronLeft className="size-3.5" />
        Anterior
      </Link>
      <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
        Página <strong style={{ color: "var(--fg-strong)" }}>{fmtNum(page)}</strong> de{" "}
        {fmtNum(pageCount)}
      </span>
      <Link
        href={hrefFor(page + 1)}
        aria-disabled={page >= pageCount}
        className={linkCls}
        style={page >= pageCount ? disabledStyle : linkStyle}
      >
        Próxima
        <ChevronRight className="size-3.5" />
      </Link>
    </nav>
  );
}
