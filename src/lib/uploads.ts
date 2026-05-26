import { Dataset, Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PARSERS } from "@/lib/parsers";
import type { PedidoRow } from "@/lib/parsers/pedido";
import type { FollowUpRow } from "@/lib/parsers/followup";
import type { EstoqueRow } from "@/lib/parsers/estoque";
import type { FaturamentoRow } from "@/lib/parsers/faturamento";
import type { ClassificacaoRow } from "@/lib/parsers/classificacao";
import type { MetaRow } from "@/lib/parsers/metas";
import type { PloomesRow } from "@/lib/parsers/ploomes";

// Tamanho de chunk para createMany. Postgres tem limite de 65535 parâmetros por query;
// Pedido tem 18 colunas, então 3000 rows ≈ 54000 params (margem segura).
const INSERT_CHUNK = 1000;

interface ProcessUploadInput {
  tenantId: string;
  userId: string;
  dataset: Dataset;
  filename: string;
  buffer: Buffer;
  ip?: string | null;
  userAgent?: string | null;
}

interface ProcessUploadResult {
  uploadId: string;
  rowCount: number;
  skipped: number;
  warnings: string[];
}

export async function processUpload(input: ProcessUploadInput): Promise<ProcessUploadResult> {
  const { tenantId, userId, dataset, filename, buffer, ip, userAgent } = input;

  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const fileSize = buffer.byteLength;

  const upload = await prisma.dataUpload.create({
    data: {
      tenantId,
      userId,
      dataset,
      filename,
      fileHash,
      fileSize,
      status: "PROCESSING",
    },
  });

  try {
    const parser = PARSERS[dataset as keyof typeof PARSERS];
    if (!parser) {
      throw new Error(`Parser não implementado para dataset: ${dataset}`);
    }
    const parsed = await parser(buffer);

    if (parsed.rows.length === 0) {
      throw new Error(
        `nenhuma linha válida encontrada${
          parsed.warnings.length > 0 ? ": " + parsed.warnings.join("; ") : ""
        }`,
      );
    }

    await prisma.$transaction(
      async (tx) => {
        await replaceDataset(tx, tenantId, dataset, parsed.rows);
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    // Defense-in-depth: filtro tenantId mesmo o id sendo cuid recém-gerado
    // (vem de upload.id da linha 40, não de input de usuário).
    const updatedCount = await prisma.dataUpload.updateMany({
      where: { id: upload.id, tenantId },
      data: {
        status: "SUCCESS",
        rowCount: parsed.rows.length,
        finishedAt: new Date(),
      },
    });
    if (updatedCount.count === 0) {
      throw new Error("DataUpload não encontrado para o tenant atual");
    }
    const finished = await prisma.dataUpload.findUniqueOrThrow({
      where: { id: upload.id },
    });

    await logAudit({
      tenantId,
      userId,
      action: "upload.success",
      entity: "DataUpload",
      entityId: finished.id,
      meta: {
        dataset,
        filename,
        fileHash,
        fileSize,
        rowCount: parsed.rows.length,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
      },
      ip,
      userAgent,
    });

    return {
      uploadId: finished.id,
      rowCount: finished.rowCount,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.dataUpload.updateMany({
      where: { id: upload.id, tenantId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    await logAudit({
      tenantId,
      userId,
      action: "upload.failed",
      entity: "DataUpload",
      entityId: upload.id,
      meta: { dataset, filename, fileHash, fileSize, error: message },
      ip,
      userAgent,
    });
    throw err;
  }
}

async function replaceDataset(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dataset: Dataset,
  rows: unknown[],
): Promise<void> {
  switch (dataset) {
    case "PEDIDO":
      await tx.pedido.deleteMany({ where: { tenantId } });
      await insertChunks(rows as PedidoRow[], (chunk) =>
        tx.pedido.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;

    case "FOLLOWUP":
      await tx.followUp.deleteMany({ where: { tenantId } });
      await insertChunks(rows as FollowUpRow[], (chunk) =>
        tx.followUp.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;

    case "ESTOQUE":
      await tx.estoque.deleteMany({ where: { tenantId } });
      await insertChunks(rows as EstoqueRow[], (chunk) =>
        tx.estoque.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;

    case "FATURAMENTO":
      await tx.faturamento.deleteMany({ where: { tenantId } });
      await insertChunks(rows as FaturamentoRow[], (chunk) =>
        tx.faturamento.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;

    case "CLASSIFICACAO":
      await tx.classificacaoProduto.deleteMany({ where: { tenantId } });
      await insertChunks(rows as ClassificacaoRow[], (chunk) =>
        tx.classificacaoProduto.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;

    case "META":
      await tx.meta.deleteMany({ where: { tenantId } });
      await insertChunks(rows as MetaRow[], (chunk) =>
        tx.meta.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;

    case "PLOOMES":
      await tx.ploomesOportunidade.deleteMany({ where: { tenantId } });
      await insertChunks(rows as PloomesRow[], (chunk) =>
        tx.ploomesOportunidade.createMany({ data: chunk.map((r) => ({ tenantId, ...r })) }),
      );
      return;
  }
}

async function insertChunks<T>(
  rows: T[],
  insertFn: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    await insertFn(chunk);
  }
}
