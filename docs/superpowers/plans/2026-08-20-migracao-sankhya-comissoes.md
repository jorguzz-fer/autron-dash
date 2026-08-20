# Migração Protheus → Sankhya no módulo de Comissões

Registro da reunião de 20/ago/2026 (Fernando + Márcio + William + Sílvio) e
plano de atividades. A empresa está trocando o ERP: o Protheus para de gerar
os relatórios Analítico/Sintético que alimentam o módulo de comissões, e a
partir de agosto/2026 a fonte passa a ser o Sankhya.

## Decisões da reunião

1. **Corte em 31/jul/2026.** Jan–jul ficam como estão, com os números já
   subidos do Protheus (dados "estancados" — não serão reprocessados). De
   agosto em diante, a base vem do Sankhya e a aplicação constrói os
   relatórios equivalentes ao Analítico/Sintético.
2. **Comissão não será calculada no Sankhya.** O Sankhya só exporta pedidos e
   notas (faturamento e pagamento); toda a regra de comissão continua aqui.
   A aplicação passa a funcionar como "extensão do Sankhya".
3. **Momentos do processo** (confirmado na reunião):
   - *Entrada de pedido* → decide elegibilidade (gatilho 70% no acumulado);
   - *Faturamento* → só previsibilidade, não gera ação;
   - *Pagamento* → é o que dispara o pagamento da comissão.
   Relatórios essenciais do Sankhya: **entrada de pedidos** e **pagamentos**
   (contas a receber); faturamento entra como previsão.
4. **Todos os códigos mudam** no Sankhya: número de pedido, código de
   vendedor, código de cliente. Nome/CNPJ/CPF permanecem. Serão necessários
   **de-paras** (pedido Protheus ↔ pedido Sankhya; vendedor; cliente). O
   de-para é feito do lado da aplicação — a planilha sobe **crua**, sem
   tratamento manual prévio (o Sílvio pode manter um de-para próprio para
   controle interno, mas ele não alimenta o sistema).
5. **Plano A — API do Sankhya.** Verificar com o Rogério (gerente de projeto
   do Sankhya) credenciais e escopo da API (consulta e, se possível, escrita).
   Com API, elimina-se o ciclo de baixar/subir planilha e os dados passam a
   ser consultados em tempo real.
6. **Plano B — planilhas cruas do Sankhya** (é também a ação emergencial de
   agosto): Sílvio envia 3 exportações cruas — *entrada de pedidos*,
   *faturamento* e *contas a receber* (o cadastro de vendedor já vem marcado
   nelas, com nome e código). A aplicação trata formato, de-para e regras.
7. **Urgência:** a folha fecha no último dia do mês — a comissão de agosto
   precisa estar calculada antes disso.
8. **Representantes (3 casos ativos) ficam para depois**, tratados manualmente
   por enquanto. Regra é diferente: % por *tipo de venda* (ex.: manutenção 5%,
   nova oportunidade ~8%), sem gatilho, paga no pagamento, com margem de
   desconto interferindo. Leandro/Márcio enviarão a regra fechada; vai exigir
   campos novos (tipo de venda) e uma regra apartada no cálculo.
9. **Inativos permanecem na base** (ex.: Célio, Adriano) — recebem residuais
   de vendas antigas. A contagem de vendedores na tela inclui inativos por
   design (ficam no fim da lista).

## Divergências reportadas (em apuração)

- Diferença de ~R$ 27 mil num mês de um vendedor vs. planilha do William
  (William valida no detalhe, vendedor a vendedor, via WhatsApp).
- Alexsiano: Protheus mostra meta batida em fev e jun; plataforma mostrava
  "não bateu" (correção deployada durante a própria reunião).
- 4 códigos de vendedor aparentemente não subiram (ex.: 11, 14, 27…) —
  provável falta de de-para/cadastro; conferir na lista de "códigos sem
  cadastro" da Visão Geral.

## Atividades

| # | Atividade | Status |
|---|-----------|--------|
| 1 | % de atingimento (mês e acumulado YTD) no extrato, com barra de status e vermelho abaixo do gatilho | **feito** (`pctMes`/`pctAcumulado` na apuração + linhas no extrato) |
| 2 | Exportação do extrato em XLS (evidência auditável para o vendedor; CSV é ruim de tratar) | **feito** (export .xlsx com 3 abas; `?format=csv` mantém o antigo) |
| 3 | Receber planilhas cruas do Sankhya (pedidos, faturamento, contas a receber) e escrever os parsers | bloqueado — aguardando amostras do Sílvio |
| 4 | De-para vendedor (código Protheus ↔ Sankhya) e pedido (nº Protheus ↔ nº Sankhya) — schema + tela/import | depende de #3 (o formato dos códigos vem nas amostras) |
| 5 | Reunião com Rogério: viabilidade/credenciais da API do Sankhya | agendar (Márcio articula) |
| 6 | Integração via API (se #5 viável): módulo segregado de consulta/escrita | depende de #5 |
| 7 | Validar divergências com William (R$ 27 mil; fev/jun do Alexsiano; códigos 11/14/27 sem cadastro) | em andamento — check com William após deploy |
| 8 | Regras de representantes (% por tipo de venda, sem gatilho) | adiado — aguardando regra do Leandro/Márcio |

## Notas técnicas para os parsers Sankhya (quando chegarem as amostras)

- Não assumir zero-pad de 6 dígitos no código de vendedor (isso é convenção
  do Protheus — ver `padCodigo` em `parsers/comissao/metas.ts`).
- `ComissaoLancamento.codVendedor` hoje carrega o código Protheus; o de-para
  deve normalizar para um código canônico (proposta: manter o Protheus como
  canônico em 2026, mapeando Sankhya → Protheus na importação, para não
  quebrar a série histórica jan–jul).
- Pedidos abertos no Protheus serão faturados/pagos no Sankhya com outro
  número — sem o de-para de pedidos, a dedup por `numeroPedido|itemPedido`
  contaria o mesmo pedido duas vezes (uma por sistema). Esse de-para é
  pré-requisito para misturar as fontes num mesmo ano.
