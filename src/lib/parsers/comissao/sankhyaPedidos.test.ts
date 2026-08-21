// src/lib/parsers/comissao/sankhyaPedidos.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSankhyaPedidos } from "./sankhyaPedidos";

const HEADER = [
  "Numero_Autron", "Emissao_Pedido", "Codigo_Cliente", "Nome_Cliente", "Referencia",
  "Descricao_Produto", "Quantidade_Produtos", "Valor_Total_Item", "Codigo_Vendedor",
  "Nome_Vendedor", "Data_Entrega", "Tipo_Negocio", "Tipo_Venda",
  "Data_Previsão_Vencimento", "Condicao_Pagamento",
];

async function makeXlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet0");
  ws.addRow(HEADER);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Linha no formato real do export: datas como TEXTO "dd/mm/yyyy hh:mm:ss"
const LINHA_294 = [
  "294", "03/08/2026 00:00:00", 2751, "ALBANY INTERNATIONAL", "T58HAVSPA-0001",
  "ENCODER ABSOLUTO", 1, 12893.54, 7, "DEWET VIRMOND", "27/10/2026 00:00:00",
  "Cliente Final", "RE", "26/11/2026 00:00:00", "VENDA - DEPOSITO 30 DDL",
];

describe("parseSankhyaPedidos (Pilar 1 — entrada de PV)", () => {
  it("lê a linha convertendo datas em texto dd/mm/yyyy e valor numérico", async () => {
    const r = await parseSankhyaPedidos(await makeXlsx([LINHA_294]));
    expect(r.rows).toHaveLength(1);
    const p = r.rows[0];
    expect(p.numeroPedido).toBe("294");
    expect(p.sequencia).toBe(1);
    expect(p.dataEmissao.getFullYear()).toBe(2026);
    expect(p.dataEmissao.getMonth()).toBe(7); // agosto
    expect(p.dataEmissao.getDate()).toBe(3);
    expect(Number(p.valor)).toBeCloseTo(12893.54);
    expect(p.codVendedorSankhya).toBe("7");
    expect(p.tipoNegocio).toBe("Cliente Final");
    expect(p.tipoVenda).toBe("RE");
    expect(p.dataEntrega?.getMonth()).toBe(9); // outubro
  });

  it("mesma Referencia repetida no pedido ganha sequência e NÃO é descartada", async () => {
    // Caso real (pedido 308): mesmo produto, quantidades/valores diferentes
    const r = await parseSankhyaPedidos(await makeXlsx([
      ["308", "03/08/2026 00:00:00", 1, "CLI", "VNSK-00062", "MANETE", 1, 25220.67, 6, "MICHEL SAAD", null, "OEM", "RE", null, "X"],
      ["308", "03/08/2026 00:00:00", 1, "CLI", "VNSK-00062", "MANETE", 2, 50441.34, 6, "MICHEL SAAD", null, "OEM", "RE", null, "X"],
    ]));
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.sequencia)).toEqual([1, 2]);
    // valores diferentes → não é linha idêntica, sem warning de duplicidade
    expect(r.warnings.join(" ")).not.toContain("idêntica");
  });

  it("linha 100% idêntica repetida entra no resultado mas gera warning", async () => {
    // Caso real (pedidos 311/372/476): linhas exatamente iguais
    const linha = ["311", "03/08/2026 00:00:00", 1, "CLI", "VNS0-01699", "MANETE", 1, 22302.57, 6, "MICHEL SAAD", null, "OEM", "RE", null, "X"];
    const r = await parseSankhyaPedidos(await makeXlsx([linha, linha]));
    expect(r.rows).toHaveLength(2);
    expect(r.warnings.some((w) => w.includes("idêntica"))).toBe(true);
    expect(r.warnings.join(" ")).toContain("311");
  });

  it('vendedor genérico "VENDEDOR" gera warning de pedido sem atribuição', async () => {
    const r = await parseSankhyaPedidos(await makeXlsx([
      ["262", "06/08/2026 00:00:00", 9, "SIDERAR SAIC", "X", "Y", 1, 67923.27, 1, "VENDEDOR", null, "Cliente Final", null, null, "Z"],
    ]));
    expect(r.rows).toHaveLength(1); // entra — o valor existe e afeta totais
    expect(r.warnings.some((w) => w.includes("VENDEDOR") && w.includes("262"))).toBe(true);
  });

  it("conta linhas sem Tipo_Venda e sem Data_Entrega nos warnings", async () => {
    const r = await parseSankhyaPedidos(await makeXlsx([
      ["299", "03/08/2026 00:00:00", 1, "CLI", "R", "D", 1, 100, 12, "REMBRANDT", null, "Cliente Final", null, null, "X"],
      LINHA_294,
    ]));
    expect(r.rows).toHaveLength(2);
    expect(r.warnings.some((w) => w.includes("sem Tipo_Venda"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("sem Data_Entrega"))).toBe(true);
  });

  it("planilha errada (sem Numero_Autron) devolve warning claro", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet0").addRow(["Coluna_A", "Coluna_B"]);
    const r = await parseSankhyaPedidos(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(r.rows).toHaveLength(0);
    expect(r.warnings[0]).toContain("Numero_Autron");
  });
});
