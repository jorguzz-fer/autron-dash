# Módulo Comissões — MVP (Apuração + Extrato) — Design

**Data:** 2026-05-21
**Branch:** `feature/comissoes`
**Status:** Aprovado (brainstorming) — pronto para o plano de execução

## 1. Contexto e objetivo

Novo módulo do autron-dash para **apurar e exibir comissões de vendedores**, substituindo o
controle manual em planilha e o cálculo do Protheus (que será descontinuado na migração
para o Sankhya). O cliente quer flexibilidade para mudar regras sem ficar amarrado ao ERP.

Fontes analisadas: transcrição da reunião com Silvio, `Politica_Comissao_revisada.docx`,
`Planilha Teste Comissões 1.xlsx`, e os relatórios do Protheus `Extrato.xlsx` / `Analitco.xlsx`
(período de pagamento 21.03–20.04.2026).

### Escopo do MVP
**Apuração + Extrato (núcleo)**: cadastro de vendedor/cargo/%/meta/gatilho + upload dedicado
(Analítico + Metas) + motor de cálculo + tela de Extrato por vendedor + visão consolidada
RH/Diretoria.

### Fora de escopo (fases futuras, explícito)
Hierarquia/carteira (supervisor/KAM) · Garantido · Exceções (windfall/bluebird/ID/ajuste
manual) · Fechamento + lote de pagamento · Extrato self-service do vendedor · Representantes
(regras próprias) · Tipos especiais de venda (ID sobre margem, internacional).

## 2. Regras de negócio (decididas)

| Regra | Decisão |
|---|---|
| Base da **meta** | Entrada de Pedido (EP), por **data de emissão** do pedido |
| Base da **comissão** | Faturamento (FAT), sem IPI/ICMS-ST |
| **Gatilho** | `Meta × gatilhoPct`. gatilhoPct vem do **cargo** (vigência anual); `0 = sem gatilho`. `vendedor.gatilhoOverride` pode sobrepor. |
| **Elegibilidade** | **Acumulado YTD**: mês `m` é elegível se `Σ EP(jan..m) ≥ Σ Gatilho(jan..m)`. Mês fraco é compensado por mês forte. (TO-BE da política; o Protheus usava mensal = AS-IS, descartado.) |
| **Saldo** | `EP(m) − Meta(m)`; **Saldo acumulado** = `Σ Saldo(jan..m)` (buffer YTD, jan–dez) |
| **% comissão** | Por cargo, vigência anual (Consultor 1,5% · Interno 0,5% · Especialista 1% · Supervisor 0,75% · KAM 0,5% · Internacional 1,5%) |
| **Janela de pagamento** | 21→20: pagamento em `d` cai na janela que começa `21/(mês−1)` se `dia ≤ 20`, senão `21/(mês)`. Ex: pago 24/03 → `21/03–20/04` |
| **Devolução** | Linha com valor negativo abate EP e comissão na soma (estorno formal = fase futura) |

## 3. Arquitetura

**Abordagem: compute-on-read** (decidida). Armazena só dados crus (Analítico, Metas, cadastros);
a apuração é calculada na renderização por um **motor de domínio puro**, espelhando o padrão das
abas atuais (`getEnrichedPedidos` → Faturamento/Prontidão). Sem tabela de apuração persistida — o
**Fechamento** (fase futura) adicionará snapshot reusando o mesmo motor, sem retrabalho.

### Estrutura de arquivos
```
src/app/comissoes/
  page.tsx                  → overview RH/Diretoria (KPIs + tabela de vendedores)
  extrato/page.tsx          → Extrato por vendedor (2 grids)
  vendedores/page.tsx       → cadastro de vendedores + cargos
  upload/page.tsx           → upload dedicado (Analítico + Metas)
  upload/actions.ts         → server actions de ingestão (deleteMany+createMany por tenant)
  vendedores/actions.ts     → CRUD cadastro (server actions)

src/lib/domain/comissao/    → MOTOR PURO (funções + testes TDD)
  types.ts
  apuracao.ts               → meta, gatilho YTD, elegibilidade, saldo
  comissao.ts               → comissão por linha + previsão mensal
  pagamento.ts              → janela 21–20, grid "pedidos pagos"
  apuracao.test.ts / comissao.test.ts / pagamento.test.ts

src/lib/services/comissao.ts   → queries Prisma (sempre filtra tenantId)
src/lib/parsers/comissao/
  analitico.ts              → parser do Analítico consolidado
  metas.ts                  → parser de Metas por vendedor
```

Sidebar ganha a seção **"Comissões"** (Extrato · Vendedores · Upload), visível só para os perfis
com acesso.

## 4. Modelos Prisma (novos)

### Cadastros
```prisma
model ComissaoCargo {
  id          String   @id @default(cuid())
  tenantId    String
  ano         Int
  cargo       String   // "Consultor I", "Supervisor", "KAM", "Internacional"...
  comissaoPct Decimal  @db.Decimal(6, 4) // 0.015 = 1,5%
  gatilhoPct  Decimal  @db.Decimal(6, 4) // 0.70 = 70%; 0 = sem gatilho
  base        String   // "INDIVIDUAL" | "COLETIVO" | "CARTEIRA"
  createdAt   DateTime @default(now())
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, ano, cargo])
}

model ComissaoVendedor {
  id              String   @id @default(cuid())
  tenantId        String
  codigoProtheus  String
  nome            String
  cargo           String   // referencia ComissaoCargo.cargo (do ano vigente)
  tipo            String   // "CLT" | "PJ" | "REPRESENTANTE"
  nivel           Int?
  gatilhoOverride Decimal? @db.Decimal(6, 4) // sobrepõe gatilho do cargo; 0 = sem gatilho
  ativo           Boolean  @default(true)
  createdAt       DateTime @default(now())
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, codigoProtheus])
}
```

### Dados carregados (snapshot — substituídos a cada upload)
```prisma
enum ComissaoClassificacao { PREVISTO FATURADO PAGO }

model ComissaoLancamento {
  id                String                @id @default(cuid())
  tenantId          String
  numeroPedido      String
  itemPedido        String?               // produto/código (para dedup de parcela)
  dataEmissao       DateTime
  codCliente        String?
  cliente           String?
  produto           String?
  quantidade        Int?
  valor             Decimal               @db.Decimal(15, 2) // sem IPI/ICMS-ST
  codVendedor       String
  tipoNegocio       String?
  dataEntrega       DateTime?
  dataVencimento    DateTime?
  dataPagamento     DateTime?
  condicaoPagamento String?
  parcela           Int?
  pctRateio         Decimal               @db.Decimal(8, 4) // 100, 33.33...
  classificacao     ComissaoClassificacao
  createdAt         DateTime              @default(now())
  tenant            Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId, codVendedor, dataEmissao])
  @@index([tenantId, classificacao])
  @@index([tenantId, dataPagamento])
}

model ComissaoMeta {
  id          String   @id @default(cuid())
  tenantId    String
  codVendedor String
  ano         Int
  mes         Int      // 1-12
  valorMeta   Decimal  @db.Decimal(15, 2)
  createdAt   DateTime @default(now())
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, codVendedor, ano, mes])
}
```

### Ingestão
Reusa `DataUpload`. Adiciona dois valores ao enum `Dataset`: `COMISSAO_ANALITICO` e
`COMISSAO_META`. Mesmo padrão `deleteMany` + `createMany` por tenant (substituição total a cada
upload). Adicionar a relação inversa `comissao*` em `Tenant` para os novos modelos.

**Migration:** uma migration nova (`N_comissoes`) com os 4 modelos + enum
`ComissaoClassificacao` + os 2 valores no enum `Dataset`.

## 5. Motor de cálculo (`src/lib/domain/comissao/`)

Funções puras (entrada = arrays de lançamentos/metas + cargo; saída = estrutura de apuração),
testadas com TDD.

### `apuracao.ts` — grid mensal por vendedor/ano
Para cada mês `m` (1–12):
- `meta(m)` = `ComissaoMeta(vend, ano, m).valorMeta` (0 se ausente)
- `gatilhoPctEfetivo` = `vendedor.gatilhoOverride ?? cargo.gatilhoPct`
- `gatilho(m)` = `meta(m) × gatilhoPctEfetivo`
- `ep(m)` = `Σ valor` dos lançamentos do vendedor com `dataEmissao` no mês `m`, **contando cada
  pedido-item uma vez** (dedup por `numeroPedido + itemPedido` para não multiplicar por parcela)
- `saldo(m)` = `ep(m) − meta(m)`; `saldoAcumulado(m)` = `Σ saldo(jan..m)`
- `habilita(m)` = `gatilhoPctEfetivo === 0 ? true : Σ ep(jan..m) ≥ Σ gatilho(jan..m)`
- `previsao(m)` = `habilita(m) ? Σ (valor_linha × cargo.comissaoPct) das linhas do mês : 0`

### `comissao.ts` — comissão por linha
`comissao_linha = valor × cargo.comissaoPct`. O módulo **recalcula** (ignora a coluna
"Comissão Calculada" do Protheus). % linear por cargo no MVP.

### `pagamento.ts` — grid "Pedidos Pagos"
Só linhas `classificacao = PAGO` com `dataPagamento`:
- `janela(d)` = início `21/(mês−1)` se `dia ≤ 20`, senão `21/(mês)`
- Grid = **janela de pagamento × mês de origem** (emissão); valor da célula =
  `Σ comissao_linha × (pctRateio/100)` (cada parcela libera sua proporção quando o título é baixado)

### Validação como critério de aceite
Dois pontos têm ambiguidade nos dados de exemplo: (a) dedup de parcela no EP; (b) se a comissão
por parcela é proporcional ao `pctRateio`. **Em vez de adivinhar**, o primeiro teste de aceite do
motor é **reproduzir os números do Extrato do Protheus**:
- Adriano Correa de Matos (cód 000022): previsão JAN ≈ **R$ 5.772,98**; pagos janela 21/03–20/04
  (mês origem JAN) ≈ **R$ 314,68**; janela 21/04–20/05 ≈ **R$ 262,61**.
- Alexsiano Porfirio (cód 000029): previsão FEV ≈ **R$ 3.027,04**; habilita JAN = NÃO, FEV = SIM.

As planilhas viram **fixtures de teste**. Qualquer regra que não reproduza esses totais é corrigida
contra esse ground-truth.

## 6. Telas

1. **`/comissoes`** — overview RH/Diretoria: KPIs (total previsão do ano, total pago no período,
   nº vendedores elegíveis) + tabela de todos os vendedores (meta YTD, EP YTD, atingimento,
   habilita?, previsão). Ponto de entrada da seção.
2. **`/comissoes/extrato`** — seletor vendedor + ano → **Grid 1 Apuração**
   (Meta/Gatilho/EP/Habilita/Saldo/Saldo Acum/Previsão × 12 meses + Total) + **Grid 2 Pedidos Pagos**
   (janela 21–20 × mês origem). Botões **Exportar CSV** + **Imprimir** (reusa `PrintButton` +
   `#print-area`). Espelha o layout do Extrato do Protheus.
3. **`/comissoes/vendedores`** — CRUD de **Vendedores** + CRUD de **Cargos** (versionado por ano).
   Padrão de UI do `/admin/usuarios` (tabela + form modal, server actions).
4. **`/comissoes/upload`** — 2 dropzones (Analítico, Metas) + histórico (reusa `DataUpload`) +
   warnings do parser (linhas puladas, lançamento de vendedor sem cadastro).

Valores em formato BR (`fmtCurrency`). Tabelas com header sticky (`DataTable`).

## 7. Acesso / RBAC

Gate em **`[ADMIN, DIRETOR, CONTROLADORIA]`** — reusa a role `CONTROLADORIA` existente como o
perfil de RH/back-office (sem mudança de schema). Guard in-page (padrão `/admin/usuarios`:
checa role e renderiza "Acesso restrito" se não autorizado). Sidebar mostra "Comissões" só para
esses perfis.

## 8. Auditoria (ISO 9001)

`logAudit` em:
- Uploads: `comissao.analitico.upload`, `comissao.meta.upload` (entity `Comissao`, meta com
  filename + rowCount)
- Cadastro: `comissao.vendedor.create/update`, `comissao.cargo.create/update`

Aparece no `/admin/logs` existente.

## 9. Parsers

- **`analitico.ts`** — lê a planilha consolidada (header na linha 1). Colunas mapeadas (tolerante a
  variações via `normalizeHeader`/`findCol`): Número do Pedido, Data Emissão, Nome do Cliente
  (split código/nome), Produto, Quantidade, "Valor c/ Var. Cambial", Nome do Vendedor (split
  código/nome), Data da Entrega, Tipo Negócio, Data de Vencimento, Data Pagamento, Condição,
  Parcela, % Rateio, Classificação (→ enum). Ignora a coluna "Comissão Calculada".
- **`metas.ts`** — Meta mensal por vendedor. Formato a confirmar no 1º upload real (provável:
  vendedor × 12 colunas de mês, como a "Planilha Teste"); o parser normaliza para linhas
  `(codVendedor, ano, mes, valorMeta)`.

## 10. Critérios de sucesso (MVP)

1. Upload do Analítico + Metas substitui os dados do tenant sem erro.
2. Cadastro de vendedores e cargos funcional (CRUD), versionado por ano.
3. Extrato de Adriano e Alexsiano reproduz os números do Protheus (seção 5).
4. Gatilho YTD acumulado correto (Alexsiano: JAN não habilita, FEV habilita no mensal mas o
   módulo usa YTD — validar o comportamento YTD esperado com os dados reais).
5. Grid "Pedidos Pagos" agrupa corretamente por janela 21–20.
6. Acesso restrito a `[ADMIN, DIRETOR, CONTROLADORIA]`.
7. Uploads e cadastros auditados em `/admin/logs`.
8. Build limpo, testes do motor passando, deploy no Coolify.

## 11. Roadmap pós-MVP (fases futuras)

- **Fase 2 — Hierarquia/carteira**: supervisor/KAM comissionam sobre subordinados.
- **Fase 3 — Garantido**: cadastro com vigência + valor; `max(comissão, garantido)`.
- **Fase 4 — Exceções**: ajustes manuais, windfall/bluebird, ID sobre margem, internacional.
- **Fase 5 — Fechamento**: snapshot persistido por rodada (Documento/Versão de referência),
  lote de pagamento PJ/CLT.
- **Fase 6 — Self-service**: extrato do vendedor + visão do supervisor (RBAC fino,
  mapeamento usuário↔vendedor).
- **Representantes**: período mês-cheio, pagamento dia 15, sem gatilho (regras próprias).
