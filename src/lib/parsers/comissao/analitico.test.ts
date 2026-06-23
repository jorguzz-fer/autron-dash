// src/lib/parsers/comissao/analitico.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseAnaliticoComissao } from "./analitico";

async function makeXlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha1");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADER = [
  "Número do Pedido", "Data Emissão Pedido", "Nome do Cliente", "Informe o Nome do produto",
  "Quantidade do Pedido", "Valor c/ Var. Cambial", "Nome do Vendedor", "Data da Entrega",
  "Tipo Negocio", "Data de Vencimento", "Data Pagamento do título", "Condicao de Pagamento",
  "Parcela do Titulo", "% Rateio Pg", "Classificação", "Informe o Percentual", "Comissão Calculada",
];

describe("parseAnaliticoComissao", () => {
  it("mapeia colunas e split de código do vendedor/cliente", async () => {
    const buf = await makeXlsx([
      HEADER,
      ["21035", "08/01/2026", "C009584 - CSN MI", "A102400.025 - PLACA", 2, "13425.81",
       "000022 - ADRIANO", "10/03/2026", "F - Cons.Final", "20/05/2026", null, "CONDICAO LIVRE",
       null, 100, "Faturado", 1, "134.25"],
    ]);
    const r = await parseAnaliticoComissao(buf);
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    expect(row.numeroPedido).toBe("21035");
    expect(row.codVendedor).toBe("000022");
    expect(row.codCliente).toBe("C009584");
    expect(row.classificacao).toBe("FATURADO");
    expect(row.pctRateio).toBe("100");
    expect(row.dataPagamento).toBeNull();
  });

  it("mapeia classificação Pago e data de pagamento", async () => {
    const buf = await makeXlsx([
      HEADER,
      ["21049", "13/01/2026", "C000014 - APERAM", "A301205.392 - KIT", 12, "2192.28",
       "000029 - ALEXSIANO", "10/02/2026", "F - Cons.Final", "10/03/2026", "19/03/2026", "28 DDL",
       null, 100, "Pago", 1, "21.92"],
    ]);
    const r = await parseAnaliticoComissao(buf);
    expect(r.rows[0].classificacao).toBe("PAGO");
    expect(r.rows[0].dataPagamento).not.toBeNull();
  });

  // Cabeçalho real do Protheus (Comissao-Analitco.xlsx): nomes completos das colunas,
  // valores "R$ x.xxx,yy", data de pagamento "/ /" e percentual por linha.
  const REAL_HEADER = [
    "Número do Pedido", "Data Emissão Pedido Venda", "Nome do Cliente", "Informe o Nome do Produto",
    "Quantidade do Pedido", "Valor Anterior Var. Camb.", "Valor c/ Var. Cambial", "Nome do Vendedor",
    "Data da Entrega", "Tipo Negocio", "Ent. Contábil Credito 06", "Data de Vencimento",
    "Data Pagamento do Titulo", "Condicao de Pagamento", "Parcela do Titulo", "% Rateio Pg",
    "Classificação da Comissao", "Informe o Percentual", "Comissão Calculada",
  ];

  it("lê o formato real do Protheus (R$, '/ /', % por linha, 'Classificação da Comissao')", async () => {
    const buf = await makeXlsx([
      REAL_HEADER,
      ["21035", "08/01/2026", "C009584 - CSN MINERACAO S.A.", "A102400.025 - PLACA",
       2, "R$ 13.425,81", "R$ 13.425,81", "000022 - ADRIANO CORREA DE MATOS",
       "10/03/2026", "F - Cons.Final", "RE - REPOSICAO", "20/05/2026",
       "/ /", "CONDICAO LIVRE", null, 100, "Faturado", 1, "R$ 134,25"],
    ]);
    const r = await parseAnaliticoComissao(buf);
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    expect(row.numeroPedido).toBe("21035");
    expect(row.codVendedor).toBe("000022");
    expect(row.classificacao).toBe("FATURADO");
    expect(row.valor).toBe("13425.81");         // "R$ 13.425,81" → 13425.81
    expect(row.comissaoPct).toBe("0.01");        // "Informe o Percentual" 1 ÷ 100
    expect(row.dataPagamento).toBeNull();        // "/ /" → null
    expect(row.dataEmissao?.getFullYear()).toBe(2026);
  });
});
