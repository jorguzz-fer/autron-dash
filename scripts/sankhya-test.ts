// scripts/sankhya-test.ts — valida a integração com a API do Sankhya da
// linha de comando, sem precisar subir a aplicação.
//
// Uso (com as variáveis SANKHYA_* no .env ou no ambiente):
//
//   npx tsx scripts/sankhya-test.ts                  # config + auth + consulta mínima
//   npx tsx scripts/sankhya-test.ts --vendedores     # + cadastro de vendedores (de-para)
//   npx tsx scripts/sankhya-test.ts --pilares 2026-08  # + 3 pilares do mês (amostra)
//
// Saída: diagnóstico etapa a etapa. Nenhuma escrita no ERP nem no Postgres.

import { testConnection } from "../src/lib/sankhya/client";
import {
  fetchEntradaPedidos,
  fetchFaturamento,
  fetchPagamentos,
  fetchVendedores,
} from "../src/lib/sankhya/queries";

// Carrega o .env do projeto quando presente (Node >= 20.12).
try {
  process.loadEnvFile?.(".env");
} catch {
  /* sem .env — usa o ambiente como está */
}

function ok(label: string, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail = "") {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("Diagnóstico da integração Sankhya\n");

  const status = await testConnection();
  if (!status.configured) {
    fail("configuração", status.error ?? "variáveis SANKHYA_* ausentes");
    console.log(
      "\nDefina no .env as credenciais do gateway (ver .env.example, seção Sankhya).",
    );
    process.exitCode = 1;
    return;
  }
  ok("configuração", `modo ${status.mode}, ${status.baseUrl}`);

  if (!status.authOk) {
    fail("autenticação", status.error ?? "");
    process.exitCode = 1;
    return;
  }
  ok("autenticação", "bearer token emitido");

  if (!status.queryOk) {
    fail("consulta de teste (loadRecords Parceiro)", status.error ?? "");
    process.exitCode = 1;
    return;
  }
  ok(
    "consulta de teste (loadRecords Parceiro)",
    status.sample ? `parceiro 0 = ${status.sample.NOMEPARC ?? "?"}` : "sem retorno",
  );

  const args = process.argv.slice(2);

  if (args.includes("--vendedores")) {
    console.log("\nCadastro de vendedores (de-para Sankhya → nome):");
    const vendedores = await fetchVendedores();
    for (const v of vendedores) {
      console.log(`  ${v.codVendedorSankhya.padStart(4)}  ${v.nome ?? "?"}${v.ativo ? "" : "  (inativo)"}`);
    }
    console.log(`  total: ${vendedores.length}`);
  }

  const iPilares = args.indexOf("--pilares");
  if (iPilares >= 0) {
    const mes = args[iPilares + 1];
    const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
    if (!m) {
      fail("--pilares", "informe o mês como AAAA-MM (ex.: --pilares 2026-08)");
      process.exitCode = 1;
      return;
    }
    const inicio = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
    const fim = new Date(Date.UTC(+m[1], +m[2], 0)); // último dia do mês
    const periodo = { inicio, fim };
    console.log(`\nPilares de ${mes} (via DbExplorerSP.executeQuery):`);

    for (const [nome, fetcher] of [
      ["1 entrada de pedidos", fetchEntradaPedidos],
      ["2 faturamento", fetchFaturamento],
      ["3 pagamentos", fetchPagamentos],
    ] as const) {
      try {
        const rows = await fetcher(periodo);
        ok(`pilar ${nome}`, `${rows.length} linha(s)`);
        if (rows[0]) console.log("     amostra:", JSON.stringify(rows[0]));
      } catch (err) {
        fail(`pilar ${nome}`, err instanceof Error ? err.message : String(err));
        console.log(
          "     (se for 'serviço não autorizado', pedir liberação do DbExplorerSP;\n" +
            "      se for coluna inexistente, ajustar CAMPOS em src/lib/sankhya/queries.ts)",
        );
      }
    }
  }

  console.log("\nPronto.");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exitCode = 1;
});
