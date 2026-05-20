// src/lib/iaSso.ts
import { SignJWT } from "jose";

export interface IaSsoPayload {
  email: string;
  name: string;
  userId: string;
  tenantId: string;
}

/**
 * Assina um JWT HS256 curto (5min) para handshake SSO com a instância
 * do Chat IA (Open WebUI via mini-proxy). One-time-use garantido pelo
 * mini-proxy via cache de `jti`.
 */
export async function signSsoJwt(
  payload: IaSsoPayload,
  secret: string,
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("autron-dash")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(crypto.randomUUID())
    .sign(secretKey);
}
