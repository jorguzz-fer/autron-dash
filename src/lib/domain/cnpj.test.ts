import { describe, it, expect } from "vitest";
import { classifyDoc, formatCnpj, isValidCnpj, normalizeCnpj, onlyDigits } from "./cnpj";

describe("onlyDigits", () => {
  it("remove máscara e espaços", () => {
    expect(onlyDigits("03.096.943/0001-58")).toBe("03096943000158");
    expect(onlyDigits(" 17394264000170 ")).toBe("17394264000170");
  });
  it("nulo/indefinido → vazio", () => {
    expect(onlyDigits(null)).toBe("");
    expect(onlyDigits(undefined)).toBe("");
  });
});

describe("normalizeCnpj", () => {
  it("aceita 14 dígitos", () => {
    expect(normalizeCnpj("03096943000158")).toBe("03096943000158");
  });
  it("repõe zero à esquerda perdido pelo Excel (13 díg.)", () => {
    expect(normalizeCnpj("3096943000158")).toBe("03096943000158");
  });
  it("rejeita comprimentos implausíveis", () => {
    expect(normalizeCnpj("123")).toBeNull();
    expect(normalizeCnpj("")).toBeNull();
  });
});

describe("isValidCnpj", () => {
  it("valida dígitos verificadores corretos", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });
  it("rejeita DV incorreto", () => {
    expect(isValidCnpj("11222333000180")).toBe(false);
  });
  it("rejeita sequências repetidas e comprimento errado", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });
});

describe("formatCnpj", () => {
  it("formata 14 dígitos", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("retorna o valor cru quando não tem 14 dígitos", () => {
    expect(formatCnpj("123")).toBe("123");
  });
});

describe("classifyDoc", () => {
  it("CNPJ válido", () => {
    expect(classifyDoc("11.222.333/0001-81")).toEqual({
      digits: "11222333000181",
      tipo: "CNPJ",
      valido: true,
    });
  });
  it("CNPJ com DV inválido ainda é CNPJ (valido=false)", () => {
    const r = classifyDoc("11222333000180");
    expect(r.tipo).toBe("CNPJ");
    expect(r.valido).toBe(false);
  });
  it("CPF (11 díg.) é pessoa física", () => {
    const r = classifyDoc("123.456.789-01");
    expect(r.tipo).toBe("CPF");
    expect(r.digits).toBe("12345678901");
  });
  it("vazio → INVALIDO", () => {
    expect(classifyDoc("")).toEqual({ digits: "", tipo: "INVALIDO", valido: false });
  });
});
