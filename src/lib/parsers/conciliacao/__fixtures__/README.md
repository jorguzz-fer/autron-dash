# Fixtures de conciliação

Os arquivos `.xlsx` aqui são amostras **reais** extraídas do Protheus do cliente
(códigos, valores e nomes de clientes reais). Por conterem dados sensíveis,
**não são commitados** — o `.gitignore` filtra `*.xlsx` no projeto inteiro.

## Como obter as fixtures localmente

Os arquivos vivem em
`/Users/fernandojorge/Desktop/Projetos/apps/autron-dash/materiais/financ-contab/`
(fora do repo). Para rodar os testes de integração da conciliação:

```bash
cp "materiais/financ-contab/Relatório Financeiro CR.xlsx" \
   src/lib/parsers/conciliacao/__fixtures__/financeiro-cr.xlsx

cp "materiais/financ-contab/1121010001 - CONTABIL.xlsx" \
   src/lib/parsers/conciliacao/__fixtures__/contabil-1121010001.xlsx
```

## Comportamento dos testes

- **Sem os fixtures**: os blocos `describe.skipIf(!fixturesDisponiveis)`
  são pulados automaticamente. A suite continua verde com a cobertura das
  funções puras (parsers de string, algoritmo de conciliação) via mocks
  inline.
- **Com os fixtures**: rodam testes adicionais que validam o pipeline
  ponta-a-ponta com arquivos reais (parse + agregação por NF + conciliação).

Esta pasta NÃO deve ser versionada com os xlsx. Se um novo dev precisar dos
arquivos, peça pro time de Controladoria/Autron via canal seguro.
