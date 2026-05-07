import { readExcelWorkbook } from "./excel";
import { ParseResult, normalizeHeader, toCleanString } from "./types";

export interface MetaRow {
  unidade: "AUTRON" | "ERGOMEC" | "GRUPO";
  categoria: "ENTRADA_PEDIDO" | "RECEITA";
  ano: number;
  mes: number; // 1..12
  valor: string; // string para Decimal do Prisma
}

const UNIDADES = ["AUTRON", "ERGOMEC", "GRUPO"] as const;

const CATEGORY_MATCHERS: Array<{
  cat: MetaRow["categoria"];
  match: (s: string) => boolean;
}> = [
  // "Entrada de pedido" total — NÃO confundir com sub-itens "produtos/serviços/ID"
  {
    cat: "ENTRADA_PEDIDO",
    match: (s) => {
      const n = normalizeHeader(s);
      return n === "entradadepedido";
    },
  },
  // "Receita de vendas e Serviços" total
  {
    cat: "RECEITA",
    match: (s) => {
      const n = normalizeHeader(s);
      return n === "receitadevendaseservicos" || n === "receitadevendaseservico";
    },
  },
];

/**
 * Pega o resultado calculado de uma célula — ExcelJS retorna {formula, result}
 * pra fórmulas. Pra valores diretos retorna o valor.
 */
function cellValue(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number" && Number.isFinite(r)) return r;
    if (typeof r === "string") {
      const n = Number(r);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parser do Metas_Budget_Grupo_Autron_<ano>.xlsx.
 *
 * Layout esperado:
 *  - 1 aba ("Budget_<ano>")
 *  - 3 blocos verticais começando com label "AUTRON", "ERGOMEC", "GRUPO" na coluna B
 *  - Logo após o label da unidade, mesma linha tem 12 datas (jan..dez) nas colunas C..N
 *  - Linhas seguintes: labels de categoria na coluna B + valores nas colunas C..N
 *  - "Entrada de pedido" e "Receita de vendas e Serviços" são as categorias que extraímos
 *  - Sub-itens (produtos/serviços/ID) são ignorados (vêm com indent na descrição)
 */
export async function parseMetas(buffer: Buffer): Promise<ParseResult<MetaRow>> {
  const sheets = await readExcelWorkbook(buffer);
  const warnings: string[] = [];
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  }
  const sheet = sheets[0];
  const allRows = sheet.rows;

  type Block = {
    unidade: MetaRow["unidade"];
    headerRow: number;
    months: number[]; // mes 1..12 indexed por coluna
    year: number;
  };

  const blocks: Block[] = [];

  // Localiza blocos pelo label da unidade na coluna B (índice 1) e mapeia
  // os meses pegando as datas das colunas C..N.
  for (let r = 0; r < allRows.length; r++) {
    const labelB = toCleanString(allRows[r][1]);
    if (!labelB) continue;
    const labelUpper = labelB.toUpperCase();
    const unidade = UNIDADES.find((u) => u === labelUpper);
    if (!unidade) continue;

    const months: number[] = [];
    let year = 0;
    for (let c = 2; c < Math.min(allRows[r].length, 14); c++) {
      const val = allRows[r][c];
      if (val instanceof Date) {
        months.push(val.getMonth() + 1);
        if (year === 0) year = val.getFullYear();
      } else {
        months.push(0);
      }
    }
    if (months.filter((m) => m > 0).length < 12) continue; // header sem 12 meses
    blocks.push({ unidade, headerRow: r, months, year });
  }

  if (blocks.length === 0) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["nenhum bloco AUTRON/ERGOMEC/GRUPO encontrado com 12 meses no header"],
    };
  }

  const result: MetaRow[] = [];
  let skipped = 0;

  // Determina o range vertical de cada bloco (até começar o próximo)
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const startRow = block.headerRow + 1;
    const endRow = bi + 1 < blocks.length ? blocks[bi + 1].headerRow : allRows.length;

    for (let r = startRow; r < endRow; r++) {
      const label = toCleanString(allRows[r][1]);
      if (!label) continue;
      // Sub-itens vêm com indent (espaços antes). "Entrada de pedido" sem indent é o total.
      if (label.startsWith(" ") || label.startsWith("\t")) continue;
      // Ignora "(-) deduções", "Receita líquida" etc.
      const cat = CATEGORY_MATCHERS.find((m) => m.match(label));
      if (!cat) continue;

      // Lê os 12 valores das colunas 2..13
      for (let i = 0; i < 12; i++) {
        const mes = block.months[i];
        if (!mes) continue;
        const val = cellValue(allRows[r][2 + i]);
        if (val == null) {
          skipped++;
          continue;
        }
        result.push({
          unidade: block.unidade,
          categoria: cat.cat,
          ano: block.year,
          mes,
          valor: String(val),
        });
      }
    }
  }

  if (result.length === 0) {
    return {
      rows: [],
      skipped,
      warnings: [
        ...warnings,
        "nenhuma linha de meta encontrada — verifique se o arquivo tem 'Entrada de pedido' ou 'Receita de vendas e Serviços' nos blocos",
      ],
    };
  }

  warnings.push(
    `Lidos ${blocks.length} blocos (${blocks.map((b) => `${b.unidade}/${b.year}`).join(", ")})`,
  );

  return { rows: result, skipped, warnings };
}
