import { describe, it, expect } from "vitest";
import {
  normalizeGeoToken,
  municipioKey,
  resolveRegiao,
  computeAbc,
  contarPorClasse,
  computeChurnStatus,
  subMonths,
  type RegiaoDef,
  type AbcInput,
} from "./regiaoVendas";

// ─── normalizeGeoToken / municipioKey ───────────────────────────────────────

describe("normalizeGeoToken", () => {
  it("remove acento, sobe caixa e colapsa espaços", () => {
    expect(normalizeGeoToken(" São  José ")).toBe("SAO JOSE");
    expect(normalizeGeoToken("guarujá")).toBe("GUARUJA");
  });
  it("trata nulo/vazio", () => {
    expect(normalizeGeoToken(null)).toBe("");
    expect(normalizeGeoToken(undefined)).toBe("");
    expect(normalizeGeoToken("   ")).toBe("");
  });
});

describe("municipioKey", () => {
  it("monta CIDADE/UF normalizado", () => {
    expect(municipioKey("São José dos Campos", "sp")).toBe("SAO JOSE DOS CAMPOS/SP");
    expect(municipioKey("Volta Redonda", "RJ")).toBe("VOLTA REDONDA/RJ");
  });
  it("sem cidade → null (só resolvível por UF)", () => {
    expect(municipioKey(null, "SP")).toBeNull();
    expect(municipioKey("", "SP")).toBeNull();
  });
  it("sem UF → só a cidade", () => {
    expect(municipioKey("Santos", null)).toBe("SANTOS");
  });
});

// ─── resolveRegiao ──────────────────────────────────────────────────────────

const litoral: RegiaoDef = { id: "litoral", ufs: [], municipios: ["SANTOS/SP", "GUARUJA/SP"], ordem: 1 };
const vale: RegiaoDef = {
  id: "vale",
  ufs: [],
  municipios: ["SAO JOSE DOS CAMPOS/SP", "TAUBATE/SP", "VOLTA REDONDA/RJ"],
  ordem: 2,
};
const spEstado: RegiaoDef = { id: "sp", ufs: ["SP"], municipios: [], ordem: 10 };
const sul: RegiaoDef = { id: "sul", ufs: ["PR", "SC", "RS"], municipios: [], ordem: 3 };

describe("resolveRegiao", () => {
  const regioes = [litoral, vale, spEstado, sul];

  it("município vence UF (Santos → litoral, não SP-estado)", () => {
    expect(resolveRegiao({ municipioKey: "SANTOS/SP", uf: "SP" }, regioes)).toBe("litoral");
  });

  it("região sub-estadual pode cruzar UF (Volta Redonda/RJ → Vale)", () => {
    expect(resolveRegiao({ municipioKey: "VOLTA REDONDA/RJ", uf: "RJ" }, regioes)).toBe("vale");
  });

  it("cai na UF quando o município não está listado (interior SP → SP-estado)", () => {
    expect(resolveRegiao({ municipioKey: "CAMPINAS/SP", uf: "SP" }, regioes)).toBe("sp");
  });

  it("resolve por UF quando não há cidade", () => {
    expect(resolveRegiao({ municipioKey: null, uf: "PR" }, regioes)).toBe("sul");
  });

  it("normaliza acento/caixa na comparação", () => {
    expect(resolveRegiao({ municipioKey: "guarujá/sp", uf: "sp" }, regioes)).toBe("litoral");
  });

  it("sem match → null (Sem região)", () => {
    expect(resolveRegiao({ municipioKey: "CURITIBA/PR", uf: "BA" }, [litoral, vale])).toBeNull();
  });

  it("empate resolve por ordem asc", () => {
    const a: RegiaoDef = { id: "a", ufs: ["SP"], municipios: [], ordem: 5 };
    const b: RegiaoDef = { id: "b", ufs: ["SP"], municipios: [], ordem: 2 };
    expect(resolveRegiao({ municipioKey: null, uf: "SP" }, [a, b])).toBe("b");
  });
});

// ─── computeAbc ─────────────────────────────────────────────────────────────

describe("computeAbc", () => {
  it("ordena por receita desc e acumula", () => {
    const input: AbcInput[] = [
      { key: "c", label: "C", receita: 100 },
      { key: "a", label: "A", receita: 700 },
      { key: "b", label: "B", receita: 200 },
    ];
    const rows = computeAbc(input);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c"]);
    expect(rows[0].pctIndividual).toBeCloseTo(70);
    expect(rows[2].pctAcumulado).toBeCloseTo(100);
  });

  it("classifica A/B/C pela participação acumulada (crossing entra em A)", () => {
    // 80 / 15 / 5 exatos
    const input: AbcInput[] = [
      { key: "a", label: "A", receita: 80 },
      { key: "b", label: "B", receita: 15 },
      { key: "c", label: "C", receita: 5 },
    ];
    const rows = computeAbc(input);
    expect(rows.find((r) => r.key === "a")!.classe).toBe("A"); // running 0 < .8
    expect(rows.find((r) => r.key === "b")!.classe).toBe("B"); // running .8, .8<.95
    expect(rows.find((r) => r.key === "c")!.classe).toBe("C"); // running .95
  });

  it("o cliente que cruza os 80% ainda é A", () => {
    // ordenado desc: a(79) → b(19) → c(2). b entra com running 79 < 80 → A,
    // mesmo empurrando o acumulado para 98%.
    const input: AbcInput[] = [
      { key: "a", label: "A", receita: 79 },
      { key: "b", label: "B", receita: 19 },
      { key: "c", label: "C", receita: 2 },
    ];
    const rows = computeAbc(input);
    expect(rows.find((r) => r.key === "b")!.classe).toBe("A");
    expect(rows.find((r) => r.key === "c")!.classe).toBe("C");
  });

  it("lista vazia → []", () => {
    expect(computeAbc([])).toEqual([]);
  });

  it("um único cliente → A com 100%", () => {
    const rows = computeAbc([{ key: "x", label: "X", receita: 500 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].classe).toBe("A");
    expect(rows[0].pctAcumulado).toBeCloseTo(100);
  });

  it("receita <= 0 nunca é A/B (vai pra C)", () => {
    const rows = computeAbc([
      { key: "a", label: "A", receita: 100 },
      { key: "z", label: "Z", receita: 0 },
      { key: "n", label: "N", receita: -50 },
    ]);
    expect(rows.find((r) => r.key === "z")!.classe).toBe("C");
    expect(rows.find((r) => r.key === "n")!.classe).toBe("C");
    expect(rows.find((r) => r.key === "z")!.pctIndividual).toBe(0);
  });

  it("total zero → todos C sem divisão por zero", () => {
    const rows = computeAbc([
      { key: "a", label: "A", receita: 0 },
      { key: "b", label: "B", receita: 0 },
    ]);
    expect(rows.every((r) => r.classe === "C")).toBe(true);
    expect(rows.every((r) => Number.isFinite(r.pctIndividual))).toBe(true);
  });

  it("respeita cortes customizados", () => {
    const input: AbcInput[] = [
      { key: "a", label: "A", receita: 50 },
      { key: "b", label: "B", receita: 50 },
    ];
    // aCutoff 0.5 → só o 1º é A (running 0<.5); 2º running .5 não < .5 → B
    const rows = computeAbc(input, { aCutoff: 0.5, bCutoff: 0.9 });
    expect(rows[0].classe).toBe("A");
    expect(rows[1].classe).toBe("B");
  });

  it("contarPorClasse soma as classes", () => {
    const rows = computeAbc([
      { key: "a", label: "A", receita: 80 },
      { key: "b", label: "B", receita: 15 },
      { key: "c", label: "C", receita: 5 },
    ]);
    expect(contarPorClasse(rows)).toEqual({ A: 1, B: 1, C: 1 });
  });
});

// ─── churn ──────────────────────────────────────────────────────────────────

describe("subMonths", () => {
  it("subtrai meses em UTC", () => {
    const d = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15
    expect(subMonths(d, 6).toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(subMonths(d, 12).toISOString().slice(0, 10)).toBe("2025-07-15");
  });
});

describe("computeChurnStatus", () => {
  const ref = new Date(Date.UTC(2026, 6, 28)); // 2026-07-28

  it("faturou dentro de 6 meses → ATIVO", () => {
    expect(computeChurnStatus(new Date(Date.UTC(2026, 4, 1)), ref)).toBe("ATIVO");
  });

  it("última compra entre 6 e 12 meses → EM_RISCO", () => {
    expect(computeChurnStatus(new Date(Date.UTC(2025, 11, 1)), ref)).toBe("EM_RISCO");
  });

  it("sem faturar há mais de 12 meses → PERDIDO", () => {
    expect(computeChurnStatus(new Date(Date.UTC(2024, 0, 1)), ref)).toBe("PERDIDO");
  });

  it("sem histórico → SEM_HISTORICO", () => {
    expect(computeChurnStatus(null, ref)).toBe("SEM_HISTORICO");
  });

  it("fronteira exata do corte de risco conta como ATIVO", () => {
    // refData − 6 meses = 2026-01-28 exato
    expect(computeChurnStatus(new Date(Date.UTC(2026, 0, 28)), ref)).toBe("ATIVO");
  });

  it("janelas configuráveis (3 e 9 meses)", () => {
    const opts = { emRiscoMeses: 3, perdidoMeses: 9 };
    expect(computeChurnStatus(new Date(Date.UTC(2026, 5, 1)), ref, opts)).toBe("ATIVO");
    expect(computeChurnStatus(new Date(Date.UTC(2026, 1, 1)), ref, opts)).toBe("EM_RISCO");
    expect(computeChurnStatus(new Date(Date.UTC(2025, 5, 1)), ref, opts)).toBe("PERDIDO");
  });
});
