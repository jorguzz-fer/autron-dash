import { readCsvRows } from "./csv";
import { ParseResult, normalizeHeader } from "./types";

export interface ClassificacaoRow {
  produto: string;
  tipoProduto: "Comprando" | "Produzindo" | "Indefinido";
}

/**
 * sciozvs0.csv: latin1, separador ';', header na linha 3 (skip 2 linhas iniciais).
 * Coluna chave: 'Produto', valor: 'Prod.Solict' (consolidado pela MODA por produto).
 */
export function parseClassificacao(buffer: Buffer): ParseResult<ClassificacaoRow> {
  const records = readCsvRows(buffer, { encoding: "latin1", delimiter: ";", skipLines: 2 });
  const warnings: string[] = [];

  if (records.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo vazio ou sem registros"] };
  }

  // Detecta as colunas certas via header normalizado
  const sample = records[0];
  const headerKeys = Object.keys(sample);
  const colProduto = headerKeys.find((k) => normalizeHeader(k) === "produto");
  const colSolict = headerKeys.find((k) =>
    ["prodsolict", "prodsolicit", "prodsolicitacao"].includes(normalizeHeader(k)),
  );

  if (!colProduto) {
    return { rows: [], skipped: 0, warnings: ["coluna obrigatória ausente: 'Produto'"] };
  }
  if (!colSolict) {
    warnings.push("coluna 'Prod.Solict' não encontrada — tudo classificado como 'Indefinido'");
  }

  // Conta ocorrências de cada (produto, tipo)
  const tally = new Map<string, Map<string, number>>();
  let skipped = 0;
  for (const rec of records) {
    const produto = (rec[colProduto] ?? "").trim();
    if (!produto) {
      skipped++;
      continue;
    }
    const tipo = colSolict ? (rec[colSolict] ?? "").trim() : "";
    const tipoNorm = tipo || "Indefinido";
    if (!tally.has(produto)) tally.set(produto, new Map());
    const m = tally.get(produto)!;
    m.set(tipoNorm, (m.get(tipoNorm) ?? 0) + 1);
  }

  // Consolida por moda (tipo mais frequente por produto)
  const rows: ClassificacaoRow[] = [];
  for (const [produto, tipos] of tally) {
    let bestTipo = "Indefinido";
    let bestCount = -1;
    for (const [t, c] of tipos) {
      if (c > bestCount) {
        bestCount = c;
        bestTipo = t;
      }
    }
    const normalized: ClassificacaoRow["tipoProduto"] =
      bestTipo === "Comprando" || bestTipo === "Produzindo" ? bestTipo : "Indefinido";
    rows.push({ produto, tipoProduto: normalized });
  }

  return { rows, skipped, warnings };
}
