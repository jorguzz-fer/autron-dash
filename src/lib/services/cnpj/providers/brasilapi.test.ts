import { describe, it, expect } from "vitest";
import { mapBrasilApi } from "./brasilapi";

const SAMPLE = {
  cnpj: "11222333000181",
  razao_social: "EMPRESA EXEMPLO LTDA",
  nome_fantasia: "EXEMPLO",
  descricao_situacao_cadastral: "ATIVA",
  cnae_fiscal: 4120400,
  cnae_fiscal_descricao: "Construção de edifícios",
  cnaes_secundarios: [
    { codigo: 4399103, descricao: "Obras de alvenaria" },
    { codigo: 0, descricao: "Não informada" },
  ],
  capital_social: 100000,
  porte: "DEMAIS",
  descricao_identificador_matriz_filial: "MATRIZ",
  email: "contato@exemplo.com.br",
  ddd_telefone_1: "1133334444",
  ddd_telefone_2: "11999998888",
  logradouro: "RUA A",
  numero: "100",
  complemento: "SALA 1",
  bairro: "CENTRO",
  municipio: "SAO PAULO",
  uf: "SP",
  cep: "01001-000",
  qsa: [
    { nome_socio: "FULANO DE TAL", qualificacao_socio: "Sócio-Administrador" },
    { nome_socio: "", qualificacao_socio: "vazio" },
  ],
};

describe("mapBrasilApi", () => {
  const d = mapBrasilApi(SAMPLE);

  it("mapeia campos cadastrais", () => {
    expect(d.razaoSocial).toBe("EMPRESA EXEMPLO LTDA");
    expect(d.nomeFantasia).toBe("EXEMPLO");
    expect(d.situacao).toBe("ATIVA");
    expect(d.cnaePrincipal).toBe("4120400");
    expect(d.capitalSocial).toBe("100000");
    expect(d.porte).toBe("DEMAIS");
    expect(d.matrizFilial).toBe("MATRIZ");
    expect(d.cep).toBe("01001000");
  });

  it("filtra CNAE secundário '0' e sócios sem nome", () => {
    expect(d.cnaesSecundarios).toHaveLength(1);
    expect(d.cnaesSecundarios[0].codigo).toBe("4399103");
    expect(d.socios).toHaveLength(1);
    expect(d.socios[0].nome).toBe("FULANO DE TAL");
  });

  it("preserva telefones e payload bruto", () => {
    expect(d.telefone1).toBe("1133334444");
    expect(d.telefone2).toBe("11999998888");
    expect(d.raw).toBe(SAMPLE);
  });
});
