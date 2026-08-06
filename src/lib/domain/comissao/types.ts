// src/lib/domain/comissao/types.ts

export type Classificacao = "PREVISTO" | "FATURADO" | "PAGO";

/** Linha do Analítico (já convertida de Decimal para number). */
export interface LancamentoInput {
  numeroPedido: string;
  itemPedido: string | null;
  dataEmissao: Date;
  valor: number;
  codVendedor: string;
  dataVencimento?: Date | null;
  dataPagamento: Date | null;
  parcela: number | null;
  pctRateio: number; // 100, 33.33...
  classificacao: Classificacao;
  /** Percentual de comissão que veio POR LINHA na planilha do Protheus
   *  (ex.: 0.01, 0.005, 0.013). É apenas informativo/histórico.
   *  ⚠️ NÃO é usado no cálculo desde ago/2026: a empresa paga pelo % do
   *  cargo/cadastro do vendedor (RegraVendedor.comissaoPct), não pelo % do
   *  Protheus. Ver previsaoMensal e gridPedidosPagos. */
  comissaoPct?: number;
}

/** Configuração de comissão garantida de um vendedor recém-contratado. */
export interface GarantidoConfig {
  valor: number;     // piso mensal (ex.: 2000)
  inicioAno: number; // ano do 1º mês garantido
  inicioMes: number; // 1-12
  meses: number;     // duração (3-4 normalmente)
}

export interface MetaInput {
  codVendedor: string;
  ano: number;
  mes: number; // 1-12
  valorMeta: number;
}

/** Parâmetros de comissão/gatilho efetivos para um vendedor. */
export interface RegraVendedor {
  comissaoPct: number; // 0.015
  gatilhoPct: number;  // 0.70; 0 = sem gatilho
}

export interface MesApuracao {
  mes: number;          // 1-12
  meta: number;
  gatilho: number;
  ep: number;
  saldo: number;
  saldoAcumulado: number;
  habilita: boolean;
  previsao: number;
}

export type ApuracaoAno = MesApuracao[]; // length 12, index 0 = janeiro
