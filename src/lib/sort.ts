export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export function parseSort(
  sortParam: string | undefined,
  dirParam: string | undefined,
): SortState | null {
  if (!sortParam) return null;
  const dir = dirParam === "desc" ? "desc" : "asc";
  return { key: sortParam, dir };
}

/**
 * Ordena array por campo arbitrário (reflection). Tolerante a:
 * - null/undefined → vão para o fim
 * - Date → compara por timestamp
 * - number → compara numericamente
 * - string → localeCompare pt-BR (case-insensitive)
 *
 * Retorna nova array, não muta a entrada.
 */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  state: SortState | null,
): T[] {
  if (!state) return rows;
  const { key, dir } = state;
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key] as unknown;
    const bv = b[key] as unknown;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av instanceof Date && bv instanceof Date) {
      return (av.getTime() - bv.getTime()) * factor;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * factor;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    return as.localeCompare(bs, "pt-BR") * factor;
  });
}

/**
 * Converte string YYYY-MM-DD do <input type="date"> em Date local (00:00 do dia).
 * Para "to" você normalmente quer o FIM do dia (23:59:59) — usar `endOfDay`.
 */
export function parseDateInput(s: string | undefined, endOfDay = false): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return endOfDay ? new Date(y, mo, d, 23, 59, 59, 999) : new Date(y, mo, d);
}
