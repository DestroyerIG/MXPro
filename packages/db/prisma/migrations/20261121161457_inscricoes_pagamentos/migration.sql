-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('PRIVACY_POLICY', 'LIABILITY_WAIVER');

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_category_id" UUID NOT NULL,
    "pilot_id" UUID NOT NULL,
    "race_number" VARCHAR(3) NOT NULL,
    "bike" TEXT NOT NULL,
    "team" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "entry_fee_cents" INTEGER NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "inspection_status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "inspected_at" TIMESTAMPTZ(3),
    "inspected_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_charge_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "pix_copy_paste" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "registration_id" UUID,
    "kind" "ConsentKind" NOT NULL,
    "document_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registrations_event_id_status_idx" ON "registrations"("event_id", "status");

-- CreateIndex
CREATE INDEX "registrations_event_category_id_status_idx" ON "registrations"("event_category_id", "status");

-- CreateIndex
CREATE INDEX "registrations_pilot_id_idx" ON "registrations"("pilot_id");

-- CreateIndex
CREATE INDEX "payments_registration_id_idx" ON "payments"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_charge_id_key" ON "payments"("provider", "provider_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "consents_user_id_idx" ON "consents"("user_id");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_category_id_event_id_fkey" FOREIGN KEY ("event_category_id", "event_id") REFERENCES "event_categories"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_pilot_id_fkey" FOREIGN KEY ("pilot_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- ─── Regras garantidas pelo próprio banco (ADR 0004) ───

-- Nº de largada: texto de 1 a 3 dígitos ("05" e "5" são placas diferentes).
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_race_number_digits" CHECK ("race_number" ~ '^[0-9]{1,3}$');
-- Entre as inscrições ATIVAS (aguardando pagamento ou confirmadas), cada número aparece uma vez
-- por categoria do evento, e cada piloto se inscreve uma vez por categoria. Inscrições vencidas ou
-- canceladas ficam no histórico sem prender o número.
CREATE UNIQUE INDEX "registrations_active_race_number_key" ON "registrations"("event_category_id", "race_number")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED');
CREATE UNIQUE INDEX "registrations_active_pilot_key" ON "registrations"("event_category_id", "pilot_id")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED');
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_entry_fee_not_negative" CHECK ("entry_fee_cents" >= 0);
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_bike_not_blank" CHECK (btrim("bike") <> '');
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_team_not_blank" CHECK ("team" IS NULL OR btrim("team") <> '');
-- Aguardando pagamento sempre tem prazo de reserva; só ela tem.
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_hold_only_when_pending"
  CHECK (("status" = 'PENDING_PAYMENT') = ("hold_expires_at" IS NOT NULL));
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_confirmed_has_date"
  CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL);
-- Vistoria decidida tem quando (quem pode ficar nulo se o usuário for removido).
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_inspection_has_date"
  CHECK (("inspection_status" = 'PENDING') = ("inspected_at" IS NULL));

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_has_date" CHECK ("status" NOT IN ('PAID', 'REFUNDED') OR "paid_at" IS NOT NULL);
-- No máximo UMA cobrança em aberto por inscrição (gerar outro Pix exige o anterior vencido/cancelado).
CREATE UNIQUE INDEX "payments_one_pending_per_registration_key" ON "payments"("registration_id") WHERE "status" = 'PENDING';

-- Termo de responsabilidade é sempre de uma inscrição; a política de privacidade, da conta.
ALTER TABLE "consents" ADD CONSTRAINT "consents_registration_only_for_waiver"
  CHECK (("kind" = 'LIABILITY_WAIVER') = ("registration_id" IS NOT NULL));
ALTER TABLE "consents" ADD CONSTRAINT "consents_document_version_not_blank" CHECK (btrim("document_version") <> '');
