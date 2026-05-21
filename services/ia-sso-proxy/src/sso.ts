import { jwtVerify } from "jose";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Env } from "./env.js";
import type { JtiStore } from "./jti-store.js";
import { buildSetCookieHeader, encodeSession } from "./session.js";

/**
 * Handler do GET /sso?token=<jwt>.
 *
 * Fluxo:
 *   1. Lê `?token=` da URL
 *   2. Valida JWT (HS256, issuer "autron-dash", exp)
 *   3. Anti-replay: registra `jti` no store. Se já visto → 401.
 *   4. Set cookie de sessão HMAC (TTL = env.sessionTtlHours)
 *   5. Redireciona 302 → "/" (Open WebUI raiz)
 */
export async function handleSso(
  req: IncomingMessage,
  res: ServerResponse,
  env: Env,
  jtiStore: JtiStore,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");

  if (!token) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request — falta o parâmetro ?token=");
    return;
  }

  let payload: {
    email?: unknown;
    name?: unknown;
    userId?: unknown;
    tenantId?: unknown;
    jti?: unknown;
    exp?: unknown;
  };
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(env.ssoSecret), {
      issuer: env.expectedIssuer,
      algorithms: ["HS256"],
    });
    payload = result.payload;
  } catch (err) {
    console.warn(`[sso] JWT inválido: ${(err as Error).message}`);
    res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Unauthorized — JWT inválido ou expirado");
    return;
  }

  if (
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.exp !== "number"
  ) {
    res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Unauthorized — payload incompleto");
    return;
  }

  // Anti-replay
  const ok = jtiStore.register(payload.jti, payload.exp * 1000);
  if (!ok) {
    console.warn(`[sso] replay detectado para jti=${payload.jti}`);
    res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Unauthorized — token já consumido");
    return;
  }

  // Set cookie de sessão (TTL = sessionTtlHours horas, contado a partir de agora)
  const sessionExpMs = Date.now() + env.sessionTtlHours * 3600 * 1000;
  const cookieValue = encodeSession(
    { email: payload.email, name: payload.name, exp: sessionExpMs },
    env.ssoSecret,
  );
  res.writeHead(302, {
    Location: "/",
    "Set-Cookie": buildSetCookieHeader(cookieValue, env.sessionTtlHours),
  });
  res.end();
  console.log(`[sso] handshake OK email=${payload.email} jti=${payload.jti.slice(0, 8)}`);
}
