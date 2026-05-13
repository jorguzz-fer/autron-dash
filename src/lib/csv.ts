/**
 * Serialização CSV pensada pra Excel brasileiro:
 *  - Separador: `;` (Excel BR interpreta direto sem precisar de "Importar dados")
 *  - Encoding: UTF-8 com BOM (`﻿` no início) — preserva acentuação
 *  - Quoting: campos com `;`, `"`, `\n` ou `\r` vão entre aspas; `"` interno é dobrado
 *  - Linha terminada com `\r\n` (compatibilidade Windows/Excel)
 */

export type CsvRow = (string | number | null | undefined)[];

/** Escapa um único campo de acordo com a RFC 4180 adaptada (separador `;`). */
function escapeField(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : v;
  // Precisa quoting se contém separador, aspas ou quebra de linha
  if (/[";\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Constrói o string CSV completo a partir de headers + linhas.
 * O BOM é prepended automaticamente.
 */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(";"));
  for (const r of rows) {
    lines.push(r.map(escapeField).join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Formata data como DD/MM/YYYY (vazio se null). */
export function csvDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Formata número monetário com vírgula decimal (Excel BR). */
export function csvCurrency(n: number | null | undefined): string {
  if (n == null) return "";
  // 2 casas decimais, vírgula como separador decimal, sem separador de milhar
  // (Excel BR aplica formatação ao importar; mais limpo do que escapar R$/pontos).
  return n.toFixed(2).replace(".", ",");
}
