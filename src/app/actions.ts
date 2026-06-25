"use server";

import { signOut } from "@/lib/auth";
import { requireAuth } from "@/lib/authz";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { logAudit } from "@/lib/audit";
import { headers } from "next/headers";

/**
 * Server Action de sign-out, exportada de arquivo dedicado pra ser passada
 * como prop pra Client Components com segurança.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export interface ReportsSummary {
  totalPedidos: number;
  emAberto: number;
  finalizados: number;
  atrasados: number;
  prontos: number;
  errosCadastro: number;
  necessitamSC: number;
  necessitamOP: number;
  semEstoque: number;
  estoqueOk: number;
  durationMs: number;
}

/**
 * Roda o pipeline completo de enriquecimento (alocação FIFO + follow-up + ações)
 * sobre TODOS os pedidos do tenant e devolve um sumário pra UI.
 *
 * Acessa o domínio puro via getEnrichedPedidos() — não escreve nada no banco
 * (a estratégia é on-demand: cada abertura de aba já roda esse pipeline).
 *
 * Existe primariamente como feedback ao usuário pós-upload: ele ver os números
 * agregarem dá confiança que os dados foram corretamente processados.
 */
export async function runReports(): Promise<
  { ok: true; summary: ReportsSummary } | { ok: false; error: string }
> {
  // Relatório de leitura: disponível a qualquer usuário autenticado.
  const guard = await requireAuth();
  if (guard.error) return { ok: false, error: "Não autorizado" };
  const session = guard.session!;

  const start = Date.now();

  try {
    const enriched = await getEnrichedPedidos({ tenantId: session.user.tenantId });

    const summary: ReportsSummary = {
      totalPedidos: enriched.length,
      emAberto: 0,
      finalizados: 0,
      atrasados: 0,
      prontos: 0,
      errosCadastro: 0,
      necessitamSC: 0,
      necessitamOP: 0,
      semEstoque: 0,
      estoqueOk: 0,
      durationMs: 0,
    };

    for (const p of enriched) {
      if (p.statusPedido === "FINALIZADO") summary.finalizados++;
      else summary.emAberto++;

      if (p.diasAtrasoCliente != null && p.diasAtrasoCliente > 0) summary.atrasados++;
      if (p.prontoParaFazer === "SIM") summary.prontos++;
      if (p.acaoNecessaria === "ERRO no CADASTRO") summary.errosCadastro++;
      if (p.acaoNecessaria === "Necessario gerar SC") summary.necessitamSC++;
      if (p.acaoNecessaria === "Necessario gerar OP") summary.necessitamOP++;
      if (p.disponibilidadeEstoque === "NAO") summary.semEstoque++;
      if (p.disponibilidadeEstoque === "SIM") summary.estoqueOk++;
    }

    summary.durationMs = Date.now() - start;

    const hdr = await headers();
    const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
    const userAgent = hdr.get("user-agent");

    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "reports.generated",
      entity: "Reports",
      meta: {
        totalPedidos: summary.totalPedidos,
        durationMs: summary.durationMs,
      },
      ip,
      userAgent,
    });

    return { ok: true, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado";
    return { ok: false, error: message };
  }
}
