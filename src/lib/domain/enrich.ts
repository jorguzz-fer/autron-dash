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
 * Pipeline completo de enriquecimento — porta direta da lógica do app Streamlit.
 *
 * Funções puras: não acessa banco. O caller (service) é quem faz fetch e converte
 * Prisma.Decimal → number antes de chamar.
 */
export function enrichPedidos(args: EnrichArgs): PedidoEnriched[] {
  const today = args.today ?? new Date();

  const fuIdx = buildFollowUpIndex(args.followUps);

  const tipoPorProduto = new Map<string, TipoProduto>();
  for (const c of args.classificacoes) tipoPorProduto.set(c.produto, c.tipoProduto);

  const allocation = allocateStock(args.pedidos, args.estoques);

  return args.pedidos.map((p) => {
    const status = statusPedido(p);
    const servico = ehServico(p.descricaoProduto);
    const tipoProduto: TipoProduto = tipoPorProduto.get(p.produto) ?? "Indefinido";

    const fu = consolidateFollowUp(p, fuIdx);
    const alloc = allocation.get(p.id) ?? {
      estoqueDisponivel: 0,
      qtdAlocada: 0,
      disponibilidadeEstoque: status === "FINALIZADO" ? "N/A" : "NAO",
    };

    const temSC = p.numeroSC != null;
    const temOP = p.numeroOP != null || fu.fuOpNaSC != null;

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
    });

    return {
      ...p,
      tipoProduto,
      ehServico: servico,
      statusPedido: status,

      fuDtConfirma: fu.fuDtConfirma,
      fuDtPreEntr: fu.fuDtPreEntr,
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
