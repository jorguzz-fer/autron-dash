"use strict";
/**
 * MFA doctor — diagnóstico do segundo fator dentro do container (Coolify).
 *
 * Para um usuário, mostra:
 *  - hora do servidor (para comparar com o relógio do celular);
 *  - se o segredo TOTP guardado DESCRIPTOGRAFA com a chave atual
 *    (MFA_ENCRYPTION_KEY || AUTH_SECRET) — se não, a chave mudou e todo código
 *    cai em "código inválido";
 *  - o código TOTP que o servidor espera AGORA (e os vizinhos), para você
 *    comparar com o número que aparece no app autenticador.
 *
 * Uso: node /app/scripts/mfa-doctor.js fer.jorge@gmail.com
 */
const { PrismaClient } = require("@prisma/client");
const { createDecipheriv, scryptSync, createHmac } = require("crypto");

const prisma = new PrismaClient();

function mfaKey() {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("MFA_ENCRYPTION_KEY/AUTH_SECRET ausente no environment.");
  return scryptSync(secret, "autron-dash:mfa", 32);
}

function decryptSecret(stored) {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", mfaKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32decode(s) {
  s = s.toUpperCase().replace(/\s+/g, "").replace(/=+$/g, "");
  let bits = 0, val = 0; const by = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i === -1) throw new Error("base32 inválido");
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { by.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(by);
}
function hotp(sec, ctr) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(ctr / 0x100000000), 0);
  buf.writeUInt32BE(ctr >>> 0, 4);
  const h = createHmac("sha1", sec).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return (bin % 1000000).toString().padStart(6, "0");
}

async function main() {
  const email = (process.argv[2] || "").toLowerCase().trim();
  if (!email) {
    console.error("Informe o e-mail: node /app/scripts/mfa-doctor.js seu@email.com");
    process.exit(1);
  }

  const now = new Date();
  console.log("Hora do servidor (UTC):", now.toISOString());
  console.log("Epoch:", Math.floor(now.getTime() / 1000));
  console.log("Chave de cifragem:", process.env.MFA_ENCRYPTION_KEY ? "MFA_ENCRYPTION_KEY" : (process.env.AUTH_SECRET ? "AUTH_SECRET (derivada)" : "AUSENTE!"));
  console.log("");

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, mfaEnabled: true, mfaSecret: true },
  });
  if (!user) { console.log(`Nenhum usuário com e-mail "${email}".`); return; }

  console.log("Usuário:", user.email, "| mfaEnabled:", user.mfaEnabled, "| temSegredo:", !!user.mfaSecret);
  if (!user.mfaSecret) { console.log("→ Sem segredo guardado. Faça a configuração do MFA."); return; }

  let secret;
  try {
    secret = decryptSecret(user.mfaSecret);
  } catch {
    console.log("");
    console.log("✗ FALHA ao descriptografar o segredo com a chave atual.");
    console.log("  Causa: a chave (AUTH_SECRET/MFA_ENCRYPTION_KEY) MUDOU desde o cadastro.");
    console.log("  Conserto: fixe AUTH_SECRET + MFA_ENCRYPTION_KEY no Coolify, rode");
    console.log("  reset-mfa.js e reconfigure o app. (É a causa nº1 de 'código inválido'.)");
    return;
  }

  const ctr = Math.floor(now.getTime() / 1000 / 30);
  console.log("✓ Segredo descriptografado com sucesso.");
  console.log("");
  console.log("Código que o SERVIDOR aceita agora (compare com o do seu app):");
  console.log("   anterior:", hotp(secret, ctr - 1));
  console.log("   ATUAL   :", hotp(secret, ctr), " <-- deve bater com o app");
  console.log("   próximo :", hotp(secret, ctr + 1));
  console.log("");
  console.log("Se o ATUAL NÃO bate com o app:");
  console.log("  - números totalmente diferentes → app aponta para outra conta/segredo");
  console.log("    (apague entradas 'Autron Dash' antigas e reconfigure), ou relógio do");
  console.log("    servidor muito fora (compare a hora UTC acima com a real).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
