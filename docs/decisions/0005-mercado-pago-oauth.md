# ADR 0005 — Mercado Pago com OAuth na conta do contratante

- **Status:** aceita
- **Data:** 2026-11-21
- **Contexto:**
  - `docs/arquitetura.md` §5.5 deixava o gateway de pagamento em aberto, atrás de uma interface.
  - O ADR 0004 previa uma implementação falsa até a escolha. O responsável pelo projeto definiu o gateway: **Mercado
    Pago**, recebendo **na conta do próprio contratante**, conectada por **OAuth**.

## Decisão

- O MXPro tem um **aplicativo** no Mercado Pago, criado em "Suas integrações". As credenciais do aplicativo
  (`client_id` e `client_secret`) ficam só nas variáveis de ambiente do servidor.
- O **organizador conecta a conta do contratante** na tela **Financeiro**:
  1. clica em "Conectar";
  2. entra e autoriza no site do Mercado Pago;
  3. volta para o MXPro com a conta conectada.
- O sistema nunca vê a senha do Mercado Pago. A partir da conexão, as cobranças Pix são criadas com o **access token
  do vendedor** e o dinheiro cai direto na conta do contratante.
- **Não há gateway falso em produção.** Os testes automáticos usam uma versão **simulada** da API do Mercado Pago,
  sem rede. O código de pagamento fica atrás de interfaces, então a troca de gateway continua possível (§2.9).
- **Comissão de plataforma** (`application_fee`): **não usada**. O sistema é exclusivo do contratante e não
  intermedeia o dinheiro.

## Como a conexão funciona (passo 6.2)

Os detalhes seguem a documentação oficial:
- `/developers/pt/docs/security/oauth/creation`;
- `/developers/pt/docs/security/oauth/renewal`;
- a referência `POST /oauth/token`.

**Fluxo:** OAuth **authorization code com PKCE (S256)**.
- **URL de autorização:** `https://auth.mercadopago.com/authorization`, com `client_id`, `response_type=code`,
  `platform_id=mp`, `state`, `redirect_uri`, `code_challenge` e `code_challenge_method=S256`.
- **`state`:** valor aleatório de 32 bytes que só fica no banco como **hash**. Ele vale 10 minutos (o mesmo prazo
  do código do Mercado Pago), pertence a quem iniciou e só pode ser usado **uma vez**. Isso protege contra CSRF e
  contra o reaproveitamento do retorno.
- **Retorno:** `GET /api/payments/mercadopago/callback`. É uma **navegação** do navegador, por isso a rota sempre
  redireciona para `/painel/financeiro?mercadopago=<resultado>` e nunca responde JSON. Os resultados possíveis são
  `conectado`, `negado`, `expirado`, `sessao`, `falha` e `nao-configurado`.
- **Troca do código:** `POST https://api.mercadopago.com/oauth/token`, com `grant_type=authorization_code`, o
  `code_verifier` e o `redirect_uri`. O `test_token` vem de `MP_TEST_MODE`.
- **Tokens:**
  - o access token vale **180 dias** (`expires_in` = 15552000);
  - a API renova sozinha quando faltam menos de 30 dias, com `grant_type=refresh_token`;
  - o **refresh token muda a cada renovação**, então o novo é guardado. A renovação roda sob um *advisory lock* do
    Postgres, porque duas renovações ao mesmo tempo fariam uma delas usar um refresh token já trocado;
  - se a renovação falhar, a API segue com o token atual enquanto ele valer. Depois de vencido, pede que o
    organizador conecte de novo.
- **Guarda dos tokens:** criptografados com **AES-256-GCM** (`PAYMENT_TOKEN_KEY`, 32 bytes). A criptografia
  autenticada faz a leitura falhar se o dado for adulterado. Os tokens nunca saem da API: a tela vê só a conta, o
  modo (produção ou teste), quem conectou e a validade.
- **Permissão:** só o **organizador** vê e altera a conexão (é a conta bancária do contratante).
- **Single-tenant:** há no máximo uma conta conectada (tabela `mercado_pago_accounts` com `id = 1`, garantido por
  `CHECK`).

## Cobrança Pix e webhook (próximo passo)

A documentação recomenda a **API de Orders** para integrações novas:
- **Criar a cobrança:** `POST https://api.mercadopago.com/v1/orders`, com `X-Idempotency-Key` obrigatório e
  `payment_method` = `pix` / `bank_transfer`.
- **Resposta:** traz o "copia e cola" em `transactions.payments[].payment_method.qr_code`, além de
  `qr_code_base64` e `ticket_url`.
- **Vencimento:** o Pix aceita de **30 minutos a 30 dias**. Os 30 minutos de reserva do ADR 0004 cabem no mínimo.
- **Pix vencido:** aparece como `status=canceled` com `status_detail=expired`. Não existe um status `expired` no
  pedido.
- **Cancelar:** `POST /v1/orders/{id}/cancel`.
- **Webhook:** tópico `order`. O valor do aviso **nunca é confiado**: a API sempre consulta
  `GET /v1/orders/{id}` com o token do vendedor antes de confirmar uma inscrição.

**Pontos a confirmar na implementação**, testando na sandbox, porque a documentação não é explícita:
- a montagem exata da assinatura `x-signature` (HMAC) e qual segredo assina os avisos de pagamentos feitos com o
  token de um vendedor conectado por OAuth;
- o nome do campo de URL de notificação por pedido na API de Orders;
- se o CPF do pagador é obrigatório no Pix em produção.

## Consequências

- **Para quem instala o sistema:**
  1. criar o aplicativo no Mercado Pago;
  2. cadastrar a URL de retorno exatamente igual a `MP_REDIRECT_URI`;
  3. habilitar o PKCE no aplicativo;
  4. preencher as variáveis `MP_*` e `PAYMENT_TOKEN_KEY`.
- **Trocar a `PAYMENT_TOKEN_KEY`** invalida a conexão salva, e será preciso conectar a conta de novo.
- **Em desenvolvimento:** o retorno do OAuth e o webhook precisam de uma URL alcançável pelo Mercado Pago. A
  documentação usa HTTPS nos exemplos, então pode ser preciso um túnel (HTTPS público) para testar fora de
  produção.
