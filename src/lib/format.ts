/** Helpers de formatação pt-BR usados em toda UI de dashboard. */

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

export function fmtCurrency(
  n: number | null | undefined,
  opts?: { compact?: boolean; decimals?: number },
): string {
  if (n == null) return "—";
  if (opts?.compact && Math.abs(n) >= 1000) {
    return n.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1,
    });
  }
  // decimals: 0 → R$ 7.689.390 (inteiro, paridade Streamlit fmt_br(v, 0))
  if (opts?.decimals != null) {
    return n.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: opts.decimals,
      maximumFractionDigits: opts.decimals,
    });
  }
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtPct(n: number | null | undefined, frac = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(frac)}%`;
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${months[Number(m) - 1]}/${y.slice(2)}`;
}
