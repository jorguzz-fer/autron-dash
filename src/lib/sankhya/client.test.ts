import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeStatusMessage,
  invokeService,
  loadRecords,
  normalizeLoadRecords,
  executeQuery,
  SankhyaError,
  __resetTokenCacheForTests,
} from "./client";

// ─── Helpers de mock de fetch ──────────────────────────────────────────────

type MockResponse = { status: number; body: unknown };

function mockFetchSequence(responses: MockResponse[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

const OAUTH_ENV = {
  SANKHYA_CLIENT_ID: "id",
  SANKHYA_CLIENT_SECRET: "secret",
  SANKHYA_XTOKEN: "xt",
};

const AUTH_OK: MockResponse = {
  status: 200,
  body: { access_token: "jwt-1", expires_in: 300, token_type: "Bearer" },
};

beforeEach(() => {
  __resetTokenCacheForTests();
  for (const [k, v] of Object.entries(OAUTH_ENV)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ─── decodeStatusMessage ───────────────────────────────────────────────────

describe("decodeStatusMessage", () => {
  it("mensagem simples passa direto", () => {
    expect(decodeStatusMessage("Sem permissão")).toBe("Sem permissão");
  });
  it("base64 legível é decodificado", () => {
    const encoded = Buffer.from("Serviço não autorizado para o usuário", "utf8").toString("base64");
    expect(decodeStatusMessage(encoded)).toBe("Serviço não autorizado para o usuário");
  });
  it("ausente → placeholder", () => {
    expect(decodeStatusMessage(undefined)).toBe("(sem statusMessage)");
  });
});

// ─── normalizeLoadRecords ──────────────────────────────────────────────────

describe("normalizeLoadRecords", () => {
  it("converte f0/f1 + metadata em objetos por nome de campo", () => {
    const { rows, hasMore, total } = normalizeLoadRecords({
      entities: {
        total: "2",
        hasMoreResult: "false",
        metadata: { fields: { field: [{ name: "CODPARC" }, { name: "NOMEPARC" }] } },
        entity: [
          { f0: { $: "1" }, f1: { $: "AUTRON" } },
          { f0: { $: "2" } }, // campo ausente → null
        ],
      },
    });
    expect(rows).toEqual([
      { CODPARC: "1", NOMEPARC: "AUTRON" },
      { CODPARC: "2", NOMEPARC: null },
    ]);
    expect(hasMore).toBe(false);
    expect(total).toBe(2);
  });

  it("entity/field únicos (objeto em vez de array) também funcionam", () => {
    const { rows } = normalizeLoadRecords({
      entities: {
        metadata: { fields: { field: { name: "CODVEND" } } },
        entity: { f0: { $: "7" } },
      },
    });
    expect(rows).toEqual([{ CODVEND: "7" }]);
  });

  it("resposta vazia → sem linhas", () => {
    const { rows, hasMore } = normalizeLoadRecords({ entities: {} });
    expect(rows).toEqual([]);
    expect(hasMore).toBe(false);
  });
});

// ─── invokeService: auth, retry e erros ────────────────────────────────────

describe("invokeService", () => {
  it("autentica via OAuth e envia Bearer + payload correto", async () => {
    const { calls } = mockFetchSequence([
      AUTH_OK,
      { status: 200, body: { status: "1", responseBody: { ok: true } } },
    ]);

    const out = await invokeService("CRUDServiceProvider.loadRecords", { x: 1 });
    expect(out).toEqual({ ok: true });

    expect(calls[0].url).toBe("https://api.sankhya.com.br/authenticate");
    expect((calls[0].init.headers as Record<string, string>)["X-Token"]).toBe("xt");

    expect(calls[1].url).toContain(
      "/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.loadRecords&outputType=json",
    );
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-1");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      serviceName: "CRUDServiceProvider.loadRecords",
      requestBody: { x: 1 },
    });
  });

  it("reusa o token em cache entre chamadas", async () => {
    const { fn } = mockFetchSequence([
      AUTH_OK,
      { status: 200, body: { status: "1", responseBody: {} } },
      { status: 200, body: { status: "1", responseBody: {} } },
    ]);
    await invokeService("A.b", {});
    await invokeService("A.b", {});
    // 1 auth + 2 serviços
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("em 401 reautentica UMA vez e repete a chamada", async () => {
    const { fn, calls } = mockFetchSequence([
      AUTH_OK,
      { status: 401, body: {} },
      { status: 200, body: { access_token: "jwt-2", expires_in: 300 } },
      { status: 200, body: { status: "1", responseBody: { ok: 2 } } },
    ]);
    const out = await invokeService("A.b", {});
    expect(out).toEqual({ ok: 2 });
    expect(fn).toHaveBeenCalledTimes(4);
    expect((calls[3].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-2");
  });

  it("status != 1 vira SankhyaError com a mensagem do serviço", async () => {
    mockFetchSequence([
      AUTH_OK,
      { status: 200, body: { status: "0", statusMessage: "Entidade inexistente" } },
    ]);
    await expect(invokeService("A.b", {})).rejects.toThrow(/Entidade inexistente/);
  });

  it("sem config → SankhyaError de config", async () => {
    vi.unstubAllEnvs();
    for (const k of Object.keys(OAUTH_ENV)) vi.stubEnv(k, "");
    await expect(invokeService("A.b", {})).rejects.toMatchObject({
      name: "SankhyaError",
      stage: "config",
    });
  });

  it("credencial recusada → erro de auth com dica das variáveis", async () => {
    mockFetchSequence([{ status: 401, body: { error_description: "Invalid client" } }]);
    await expect(invokeService("A.b", {})).rejects.toThrow(/SANKHYA_CLIENT_ID/);
  });
});

// ─── loadRecords: paginação ────────────────────────────────────────────────

describe("loadRecords", () => {
  function page(values: string[], hasMore: boolean): MockResponse {
    return {
      status: 200,
      body: {
        status: "1",
        responseBody: {
          entities: {
            hasMoreResult: String(hasMore),
            metadata: { fields: { field: [{ name: "CODVEND" }] } },
            entity: values.map((v) => ({ f0: { $: v } })),
          },
        },
      },
    };
  }

  it("percorre páginas até hasMoreResult=false", async () => {
    const { calls } = mockFetchSequence([AUTH_OK, page(["1", "2"], true), page(["3"], false)]);
    const rows = await loadRecords({ entity: "Vendedor", fields: ["CODVEND"] });
    expect(rows.map((r) => r.CODVEND)).toEqual(["1", "2", "3"]);

    const body1 = JSON.parse(String(calls[1].init.body));
    const body2 = JSON.parse(String(calls[2].init.body));
    expect(body1.requestBody.dataSet.offsetPage).toBe("0");
    expect(body2.requestBody.dataSet.offsetPage).toBe("1");
  });

  it("estoura maxPages com erro claro em vez de loop infinito", async () => {
    mockFetchSequence([AUTH_OK, page(["1"], true)]);
    await expect(
      loadRecords({ entity: "Vendedor", fields: ["CODVEND"], maxPages: 2 }),
    ).rejects.toThrow(/mais de 2 páginas/);
  });

  it("monta criteria com parâmetros tipados", async () => {
    const { calls } = mockFetchSequence([AUTH_OK, page([], false)]);
    await loadRecords({
      entity: "Parceiro",
      fields: ["CODPARC"],
      criteria: "this.CODPARC = ? AND this.DTCAD >= ?",
      parameters: [42, new Date(Date.UTC(2026, 7, 1))],
    });
    const ds = JSON.parse(String(calls[1].init.body)).requestBody.dataSet;
    expect(ds.criteria.expression.$).toBe("this.CODPARC = ? AND this.DTCAD >= ?");
    expect(ds.criteria.parameter).toEqual([
      { $: "42", type: "I" },
      { $: "01/08/2026", type: "D" },
    ]);
  });
});

// ─── executeQuery ──────────────────────────────────────────────────────────

describe("executeQuery", () => {
  it("normaliza fieldsMetadata + rows em objetos", async () => {
    mockFetchSequence([
      AUTH_OK,
      {
        status: 200,
        body: {
          status: "1",
          responseBody: {
            fieldsMetadata: [{ name: "NUNOTA" }, { name: "VLRNOTA" }],
            rows: [
              [262, 67923.27],
              [263, null],
            ],
          },
        },
      },
    ]);
    const rows = await executeQuery("SELECT NUNOTA, VLRNOTA FROM TGFCAB");
    expect(rows).toEqual([
      { NUNOTA: "262", VLRNOTA: "67923.27" },
      { NUNOTA: "263", VLRNOTA: null },
    ]);
  });

  it("recusa SQL que não é SELECT/WITH", async () => {
    await expect(executeQuery("DELETE FROM TGFCAB")).rejects.toThrow(SankhyaError);
    await expect(executeQuery("DELETE FROM TGFCAB")).rejects.toThrow(/apenas SELECT/);
  });
});
