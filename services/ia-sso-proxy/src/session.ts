import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cookie de sessão pós-handshake.
 *
 * Formato: base64url(JSON({email, name, exp})) + "." + base64url(HMAC-SHA256)
 *
 * Por que cookie próprio em vez de re-emitir o JWT do autron-dash?
 *   - JWT do autron-dash tem TTL de 5min (one-shot)
 *   - Após handshake, queremos manter sessão por horas sem voltar pro autron-dash
 *   - Cookie HMAC com mesma chave: stateless, sem dependência de banco
 */

const COOKIE_NAME = "ia_sso_session";

export interface SessionData {
  email: string;
  name: string;
  /** Epoch ms — expira em. */
  exp: number;
}

export function cookieName(): string {
  return COOKIE_NAME;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad),
    "base64",
  );
}

export function encodeSession(data: SessionData, secret: string): string {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(data), "utf8"));
  const sig = createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64urlEncode(sig)}`;
}

export function decodeSession(
  cookieValue: string | undefined,
  secret: string,
): SessionData | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payload, sigB64] = parts;
  if (!payload || !sigB64) return null;

  const expected = createHmac("sha256", secret).update(payload).digest();
  let received: Buffer;
  try {
    received = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  let data: SessionData;
  try {
    data = JSON.parse(b64urlDecode(payload).toString("utf8")) as SessionData;
  } catch {
    return null;
  }
  if (typeof data?.email !== "string" || typeof data?.name !== "string") {
    return null;
  }
  if (typeof data?.exp !== "number" || data.exp < Date.now()) {
    return null;
  }
  return data;
}

/**
 * Extrai o valor do cookie ia_sso_session de um header `cookie` cru.
 */
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) return rest.join("=");
  }
  return undefined;
}

/**
 * Monta o header Set-Cookie pra registrar a sessão.
 * Secure/HttpOnly/SameSite=Lax/Path=/, com Max-Age em segundos.
 */
export function buildSetCookieHeader(value: string, ttlHours: number): string {
  const maxAgeSeconds = Math.floor(ttlHours * 3600);
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
