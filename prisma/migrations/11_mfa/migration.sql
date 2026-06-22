-- MFA (TOTP) — segundo fator obrigatório para todos os usuários.
-- Espelha o padrão de `mustChangePassword`: enquanto mfaEnabled=false o
-- middleware força o usuário a configurar o app autenticador.

-- AlterTable: campos de MFA no usuário
ALTER TABLE "User" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "mfaConfirmedAt" TIMESTAMP(3);

-- CreateTable: códigos de recuperação (one-time, guardamos só o hash)
CREATE TABLE "MfaBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfaBackupCode_userId_idx" ON "MfaBackupCode"("userId");

-- AddForeignKey
ALTER TABLE "MfaBackupCode" ADD CONSTRAINT "MfaBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
