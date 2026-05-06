export interface ParseResult<T> {
  rows: T[];
  skipped: number;
  warnings: string[];
}

export type ParserFn<T> = (buffer: Buffer) => Promise<ParseResult<T>>;

// ─── Helpers de coerção ─────────────────────────────────────────────────────

/** Converte valor de célula para string limpa, removendo pontos de milhar e espaços. */
export function toCleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "text" in (value as object)) {
    value = (value as { text: string }).text;
  }
  if (typeof value === "object" && "result" in (value as object)) {
    value = (value as { result: unknown }).result;
  }
  const s = String(value).trim();
  if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "nan") return null;
  return s;
}

/** Strings vindas de PV/SC/OP que pandas exporta como float ('15.314' = 15314). */
export function toIdString(value: unknown): string | null {
  const s = toCleanString(value);
  if (s === null) return null;
  // Se for numérico com ponto como milhar (ex: "15.314"), remove ponto
  if (/^\d{1,3}(\.\d{3})+(\.\d+)?$/.test(s)) return s.replace(/\./g, "");
  // Se for número com fração ".0", remove
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, "");
  return s;
}

export function toInt(value: unknown): number | null {
  const s = toCleanString(value);
  if (s === null) return null;
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function toDecimalStr(value: unknown): string | null {
  const s = toCleanString(value);
  if (s === null) return null;
  let cleaned = s;
  // Formato BR: "1.234,56" → "1234.56"
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    cleaned = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d+$/.test(s)) {
    cleaned = s.replace(",", ".");
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  // Excel serial date (numero de dias desde 1900)
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    // dd/mm/yyyy ou dd/mm/yy
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
    if (br) {
      const [, dd, mm, yyyy] = br;
      const year = yyyy.length === 2 ? 2000 + Number(yyyy) : Number(yyyy);
      const d = new Date(year, Number(mm) - 1, Number(dd));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Header da planilha → mapa de nome (case/accent-insensitive) → índice da coluna (0-based) */
export function buildHeaderIndex(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const key = normalizeHeader(toCleanString(cell));
    if (key) map.set(key, i);
  });
  return map;
}

export function normalizeHeader(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Procura uma coluna pelo nome (tolerante a variações). Retorna null se nenhuma alternativa bate. */
export function findCol(idx: Map<string, number>, ...alternatives: string[]): number | null {
  for (const alt of alternatives) {
    const i = idx.get(normalizeHeader(alt));
    if (i !== undefined) return i;
  }
  return null;
}
