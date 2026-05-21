/**
 * Parse e valida env vars na boot — se faltar algo crítico, derruba o processo
 * com mensagem clara (preferível a falhar 500 silenciosamente em request).
 */
export interface Env {
  /** Secret HS256 compartilhado com o autron-dash — usado pra verificar JWTs SSO. */
  ssoSecret: string;
  /** URL interna do Open WebUI (acessível só pela rede do Docker), ex: http://open-webui:8080 */
  openWebuiUrl: string;
  /** Issuer esperado no JWT (deve casar com `setIssuer` do autron-dash). */
  expectedIssuer: string;
  /** Porta HTTP do proxy. Default 8080. */
  port: number;
  /** TTL da sessão pós-handshake em horas. Default 8h. */
  sessionTtlHours: number;
}

export function loadEnv(): Env {
  const ssoSecret = process.env.IA_SSO_SECRET;
  const openWebuiUrl = process.env.OPEN_WEBUI_URL;

  const missing: string[] = [];
  if (!ssoSecret || ssoSecret.length < 32) {
    missing.push("IA_SSO_SECRET (precisa ter >= 32 caracteres)");
  }
  if (!openWebuiUrl) {
    missing.push("OPEN_WEBUI_URL (ex: http://open-webui:8080)");
  }

  if (missing.length > 0) {
    console.error("[ia-sso-proxy] env vars faltando ou inválidas:");
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  return {
    ssoSecret: ssoSecret!,
    openWebuiUrl: openWebuiUrl!.replace(/\/+$/, ""),
    expectedIssuer: process.env.EXPECTED_ISSUER || "autron-dash",
    port: Number(process.env.PORT) || 8080,
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS) || 8,
  };
}
