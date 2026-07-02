import { NextResponse } from "next/server";

/**
 * Healthcheck do container — SEM dependência de banco.
 *
 * O Coolify usava a rota raiz "/" por padrão, que exige auth + várias
 * queries no Postgres. Quando o banco trava num checkpoint de I/O (comum
 * em VPS compartilhada, picos de 80-270s vistos nos logs do Postgres), o
 * healthcheck falhava junto — o Traefik marcava o container inteiro como
 * não-saudável e respondia 503 para navegações reais, mesmo com o
 * processo Node saudável por baixo. Esta rota só confirma que o processo
 * está de pé; não reflete a saúde do banco.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
