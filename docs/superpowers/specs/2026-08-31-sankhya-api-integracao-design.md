# Integração com a API do Sankhya — fundação (Plano A)

Implementa a base da atividade 6 do plano
[2026-08-20-migracao-sankhya-comissoes](../plans/2026-08-20-migracao-sankhya-comissoes.md):
o módulo segregado de consulta à API do Sankhya que substitui, quando as
credenciais chegarem, o ciclo de baixar/subir planilhas (hoje 7 por carga).

## O que existe

```
src/lib/sankhya/
  config.ts    variáveis de ambiente → configuração (OAuth ou login legado)
  client.ts    autenticação + cache de token + invokeService/loadRecords/executeQuery
  queries.ts   consultas dos 3 pilares da comissão + cadastro de vendedores
src/app/api/sankhya/status/route.ts   GET de diagnóstico (ADMIN)
scripts/sankhya-test.ts               diagnóstico via CLI
```

- **Somente leitura.** Nada aqui escreve no ERP (`executeQuery` recusa o que
  não for SELECT/WITH). Escrita, se um dia precisar, é módulo novo.
- **Desligada por padrão.** Sem `SANKHYA_*` no ambiente nada muda — a carga
  por planilha continua sendo o caminho (Plano B).

## Autenticação

Dois modos, detectados pelas variáveis presentes (OAuth tem precedência):

| Modo | Endpoint | Credenciais | Observações |
|------|----------|-------------|-------------|
| OAuth 2.0 (preferencial) | `POST /authenticate` | `SANKHYA_CLIENT_ID`, `SANKHYA_CLIENT_SECRET`, `SANKHYA_XTOKEN` | JWT ~5 min, renovado automaticamente com margem de 30 s |
| Legado | `POST /login` | `SANKHYA_APPKEY`, `SANKHYA_TOKEN`, `SANKHYA_USERNAME`, `SANKHYA_PASSWORD` | sessão expira por inatividade; renovada a cada ~20 min |

O token fica em cache por processo; um 401 no meio do caminho dispara UMA
reautenticação e o retry da chamada.

## Consultas

- `loadRecords(...)` — `CRUDServiceProvider.loadRecords` com paginação
  automática (`offsetPage`/`hasMoreResult`) e normalização do formato
  posicional (`f0`/`f1`/… + metadata) para objetos por nome de campo.
- `executeQuery(sql)` — `DbExplorerSP.executeQuery` (SELECT livre). É o
  caminho que reproduz os exports do Sílvio numa chamada só, mas **depende do
  serviço estar liberado** para o usuário da integração no ERP.
- `queries.ts` — os 3 pilares (`fetchEntradaPedidos`, `fetchFaturamento`,
  `fetchPagamentos`, mesmo shape dos parsers `sankhyaPedidos`/
  `sankhyaFaturamento`) e `fetchVendedores` (de-para, via loadRecords).

### ⚠ Campos a confirmar na primeira conexão

Os exports usam campos que costumam ser **adicionais (AD_\*) criados na
implantação** — o palpite atual está centralizado em `CAMPOS`
(`src/lib/sankhya/queries.ts`) e o ajuste é pontual:

- `Tipo_Negocio` (Cliente Final/OEM/REVENDA) → `AD_TIPONEGOCIO`?
- `Tipo_Venda` (RE/NO/ME/SU/SE — regra dos representantes) → `AD_TIPOVENDA`?
- `PV_sistema_anterior…` (de-para Protheus) → `AD_PVANTERIOR`?
- Desconto da oportunidade (fator dos representantes) → `AD_DESCONTOOPORT`?
- TIPMOV de pedido/venda/devolução conforme os TOPs configurados na Autron.

## O que pedir ao Rogério (gerente de projeto Sankhya)

1. **Credenciais OAuth**: criar a aplicação na Área do Desenvolvedor
   (client_id + client_secret) e gerar o **X-Token** na tela *Configurações
   Gateway* do SankhyaOm da Autron. (Alternativa: appkey/token + usuário de
   integração para o fluxo legado.)
2. **Liberação do serviço `DbExplorerSP.executeQuery`** (leitura) para o
   usuário da integração — sem ele, as consultas dos pilares precisam ser
   portadas para `loadRecords`.
3. **Nomes dos campos adicionais** acima (dicionário de dados da implantação).

## Como testar quando as credenciais chegarem

```bash
# 1) preencha as SANKHYA_* no .env (ver .env.example)
# 2) diagnóstico completo da linha de comando:
npx tsx scripts/sankhya-test.ts                    # config + auth + consulta mínima
npx tsx scripts/sankhya-test.ts --vendedores       # lista o de-para de vendedores
npx tsx scripts/sankhya-test.ts --pilares 2026-08  # amostra dos 3 pilares do mês
# 3) na aplicação (ADMIN): GET /api/sankhya/status
```

## Próximos passos (fora deste escopo)

1. Validar/ajustar `CAMPOS` com a base real e comparar o retorno dos pilares
   com as planilhas de ago/2026 (mesmos totais → consultas certas).
2. Ingestão automática (atividade 9 do plano): rota/rotina que chama os
   fetchers, aplica o de-para e grava nos datasets — substituindo o upload
   manual planilha a planilha.
3. Estender para os demais datasets hoje carregados por planilha
   (pedidos/followup/estoque/faturamento etc.) conforme prioridade.
