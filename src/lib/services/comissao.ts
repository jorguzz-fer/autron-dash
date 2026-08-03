// src/lib/services/comissao.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apurarAno } from "@/lib/domain/comissao/apuracao";
import { previsaoMensal } from "@/lib/domain/comissao/comissao";
import { gridPedidosPagos, gridProgramados } from "@/lib/domain/comissao/pagamento";
import { aplicaGarantido } from "@/lib/domain/comissao/garantido";
import type {
  LancamentoInput,
  MetaInput,
  RegraVendedor,
  ApuracaoAno,
  GarantidoConfig,
} from "@/lib/domain/comissao/types";

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

/**
 * Códigos de vendedor que têm dados carregados (metas e/ou analítico) mas que
 * ainda NÃO foram cadastrados em ComissaoVendedor. São os vendedores que o
 * upload trouxe mas que não aparecem na apuração por falta de cadastro
 * (cargo/%/gatilho). Usado para guiar o usuário na Visão Geral.
 */
export async function getCodigosSemCadastro(tenantId: string): Promise<string[]> {
  const [vend, metas, lancs] = await Promise.all([
    prisma.comissaoVendedor.findMany({ where: { tenantId }, select: { codigoProtheus: true } }),
    prisma.comissaoMeta.findMany({ where: { tenantId }, select: { codVendedor: true }, distinct: ["codVendedor"] }),
    prisma.comissaoLancamento.findMany({ where: { tenantId }, select: { codVendedor: true }, distinct: ["codVendedor"] }),
  ]);
  const cadastrados = new Set(vend.map((v) => v.codigoProtheus));
  const comDados = new Set<string>([...metas.map((m) => m.codVendedor), ...lancs.map((l) => l.codVendedor)]);
  return [...comDados].filter((c) => c && !cadastrados.has(c)).sort();
}

/** Subordinados diretos de um gestor (vendedores cujo supervisorCodigo == cod). */
export async function getSubordinados(
  tenantId: string,
  codVendedor: string,
): Promise<string[]> {
  const subs = await prisma.comissaoVendedor.findMany({
    where: { tenantId, supervisorCodigo: codVendedor },
    select: { codigoProtheus: true },
  });
  return subs.map((s) => s.codigoProtheus);
}

/** Membros da carteira = o próprio vendedor + subordinados diretos (1 nível). */
export async function getCarteiraMembros(
  tenantId: string,
  codVendedor: string,
): Promise<string[]> {
  const subs = await getSubordinados(tenantId, codVendedor);
  return [codVendedor, ...subs];
}

/** Garantido configurado para o vendedor, ou null. */
function garantidoDoVendedor(vend: {
  garantidoValor: Prisma.Decimal | null;
  garantidoInicio: Date | null;
  garantidoMeses: number | null;
}): GarantidoConfig | null {
  if (vend.garantidoValor == null || vend.garantidoInicio == null || !vend.garantidoMeses) {
    return null;
  }
  return {
    valor: num(vend.garantidoValor),
    inicioAno: vend.garantidoInicio.getFullYear(),
    inicioMes: vend.garantidoInicio.getMonth() + 1,
    meses: vend.garantidoMeses,
  };
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
  const comissaoCargo = cargo ? num(cargo.comissaoPct) : 0;
  // % individual do vendedor sobrepõe o % do cargo (fallback). Um % informado
  // na linha do analítico ainda tem prioridade sobre ambos (ver previsaoMensal).
  const comissaoPct = vend.comissaoOverride != null ? num(vend.comissaoOverride) : comissaoCargo;
  const gatilhoCargo = cargo ? num(cargo.gatilhoPct) : 0;
  const gatilhoPct = vend.gatilhoOverride != null ? num(vend.gatilhoOverride) : gatilhoCargo;
  return { comissaoPct, gatilhoPct };
}

async function getLancamentos(
  tenantId: string,
  codVendedores: string[],
  ano: number,
): Promise<LancamentoInput[]> {
  const rows = await prisma.comissaoLancamento.findMany({
    where: { tenantId, codVendedor: { in: codVendedores } },
  });
  return rows
    .filter((r) => r.dataEmissao.getFullYear() === ano)
    .map((r) => ({
      numeroPedido: r.numeroPedido,
      itemPedido: r.itemPedido,
      dataEmissao: r.dataEmissao,
      valor: num(r.valor),
      codVendedor: r.codVendedor,
      dataVencimento: r.dataVencimento,
      dataPagamento: r.dataPagamento,
      parcela: r.parcela,
      pctRateio: num(r.pctRateio),
      classificacao: r.classificacao as LancamentoInput["classificacao"],
      comissaoPct: r.comissaoPct != null ? num(r.comissaoPct) : undefined,
    }));
}

async function getMetas(
  tenantId: string,
  codVendedores: string[],
  ano: number,
): Promise<MetaInput[]> {
  const rows = await prisma.comissaoMeta.findMany({
    where: { tenantId, codVendedor: { in: codVendedores }, ano },
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
  /** Pedidos efetivamente PAGOS (cliente pagou), por janela 21→20. */
  pedidosPagos: Map<string, number[]>;
  /** Pedidos FATURADOS aguardando pagamento do cliente (N2 — "programado p/ pagar"). */
  programados: Map<string, number[]>;
  regra: RegraVendedor;
  /** Carteira apurada (≥2 quando o vendedor é gestor). */
  membros: string[];
  /** "A receber" = max(previsão, garantido) na janela do garantido. */
  aReceber: number[];
  /** Config de garantido aplicada, ou null. */
  garantido: GarantidoConfig | null;
}

/**
 * Compõe o extrato completo de um vendedor/ano.
 * Carteira uniforme: todo vendedor é apurado como carteira = {ele} ∪ {subordinados}.
 * Para um individual a carteira tem 1 membro e o resultado é idêntico ao MVP.
 * A regra (% e gatilho) é sempre a do próprio vendedor (gestor); a base agregada
 * é a soma das vendas/metas dos membros.
 */
export async function getExtratoVendedor(
  tenantId: string,
  codVendedor: string,
  ano: number,
): Promise<ExtratoVendedor | null> {
  const vend = await prisma.comissaoVendedor.findFirst({
    where: { tenantId, codigoProtheus: codVendedor },
  });
  if (!vend) return null;
  const regra = await getRegraVendedor(tenantId, codVendedor, ano);
  if (!regra) return null;

  const membros = await getCarteiraMembros(tenantId, codVendedor);
  const [lancs, metas] = await Promise.all([
    getLancamentos(tenantId, membros, ano),
    getMetas(tenantId, membros, ano),
  ]);

  const apuracao = apurarAno(lancs, metas, regra, ano);
  const habilita = apuracao.map((m) => m.habilita);
  const prev = previsaoMensal(lancs, regra.comissaoPct, habilita, ano);
  apuracao.forEach((m, i) => (m.previsao = prev[i]));

  const garantido = garantidoDoVendedor(vend);
  const aReceber = aplicaGarantido(prev, ano, garantido);

  const pedidosPagos = gridPedidosPagos(lancs, regra.comissaoPct, habilita);
  const programados = gridProgramados(lancs, regra.comissaoPct, habilita);

  return { apuracao, pedidosPagos, programados, regra, membros, aReceber, garantido };
}
