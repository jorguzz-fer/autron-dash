import { AllocationResult, EstoqueInput, PedidoInput, StatusPedido } from "./types";
import { ehServico, statusPedido } from "./status";

/**
 * Aloca estoque para uma lista de pedidos seguindo a ordem FIFO de prioridade
 * (igual ao Streamlit original):
 *
 *   1. Apenas pedidos EM ABERTO entram na fila (pedidos finalizados são N/A).
 *   2. Pedidos de "Serviço" (descrição contém "serviço") são marcados como 'Servico'
 *      e não consomem estoque.
 *   3. Para os demais, ordenamos por (produto, dtEmissao, numPedido, item)
 *      e atribuímos estoque na ordem.
 *   4. Para cada pedido:
 *      - se quantidade <= saldo → SIM, qtdAlocada = quantidade
 *      - se 0 < saldo < quantidade → PARCIAL, qtdAlocada = saldo
 *      - se saldo == 0 → NAO, qtdAlocada = 0
 *      - subtrai do saldo do produto
 *
 * Retorna um Map<pedidoId, AllocationResult>. O caller decide como mesclar
 * com o pedido completo.
 */
export function allocateStock(
  pedidos: PedidoInput[],
  estoques: EstoqueInput[],
): Map<string, AllocationResult> {
  const saldoPorProduto = new Map<string, number>();
  for (const e of estoques) {
    saldoPorProduto.set(e.codigo, (saldoPorProduto.get(e.codigo) ?? 0) + e.saldoEstoque);
  }

  const result = new Map<string, AllocationResult>();

  // Pedidos finalizados: N/A (não entram na alocação)
  // Serviços: 'Servico' (não consomem estoque)
  // Demais EM ABERTO: vão pra fila ordenada
  const queue: PedidoInput[] = [];
  for (const p of pedidos) {
    const status: StatusPedido = statusPedido(p);
    const estoqueDisponivelTotal = saldoPorProduto.get(p.produto) ?? 0;

    if (status === "FINALIZADO") {
      result.set(p.id, {
        estoqueDisponivel: estoqueDisponivelTotal,
        qtdAlocada: 0,
        disponibilidadeEstoque: "N/A",
      });
      continue;
    }
    if (ehServico(p.descricaoProduto)) {
      result.set(p.id, {
        estoqueDisponivel: estoqueDisponivelTotal,
        qtdAlocada: 0,
        disponibilidadeEstoque: "Servico",
      });
      continue;
    }
    queue.push(p);
  }

  // FIFO: produto, dtEmissao asc (NULLs LAST), numPedido asc, item asc
  queue.sort((a, b) => {
    if (a.produto !== b.produto) return a.produto < b.produto ? -1 : 1;
    const aDt = a.dtEmissao?.getTime();
    const bDt = b.dtEmissao?.getTime();
    if (aDt == null && bDt == null) {
      // sem data: cai pro próximo critério
    } else if (aDt == null) {
      return 1;
    } else if (bDt == null) {
      return -1;
    } else if (aDt !== bDt) {
      return aDt - bDt;
    }
    if (a.numPedido !== b.numPedido) return a.numPedido < b.numPedido ? -1 : 1;
    return a.item - b.item;
  });

  for (const p of queue) {
    const saldo = saldoPorProduto.get(p.produto) ?? 0;
    let qtdAlocada = 0;
    let disp: AllocationResult["disponibilidadeEstoque"];

    if (saldo <= 0) {
      qtdAlocada = 0;
      disp = "NAO";
    } else if (saldo >= p.quantidade) {
      qtdAlocada = p.quantidade;
      disp = "SIM";
    } else {
      qtdAlocada = saldo;
      disp = "PARCIAL";
    }

    saldoPorProduto.set(p.produto, saldo - qtdAlocada);

    result.set(p.id, {
      estoqueDisponivel: saldoPorProduto.get(p.produto) ?? 0,
      qtdAlocada,
      disponibilidadeEstoque: disp,
    });
  }

  return result;
}
