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
});
