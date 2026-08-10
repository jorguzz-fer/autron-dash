// src/lib/services/metasComissao.ts
//
// Metas de comissão editáveis: grade (vendedor × mês) + importação da planilha
// larga do RH. As metas gravadas alimentam a apuração que já existe (getMetas).

import { prisma } from "@/lib/db";
import { parseMetasPlanilha } from "@/lib/parsers/comissao/metasPlanilha";

/** Normaliza nome pra comparação: sem acento, maiúsculo, espaços colapsados. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Casa o nome curto da planilha (ex: "ALEXSIANO", "JOÃO") com o código de um
 * vendedor cadastrado. Estratégia, em ordem: igualdade normalizada → primeiro
 * nome igual → prefixo. Retorna `null` quando ambíguo ou sem match (o usuário
 * mapeia na tela). Ex.: "WILLIAM" NÃO casa "WILLIAN" (grafia diferente).
 */
export function matchVendedorNome(
  nome: string,
  vendedores: { codigoProtheus: string; nome: string }[],
): string | null {
  const alvo = norm(nome);
  if (!alvo) return null;
  const alvoTok = alvo.split(" ")[0];

  const exato = vendedores.filter((v) => norm(v.nome) === alvo);
  if (exato.length === 1) return exato[0].codigoProtheus;

  const porToken = vendedores.filter((v) => norm(v.nome).split(" ")[0] === alvoTok);
  if (porToken.length === 1) return porToken[0].codigoProtheus;

  const porPrefixo = vendedores.filter((v) => {
    const vn = norm(v.nome);
    return vn.startsWith(alvo) || alvo.startsWith(vn);
  });
  if (porPrefixo.length === 1) return porPrefixo[0].codigoProtheus;

  return null;
}

export interface MetaGridRow {
  codVendedor: string;
  nome: string;
  ativo: boolean;
  /** 12 valores, índice 0 = jan … 11 = dez. */
  valores: number[];
}

/** Grade de metas: uma linha por vendedor cadastrado, 12 meses do ano. */
export async function getMetasGrid(tenantId: string, ano: number): Promise<MetaGridRow[]> {
  const [vendedores, metas] = await Promise.all([
    prisma.comissaoVendedor.findMany({
      where: { tenantId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: { codigoProtheus: true, nome: true, ativo: true },
    }),
    prisma.comissaoMeta.findMany({ where: { tenantId, ano } }),
  ]);

  const byCod = new Map<string, number[]>();
  for (const m of metas) {
    let arr = byCod.get(m.codVendedor);
    if (!arr) {
      arr = new Array<number>(12).fill(0);
      byCod.set(m.codVendedor, arr);
    }
    if (m.mes >= 1 && m.mes <= 12) arr[m.mes - 1] = Number(m.valorMeta);
  }

  return vendedores.map((v) => ({
    codVendedor: v.codigoProtheus,
    nome: v.nome,
    ativo: v.ativo,
    valores: byCod.get(v.codigoProtheus) ?? new Array<number>(12).fill(0),
  }));
}

export interface MetaGridEntry {
  codVendedor: string;
  valores: (number | null)[];
}

/**
 * Substitui TODAS as metas do ano pelo estado da grade (decisão: a planilha/grade
 * é a fonte da verdade do ano). Grava 12 linhas por vendedor (valor 0 quando vazio),
 * mantendo consistência com o formato já existente. Transacional.
 */
export async function saveMetasGrid(
  tenantId: string,
  ano: number,
  entries: MetaGridEntry[],
): Promise<number> {
  const data = entries.flatMap((e) =>
    Array.from({ length: 12 }, (_, i) => ({
      tenantId,
      codVendedor: e.codVendedor,
      ano,
      mes: i + 1,
      valorMeta: e.valores[i] != null && Number.isFinite(e.valores[i] as number) ? (e.valores[i] as number) : 0,
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.comissaoMeta.deleteMany({ where: { tenantId, ano } });
    if (data.length > 0) await tx.comissaoMeta.createMany({ data });
  });
  return data.length;
}

export interface ImportMetasResult {
  ano: number | null;
  matched: { codVendedor: string; nome: string; valores: (number | null)[] }[];
  unmatched: { nome: string; valores: (number | null)[] }[];
  warnings: string[];
}

/** Lê a planilha larga e casa os nomes com o cadastro (sem gravar). */
export async function importMetasPlanilha(
  buffer: Buffer,
  vendedores: { codigoProtheus: string; nome: string }[],
): Promise<ImportMetasResult> {
  const parsed = await parseMetasPlanilha(buffer);
  const matched: ImportMetasResult["matched"] = [];
  const unmatched: ImportMetasResult["unmatched"] = [];
  for (const l of parsed.linhas) {
    const cod = matchVendedorNome(l.nome, vendedores);
    if (cod) matched.push({ codVendedor: cod, nome: l.nome, valores: l.valores });
    else unmatched.push({ nome: l.nome, valores: l.valores });
  }
  return { ano: parsed.ano, matched, unmatched, warnings: parsed.warnings };
}
