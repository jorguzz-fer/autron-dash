// src/lib/domain/comissao/representante.ts
//
// Regras de comissão de REPRESENTANTES (Anexo II do contrato — recebido em
// ago/2026, desenhado por Leandro/Márcio). Difere totalmente do regime dos
// funcionários: NÃO há meta nem gatilho — vendeu e o cliente pagou, comissiona.
//
// 1) % por tipo de venda (o Anexo chama de "Tipo de Negócio"; nos exports do
//    Sankhya o código vem na coluna Tipo_Venda — RE, NO, …):
//       NO (Nova Oportunidade) 8% | ME (Melhoria) 8% | SU (Substituição) 8%
//       RE (Reposição) 5%         | SE (Serviços) 5%
// 2) Fator multiplicador pelo desconto concedido na oportunidade:
//       ≤10% ×1,00 | 10,01–15% ×0,95 | 15,01–20% ×0,90 | 20,01–25% ×0,85
//       25,01–30% ×0,80 | >30% ×0,70
//    Comissão = valor × %tipo × fator.
// 3) Sistemas MEC911 (supressão de particulados): valor FIXO por faixa do
//    valor do pedido (não é percentual).
// 4) Importação Direta (ID): prêmio de 2% sobre a COMISSÃO recebida pela
//    Autron da representada (não sobre o valor da venda), pago após a Autron
//    receber; para MEC911 via ID valem as mesmas faixas da tabela fixa,
//    calculadas sobre a comissão recebida convertida em BRL.

/** Códigos de tipo de venda do Anexo II (coluna Tipo_Venda no Sankhya). */
export type TipoVendaRepresentante = "NO" | "ME" | "SU" | "RE" | "SE";

/** % de comissão por tipo de venda (fração: 0.08 = 8%). */
export const PCT_TIPO_VENDA: Record<TipoVendaRepresentante, number> = {
  NO: 0.08, // Nova Oportunidade
  ME: 0.08, // Melhoria
  SU: 0.08, // Substituição
  RE: 0.05, // Reposição
  SE: 0.05, // Serviços
};

/**
 * Fator multiplicador da comissão pelo desconto concedido (desconto em
 * PERCENTUAL: 12.5 = 12,5%). Faixas do Anexo II; até 10% não penaliza.
 */
export function fatorDesconto(descontoPct: number): number {
  if (descontoPct <= 10) return 1;
  if (descontoPct <= 15) return 0.95;
  if (descontoPct <= 20) return 0.9;
  if (descontoPct <= 25) return 0.85;
  if (descontoPct <= 30) return 0.8;
  return 0.7;
}

export interface VendaRepresentante {
  /** Valor da venda (base da comissão). */
  valor: number;
  tipoVenda: TipoVendaRepresentante;
  /** Desconto concedido na oportunidade, em percentual (12.5 = 12,5%). */
  descontoPct?: number;
}

/** Comissão de uma venda comum de representante: valor × %tipo × fator. */
export function comissaoRepresentanteVenda(v: VendaRepresentante): number {
  return v.valor * PCT_TIPO_VENDA[v.tipoVenda] * fatorDesconto(v.descontoPct ?? 0);
}

/**
 * Comissão FIXA de sistemas MEC911 por faixa do valor do pedido.
 * Para venda via ID, aplicar as mesmas faixas sobre a comissão recebida da
 * representada convertida em BRL (passar esse valor como `valorPedido`).
 */
export function comissaoMec911(valorPedido: number): number {
  if (valorPedido <= 300_000) return 6_000;
  if (valorPedido <= 400_000) return 7_600;
  if (valorPedido <= 500_000) return 9_000;
  if (valorPedido <= 600_000) return 10_200;
  if (valorPedido <= 700_000) return 11_200;
  return 12_000;
}

/**
 * Prêmio de Importação Direta: 2% sobre a comissão RECEBIDA pela Autron da
 * representada (não sobre o valor da venda). Devido só após o recebimento.
 */
export function comissaoImportacaoDireta(comissaoRecebidaAutron: number): number {
  return comissaoRecebidaAutron * 0.02;
}
