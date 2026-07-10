import { describe, it, expect } from "vitest";
import { mapCcc, resumoIe, ieHabilitada } from "./receitaws-ccc";

// Amostra real do endpoint /ccc (Petrobras, 33.000.167/0001-01).
const SAMPLE = {
  cnpj: "33.000.167/0001-01",
  ultima_atualizacao: "2026-07-09T22:59:42.117Z",
  status: "OK",
  registros: [
    {
      uf: "DF",
      ie: "748878600131",
      tipo_ie: "IE Substituto Tributário",
      situacao_ie: "Não Habilitado",
      data_situacao: "29/06/2007",
      regime_icms: "Normal",
      situacao_cnpj: "Sem restrição",
      data_atualizacao: "02/07/2021",
    },
    {
      uf: "RJ",
      ie: "81281882",
      tipo_ie: "IE Normal",
      situacao_ie: "Habilitado",
      data_situacao: "13/10/1989",
      regime_icms: "Normal",
      situacao_cnpj: "Sem restrição",
      data_atualizacao: "18/03/2026",
    },
  ],
};

describe("mapCcc", () => {
  it("mapeia registros de IE para o shape normalizado", () => {
    const regs = mapCcc(SAMPLE);
    expect(regs).toHaveLength(2);
    expect(regs[0]).toEqual({
      uf: "DF",
      ie: "748878600131",
      tipoIe: "IE Substituto Tributário",
      situacaoIe: "Não Habilitado",
      dataSituacao: "29/06/2007",
      regimeIcms: "Normal",
      situacaoCnpj: "Sem restrição",
      dataAtualizacao: "02/07/2021",
    });
  });

  it("retorna lista vazia quando não há registros", () => {
    expect(mapCcc({ status: "OK" })).toEqual([]);
    expect(mapCcc({ status: "OK", registros: [] })).toEqual([]);
  });
});

describe("ieHabilitada", () => {
  it("não confunde 'Não Habilitado' com 'Habilitado'", () => {
    expect(ieHabilitada("Habilitado")).toBe(true);
    expect(ieHabilitada("Não Habilitado")).toBe(false);
    expect(ieHabilitada(null)).toBe(false);
  });
});

describe("resumoIe", () => {
  it("lista as inscrições com as habilitadas primeiro", () => {
    const resumo = resumoIe(mapCcc(SAMPLE));
    expect(resumo).toBe("RJ 81281882 (Habilitado); DF 748878600131 (Não Habilitado)");
  });

  it("retorna null sem inscrições", () => {
    expect(resumoIe([])).toBeNull();
  });
});
