-- CreateTable
CREATE TABLE "race_config_versions" (
    "id" UUID NOT NULL,
    "event_category_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "race_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "race_config_versions_event_category_id_version_key" ON "race_config_versions"("event_category_id", "version");

-- AddForeignKey
ALTER TABLE "race_config_versions" ADD CONSTRAINT "race_config_versions_event_category_id_fkey" FOREIGN KEY ("event_category_id") REFERENCES "event_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_config_versions" ADD CONSTRAINT "race_config_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Versões começam em 1; motivo, quando informado, não pode ser vazio.
ALTER TABLE "race_config_versions" ADD CONSTRAINT "race_config_versions_version_positive" CHECK ("version" > 0);
ALTER TABLE "race_config_versions" ADD CONSTRAINT "race_config_versions_reason_not_blank" CHECK ("reason" IS NULL OR btrim("reason") <> '');
-- A configuração é sempre um objeto JSON com schemaVersion (o motor valida o resto).
ALTER TABLE "race_config_versions" ADD CONSTRAINT "race_config_versions_config_versioned" CHECK (jsonb_typeof("config") = 'object' AND "config" ? 'schemaVersion');
