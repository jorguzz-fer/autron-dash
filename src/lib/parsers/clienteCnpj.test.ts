import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseClientesCnpj } from "./clienteCnpj";

async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const clientes = wb.addWorksheet("Clientes");
  clientes.addRow(["Codigo", "Loja", "Nome", "N Fantasia", "CNPJ/CPF"]);
  clientes.addRow(["C010038", "01", "13ROBOTICS ROBOTICA LTDA", "13ROBOTICS", "11222333000181"]);
  clientes.addRow(["C009692", "01", "PESSOA FISICA EXEMPLO", "PF", "12345678901"]); // CPF
  clientes.addRow(["C000001", "01", "DOC INVALIDO", "X", "123"]); // inválido (curto)
  clientes.addRow(["", "", "SUBTOTAL", "", ""]); // conteúdo sem documento → skipped
  clientes.addRow([null, null, null, null, null]); // linha totalmente vazia → ignorada

  const forn = wb.addWorksheet("Fornecedores");
  forn.addRow(["Codigo", "Loja", "Razao Social", "N Fantasia", "CNPJ/CPF"]);
  forn.addRow(["F009985", "01", "STEUTE DO BRASIL", ".STEUTE", "11.222.333/0001-81"]);

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return Buffer.from(buf);
}

describe("parseClientesCnpj (xlsx, multi-aba)", () => {
  it("lê Clientes e Fornecedores, marca CPF/inválido", async () => {
    const buffer = await buildXlsx();
    const res = await parseClientesCnpj(buffer, { filename: "cadastro.xlsx" });

    // 4 com documento (1 CNPJ + 1 CPF + 1 inválido na aba Clientes; 1 CNPJ em Fornecedores)
    expect(res.rows).toHaveLength(4);
    expect(res.skipped).toBe(1); // a linha totalmente vazia

    const cnpj = res.rows.find((r) => r.inputCodigo === "C010038")!;
    expect(cnpj.origem).toBe("Clientes");
    expect(cnpj.inputName).toBe("13ROBOTICS ROBOTICA LTDA");
    expect(cnpj.inputNomeFantasia).toBe("13ROBOTICS");
    expect(cnpj.tipoDoc).toBe("CNPJ");
    expect(cnpj.valido).toBe(true);

    const cpf = res.rows.find((r) => r.inputCodigo === "C009692")!;
    expect(cpf.tipoDoc).toBe("CPF");

    const inval = res.rows.find((r) => r.inputCodigo === "C000001")!;
    expect(inval.tipoDoc).toBe("INVALIDO");

    const forn = res.rows.find((r) => r.origem === "Fornecedores")!;
    expect(forn.inputName).toBe("STEUTE DO BRASIL");
    expect(forn.cnpj).toBe("11222333000181"); // máscara removida
  });

  it("rowIndex é sequencial e global entre abas", async () => {
    const res = await parseClientesCnpj(await buildXlsx(), { filename: "c.xlsx" });
    expect(res.rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe("parseClientesCnpj (csv)", () => {
  it("lê CSV com cabeçalho Nome/CNPJ", async () => {
    const csv = "Codigo;Nome;CNPJ/CPF\nC1;ACME LTDA;11222333000181\nC2;BETA;3096943000158\n";
    const res = await parseClientesCnpj(Buffer.from(csv, "utf-8"), { filename: "x.csv" });
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].inputName).toBe("ACME LTDA");
    expect(res.rows[1].cnpj).toBe("03096943000158"); // zero à esquerda reposto
  });
});
