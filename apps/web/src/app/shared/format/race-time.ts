/**
 * Formatação de tempos de prova. Regra do projeto (docs/arquitetura.md §2.6): tempo é sempre milissegundo
 * INTEIRO; texto só na apresentação. Nunca somar strings de tempo.
 */

function assertMs(ms: number): void {
  if (!Number.isInteger(ms) || ms < 0) throw new Error(`Tempo inválido: ${ms} (esperado ms inteiro ≥ 0).`);
}

/**
 * Tempo de volta/prova: "1:12.431" (3 casas) ou "1:12.4" (1 casa).
 * Casas a menos TRUNCAM (padrão de cronometragem: não se ganha décimo arredondando).
 */
export function msToDisplay(ms: number, decimals: 1 | 3 = 3): string {
  assertMs(ms);
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const fraction = decimals === 3 ? String(millis).padStart(3, '0') : String(Math.floor(millis / 100));
  return `${minutes}:${String(seconds).padStart(2, '0')}.${fraction}`;
}

/** Relógio regressivo da bateria: "08:42". Arredonda o segundo para cima (só chega a 00:00 no fim). */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Penalidade: "+10 s", "+2,5 s". */
export function formatPenalty(ms: number): string {
  const s = ms / 1000;
  return `+${Number.isInteger(s) ? s : s.toFixed(1).replace('.', ',')} s`;
}

/** Diferença para o líder na classificação ao vivo. */
export type LiveGap = { kind: 'leader' } | { kind: 'time'; ms: number } | { kind: 'laps'; laps: number };

/**
 * "-" (líder), "+2.8" (segundos, 1 casa truncada, ponto como no escopo) ou "+1 volta"/"+2 voltas".
 * Ponto decimal (e não vírgula) segue a convenção de cronometragem usada no PDF (1:12.431).
 */
export function formatGap(gap: LiveGap): string {
  switch (gap.kind) {
    case 'leader':
      return '-';
    case 'laps':
      return `+${gap.laps} ${gap.laps === 1 ? 'volta' : 'voltas'}`;
    case 'time': {
      assertMs(gap.ms);
      const tenths = Math.floor(gap.ms / 100);
      if (gap.ms >= 60_000) return `+${msToDisplay(tenths * 100, 1)}`;
      return `+${Math.floor(tenths / 10)}.${tenths % 10}`;
    }
  }
}

/**
 * Lê um tempo digitado pelo organizador e devolve milissegundos inteiros (null se não der para ler).
 * Aceita "0:45.000", "0:45", "45", "45.5" e "45,5" (vírgula de quem digita em português).
 * Casas decimais completam à direita: "45.5" = 45.500 s (não 45.005).
 */
export function parseRaceTime(text: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  const [, minutes, seconds, fraction] = match;
  // Com minutos, os segundos vão até 59 ("1:75" é erro de digitação, não 2:15).
  if (minutes !== undefined && Number(seconds) > 59) return null;
  return Number(minutes ?? 0) * 60_000 + Number(seconds) * 1000 + Number((fraction ?? '').padEnd(3, '0'));
}
