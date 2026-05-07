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
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "Nenhum registro.",
}: Props<T>) {
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
        <div className="overflow-x-auto">
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
                    style={{ width: c.width, textAlign: c.align ?? "left" }}
                    className="px-4 py-2.5 font-medium whitespace-nowrap"
                  >
                    {c.sortKey ? (
                      <SortableHeader sortKey={c.sortKey} align={c.align}>
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
