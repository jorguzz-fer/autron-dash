// src/lib/services/metasComissao.test.ts
import { describe, it, expect } from "vitest";
import { matchVendedorNome } from "./metasComissao";

const cadastro = [
  { codigoProtheus: "000029", nome: "ALEXSIANO PORFIRIO DA SILVA" },
  { codigoProtheus: "000033", nome: "BRUNO PEREIRA DA SILVA" },
  { codigoProtheus: "000018", nome: "DEWET VIRMOND TAQUES NETO" },
  { codigoProtheus: "000025", nome: "JOÃO VITOR RIBEIRO DE SOUZA" },
  { codigoProtheus: "000007", nome: "MICHEL DE AZEVEDO SAAD" },
  { codigoProtheus: "000020", nome: "RAFAEL SILVA DE JESUS" },
  { codigoProtheus: "000006", nome: "WILLIAN CÉSAR SANTOS TOMAZ" },
];

describe("matchVendedorNome", () => {
  it("casa por primeiro nome", () => {
    expect(matchVendedorNome("ALEXSIANO", cadastro)).toBe("000029");
    expect(matchVendedorNome("BRUNO", cadastro)).toBe("000033");
    expect(matchVendedorNome("MICHEL", cadastro)).toBe("000007");
  });

  it("ignora acento (JOÃO ~ JOÃO VITOR)", () => {
    expect(matchVendedorNome("JOÃO", cadastro)).toBe("000025");
    expect(matchVendedorNome("JOAO", cadastro)).toBe("000025");
  });

  it("NÃO casa grafia diferente (WILLIAM ≠ WILLIAN)", () => {
    expect(matchVendedorNome("WILLIAM", cadastro)).toBeNull();
  });

  it("retorna null pra quem não está no cadastro", () => {
    expect(matchVendedorNome("DANIELE", cadastro)).toBeNull();
    expect(matchVendedorNome("REMBRANDT", cadastro)).toBeNull();
    expect(matchVendedorNome("WADSON", cadastro)).toBeNull();
  });

  it("nome vazio → null", () => {
    expect(matchVendedorNome("", cadastro)).toBeNull();
    expect(matchVendedorNome("   ", cadastro)).toBeNull();
  });
});
