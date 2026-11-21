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

## Detalhes de cálculo (passo 5.2)

- **Bandeirada:** o piloto termina na primeira passagem válida **a partir do instante** do `FINISH_FLAG`. Por
  isso, na pista, a bandeirada deve ser marcada **antes** do toque do líder. Uma janela de tolerância foi descartada:
  um piloto que cruzasse segundos antes do líder terminaria uma volta mais cedo. A tela de pista (fase 5) vai
  garantir essa ordem. **A validar com o contratante.**
- **Número fixo de voltas sem `FINISH_FLAG`:** a bandeirada é o momento em que o primeiro piloto da bateria completa
  as voltas. Com o evento presente, vale o evento.
- **Bateria com mais de uma categoria:** a bandeirada é a mesma para todos (é física); classificação, vencedor e
  mínimo de voltas são calculados **por categoria**.
- **Sem nenhuma volta válida:** status `DNS` (não largou), depois dos não classificados e antes dos desclassificados.
- **Correções:** evento repetido (mesmo `id`) conta uma vez; `UNDO` não pode ser desfeito; penalidade dada depois
  da bandeirada (revisão) vale; passagem anterior à largada não vira volta.
- **Passagens ignoradas** (abaixo da mínima ou depois de terminar) saem numa lista à parte, para revisão e auditoria.

## Pontos e geral do dia (passo 5.3)

- Só quem é **classificado** numa bateria pontua nela (tabela da prova; fora da tabela, 0). Não classificado, DNS e
  DSQ fazem 0 naquela bateria; o desclassificado perde só os pontos da bateria em que foi desclassificado.
- **Geral do dia** por categoria: soma dos pontos das baterias. Empate: melhor posição na **última** bateria; se
  persistir (ex.: nenhum dos dois classificado nela), a bateria anterior, e assim por diante.
- Tem posição no geral quem foi classificado em **ao menos uma** bateria (mesmo com 0 ponto, fora da tabela). Quem
  nunca foi classificado aparece sem posição.
- O geral é **provisório** enquanto alguma bateria do dia não teve bandeirada.

## Consequências

- Fecha o ponto em aberto do ADR 0001 (decisão 2).
- A configuração (`schemaVersion: 1`) carrega `minLeaderLapsPct` e o critério de desempate; outras opções de
  desempate (ex.: mais vitórias) entram como novos valores sem quebrar configurações antigas.
