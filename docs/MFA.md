# MFA (Verificação em duas etapas) — Operação e Troubleshooting

Segundo fator **TOTP** (app autenticador: Google Authenticator, Authy, 1Password,
Microsoft Authenticator), **obrigatório para todos os usuários**. Segue o mesmo
padrão de `mustChangePassword`: o middleware força a configuração no 1º acesso e
a verificação a cada novo login.

Implementação **sem dependências externas** (a política de rede do build bloqueia
`npm install` de libs novas):
- `src/lib/totp.ts` — TOTP RFC 6238 + Base32 (sobre `node:crypto`).
- `src/lib/mfaCrypto.ts` — cifra o segredo TOTP em repouso (AES-256-GCM).
- `src/lib/qr.ts` + `src/lib/vendor/qrcodegen.ts` — QR em SVG, gerado no servidor.
- `src/lib/services/mfa.ts` — setup, verificação, códigos de recuperação, reset.

---

## ⚠️ Variáveis de ambiente obrigatórias (produção)

| Var | Obrigatória | Papel |
|-----|-------------|-------|
| `AUTH_SECRET` | sim | Assina a sessão JWT **e** deriva a chave de cifragem do MFA (se `MFA_ENCRYPTION_KEY` ausente). **Precisa ser FIXO entre deploys.** |
| `MFA_ENCRYPTION_KEY` | recomendada | Chave dedicada (AES-256) para cifrar o segredo TOTP. Desacopla o MFA do `AUTH_SECRET`. **Precisa ser FIXO.** |
| `AUTH_URL` | sim | URL pública (ex.: `https://dash.autron.com.br`). Sem ela, links como "Sair" apontam para `0.0.0.0:3000`. |
| `AUTH_TRUST_HOST` | sim | `true` atrás de proxy (Coolify). |

Gere os segredos com `openssl rand -base64 32`.

> **A regra de ouro:** uma vez que usuários cadastraram o MFA, **NUNCA** troque
> `AUTH_SECRET`/`MFA_ENCRYPTION_KEY`. Trocar = os segredos salvos não
> descriptografam mais → **todo código vira "código inválido"** e todos precisam
> reconfigurar. Em Coolify, defina-os como variáveis de ambiente fixas (não
> deixe o app gerar um secret efêmero por deploy).

---

## Fluxo

1. **1º login** (sem MFA): middleware → `/mfa/configurar`. Usuário escaneia o QR,
   digita o código, confirma. São gerados 10 códigos de recuperação (exibidos
   uma única vez). MFA fica ativo.
2. **Logins seguintes**: após senha, middleware → `/mfa/verificar`. Usuário digita
   o código de 6 dígitos (ou um código de recuperação) e entra.
3. **Admin** pode resetar o MFA de um usuário em **Usuários → Resetar MFA**
   (ex.: perda de dispositivo). O usuário reconfigura no próximo acesso.

---

## Scripts de operação (terminal do container Coolify)

```sh
# Zera o MFA de TODOS os usuários (ou de um e-mail):
node /app/scripts/reset-mfa.js
node /app/scripts/reset-mfa.js fer.jorge@gmail.com

# Diagnóstico: hora do servidor, se o segredo descriptografa e qual código
# o servidor espera AGORA (compare com o app):
node /app/scripts/mfa-doctor.js fer.jorge@gmail.com
```

> Os scripts só existem no container **após um deploy** que os inclua. Em um build
> antigo, use as versões inline (`node -e '...'`) — ver histórico ou peça ao time.

---

## Troubleshooting

### "Código inválido" mesmo com o código certo
Rode `mfa-doctor.js` e siga:

1. **`DECRYPT FALHOU`** → `AUTH_SECRET`/`MFA_ENCRYPTION_KEY` mudou desde o
   cadastro. **Causa nº1.** Conserto: fixe as chaves no Coolify → `reset-mfa.js`
   → reconfigurar.
2. **`DECRYPT OK` mas o código do servidor ≠ app**:
   - Números totalmente diferentes → o app tem **entradas "Autron Dash" antigas**
     (dos testes). Apague TODAS e reconfigure.
   - Hora do servidor (UTC impressa) muito fora da real → **relógio/NTP** do host.
   - Tolerância já é de ±60s (`verifyTotp` window=2).

### Pede para reconfigurar a cada login (não deveria)
Já corrigido: `startMfaSetup` não reseta mais `mfaEnabled` no render
(commits da branch de MFA). Se reaparecer, confirme que o build em produção
inclui esses commits.

### Digita o código certo, não dá erro, mas não entra
Cookie de sessão (`mfaVerified`) não estava sendo aplicado antes da navegação.
Corrigido com navegação "hard" (`window.location.assign`) após login/verificação.
Se persistir mesmo assim, é o `unstable_update` falhando no runtime — a correção
definitiva é coletar o código TOTP na própria tela de login (single-step).

### "Sair" / redirects apontando para `0.0.0.0:3000`
Falta `AUTH_URL` (URL pública) e/ou `AUTH_TRUST_HOST=true`.

---

## Reset de emergência (SQL direto no banco)

```sql
UPDATE "User" SET "mfaEnabled"=false, "mfaSecret"=NULL, "mfaConfirmedAt"=NULL;
DELETE FROM "MfaBackupCode";
```
> Rode em um **cliente SQL / no banco**, não no shell `sh` do container
> (lá, `node /app/scripts/reset-mfa.js` é o equivalente).
