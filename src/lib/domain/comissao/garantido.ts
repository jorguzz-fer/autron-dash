// src/lib/domain/comissao/garantido.ts
import type { GarantidoConfig } from "./types";

/**
 * Aplica a comissão garantida sobre a previsão mensal.
 *
 * Regra (Márcio): vendedor recém-contratado recebe um piso mensal (`valor`)
 * por `meses` meses a partir de (`inicioAno`, `inicioMes`). Dentro dessa janela,
 * o vendedor recebe `max(previsao[m], valor)` — ou seja, se a comissão apurada
 * superar o garantido, recebe a comissão (o garantido nunca soma, é piso).
 * Fora da janela, recebe a previsão normal.
 *
 * A janela pode cruzar o ano (ex.: contratado em nov/2026, garantido até
 * jan/2027); ao apurar `ano`, só os meses [1..12] daquele ano dentro da janela
 * recebem o piso.
 *
 * @param previsao array[12] (index 0 = jan) de comissão prevista do `ano`.
 * @param ano ano que está sendo apurado.
 * @param cfg configuração do garantido, ou null (sem garantido).
 * @returns array[12] de "a receber" (= max(previsão, garantido) na janela).
 */
export function aplicaGarantido(
  previsao: number[],
  ano: number,
  cfg: GarantidoConfig | null,
): number[] {
  if (!cfg || cfg.meses <= 0 || cfg.valor <= 0) return [...previsao];

  // Índice absoluto (ano*12 + mes0) do primeiro e último mês garantido.
  const inicioAbs = cfg.inicioAno * 12 + (cfg.inicioMes - 1);
  const fimAbs = inicioAbs + cfg.meses - 1;

  return previsao.map((prev, i) => {
    const abs = ano * 12 + i;
    const dentroJanela = abs >= inicioAbs && abs <= fimAbs;
    return dentroJanela ? Math.max(prev, cfg.valor) : prev;
  });
}
