import {
  formatDateRange,
  formatEventDay,
  formatEventTime,
  isoToZonedInput,
  zonedInputToIso,
} from './date-time';

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

describe('zonedInputToIso / isoToZonedInput (campo datetime-local no fuso do evento)', () => {
  it('09:00 em São Paulo = 12:00 UTC; o mesmo 09:00 em Manaus = 13:00 UTC', () => {
    expect(zonedInputToIso('2027-01-15T09:00', SP)).toBe('2027-01-15T12:00:00.000Z');
    expect(zonedInputToIso('2027-01-15T09:00', 'America/Manaus')).toBe('2027-01-15T13:00:00.000Z');
  });

  it('virada do dia: 23:59 de 10/03 em SP já é 11/03 em UTC', () => {
    expect(zonedInputToIso('2027-03-10T23:59', SP)).toBe('2027-03-11T02:59:00.000Z');
  });

  it('fuso com horário de verão (Nova York): inverno -5 h, verão -4 h', () => {
    expect(zonedInputToIso('2027-01-15T09:00', 'America/New_York')).toBe('2027-01-15T14:00:00.000Z');
    expect(zonedInputToIso('2027-07-15T09:00', 'America/New_York')).toBe('2027-07-15T13:00:00.000Z');
  });

  it('ida e volta devolve o mesmo texto do campo', () => {
    for (const local of ['2027-01-15T09:00', '2027-03-10T23:59', '2027-12-31T00:00']) {
      expect(isoToZonedInput(zonedInputToIso(local, SP), SP)).toBe(local);
    }
  });
});

describe('formatDateRange', () => {
  it.each([
    ['2027-03-13', '2027-03-13', '13/03/2027'],
    ['2027-04-17', '2027-04-18', '17 a 18/04/2027'],
    ['2027-04-30', '2027-05-01', '30/04 a 01/05/2027'],
    ['2027-12-31', '2028-01-01', '31/12/2027 a 01/01/2028'],
  ])('%s → %s = %s', (start, end, expected) => {
    expect(formatDateRange(start, end)).toBe(expected);
  });
});
