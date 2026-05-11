-- AlterTable: adiciona coluna mustChangePassword ao User
-- Usuários existentes mantêm false (não precisam trocar senha).
-- Novos usuários criados pelo admin recebem true automaticamente via aplicação.

ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
