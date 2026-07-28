"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireRole, ROLES_MANAGE } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { municipioKey, normalizeGeoToken } from "@/lib/domain/regiaoVendas";
import { regiaoConfigTag } from "@/lib/services/regiaoVendas";

/** Invalida o rollup cacheado da Análise Regional após mudar a configuração. */
function invalidarAnalise(tenantId: string) {
  revalidateTag(regiaoConfigTag(tenantId));
  revalidatePath("/analise-regional/regioes");
  revalidatePath("/analise-regional");
}

type OkEmpty = { ok: true };
type Err = { ok: false; error: string };
type SimpleResult = OkEmpty | Err;

async function getRequestMeta() {
  const hdr = await headers();
  const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
  const userAgent = hdr.get("user-agent");
  return { ip, userAgent };
}

// ── Parsing de UFs e municípios (texto livre → arrays normalizados) ──────────

/** "PR, SC, RS" / "pr sc\nrs" → ["PR","SC","RS"] (2 letras, dedup). */
function parseUfs(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const tok of text.split(/[\s,;]+/)) {
    const uf = normalizeGeoToken(tok);
    if (/^[A-Z]{2}$/.test(uf)) out.add(uf);
  }
  return [...out];
}

/**
 * Lista de municípios (uma "Cidade/UF" por linha ou separada por vírgula) →
 * chaves canônicas "CIDADE/UF". Aceita "Santos/SP", "Santos - SP", "Santos SP".
 */
function parseMunicipios(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const linha = raw.trim();
    if (!linha) continue;
    // separa a UF final (após / - ou último espaço) do nome da cidade
    const m = /^(.*?)[\s/–—-]+([A-Za-z]{2})$/.exec(linha);
    const key = m ? municipioKey(m[1], m[2]) : municipioKey(linha, null);
    if (key) out.add(key);
  }
  return [...out];
}

// ── Região (RegiaoVenda) ────────────────────────────────────────────────────

const regiaoSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(80),
  descricao: z.string().trim().max(280).optional().nullable(),
  cor: z
    .string()
    .trim()
    .regex(/^#?[0-9a-fA-F]{6}$/, "Cor deve ser hex (ex.: #009da4)")
    .optional()
    .nullable()
    .or(z.literal("")),
  vendedorCodigo: z.string().trim().max(30).optional().nullable(),
  nomeVendedor: z.string().trim().max(120).optional().nullable(),
  ufsText: z.string().max(400).optional().nullable(),
  municipiosText: z.string().max(8000).optional().nullable(),
  ordem: z.coerce.number().int().min(0).max(9999).optional().nullable(),
  ativo: z.boolean().optional(),
});

export type RegiaoInput = z.input<typeof regiaoSchema>;

function normalizeCor(cor: string | null | undefined): string | null {
  if (!cor) return null;
  const c = cor.trim();
  if (!c) return null;
  return c.startsWith("#") ? c : `#${c}`;
}

export async function criarRegiao(input: RegiaoInput): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_MANAGE);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = regiaoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const ufs = parseUfs(d.ufsText);
  const municipios = parseMunicipios(d.municipiosText);
  if (ufs.length === 0 && municipios.length === 0) {
    return { ok: false, error: "Informe ao menos uma UF ou um município para a região" };
  }

  const existing = await prisma.regiaoVenda.findFirst({
    where: { tenantId: session.user.tenantId, nome: d.nome },
  });
  if (existing) return { ok: false, error: `Já existe uma região chamada "${d.nome}"` };

  try {
    const created = await prisma.regiaoVenda.create({
      data: {
        tenantId: session.user.tenantId,
        nome: d.nome,
        descricao: d.descricao || null,
        cor: normalizeCor(d.cor),
        vendedorCodigo: d.vendedorCodigo || null,
        nomeVendedor: d.nomeVendedor || null,
        ufs,
        municipios,
        ordem: d.ordem ?? 0,
        ativo: d.ativo ?? true,
      },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "regiao.create",
      entity: "RegiaoVenda",
      entityId: created.id,
      meta: { nome: d.nome, ufs, municipios: municipios.length },
      ip,
      userAgent,
    });

    invalidarAnalise(session.user.tenantId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao criar região" };
  }
}

export async function atualizarRegiao(id: string, input: RegiaoInput): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_MANAGE);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;
  if (!id?.trim()) return { ok: false, error: "ID obrigatório" };

  const parsed = regiaoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const ufs = parseUfs(d.ufsText);
  const municipios = parseMunicipios(d.municipiosText);
  if (ufs.length === 0 && municipios.length === 0) {
    return { ok: false, error: "Informe ao menos uma UF ou um município para a região" };
  }

  const target = await prisma.regiaoVenda.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!target) return { ok: false, error: "Região não encontrada" };

  if (target.nome !== d.nome) {
    const conflict = await prisma.regiaoVenda.findFirst({
      where: { tenantId: session.user.tenantId, nome: d.nome },
    });
    if (conflict && conflict.id !== id) return { ok: false, error: `Nome "${d.nome}" já em uso` };
  }

  try {
    await prisma.regiaoVenda.update({
      where: { id },
      data: {
        nome: d.nome,
        descricao: d.descricao || null,
        cor: normalizeCor(d.cor),
        vendedorCodigo: d.vendedorCodigo || null,
        nomeVendedor: d.nomeVendedor || null,
        ufs,
        municipios,
        ordem: d.ordem ?? target.ordem,
        ativo: d.ativo ?? target.ativo,
      },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "regiao.update",
      entity: "RegiaoVenda",
      entityId: id,
      meta: { nome: d.nome, ufs, municipios: municipios.length },
      ip,
      userAgent,
    });

    invalidarAnalise(session.user.tenantId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao atualizar região" };
  }
}

export async function excluirRegiao(id: string): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_MANAGE);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;
  if (!id?.trim()) return { ok: false, error: "ID obrigatório" };

  const target = await prisma.regiaoVenda.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!target) return { ok: false, error: "Região não encontrada" };

  try {
    await prisma.regiaoVenda.delete({ where: { id } });
    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "regiao.delete",
      entity: "RegiaoVenda",
      entityId: id,
      meta: { nome: target.nome },
      ip,
      userAgent,
    });
    invalidarAnalise(session.user.tenantId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao excluir região" };
  }
}

// ── Override de geografia por cliente ───────────────────────────────────────

const overrideSchema = z.object({
  clienteKey: z.string().trim().min(1, "Cliente obrigatório").max(200),
  clienteLabel: z.string().trim().max(200).optional().nullable(),
  municipio: z.string().trim().max(120).optional().nullable(),
  uf: z.string().trim().max(2).optional().nullable(),
  regiaoId: z.string().trim().max(40).optional().nullable(),
});

export type OverrideInput = z.input<typeof overrideSchema>;

/** Corrige/define a geografia (ou fixa a região) de um cliente pelo nome normalizado. */
export async function salvarOverride(input: OverrideInput): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_MANAGE);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const municipio = d.municipio?.trim() || null;
  const uf = d.uf ? normalizeGeoToken(d.uf) : null;
  const regiaoId = d.regiaoId?.trim() || null;
  if (!municipio && !uf && !regiaoId) {
    return { ok: false, error: "Informe cidade/UF ou fixe uma região" };
  }
  if (regiaoId) {
    const r = await prisma.regiaoVenda.findFirst({
      where: { id: regiaoId, tenantId: session.user.tenantId },
    });
    if (!r) return { ok: false, error: "Região inválida" };
  }

  try {
    await prisma.clienteGeoOverride.upsert({
      where: { tenantId_clienteKey: { tenantId: session.user.tenantId, clienteKey: d.clienteKey } },
      update: {
        clienteLabel: d.clienteLabel || null,
        municipio,
        uf,
        regiaoId,
        atualizadoPor: session.user.id,
      },
      create: {
        tenantId: session.user.tenantId,
        clienteKey: d.clienteKey,
        clienteLabel: d.clienteLabel || null,
        municipio,
        uf,
        regiaoId,
        atualizadoPor: session.user.id,
      },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "regiao.override",
      entity: "ClienteGeoOverride",
      entityId: d.clienteKey,
      meta: { municipio, uf, regiaoId },
      ip,
      userAgent,
    });

    invalidarAnalise(session.user.tenantId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao salvar correção" };
  }
}
