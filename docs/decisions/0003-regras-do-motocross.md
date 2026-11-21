# ADR 0003 — Regras do Motocross no motor de regras (MVP)

- **Status:** aceita
- **Data:** 2026-11-21
- **Contexto:** `docs/arquitetura.md` §4.1 (configuração da prova), §5.1 (motor de regras) e o ponto em aberto do
  ADR 0001 (volta abaixo da mínima). Decisões tomadas com o responsável pelo projeto antes de implementar.

## Decisões confirmadas

| Tema | Regra |
|---|---|
| Volta abaixo da mínima | A passagem é **ignorada** no cálculo: não conta como volta, e a volta seguinte é medida a partir da última passagem válida. O lançamento continua guardado (append-only); só não entra no resultado. |
| Quem é classificado | Só quem completou **ao menos X% das voltas do vencedor** (X configurável por prova; padrão 50%, arredondado para cima). Abaixo disso: "não classificado", sem pontos. |
| Abandono | Piloto que **não recebe a bandeirada**, mas atinge o mínimo de voltas, é classificado e **pontua pela posição**. |
| Desempate no geral do dia | Empate em pontos: fica à frente quem terminou **melhor a última bateria** do dia. |

## Regras padrão adotadas (escopo + prática do motocross)

- **Classificação da bateria:** mais voltas primeiro; com o mesmo número de voltas, quem fez a última passagem antes
  (tempo total menor).
- **Término "tempo + N voltas":** zerado o relógio, o líder completa mais N voltas e recebe a bandeirada
  (`FINISH_FLAG`); cada piloto termina na primeira passagem depois da bandeirada. Passagens depois disso não contam.
- **Penalidade em tempo:** soma ao tempo total; reordena só pilotos com o mesmo número de voltas.
- **Desclassificado (DSQ):** fica no fim da lista, sem posição e sem pontos.
- **Pontuação:** tabela configurável por posição (padrão 25, 22, 20, 18, 16, 15, 14 … 1); fora da tabela, 0 ponto.
- **Determinismo:** mesmos eventos + mesma configuração = mesmo resultado. Eventos são ordenados por
  `deviceTimestamp` e, em empate, pelo `id` (nunca pela ordem de chegada ao servidor).

## Consequências

- Fecha o ponto em aberto do ADR 0001 (decisão 2).
- A configuração (`schemaVersion: 1`) carrega `minLeaderLapsPct` e o critério de desempate; outras opções de
  desempate (ex.: mais vitórias) entram como novos valores sem quebrar configurações antigas.
