"use server";

import { auth } from "@/lib/auth";
import { ROLES_CONTROLADORIA, type Role } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  criarConciliacao,
  excluirConciliacao,
} from "@/lib/services/conciliacao";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

interface Err {
  ok: false;
  error: string;
}

export type CriarConciliacaoResult =
  | { ok: true; id: string; qtdDivergencias: number; bateuTotalizador: boolean }
  | Err;

/**
 * Server action chamada pelo form de "Nova Conciliação".
 * Recebe FormData com:
 *  - contaContabil (string)
 *  - dataReferencia (string ISO YYYY-MM-DD)
 *  - observacoes (string opcional)
 *  - financeiro (File)
 *  - contabil (File)
 *
 * Caminho feliz: persiste e faz redirect pra /conciliacao/[id].
 * Caminho ruim: retorna { ok: false, error } pro form mostrar.
 */
export async function criarConciliacaoAction(formData: FormData): Promise<CriarConciliacaoResult> {
  const session = await auth();
  if (!session) return { ok: false, error: "Não autenticado." };

  const role = session.user.role as Role;
  if (!ROLES_CONTROLADORIA.includes(role)) {
    return { ok: false, error: "Sem permissão. Apenas Controladoria/Admin pode criar conciliações." };
  }

  const contaContabil = String(formData.get("contaContabil") ?? "").trim();
  const dataReferenciaStr = String(formData.get("dataReferencia") ?? "").trim();
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!contaContabil) return { ok: false, error: "Conta contábil obrigatória." };
  if (!dataReferenciaStr) return { ok: false, error: "Data de referência obrigatória." };

  // dataReferenciaStr esperado em formato YYYY-MM-DD (input type=date).
  const dataReferencia = new Date(dataReferenciaStr + "T00:00:00Z");
  if (Number.isNaN(dataReferencia.getTime())) {
    return { ok: false, error: "Data de referência inválida." };
  }

  const financeiroFile = formData.get("financeiro");
  const contabilFile = formData.get("contabil");
  if (!(financeiroFile instanceof File) || financeiroFile.size === 0) {
    return { ok: false, error: "Arquivo do Relatório Financeiro é obrigatório." };
  }
  if (!(contabilFile instanceof File) || contabilFile.size === 0) {
    return { ok: false, error: "Arquivo do Balancete Contábil é obrigatório." };
  }

  // Limite de tamanho — 10MB cada (planilhas do Protheus ficam ~30-200KB; mais que 10MB é suspeito).
  const MAX_BYTES = 10 * 1024 * 1024;
  if (financeiroFile.size > MAX_BYTES) return { ok: false, error: "Arquivo Financeiro excede 10MB." };
  if (contabilFile.size > MAX_BYTES) return { ok: false, error: "Arquivo Contábil excede 10MB." };

  const financeiroBuffer = Buffer.from(await financeiroFile.arrayBuffer());
  const contabilBuffer = Buffer.from(await contabilFile.arrayBuffer());

  let result;
  try {
    result = await criarConciliacao({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      contaContabil,
      dataReferencia,
      financeiroBuffer,
      financeiroFileName: financeiroFile.name,
      contabilBuffer,
      contabilFileName: contabilFile.name,
      observacoes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao processar.";
    return { ok: false, error: msg };
  }

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "conciliacao.create",
    entity: "Conciliacao",
    entityId: result.id,
    meta: {
      contaContabil,
      dataReferencia: dataReferencia.toISOString().slice(0, 10),
      qtdDivergencias: result.qtdDivergencias,
      bateuTotalizador: result.bateuTotalizador,
    },
  });

  revalidatePath("/conciliacao");
  redirect(`/conciliacao/${result.id}`);
}

export async function salvarObservacoesAction(
  id: string,
  observacoes: string,
): Promise<{ ok: true } | Err> {
  const session = await auth();
  if (!session) return { ok: false, error: "Não autenticado." };
  const role = session.user.role as Role;
  if (!ROLES_CONTROLADORIA.includes(role)) return { ok: false, error: "Sem permissão." };

  // Garantia multi-tenant: confirma que a conciliação pertence ao tenant ANTES de update.
  const existing = await prisma.conciliacao.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Conciliação não encontrada." };

  const obsClean = observacoes.trim();

  await prisma.conciliacao.update({
    where: { id },
    data: { observacoes: obsClean || null },
  });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "conciliacao.observacoes.update",
    entity: "Conciliacao",
    entityId: id,
    meta: { length: obsClean.length },
  });

  revalidatePath(`/conciliacao/${id}`);
  return { ok: true };
}

export async function excluirConciliacaoAction(id: string): Promise<{ ok: true } | Err> {
  const session = await auth();
  if (!session) return { ok: false, error: "Não autenticado." };
  const role = session.user.role as Role;
  if (!ROLES_CONTROLADORIA.includes(role)) return { ok: false, error: "Sem permissão." };

  const removed = await excluirConciliacao(id, session.user.tenantId);
  if (!removed) return { ok: false, error: "Conciliação não encontrada." };

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "conciliacao.delete",
    entity: "Conciliacao",
    entityId: id,
  });

  revalidatePath("/conciliacao");
  redirect("/conciliacao");
}
