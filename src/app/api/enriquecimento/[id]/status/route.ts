import { NextResponse } from "next/server";
import { requireModule } from "@/lib/moduleAccess";
import { prisma } from "@/lib/db";

/** Poll leve do progresso de um batch (contadores + status). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("ENRIQUECIMENTO");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;

  const batch = await prisma.enrichmentBatch.findFirst({
    where: { id, tenantId: guard.session.user.tenantId },
    select: {
      id: true,
      status: true,
      total: true,
      processed: true,
      succeeded: true,
      failed: true,
      skipped: true,
      startedAt: true,
      finishedAt: true,
      lastError: true,
    },
  });
  if (!batch) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  return NextResponse.json(batch, { headers: { "Cache-Control": "no-store" } });
}
