import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { parseClientesCnpj, type ClienteCnpjRow } from "@/lib/parsers/clienteCnpj";

const INSERT_CHUNK = 1000;

export interface ImportInput {
  tenantId: string;
  userId: string;
  filename: string;
  buffer: Buffer;
}

export interface ImportResult {
  batchId: string;
  total: number;
  pending: number;
  skipped: number; // documentos não enriquecíveis (CPF / inválido)
  emptyRows: number; // linhas sem documento ignoradas
  warnings: string[];
}

/** True se o documento NÃO é enriquecível via APIs de CNPJ da Receita. */
function isNaoEnriquecivel(row: ClienteCnpjRow): boolean {
  return row.tipoDoc !== "CNPJ" || !row.valido;
}

function skipReason(row: ClienteCnpjRow): string {
  if (row.tipoDoc === "CPF") return "CPF (pessoa física) — não enriquecível via Receita (CNPJ)";
  if (row.tipoDoc === "INVALIDO") return "Documento inválido";
  return "CNPJ com dígitos verificadores inválidos";
}

/**
 * Importa uma planilha de cadastros e cria um EnrichmentBatch com seus
 * EnrichmentRecords. Documentos não enriquecíveis (CPF / CNPJ inválido) já
 * entram como SKIPPED; os demais ficam PENDING para o runner processar.
 */
export async function importClientesCnpj(input: ImportInput): Promise<ImportResult> {
  const { tenantId, userId, filename, buffer } = input;

  const parsed = await parseClientesCnpj(buffer, { filename });
  if (parsed.rows.length === 0) {
    throw new Error(
      `nenhuma linha válida encontrada${
        parsed.warnings.length ? ": " + parsed.warnings.join("; ") : ""
      }`,
    );
  }

  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const preSkipped = parsed.rows.filter(isNaoEnriquecivel).length;
  const total = parsed.rows.length;
  const pending = total - preSkipped;

  const batch = await prisma.enrichmentBatch.create({
    data: {
      tenantId,
      userId,
      filename,
      fileHash,
      total,
      skipped: preSkipped,
      processed: preSkipped,
      // Se tudo já é SKIPPED, não há o que enriquecer → nasce DONE.
      status: pending === 0 ? "DONE" : "PENDING",
      finishedAt: pending === 0 ? new Date() : null,
    },
  });

  const data: Prisma.EnrichmentRecordCreateManyInput[] = parsed.rows.map((row) => {
    const naoEnriquecivel = isNaoEnriquecivel(row);
    return {
      tenantId,
      batchId: batch.id,
      rowIndex: row.rowIndex,
      origem: row.origem,
      inputCodigo: row.inputCodigo,
      inputLoja: row.inputLoja,
      inputName: row.inputName,
      inputNomeFantasia: row.inputNomeFantasia,
      cnpj: row.cnpj,
      tipoDoc: row.tipoDoc,
      status: naoEnriquecivel ? ("SKIPPED" as const) : ("PENDING" as const),
      errorMessage: naoEnriquecivel ? skipReason(row) : null,
    };
  });

  for (let i = 0; i < data.length; i += INSERT_CHUNK) {
    await prisma.enrichmentRecord.createMany({ data: data.slice(i, i + INSERT_CHUNK) });
  }

  return {
    batchId: batch.id,
    total,
    pending,
    skipped: preSkipped,
    emptyRows: parsed.skipped,
    warnings: parsed.warnings,
  };
}
