/**
 * Identificação do ambiente em que a instância está rodando.
 *
 * Existem duas instâncias do Dash no Coolify apontando para o MESMO
 * repositório, com bancos separados:
 *
 *   produção     → branch `main`,    banco autron_dash
 *   homologação  → branch `homolog`, banco autron_dash_homolog
 *
 * Como as duas rodam o mesmo código e ficam visualmente idênticas, a
 * homologação precisa se anunciar — senão alguém trabalha de verdade no
 * ambiente de teste (ou testa achando que está no de teste, e não está).
 * Quem marca é a variável `APP_ENV=homolog` no painel do Coolify.
 *
 * Deliberadamente NÃO é `NEXT_PUBLIC_*`: essas são embutidas no bundle em
 * BUILD time, e o Coolify injeta variáveis em runtime. Lida por Server
 * Component, `process.env` em runtime funciona no output standalone.
 *
 * Default é produção: um ambiente só é de teste quando diz explicitamente
 * que é. Esquecer a variável na homologação mostra a faixa de menos (chato);
 * o contrário — produção se anunciando como teste — seria pior.
 */

export type AppEnv = "producao" | "homolog";

export function getAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const v = env.APP_ENV?.trim().toLowerCase();
  if (v === "homolog" || v === "homologacao" || v === "homologação" || v === "staging") {
    return "homolog";
  }
  return "producao";
}

export function isHomolog(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAppEnv(env) === "homolog";
}

/** Prefixo do <title> — deixa a aba do navegador distinguível. */
export function titlePrefix(env: NodeJS.ProcessEnv = process.env): string {
  return isHomolog(env) ? "[HOMOLOG] " : "";
}
