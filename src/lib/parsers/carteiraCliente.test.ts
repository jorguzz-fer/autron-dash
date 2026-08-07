import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseCarteiraCliente } from "./carteiraCliente";

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe("parseCarteiraCliente", () => {
  it("lê o layout Protheus (código/loja/razão/vendedor) e define o dono da carteira", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Codigo", "Loja", "Razao Social", "N Fantasia", "Municipio", "UF", "Cod Vendedor", "Nome Vendedor"]);
    ws.addRow(["C000001", "01", "ACME INDUSTRIA LTDA", "ACME", "Santos", "SP", "V01", "MARIA SILVA"]);
    ws.addRow(["C000002", "01", "BETA METALURGICA SA", "BETA", "Jundiai", "sp", "V02", "JOAO SOUZA"]);

    const res = await parseCarteiraCliente(await toBuffer(wb));

    expect(res.rows).toHaveLength(2);
    const acme = res.rows[0];
    expect(acme.chaveCadastro).toBe("C000001/01");
    expect(acme.cliente).toBe("ACME INDUSTRIA LTDA");
    expect(acme.clienteKey).toBe("ACME INDUSTRIA LTDA");
    expect(acme.fantasiaKey).toBe("ACME");
    expect(acme.municipio).toBe("Santos");
    expect(acme.uf).toBe("SP");
    expect(acme.codVendedor).toBe("V01");
    expect(acme.nomeVendedor).toBe("MARIA SILVA");
    expect(res.rows[1].uf).toBe("SP"); // "sp" normalizado
  });

  it("acha o cabeçalho abaixo do título do relatório e ignora repetições de cabeçalho", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Relatorio");
    ws.addRow(["RELATORIO DE CLIENTES COM VENDEDOR"]);
    ws.addRow(["Emissao: 07/08/2026"]);
    ws.addRow([]);
    ws.addRow(["Codigo", "Loja", "Nome", "Nome Vendedor"]);
    ws.addRow(["C1", "01", "ALFA LTDA", "MARIA SILVA"]);
    ws.addRow(["Codigo", "Loja", "Nome", "Nome Vendedor"]); // quebra de página
    ws.addRow(["C2", "01", "GAMA LTDA", "JOAO SOUZA"]);

    const res = await parseCarteiraCliente(await toBuffer(wb));

    expect(res.rows.map((r) => r.cliente)).toEqual(["ALFA LTDA", "GAMA LTDA"]);
  });

  it("normaliza CNPJ, aceita cadastro sem vendedor e avisa", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Codigo", "Nome", "CNPJ", "Nome Vendedor"]);
    ws.addRow(["C1", "ALFA LTDA", "11.222.333/0001-81", "MARIA SILVA"]);
    ws.addRow(["C2", "SEM DONO LTDA", "", ""]);

    const res = await parseCarteiraCliente(await toBuffer(wb));

    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].cnpj).toBe("11222333000181");
    expect(res.rows[1].nomeVendedor).toBeNull();
    expect(res.warnings.some((w) => w.includes("sem nome de vendedor"))).toBe(true);
  });

  it("consolida cadastros duplicados mantendo a última ocorrência", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Codigo", "Loja", "Nome", "Nome Vendedor"]);
    ws.addRow(["C1", "01", "ALFA LTDA", "MARIA SILVA"]);
    ws.addRow(["C1", "01", "ALFA LTDA", "JOAO SOUZA"]);

    const res = await parseCarteiraCliente(await toBuffer(wb));

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].nomeVendedor).toBe("JOAO SOUZA");
    expect(res.warnings.some((w) => w.includes("duplicado"))).toBe(true);
  });

  it("usa a coluna genérica 'Vendedor' como dono quando não há 'Nome Vendedor'", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");
    ws.addRow(["Codigo", "Razao Social", "Vendedor"]);
    ws.addRow(["C1", "ALFA LTDA", "MARIA SILVA"]);

    const res = await parseCarteiraCliente(await toBuffer(wb));

    expect(res.rows[0].nomeVendedor).toBe("MARIA SILVA");
    expect(res.warnings.some((w) => w.includes('"Vendedor"'))).toBe(true);
  });

  it("recusa arquivo sem coluna de nome do cliente", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Outra");
    ws.addRow(["Produto", "Quantidade"]);
    ws.addRow(["X", 1]);

    const res = await parseCarteiraCliente(await toBuffer(wb));

    expect(res.rows).toHaveLength(0);
    expect(res.warnings[0]).toContain("nenhuma aba");
  });
});
