import { NextResponse } from "next/server";
import { requireRole, ROLES_READ } from "@/lib/authz";
import { getClientIp, logAudit } from "@/lib/audit";
import { gerarXlsxEnriquecimento } from "@/lib/services/cnpj/export";

/** Download do .xlsx com os registros enriquecidos do batch. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ROLES_READ);
  if (guard.error) return guard.error;
  const { id } = await ctx.params;
  const tenantId = guard.session.user.tenantId;

  const out = await gerarXlsxEnriquecimento(id, tenantId);
  if (!out) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  await logAudit({
    tenantId,
    userId: guard.session.user.id,
    action: "enrich.export",
    entity: "EnrichmentBatch",
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
