# KPI Financeiro

Seção da Controladoria para analisar **o que temos a receber** (títulos
vencidos e a vencer) e **o que temos a faturar** (carteira de pedidos ainda
sem nota fiscal).

## Quem pode acessar

Apenas usuários **ADMIN** e a **Controladoria** (Daiana —
`controladoria@autron.com.br`). O link aparece no menu lateral, seção
*Financeiro*, somente para esses usuários; o acesso direto à URL também é
bloqueado (redireciona pro Dashboard). Ver `src/lib/kpiAccess.ts`.

## A Receber (Vencidos e a Vencer)

Fonte: relatório **FINR130 — Posição de Títulos a Receber** do Protheus
(`.xlsx`), exportado pela Controladoria e subido na própria tela (botão de
upload no rodapé da seção). Cada upload substitui a posição anterior.

- Agrupado por **grupo econômico** (primeira palavra do nome): unidades como
  *Gerdau Pinda / Gerdau-Cosigua / Gerdau-Ouro Branco* viram uma linha
  **"Gerdau"**. Com um cadastro só, mostra o nome completo; com vários, o nome
  do grupo e a contagem de cadastros.
- Três status: **Vencido**, **Em Cartório** e **A Vencer**, com aging por faixa
  de dias (`0-29 / 30-60 / 61-90 / 91-120 / >120`). Vencidos/cartório usam o
  *Dias Atraso*; a vencer, os dias até o vencimento.
- **Em Cartório** = títulos em protesto (detectados pelo texto da coluna
  *Histórico* — coluna P — contendo "protesto"/"cartório"). Saem do total de
  vencidos por estarem em tratativa separada junto ao cartório.
- Layout: um **quadro de totais por status** + **matrizes cliente × período**
  (uma para Vencidos, uma para A Vencer e, quando houver, uma para Em Cartório)
  + um **resumo por cliente** ordenável.
- Botão **Baixar por cliente (CSV)** exporta uma linha por cliente com saldos,
  aging e os três status.

## A Faturar (Pendente)

Fonte: base de **Pedidos** (`entrada_pedido`) já carregada no Dash — pedidos
**EM ABERTO** (sem nota fiscal).

- Agrupado por **cliente** (mesma lógica de fusão por nome), com **Total a
  Faturar** e aging por faixa de dias, no mesmo padrão do modelo manual.
- Seletor **Por Emissão** × **Por Entrega prevista** alterna a data de
  referência do aging:
  - *Emissão* — idade do pedido em carteira (dias desde a emissão).
  - *Entrega prevista* — atraso vs. a data de faturamento prevista
    (`dtEntrega`); pedidos ainda no prazo caem na primeira faixa.
- Pedidos sem a data de referência aparecem em **Sem data** (fora do aging).
- **Prazo médio emissão → previsão de faturamento**: média de dias entre a
  emissão do pedido e a entrega prevista, com KPI da média geral e um ranking
  (top 15) por cliente.
- Botão **Baixar (CSV)** exporta uma linha por cliente (inclui o prazo médio).

## Notas / evolução

- O indicador *A Faturar* usa hoje a base de Pedidos do Dash. Caso a
  Controladoria queira usar a base própria da Dani, dá pra criar um dataset
  específico depois — a estrutura de agrupamento/aging
  (`src/lib/domain/kpiFinanceiro.ts`) é reaproveitável.
