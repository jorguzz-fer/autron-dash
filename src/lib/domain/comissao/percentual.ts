// src/lib/domain/comissao/percentual.ts
//
// Convenção de percentuais no módulo de comissões:
//   - BANCO/CÁLCULO: sempre FRAÇÃO (0.015 = 1,5%; 0.7 = 70%). É o que
//     RegraVendedor.comissaoPct/gatilhoPct recebem e o que a apuração multiplica.
//   - TELA: sempre PERCENTUAL (1,5 e 70). Tanto a leitura (tabelas) quanto a
//     ENTRADA (formulários de cargo e de override do vendedor).
//
// Os formulários pediam a fração num campo rotulado "%", então quem digitava
// "1,5" pensando em 1,5% gravava 150% e a comissão saía 100× maior. Estes dois
// helpers são a fronteira: o form converte na entrada e na exibição.

/** Casas decimais da fração no banco (Decimal(6,4)) → 2 casas no percentual. */
const CASAS_FRACAO = 4;

function arredonda(n: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** Fração armazenada → percentual para exibir/editar. 0.015 → 1.5 */
export function fracaoParaPct(fracao: number): number {
  return arredonda(fracao * 100, CASAS_FRACAO);
}

/** Percentual digitado → fração para gravar. 1.5 → 0.015 */
export function pctParaFracao(pct: number): number {
  return arredonda(pct / 100, CASAS_FRACAO);
}
