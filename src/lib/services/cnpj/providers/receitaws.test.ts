import { describe, it, expect } from "vitest";
import { mapReceitaWs } from "./receitaws";

const SAMPLE = {
  status: "OK",
  cnpj: "11.222.333/0001-81",
  nome: "EMPRESA EXEMPLO LTDA",
  fantasia: "EXEMPLO",
  situacao: "ATIVA",
  atividade_principal: [{ code: "41.20-4-00", text: "Construção de edifícios" }],
  atividades_secundarias: [
    { code: "43.99-1-03", text: "Obras de alvenaria" },
    { code: "00.00-0-00", text: "Não informada" },
  ],
  capital_social: "100000.00",
  porte: "DEMAIS",
  tipo: "matriz",
  email: "contato@exemplo.com.br",
  telefone: "(11) 3333-4444 / (11) 99999-8888",
  logradouro: "RUA A",
  numero: "100",
  bairro: "CENTRO",
  municipio: "SAO PAULO",
  uf: "SP",
  cep: "01.001-000",
  qsa: [{ nome: "FULANO DE TAL", qual: "49-Sócio-Administrador" }],
};

describe("mapReceitaWs", () => {
  const d = mapReceitaWs(SAMPLE);

  it("mapeia atividade principal e secundárias (descartando 00..)", () => {
    expect(d.cnaePrincipal).toBe("4120400");
    expect(d.cnaeDescricao).toBe("Construção de edifícios");
    expect(d.cnaesSecundarios).toHaveLength(1);
    expect(d.cnaesSecundarios[0].codigo).toBe("4399103");
  });

  it("divide telefone em dois e normaliza CEP/matriz", () => {
    expect(d.telefone1).toBe("(11) 3333-4444");
    expect(d.telefone2).toBe("(11) 99999-8888");
    expect(d.cep).toBe("01001000");
    expect(d.matrizFilial).toBe("MATRIZ");
  });

  it("mapeia razão social e capital", () => {
    expect(d.razaoSocial).toBe("EMPRESA EXEMPLO LTDA");
    expect(d.capitalSocial).toBe("100000");
    expect(d.socios[0].nome).toBe("FULANO DE TAL");
  });
});
