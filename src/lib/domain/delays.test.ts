import { describe, it, expect } from "vitest";
import { diasAtrasoCliente, diasAtrasoOfertada } from "./delays";

const today = new Date("2026-05-06T12:00:00Z");

describe("diasAtrasoCliente", () => {
  it("null quando pedido FINALIZADO (não calcula)", () => {
    expect(
      diasAtrasoCliente({ dtFatCli: new Date("2026-04-01") }, "FINALIZADO", today),
    ).toBeNull();
  });
  it("null quando dtFatCli é null", () => {
    expect(diasAtrasoCliente({ dtFatCli: null }, "EM ABERTO", today)).toBeNull();
  });
  it("positivo quando atrasado", () => {
    // 2026-04-01 → today 2026-05-06 = 35 dias
    expect(
      diasAtrasoCliente({ dtFatCli: new Date("2026-04-01") }, "EM ABERTO", today),
    ).toBe(35);
  });
  it("negativo quando ainda no prazo", () => {
    expect(
      diasAtrasoCliente({ dtFatCli: new Date("2026-06-01") }, "EM ABERTO", today),
    ).toBe(-26);
  });
  it("zero no dia exato", () => {
    expect(
      diasAtrasoCliente({ dtFatCli: new Date("2026-05-06T00:00:00Z") }, "EM ABERTO", today),
    ).toBe(0);
  });
});

describe("diasAtrasoOfertada", () => {
  it("usa dtOfertada", () => {
    expect(
      diasAtrasoOfertada({ dtOfertada: new Date("2026-04-20") }, "EM ABERTO", today),
    ).toBe(16);
  });
  it("null para finalizado", () => {
    expect(
      diasAtrasoOfertada({ dtOfertada: new Date("2026-04-20") }, "FINALIZADO", today),
    ).toBeNull();
  });
});
