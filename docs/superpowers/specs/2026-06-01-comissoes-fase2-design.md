# Comissões — Fase 2: Carteira, Garantido, CRUD e Correções para Dados Reais

**Data:** 2026-06-01
**Branch:** `feature/comissoes-fase2` (a partir de `main`)
**Predecessor:** `docs/superpowers/specs/2026-05-21-comissoes-mvp-design.md` (MVP individual, em produção)

---

## 1. Contexto

O MVP de Comissões está em produção com cálculo **individual** (apuração YTD, previsão por EP, pagamento por janela 21→20). Após nova reunião com o cliente (Márcio, transcrição em `comissionamento/reunião/marcio.txt`) e análise dos arquivos reais, três frentes precisam ser endereçadas:

1. **Correções para dados reais** — os parsers do MVP não leem o formato real dos arquivos extraídos do Protheus, e o "pulo do gato" (gate de pagamento por mês de emissão) está incompleto.
2. **Carteira/hierarquia** — gestores (Supervisor, KAM, Especialista com equipe) comissionam sobre a soma das vendas da carteira (eles + subordinados).
3. **Garantido + CRUD por vendedor** — vendedor recém-contratado tem comissão garantida por N meses; a parametrização (cargo, %, gatilho, supervisor, garantido) precisa de CRUD por vendedor.

### Materiais de referência (validados)

- `comissionamento/materiais/material-Marcio/simulador-comissoes.xlsx` — **fonte canônica** da regra YTD (fórmulas extraídas abaixo).
- `comissionamento/materiais/material-Marcio/Consultores de Vendas_Autron-v2.xlsx` — 12 vendedores, cargos, hierarquia.
- `comissionamento/materiais/Comissao-Meta.xlsx` — extrato Protheus (1 aba por vendedor); fonte das **metas** + referência de aceite.
- `comissionamento/materiais/Comissao-Analitco.xlsx` — analítico de transações (entrada do cálculo).

---

## 2. Decisões de negócio (travadas com o cliente)

| # | Decisão | Valor |
|---|---|---|
| D1 | Elegibilidade | **YTD acumulado** (buffer). O mensal do Protheus é AS-IS descartado. |
| D2 | Fórmula do gatilho | `ARRED( ΣEP[jan..m] / Σmeta[jan..m] ; 2 ) ≥ gatilhoPct` (arredondamento de 2 casas, conforme simulador). |
| D3 | Base do garantido | **EP** (compara contra a previsão, não contra o pago). |
| D4 | Carteira | gestor + **TODOS** os subordinados (independente de cada um bater a própria meta). |
| D5 | Sobreposição | Venda de subordinado paga **2×**: comissão individual dele + comissão de carteira do gestor (percentuais e gatilhos independentes). |
| D6 | Pulo do gato | Venda emitida em mês **não-habilitado** nunca é paga, mesmo quando o cliente paga depois. O gate é pelo mês de **emissão**. |

### Fórmula canônica (do simulador do Márcio)

```
ATINGIMENTO[m] = SOMA(EP[jan..m]) / SOMA(META[jan..m])
HABILITA[m]    = gatilhoPct == 0  ?  true
               : Σmeta[jan..m] > 0  AND  ARRED(ATINGIMENTO[m], 2) ≥ gatilhoPct
PREVISÃO[m]    = HABILITA[m] ? (EP[m] × %) : 0
```

Exemplo de aceite (números do simulador):

| | JAN | FEV | MAR | ABR | MAI | TOTAL |
|---|---|---|---|---|---|---|
| META | 100.000 | 120.000 | 150.000 | 150.000 | 80.000 | |
| EP | 200.000 | 40.000 | 50.000 | 50.000 | 80.000 | |
| Atingimento | 200% | 109% | 78% | 65% | 70% | |
| Previsão (×1,5%) | 3.000 | 600 | 750 | **0** | 1.200 | **5.550** |

---

## 3. Hierarquia confirmada

12 vendedores; 3 gestores com carteira:

| Gestor | Cargo | % | Carteira |
|---|---|---|---|
| Célio Onofre | Supervisor de Vendas | 0,75% | Célio + João Vitor |
| Rafael Silva de Jesus | Consultor Especialista | 1,0% | Rafael + Bruno |
| Willian César | Key Account Manager Siderurgia | 0,5% | Willian + Alexsiano + Leandro |

Individuais: Alexsiano, Bruno, Dewet, João Vitor, Leandro, Michel, Rembrandt.
Sem gatilho: Helton (Vendas Internacionais, 1,5%), Representante Autônomo (% a definir).

**Insight-chave:** "ser carteira" é por **vendedor**, não por cargo — Rafael (Especialista) é carteira porque tem subordinado; Dewet/Michel (mesmo cargo) são individuais. Logo, a carteira é **derivada de ter subordinados**, não de um campo no cargo.

**Anomalia conhecida:** Rembrandt (Consultor de Vendas Internas, 0,5%) está marcado "carteira" na planilha mas sem subordinados. Computacionalmente, carteira de 1 = individual (mesmo número). Tratado como individual até o cliente confirmar se ele terá equipe.

---

## 4. Arquitetura

Princípio: **carteira uniforme.** Todo vendedor é apurado como uma carteira = `{ele} ∪ {subordinados}`. Para um individual, a carteira tem 1 membro e o resultado é idêntico ao MVP atual. Isso permite reaproveitar `apurarAno` sem alterá-lo na essência — a agregação acontece no **service**, que une os lançamentos+metas dos membros e chama o motor com a **regra do próprio vendedor** (seu %, gatilho 70%).

```
getExtratoVendedor(tenantId, cod, ano)
  ├── carteira = [cod, ...subordinados(cod)]
  ├── lancs = Σ getLancamentos(membro)   // pedidos têm codVendedor único → concat seguro
  ├── metas = Σ getMetas(membro)
  ├── regra = getRegraVendedor(cod)       // % do cargo do gestor, gatilho 70%
  ├── apuracao = apurarAno(lancs, metas, regra, ano)   // habilita YTD sobre carteira
  ├── previsao = previsaoMensal(lancs, regra.%, habilita, ano)
  ├── aReceber = aplicaGarantido(previsao, vendedor.garantido)   // max(prev, garantido) na janela
  └── pedidosPagos = gridPedidosPagos(lancs, regra.%, habilita) // ← agora recebe habilita[]
```

---

## 5. Mudanças por camada

### 5.1 Schema (`prisma/schema.prisma` + migration)

`ComissaoVendedor` ganha:

```prisma
supervisorCodigo  String?    // codigoProtheus do gestor (self-ref lógico). NULL = sem gestor.
garantidoValor    Decimal?   @db.Decimal(15, 2)   // valor mensal garantido
garantidoInicio   DateTime?  // 1º dia do mês de início
garantidoMeses    Int?       // duração (3-6, caso a caso)

@@index([tenantId, supervisorCodigo])
```

- `supervisorCodigo` referencia `codigoProtheus` (não FK física — evita acoplamento de ordem de insert; validado em app).
- A carteira de um gestor `G` = `G` + todos os `ComissaoVendedor` com `supervisorCodigo == G.codigoProtheus` (mesmo tenant).
- Campo `base` do `ComissaoCargo` permanece (legado), **não é usado** para decidir carteira.

### 5.2 Motor (`src/lib/domain/comissao/`)

**`apuracao.ts` — refinar habilita (D2):**
```ts
// antes: habilita = epAcum >= gatilhoAcum
// depois:
const atingimento = metaAcum > 0 ? epAcum / metaAcum : 0;
const habilita = regra.gatilhoPct === 0
  ? true
  : metaAcum > 0 && round2(atingimento) >= regra.gatilhoPct;
// round2(x) = Math.round(x * 100) / 100
```

**`pagamento.ts` — fix pulo do gato (D6):**
```ts
export function gridPedidosPagos(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
  habilitaPorMesEmissao: boolean[],   // ← NOVO param, length 12
): Map<string, number[]> {
  // ...dentro do loop, após calcular origem (mês de emissão):
  if (!habilitaPorMesEmissao[origem]) continue;   // pedido de mês não-habilitado: nunca paga
  // ...resto igual
}
```

**`garantido.ts` (NOVO) — aplica garantido (D3):**
```ts
export interface GarantidoConfig {
  valor: number;
  inicioAno: number;
  inicioMes: number;   // 1-12
  meses: number;
}
/** Retorna array[12] de "a receber" = max(previsao[m], garantido) nos meses da janela; senão previsao[m]. */
export function aplicaGarantido(
  previsao: number[],
  ano: number,
  cfg: GarantidoConfig | null,
): number[];
```
A janela cobre `meses` meses a partir de `(inicioAno, inicioMes)`, podendo cruzar o ano. Para a apuração de `ano`, só os meses [1..12] daquele ano dentro da janela recebem o piso.

### 5.3 Service (`src/lib/services/comissao.ts`)

- `getCarteiraMembros(tenantId, cod)` — retorna `[cod, ...subordinados]`.
- `getSubordinados(tenantId, cod)` — vendedores com `supervisorCodigo == cod`.
- `getExtratoVendedor` — agrega lançamentos+metas dos membros; passa `habilita[]` ao `gridPedidosPagos`; aplica garantido. Adiciona ao retorno: `membros: string[]`, `aReceber: number[]`, `garantido: GarantidoConfig | null`.

### 5.4 Parsers (`src/lib/parsers/comissao/`)

**`metas.ts` — reescrever (formato real):**
- Workbook multi-aba: **1 aba por vendedor** + aba `PARÂMETROS` (ano de referência).
- Por aba (exceto PARÂMETROS): ler `CÓDIGO PROTHEUS` (linha "CÓDIGO PROTHEUS") e a linha `META MES` nas colunas JAN..DEZ.
- Ano: da aba `PARÂMETROS` ("Ano Referência") ou dos cabeçalhos "JAN-2026".
- Saída: `MetaComissaoRow[]` (codVendedor, ano, mes, valorMeta) — 12 por vendedor.
- Ignorar (não importar) as linhas de cálculo do Protheus (GATILHO, EP, HABILITA, PREVISÃO, PEDIDOS PAGOS) — são referência, não entrada.

**`analitico.ts` — ajustar:**
- Valor base da comissão = coluna **"Valor c/ Var. Cambial"** (não "Valor Anterior Var. Cambial"). Confirmado: `Comissão Calculada = Valor c/ Var. Cambial × Informe o Percentual`.
- `comissaoPct` por linha = coluna **"Informe o Percentual"** ÷ 100 (vem como 1; 0,5; 1,3).
- `dataPagamento`: tratar `"/  /"` (e variações com espaços) como **null**.
- `itemPedido` = código do produto (split de "Informe o Nome do Produto").
- `pctRateio`: default 100 quando vazio.

### 5.5 Cargos — seed (8 cargos)

| Cargo | % | Gatilho |
|---|---|---|
| Consultor de Vendas I | 1,5% | 70% |
| Consultor de Vendas II | 1,5% | 70% |
| Consultor de Vendas Internas | 0,5% | 70% |
| Consultor Especialista de Vendas | 1,0% | 70% |
| Supervisor de Vendas | 0,75% | 70% |
| Key Account Manager Siderurgia | 0,5% | 70% |
| Vendas Internacionais | 1,5% | 0% (sem gatilho) |
| Representante Autônomo | a definir | 0% (sem gatilho) |

### 5.6 CRUD por vendedor (`src/app/comissoes/vendedores/`)

Form de vendedor ganha:
- **Supervisor** (dropdown opcional de vendedores) → define `supervisorCodigo`.
- **Garantido**: valor + mês/ano início + duração (meses).
- **Cargo** (dropdown com os cargos seedados), **tipo** (CLT/PJ/Representante).
- Mantém: código Protheus, nome, ativo, override de gatilho.
- Server actions com role-guard, validação Zod, anti cross-tenant, audit log.

### 5.7 Telas

- **Extrato:** quando o vendedor é gestor (tem subordinados), exibir os **membros da carteira** e indicar que a apuração é agregada. Nova linha **"Garantido"** e **"A Receber"** (= max(previsão, garantido)) no grid de apuração.
- **Overview:** KPIs e tabela seguem; gestores aparecem com a previsão de carteira.

---

## 6. Sequenciamento

**Bloco 1 — Correções para dados reais** (pré-requisito de qualquer validação):
1. Parser de metas (formato real) + testes.
2. Parser de analítico (valor c/ cambial, % por linha, `/  /`) + testes.
3. Fix do pulo do gato (`gridPedidosPagos` recebe habilita[]) + testes.
4. Refino do habilita (ARRED 2 casas) + fixture do simulador como teste de aceite.

**Bloco 2 — Fase 2** (depende do Bloco 1):
5. Migration (supervisorCodigo + garantido).
6. Service de carteira (agregação de membros).
7. Módulo garantido + integração no service.
8. Seed de cargos + CRUD por vendedor (supervisor, garantido).
9. Telas (extrato com carteira + garantido).
10. Aceite final contra `Comissao-Meta.xlsx` (Adriano + Alexsiano) e simulador.

---

## 7. Testes de aceite

- **Simulador (toy):** previsão 3.000/600/750/0/1.200, total 5.550.
- **Adriano (000022):** JAN habilita SIM, previsão ≈ 5.772,98; pagos 21/03–20/04 ≈ 314,68; 21/04–20/05 ≈ 262,61.
- **Alexsiano (000029) YTD:** JAN não habilita; FEV **não habilita** (ΣEP 301k < 70%×Σmeta 533k → atingimento 57%). *(Diverge do Protheus mensal, que mostra FEV=SIM — divergência intencional D1.)*
- **Carteira Willian:** apuração agrega Willian+Alexsiano+Leandro; gatilho 70% sobre a soma; comissão 0,5% sobre faturamento da carteira.

---

## 8. Fora de escopo (Fase 2)

- **Representante Autônomo:** janela de pagamento dia 15 e % "a definir com o Leandro" — modelar quando o % for fechado.
- **Vendas internacionais especiais / windfall:** cálculo manual ("na unha"), conforme procedimento do cliente.
- **Multi-nível (cadeias de gestor sobre gestor):** dados atuais são árvore de profundidade 1. Modelo (supervisorCodigo) suporta, mas a agregação fica em 1 nível (subordinados diretos) até haver caso real.
- **Snapshot/fechamento persistido por rodada** (era Fase 5 do roadmap).

---

## 9. Riscos

- **Confusão do cliente YTD vs Protheus:** ao conferir contra o Excel do Protheus (mensal), casos como Alexsiano FEV vão divergir. Documentar claramente na tela/extrato que a regra é YTD (decisão do cliente).
- **Formato dos arquivos Protheus:** se a extração mudar de layout, os parsers quebram. Mantida a detecção tolerante de cabeçalhos.
