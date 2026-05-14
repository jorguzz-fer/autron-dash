import type { ReactNode } from "react";
import SortableHeader from "./SortableHeader";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  cell: (row: T) => ReactNode;
  /** Se passado, o header vira clicável (URL-driven sort) usando este key. */
  sortKey?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: ReactNode;
  emptyMessage?: string;
  /** Nome do query param de sort. Default: "sort". Passe um valor único por página se houver múltiplas tabelas. */
  sortParam?: string;
  /** Nome do query param de direção. Default: "dir". */
  dirParam?: string;
  /**
   * Altura máxima da área da tabela (CSS válido — px, vh, calc...).
   * Quando definida, o `<thead>` fica congelado (sticky) e a tabela rola internamente.
   * Default: "calc(100vh - 220px)" — espaço pra TopBar (56px) + título da página + margens.
   * Passe `null` pra desabilitar o scroll interno e usar layout natural (rolagem pela página).
   */
  maxHeight?: string | null;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "Nenhum registro.",
  sortParam = "sort",
  dirParam = "dir",
  maxHeight = "calc(100vh - 220px)",
}: Props<T>) {
  // Quando maxHeight está ativo, o `<div>` interno vira o contexto de scroll
  // — o `<th>` sticky (top: 0) congela em relação a esse container.
  const scrollStyle = maxHeight ? { maxHeight } : undefined;
  const scrollClass = maxHeight ? "overflow-auto" : "overflow-x-auto";

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {caption && (
        <div
          className="px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border-soft)" }}
        >
          {caption}
        </div>
      )}
      {rows.length === 0 ? (
        <p
          className="px-5 py-8 text-center text-[13px]"
          style={{ color: "var(--fg-muted)" }}
        >
          {emptyMessage}
        </p>
      ) : (
        <div className={scrollClass} style={scrollStyle}>
          <table className="w-full text-[13px]">
            <thead>
              <tr
                className="text-[10.5px] uppercase tracking-wider"
                style={{
                  color: "var(--fg-muted)",
                  backgroundColor: "var(--surface-2)",
                }}
              >
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      width: c.width,
                      textAlign: c.align ?? "left",
                      // Background no `<th>` (não no `<tr>`) é necessário pra
                      // sticky tampar o conteúdo que rola por baixo.
                      backgroundColor: maxHeight ? "var(--surface-2)" : undefined,
                      // Box-shadow simula a borda inferior — `<th>` não respeita
                      // `border-bottom` confiavelmente quando sticky.
                      boxShadow: maxHeight ? "inset 0 -1px 0 var(--border-soft)" : undefined,
                    }}
                    className={`px-4 py-2.5 font-medium whitespace-nowrap ${maxHeight ? "sticky top-0 z-10" : ""}`}
                  >
                    {c.sortKey ? (
                      <SortableHeader sortKey={c.sortKey} align={c.align} sortParam={sortParam} dirParam={dirParam}>
                        {c.header}
                      </SortableHeader>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="transition-colors hover:bg-[var(--surface-2)]"
                  style={{ borderTop: "1px solid var(--border-soft)" }}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{ textAlign: c.align ?? "left" }}
                      className="px-4 py-2.5"
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
