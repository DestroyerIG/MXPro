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

## Cobrança Pix e webhook (passo 6.3)

**Cobrança** (API de Orders, recomendada pela documentação para integrações novas):
- `POST https://api.mercadopago.com/v1/orders` com o **token do vendedor**, `processing_mode=automatic`,
  `payment_method` = `pix` / `bank_transfer` e `expiration_time` = `PT30M` (o Pix aceita de 30 minutos a 30 dias).
- **Idempotência:** o `X-Idempotency-Key` é o id do **nosso** pagamento. Se a resposta se perder e o pedido for
  repetido, o Mercado Pago devolve o mesmo Pix em vez de criar outro.
- **Pix ainda válido:** pedir o Pix de novo devolve o mesmo QR Code, sem chamar o Mercado Pago.
- **Reserva:** fica alinhada ao vencimento do Pix.
- **"Copia e cola":** vem em `transactions.payments[].payment_method.qr_code`. O QR Code é desenhado a partir dele.

**Quem diz que foi pago é o Mercado Pago, consultado por nós.** O conteúdo do aviso nunca é tomado como verdade:
a API sempre lê `GET /v1/orders/{id}` com o token do vendedor e aplica o estado lido. Há **dois caminhos** que
chegam na mesma função, que é idempotente e trava o pagamento (`FOR UPDATE`) para webhook e consulta simultâneos
não confirmarem duas vezes:
1. **Webhook** `POST /api/payments/mercadopago/webhook`, tópico **order**:
   - confere a assinatura `x-signature` e guarda cada aviso uma vez (`x-request-id`);
   - um aviso repetido já processado não é processado de novo;
   - pedidos que não são nossos (outras vendas da conta) recebem 200 e são ignorados.
2. **Consulta pela tela "Aguardando pagamento":** no máximo uma consulta a cada 10 segundos por pagamento, mesmo
   com vários celulares abertos. É a **rede de segurança**, porque a documentação não garante qual segredo assina
   os avisos de pagamentos feitos com o token de uma conta conectada por OAuth.

**Assinatura do webhook:** confirmada no código-fonte do SDK oficial (`mercadopago/sdk-nodejs`,
`src/utils/webhook`):
- manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, omitindo as partes ausentes;
- **HMAC-SHA256** em hexadecimal com `MP_WEBHOOK_SECRET`;
- comparação em tempo constante;
- tolerância de 10 minutos contra o reenvio de um aviso antigo capturado.

A documentação antiga pedia o `data.id` em minúsculas e o SDK atual usa o valor como veio. Aceitamos as duas
formas, e ambas exigem o segredo.

**Estado do pedido → inscrição:**

| Mercado Pago (`status`/`status_detail`) | Pagamento | Inscrição |
|---|---|---|
| `processed` (accredited, partially_refunded) | PAID, se o valor pago cobre a inscrição | CONFIRMED |
| `action_required`, `created`, `processing` | continua PENDING | continua aguardando |
| `canceled`/`expired`, `failed`/`expired` | EXPIRED | EXPIRED: vaga e número liberados |
| `canceled`, `failed` (outros motivos) | CANCELED | EXPIRED |
| `refunded`, `charged_back` | REFUNDED | CANCELED |

**Casos especiais:**
- **Valor pago menor que o da inscrição:** não confirma.
- **Pago depois de a reserva vencer:**
  - confirma se ainda houver vaga e o número estiver livre;
  - se não, fica **"pago sem vaga"** (pagamento PAGO com inscrição vencida), para a secretaria resolver com estorno
    ou exceção.

**Ainda a confirmar na sandbox:**
- qual segredo assina os avisos de pagamentos feitos com o token de uma conta conectada por OAuth (a consulta pela
  tela cobre o caso de não chegar nenhum aviso válido);
- se o CPF do pagador é obrigatório no Pix em produção (hoje só enviamos o e-mail).

## Consequências

- **Para quem instala o sistema:**
  1. criar o aplicativo no Mercado Pago;
  2. cadastrar a URL de retorno exatamente igual a `MP_REDIRECT_URI`;
  3. habilitar o PKCE no aplicativo;
  4. cadastrar o webhook `https://<domínio>/api/payments/mercadopago/webhook` com o evento "Order (Mercado Pago)" e
     copiar a assinatura secreta para `MP_WEBHOOK_SECRET`;
  5. preencher as demais variáveis `MP_*` e a `PAYMENT_TOKEN_KEY`.
- **Trocar a `PAYMENT_TOKEN_KEY`** invalida a conexão salva, e será preciso conectar a conta de novo.
- **Em desenvolvimento:** o retorno do OAuth e o webhook precisam de uma URL alcançável pelo Mercado Pago. A
  documentação usa HTTPS nos exemplos, então pode ser preciso um túnel (HTTPS público) para testar fora de
  produção.
