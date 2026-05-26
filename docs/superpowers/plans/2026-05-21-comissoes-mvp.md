# Módulo Comissões (MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o MVP do módulo Comissões (Apuração + Extrato) no autron-dash: cadastros, upload dedicado, motor de cálculo puro e telas, reproduzindo os números do Extrato do Protheus.

**Architecture:** Compute-on-read. Dados crus (Analítico, Metas, cadastros) em Prisma; apuração calculada na renderização por um motor de domínio puro em `src/lib/domain/comissao/`. Upload dedicado reusa o pipeline `processUpload`/`replaceDataset`. Telas seguem os padrões existentes (`DataTable`, `KPICard`, server actions à la `/admin/usuarios`).

**Tech Stack:** Next.js 15 (App Router, RSC) · Prisma 6 · Auth.js v5 · Vitest · TypeScript strict · Tailwind 4 · ExcelJS (parsers).

**Spec:** `docs/superpowers/specs/2026-05-21-comissoes-mvp-design.md` (branch `feature/comissoes`, commit `a1580a6`)

**Branch:** trabalhar em `feature/comissoes` (já criado). Commits + push após cada task.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` (M) | 4 models + enum `ComissaoClassificacao` + 2 valores no enum `Dataset` + relações em `Tenant` |
| `prisma/migrations/8_comissoes/migration.sql` (C) | DDL dos models + enums |
| `src/lib/domain/comissao/types.ts` (C) | Tipos do domínio (entrada/saída do motor) |
| `src/lib/domain/comissao/apuracao.ts` (C) | Meta, gatilho YTD, EP (dedup), saldo, elegibilidade |
| `src/lib/domain/comissao/comissao.ts` (C) | Comissão por linha + previsão mensal |
| `src/lib/domain/comissao/pagamento.ts` (C) | Janela 21–20, grid "pedidos pagos" |
| `src/lib/domain/comissao/*.test.ts` (C) | Testes TDD do motor |
| `src/lib/parsers/comissao/analitico.ts` (C) | Parser do Analítico consolidado |
| `src/lib/parsers/comissao/metas.ts` (C) | Parser de Metas por vendedor |
| `src/lib/parsers/comissao/*.test.ts` (C) | Testes dos parsers |
| `src/lib/parsers/index.ts` (M) | Registrar parsers no `PARSERS`/labels/accepts |
| `src/lib/uploads.ts` (M) | Cases `COMISSAO_ANALITICO`/`COMISSAO_META` no `replaceDataset` |
| `src/lib/services/comissao.ts` (C) | Queries Prisma tenant-scoped + CRUD cadastro |
| `src/app/comissoes/page.tsx` (C) | Overview RH/Diretoria |
| `src/app/comissoes/extrato/page.tsx` (C) | Extrato por vendedor (2 grids) |
| `src/app/comissoes/extrato/export/route.ts` (C) | CSV do extrato |
| `src/app/comissoes/vendedores/page.tsx` (C) | Cadastro vendedores + cargos |
| `src/app/comissoes/vendedores/actions.ts` (C) | Server actions CRUD |
| `src/app/comissoes/vendedores/*Btn.tsx` / `*Form.tsx` (C) | Client components de form |
| `src/app/comissoes/upload/page.tsx` (C) | Upload dedicado (2 datasets) + histórico |
| `src/components/Layout/Sidebar.tsx` (M) | Seção "Comissões" gated |

---

## Phase 1 — Data layer

### Task 1: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/8_comissoes/migration.sql`

- [ ] **Step 1: Adicionar os 2 valores ao enum `Dataset`**

No `enum Dataset { ... }` existente, adicionar ao final:
```prisma
  COMISSAO_ANALITICO
  COMISSAO_META
```

- [ ] **Step 2: Adicionar o enum novo + 4 models** (ao final do schema, antes de nenhum fechamento global)

```prisma
enum ComissaoClassificacao {
  PREVISTO
  FATURADO
  PAGO
}

model ComissaoCargo {
  id          String   @id @default(cuid())
  tenantId    String
  ano         Int
  cargo       String
  comissaoPct Decimal  @db.Decimal(6, 4)
  gatilhoPct  Decimal  @db.Decimal(6, 4)
  base        String   // "INDIVIDUAL" | "COLETIVO" | "CARTEIRA"
  createdAt   DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, ano, cargo])
}

model ComissaoVendedor {
  id              String   @id @default(cuid())
  tenantId        String
  codigoProtheus  String
  nome            String
  cargo           String
  tipo            String   // "CLT" | "PJ" | "REPRESENTANTE"
  nivel           Int?
  gatilhoOverride Decimal? @db.Decimal(6, 4)
  ativo           Boolean  @default(true)
  createdAt       DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, codigoProtheus])
}

model ComissaoLancamento {
  id                String                @id @default(cuid())
  tenantId          String
  numeroPedido      String
  itemPedido        String?
  dataEmissao       DateTime
  codCliente        String?
  cliente           String?
  produto           String?
  quantidade        Int?
  valor             Decimal               @db.Decimal(15, 2)
  codVendedor       String
  tipoNegocio       String?
  dataEntrega       DateTime?
  dataVencimento    DateTime?
  dataPagamento     DateTime?
  condicaoPagamento String?
  parcela           Int?
  pctRateio         Decimal               @db.Decimal(8, 4)
  classificacao     ComissaoClassificacao
  createdAt         DateTime              @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, codVendedor, dataEmissao])
  @@index([tenantId, classificacao])
  @@index([tenantId, dataPagamento])
}

model ComissaoMeta {
  id          String   @id @default(cuid())
  tenantId    String
  codVendedor String
  ano         Int
  mes         Int
  valorMeta   Decimal  @db.Decimal(15, 2)
  createdAt   DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, codVendedor, ano, mes])
}
```

- [ ] **Step 3: Adicionar relações inversas no model `Tenant`**

Dentro de `model Tenant { ... }`, junto às outras relações (`pedidos Pedido[]` etc.), adicionar:
```prisma
  comissaoCargos      ComissaoCargo[]
  comissaoVendedores  ComissaoVendedor[]
  comissaoLancamentos ComissaoLancamento[]
  comissaoMetas       ComissaoMeta[]
```

- [ ] **Step 4: Gerar o SQL da migration**

Olhe uma migration existente pra confirmar o estilo (ex: `prisma/migrations/8_faturamento_drop_unique/migration.sql`). Como já existe uma pasta `8_faturamento_drop_unique`, **use o número 9**: crie `prisma/migrations/9_comissoes/migration.sql`. (Ajuste o caminho do File acima de `8_comissoes` para `9_comissoes`.)

Conteúdo (Postgres):
```sql
-- Enum de classificação de lançamento de comissão
CREATE TYPE "ComissaoClassificacao" AS ENUM ('PREVISTO', 'FATURADO', 'PAGO');

-- Novos valores no enum Dataset
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'COMISSAO_ANALITICO';
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'COMISSAO_META';

CREATE TABLE "ComissaoCargo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "cargo" TEXT NOT NULL,
  "comissaoPct" DECIMAL(6,4) NOT NULL,
  "gatilhoPct" DECIMAL(6,4) NOT NULL,
  "base" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoCargo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComissaoCargo_tenantId_ano_cargo_key" ON "ComissaoCargo"("tenantId", "ano", "cargo");

CREATE TABLE "ComissaoVendedor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigoProtheus" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "cargo" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "nivel" INTEGER,
  "gatilhoOverride" DECIMAL(6,4),
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoVendedor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComissaoVendedor_tenantId_codigoProtheus_key" ON "ComissaoVendedor"("tenantId", "codigoProtheus");

CREATE TABLE "ComissaoLancamento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "numeroPedido" TEXT NOT NULL,
  "itemPedido" TEXT,
  "dataEmissao" TIMESTAMP(3) NOT NULL,
  "codCliente" TEXT,
  "cliente" TEXT,
  "produto" TEXT,
  "quantidade" INTEGER,
  "valor" DECIMAL(15,2) NOT NULL,
  "codVendedor" TEXT NOT NULL,
  "tipoNegocio" TEXT,
  "dataEntrega" TIMESTAMP(3),
  "dataVencimento" TIMESTAMP(3),
  "dataPagamento" TIMESTAMP(3),
  "condicaoPagamento" TEXT,
  "parcela" INTEGER,
  "pctRateio" DECIMAL(8,4) NOT NULL,
  "classificacao" "ComissaoClassificacao" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoLancamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ComissaoLancamento_tenantId_codVendedor_dataEmissao_idx" ON "ComissaoLancamento"("tenantId", "codVendedor", "dataEmissao");
CREATE INDEX "ComissaoLancamento_tenantId_classificacao_idx" ON "ComissaoLancamento"("tenantId", "classificacao");
CREATE INDEX "ComissaoLancamento_tenantId_dataPagamento_idx" ON "ComissaoLancamento"("tenantId", "dataPagamento");

CREATE TABLE "ComissaoMeta" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codVendedor" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "valorMeta" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComissaoMeta_tenantId_codVendedor_ano_mes_key" ON "ComissaoMeta"("tenantId", "codVendedor", "ano", "mes");

ALTER TABLE "ComissaoCargo" ADD CONSTRAINT "ComissaoCargo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComissaoVendedor" ADD CONSTRAINT "ComissaoVendedor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComissaoLancamento" ADD CONSTRAINT "ComissaoLancamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComissaoMeta" ADD CONSTRAINT "ComissaoMeta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> ⚠️ Nota Postgres: `ALTER TYPE ... ADD VALUE` não pode rodar dentro do mesmo bloco transacional que usa o valor novo. O runner de migration do projeto (`scripts/run-migrations.js`) executa statement-a-statement; como aqui os novos valores do enum `Dataset` só são USADOS em runtime (não nesta migration), está OK.

- [ ] **Step 5: Regenerar o Prisma Client e validar tipos**

```bash
cd /Users/fernandojorge/Desktop/Projetos/apps/autron-dash
npx prisma generate
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "Comissao|error TS" | head
```
Expected: `npx prisma generate` OK; sem erros TS referentes a Comissao (erros pré-existentes de outros arquivos podem aparecer; ignore os não-Comissao).

- [ ] **Step 6: Commit + push**

```bash
git add prisma/schema.prisma prisma/migrations/9_comissoes/migration.sql
git commit -m "feat(comissoes): modelos Prisma + migration (cargos, vendedores, lancamentos, metas)"
git push
```

---

## Phase 2 — Motor de cálculo (TDD, puro)

### Task 2: Tipos do domínio

**Files:**
- Create: `src/lib/domain/comissao/types.ts`

- [ ] **Step 1: Criar os tipos**

```typescript
// src/lib/domain/comissao/types.ts

export type Classificacao = "PREVISTO" | "FATURADO" | "PAGO";

/** Linha do Analítico (já convertida de Decimal para number). */
export interface LancamentoInput {
  numeroPedido: string;
  itemPedido: string | null;
  dataEmissao: Date;
  valor: number;
  codVendedor: string;
  dataPagamento: Date | null;
  parcela: number | null;
  pctRateio: number; // 100, 33.33...
  classificacao: Classificacao;
}

export interface MetaInput {
  codVendedor: string;
  ano: number;
  mes: number; // 1-12
  valorMeta: number;
}

/** Parâmetros de comissão/gatilho efetivos para um vendedor. */
export interface RegraVendedor {
  comissaoPct: number; // 0.015
  gatilhoPct: number;  // 0.70; 0 = sem gatilho
}

export interface MesApuracao {
  mes: number;          // 1-12
  meta: number;
  gatilho: number;
  ep: number;
  saldo: number;
  saldoAcumulado: number;
  habilita: boolean;
  previsao: number;
}

export type ApuracaoAno = MesApuracao[]; // length 12, index 0 = janeiro
```

- [ ] **Step 2: Verificar TS**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "comissao/types" | head
```
Expected: sem saída.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/domain/comissao/types.ts
git commit -m "feat(comissoes): tipos do motor de comissao"
git push
```

### Task 3: Apuração (meta, gatilho YTD, EP dedup, saldo, elegibilidade)

**Files:**
- Create: `src/lib/domain/comissao/apuracao.test.ts`
- Create: `src/lib/domain/comissao/apuracao.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// src/lib/domain/comissao/apuracao.test.ts
import { describe, it, expect } from "vitest";
import { apurarAno } from "./apuracao";
import type { LancamentoInput, MetaInput, RegraVendedor } from "./types";

const VEND = "000022";
const regra: RegraVendedor = { comissaoPct: 0.015, gatilhoPct: 0.7 };

function meta(mes: number, valorMeta: number): MetaInput {
  return { codVendedor: VEND, ano: 2026, mes, valorMeta };
}
function lanc(mes: number, valor: number, pedido: string, item = "A", parcela: number | null = null, pctRateio = 100): LancamentoInput {
  return {
    numeroPedido: pedido,
    itemPedido: item,
    dataEmissao: new Date(2026, mes - 1, 10),
    valor,
    codVendedor: VEND,
    dataPagamento: null,
    parcela,
    pctRateio,
    classificacao: "PREVISTO",
  };
}

describe("apurarAno", () => {
  it("calcula EP somando pedidos do mês (deduplicando parcelas)", () => {
    // pedido 1 com 2 parcelas (mesmo pedido+item) deve contar uma vez
    const lancs = [
      lanc(1, 1000, "P1", "A", 1, 50),
      lanc(1, 1000, "P1", "A", 2, 50),
      lanc(1, 500, "P2", "A"),
    ];
    const ap = apurarAno(lancs, [meta(1, 1000)], regra, 2026);
    expect(ap[0].ep).toBe(1500); // 1000 (P1, uma vez) + 500 (P2)
  });

  it("gatilho = meta * gatilhoPct e saldo = ep - meta", () => {
    const ap = apurarAno([lanc(1, 1200, "P1")], [meta(1, 1000)], regra, 2026);
    expect(ap[0].gatilho).toBeCloseTo(700);
    expect(ap[0].saldo).toBe(200);
  });

  it("elegibilidade acumulada YTD: mês fraco compensado por mês forte", () => {
    // JAN EP 2000 (meta 1000) sobra; FEV EP 100 (meta 1000) fraco.
    // YTD FEV: EP 2100 >= gatilho YTD 1400 (0.7*(1000+1000)) -> habilita
    const lancs = [lanc(1, 2000, "P1"), lanc(2, 100, "P2")];
    const metas = [meta(1, 1000), meta(2, 1000)];
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[0].habilita).toBe(true);
    expect(ap[1].habilita).toBe(true);
  });

  it("perde elegibilidade quando acumulado YTD cai abaixo do gatilho", () => {
    // JAN EP 800 (meta 1000), gatilho 700 -> YTD 800>=700 habilita
    // FEV EP 100 -> YTD EP 900 < gatilho YTD 1400 -> NÃO habilita
    const lancs = [lanc(1, 800, "P1"), lanc(2, 100, "P2")];
    const metas = [meta(1, 1000), meta(2, 1000)];
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[0].habilita).toBe(true);
    expect(ap[1].habilita).toBe(false);
  });

  it("gatilhoPct = 0 sempre habilita", () => {
    const semGatilho: RegraVendedor = { comissaoPct: 0.015, gatilhoPct: 0 };
    const ap = apurarAno([lanc(1, 1, "P1")], [meta(1, 1_000_000)], semGatilho, 2026);
    expect(ap[0].habilita).toBe(true);
  });

  it("saldo acumulado é YTD", () => {
    const lancs = [lanc(1, 1200, "P1"), lanc(2, 900, "P2")];
    const metas = [meta(1, 1000), meta(2, 1000)];
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[0].saldoAcumulado).toBe(200);   // +200
    expect(ap[1].saldoAcumulado).toBe(100);   // +200 -100
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npx vitest run src/lib/domain/comissao/apuracao.test.ts
```
Expected: erro `Cannot find module './apuracao'`.

- [ ] **Step 3: Implementar `apuracao.ts`**

```typescript
// src/lib/domain/comissao/apuracao.ts
import type { LancamentoInput, MetaInput, RegraVendedor, ApuracaoAno, MesApuracao } from "./types";

/**
 * Apura o ano (12 meses) de um vendedor.
 * - EP do mês = soma do valor dos pedidos com dataEmissao no mês, deduplicando
 *   parcelas (mesma numeroPedido+itemPedido conta uma vez, valor do pedido).
 * - gatilho = meta * gatilhoPct; saldo = ep - meta.
 * - habilita (elegibilidade) = acumulado YTD: Σ ep(jan..m) >= Σ gatilho(jan..m).
 *   gatilhoPct === 0 => sempre habilita.
 * - previsao calculada em comissao.ts (aqui fica 0; preenchida na composição).
 */
export function apurarAno(
  lancamentos: LancamentoInput[],
  metas: MetaInput[],
  regra: RegraVendedor,
  ano: number,
): ApuracaoAno {
  // EP por mês com dedup de parcela (numeroPedido|itemPedido)
  const epPorMes = new Array<number>(12).fill(0);
  const vistosPorMes: Array<Set<string>> = Array.from({ length: 12 }, () => new Set());
  for (const l of lancamentos) {
    if (l.dataEmissao.getFullYear() !== ano) continue;
    const m = l.dataEmissao.getMonth(); // 0-11
    const chave = `${l.numeroPedido}|${l.itemPedido ?? ""}`;
    if (vistosPorMes[m].has(chave)) continue;
    vistosPorMes[m].add(chave);
    epPorMes[m] += l.valor;
  }

  const metaPorMes = new Array<number>(12).fill(0);
  for (const meta of metas) {
    if (meta.ano !== ano) continue;
    if (meta.mes >= 1 && meta.mes <= 12) metaPorMes[meta.mes - 1] += meta.valorMeta;
  }

  const result: MesApuracao[] = [];
  let epAcum = 0;
  let gatilhoAcum = 0;
  let saldoAcum = 0;
  for (let i = 0; i < 12; i++) {
    const meta = metaPorMes[i];
    const ep = epPorMes[i];
    const gatilho = meta * regra.gatilhoPct;
    const saldo = ep - meta;
    epAcum += ep;
    gatilhoAcum += gatilho;
    saldoAcum += saldo;
    const habilita = regra.gatilhoPct === 0 ? true : epAcum >= gatilhoAcum;
    result.push({
      mes: i + 1,
      meta,
      gatilho,
      ep,
      saldo,
      saldoAcumulado: saldoAcum,
      habilita,
      previsao: 0,
    });
  }
  return result;
}
```

- [ ] **Step 4: Rodar e confirmar PASSA**

```bash
npx vitest run src/lib/domain/comissao/apuracao.test.ts
```
Expected: 6 testes ✅.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/domain/comissao/apuracao.ts src/lib/domain/comissao/apuracao.test.ts
git commit -m "feat(comissoes): motor de apuracao (EP dedup, gatilho YTD, saldo) + testes"
git push
```

### Task 4: Comissão por linha + previsão mensal

**Files:**
- Create: `src/lib/domain/comissao/comissao.test.ts`
- Create: `src/lib/domain/comissao/comissao.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// src/lib/domain/comissao/comissao.test.ts
import { describe, it, expect } from "vitest";
import { comissaoLinha, previsaoMensal } from "./comissao";
import type { LancamentoInput } from "./types";

function lanc(mes: number, valor: number, pedido: string): LancamentoInput {
  return {
    numeroPedido: pedido,
    itemPedido: "A",
    dataEmissao: new Date(2026, mes - 1, 10),
    valor,
    codVendedor: "000022",
    dataPagamento: null,
    parcela: null,
    pctRateio: 100,
    classificacao: "PREVISTO",
  };
}

describe("comissaoLinha", () => {
  it("comissao = valor * pct", () => {
    expect(comissaoLinha(13425.81, 0.01)).toBeCloseTo(134.2581, 4);
  });
});

describe("previsaoMensal", () => {
  it("soma comissao das linhas do mês quando habilitado", () => {
    const lancs = [lanc(1, 10000, "P1"), lanc(1, 5000, "P2"), lanc(2, 1000, "P3")];
    const habilita = [true, false, false, false, false, false, false, false, false, false, false, false];
    const prev = previsaoMensal(lancs, 0.015, habilita, 2026);
    expect(prev[0]).toBeCloseTo(225, 6); // (10000+5000)*0.015
    expect(prev[1]).toBe(0);             // fev não habilitado
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npx vitest run src/lib/domain/comissao/comissao.test.ts
```
Expected: `Cannot find module './comissao'`.

- [ ] **Step 3: Implementar `comissao.ts`**

```typescript
// src/lib/domain/comissao/comissao.ts
import type { LancamentoInput } from "./types";

/** Comissão de uma linha = valor * percentual do cargo. */
export function comissaoLinha(valor: number, comissaoPct: number): number {
  return valor * comissaoPct;
}

/**
 * Previsão de comissão por mês (1-12).
 * Soma a comissão (valor*pct) das linhas com dataEmissao no mês — mas só se
 * `habilita[mes-1]` for true. `habilita` vem da apuração (elegibilidade YTD).
 */
export function previsaoMensal(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
  habilita: boolean[],
  ano: number,
): number[] {
  const prev = new Array<number>(12).fill(0);
  for (const l of lancamentos) {
    if (l.dataEmissao.getFullYear() !== ano) continue;
    const m = l.dataEmissao.getMonth();
    prev[m] += comissaoLinha(l.valor, comissaoPct);
  }
  return prev.map((v, i) => (habilita[i] ? v : 0));
}
```

- [ ] **Step 4: Rodar e confirmar PASSA**

```bash
npx vitest run src/lib/domain/comissao/comissao.test.ts
```
Expected: 2 testes ✅.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/domain/comissao/comissao.ts src/lib/domain/comissao/comissao.test.ts
git commit -m "feat(comissoes): comissao por linha + previsao mensal + testes"
git push
```

### Task 5: Janela de pagamento 21–20 + grid "pedidos pagos"

**Files:**
- Create: `src/lib/domain/comissao/pagamento.test.ts`
- Create: `src/lib/domain/comissao/pagamento.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// src/lib/domain/comissao/pagamento.test.ts
import { describe, it, expect } from "vitest";
import { janelaPagamento, gridPedidosPagos } from "./pagamento";
import type { LancamentoInput } from "./types";

describe("janelaPagamento", () => {
  it("dia <= 20 cai na janela que começa 21 do mês anterior", () => {
    // 19/03 -> janela 21/02-20/03 -> rotulada pelo fim: 2026-03
    expect(janelaPagamento(new Date(2026, 2, 19))).toBe("2026-03");
  });
  it("dia >= 21 cai na janela que começa 21 do mês corrente", () => {
    // 24/03 -> janela 21/03-20/04 -> rotulada pelo fim: 2026-04
    expect(janelaPagamento(new Date(2026, 2, 24))).toBe("2026-04");
  });
  it("dia 20 ainda é do fechamento do mês corrente", () => {
    // 20/04 -> janela 21/03-20/04 -> 2026-04
    expect(janelaPagamento(new Date(2026, 3, 20))).toBe("2026-04");
  });
});

describe("gridPedidosPagos", () => {
  it("agrupa comissão paga por janela x mês origem, proporcional ao rateio", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 10000, codVendedor: "V", dataPagamento: new Date(2026, 2, 24), parcela: 1, pctRateio: 100, classificacao: "PAGO" },
      // Não pago (FATURADO) — ignorado
      { numeroPedido: "P2", itemPedido: "A", dataEmissao: new Date(2026, 0, 12), valor: 5000, codVendedor: "V", dataPagamento: null, parcela: 1, pctRateio: 100, classificacao: "FATURADO" },
    ];
    const grid = gridPedidosPagos(lancs, 0.015);
    // P1: comissao 10000*0.015=150, rateio 100% -> 150 na janela 2026-04, origem jan(0)
    expect(grid.get("2026-04")?.[0]).toBeCloseTo(150, 6);
    // P2 não pago -> não aparece
    expect(grid.get("2026-04")?.[0]).toBeCloseTo(150, 6);
  });

  it("parcela paga libera proporção do rateio", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 30000, codVendedor: "V", dataPagamento: new Date(2026, 3, 22), parcela: 1, pctRateio: 33.33, classificacao: "PAGO" },
    ];
    const grid = gridPedidosPagos(lancs, 0.005);
    // comissao linha = 30000*0.005=150; * 33.33% = 49.995
    expect(grid.get("2026-05")?.[0]).toBeCloseTo(49.995, 3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npx vitest run src/lib/domain/comissao/pagamento.test.ts
```
Expected: `Cannot find module './pagamento'`.

- [ ] **Step 3: Implementar `pagamento.ts`**

```typescript
// src/lib/domain/comissao/pagamento.ts
import type { LancamentoInput } from "./types";
import { comissaoLinha } from "./comissao";

/**
 * Janela de pagamento 21->20. Retorna a chave "YYYY-MM" do MÊS DE FECHAMENTO
 * (o mês cujo dia 20 encerra a janela). Pagamento com dia<=20 fecha no próprio
 * mês; dia>=21 fecha no mês seguinte.
 */
export function janelaPagamento(d: Date): string {
  const ano = d.getFullYear();
  const mes = d.getMonth(); // 0-11
  // dia >= 21 -> fecha no mês seguinte; dia <= 20 -> fecha no mês corrente
  const fechamento = d.getDate() >= 21 ? mes + 1 : mes;
  const dt = new Date(ano, fechamento, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Grid de comissão PAGA: Map<janela "YYYY-MM", number[12]> onde o array é
 * indexado pelo mês de ORIGEM (emissão, 0=jan). Valor = comissaoLinha *
 * (pctRateio/100). Só linhas classificacao === "PAGO" com dataPagamento.
 */
export function gridPedidosPagos(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (const l of lancamentos) {
    if (l.classificacao !== "PAGO" || !l.dataPagamento) continue;
    const janela = janelaPagamento(l.dataPagamento);
    const origem = l.dataEmissao.getMonth(); // 0-11
    const valorPago = comissaoLinha(l.valor, comissaoPct) * (l.pctRateio / 100);
    if (!grid.has(janela)) grid.set(janela, new Array<number>(12).fill(0));
    grid.get(janela)![origem] += valorPago;
  }
  return grid;
}
```

- [ ] **Step 4: Rodar e confirmar PASSA**

```bash
npx vitest run src/lib/domain/comissao/pagamento.test.ts
```
Expected: testes ✅.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/domain/comissao/pagamento.ts src/lib/domain/comissao/pagamento.test.ts
git commit -m "feat(comissoes): janela 21-20 + grid de pedidos pagos + testes"
git push
```

---

## Phase 3 — Parsers (TDD)

### Task 6: Parser do Analítico

**Files:**
- Create: `src/lib/parsers/comissao/analitico.ts`
- Create: `src/lib/parsers/comissao/analitico.test.ts`

**Contexto:** Olhe `src/lib/parsers/faturamento.ts` para os helpers (`readExcelWorkbook`, `buildHeaderIndex`, `findCol`, `toCleanString`, `toDate`, `toInt`, `toDecimalStr`, `normalizeHeader`) e o tipo `ParseResult<T>`. O Analítico tem header na linha 1. Colunas (com variações toleradas):
`Número do Pedido`, `Data Emissão Pedido`, `Nome do Cliente` (formato "C009584 - CSN MI" → split código/nome no " - "), `Informe o Nome do produto` (idem split), `Quantidade do Pedido`, `Valor c/ Var. Cambial`, `Nome do Vendedor` ("000022 - ADRIANO" → split), `Data da Entrega`, `Tipo Negocio`, `Data de Vencimento`, `Data Pagamento do título`, `Condicao de Pagamento`, `Parcela do Titulo`, `% Rateio Pg`, `Classificação` (valores "Previsto"/"Faturado"/"Pago" → enum maiúsculo). Ignorar `Comissão Calculada`.

- [ ] **Step 1: Escrever o teste do parser**

```typescript
// src/lib/parsers/comissao/analitico.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseAnaliticoComissao } from "./analitico";

async function makeXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha1");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADER = [
  "Número do Pedido", "Data Emissão Pedido", "Nome do Cliente", "Informe o Nome do produto",
  "Quantidade do Pedido", "Valor c/ Var. Cambial", "Nome do Vendedor", "Data da Entrega",
  "Tipo Negocio", "Data de Vencimento", "Data Pagamento do título", "Condicao de Pagamento",
  "Parcela do Titulo", "% Rateio Pg", "Classificação", "Informe o Percentual", "Comissão Calculada",
];

describe("parseAnaliticoComissao", () => {
  it("mapeia colunas e split de código do vendedor/cliente", async () => {
    const buf = await makeXlsx([
      HEADER,
      ["21035", "08/01/2026", "C009584 - CSN MI", "A102400.025 - PLACA", 2, "13.425,81",
       "000022 - ADRIANO", "10/03/2026", "F - Cons.Final", "20/05/2026", "", "CONDICAO LIVRE",
       "", 100, "Faturado", 1, "134,25"],
    ]);
    const r = await parseAnaliticoComissao(buf);
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    expect(row.numeroPedido).toBe("21035");
    expect(row.codVendedor).toBe("000022");
    expect(row.codCliente).toBe("C009584");
    expect(row.valor).toBe("13425.81");
    expect(row.classificacao).toBe("FATURADO");
    expect(row.pctRateio).toBe("100");
    expect(row.dataPagamento).toBeNull();
  });

  it("mapeia classificação Pago e data de pagamento", async () => {
    const buf = await makeXlsx([
      HEADER,
      ["21049", "13/01/2026", "C000014 - APERAM", "A301205.392 - KIT", 12, "2.192,28",
       "000029 - ALEXSIANO", "10/02/2026", "F - Cons.Final", "10/03/2026", "19/03/2026", "28 DDL",
       "", 100, "Pago", 1, "21,92"],
    ]);
    const r = await parseAnaliticoComissao(buf);
    expect(r.rows[0].classificacao).toBe("PAGO");
    expect(r.rows[0].dataPagamento).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npx vitest run src/lib/parsers/comissao/analitico.test.ts
```
Expected: `Cannot find module './analitico'`.

- [ ] **Step 3: Implementar `analitico.ts`**

Use os helpers de `src/lib/parsers/types.ts` e `src/lib/parsers/excel.ts` (mesmos imports de `faturamento.ts`). Estrutura:

```typescript
// src/lib/parsers/comissao/analitico.ts
import { readExcelWorkbook } from "../excel";
import {
  ParseResult, buildHeaderIndex, findCol, normalizeHeader,
  toCleanString, toDate, toInt, toDecimalStr,
} from "../types";

export interface AnaliticoRow {
  numeroPedido: string;
  itemPedido: string | null;
  dataEmissao: Date | null;
  codCliente: string | null;
  cliente: string | null;
  produto: string | null;
  quantidade: number | null;
  valor: string; // Decimal string
  codVendedor: string;
  tipoNegocio: string | null;
  dataEntrega: Date | null;
  dataVencimento: Date | null;
  dataPagamento: Date | null;
  condicaoPagamento: string | null;
  parcela: number | null;
  pctRateio: string;
  classificacao: "PREVISTO" | "FATURADO" | "PAGO";
}

function splitCodigo(s: string | null): { codigo: string | null; nome: string | null } {
  if (!s) return { codigo: null, nome: null };
  const idx = s.indexOf(" - ");
  if (idx === -1) return { codigo: s.trim(), nome: null };
  return { codigo: s.slice(0, idx).trim(), nome: s.slice(idx + 3).trim() };
}

function mapClassificacao(s: string | null): "PREVISTO" | "FATURADO" | "PAGO" | null {
  const n = normalizeHeader(s ?? "");
  if (n === "pago") return "PAGO";
  if (n === "faturado") return "FATURADO";
  if (n === "previsto") return "PREVISTO";
  return null;
}

export async function parseAnaliticoComissao(buffer: Buffer): Promise<ParseResult<AnaliticoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  const warnings: string[] = [];
  if (sheets.length === 0) return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  const sheet = sheets[0];
  const allRows = sheet.rows;
  const HEADER_ROW = 0;
  const idx = buildHeaderIndex(allRows[HEADER_ROW]);

  const cPedido = findCol(idx, "Número do Pedido", "Numero do Pedido", "Num. Pedido");
  const cEmissao = findCol(idx, "Data Emissão Pedido", "Data Emissao Pedido", "Emissao");
  const cCliente = findCol(idx, "Nome do Cliente", "Cliente");
  const cProduto = findCol(idx, "Informe o Nome do produto", "Produto", "Descricao Produto");
  const cQtd = findCol(idx, "Quantidade do Pedido", "Quantidade", "Qtd");
  const cValor = findCol(idx, "Valor c/ Var. Cambial", "Valor c/ Var. Cambial", "Valor", "Valor Anterior Var. Cambial");
  const cVendedor = findCol(idx, "Nome do Vendedor", "Vendedor");
  const cEntrega = findCol(idx, "Data da Entrega", "Data Entrega");
  const cTipo = findCol(idx, "Tipo Negocio", "Tipo de Negocio");
  const cVenc = findCol(idx, "Data de Vencimento", "Vencimento");
  const cPgto = findCol(idx, "Data Pagamento do título", "Data Pagamento do titulo", "Data Pagamento");
  const cCond = findCol(idx, "Condicao de Pagamento", "Condição de Pagamento");
  const cParcela = findCol(idx, "Parcela do Titulo", "Parcela do Título", "Parcela");
  const cRateio = findCol(idx, "% Rateio Pg", "Rateio", "% Rateio");
  const cClass = findCol(idx, "Classificação", "Classificacao", "Status");

  if (cPedido === null || cVendedor === null || cValor === null || cEmissao === null) {
    return { rows: [], skipped: 0, warnings: ["colunas obrigatórias ausentes: Número do Pedido, Data Emissão, Valor, Vendedor"] };
  }

  const rows: AnaliticoRow[] = [];
  let skipped = 0;
  for (let r = HEADER_ROW + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const numeroPedido = toCleanString(row[cPedido]);
    const vend = splitCodigo(cVendedor !== null ? toCleanString(row[cVendedor]) : null);
    const valor = toDecimalStr(row[cValor]);
    const dataEmissao = toDate(row[cEmissao]);
    if (!numeroPedido || !vend.codigo || valor === null || !dataEmissao) {
      skipped++;
      continue;
    }
    const classif = mapClassificacao(cClass !== null ? toCleanString(row[cClass]) : null);
    const cli = splitCodigo(cCliente !== null ? toCleanString(row[cCliente]) : null);
    const prod = splitCodigo(cProduto !== null ? toCleanString(row[cProduto]) : null);
    rows.push({
      numeroPedido,
      itemPedido: prod.codigo,
      dataEmissao,
      codCliente: cli.codigo,
      cliente: cli.nome,
      produto: prod.codigo,
      quantidade: cQtd !== null ? toInt(row[cQtd]) : null,
      valor,
      codVendedor: vend.codigo,
      tipoNegocio: cTipo !== null ? toCleanString(row[cTipo]) : null,
      dataEntrega: cEntrega !== null ? toDate(row[cEntrega]) : null,
      dataVencimento: cVenc !== null ? toDate(row[cVenc]) : null,
      dataPagamento: cPgto !== null ? toDate(row[cPgto]) : null,
      condicaoPagamento: cCond !== null ? toCleanString(row[cCond]) : null,
      parcela: cParcela !== null ? toInt(row[cParcela]) : null,
      pctRateio: (cRateio !== null ? toDecimalStr(row[cRateio]) : null) ?? "100",
      classificacao: classif ?? "PREVISTO",
    });
  }
  return { rows, skipped, warnings };
}
```

> Nota: confirme as assinaturas exatas de `toDate`/`toDecimalStr`/`toInt`/`findCol` lendo `src/lib/parsers/types.ts` antes de implementar — devem casar com o uso em `faturamento.ts`. A data BR "08/01/2026" deve ser parseada por `toDate` (que já trata dd/mm/yyyy no projeto); se não tratar, ajuste o helper de data conforme o padrão de `pedido.ts`.

- [ ] **Step 4: Rodar e confirmar PASSA**

```bash
npx vitest run src/lib/parsers/comissao/analitico.test.ts
```
Expected: 2 testes ✅.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/parsers/comissao/analitico.ts src/lib/parsers/comissao/analitico.test.ts
git commit -m "feat(comissoes): parser do Analitico consolidado + testes"
git push
```

### Task 7: Parser de Metas por vendedor

**Files:**
- Create: `src/lib/parsers/comissao/metas.ts`
- Create: `src/lib/parsers/comissao/metas.test.ts`

**Formato assumido** (confirmar com arquivo real no 1º upload): cabeçalho com `CÓDIGO`/`VENDEDOR` + 12 colunas de mês (`JAN`..`DEZ`) ou uma coluna `MÊS`+`META`. O parser normaliza para linhas `(codVendedor, ano, mes, valorMeta)`. Implementação base assume layout **vendedor × 12 meses**, com o ano vindo de um parâmetro de coluna `ANO` ou do nome/aba; se ausente, usar o ano corrente.

- [ ] **Step 1: Escrever o teste**

```typescript
// src/lib/parsers/comissao/metas.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMetasComissao } from "./metas";

async function makeXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Metas");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseMetasComissao", () => {
  it("expande vendedor x 12 meses em linhas (codVendedor, ano, mes, valorMeta)", async () => {
    const buf = await makeXlsx([
      ["CÓDIGO", "ANO", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
      ["000022", 2026, 100000, 120000, 150000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const r = await parseMetasComissao(buf);
    const jan = r.rows.find((x) => x.codVendedor === "000022" && x.mes === 1);
    const fev = r.rows.find((x) => x.codVendedor === "000022" && x.mes === 2);
    expect(jan?.valorMeta).toBe("100000");
    expect(fev?.valorMeta).toBe("120000");
    expect(jan?.ano).toBe(2026);
    // meses com 0 ainda geram linha (meta zero) — ok
    expect(r.rows.filter((x) => x.codVendedor === "000022").length).toBe(12);
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npx vitest run src/lib/parsers/comissao/metas.test.ts
```
Expected: `Cannot find module './metas'`.

- [ ] **Step 3: Implementar `metas.ts`**

```typescript
// src/lib/parsers/comissao/metas.ts
import { readExcelWorkbook } from "../excel";
import { ParseResult, buildHeaderIndex, findCol, toCleanString, toInt, toDecimalStr } from "../types";

export interface MetaComissaoRow {
  codVendedor: string;
  ano: number;
  mes: number; // 1-12
  valorMeta: string;
}

const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

export async function parseMetasComissao(buffer: Buffer): Promise<ParseResult<MetaComissaoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  if (sheets.length === 0) return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  const sheet = sheets[0];
  const allRows = sheet.rows;
  const idx = buildHeaderIndex(allRows[0]);

  const cCod = findCol(idx, "CÓDIGO", "CODIGO", "Código", "Codigo Vendedor", "Vendedor");
  const cAno = findCol(idx, "ANO", "Ano");
  const cMes = MESES.map((m) => findCol(idx, m));

  if (cCod === null) {
    return { rows: [], skipped: 0, warnings: ["coluna CÓDIGO do vendedor ausente"] };
  }

  const anoFallback = new Date().getFullYear();
  const rows: MetaComissaoRow[] = [];
  let skipped = 0;
  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    const cod = toCleanString(row[cCod]);
    if (!cod) { skipped++; continue; }
    const ano = (cAno !== null ? toInt(row[cAno]) : null) ?? anoFallback;
    for (let m = 0; m < 12; m++) {
      const col = cMes[m];
      if (col === null) continue;
      const valorMeta = toDecimalStr(row[col]) ?? "0";
      rows.push({ codVendedor: cod, ano, mes: m + 1, valorMeta });
    }
  }
  return { rows, skipped, warnings: [] };
}
```

- [ ] **Step 4: Rodar e confirmar PASSA**

```bash
npx vitest run src/lib/parsers/comissao/metas.test.ts
```
Expected: teste ✅.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/parsers/comissao/metas.ts src/lib/parsers/comissao/metas.test.ts
git commit -m "feat(comissoes): parser de metas por vendedor + testes"
git push
```

---

## Phase 4 — Wiring de upload + service

### Task 8: Registrar parsers + replaceDataset

**Files:**
- Modify: `src/lib/parsers/index.ts`
- Modify: `src/lib/uploads.ts`

- [ ] **Step 1: Registrar no `PARSERS`/labels/accepts** (`src/lib/parsers/index.ts`)

Adicionar imports + entradas:
```typescript
import { parseAnaliticoComissao } from "./comissao/analitico";
import { parseMetasComissao } from "./comissao/metas";
```
No objeto `PARSERS`:
```typescript
  COMISSAO_ANALITICO: parseAnaliticoComissao,
  COMISSAO_META: parseMetasComissao,
```
No `DATASET_LABELS`:
```typescript
  COMISSAO_ANALITICO: "Comissões — Analítico consolidado (.xlsx)",
  COMISSAO_META: "Comissões — Metas por vendedor (.xlsx)",
```
No `DATASET_ACCEPTS`:
```typescript
  COMISSAO_ANALITICO: ".xlsx",
  COMISSAO_META: ".xlsx",
```

- [ ] **Step 2: Adicionar cases no `replaceDataset`** (`src/lib/uploads.ts`)

Antes do `default`/fechamento do switch, mapeando o row do parser para o create do Prisma. O Analítico precisa converter strings Decimal/Date para os tipos do Prisma. Adicione:

```typescript
    case "COMISSAO_ANALITICO": {
      await tx.comissaoLancamento.deleteMany({ where: { tenantId } });
      const data = (rows as AnaliticoRow[]).map((r) => ({
        tenantId,
        numeroPedido: r.numeroPedido,
        itemPedido: r.itemPedido,
        dataEmissao: r.dataEmissao!,
        codCliente: r.codCliente,
        cliente: r.cliente,
        produto: r.produto,
        quantidade: r.quantidade,
        valor: r.valor,                       // Prisma aceita string p/ Decimal
        codVendedor: r.codVendedor,
        tipoNegocio: r.tipoNegocio,
        dataEntrega: r.dataEntrega,
        dataVencimento: r.dataVencimento,
        dataPagamento: r.dataPagamento,
        condicaoPagamento: r.condicaoPagamento,
        parcela: r.parcela,
        pctRateio: r.pctRateio,
        classificacao: r.classificacao,
      }));
      for (const chunk of chunkArray(data, CHUNK))
        await tx.comissaoLancamento.createMany({ data: chunk });
      break;
    }
    case "COMISSAO_META": {
      await tx.comissaoMeta.deleteMany({ where: { tenantId } });
      const data = (rows as MetaComissaoRow[]).map((r) => ({
        tenantId,
        codVendedor: r.codVendedor,
        ano: r.ano,
        mes: r.mes,
        valorMeta: r.valorMeta,
      }));
      for (const chunk of chunkArray(data, CHUNK))
        await tx.comissaoMeta.createMany({ data: chunk });
      break;
    }
```

Adicione os imports de tipo no topo do `uploads.ts`:
```typescript
import type { AnaliticoRow } from "@/lib/parsers/comissao/analitico";
import type { MetaComissaoRow } from "@/lib/parsers/comissao/metas";
```

> Confirme o nome real do helper de chunk (`chunkArray`) e da constante (`CHUNK`) lendo o `uploads.ts` — use os existentes. Se o switch tiver tipagem `rows: ...[]` genérica, siga o mesmo cast que os outros cases usam.

- [ ] **Step 3: Verificar build + tipos**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "uploads|parsers/index|error TS" | head
```
Expected: sem erros novos relativos a esses arquivos. O switch passa a ser exaustivo sobre `Dataset` (TS valida).

- [ ] **Step 4: Commit + push**

```bash
git add src/lib/parsers/index.ts src/lib/uploads.ts
git commit -m "feat(comissoes): wiring dos datasets COMISSAO_ANALITICO/COMISSAO_META no upload"
git push
```

### Task 9: Service tenant-scoped + composição da apuração

**Files:**
- Create: `src/lib/services/comissao.ts`

**Responsabilidade:** queries Prisma (sempre `where: { tenantId }`), conversão Decimal→number, e a função que compõe a apuração de um vendedor (junta apuracao + previsao) reusando o motor.

- [ ] **Step 1: Implementar o service**

```typescript
// src/lib/services/comissao.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apurarAno } from "@/lib/domain/comissao/apuracao";
import { previsaoMensal } from "@/lib/domain/comissao/comissao";
import { gridPedidosPagos } from "@/lib/domain/comissao/pagamento";
import type { LancamentoInput, MetaInput, RegraVendedor, ApuracaoAno } from "@/lib/domain/comissao/types";

function num(d: Prisma.Decimal | null | undefined): number {
  return d == null ? 0 : Number(d);
}

export async function getVendedores(tenantId: string) {
  return prisma.comissaoVendedor.findMany({
    where: { tenantId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}

export async function getCargos(tenantId: string, ano?: number) {
  return prisma.comissaoCargo.findMany({
    where: { tenantId, ...(ano ? { ano } : {}) },
    orderBy: [{ ano: "desc" }, { cargo: "asc" }],
  });
}

/** Regra efetiva (comissão + gatilho) de um vendedor para o ano. */
export async function getRegraVendedor(
  tenantId: string, codVendedor: string, ano: number,
): Promise<RegraVendedor | null> {
  const vend = await prisma.comissaoVendedor.findFirst({ where: { tenantId, codigoProtheus: codVendedor } });
  if (!vend) return null;
  const cargo = await prisma.comissaoCargo.findFirst({ where: { tenantId, ano, cargo: vend.cargo } });
  const comissaoPct = cargo ? num(cargo.comissaoPct) : 0;
  const gatilhoCargo = cargo ? num(cargo.gatilhoPct) : 0;
  const gatilhoPct = vend.gatilhoOverride != null ? num(vend.gatilhoOverride) : gatilhoCargo;
  return { comissaoPct, gatilhoPct };
}

async function getLancamentos(tenantId: string, codVendedor: string, ano: number): Promise<LancamentoInput[]> {
  const rows = await prisma.comissaoLancamento.findMany({ where: { tenantId, codVendedor } });
  return rows
    .filter((r) => r.dataEmissao.getFullYear() === ano)
    .map((r) => ({
      numeroPedido: r.numeroPedido,
      itemPedido: r.itemPedido,
      dataEmissao: r.dataEmissao,
      valor: num(r.valor),
      codVendedor: r.codVendedor,
      dataPagamento: r.dataPagamento,
      parcela: r.parcela,
      pctRateio: num(r.pctRateio),
      classificacao: r.classificacao,
    }));
}

async function getMetas(tenantId: string, codVendedor: string, ano: number): Promise<MetaInput[]> {
  const rows = await prisma.comissaoMeta.findMany({ where: { tenantId, codVendedor, ano } });
  return rows.map((r) => ({ codVendedor: r.codVendedor, ano: r.ano, mes: r.mes, valorMeta: num(r.valorMeta) }));
}

export interface ExtratoVendedor {
  apuracao: ApuracaoAno;
  pedidosPagos: Map<string, number[]>;
  regra: RegraVendedor;
}

/** Compõe o extrato completo de um vendedor/ano (apuração + previsão + pagos). */
export async function getExtratoVendedor(
  tenantId: string, codVendedor: string, ano: number,
): Promise<ExtratoVendedor | null> {
  const regra = await getRegraVendedor(tenantId, codVendedor, ano);
  if (!regra) return null;
  const [lancs, metas] = await Promise.all([
    getLancamentos(tenantId, codVendedor, ano),
    getMetas(tenantId, codVendedor, ano),
  ]);
  const apuracao = apurarAno(lancs, metas, regra, ano);
  const habilita = apuracao.map((m) => m.habilita);
  const prev = previsaoMensal(lancs, regra.comissaoPct, habilita, ano);
  apuracao.forEach((m, i) => (m.previsao = prev[i]));
  const pedidosPagos = gridPedidosPagos(lancs, regra.comissaoPct);
  return { apuracao, pedidosPagos, regra };
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "services/comissao|error TS" | head
```
Expected: sem erros relativos a `services/comissao`.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/services/comissao.ts
git commit -m "feat(comissoes): service tenant-scoped + composicao do extrato"
git push
```

---

## Phase 5 — Telas

> As telas seguem padrões existentes. **Antes de cada uma, leia o arquivo-espelho indicado** e replique a estrutura (imports, AppShell, guard de role, DataTable, server actions). Cada task entrega uma tela completa.

### Task 10: Cadastro de Vendedores + Cargos

**Files:**
- Create: `src/app/comissoes/vendedores/page.tsx` (espelho: `src/app/admin/usuarios/page.tsx`)
- Create: `src/app/comissoes/vendedores/actions.ts` (espelho: `src/app/admin/usuarios/actions.ts`)
- Create: `src/app/comissoes/vendedores/VendedorBtns.tsx` (espelho: `UsuarioCriarBtn.tsx`/`UsuarioRowActions.tsx`)

- [ ] **Step 1: Server actions CRUD** (`actions.ts`)

Implementar (com `"use server"`, guard `requireRole([ADMIN, DIRETOR, CONTROLADORIA])` reusando `@/lib/authz`, validação Zod, `logAudit`):
- `criarVendedor(input)`, `atualizarVendedor(id, input)` — `prisma.comissaoVendedor` (findFirst por `{id, tenantId}` antes de update — padrão anti cross-tenant da skill de segurança)
- `criarCargo(input)`, `atualizarCargo(id, input)` — `prisma.comissaoCargo`
Cada mutação chama `logAudit({ action: "comissao.vendedor.create"|... , entity: "ComissaoVendedor"|"ComissaoCargo", ... })` e `revalidatePath("/comissoes/vendedores")`.

Campos Vendedor: codigoProtheus, nome, cargo (select dos cargos do ano), tipo (CLT/PJ/REPRESENTANTE), nivel?, gatilhoOverride?, ativo. Campos Cargo: ano, cargo, comissaoPct, gatilhoPct, base.

- [ ] **Step 2: Página** (`page.tsx`)

Server Component: `auth()` + guard de role (renderiza "Acesso restrito" como em `usuarios/page.tsx` se role ∉ [ADMIN, DIRETOR, CONTROLADORIA]). Busca `getVendedores`/`getCargos`. Renderiza 2 `CardSection` com `DataTable`: uma de Vendedores, uma de Cargos. Botões de criar/editar (client components em `VendedorBtns.tsx` usando as server actions).

- [ ] **Step 3: Build + verificar rota**

```bash
npm run build 2>&1 | grep -E "comissoes/vendedores|error|Failed" | head
```
Expected: rota `ƒ /comissoes/vendedores` registrada, build OK.

- [ ] **Step 4: Commit + push**

```bash
git add src/app/comissoes/vendedores/
git commit -m "feat(comissoes): cadastro de vendedores e cargos (CRUD)"
git push
```

### Task 11: Upload dedicado

**Files:**
- Create: `src/app/comissoes/upload/page.tsx` (espelho: `src/app/uploads/page.tsx`)

- [ ] **Step 1: Página de upload**

Server Component com guard de role. Reusa o componente de upload existente do `/uploads` (ler `uploads/page.tsx` para ver qual client component faz o POST para `/api/uploads/[dataset]`). Renderiza 2 dropzones: `COMISSAO_ANALITICO` e `COMISSAO_META` (usando `DATASET_LABELS`/`DATASET_ACCEPTS`). Lista o histórico via `prisma.dataUpload.findMany({ where: { tenantId, dataset: { in: ["COMISSAO_ANALITICO","COMISSAO_META"] } }, orderBy: { startedAt: "desc" }, take: 30 })`.

- [ ] **Step 2: Build + verificar**

```bash
npm run build 2>&1 | grep -E "comissoes/upload|error|Failed" | head
```
Expected: rota registrada, build OK.

- [ ] **Step 3: Commit + push**

```bash
git add src/app/comissoes/upload/
git commit -m "feat(comissoes): tela de upload dedicado (analitico + metas)"
git push
```

### Task 12: Extrato por vendedor (2 grids) + export CSV

**Files:**
- Create: `src/app/comissoes/extrato/page.tsx`
- Create: `src/app/comissoes/extrato/export/route.ts` (espelho: `src/app/prontidao/export/route.ts`)

- [ ] **Step 1: Página do Extrato**

Server Component com guard de role. SP: `{ vend?: string; ano?: string }`. Busca `getVendedores` (pro seletor) + `getExtratoVendedor(tenantId, vend, ano)`. Renderiza:
- Seletor de vendedor (`FilterSelect name="vend"`) + ano (`FilterSelect name="ano"`, default ano corrente).
- **Grid 1 — Apuração**: tabela transposta (linhas = Meta/Gatilho/EP/Saldo/Saldo Acum/Habilita/Previsão; colunas = JAN..DEZ + Total). Mesma estética do "Quadro Meta × Realizado" do Faturamento (`src/app/faturamento/page.tsx`). Valores via `fmtCurrency(v, { decimals: 0 })`; Habilita = "SIM"/"NÃO".
- **Grid 2 — Pedidos Pagos**: linhas = janelas (chaves ordenadas do Map `pedidosPagos`), colunas = mês origem JAN..DEZ + Total.
- Botões **Exportar CSV** (link pra `/comissoes/extrato/export?vend=&ano=`) + **Imprimir** (`PrintButton` + wrapper `#print-area`, reusando o que já existe).

- [ ] **Step 2: Rota de export CSV**

`route.ts`: `auth()` + guard role; lê `vend`/`ano`; chama `getExtratoVendedor`; monta CSV (linhas de apuração + grid de pagos) usando os helpers de `@/lib/csv` (`toCsv`, `csvCurrency`). Filename `comissao-extrato-<vend>-<ano>.csv`.

- [ ] **Step 3: Build + verificar**

```bash
npm run build 2>&1 | grep -E "comissoes/extrato|error|Failed" | head
```
Expected: rotas `ƒ /comissoes/extrato` e `ƒ /comissoes/extrato/export` registradas.

- [ ] **Step 4: Commit + push**

```bash
git add src/app/comissoes/extrato/
git commit -m "feat(comissoes): extrato por vendedor (apuracao + pedidos pagos) + export CSV"
git push
```

### Task 13: Overview RH/Diretoria + Sidebar

**Files:**
- Create: `src/app/comissoes/page.tsx`
- Modify: `src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Overview** (`page.tsx`)

Server Component com guard de role. Para o ano corrente, lista todos os vendedores ativos com: meta YTD, EP YTD, atingimento %, habilita (mês corrente), previsão YTD — chamando `getExtratoVendedor` por vendedor (ou uma agregação leve). KPIs no topo (total previsão YTD, nº elegíveis, nº vendedores). `DataTable` com link pra `/comissoes/extrato?vend=<cod>`.

- [ ] **Step 2: Sidebar** (`Sidebar.tsx`)

Importar um ícone (ex: `Percent` ou `Wallet` do lucide). Criar `NAV_COMISSOES`:
```tsx
const NAV_COMISSOES: NavItem[] = [
  { label: "Comissões", href: "/comissoes", icon: Percent },
  { label: "Extrato", href: "/comissoes/extrato", icon: ScrollText },
  { label: "Vendedores", href: "/comissoes/vendedores", icon: Users },
  { label: "Upload Comissões", href: "/comissoes/upload", icon: Upload },
];
```
Renderizar a seção **só** se `user.role ∈ [ADMIN, DIRETOR, CONTROLADORIA]` (criar `isComissoes = ["ADMIN","DIRETOR","CONTROLADORIA"].includes(user.role)`), seguindo o padrão dos blocos `isControladoria`/`isAdmin` já existentes.

- [ ] **Step 3: Build + verificar**

```bash
npm run build 2>&1 | grep -E "comissoes|error|Failed" | head
```
Expected: rota `ƒ /comissoes` registrada, build OK.

- [ ] **Step 4: Commit + push**

```bash
git add src/app/comissoes/page.tsx src/components/Layout/Sidebar.tsx
git commit -m "feat(comissoes): overview RH/Diretoria + secao no sidebar"
git push
```

---

## Phase 6 — Validação contra o Protheus

### Task 14: Teste de aceite com fixtures reais

**Files:**
- Create: `src/lib/domain/comissao/aceite.test.ts`
- Create: `src/lib/domain/comissao/__fixtures__/` (derivar do Analítico real, se disponível)

- [ ] **Step 1: Montar fixtures a partir dos dados reais**

Usar o `Analitco.xlsx` (em `comissionamento/materiais/`) como fonte. Extrair os lançamentos de Adriano (000022) e Alexsiano (000029) + as metas do Extrato (META MES por mês) para montar `LancamentoInput[]`/`MetaInput[]` no fixture (TypeScript inline, sem depender do xlsx no teste).

- [ ] **Step 2: Escrever o teste de aceite**

```typescript
// esqueleto — preencher os números com base nos fixtures
import { describe, it, expect } from "vitest";
import { get... } // ou chamar apurarAno/previsaoMensal/gridPedidosPagos direto com os fixtures

describe("aceite — reproduz Extrato Protheus", () => {
  it("Adriano (000022): previsão JAN ~ 5772.98 e pagos 21/03-20/04 (origem JAN) ~ 314.68", () => {
    // monta lancs+metas do fixture, regra (cargo de Adriano), roda o motor
    // expect previsao[0] ~ 5772.98 (tolerância)
    // expect gridPedidosPagos.get("2026-04")[0] ~ 314.68
  });
  it("Alexsiano (000029): habilita JAN=false; previsão FEV ~ 3027.04 (YTD)", () => {
    // valida a regra YTD com os números reais
  });
});
```

> Se algum número não bater, **ajustar a regra do motor** (dedup de EP, proporção do rateio na comissão, definição exata de "EP" vs "FAT" na previsão) contra esse ground-truth — este é o propósito do teste. Documentar a decisão no commit.

- [ ] **Step 3: Rodar todos os testes do módulo**

```bash
npx vitest run src/lib/domain/comissao src/lib/parsers/comissao
```
Expected: todos ✅ (incluindo o de aceite).

- [ ] **Step 4: Commit + push**

```bash
git add src/lib/domain/comissao/aceite.test.ts src/lib/domain/comissao/__fixtures__/
git commit -m "test(comissoes): aceite reproduzindo numeros do Extrato Protheus"
git push
```

---

## Phase 7 — Deploy

### Task 15: Build final + merge readiness

- [ ] **Step 1: Build completo + suíte de testes**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "comissao|comissoes" | head   # zero
npx vitest run 2>&1 | tail -15                                                          # tudo verde
npm run build 2>&1 | tail -20                                                           # rotas /comissoes* presentes
```

- [ ] **Step 2: (Manual / usuário) primeiro upload real + conferência**

Após deploy do branch: cadastrar cargos + vendedores, subir o Analítico real + Metas, abrir o Extrato de Adriano/Alexsiano e conferir contra o Protheus. Ajustar regra se necessário (volta ao Task 14).

- [ ] **Step 3: Finalizar branch**

Decidir merge (PR `feature/comissoes` → `main`) ou continuar. Coolify deploya `main` no merge. (A migration `9_comissoes` roda no entrypoint.)

---

## Notas finais

- **Validação é o coração**: os números do Protheus (Adriano/Alexsiano) são o critério de verdade. Qualquer ambiguidade (dedup EP, rateio×comissão) se resolve contra eles no Task 14.
- **Sequência crítica**: Phase 1 (data) → Phase 2-3 (engine+parsers, paralelizáveis) → Phase 4 (wiring) → Phase 5 (telas) → Phase 6 (aceite). Phase 5 depende de 4; 6 depende de 2.
- **Formato da planilha de Metas**: assumido vendedor×12meses; confirmar no 1º upload real e ajustar `metas.ts` se o layout divergir.
- **Fases futuras** (fora deste plano): hierarquia/carteira, garantido, exceções, fechamento+lote, self-service do vendedor, representantes.
