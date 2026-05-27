# Proposta Comercial — Módulo de Comissionamento
**autron-dash · Fernando Jorge → Autron / Silvio**
*São Paulo, 27 de maio de 2026*

---

## Resumo Executivo

Silvio,

Como conversamos, o objetivo era sair das planilhas e do Protheus para ter o cálculo de comissões **dentro do próprio dashboard**, com flexibilidade para mudar as regras sem depender de nenhum ERP. Isso está feito.

O módulo de Comissionamento está em produção no **autron-dash** com as regras exatas que discutimos: meta por Entrada de Pedido, comissão sobre Faturamento, elegibilidade acumulada no ano (a regra nova, não a do Protheus), janela de pagamento 21→20 e percentuais configuráveis por cargo. Os números foram validados contra o Extrato real do Protheus com os dados de Adriano e Alexsiano do período 21/03–20/04/2026.

Com a migração Protheus → Sankhya prevista para julho, o timing foi deliberado: o cálculo de comissões agora é **independente do ERP** — quando o Sankhya entrar, não tem nada para retrabalhar aqui.

---

## O Que Foi Entregue

### Banco de Dados

Quatro novos modelos criados com migration aplicada em produção:

- **Cargo** — define o percentual de comissão e o gatilho de elegibilidade por função, versionado por ano
- **Vendedor** — vincula o código do vendedor ao cargo, com possibilidade de override individual do gatilho
- **Lançamento** — cada linha do Analítico: valor, tipo (Previsto / Faturado / Pago), data de emissão, data de pagamento, parcela, rateio
- **Meta** — meta mensal por vendedor/ano, alimentada pela planilha de metas

### Motor de Cálculo

Implementado em TypeScript puro, sem dependência de banco em runtime — roda no momento da consulta e reflete sempre os dados mais atuais.

O que o motor calcula:
- **EP mensal com deduplicação de parcela** — mesma linha de pedido parcelado entra uma vez por mês, não duplica
- **Saldo e saldo acumulado YTD** — diferença entre EP e Gatilho, acumulada de janeiro a dezembro
- **Elegibilidade acumulada** — mês fraco é compensado por mês forte dentro do ano; diferente do Protheus que avaliava mês a mês
- **Comissão por linha de faturamento** — percentual do cargo aplicado ao valor faturado (sem IPI/ICMS-ST)
- **Previsão mensal** — soma de lançamentos Previstos + Faturados nos meses em que o vendedor está elegível
- **Grid de pedidos pagos** — lançamentos com status Pago agrupados pela janela 21→20
- **Devoluções** — valor negativo abate EP e comissão automaticamente

Cobertura de testes: **139 testes automatizados (Vitest)**, todos passando, incluindo casos extremos: zero meta, gatilho zero, parcela com rateio, virada de ano.

### Parsers de Planilha

Dois leitores de `.xlsx` tolerantes a variações de cabeçalho (maiúscula/minúscula, espaços, colunas fora de ordem):

- **Analítico Consolidado** — o relatório que hoje vem do Protheus: pedidos, faturamento, pagamentos, rateios
- **Metas por Vendedor** — planilha com código do vendedor e meta mensal; expande automaticamente as 12 colunas mês por mês

### Upload e Infraestrutura

Os uploads reutilizam a mesma infraestrutura já existente no dashboard: autenticação, rate limit, audit log, substituição atômica dos dados por tenant. Nenhum dado de outros clientes é afetado.

### Telas

| Tela | O que faz |
|---|---|
| **Visão Geral** | KPIs consolidados (previsão total YTD, nº de elegíveis, nº de vendedores ativos) + tabela com todos os vendedores linkando para o extrato |
| **Extrato por Vendedor** | Grid de apuração (Meta / Gatilho / EP / Saldo / Saldo Acum. / Elegível / Previsão × 12 meses) + grid de pedidos pagos por janela + exportação CSV + impressão |
| **Cadastro de Vendedores e Cargos** | CRUD completo: criar/editar cargos com % e gatilho por ano; criar/editar vendedores com cargo e override de gatilho |
| **Upload** | Upload do Analítico e das Metas com histórico de uploads |

Acesso restrito a perfis **ADMIN, DIRETOR e CONTROLADORIA** — os demais usuários não veem a seção no menu.

### Teste de Aceite

Os números do extrato foram validados manualmente contra o Extrato do Protheus (período 21/03–20/04/2026, vendedores Adriano e Alexsiano). A única diferença intencional é a elegibilidade: o Protheus avalia mês a mês; o sistema novo avalia YTD — conforme a política que o Silvio quer implementar.

---

## Pendências de Ativação

O módulo está pronto tecnicamente. Para ativar em produção, são necessárias duas ações do lado da Autron:

1. **Cadastrar Cargos e Vendedores** — acessar `/comissoes/vendedores`, criar os cargos com percentual e gatilho, e vincular cada vendedor ao seu cargo
2. **Fazer o primeiro Upload** — subir o Analítico e as Metas reais em `/comissoes/upload` e conferir o Extrato na tela

Posso acompanhar essa validação remotamente se precisar.

---

## Roadmap — Próximas Fases

O MVP cobre o caso de uso principal. As fases abaixo estão mapeadas e prontas para orçamento quando fizer sentido para a Autron:

| Fase | O que cobre |
|---|---|
| **Fase 2 — Hierarquia** | Supervisor e KAM comissionam sobre as vendas dos subordinados; cálculo agregado por carteira |
| **Fase 3 — Garantido** | Vendedor novo recebe valor garantido por N meses — o sistema paga o maior entre comissão calculada e o garantido |
| **Fase 4 — Exceções** | Ajustes manuais, negócios especiais (windfall/bluebird), comissão sobre margem, internacionais |
| **Fase 5 — Fechamento** | Snapshot persistido por rodada de pagamento (documento de referência auditável), separação PJ/CLT para lote de pagamento |
| **Fase 6 — Self-service** | Vendedor vê o próprio extrato; supervisor vê a equipe — sem precisar de acesso de DIRETOR |
| **Representantes** | Regras próprias: período mês-cheio, pagamento dia 15, sem gatilho de elegibilidade |

---

## Investimento

| Item | Valor |
|---|---|
| Módulo de Comissionamento — MVP completo | R$ ________ |
| **Total desta proposta** | **R$ ________** |

*Forma de pagamento: a combinar.*
*Esta proposta cobre exclusivamente o escopo descrito acima (MVP). Fases futuras serão orçadas separadamente.*

---

## Próximos Passos

1. Aprovação desta proposta
2. Emissão de NF / faturamento
3. Ativação em produção (cadastro de cargos/vendedores + primeiro upload)
4. Alinhamento de data para iniciar a Fase 2, se houver interesse

---

*Qualquer dúvida, pode chamar.*
**Fernando Jorge**
fer.jorge@gmail.com
