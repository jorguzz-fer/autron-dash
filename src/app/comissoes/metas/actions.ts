"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  saveMetasGrid,
  importMetasPlanilha,
  type MetaGridEntry,
  type ImportMetasResult,
} from "@/lib/services/metasComissao";

export interface SalvarResult {
  ok: boolean;
  error?: string;
  gravadas?: number;
}

/** Substitui as metas do ano com o estado atual da grade. */
export async function salvarMetasAction(input: {
  ano: number;
  entries: MetaGridEntry[];
}): Promise<SalvarResult> {
  const guard = await requireCapability("ACCESS_COMISSOES");
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const tenantId = guard.session.user.tenantId;

  if (!Number.isInteger(input.ano) || input.ano < 2000 || input.ano > 2100) {
    return { ok: false, error: "Ano inválido" };
  }
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const gravadas = await saveMetasGrid(tenantId, input.ano, entries);
  revalidatePath("/comissoes/metas");
  return { ok: true, gravadas };
}

export interface ImportarResult {
  ok: boolean;
  error?: string;
  data?: ImportMetasResult;
}

/** Lê a planilha larga e devolve os dados casados/não-casados (NÃO grava). */
export async function importarMetasAction(formData: FormData): Promise<ImportarResult> {
  const guard = await requireCapability("ACCESS_COMISSOES");
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const tenantId = guard.session.user.tenantId;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Arquivo não enviado" };
  if (file.size === 0) return { ok: false, error: "Arquivo vazio" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Arquivo maior que 10MB" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const vendedores = await prisma.comissaoVendedor.findMany({
    where: { tenantId },
    select: { codigoProtheus: true, nome: true },
  });

  try {
    const data = await importMetasPlanilha(buffer, vendedores);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao ler a planilha" };
  }
}
