import { describe, it, expect } from "vitest";
import { getAppEnv, isHomolog, titlePrefix } from "./appEnv";

function env(vars: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...vars } as NodeJS.ProcessEnv;
}

describe("getAppEnv", () => {
  it("sem APP_ENV → produção (o ambiente só é de teste se disser que é)", () => {
    expect(getAppEnv(env())).toBe("producao");
    expect(isHomolog(env())).toBe(false);
    expect(titlePrefix(env())).toBe("");
  });

  it("APP_ENV=homolog → homologação, com prefixo no título", () => {
    expect(getAppEnv(env({ APP_ENV: "homolog" }))).toBe("homolog");
    expect(isHomolog(env({ APP_ENV: "homolog" }))).toBe(true);
    expect(titlePrefix(env({ APP_ENV: "homolog" }))).toBe("[HOMOLOG] ");
  });

  it("aceita as variações previsíveis de quem digita no painel", () => {
    for (const v of ["HOMOLOG", " homolog ", "homologacao", "homologação", "staging"]) {
      expect(getAppEnv(env({ APP_ENV: v }))).toBe("homolog");
    }
  });

  it("valor desconhecido não vira homologação por acidente", () => {
    expect(getAppEnv(env({ APP_ENV: "producao" }))).toBe("producao");
    expect(getAppEnv(env({ APP_ENV: "prod" }))).toBe("producao");
    expect(getAppEnv(env({ APP_ENV: "" }))).toBe("producao");
  });
});
