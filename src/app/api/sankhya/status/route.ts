// GET /api/sankhya/status — diagnóstico da integração com a API do Sankhya.
//
// Testa config → autenticação → uma consulta mínima (Parceiro 0) e devolve o
// resultado de cada etapa. É a tela de "funcionou?" para quando as
// credenciais do gateway (Rogério) forem configuradas no ambiente.
// Restrito a ADMIN: o diagnóstico expõe modo/URL da integração e o erro cru
// do gateway.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { testConnection } from "@/lib/sankhya/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const guard = await requireRole(["ADMIN"]);
  if (guard.error) return guard.error;

  // A consulta de teste bate no ERP de produção — sem motivo para marteladas.
  const rl = await rateLimit({
    key: `sankhya-status:user:${guard.session.user.id}`,
    windowSec: 60,
    max: 6,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas verificações seguidas. Aguarde alguns segundos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const status = await testConnection();
  return NextResponse.json(status, { status: 200 });
}
