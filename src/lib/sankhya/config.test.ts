import { describe, it, expect } from "vitest";
import { getSankhyaConfig, isSankhyaConfigured } from "./config";

function env(vars: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...vars } as NodeJS.ProcessEnv;
}

describe("getSankhyaConfig", () => {
  it("sem variáveis → null (integração desabilitada)", () => {
    expect(getSankhyaConfig(env())).toBeNull();
    expect(isSankhyaConfigured(env())).toBe(false);
  });

  it("OAuth completo → modo oauth com defaults", () => {
    const cfg = getSankhyaConfig(
      env({
        SANKHYA_CLIENT_ID: "id",
        SANKHYA_CLIENT_SECRET: "secret",
        SANKHYA_XTOKEN: "xt",
      }),
    );
    expect(cfg).toMatchObject({
      mode: "oauth",
      baseUrl: "https://api.sankhya.com.br",
      clientId: "id",
      clientSecret: "secret",
      xToken: "xt",
      timeoutMs: 30_000,
    });
  });

  it("OAuth incompleto → erro descritivo", () => {
    expect(() => getSankhyaConfig(env({ SANKHYA_CLIENT_ID: "id" }))).toThrow(
      /SANKHYA_CLIENT_SECRET/,
    );
    // incompleta ainda conta como "configurada" (para o status acusar o erro)
    expect(isSankhyaConfigured(env({ SANKHYA_CLIENT_ID: "id" }))).toBe(true);
  });

  it("legado completo → modo legacy", () => {
    const cfg = getSankhyaConfig(
      env({
        SANKHYA_APPKEY: "ak",
        SANKHYA_TOKEN: "tk",
        SANKHYA_USERNAME: "u@autron.com.br",
        SANKHYA_PASSWORD: "p",
      }),
    );
    expect(cfg).toMatchObject({ mode: "legacy", appkey: "ak", username: "u@autron.com.br" });
  });

  it("legado incompleto → erro descritivo", () => {
    expect(() => getSankhyaConfig(env({ SANKHYA_APPKEY: "ak" }))).toThrow(/SANKHYA_TOKEN/);
  });

  it("OAuth tem precedência quando os dois modos estão presentes", () => {
    const cfg = getSankhyaConfig(
      env({
        SANKHYA_CLIENT_ID: "id",
        SANKHYA_CLIENT_SECRET: "secret",
        SANKHYA_XTOKEN: "xt",
        SANKHYA_APPKEY: "ak",
        SANKHYA_TOKEN: "tk",
        SANKHYA_USERNAME: "u",
        SANKHYA_PASSWORD: "p",
      }),
    );
    expect(cfg?.mode).toBe("oauth");
  });

  it("normaliza baseUrl (remove barra final) e aceita sandbox", () => {
    const cfg = getSankhyaConfig(
      env({
        SANKHYA_BASE_URL: "https://api.sandbox.sankhya.com.br/",
        SANKHYA_CLIENT_ID: "id",
        SANKHYA_CLIENT_SECRET: "s",
        SANKHYA_XTOKEN: "xt",
      }),
    );
    expect(cfg?.baseUrl).toBe("https://api.sandbox.sankhya.com.br");
  });

  it("variáveis em branco contam como ausentes", () => {
    expect(getSankhyaConfig(env({ SANKHYA_CLIENT_ID: "  ", SANKHYA_XTOKEN: "" }))).toBeNull();
  });
});
