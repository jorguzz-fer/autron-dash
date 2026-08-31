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
| 3 | Parsers das planilhas cruas do Sankhya | **Pilar 1 e 2 feitos** (`sankhyaPedidos.ts`, `sankhyaFaturamento.ts` — validados com as amostras de ago/2026). **Falta o Pilar 3 (pagamentos)** — sem ele não há o que pagar |
| 4 | De-para vendedor (código Protheus ↔ Sankhya) e pedido (nº Protheus ↔ nº Sankhya) — schema + import | pedido: o de-para vem na coluna `PV_sistema_anterior…` do faturamento (parser já extrai). Vendedor: tabela observada abaixo; formalizar no schema junto com a ingestão |
| 5 | Reunião com Rogério: viabilidade/credenciais da API do Sankhya | doc recebida: <https://developer.sankhya.com.br/> — falta credencial/token da conta |
| 6 | Integração via API (se #5 viável): módulo segregado de consulta/escrita | **fundação feita** (`src/lib/sankhya/` — auth OAuth/legado, loadRecords, executeQuery, consultas dos 3 pilares; ver spec 2026-08-31). Falta credencial (#5) para validar campos e ligar |
| 7 | Validar divergências com William (R$ 27 mil; fev/jun do Alexsiano; códigos 11/14/27 sem cadastro) | em andamento — check com William após deploy |
| 8 | Regras de representantes (% por tipo de venda, sem gatilho) | **regra recebida e implementada no domínio** (`representante.ts`, Anexo II — ver abaixo). Falta a ingestão/tela. Atenção: **Cavanellas vendeu em ago/2026** (3 pedidos, R$ 67,6 mil — Gerdau e ArcelorMittal, tipo RE ⇒ 5% ≈ R$ 3.379 se pagos sem desconto) |
| 9 | Ingestão dos pilares (Dataset novos, transformação → `ComissaoLancamento`, upload/UI) | próximo passo — depende das respostas abaixo (dedup de linha e Pilar 3) |

## Amostras de ago/2026 — o que os arquivos mostraram

**Pilar 1 — Entrada de PV** (`Entrada_PV_Comissao.xlsx`): 75 linhas, 71
pedidos (numeração Sankhya 262–476), R$ 2.808.428,13 no total. Datas vêm como
TEXTO `dd/mm/yyyy hh:mm:ss`. Campos: pedido, emissão, cliente (código novo),
produto, qtd, valor do item, vendedor (código novo), entrega, tipo de negócio
(Cliente Final/OEM/REVENDA), tipo de venda (RE/NO), previsão de vencimento,
condição de pagamento.

**Pilar 2 — Faturamento** (`Faturamento_Comissao.xlsx`): 51 linhas, 36 NFs,
R$ 1.591.685,80. Mesmos campos + NF, `PV_sistema_anterior_ou_outra_referencia`
(o de-para: 41 linhas com PV do Protheus, 9 só com pedido Sankhya, 1 sem
vínculo), código do tipo de negociação, prazo da parcela e vencimento.
1 devolução (NF 33245, −R$ 2.683,84) sem vínculo com pedido de origem.

**De-para de vendedores observado (código Sankhya → nome):**
1=VENDEDOR (placeholder de pedido sem atribuição!), 3=Rafael, 4=Célio
(inativo — residual), 5=Willian, 6=Michel, 7=Dewet, 8=Alexsiano, 11=João,
12=Rembrandt, 15=Daniele, 21=Matheus, 22=A. Cavanellas (representante).
Códigos NÃO batem com os do Protheus — casamento por nome na importação
(mesma estratégia do `matchVendedorNome` das metas), formalizando o vínculo
em campo próprio no cadastro.

## Regras de representantes (Anexo II — recebido ago/2026)

Implementadas em `src/lib/domain/comissao/representante.ts` (sem meta/gatilho;
paga no pagamento do cliente):

- **% por tipo de venda** (coluna Tipo_Venda do Sankhya): NO (Nova
  Oportunidade), ME (Melhoria) e SU (Substituição) = **8%**; RE (Reposição) e
  SE (Serviços) = **5%**. ⇒ Isso decodifica os RE/NO vistos nos exports — e
  torna as linhas SEM Tipo_Venda um problema financeiro direto (sem o código
  não há % do representante).
- **Fator pelo desconto** concedido na oportunidade: ≤10% ×1,00;
  10,01–15% ×0,95; 15,01–20% ×0,90; 20,01–25% ×0,85; 25,01–30% ×0,80;
  >30% ×0,70. Comissão = valor × %tipo × fator. ⚠ O desconto da oportunidade
  NÃO vem nos exports atuais do Sankhya — pedir o campo.
- **Sistemas MEC911** (supressão de particulados): valor FIXO por faixa do
  pedido — até 300k R$ 6.000; até 400k R$ 7.600; até 500k R$ 9.000; até 600k
  R$ 10.200; até 700k R$ 11.200; acima R$ 12.000.
- **Importação Direta (ID)**: prêmio de **2% sobre a comissão recebida pela
  Autron** da representada (não sobre a venda), pago após o recebimento;
  MEC911 via ID usa as mesmas faixas sobre a comissão recebida em BRL.

## Pendências com a origem (Sílvio)

1. **Pilar 3 — Pagamentos/baixas do contas a receber** (o que dispara a
   comissão): NF, parcela, vencimento, **data do pagamento efetivo**, valor
   pago, vendedor, pedido. Sem ele o ciclo não fecha.
   *Status ago/2026 (Márcio): está travado — títulos pagos NÃO gerados pelo
   Sankhya (legado migrado do Protheus) não têm ligação com pedido/NF.
   Caminho proposto: exportar em duas partes — (a) títulos nascidos no
   Sankhya, com vínculo normal; (b) títulos legados com o nº do título/PV do
   Protheus no campo de referência (mesmo padrão "PV 21xxx" do faturamento) —
   o de-para do lado de cá já sabe casar esse formato. Se nem isso houver,
   um de-para manual título→PV feito uma única vez na virada resolve o
   estoque legado, que é finito e só diminui.*
1b. **Desconto da oportunidade por pedido/item** no export (novo — exigido
   pela regra dos representantes; sem ele não dá para aplicar o fator).
2. **Parcelas**: o faturamento traz UMA parcela por linha; condições
   "30/45 DDL" indicam mais parcelas não desdobradas. Confirmar se o
   desdobramento vem no Pilar 3.
3. **Sequência do item**: pedidos 311/372/476 têm linhas 100% idênticas
   (mesmo produto/qtd/valor 2×) — duplicação do export ou itens reais?
   Incluir o nº único/sequência da linha do pedido no export resolve de vez
   (o 308 tem o mesmo produto 2× com valores diferentes, legítimo).
4. **Pedido 262 sem vendedor** (código 1 "VENDEDOR"): Siderar, R$ 67.923,27 —
   atribuir na origem.
5. **Tipo_Venda vazio**: 15 linhas na entrada, 11 no faturamento (já
   acionado). Confirmar o significado de RE/NO (manutenção × nova
   oportunidade?) — vira insumo da regra dos representantes.
6. **Devoluções**: confirmar a regra (abate o EP do mês corrente? estorna
   comissão paga?) e pedir que o export traga a NF/pedido de ORIGEM da
   devolução (a NF 33245 veio solta).
7. **Cadastro de vendedores do Sankhya** (export código→nome completo) para
   fixar o de-para sem ambiguidade.
8. **API**: credenciais/token da conta Autron no gateway Sankhya
   (developer.sankhya.com.br) para o plano A.

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
