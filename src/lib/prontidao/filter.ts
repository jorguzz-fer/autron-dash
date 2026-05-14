import type { PedidoEnriched } from "@/lib/domain";

export interface ProntidaoFilters {
  status?: string; // "finalizado" | undefined (default = em aberto)
  dispo?: string;
  tipo?: string;
  atend?: string; // "dentro" | "fora" | "sem"
  mesFat?: string; // "1".."12"
  pronto?: string; // "sim" | "fu" | "est" | "nao" | "erro"
  prazoEntr?: string; // "com" | "sem"
  q?: string; // busca textual (varre múltiplos campos)
}

/**
 * Bucket de atendimento do prazo do cliente — espelha a regra do Streamlit
 * antigo. Usado pelo filtro `atend` e pelas KPIs PV-prazo.
 */
export function classifAtend(p: PedidoEnriched): "dentro" | "fora" | "sem" {
  if (p.dtFatCli == null) return "sem";
  if (p.diasAtrasoCliente != null && p.diasAtrasoCliente > 0) return "fora";
  return "dentro";
}

/**
 * Mês (1-12) do prazo real de entrega — usado pelo filtro "Mês de Faturamento".
 * Quando prazoRealEntrega é "A definir" ou null, retorna null e o pedido fica
 * fora do filtro quando há mês selecionado.
 */
export function mesFatKey(p: PedidoEnriched): number | null {
  const prazo = p.prazoRealEntrega;
  if (prazo instanceof Date) return prazo.getMonth() + 1;
  if (p.dtFatCli) return p.dtFatCli.getMonth() + 1;
  return null;
}

/**
 * Detecta pedido cancelado: campo "Week Fup" (pasta) do follow-up contém "CAN".
 * Cancelados são excluídos de Em Aberto e Finalizado — têm categoria própria.
 */
export function isCancelado(p: PedidoEnriched): boolean {
  return (p.fuPasta ?? "").toUpperCase().includes("CAN");
}

/**
 * Aplica o filtro de status.
 *   undefined / omitido → Em Aberto  (statusPedido === "EM ABERTO" e não cancelado)
 *   "finalizado"        → Finalizado (statusPedido !== "EM ABERTO" e não cancelado)
 *   "cancelado"         → Cancelados (fuPasta contém "CAN", independente de statusPedido)
 *
 * É o primeiro passo do pipeline — KPIs e cards consomem o universo retornado aqui.
 */
export function filterByStatus(
  pedidos: PedidoEnriched[],
  status: string | undefined,
): PedidoEnriched[] {
  if (status === "cancelado") {
    return pedidos.filter(isCancelado);
  }
  if (status === "finalizado") {
    return pedidos.filter((p) => p.statusPedido !== "EM ABERTO" && !isCancelado(p));
  }
  // Default: em aberto (excluindo cancelados)
  return pedidos.filter((p) => p.statusPedido === "EM ABERTO" && !isCancelado(p));
}

/**
 * Aplica todos os filtros da aba Prontidão sobre o universo (após filterByStatus):
 * dropdowns (dispo/tipo/atend/mesFat), KPIs clicáveis (pronto/prazoEntr) e busca
 * textual (q). Função pura — usada tanto pela página quanto pelo endpoint de export.
 */
export function applyProntidaoFilters(
  pedidos: PedidoEnriched[],
  f: ProntidaoFilters,
): PedidoEnriched[] {
  const q = f.q?.trim().toLowerCase();
  return pedidos.filter((p) => {
    if (f.dispo && p.disponibilidadeEstoque !== f.dispo) return false;
    if (f.tipo && p.tipoProduto !== f.tipo) return false;
    if (f.atend && classifAtend(p) !== f.atend) return false;
    if (f.mesFat) {
      const m = mesFatKey(p);
      if (m == null || m !== Number(f.mesFat)) return false;
    }
    if (f.pronto) {
      switch (f.pronto) {
        case "sim":
          if (p.prontoParaFazer !== "SIM") return false;
          break;
        case "fu":
          if (p.prontoParaFazer !== "PARCIAL - Sem Follow-up") return false;
          break;
        case "est":
          if (p.prontoParaFazer !== "PARCIAL - Sem Estoque") return false;
          break;
        case "nao":
          if (p.prontoParaFazer !== "NAO") return false;
          break;
        case "erro":
          if (p.acaoNecessaria !== "ERRO no CADASTRO") return false;
          break;
      }
    }
    if (f.prazoEntr === "com" && !(p.prazoRealEntrega instanceof Date)) return false;
    if (f.prazoEntr === "sem" && p.prazoRealEntrega instanceof Date) return false;
    if (q) {
      // Concatena todos os campos textuais que aparecem na tabela e busca
      // substring case-insensitive. Match em qualquer um deles inclui a linha.
      const hay = [
        p.numPedido,
        String(p.item),
        p.cliente ?? "",
        p.clienteNome ?? "",
        p.produto,
        p.descricaoProduto ?? "",
        p.nomeVendedor ?? "",
        p.pedCliente ?? "",
        p.numeroSC ?? "",
        p.numeroOP ?? "",
        p.tipoProduto,
        p.disponibilidadeEstoque,
        p.acaoNecessaria,
        p.semanaEntrega ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
