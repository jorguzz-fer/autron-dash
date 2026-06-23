# Comissões — Retomada: Consolidação das Reuniões (Silvio + Márcio) e Plano de Ação

**Data:** 2026-06-18
**Branch:** `claude/wizardly-shannon-qugs4s`
**Predecessores:**
- `docs/superpowers/specs/2026-05-21-comissoes-mvp-design.md` (MVP individual — **em produção**)
- `docs/superpowers/specs/2026-06-01-comissoes-fase2-design.md` (Carteira/Garantido/CRUD — **especificado, não implementado**)

**Fontes desta retomada:**
- Reunião Silvio + RH — `Comissionamentoautron.txt` (origem do MVP)
- Reunião Márcio (Comercial/RH) — `marcio.txt` (origem da Fase 2)
- `Política Comissão de Vendas abr/26` (PDF) — regra formal assinada
- `simulador-comissoes.xlsx` — fonte canônica da fórmula YTD
- `Consultores de Vendas Autron v2.xlsx` — 12 vendedores, cargos, hierarquia

---

## 1. Objetivo da retomada

Reabrir o projeto de Comissionamento depois de uma pausa. O MVP (cálculo individual)
está em produção e validado contra o Protheus. As duas reuniões pediram um conjunto de
ações que, em parte, já viraram o spec da Fase 2 (ainda **não construído**) e, em parte,
são pontos novos/abertos. Este documento **consolida tudo num único backlog acionável**
e separa o que depende de decisão do cliente.

> **Princípio do cliente (Silvio + Márcio):** a regra muda com frequência. O cálculo precisa
> ficar **fora do ERP** (Protheus saindo, Sankhya entrando ~jul). Tudo parametrizável, sem
> reescrever código quando o gatilho/percentual/garantido mudar de um ano para o outro.

---

## 2. Estado atual (o que já existe)

| Camada | Status | Onde |
|---|---|---|
| Schema (Cargo, Vendedor, Lançamento, Meta) | ✅ produção | `prisma/migrations/10_comissoes` |
| Motor: apuração YTD, saldo, elegibilidade | ✅ produção | `src/lib/domain/comissao/apuracao.ts` |
| Motor: comissão por linha + previsão mensal | ✅ produção | `comissao.ts` |
| Motor: janela 21→20 + grid pedidos pagos | ✅ produção | `pagamento.ts` |
| Parsers Analítico + Metas | ✅ produção | `src/lib/parsers/comissao/` |
| Upload dedicado (Analítico + Metas) | ✅ produção | `src/app/comissoes/upload` |
| Extrato por vendedor (2 grids) | ✅ produção | `src/app/comissoes/extrato` |
| Overview RH/Diretoria | ✅ produção | `src/app/comissoes/page.tsx` |
| CRUD Vendedores + Cargos | ✅ produção | `src/app/comissoes/vendedores` |
| RBAC `[ADMIN, DIRETOR, CONTROLADORIA]` + auditoria | ✅ produção | — |

**Confirmado:** Fase 2 **não** está no código. O schema não tem `supervisorCodigo` nem
campos de `garantido`; o service (`getExtratoVendedor` → `getRegraVendedor`) não agrega
carteira. Logo, hoje gestores são apurados como individuais e não há garantido.

---

## 3. Ações pedidas nas reuniões → status

Mapa de cada pedido das transcrições para o estado atual. "Specado" = descrito na Fase 2
mas ainda não codado.

| # | Ação pedida | Reunião | Status | Observação |
|---|---|---|---|---|
| A1 | Meta por EP, 1º–30/31, sazonal (12 metas/ano) | Márcio | ✅ feito | `ComissaoMeta` por mês |
| A2 | Comissão sobre Faturamento (sem IPI/ICMS-ST) | Ambas | ✅ feito | — |
| A3 | Gatilho 70% **acumulado YTD** (buffer, compensa meses) | Ambas | ✅ feito | Diverge do Protheus mensal (proposital) |
| A4 | Janela de pagamento 21→20 | Ambas | ✅ feito | — |
| A5 | % por cargo, versionado por ano | Márcio | ✅ feito | `ComissaoCargo(ano)` |
| A6 | Upload das planilhas "do jeito que vêm do Protheus" | Silvio | ✅ feito | Mapeamento tolerante de colunas |
| A7 | Extrato (RH acompanha; vendedor **não** acessa, recebe extrato) | Silvio | ✅ feito | Acesso só RH/Diretoria |
| A8 | **Carteira/hierarquia** (gestor comissiona sobre subordinados) | Ambas | ✅ feito | `getCarteiraMembros`/`getExtratoVendedor` |
| A9 | **"Pulo do gato"**: pedido emitido em mês não-habilitado **nunca paga** | Márcio | ✅ feito | `gridPedidosPagos(habilita[])` |
| A10 | **Garantido** (3–4 meses p/ recém-contratado; paga excedente) | Márcio | ✅ feito | `garantido.ts` + CRUD |
| A11 | **Tela de parametrização por vendedor** (%, gatilho, garantido, datas) | Márcio | ✅ feito | CRUD vendedor (supervisor + garantido) |
| A12 | Refino do gatilho: `ARRED(atingim.;2) ≥ 70%` (bate o simulador) | Márcio | ✅ feito | `apuracao.ts` + teste do simulador |
| A13 | Parsers lendo % por linha ("Informe o Percentual") | Márcio | ✅ feito | `analitico.ts` + coluna `comissaoPct` |
| **N1** | **Representante Autônomo**: sem gatilho, pagamento **dia 15**, **% a definir** | Márcio | ⛔ aberto | Contrato recém-fechado; falta o % (Leandro) |
| **N2** | Extrato distinguir **"Programado p/ pagar" (faturado, aguardando cliente)** de **"Pago"** | Silvio | ✅ feito | `gridProgramados` + grid no extrato |
| **N3** | Metas sazonais: só upload ou também cadastro manual? | Márcio | ✅ decidido | **Só upload** (sem mudança) |

Legenda: ✅ feito · 🟡 specado (falta codar) · ⛔ aberto (depende de dado do cliente).

> **Decisões da retomada (2026-06-18):** começar pela Fase 2 (Bloco 1 — implementado nesta
> rodada); N2 aprovado (estado "Programado p/ pagar" no extrato); N3 = metas só por upload;
> N1 (Representante Autônomo) segue fora de escopo até o % fechar com o Leandro.

---

## 4. Regras de negócio consolidadas (fonte: Política abr/26 + simulador)

Texto único e canônico, para não precisar reabrir as transcrições.

### 4.1 Elegibilidade (gatilho YTD)
```
ATINGIMENTO[m] = Σ EP[jan..m] / Σ META[jan..m]
HABILITA[m]    = gatilhoPct == 0 ? true
               : Σmeta[jan..m] > 0 AND ARRED(ATINGIMENTO[m], 2) ≥ gatilhoPct
```
- Compensação entre meses dentro do ano (jan–dez). Mês forte cobre mês fraco.
- Caiu abaixo de 70% acumulado → **não recebe naquele mês**, mesmo tendo vendido.
- **Sem pagamento retroativo** ao recuperar o acumulado depois (Política, item Gatilho).

### 4.2 "Pulo do gato" (A9) — o ponto que travou o pessoal do Sankhya
Pedido **emitido** num mês **não-habilitado** nunca gera pagamento, mesmo quando o cliente
pagar meses depois. O gate é pelo **mês de emissão** do pedido, não pela data de pagamento.

### 4.3 Percentuais por cargo (Política)
| Cargo | % s/ faturamento | Gatilho | Base |
|---|---|---|---|
| Consultor de Vendas I / II | 1,5% | 70% individual | Individual |
| Consultor Especialista de Vendas | 1,0% | 70% individual | Individual |
| Consultor de Vendas Internas | 0,5% | 70% carteira V. Internas | Carteira |
| Supervisor de Vendas | 0,75% | 70% carteira | Carteira |
| Key Account Manager | 0,5% | 70% carteira | Carteira |
| Vendas Internacionais | 1,5% | **sem gatilho** | Carteira |
| Representante Autônomo | **a definir (N1)** | **sem gatilho** | — |

### 4.4 Carteira (A8)
- "Ser carteira" é por **vendedor** (ter subordinados), não pelo cargo.
- Gestor comissiona sobre **faturamento da carteira** = ele + subordinados; gatilho 70% sobre a meta da carteira.
- **Sobreposição:** a venda do subordinado paga **2×** — comissão individual dele + comissão de carteira do gestor (D5 da Fase 2).
- Hierarquia atual (1 nível): Célio→João Vitor · Rafael→Bruno · Willian→Alexsiano+Leandro.

### 4.5 Garantido (A10)
- Recém-contratado recebe um piso mensal por N meses (geralmente 3, às vezes 4).
- A receber no mês = `max(previsão_comissão, garantido)` na janela do garantido.
- Base de comparação = **previsão por EP** (não o pago). Excedente acima do garantido é pago normalmente.

### 4.6 Pagamento
- Base: Faturamento (sem IPI/ICMS-ST), janela **21 do mês anterior → 20 do mês vigente**.
- Pago no último dia útil, junto ao salário. **Representante Autônomo: dia 15** (N1).
- Efetivação só quando o **cliente paga** — antes disso é "programado p/ pagar" (N2).

### 4.7 Validação com dados reais (2026-06-18)
Conferido contra `Comissao-Analitco.xlsx` + `Comissao-Meta.xlsx` reais (do Drive):

| Caso | Nosso motor | Protheus | Resultado |
|---|---|---|---|
| Adriano (000022) pagos 21/03–20/04 | R$ 314,69 | R$ 314,68 | ✅ bate (±1 centavo, arredondamento por linha) |
| Adriano pagos 21/04–20/05 | R$ 262,62 | R$ 262,61 | ✅ bate |
| Adriano previsão JAN | ≈ R$ 5.772,98 | R$ 5.772,98 | ✅ (previsão soma todas as linhas; EP deduplica parcela) |
| Alexsiano (000029) JAN habilita | NÃO | NÃO | ✅ |
| **Alexsiano FEV habilita** | **NÃO** (YTD 56,6%) | **SIM** | ⚠️ **diverge por design (regra YTD)** |

**Ponto de atenção para o cliente:** com a regra YTD da Política, Alexsiano **não fica elegível
em FEV** (atingimento acumulado 56,6% < 70%), enquanto o extrato Protheus (regra mensal antiga)
mostra SIM. A previsão de FEV dele (R$ 3.027,04 no Protheus) é **R$ 0** no nosso sistema. Isso é
o comportamento correto da política nova — mas precisa ser **comunicado** para não parecer erro.

**Ajustes nos parsers para o formato real (feitos nesta validação):**
- Metas: **reescrito para multi-aba** (1 aba por vendedor + aba `PARÂMETROS`; lê `CÓDIGO PROTHEUS`,
  `META MES` × JAN..DEZ, ano do cabeçalho `MMM-AAAA`). Zero-padding do código a 6 dígitos.
- Analítico: colunas reais `Data Emissão Pedido Venda` e `Classificação da Comissao` mapeadas.
- `toDecimalStr` tolera `R$` e espaços (ex.: `R$ 13.425,81` → 13425.81); `/ /` → data nula.

---

## 5. Itens abertos / decisões (o que preciso de você)

### N1 — Representante Autônomo
Contrato recém-fechado (Márcio: "preciso bater só com o Leandro qual percentual vamos
pagar — é só essa informação que falta"). Sem gatilho; pagamento dia 15.
**Preciso do percentual** para incluir. Sem ele, fica fora do escopo desta rodada (cálculo "na unha").

### N2 — Estado "Programado para pagar" no extrato
Silvio enfatizou que o extrato mostra pedidos **programados** para pagar (faturados, aguardando
o cliente), que **não é o mesmo** que pago. Hoje o grid só conta `PAGO`. Decisão: incluir uma
coluna/visão intermediária **"Faturado — aguardando pagamento do cliente"** distinta de "Pago"?

### N3 — Origem das metas sazonais
As metas são aprovadas/assinadas por ano (documento interno) e são **sazonais** (12 valores).
Hoje entram por **upload** (planilha Protheus/Sankhya). Decisão: manter só upload, ou adicionar
uma **tela de cadastro manual** das metas mês a mês (para o caso de não vir do ERP)?

---

## 6. Plano de ação (sequenciamento)

> **Status:** Bloco 1 e o item N2 implementados em `claude/wizardly-shannon-qugs4s`
> (motor + migration 11 + service + parser + CRUD + extrato; 135 testes passando, build OK).

**Bloco 1 — Implementar a Fase 2 já especificada** (desbloqueia carteira + garantido):
1. Parsers no formato real (A13) + testes.
2. Refino do gatilho `ARRED(.;2)` (A12) + fixture do simulador como teste de aceite (3.000 / 600 / 750 / 0 / 1.200 → **5.550**).
3. "Pulo do gato" — `gridPedidosPagos` recebe `habilita[]` por mês de emissão (A9) + testes.
4. Migration: `supervisorCodigo` + campos de garantido.
5. Service de carteira (agrega membros) (A8).
6. Módulo `garantido.ts` + integração (A10).
7. Seed de cargos (8) + CRUD por vendedor com garantido/supervisor (A11).
8. Telas: extrato com carteira + linhas "Garantido"/"A Receber".

**Bloco 2 — Itens novos** (após decisões da §5):
9. (N2) Coluna/visão "Programado p/ pagar" no extrato — se aprovado.
10. (N3) Tela de cadastro manual de metas sazonais — se aprovado.
11. (N1) Representante Autônomo: % + janela dia 15 — quando o % fechar.

**Bloco 3 — Aceite:**
12. Validar contra `simulador` (toy), `Comissao-Meta.xlsx` (Adriano 000022, Alexsiano 000029) e a carteira do Willian.

---

## 7. Fora de escopo (mantido da Fase 2)
- Vendas internacionais especiais / windfall — cálculo manual ("na unha"), conforme procedimento.
- Multi-nível (gestor sobre gestor) — dados atuais são árvore de profundidade 1; modelo suporta, agregação fica em 1 nível.
- Snapshot/fechamento persistido por rodada.
- Extrato self-service do vendedor (vendedor não acessa o sistema — recebe extrato exportado).

## 8. Riscos
- **YTD vs Protheus mensal:** ao conferir contra o Excel do Protheus, casos como Alexsiano/FEV divergem por desenho (regra nova). Deixar explícito na tela.
- **Layout dos arquivos:** se a extração Protheus→Sankhya mudar de formato, os parsers quebram — detecção tolerante de cabeçalhos mantida.
- **Garantido cruzando o ano:** janela do garantido pode atravessar dez→jan; só os meses do ano apurado recebem o piso.
