// src/lib/parsers/comissao/sankhyaFaturamento.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSankhyaFaturamento, extraiPedidoProtheus } from "./sankhyaFaturamento";

const HEADER = [
  "Numero_Autron", "Numero_Nota_Fiscal", "Emissao_Nota_Fiscal",
  "PV_sistema_anterior_ou_outra_referencia", "Codigo_Cliente", "Nome_Cliente",
  "Referencia", "Descricao_Produto", "Quantidade_Produtos", "Valor_Total_Item",
  "Codigo_Vendedor", "Nome_Vendedor", "Data_Entrega", "Tipo_Negocio", "Tipo_Venda",
  "Codigo_Tipo_Negociacao", "Condicao_Pagamento", "Prazo_Parcela", "Data_Vencimento",
];

async function makeXlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet0");
  ws.addRow(HEADER);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("extraiPedidoProtheus", () => {
  it("extrai o nº do PV de várias grafias reais", () => {
    expect(extraiPedidoProtheus("PV 21778 - 34960_Mercotac - Substituição")).toBe("21778");
    expect(extraiPedidoProtheus("PV 21404")).toBe("21404");
    expect(extraiPedidoProtheus("21454")).toBe("21454");
    expect(extraiPedidoProtheus("Ploomes 302726253")).toBeNull(); // Ploomes ≠ Protheus
    expect(extraiPedidoProtheus("C1250-00001")).toBeNull();
    expect(extraiPedidoProtheus(null)).toBeNull();
  });
});

describe("parseSankhyaFaturamento (Pilar 2 — faturamento)", () => {
  it("lê linha real com de-para do Protheus, parcela e vencimento", async () => {
    const r = await parseSankhyaFaturamento(await makeXlsx([
      ["326", 33241, "05/08/2026 00:00:00", "PV 21778 - 34960_Mercotac - Substituição Addens",
        13742, "MILI S/A", "C430-00001", "CONECTOR", 2, 3779.1, 7, "DEWET VIRMOND",
        "04/08/2026 00:00:00", "Cliente Final", "NO", 120, "VENDA - DEPOSITO 28 DDL", 28, "02/09/2026 00:00:00"],
    ]));
    expect(r.rows).toHaveLength(1);
    const f = r.rows[0];
    expect(f.numeroNF).toBe("33241");
    expect(f.numeroPedidoSankhya).toBe("326");
    expect(f.pedidoProtheus).toBe("21778");
    expect(f.devolucao).toBe(false);
    expect(f.prazoParcela).toBe(28);
    expect(f.dataVencimento?.getMonth()).toBe(8); // setembro
    expect(Number(f.valor)).toBeCloseTo(3779.1);
  });

  it("valor negativo = devolução; sem pedido nem PV gera warning de sem vínculo", async () => {
    // Caso real: NF 33245 (devolução sem Numero_Autron e sem referência)
    const r = await parseSankhyaFaturamento(await makeXlsx([
      [null, 33245, "05/08/2026 00:00:00", null, 1426, "ILUMILLEDS", "A300200.003",
        "MODULO", -2, -2683.84, 12, "REMBRANDT SOARES", null, "Não Classificado", null, 101, "VENDA - A VISTA", 0, "05/08/2026 00:00:00"],
    ]));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].devolucao).toBe(true);
    expect(Number(r.rows[0].valor)).toBeCloseTo(-2683.84);
    expect(r.rows[0].numeroPedidoSankhya).toBeNull();
    expect(r.rows[0].pedidoProtheus).toBeNull();
    expect(r.warnings.some((w) => w.includes("devolução") && w.includes("33245"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("sem vínculo"))).toBe(true);
  });

  it("NF com várias linhas (uma por item) mantém todas", async () => {
    const base = (ref: string, valor: number) => [
      "347", 33250, "10/08/2026 00:00:00", "Ploomes 302726253", 1279, "CGM",
      ref, "PROD", 1, valor, 12, "REMBRANDT SOARES", null, "Cliente Final", "RE",
      131, "VENDA - 30/45 DDL", 30, "09/09/2026 00:00:00",
    ];
    const r = await parseSankhyaFaturamento(await makeXlsx([base("A", 100), base("B", 200)]));
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.numeroNF === "33250")).toBe(true);
    // Ploomes não é PV do Protheus, mas tem pedido Sankhya → tem vínculo
    expect(r.warnings.join(" ")).not.toContain("sem vínculo");
  });

  it("planilha errada (sem Numero_Nota_Fiscal) devolve warning claro", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet0").addRow(["Numero_Autron", "Outra"]);
    const r = await parseSankhyaFaturamento(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(r.rows).toHaveLength(0);
    expect(r.warnings[0]).toContain("Numero_Nota_Fiscal");
  });
});
