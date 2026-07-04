import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/moduleAccess";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp, getUserAgent, logAudit } from "@/lib/audit";
import { importClientesCnpj } from "@/lib/services/cnpj/import";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 20) * 1024 * 1024;

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await requireModule("ENRIQUECIMENTO");
  if (guard.error) return guard.error;
  const session = guard.session;

  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  const rl = await rateLimit({
    key: `enrich:import:user:${session.user.id}`,
    windowSec: 60,
    max: 5,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns segundos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form-data inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' obrigatório" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo maior que ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB` },
      { status: 413 },
    );
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return NextResponse.json({ error: "Arquivo deve ser .xlsx ou .csv" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importClientesCnpj({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      filename: file.name,
      buffer,
    });

    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "enrich.import",
      entity: "EnrichmentBatch",
      entityId: result.batchId,
      meta: {
        filename: file.name,
        total: result.total,
        pending: result.pending,
        skipped: result.skipped,
        emptyRows: result.emptyRows,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao importar";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
