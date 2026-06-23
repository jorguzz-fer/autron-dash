// src/lib/parsers/comissao/metas.ts
import { readExcelWorkbook } from "../excel";
import {
  ParseResult,
  toCleanString,
  toDecimalStr,
  normalizeHeader,
} from "../types";

export interface MetaComissaoRow {
  codVendedor: string;
  ano: number;
  mes: number; // 1-12
  valorMeta: string; // Decimal string
}

/**
 * Parser do extrato de Metas/Comissão do Protheus (formato real).
 *
 * Layout (validado com Comissao-Meta.xlsx):
 *   - 1 aba por vendedor + 1 aba "PARÂMETROS".
 *   - Em cada aba de vendedor:
 *       linha "CÓDIGO PROTHEUS" | <código>
 *       linha "MÊS"            | JAN-2026 | FEV-2026 | ... | DEZ-2026 | TOTAL
 *       linha "META MES"       | <jan> | <fev> | ... | <dez> | <total>
 *     (demais linhas — GATILHO, EP, HABILITA, etc. — são cálculo do Protheus, ignoradas)
 *   - Aba "PARÂMETROS": linha "Ano Referência" | <ano>
 *
 * Saída: 12 linhas (codVendedor, ano, mes, valorMeta) por vendedor.
 */
export async function parseMetasComissao(buffer: Buffer): Promise<ParseResult<MetaComissaoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  if (sheets.length === 0) return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };

  // ── 1) Ano de referência (aba PARÂMETROS) ──
  let anoParam: number | null = null;
  for (const sh of sheets) {
    if (!normalizeHeader(sh.name).includes("parametro")) continue;
    for (const row of sh.rows) {
      if (normalizeHeader(toCleanString(row[0])) === "anoreferencia") {
        const y = parseInt(String(toCleanString(row[1]) ?? ""), 10);
        if (Number.isFinite(y)) anoParam = y;
      }
    }
  }
  const anoFallback = anoParam ?? new Date().getFullYear();

  const rows: MetaComissaoRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  // ── 2) Uma aba por vendedor ──
  for (const sh of sheets) {
    if (normalizeHeader(sh.name).includes("parametro")) continue;

    let cod: string | null = null;
    let ano = anoFallback;
    let metaVals: (string | null)[] | null = null;

    for (const row of sh.rows) {
      const label = normalizeHeader(toCleanString(row[0]));
      if (label === "codigoprotheus") {
        cod = padCodigo(toCleanString(row[1]));
      } else if (label === "mes") {
        // extrai o ano de uma célula tipo "JAN-2026"
        for (let c = 1; c < row.length; c++) {
          const m = /(\d{4})/.exec(toCleanString(row[c]) ?? "");
          if (m) { ano = parseInt(m[1], 10); break; }
        }
      } else if (label === "metames") {
        metaVals = [];
        for (let c = 1; c <= 12; c++) metaVals.push(toDecimalStr(row[c]));
      }
    }

    if (!cod) {
      // aba sem código (pode ser uma aba auxiliar) — ignora silenciosamente se vazia
      if (sh.rows.some((r) => r.some((c) => toCleanString(c) !== null))) {
        warnings.push(`aba "${sh.name}" sem CÓDIGO PROTHEUS — ignorada`);
      }
      skipped++;
      continue;
    }
    if (!metaVals) {
      warnings.push(`aba "${sh.name}" (${cod}) sem linha META MES — ignorada`);
      skipped++;
      continue;
    }

    for (let m = 0; m < 12; m++) {
      rows.push({ codVendedor: cod, ano, mes: m + 1, valorMeta: metaVals[m] ?? "0" });
    }
  }

  return { rows, skipped, warnings };
}

/** Códigos Protheus são zero-padded a 6 dígitos; o analítico usa esse formato. */
function padCodigo(cod: string | null): string | null {
  if (!cod) return null;
  return /^\d{1,6}$/.test(cod) ? cod.padStart(6, "0") : cod;
}
