import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/moduleAccess";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp, getUserAgent, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { kickBatch, retryFailed } from "@/lib/services/cnpj/runner";

/**
 * Dispara (ou re-dispara) o enriquecimento de um batch. Com ?retry=1, reseta
 * registros ERROR para PENDING antes de rodar. O processamento roda em
 * background (fire-and-forget); a resposta volta imediatamente.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("ENRIQUECIMENTO");
  if (guard.error) return guard.error;
  const session = guard.session;
  const { id } = await ctx.params;
  const tenantId = session.user.tenantId;

  const rl = await rateLimit({ key: `enrich:run:user:${session.user.id}`, windowSec: 60, max: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const batch = await prisma.enrichmentBatch.findFirst({ where: { id, tenantId } });
  if (!batch) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  const retry = new URL(req.url).searchParams.get("retry") === "1";

  await logAudit({
    tenantId,
    userId: session.user.id,
    action: retry ? "enrich.retry" : "enrich.run",
    entity: "EnrichmentBatch",
    entityId: id,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  if (retry) {
    const reset = await retryFailed(id, tenantId);
    return NextResponse.json({ ok: true, retried: reset });
  }

  kickBatch(id, tenantId);
  return NextResponse.json({ ok: true });
}
