# Análise de Carteira

**Onde:** Análise Regional → botão **Análise de carteira** (`/analise-regional/carteiras`).

## O que ela responde

> "Como foi o histórico dos clientes que estão **hoje** na carteira de cada vendedor?"

O faturamento e a entrada de pedidos são reagrupados pelo **dono atual** de cada
cliente, **independentemente de quem era o vendedor na época** da venda. É a
diferença para a tela *Carteira por Vendedor*, que agrupa pelo vendedor da
NF/pedido da época.

Exemplo: se o cliente ACME era do João em 2024 e hoje é da Maria, todo o
histórico da ACME aparece na linha da Maria. Assim dá para avaliar a carteira
atual com a série histórica completa.

## Base que alimenta a tela

Relatório do Protheus **clientes com vendedor** (`clientes_com_vendedor.xlsx`).
O campo **nome vendedor** define o dono da carteira.

O upload fica na própria tela, no bloco *Base da carteira*. Cada upload
**substitui** a base inteira (é uma foto do cadastro atual) — suba de novo
sempre que houver troca de carteira no Protheus.

O leitor da planilha é tolerante: o cabeçalho pode estar abaixo do título do
relatório e as colunas aceitam várias grafias (`Razão Social`/`Nome`/`Cliente`,
`Nome Vendedor`/`Vendedor`, `Município`/`Cidade`, etc.). Só a coluna com o
**nome do cliente** é obrigatória.

## Como o cruzamento é feito

`Faturamento` e `Pedido` não guardam código de cliente — só o nome. O
cruzamento é pelo **nome normalizado** (mesma chave da Análise Regional), com o
**nome fantasia** como segunda tentativa.

- Cliente com histórico que **não está** na base → agrupado como **Sem carteira**.
- Mesmo nome com lojas em carteiras diferentes → vence o dono com mais cadastros.
- O KPI **Cobertura da base** mostra quantos clientes do período têm dono
  identificado. Cobertura baixa geralmente significa base desatualizada ou
  divergência de grafia entre o cadastro e as notas.

## Leitura da tela

- **KPIs** — faturamento, entrada de pedidos (com o total em aberto), clientes,
  *herdados*, churn (ativos/em risco/perdidos) e cobertura da base.
- **Herdados** — clientes da carteira que, no período, faturaram com **outro**
  vendedor. É o tamanho da "herança" que o dono atual recebeu.
- **Ranking das carteiras** — Pareto por faturamento; clicar foca numa carteira.
- **Resumo por dono atual** — faturamento, pedidos, pedidos em aberto, clientes,
  curva ABC dentro da carteira, churn e ticket médio.
- **Histórico mês a mês** — pivô por carteira ou por cliente, com dois toggles
  que são o coração da análise:
  - *Faturamento* × *Entrada de pedidos* — a fonte da série;
  - *Dono atual* × *Vendedor da época* — a atribuição. Comparar os dois mostra
    exatamente o que mudou com o redesenho das carteiras.
- **Clientes** — lista com dono atual, vendedor da época (em destaque quando
  diferente), faturamento, pedidos, última NF e status de churn.
- **Baixar CSV** — uma linha por cliente, respeitando período, janela de churn e
  carteira selecionada.

Os filtros de período e janela de churn seguem a mesma convenção das outras
telas de Análise Regional.
