import { NextRequest, NextResponse } from "next/server";
import { Dataset } from "@prisma/client";
import { requireRole, ROLES_WRITE } from "@/lib/authz";
import { rateLimit } from "@/lib/rateLimit";
import { processUpload } from "@/lib/uploads";
import { getClientIp, getUserAgent, logAudit } from "@/lib/audit";
import { DATASET_ACCEPTS } from "@/lib/parsers";

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB ?? 20)) * 1024 * 1024;
const VALID_DATASETS = new Set<Dataset>([
  "PEDIDO",
  "FOLLOWUP",
  "ESTOQUE",
  "FATURAMENTO",
  "CLASSIFICACAO",
  "META",
  "PLOOMES",
]);

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ dataset: string }> },
) {
  const { dataset: datasetParam } = await context.params;
  const dataset = datasetParam.toUpperCase() as Dataset;

  if (!VALID_DATASETS.has(dataset)) {
    return NextResponse.json({ error: "Dataset inválido" }, { status: 400 });
  }

  const guard = await requireRole(ROLES_WRITE);
  if (guard.error) return guard.error;
  const session = guard.session;

  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  const rl = await rateLimit({
    key: `upload:user:${session.user.id}:${dataset}`,
    windowSec: 60,
    max: 5,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de upload. Aguarde alguns segundos." },
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

  const expectedExt = DATASET_ACCEPTS[dataset];
  if (!file.name.toLowerCase().endsWith(expectedExt)) {
    return NextResponse.json(
      { error: `Arquivo deve ter extensão ${expectedExt}` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "upload.started",
    entity: "DataUpload",
    meta: { dataset, filename: file.name, size: file.size },
    ip,
    userAgent,
  });

  try {
    const result = await processUpload({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      dataset,
      filename: file.name,
      buffer,
      ip,
      userAgent,
    });
    return NextResponse.json({
      ok: true,
      uploadId: result.uploadId,
      rowCount: result.rowCount,
      skipped: result.skipped,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar upload";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
