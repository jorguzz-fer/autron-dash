// src/lib/sankhya/config.ts
//
// Configuração da integração com a API do Sankhya (gateway
// api.sankhya.com.br) — Plano A da migração Protheus → Sankhya
// (docs/superpowers/plans/2026-08-20-migracao-sankhya-comissoes.md).
//
// Dois modos de autenticação, escolhidos pelas variáveis presentes no .env:
//
//   1. "oauth" (preferencial) — fluxo OAuth 2.0 client_credentials do
//      gateway: POST /authenticate com client_id + client_secret (criados na
//      Área do Desenvolvedor) e header X-Token (gerado pelo cliente Sankhya
//      na tela "Configurações Gateway" do SankhyaOm). Retorna um JWT curto
//      (~5 min) renovado automaticamente pelo client.
//
//   2. "legacy" — POST /login com headers appkey/token/username/password
//      (fluxo antigo, ainda aceito; sessão expira por inatividade).
//
// Sem nenhuma credencial configurada a integração fica desabilitada e o
// restante da aplicação segue funcionando só com upload de planilhas.

export interface SankhyaOAuthConfig {
  mode: "oauth";
  baseUrl: string;
  timeoutMs: number;
  clientId: string;
  clientSecret: string;
  xToken: string;
}

export interface SankhyaLegacyConfig {
  mode: "legacy";
  baseUrl: string;
  timeoutMs: number;
  appkey: string;
  token: string;
  username: string;
  password: string;
}

export type SankhyaConfig = SankhyaOAuthConfig | SankhyaLegacyConfig;

const DEFAULT_BASE_URL = "https://api.sankhya.com.br";
const DEFAULT_TIMEOUT_MS = 30_000;

function clean(v: string | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/**
 * Lê a configuração do ambiente. Retorna `null` quando nenhuma credencial
 * está definida (integração desabilitada). Lança erro se a configuração
 * está INCOMPLETA — melhor falhar alto do que autenticar com metade das
 * credenciais e gerar 401 confuso.
 */
export function getSankhyaConfig(env: NodeJS.ProcessEnv = process.env): SankhyaConfig | null {
  const baseUrl = (clean(env.SANKHYA_BASE_URL) ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = Number(clean(env.SANKHYA_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS);

  const clientId = clean(env.SANKHYA_CLIENT_ID);
  const clientSecret = clean(env.SANKHYA_CLIENT_SECRET);
  const xToken = clean(env.SANKHYA_XTOKEN);

  const appkey = clean(env.SANKHYA_APPKEY);
  const token = clean(env.SANKHYA_TOKEN);
  const username = clean(env.SANKHYA_USERNAME);
  const password = clean(env.SANKHYA_PASSWORD);

  const temOAuth = clientId || clientSecret || xToken;
  const temLegacy = appkey || token || username || password;

  if (temOAuth) {
    if (!clientId || !clientSecret || !xToken) {
      throw new Error(
        "Configuração Sankhya (OAuth) incompleta: defina SANKHYA_CLIENT_ID, SANKHYA_CLIENT_SECRET e SANKHYA_XTOKEN",
      );
    }
    return { mode: "oauth", baseUrl, timeoutMs, clientId, clientSecret, xToken };
  }

  if (temLegacy) {
    if (!appkey || !token || !username || !password) {
      throw new Error(
        "Configuração Sankhya (legacy) incompleta: defina SANKHYA_APPKEY, SANKHYA_TOKEN, SANKHYA_USERNAME e SANKHYA_PASSWORD",
      );
    }
    return { mode: "legacy", baseUrl, timeoutMs, appkey, token, username, password };
  }

  return null;
}

/** true quando há credenciais configuradas (não valida se funcionam). */
export function isSankhyaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return getSankhyaConfig(env) !== null;
  } catch {
    // Config incompleta conta como "configurada porém inválida" — quem chama
    // o client recebe o erro descritivo do getSankhyaConfig.
    return true;
  }
}
