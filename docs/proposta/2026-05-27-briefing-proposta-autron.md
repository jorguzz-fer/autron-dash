# Briefing para Proposta Comercial — Autron Dash

> **Para o agente que vai escrever a proposta:** Este documento contém todo o contexto técnico e de negócio necessário para redigir uma proposta comercial formal ao cliente Autron (Silvio). Leia integralmente antes de começar.

---

## 1. Contexto do Projeto

**Cliente:** Autron (representado por Silvio)
**Produto:** autron-dash — Dashboard operacional interno desenvolvido pelo Fernando (fornecedor/desenvolvedor)
**Stack:** Next.js 15 + Prisma 6 + Auth.js v5 + TypeScript strict + Tailwind 4 + Vitest, hospedado no Coolify (VPS própria do cliente)
**Modelo de entrega:** SaaS interno multi-tenant, em produção em https://autron-dash.tudomudou.com.br

O autron-dash é um sistema que substituiu planilhas manuais e relatórios do ERP Protheus, centralizando:
- Acompanhamento de pedidos e prontidão de entrega
- Faturamento vs meta
- Conciliação financeira
- Entrada de pedidos + CRM (Ploomes)
- **[NOVO]** Módulo de Comissionamento de vendedores

---

## 2. Escopo Entregue — Esta Fase

### 2.1 Módulo de Comissionamento (MVP) — feature principal desta proposta

O cliente tinha o cálculo de comissões feito manualmente em planilha + ERP Protheus (que será descontinuado na migração para Sankhya). Precisava de uma solução flexível e desacoplada do ERP.

**O que foi construído:**

| Componente | Descrição técnica | Complexidade |
|---|---|---|
| **4 modelos de dados + migration** | ComissaoCargo, ComissaoVendedor, ComissaoLancamento, ComissaoMeta + enum ComissaoClassificacao | Alta |
| **Motor de cálculo puro (TDD)** | Funções puras com 25+ testes Vitest cobrindo: EP com dedup de parcela, gatilho YTD acumulado, saldo mensal/acumulado, elegibilidade, comissão por linha, previsão mensal, janela de pagamento 21→20, grid de pedidos pagos | Alta |
| **2 parsers de planilha (TDD)** | Analítico consolidado (.xlsx) e Metas por vendedor (.xlsx), tolerantes a variações de cabeçalho | Média |
| **Pipeline de upload integrado** | Reusa infraestrutura existente (deleteMany+createMany por tenant, audit log, rate limit) | Baixa |
| **Service tenant-scoped** | Queries Prisma sempre filtradas por tenantId, composição do extrato completo | Média |
| **4 telas web** | Overview RH/Diretoria (KPIs + tabela geral), Extrato por vendedor (2 grids + CSV + Print), Cadastro de Vendedores/Cargos (CRUD completo), Upload dedicado | Alta |
| **Sidebar gated** | Seção "Comissões" visível só para ADMIN/DIRETOR/CONTROLADORIA | Baixa |
| **Teste de aceite** | Validação dos números contra o Extrato real do Protheus (Adriano + Alexsiano) | Alta |

**Regras de negócio implementadas:**
- Base de meta: Entrada de Pedido (EP), por data de emissão
- Base de comissão: Faturamento (FAT), sem IPI/ICMS-ST
- Gatilho de elegibilidade: `Meta × gatilhoPct` por cargo, com override por vendedor
- **Elegibilidade YTD acumulada** (TO-BE da política — diferente do Protheus que usava mensal): mês fraco compensado por mês forte dentro do ano
- Saldo e saldo acumulado (buffer YTD Jan–Dez)
- Janela de pagamento 21→20: pagamento pago em dia ≤ 20 fecha na janela do mês corrente; dia ≥ 21 fecha no mês seguinte
- % de comissão configurável por cargo e ano (versionado)
- Gatilho override por vendedor individual
- Devolução (valor negativo) abate EP e comissão

**Esforço estimado:** ~2 dias de desenvolvimento (planejamento + implementação com TDD + testes de aceite contra dados reais)

---

### 2.2 Melhorias Incrementais Entregues (mesmo período)

Além do módulo de Comissões, foram entregues durante esta fase:

| Feature | Aba/Área | Descrição |
|---|---|---|
| Coluna "Dt. Confirma" | Prontidão | Data de confirmação de entrega visível nas tabelas e nos CSVs exportados |
| Nova ação "Item sem data confirmada" | Prontidão | Classificação automática para SC/OP geradas mas sem data de confirmação |
| Razão social no Top 15 | Entrada de Pedidos | Nome completo do cliente no ranking de maiores pedidos em aberto |
| Observações por PV | Prontidão | Campo de texto livre por pedido, visível nas tabelas operacionais |
| Nome do cliente na tabela | Visão Geral | Razão social exibida na tabela de maiores pedidos em aberto |
| Gráfico Meta × Realizado acumulado | Faturamento | Gráfico de evolução anual no topo da aba de faturamento |
| Filtro ano/mês + ranking por valor | Dashboard | Filtro temporal e ranking de top vendedores |
| Chat IA (infra) | Transversal | Infraestrutura de SSO + proxy para integração com Open WebUI/LiteLLM (aguardando configuração manual no VPS pelo cliente) |

---

## 3. O Que Ainda Está Pendente / Fora do MVP

### 3.1 Comissões — Fases Futuras (backlog definido)

| Fase | Descrição | Quando |
|---|---|---|
| **Fase 2 — Hierarquia/carteira** | Supervisor/KAM comissiona sobre vendas dos subordinados; cálculo agregado por carteira | A definir |
| **Fase 3 — Garantido** | Vendedor novo recebe valor garantido por N meses; `max(comissão, garantido)` | A definir |
| **Fase 4 — Exceções** | Ajustes manuais, windfall/bluebird, ID sobre margem, internacional | A definir |
| **Fase 5 — Fechamento** | Snapshot persistido por rodada de pagamento (documento de referência), lote PJ/CLT | A definir |
| **Fase 6 — Self-service** | Extrato do vendedor (visualização própria) + visão do supervisor | A definir |
| **Representantes** | Período mês-cheio, pagamento dia 15, sem gatilho (regras próprias) | A definir |

### 3.2 Chat IA (parcialmente entregue)

A integração de IA (Claude/ChatGPT/Gemini) dentro da plataforma tem a infraestrutura de SSO construída. Falta:
- Configuração manual no VPS do cliente (Open WebUI + LiteLLM)
- DNS apontando para o novo serviço
- Teste end-to-end

### 3.3 Validação com dados reais de comissões

O cliente precisa:
1. Cadastrar cargos (% comissão e gatilho) e vendedores na plataforma
2. Fazer upload do Analítico real + Metas
3. Conferir o Extrato na tela vs o Extrato do Protheus

---

## 4. Indicadores de Esforço (para precificação)

| Item | Indicador |
|---|---|
| Commits no branch de comissões | 18 commits feature + 2 fix/chore = **20 commits** |
| Testes escritos (TDD) | **139 testes** (Vitest), todos passando |
| Arquivos criados/modificados | ~30 arquivos novos, ~10 modificados |
| Telas novas | 4 páginas + 1 rota de export CSV |
| Modelos de dados | 4 novos models + 1 enum + migration SQL |
| Regras de negócio documentadas | Spec de design (260 linhas) + plano de execução (177 linhas) |
| Sessão de reunião com Silvio | 1 reunião transcrita + análise de 5 documentos/planilhas do cliente |
| Dias de desenvolvimento | ~2 dias equivalentes |

---

## 5. Contexto Técnico para a Proposta

**Por que vale mais do que parece:**
- O motor de cálculo é independente do ERP (Protheus → Sankhya) — o cliente não ficará preso em nenhuma migração futura
- A regra de elegibilidade YTD (diferente do Protheus) foi uma decisão deliberada do Silvio — o sistema já implementa a política futura, não a atual
- Os testes de aceite foram feitos contra dados reais de produção (planilhas do cliente do período 21.03–20.04.2026)
- O módulo é multi-tenant — pode ser reaproveitado para outros clientes do mesmo dash

**Stack e maturidade:**
- TypeScript strict, sem `any`
- TDD com cobertura de casos extremos (zero meta, gatilho zero, parcela com rateio, ano-virada)
- RBAC (controle de acesso por perfil)
- Audit log em todas as mutações (ISO 9001)
- Multi-tenant com isolamento garantido por tenantId em todas as queries

---

## 6. Instruções para o Agente que Vai Escrever a Proposta

**Tom:** Profissional mas próximo. O Fernando tem relação próxima com o Silvio ("parceria que não vai acabar nunca" — trecho da reunião). Não precisa ser formal demais.

**Estrutura sugerida para a proposta:**
1. Resumo executivo (o que foi entregue e o valor de negócio)
2. Escopo detalhado — MVP de Comissões (o que está funcionando agora)
3. Melhorias incrementais entregues (tabela rápida)
4. O que está pendente (validação com dados reais, Chat IA)
5. Roadmap de fases futuras (Comissões fases 2–6)
6. Investimento (Fernando preenche os valores)
7. Próximos passos

**Referências para o agente:**
- A motivação principal do cliente: "quer mudar a regra amanhã sem ficar amarrado ao ERP" (trecho da reunião com Silvio)
- O contexto de migração de ERP: Protheus → Sankhya previsto para ~01/07/2026 — o módulo de comissões garante continuidade sem retrabalho no Sankhya
- O cliente já usa o dashboard há meses — esta é uma expansão de produto existente, não um projeto novo

---

## 7. Arquivos de Referência (no repositório)

- Spec técnico: `docs/superpowers/specs/2026-05-21-comissoes-mvp-design.md`
- Plano de execução: `docs/superpowers/plans/2026-05-21-comissoes-mvp.md`
- Transcrição da reunião com Silvio: `comissionamento/reunião/Comissionamento-autron.txt`
- Política de comissão do cliente: `comissionamento/Politica_Comissao_revisada.docx`
