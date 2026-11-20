# ADR 0001 — Motivo das correções na pista e aviso de toque repetido

- **Status:** aceita
- **Data:** 2026-11-20
- **Contexto:** `docs/arquitetura.md` §2.3 (toda correção de tempo é auditada, com motivo obrigatório) e §4.3
  (tela de pista sem confirmações que atrasem o toque).

## Decisão 1 — Motivo das correções feitas na pista

Na tela de cronometragem, o motivo é registrado **automaticamente**, sem digitação:

| Ação na pista | Evento | Motivo gravado |
|---|---|---|
| Desfazer última / Desfazer do aviso | `UNDO` | "Desfeito pelo cronometrista" |
| Desclassificar | `DSQ` | "Desclassificação registrada na pista" |

Correções feitas **depois da bateria** (tela de resultados, pelo organizador) **exigem motivo por escrito**.

Em todos os casos o evento guarda quem (`createdBy`), quando (`deviceTimestamp` e `serverReceivedAt`), em que
aparelho (`deviceId`) e o que foi alterado (`undoneEventId` ou o próprio evento), atendendo à auditoria.

**Por quê:** digitar motivo a cada toque atrasa o cronometrista justamente quando os pilotos estão passando; o
risco de perder passagens é maior do que o ganho de um motivo detalhado naquele instante.

## Decisão 2 — Toque repetido / volta abaixo da mínima

Se uma passagem gera uma volta **menor que a volta mínima válida** da prova (ex.: 00:45.000), a tela:

1. **registra a passagem normalmente** (nunca descartar lançamento, §2.1);
2. mostra um aviso âmbar: *"Volta de 0:02.1 no #27, abaixo da mínima (0:45.000). Toque repetido?"*, com **Desfazer**;
3. marca o cartão do piloto com contorno âmbar e o rótulo **REPETIDO?** por 5 s.

**Por quê:** cobre o toque duplo acidental (luva, poeira) e qualquer volta impossível, sem bloquear a pista.
A validade oficial da volta continua sendo decidida pelo motor de regras (`packages/rules-engine`), que aplica a
volta mínima ao calcular o resultado.

## Consequências

- `HeatInfo` passa a carregar `minLapMs` (vem da configuração da prova).
- O motor de regras precisa tratar voltas abaixo da mínima de forma determinística (ignorar a passagem ou somar à
  próxima volta — **a definir com o contratante**).
