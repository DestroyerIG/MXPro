# ADR 0004 — Inscrições, número de largada e reserva de vaga com Pix

- **Status:** aceita
- **Data:** 2026-11-21
- **Contexto:** `docs/arquitetura.md` §4.2 (inscrição e check-in), §5.5 (pagamentos) e §5.7 (LGPD). O escopo não
  define conta do piloto, quem escolhe o número, inscrição em mais de uma categoria nem reserva de vaga. Essas
  regras foram decididas com o responsável pelo projeto antes da implementação.

## Decisões confirmadas

| Tema | Regra |
|---|---|
| Conta do piloto | A **primeira inscrição cria a conta** (e-mail e senha, perfil Piloto). Nas próximas, o piloto só entra. A conta é a base da área do piloto (histórico, "Ver meus resultados"). |
| Número de largada | O **piloto informa** o número que usa na moto. O sistema recusa número já usado na mesma categoria do evento. A **secretaria pode trocar** depois, com registro de quem trocou e quando. |
| Mais de uma categoria | Permitido: **uma inscrição por categoria**, cada uma com seu pagamento e seu número. |
| Reserva de vaga | O Pix vale **30 minutos** e **segura a vaga** (e o número) nesse tempo. Se vencer, vaga e número ficam livres e o piloto pode gerar um Pix novo. |

## Modelo de dados (migration `inscricoes_pagamentos`)

- **`Registration`** (piloto × categoria do evento). Status:
  - `PENDING_PAYMENT`: aguardando o Pix; tem `holdExpiresAt`.
  - `CONFIRMED`: pagamento confirmado.
  - `EXPIRED`: o Pix venceu sem pagamento.
  - `CANCELED`: cancelada.

  A vistoria (`PENDING`, `APPROVED`, `REJECTED`) é separada do pagamento. O valor é **copiado** da categoria na hora
  da inscrição: mudar o preço depois não altera inscrições já feitas.
- **`Payment`**: cobrança Pix, com gateway, id no gateway, valor em centavos, "copia e cola" e vencimento. Uma
  inscrição pode ter várias, porque o piloto gera outro Pix quando o anterior vence.
- **`PaymentWebhookEvent`**: cada notificação do gateway é guardada como chegou.
- **`Consent`**: registra o que o piloto aceitou, qual versão do texto, quando e de onde:
  - a **política de privacidade**, aceita na conta;
  - o **termo de responsabilidade**, aceito em cada inscrição.

## Regras garantidas pelo próprio banco

Mesmo que um service erre, o PostgreSQL recusa:

- **Número de largada:**
  - é texto de 1 a 3 dígitos, porque **"05" e "5" são placas diferentes** (a tela de pista já usa texto);
  - é único por categoria do evento entre as inscrições **ativas** (aguardando pagamento ou confirmadas). Esse é um
    índice único **parcial**: inscrições vencidas ou canceladas ficam no histórico sem prender o número.
- **Um piloto, uma inscrição ativa por categoria:** também por índice parcial. Depois de vencida, ele pode se
  inscrever de novo.
- **Prazo de reserva:** só existe em `PENDING_PAYMENT`, e é obrigatório nesse status. `CONFIRMED` exige data de
  confirmação.
- **Categoria do mesmo evento:** a inscrição aponta para uma categoria do próprio evento, por FK composta, como nas
  baterias.
- **Uma cobrança Pix em aberto por inscrição.**
- **Webhook idempotente:** a mesma notificação (mesmo id de evento do gateway) não é gravada duas vezes.
- **Consentimento:** o termo de responsabilidade sempre aponta para uma inscrição; a política de privacidade nunca
  aponta.
- **Histórico protegido:** inscrição, pagamento e consentimento não são apagados em cascata. Uma categoria com
  inscrições, mesmo vencidas, **não sai do evento** (`409 CATEGORY_HAS_REGISTRATIONS`).

## Vencimento da reserva

O índice único não pode depender do relógio, porque `now()` não é permitido em índice. Por isso, uma inscrição
`PENDING_PAYMENT` com o prazo vencido continua prendendo o número **até ser marcada `EXPIRED`**. A API faz essa
marcação **antes** de checar vagas e números, dentro da mesma transação da nova inscrição: o piloto nunca é
recusado por uma reserva que já venceu. Uma rotina periódica de limpeza pode vir depois; ela não é necessária para
a regra funcionar.

## Fica para os próximos passos

- **Passo 6.2:** interface `PaymentGateway` (`createPixCharge`, `getCharge`, `handleWebhook`) com uma
  implementação **falsa**, até o contratante escolher o gateway.
- **Pagamento depois do vencimento:** quando o Pix é pago depois de a reserva vencer, a inscrição é confirmada se
  ainda houver vaga e o número estiver livre. Se não houver, o caso vai para a secretaria, como "pago sem vaga",
  para estorno ou exceção. Essa regra será detalhada no passo 6.2.
- **Dados do piloto:** por enquanto só os do escopo (nome, número, categoria, moto, equipe e aceite do termo).
  **CPF, telefone e data de nascimento** entram somente quando houver motivo concreto, como uma exigência do
  gateway, documento do seguro ou idade mínima de categoria. Até lá, ficam como ponto a confirmar com o contratante
  (LGPD: coletar o mínimo).
