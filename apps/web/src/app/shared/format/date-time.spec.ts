import { formatEventDay, formatEventTime } from './date-time';

const SP = 'America/Sao_Paulo';

describe('formatEventTime', () => {
  it('converte UTC para o horário do evento (24h)', () => {
    expect(formatEventTime('2027-03-13T12:00:00Z', SP)).toBe('09:00');
    expect(formatEventTime('2027-03-13T16:40:00Z', SP)).toBe('13:40');
  });

  it('respeita o fuso informado (ex.: evento no Acre)', () => {
    expect(formatEventTime('2027-03-13T12:00:00Z', 'America/Rio_Branco')).toBe('07:00');
  });
});

describe('formatEventDay', () => {
  it('mostra dia da semana com inicial maiúscula e dd/mm, como no escopo', () => {
    expect(formatEventDay('2027-03-13T11:00:00Z', SP)).toBe('Sábado, 13/03');
  });

  it('usa a data local do evento, não a de UTC (01:00Z ainda é o dia anterior em SP)', () => {
    expect(formatEventDay('2027-03-14T01:00:00Z', SP)).toBe('Sábado, 13/03');
  });
});
