import { acaoNecessaria } from "./action";
import { allocateStock } from "./allocation";
import { diasAtrasoCliente, diasAtrasoOfertada } from "./delays";
import { buildFollowUpIndex, consolidateFollowUp } from "./followup";
import { prontoParaFazer } from "./readiness";
import { ehServico, statusPedido } from "./status";
import {
  ClassificacaoInput,
  EstoqueInput,
  FollowUpInput,
  PedidoEnriched,
  PedidoInput,
  TipoProduto,
} from "./types";

interface EnrichArgs {
  pedidos: PedidoInput[];
  followUps: FollowUpInput[];
  estoques: EstoqueInput[];
  classificacoes: ClassificacaoInput[];
  /** Data de "hoje" usada para calcular dias de atraso. Default: new Date(). */
  today?: Date;
}

/**
 * Verdadeiro se o valor é uma string não-vazia e diferente do literal "nan"
 * (defensivo contra exports de pandas/Excel que viram "nan" em string).
 * Espelha `notna() & strip().ne('') & strip().ne('nan')` do Streamlit antigo
 * (app.py:430-433).
 */
function isNonEmpty(v: string | null | undefined): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && s.toLowerCase() !== "nan";
}

/**
 * Filtra PVs internos (começam com "I") e de bonificação (começam com "B").
 * Espelha `app.py:316`: `ep = ep[~ep['Num. Pedido'].str.upper().str.match(r'^[IB]')]`.
 * São pedidos que o Streamlit antigo descarta completamente antes de qualquer
 * cálculo — não entram em KPIs, charts nem tabelas.
 */
function isPVValido(numPedido: string): boolean {
  return !/^[IB]/i.test(numPedido);
}

/**
 * Pipeline completo de enriquecimento — porta direta da lógica do app Streamlit.
 *
 * Funções puras: não acessa banco. O caller (service) é quem faz fetch e converte
 * Prisma.Decimal → number antes de chamar.
 */
export function enrichPedidos(args: EnrichArgs): PedidoEnriched[] {
  const today = args.today ?? new Date();

  // Filtro PVs internos/bonificação (^[IB]) antes de qualquer processamento.
  // Os pedidos descartados nem entram na alocação FIFO de estoque.
  const pedidosValidos = args.pedidos.filter((p) => isPVValido(p.numPedido));

  const fuIdx = buildFollowUpIndex(args.followUps);

  const tipoPorProduto = new Map<string, TipoProduto>();
  for (const c of args.classificacoes) tipoPorProduto.set(c.produto, c.tipoProduto);

  const allocation = allocateStock(pedidosValidos, args.estoques);

  // Coleta todos os "PV informado na SC" (Obs da SC) não-nulos para detectar
  // SCs criadas manualmente — quando o comprador gera SC sem vincular ao PV
  // no Protheus mas anota o número do PV no campo de observação.
  const obsScList: string[] = [];
  for (const fu of args.followUps) {
    if (fu.pvInformadoSC) obsScList.push(fu.pvInformadoSC);
  }

  return pedidosValidos.map((p) => {
    const status = statusPedido(p);
    const servico = ehServico(p.descricaoProduto);
    const tipoProduto: TipoProduto = tipoPorProduto.get(p.produto) ?? "Indefinido";

    const fu = consolidateFollowUp(p, fuIdx);
    const alloc = allocation.get(p.id) ?? {
      estoqueDisponivel: 0,
      qtdAlocada: 0,
      disponibilidadeEstoque: status === "FINALIZADO" ? "N/A" : "NAO",
    };

    // Sanitização: strings vazias ou literal "nan" não contam como SC/OP preenchidos.
    // Espelha app.py:430-433 (que faz notna() & strip != '' & strip != 'nan').
    const temSC = isNonEmpty(p.numeroSC);
    const temOP = isNonEmpty(p.numeroOP) || isNonEmpty(fu.fuOpNaSC);

    // Só vale verificar "SC Manual" quando seria "Necessario gerar SC":
    // Comprando, sem SC vinculada, sem OP, sem estoque suficiente.
    const temSCManual =
      !temSC &&
      !temOP &&
      tipoProduto === "Comprando" &&
      alloc.disponibilidadeEstoque !== "SIM" &&
      obsScList.some((obs) => obs.includes(p.numPedido));

    const pronto = prontoParaFazer({
      status,
      disponibilidade: alloc.disponibilidadeEstoque,
      fuDtConfirma: fu.fuDtConfirma,
    });
    const acao = acaoNecessaria({
      status,
      ehServico: servico,
      disponibilidade: alloc.disponibilidadeEstoque,
      tipoProduto,
      temSC,
      temOP,
      temSCManual,
    });

    return {
      ...p,
      tipoProduto,
      ehServico: servico,
      statusPedido: status,

      fuDtConfirma: fu.fuDtConfirma,
      fuDtPreEntr: fu.fuDtPreEntr,
      fuDtChegadaAutron: fu.fuDtChegadaAutron,
      fuPasta: fu.fuPasta,
      fuOpNaSC: fu.fuOpNaSC,
      prazoRealEntrega: fu.prazoRealEntrega,
      semanaEntrega: fu.semanaEntrega,

      estoqueDisponivel: alloc.estoqueDisponivel,
      qtdAlocada: alloc.qtdAlocada,
      disponibilidadeEstoque: alloc.disponibilidadeEstoque,

      diasAtrasoCliente: diasAtrasoCliente(p, status, today),
      diasAtrasoOfertada: diasAtrasoOfertada(p, status, today),

      temSC,
      temOP,

      prontoParaFazer: pronto,
      acaoNecessaria: acao,
    };
  });
}
