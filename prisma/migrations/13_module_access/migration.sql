-- 13_module_access: controle de acesso por módulo por usuário.
-- allowedModules = array de chaves de módulo (ex.: 'DASHBOARD', 'FATURAMENTO').
-- Array vazio (default) = usar padrão do perfil (role).
-- Array preenchido = whitelist explícita — sobrepõe o padrão do perfil.
ALTER TABLE "User" ADD COLUMN "allowedModules" TEXT[] NOT NULL DEFAULT '{}';
