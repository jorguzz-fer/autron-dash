// src/lib/parsers/comissao/metasPlanilha.ts
//
// Parser da planilha de METAS por vendedor no formato "largo" (a que o RH usa):
//   Linha de cabeçalho:  # | VENDEDOR | <mês1> | <mês2> | ... | <mês12> | TOTAL
//   Cada linha seguinte:  n | NOME     | v1     | v2     | ... | v12     | total
//
// - Os cabeçalhos de mês costumam vir como DATA (serial do Excel ou Date). As 12
//   colunas entre VENDEDOR e TOTAL são sempre jan…dez, em ordem — usamos a
//   POSIÇÃO (não a data) pra mapear o mês, e só lemos a data pra detectar o ANO.
// - Células "A DEFINIR" / vazias / não-numéricas viram `null` (meta indefinida).
// - O nome vem curto (primeiro nome); o casamento com o cadastro é feito depois
//   (ver matchVendedorNome em services/metasComissao).

import { readExcelRows } from "../excel";
import { toCleanString, toDecimalStr, normalizeHeader } from "../types";

export interface MetaPlanilhaLinha {
  /** Nome do vendedor como veio na planilha (curto). */
  nome: string;
  /** 12 valores, índice 0 = jan … 11 = dez. `null` = "A DEFINIR"/vazio. */
  valores: (number | null)[];
}

export interface MetasPlanilhaResult {
  /** Ano detectado nos cabeçalhos de mês (ou null se não deu pra inferir). */
  ano: number | null;
  linhas: MetaPlanilhaLinha[];
  warnings: string[];
}

/** Converte serial de data do Excel (sistema 1900) em Date UTC. */
function excelSerialToDate(serial: number): Date {
  // Epoch do Excel = 1899-12-30 (compensa o bug do ano 1900 não-bissexto).
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
}

/** Extrai o ano de uma célula de cabeçalho de mês (Date, serial numérico, ou "jan/2026"). */
function anoDaCelula(cell: unknown): number | null {
  if (cell instanceof Date) return cell.getUTCFullYear();
  if (typeof cell === "number" && cell > 20000 && cell < 80000) {
    return excelSerialToDate(cell).getUTCFullYear();
  }
  const s = toCleanString(cell);
  const m = s ? /(20\d{2})/.exec(s) : null;
  return m ? parseInt(m[1], 10) : null;
}

export async function parseMetasPlanilha(buffer: Buffer): Promise<MetasPlanilhaResult> {
  const rows = await readExcelRows(buffer);
  const warnings: string[] = [];

  // ── 1) Acha a linha de cabeçalho (a que tem "VENDEDOR") ──
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => normalizeHeader(toCleanString(c)) === "vendedor"),
  );
  if (headerIdx < 0) {
    return { ano: null, linhas: [], warnings: ["cabeçalho não encontrado (sem coluna VENDEDOR)"] };
  }
  const header = rows[headerIdx];
  const colVendedor = header.findIndex((c) => normalizeHeader(toCleanString(c)) === "vendedor");
  const colTotal = header.findIndex((c) => normalizeHeader(toCleanString(c)) === "total");

  // As 12 colunas de mês ficam entre VENDEDOR e TOTAL (ou as 12 seguintes a VENDEDOR).
  const primeiroMes = colVendedor + 1;
  const ultimoMes = colTotal > primeiroMes ? colTotal - 1 : primeiroMes + 11;
  const qtdMeses = ultimoMes - primeiroMes + 1;
  if (qtdMeses < 12) {
    warnings.push(`esperado 12 colunas de mês, encontrado ${qtdMeses}`);
  }

  // ── 2) Detecta o ano a partir dos cabeçalhos de mês ──
  let ano: number | null = null;
  for (let c = primeiroMes; c <= ultimoMes && ano == null; c++) {
    ano = anoDaCelula(header[c]);
  }

  // ── 3) Lê cada linha de vendedor ──
  const linhas: MetaPlanilhaLinha[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const nome = toCleanString(row[colVendedor]);
    if (!nome) continue; // linha vazia
    const valores: (number | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const raw = row[primeiroMes + i];
      const dec = toDecimalStr(raw); // "A DEFINIR"/texto → null
      valores.push(dec != null && dec !== "" ? Number(dec) : null);
    }
    linhas.push({ nome, valores });
  }

  if (linhas.length === 0) warnings.push("nenhuma linha de vendedor encontrada");
  return { ano, linhas, warnings };
}
