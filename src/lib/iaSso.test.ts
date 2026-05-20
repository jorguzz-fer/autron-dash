// src/lib/iaSso.test.ts
import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signSsoJwt } from "./iaSso";

const SECRET = "test-secret-pelo-menos-32-bytes-pra-hs256-ok";

describe("signSsoJwt", () => {
  it("retorna JWT que verifica com a mesma chave", async () => {
    const token = await signSsoJwt(
      { email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" },
      SECRET,
    );
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "autron-dash",
    });
    expect(payload.email).toBe("f@a.com");
    expect(payload.name).toBe("F");
    expect(payload.userId).toBe("u1");
    expect(payload.tenantId).toBe("t1");
    expect(payload.iss).toBe("autron-dash");
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("expira em ~5 minutos", async () => {
    const token = await signSsoJwt(
      { email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" },
      SECRET,
    );
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now);
    expect(payload.exp).toBeLessThanOrEqual(now + 5 * 60 + 2);
  });

  it("rejeita verificação com chave errada", async () => {
    const token = await signSsoJwt(
      { email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" },
      SECRET,
    );
    await expect(
      jwtVerify(token, new TextEncoder().encode("chave-errada-tambem-com-32-bytes-pra-padding")),
    ).rejects.toThrow();
  });

  it("gera um jti único a cada chamada", async () => {
    const t1 = await signSsoJwt({ email: "x", name: "x", userId: "x", tenantId: "x" }, SECRET);
    const t2 = await signSsoJwt({ email: "x", name: "x", userId: "x", tenantId: "x" }, SECRET);
    const p1 = (await jwtVerify(t1, new TextEncoder().encode(SECRET))).payload;
    const p2 = (await jwtVerify(t2, new TextEncoder().encode(SECRET))).payload;
    expect(p1.jti).not.toBe(p2.jti);
  });
});
