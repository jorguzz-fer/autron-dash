import { describe, it, expect } from "vitest";
import { allocateStock } from "./allocation";
import { EstoqueInput, PedidoInput } from "./types";

function mkPedido(p: Partial<PedidoInput> & { id: string; produto: string; quantidade: number }): PedidoInput {
  return {
    numPedido: p.id,
    item: 1,
    descricaoProduto: null,
    vlrTotal: null,
    margemPct: null,
    dtEmissao: null,
    dtEntrega: null,
    dtOfertada: null,
    dtFatCli: null,
    notaFiscal: null,
    numeroSC: null,
    itemSC: null,
    numeroOP: null,
    itemOP: null,
    pedCliente: null,
    nomeVendedor: null,
    unidadeNegocio: null,
    contrato: false,
    cliente: null,
    ...p,
  };
}

describe("allocateStock", () => {
  it("FIFO por dtEmissao: pedido mais antigo ganha o estoque", () => {
    const pedidos = [
      mkPedido({ id: "p2", produto: "X", quantidade: 5, dtEmissao: new Date("2026-04-15") }),
      mkPedido({ id: "p1", produto: "X", quantidade: 5, dtEmissao: new Date("2026-04-01") }),
    ];
    const estoques: EstoqueInput[] = [{ codigo: "X", saldoEstoque: 5 }];
    const r = allocateStock(pedidos, estoques);

    expect(r.get("p1")?.disponibilidadeEstoque).toBe("SIM");
    expect(r.get("p1")?.qtdAlocada).toBe(5);
    expect(r.get("p2")?.disponibilidadeEstoque).toBe("NAO");
    expect(r.get("p2")?.qtdAlocada).toBe(0);
  });

  it("PARCIAL quando saldo é positivo mas insuficiente", () => {
    const pedidos = [mkPedido({ id: "p1", produto: "X", quantidade: 10 })];
    const estoques: EstoqueInput[] = [{ codigo: "X", saldoEstoque: 4 }];
    const r = allocateStock(pedidos, estoques);
    expect(r.get("p1")?.disponibilidadeEstoque).toBe("PARCIAL");
    expect(r.get("p1")?.qtdAlocada).toBe(4);
    // estoqueDisponivel = saldo BRUTO do produto (paridade com Streamlit:
    // mesmo valor replicado em todas as linhas do mesmo produto, não o residual).
    expect(r.get("p1")?.estoqueDisponivel).toBe(4);
  });

  it("estoqueDisponivel mantém valor BRUTO mesmo após alocação de pedidos anteriores", () => {
    // Garante que pedidos do mesmo produto vejam o mesmo saldo bruto,
    // independente da posição na fila FIFO.
    const pedidos = [
      mkPedido({ id: "p1", produto: "X", quantidade: 5, dtEmissao: new Date("2026-04-01") }),
      mkPedido({ id: "p2", produto: "X", quantidade: 5, dtEmissao: new Date("2026-04-15") }),
    ];
    const estoques: EstoqueInput[] = [{ codigo: "X", saldoEstoque: 10 }];
    const r = allocateStock(pedidos, estoques);
    expect(r.get("p1")?.estoqueDisponivel).toBe(10);
    expect(r.get("p2")?.estoqueDisponivel).toBe(10);
  });

  it("Servico não consome estoque, mesmo com saldo disponível", () => {
    const pedidos = [
      mkPedido({
        id: "p1",
        produto: "S",
        quantidade: 1,
        descricaoProduto: "Serviço de manutenção",
      }),
      mkPedido({ id: "p2", produto: "S", quantidade: 1 }),
    ];
    const estoques: EstoqueInput[] = [{ codigo: "S", saldoEstoque: 1 }];
    const r = allocateStock(pedidos, estoques);
    expect(r.get("p1")?.disponibilidadeEstoque).toBe("Servico");
    expect(r.get("p2")?.disponibilidadeEstoque).toBe("SIM"); // ainda tem estoque pra ele
  });

  it("FINALIZADO marca como N/A e não entra na alocação", () => {
    const pedidos = [
      mkPedido({ id: "fin", produto: "X", quantidade: 100, notaFiscal: 999 }),
      mkPedido({ id: "open", produto: "X", quantidade: 5 }),
    ];
    const estoques: EstoqueInput[] = [{ codigo: "X", saldoEstoque: 10 }];
    const r = allocateStock(pedidos, estoques);
    expect(r.get("fin")?.disponibilidadeEstoque).toBe("N/A");
    expect(r.get("open")?.disponibilidadeEstoque).toBe("SIM");
    expect(r.get("open")?.qtdAlocada).toBe(5);
  });

  it("estoque inexistente: NAO", () => {
    const pedidos = [mkPedido({ id: "p1", produto: "Z", quantidade: 1 })];
    const r = allocateStock(pedidos, []);
    expect(r.get("p1")?.disponibilidadeEstoque).toBe("NAO");
  });
});
