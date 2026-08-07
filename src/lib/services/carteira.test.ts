import { describe, it, expect } from "vitest";
import {
  makeDonoResolver,
  reatribuirPorCarteira,
  SEM_CARTEIRA,
  type CarteiraBase,
} from "./carteira";
import type { FatMensalRow } from "./regiaoVendas";

const base: CarteiraBase = {
  entries: [
    ["ACME INDUSTRIA LTDA", { dono: "MARIA SILVA", codVendedor: "V01", cadastros: 2 }],
    ["BETA METALURGICA SA", { dono: "JOAO SOUZA", codVendedor: "V02", cadastros: 1 }],
  ],
  fantasiaEntries: [["GAMA", { dono: "MARIA SILVA", codVendedor: "V01", cadastros: 1 }]],
  totalCadastros: 4,
  cadastrosSemDono: 0,
  donos: ["JOAO SOUZA", "MARIA SILVA"],
  conflitos: 0,
};

function row(clienteKey: string, vendedor: string | null, receita: number): FatMensalRow {
  return { clienteKey, cliente: clienteKey, mes: "2026-01", vendedor, receita };
}

describe("makeDonoResolver", () => {
  it("resolve pelo nome principal", () => {
    expect(makeDonoResolver(base)("ACME INDUSTRIA LTDA")?.dono).toBe("MARIA SILVA");
  });

  it("cai no nome fantasia quando o principal não casa", () => {
    expect(makeDonoResolver(base)("GAMA")?.dono).toBe("MARIA SILVA");
  });

  it("devolve null para cliente fora da base", () => {
    expect(makeDonoResolver(base)("DELTA LTDA")).toBeNull();
  });
});

describe("reatribuirPorCarteira", () => {
  it("troca o vendedor da época pelo dono atual, preservando valor e mês", () => {
    const resolver = makeDonoResolver(base);
    const out = reatribuirPorCarteira(
      [
        row("ACME INDUSTRIA LTDA", "VENDEDOR ANTIGO", 1000),
        row("BETA METALURGICA SA", "MARIA SILVA", 500),
      ],
      resolver,
    );
    expect(out.map((r) => r.vendedor)).toEqual(["MARIA SILVA", "JOAO SOUZA"]);
    expect(out.map((r) => r.receita)).toEqual([1000, 500]);
    expect(out[0].mes).toBe("2026-01");
  });

  it("joga clientes fora da base no balde 'Sem carteira'", () => {
    const out = reatribuirPorCarteira([row("DELTA LTDA", "JOAO SOUZA", 90)], makeDonoResolver(base));
    expect(out[0].vendedor).toBe(SEM_CARTEIRA);
  });
});
