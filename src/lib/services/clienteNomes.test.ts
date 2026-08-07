import { describe, it, expect } from "vitest";
import { aplicarNomeCliente, codigoClienteKey } from "./clienteNomes";

const nomes = new Map<string, string>([
  ["C009280", "ACME INDUSTRIA LTDA"],
  ["C000123", "BETA METALURGICA SA"],
]);

function row(cliente: string) {
  return { cliente, clienteKey: cliente.toUpperCase(), mes: "2026-01", receita: 10 };
}

describe("codigoClienteKey", () => {
  it("normaliza espaços e caixa", () => {
    expect(codigoClienteKey(" c009280 ")).toBe("C009280");
    expect(codigoClienteKey(null)).toBe("");
  });
});

describe("aplicarNomeCliente", () => {
  it("troca o código pelo nome e recalcula a chave de cruzamento", () => {
    const [out] = aplicarNomeCliente([row("C009280")], nomes);
    expect(out.cliente).toBe("ACME INDUSTRIA LTDA");
    expect(out.clienteKey).toBe("ACME INDUSTRIA LTDA");
    expect(out.receita).toBe(10); // demais campos preservados
  });

  it("casa o código independentemente de caixa/espaços", () => {
    expect(aplicarNomeCliente([row(" c000123 ")], nomes)[0].cliente).toBe("BETA METALURGICA SA");
  });

  it("mantém a linha intacta quando o código não está no lookup", () => {
    const original = row("C999999");
    const [out] = aplicarNomeCliente([original], nomes);
    expect(out).toEqual(original);
  });

  it("mantém a linha intacta quando o valor já é um nome", () => {
    const original = row("GAMA COMERCIO LTDA");
    expect(aplicarNomeCliente([original], nomes)[0]).toEqual(original);
  });

  it("devolve as linhas sem cópia quando não há lookup carregado", () => {
    const rows = [row("C009280")];
    expect(aplicarNomeCliente(rows, new Map())).toBe(rows);
  });
});
