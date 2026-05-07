export type Granularity = "day" | "week" | "month";

export function parseGranularity(s: string | undefined, fallback: Granularity = "month"): Granularity {
  if (s === "day" || s === "week" || s === "month") return s;
  return fallback;
}

/** Chave estável (yyyy-mm-dd / yyyy-Www / yyyy-mm) por granularidade. */
export function bucketKey(d: Date, g: Granularity): string {
  const y = d.getFullYear();
  if (g === "month") {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  if (g === "day") {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  // week — ISO week number simplificado: YYYY-Www
  const w = isoWeek(d);
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

export function bucketLabel(key: string, g: Granularity): string {
  if (g === "month") {
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const [y, m] = key.split("-");
    return `${months[Number(m) - 1]}/${y.slice(2)}`;
  }
  if (g === "day") {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }
  // week
  const [y, w] = key.split("-W");
  return `S${w}/${y.slice(2)}`;
}

/**
 * Agrega array por granularidade temporal.
 * @param rows — array de objetos
 * @param dateGetter — extrai Date do row (pode retornar null → ignora)
 * @param valueGetter — extrai number do row (default: 1, ou seja, conta linhas)
 * @param g — granularidade
 */
export function aggregateByGranularity<T>(
  rows: T[],
  dateGetter: (row: T) => Date | null | undefined,
  valueGetter: (row: T) => number,
  g: Granularity,
): Array<{ key: string; label: string; value: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = dateGetter(r);
    if (!d) continue;
    const k = bucketKey(d, g);
    map.set(k, (map.get(k) ?? 0) + valueGetter(r));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => ({ key, label: bucketLabel(key, g), value }));
}

// ── ISO week — algoritmo padrão ─────────────────────────────────────
function isoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { year: target.getUTCFullYear(), week };
}
