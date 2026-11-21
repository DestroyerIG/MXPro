-- CreateTable
CREATE TABLE "mercado_pago_accounts" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mp_user_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "public_key" TEXT,
    "scope" TEXT,
    "live_mode" BOOLEAN NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "connected_by_id" UUID,
    "connected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mercado_pago_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "code_verifier" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states"("expires_at");

-- AddForeignKey
ALTER TABLE "mercado_pago_accounts" ADD CONSTRAINT "mercado_pago_accounts_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma só conta conectada (single-tenant), como a tabela de configurações.
ALTER TABLE "mercado_pago_accounts" ADD CONSTRAINT "mercado_pago_accounts_single_row" CHECK ("id" = 1);
ALTER TABLE "mercado_pago_accounts" ADD CONSTRAINT "mercado_pago_accounts_tokens_not_blank"
  CHECK (btrim("access_token_encrypted") <> '' AND btrim("refresh_token_encrypted") <> '');
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_expires_after_creation" CHECK ("expires_at" > "created_at");
