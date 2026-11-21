-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('MOTOCROSS', 'ENDURO', 'ENDURO_REGULARITY', 'CROSS_COUNTRY', 'SUPERCROSS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "HeatStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELED');

-- CreateTable
CREATE TABLE "championships" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "championships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "championship_id" UUID,
    "stage_number" INTEGER,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "time_zone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "venue" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "registration_opens_at" TIMESTAMPTZ(3),
    "registration_closes_at" TIMESTAMPTZ(3),
    "registration_closed_early" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "modality" "Modality" NOT NULL,
    "entry_fee_cents" INTEGER NOT NULL,
    "max_entries" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heats" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3),
    "status" "HeatStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "heats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heat_categories" (
    "heat_id" UUID NOT NULL,
    "event_category_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,

    CONSTRAINT "heat_categories_pkey" PRIMARY KEY ("heat_id","event_category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "championships_name_season_key" ON "championships"("name", "season");

-- CreateIndex
CREATE INDEX "events_start_date_idx" ON "events"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "events_championship_id_stage_number_key" ON "events"("championship_id", "stage_number");

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_event_id_category_id_key" ON "event_categories"("event_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_id_event_id_key" ON "event_categories"("id", "event_id");

-- CreateIndex
CREATE INDEX "heats_event_id_scheduled_at_idx" ON "heats"("event_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "heats_id_event_id_key" ON "heats"("id", "event_id");

-- CreateIndex
CREATE INDEX "heat_categories_event_category_id_idx" ON "heat_categories"("event_category_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heats" ADD CONSTRAINT "heats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heat_categories" ADD CONSTRAINT "heat_categories_heat_id_event_id_fkey" FOREIGN KEY ("heat_id", "event_id") REFERENCES "heats"("id", "event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heat_categories" ADD CONSTRAINT "heat_categories_event_category_id_event_id_fkey" FOREIGN KEY ("event_category_id", "event_id") REFERENCES "event_categories"("id", "event_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── Regras garantidas pelo próprio banco (valem mesmo se algum código esquecer de validar) ───

-- Nomes nunca vazios (nem só espaços).
ALTER TABLE "championships" ADD CONSTRAINT "championships_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "events" ADD CONSTRAINT "events_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "heats" ADD CONSTRAINT "heats_name_not_blank" CHECK (btrim("name") <> '');

-- Temporada plausível (ano com 4 dígitos).
ALTER TABLE "championships" ADD CONSTRAINT "championships_season_range" CHECK ("season" BETWEEN 2000 AND 2100);

-- Evento: termina no mesmo dia ou depois de começar.
ALTER TABLE "events" ADD CONSTRAINT "events_dates_order" CHECK ("end_date" >= "start_date");
-- Número de etapa só existe dentro de um campeonato, e é positivo.
ALTER TABLE "events" ADD CONSTRAINT "events_stage_needs_championship" CHECK ("stage_number" IS NULL OR "championship_id" IS NOT NULL);
ALTER TABLE "events" ADD CONSTRAINT "events_stage_positive" CHECK ("stage_number" IS NULL OR "stage_number" > 0);
-- UF: duas letras maiúsculas.
ALTER TABLE "events" ADD CONSTRAINT "events_state_uf" CHECK ("state" ~ '^[A-Z]{2}$');
-- Janela de inscrições: encerra depois de abrir.
ALTER TABLE "events" ADD CONSTRAINT "events_registration_window" CHECK (
  "registration_opens_at" IS NULL OR "registration_closes_at" IS NULL OR "registration_closes_at" > "registration_opens_at"
);

-- Catálogo: "MX2" e "mx2 " são a mesma categoria.
CREATE UNIQUE INDEX "categories_name_unique_ci" ON "categories" (lower(btrim("name")));

-- Dinheiro em centavos, nunca negativo; vagas, quando houver limite, positivas.
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_fee_non_negative" CHECK ("entry_fee_cents" >= 0);
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_max_entries_positive" CHECK ("max_entries" IS NULL OR "max_entries" > 0);
