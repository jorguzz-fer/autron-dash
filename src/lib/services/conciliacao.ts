import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseFinanceiroCR } from "@/lib/parsers/conciliacao/financeiro";
import { parseBalanceteContabil } from "@/lib/parsers/conciliacao/contabil";
import {
  conciliar,
  type TituloFinanceiroInput,
  type LadoDivergencia,
} from "@/lib/domain/conciliacao";

export interface CriarConciliacaoInput {
  tenantId: string;
  userId: string;
  /** Conta contábil ex: "1121010001" (ou "1.1.2.10.1" — preserva o que veio do arquivo) */
  contaContabil: string;
  /** Data de fechamento da conciliação — ex: 2026-03-31 */
  dataReferencia: Date;
  financeiroBuffer: Buffer;
  financeiroFileName: string;
  contabilBuffer: Buffer;
  contabilFileName: string;
  observacoes?: string | null;
}

export type LadoPrisma =
  | "SO_FINANCEIRO"
  | "SO_CONTABIL"
  | "DIVERGENTE"
  | "NF_ANTERIOR";

function ladoToPrisma(l: LadoDivergencia): LadoPrisma {
  return l;
}

/**
 * Pipeline completo:
 *  1. Parseia os 2 arquivos (financeiro + contábil)
 *  2. Roda conciliar()
 *  3. Persiste Conciliacao + ConciliacaoDivergencia[] em uma transação
 *  4. Retorna o id da Conciliacao criada (caller redireciona pra /conciliacao/[id])
 */
export async function criarConciliacao(input: CriarConciliacaoInput): Promise<{
  id: string;
  qtdDivergencias: number;
  bateuTotalizador: boolean;
}> {
  const fin = await parseFinanceiroCR(input.financeiroBuffer);
  if (fin.warnings.length > 0) {
    throw new Error(`Erro no parser do Financeiro: ${fin.warnings.join("; ")}`);
  }
  if (fin.rows.length === 0) {
    throw new Error("Relatório Financeiro não contém títulos.");
  }

  const cont = await parseBalanceteContabil(input.contabilBuffer);
  if (cont.warnings.length > 0) {
    throw new Error(`Erro no parser do Contábil: ${cont.warnings.join("; ")}`);
  }
  if (cont.rows.length === 0) {
    throw new Error("Balancete Contábil não contém lançamentos.");
  }

  const titulos: TituloFinanceiroInput[] = fin.rows.map((t) => ({
    numeroNF: t.numeroNF,
    parcela: t.parcela,
    codigoCliente: t.codigoCliente,
    nomeCliente: t.nomeCliente,
    saldoTotal: t.saldoTotal,
  }));

  const resultado = conciliar(
    titulos,
    cont.saldosPorNF,
    fin.totalSaldo,
    cont.saldoFinalCalculado,
  );

  const status =
    resultado.bateuTotalizador && resultado.divergencias.length === 0
      ? "OK"
      : "DIVERGENTE";

  // Usa descricaoConta vinda do contábil se houver; fallback pra null.
  const descricaoConta = cont.descricaoConta ?? null;

  // Prisma 6 espera Bytes como Uint8Array<ArrayBuffer> (estrito), enquanto
  // Node Buffer é Buffer<ArrayBufferLike> — incompatível pelo TS mesmo sendo
  // a mesma coisa em runtime. new Uint8Array(buf) copia pra fresh ArrayBuffer
  // resolvendo o tipo. ~30KB de cópia, irrelevante.
  const financeiroBytes = new Uint8Array(input.financeiroBuffer);
  const contabilBytes = new Uint8Array(input.contabilBuffer);

  // Persiste em transação — se algo falhar, nada fica meio-criado.
  const conciliacao = await prisma.$transaction(async (tx) => {
    const c = await tx.conciliacao.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        contaContabil: input.contaContabil,
        descricaoConta,
        dataReferencia: input.dataReferencia,
        financeiroFileName: input.financeiroFileName,
        financeiroBlob: financeiroBytes,
        contabilFileName: input.contabilFileName,
        contabilBlob: contabilBytes,
        totalFinanceiro: new Prisma.Decimal(resultado.totalFinanceiro),
        totalContabil: new Prisma.Decimal(resultado.totalContabil),
        diferencaTotal: new Prisma.Decimal(resultado.diferencaTotal),
        qtdDivergencias: resultado.divergencias.length,
        observacoes: input.observacoes ?? null,
        status,
      },
    });

    if (resultado.divergencias.length > 0) {
      await tx.conciliacaoDivergencia.createMany({
        data: resultado.divergencias.map((d) => ({
          conciliacaoId: c.id,
          numeroNF: d.numeroNF,
          parcelas: d.parcelas,
          codigoCliente: d.codigoCliente,
          nomeCliente: d.nomeCliente,
          lado: ladoToPrisma(d.lado),
          saldoFinanceiro: d.saldoFinanceiro == null ? null : new Prisma.Decimal(d.saldoFinanceiro),
          saldoContabil: d.saldoContabil == null ? null : new Prisma.Decimal(d.saldoContabil),
          diferenca: d.diferenca == null ? null : new Prisma.Decimal(d.diferenca),
        })),
      });
    }

    return c;
  });

  return {
    id: conciliacao.id,
    qtdDivergencias: resultado.divergencias.length,
    bateuTotalizador: resultado.bateuTotalizador,
  };
}

/**
 * Carrega uma conciliação completa pra exibir na tela de detalhe.
 * Multi-tenant: filtra por tenantId obrigatoriamente.
 */
export async function getConciliacaoById(id: string, tenantId: string) {
  return prisma.conciliacao.findFirst({
    where: { id, tenantId },
    include: {
      divergencias: {
        orderBy: [{ lado: "asc" }, { diferenca: "desc" }],
      },
      user: { select: { name: true, email: true } },
    },
  });
}

export async function listarConciliacoesPorTenant(tenantId: string, limit = 50) {
  return prisma.conciliacao.findMany({
    where: { tenantId },
    orderBy: [{ dataReferencia: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      contaContabil: true,
      descricaoConta: true,
      dataReferencia: true,
      totalFinanceiro: true,
      totalContabil: true,
      diferencaTotal: true,
      qtdDivergencias: true,
      status: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    take: limit,
  });
}

export async function excluirConciliacao(id: string, tenantId: string) {
  // Garantia multi-tenant: confirma que pertence ao tenant antes de deletar.
  const found = await prisma.conciliacao.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!found) return false;
  await prisma.conciliacao.delete({ where: { id } });
  return true;
}
