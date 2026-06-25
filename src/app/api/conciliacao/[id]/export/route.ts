import { auth } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { getUserAccess } from "@/lib/services/perfis";
import { gerarXlsxConciliacao } from "@/lib/services/conciliacao-export";
import { NextResponse } from "next/server";

/**
 * Download do .xlsx da conciliação.
 *
 * Restrito à capacidade ACCESS_CONCILIACAO. Multi-tenant garantido em
 * gerarXlsxConciliacao (filtra por tenantId). Audit log gravado.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("ACCESS_CONCILIACAO")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const out = await gerarXlsxConciliacao(id, session.user.tenantId);
  if (!out) {
    return NextResponse.json({ error: "Conciliação não encontrada" }, { status: 404 });
  }

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "conciliacao.export",
    entity: "Conciliacao",
    entityId: id,
    ip: getClientIp(req),
  });

  return new NextResponse(out.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
