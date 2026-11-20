-- Single-tenant: a tabela de configurações tem exatamente uma linha (id = 1).
ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row" CHECK ("id" = 1);

-- Cor da marca sempre no formato #RRGGBB (o front deriva os outros tons a partir dela).
ALTER TABLE "settings" ADD CONSTRAINT "settings_primary_color_hex" CHECK ("primary_color" ~ '^#[0-9A-Fa-f]{6}$');

-- E-mail sempre gravado em minúsculas (a unicidade não pode depender de maiúsculas/minúsculas).
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
