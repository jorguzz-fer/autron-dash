// src/lib/services/comissao.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apurarAno } from "@/lib/domain/comissao/apuracao";
import { previsaoMensal } from "@/lib/domain/comissao/comissao";
import { gridPedidosPagos } from "@/lib/domain/comissao/pagamento";
import type { LancamentoInput, MetaInput, RegraVendedor, ApuracaoAno } from "@/lib/domain/comissao/types";

function num(d: Prisma.Decimal | null | undefined): number {
  return d == null ? 0 : Number(d);
}

export async function getVendedores(tenantId: string) {
  return prisma.comissaoVendedor.findMany({
    where: { tenantId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}

export async function getCargos(tenantId: string, ano?: number) {
  return prisma.comissaoCargo.findMany({
    where: { tenantId, ...(ano ? { ano } : {}) },
    orderBy: [{ ano: "desc" }, { cargo: "asc" }],
  });
}

/** Regra efetiva (comissão + gatilho) de um vendedor para o ano. */
export async function getRegraVendedor(
  tenantId: string,
  codVendedor: string,
  ano: number,
): Promise<RegraVendedor | null> {
  const vend = await prisma.comissaoVendedor.findFirst({
    where: { tenantId, codigoProtheus: codVendedor },
  });
  if (!vend) return null;
  const cargo = await prisma.comissaoCargo.findFirst({
    where: { tenantId, ano, cargo: vend.cargo },
  });
  const comissaoPct = cargo ? num(cargo.comissaoPct) : 0;
  const gatilhoCargo = cargo ? num(cargo.gatilhoPct) : 0;
  const gatilhoPct = vend.gatilhoOverride != null ? num(vend.gatilhoOverride) : gatilhoCargo;
  return { comissaoPct, gatilhoPct };
}

async function getLancamentos(
  tenantId: string,
  codVendedor: string,
  ano: number,
): Promise<LancamentoInput[]> {
  const rows = await prisma.comissaoLancamento.findMany({
    where: { tenantId, codVendedor },
  });
  return rows
    .filter((r) => r.dataEmissao.getFullYear() === ano)
    .map((r) => ({
      numeroPedido: r.numeroPedido,
      itemPedido: r.itemPedido,
      dataEmissao: r.dataEmissao,
      valor: num(r.valor),
      codVendedor: r.codVendedor,
      dataPagamento: r.dataPagamento,
      parcela: r.parcela,
      pctRateio: num(r.pctRateio),
      classificacao: r.classificacao as LancamentoInput["classificacao"],
    }));
}

async function getMetas(
  tenantId: string,
  codVendedor: string,
  ano: number,
): Promise<MetaInput[]> {
  const rows = await prisma.comissaoMeta.findMany({
    where: { tenantId, codVendedor, ano },
  });
  return rows.map((r) => ({
    codVendedor: r.codVendedor,
    ano: r.ano,
    mes: r.mes,
    valorMeta: num(r.valorMeta),
  }));
}

export interface ExtratoVendedor {
  apuracao: ApuracaoAno;
  pedidosPagos: Map<string, number[]>;
  regra: RegraVendedor;
}

/** Compõe o extrato completo de um vendedor/ano (apuração + previsão + pagos). */
export async function getExtratoVendedor(
  tenantId: string,
  codVendedor: string,
  ano: number,
): Promise<ExtratoVendedor | null> {
  const regra = await getRegraVendedor(tenantId, codVendedor, ano);
  if (!regra) return null;
  const [lancs, metas] = await Promise.all([
    getLancamentos(tenantId, codVendedor, ano),
    getMetas(tenantId, codVendedor, ano),
  ]);
  const apuracao = apurarAno(lancs, metas, regra, ano);
  const habilita = apuracao.map((m) => m.habilita);
  const prev = previsaoMensal(lancs, regra.comissaoPct, habilita, ano);
  apuracao.forEach((m, i) => (m.previsao = prev[i]));
  const pedidosPagos = gridPedidosPagos(lancs, regra.comissaoPct);
  return { apuracao, pedidosPagos, regra };
}
