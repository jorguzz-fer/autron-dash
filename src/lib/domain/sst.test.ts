import { describe, it, expect } from "vitest";
import { derivarSst, grauRiscoPorCnae, normalizePorte } from "./sst";

describe("grauRiscoPorCnae", () => {
  it("construção (divisão 41) → grau 4", () => {
    const r = grauRiscoPorCnae("4120-4/00");
    expect(r.grauRisco).toBe(4);
    expect(r.cnaeSst).toBe("4120400");
  });
  it("desenvolvimento de software (62) → grau 1", () => {
    expect(grauRiscoPorCnae("6201500").grauRisco).toBe(1);
  });
  it("CNAE curto/ausente → null", () => {
    expect(grauRiscoPorCnae("").grauRisco).toBeNull();
    expect(grauRiscoPorCnae(null).grauRisco).toBeNull();
  });
});

describe("normalizePorte", () => {
  it("reconhece variações", () => {
    expect(normalizePorte("MICRO EMPRESA")).toBe("ME");
    expect(normalizePorte("EMPRESA DE PEQUENO PORTE")).toBe("EPP");
    expect(normalizePorte("DEMAIS")).toBe("DEMAIS");
    expect(normalizePorte(null)).toBeNull();
  });
});

describe("derivarSst", () => {
  it("grande porte + grau alto → SESMT e RH prováveis", () => {
    const r = derivarSst({ cnae: "4120400", porte: "DEMAIS" });
    expect(r.grauRisco).toBe(4);
    expect(r.sesmtProvavel).toBe(true);
    expect(r.rhEstruturadoProvavel).toBe(true);
  });
  it("micro empresa → RH não estruturado e SESMT improvável", () => {
    const r = derivarSst({ cnae: "4120400", porte: "MICRO EMPRESA" });
    expect(r.rhEstruturadoProvavel).toBe(false);
    expect(r.sesmtProvavel).toBe(false);
  });
  it("usa nº de funcionários quando disponível (grau 4, 60 func. → SESMT)", () => {
    const r = derivarSst({ cnae: "4120400", porte: "MICRO EMPRESA", numFuncionarios: 60 });
    expect(r.sesmtProvavel).toBe(true);
  });
  it("sem porte nem funcionários → estimativas nulas", () => {
    const r = derivarSst({ cnae: "6201500" });
    expect(r.sesmtProvavel).toBeNull();
    expect(r.rhEstruturadoProvavel).toBeNull();
  });
});
