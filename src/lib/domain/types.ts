// ─── Inputs (formato "doméstico" — Decimals já convertidos para number) ────

export interface PedidoInput {
  id: string;
  numPedido: string;
  item: number;
  produto: string;
  descricaoProduto: string | null;
  quantidade: number;
  vlrTotal: number | null;
  margemPct: number | null;
  dtEmissao: Date | null;
  dtOfertada: Date | null;
  dtFatCli: Date | null;
  notaFiscal: number | null;
  numeroSC: string | null;
  itemSC: number | null;
  numeroOP: string | null;
  itemOP: number | null;
  pedCliente: string | null;
  nomeVendedor: string | null;
  unidadeNegocio: string | null;
  contrato: boolean;
  cliente: string | null;
}

export interface FollowUpInput {
  noSC: string;
  numeroPV: string | null;
  codigoItem: string | null;
  pasta: string | null;
  dtConfirma: Date | null;
  dtPreEntr: Date | null;
  dtChegadaAutron: Date | null;
  noPO: string | null;
  opNaSC: string | null;
  pvInformadoSC: string | null;
}

export interface EstoqueInput {
  codigo: string;
  saldoEstoque: number;
}

export type TipoProduto = "Comprando" | "Produzindo" | "Indefinido";

export interface ClassificacaoInput {
  produto: string;
  tipoProduto: TipoProduto;
}

// ─── Outputs ────────────────────────────────────────────────────────────────

export type StatusPedido = "EM ABERTO" | "FINALIZADO";

export type DisponibilidadeEstoque = "SIM" | "NAO" | "PARCIAL" | "Servico" | "N/A";

export type ProntoParaFazer =
  | "SIM"
  | "NAO"
  | "PARCIAL - Sem Follow-up"
  | "PARCIAL - Sem Estoque"
  | "FINALIZADO"
  | "Servico";

export type AcaoNecessaria =
  | "Finalizado"
  | "Estoque OK"
  | "Prazo a confirmar"
  | "Necessario gerar SC"
  | "SC Manual"
  | "Necessario gerar OP"
  | "SC gerada - Aguardando"
  | "OP gerada - Aguardando"
  | "ERRO no CADASTRO"
  | "Verificar classificacao";

/** Marker especial para entregas que dependem de definição manual (regra IND21+Posto/Cabine). */
export const PRAZO_A_DEFINIR = "A definir" as const;

export interface FollowUpConsolidated {
  fuDtConfirma: Date | null;
  fuDtPreEntr: Date | null;
  fuDtChegadaAutron: Date | null;
  fuPasta: string | null;
  fuOpNaSC: string | null;
  prazoRealEntrega: Date | typeof PRAZO_A_DEFINIR | null;
  semanaEntrega: string | null;
}

export interface AllocationResult {
  estoqueDisponivel: number;
  qtdAlocada: number;
  disponibilidadeEstoque: DisponibilidadeEstoque;
}

export interface PedidoEnriched extends PedidoInput {
  // contexto
  tipoProduto: TipoProduto;
  ehServico: boolean;
  statusPedido: StatusPedido;

  // follow-up
  fuDtConfirma: Date | null;
  fuDtPreEntr: Date | null;
  fuDtChegadaAutron: Date | null;
  fuPasta: string | null;
  fuOpNaSC: string | null;
  prazoRealEntrega: Date | typeof PRAZO_A_DEFINIR | null;
  semanaEntrega: string | null;

  // estoque
  estoqueDisponivel: number;
  qtdAlocada: number;
  disponibilidadeEstoque: DisponibilidadeEstoque;

  // atraso (positivo = atrasado, negativo = no prazo, null = sem data)
  diasAtrasoCliente: number | null;
  diasAtrasoOfertada: number | null;

  // resultado
  temSC: boolean;
  temOP: boolean;
  prontoParaFazer: ProntoParaFazer;
  acaoNecessaria: AcaoNecessaria;
}
