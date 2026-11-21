/**
 * Seed de inscrições (fase 4) com os dados FICTÍCIOS do escopo (PDF, página 5): os 8 pilotos da
 * lista "Inscritos - Check-in e vistoria" da Copa Verão - Etapa 2, com o mesmo nº, moto,
 * pagamento e vistoria. Ids fixos: rodar de novo atualiza as mesmas linhas.
 */
import type { PrismaClient } from '../src/index.ts';

const STAGE_2_ID = '019a8f00-0000-7000-8000-000000000102';
/** Categorias da Etapa 2 (seed-events.ts). */
const EC = {
  MX1: '019a8f00-0000-7000-8000-000000000301',
  MX2: '019a8f00-0000-7000-8000-000000000302',
  Feminino: '019a8f00-0000-7000-8000-000000000303',
  'Master 35+': '019a8f00-0000-7000-8000-000000000304',
  '65cc': '019a8f00-0000-7000-8000-000000000305',
} as const;
const FEES: Record<keyof typeof EC, number> = { MX1: 15000, MX2: 15000, Feminino: 10000, 'Master 35+': 15000, '65cc': 8000 };

/** Versão dos textos aceitos (política de privacidade e termo de responsabilidade). */
export const CONSENT_DOCUMENT_VERSION = '2026-11';

const PILOTS: {
  n: number;
  email: string;
  name: string;
  raceNumber: string;
  category: keyof typeof EC;
  bike: string;
  team?: string;
  paid: boolean;
  inspected: boolean;
}[] = [
  { n: 1, email: 'piloto@mxpro.test', name: 'Rafael Menezes', raceNumber: '27', category: 'MX2', bike: 'Honda CRF 250F', team: 'Equipe Exemplo', paid: true, inspected: true },
  { n: 2, email: 'bruno.tavares@mxpro.test', name: 'Bruno Tavares', raceNumber: '14', category: 'MX1', bike: 'KTM 450 SX-F', paid: true, inspected: true },
  { n: 3, email: 'lucas.andrade@mxpro.test', name: 'Lucas Andrade', raceNumber: '88', category: 'MX2', bike: 'Yamaha YZ250F', paid: false, inspected: false },
  { n: 4, email: 'gabriela.nunes@mxpro.test', name: 'Gabriela Nunes', raceNumber: '05', category: 'Feminino', bike: 'Husqvarna FC 250', paid: true, inspected: true },
  { n: 5, email: 'thiago.moura@mxpro.test', name: 'Thiago Moura', raceNumber: '63', category: 'Master 35+', bike: 'Kawasaki KX450', paid: true, inspected: false },
  { n: 6, email: 'diego.fontes@mxpro.test', name: 'Diego Fontes', raceNumber: '31', category: '65cc', bike: 'KTM 65 SX', paid: false, inspected: false },
  { n: 7, email: 'marcos.veloso@mxpro.test', name: 'Marcos Veloso', raceNumber: '72', category: 'MX1', bike: 'GasGas MC 450F', paid: true, inspected: true },
  { n: 8, email: 'henrique.leal@mxpro.test', name: 'Henrique Leal', raceNumber: '19', category: 'MX2', bike: 'Honda CRF 250F', paid: true, inspected: true },
];

const id = (prefix: string, n: number) => `019a8f00-0000-7000-8000-000000000${prefix}${String(n).padStart(2, '0')}`;
const HOLD_MS = 30 * 60_000;

export async function seedRegistrations(prisma: PrismaClient, passwordHash: string, inspectorEmail: string): Promise<void> {
  const inspector = await prisma.user.findUniqueOrThrow({ where: { email: inspectorEmail }, select: { id: true } });
  const now = new Date();
  // Pagos: inscrição de janeiro. Pendentes: Pix gerado agora, vaga segura por 30 min a partir do seed.
  const paidAt = new Date('2027-01-20T15:00:00Z');
  const holdUntil = new Date(now.getTime() + HOLD_MS);

  for (const p of PILOTS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      create: { email: p.email, name: p.name, role: 'PILOT', passwordHash },
      update: { name: p.name, role: 'PILOT', active: true },
      select: { id: true },
    });

    const registrationId = id('5', p.n);
    const data = {
      eventId: STAGE_2_ID,
      eventCategoryId: EC[p.category],
      pilotId: user.id,
      raceNumber: p.raceNumber,
      bike: p.bike,
      team: p.team ?? null,
      entryFeeCents: FEES[p.category],
      status: p.paid ? ('CONFIRMED' as const) : ('PENDING_PAYMENT' as const),
      holdExpiresAt: p.paid ? null : holdUntil,
      confirmedAt: p.paid ? paidAt : null,
      inspectionStatus: p.inspected ? ('APPROVED' as const) : ('PENDING' as const),
      inspectedAt: p.inspected ? new Date('2027-03-13T10:30:00Z') : null,
      inspectedById: p.inspected ? inspector.id : null,
    };
    await prisma.registration.upsert({ where: { id: registrationId }, create: { id: registrationId, ...data }, update: data });

    const payment = {
      registrationId,
      provider: 'seed', // dado fictício de desenvolvimento (não existe no Mercado Pago)
      providerChargeId: `seed-${p.raceNumber}-${p.category}`,
      amountCents: FEES[p.category],
      status: p.paid ? ('PAID' as const) : ('PENDING' as const),
      // Texto de exemplo, não é um Pix cobrável.
      pixCopyPaste: `00020126MXPRO-SEED-PIX-${p.raceNumber}5204000053039865802BR6304ABCD`,
      expiresAt: p.paid ? new Date(paidAt.getTime() + HOLD_MS) : holdUntil,
      paidAt: p.paid ? paidAt : null,
    };
    await prisma.payment.upsert({ where: { id: id('6', p.n) }, create: { id: id('6', p.n), ...payment }, update: payment });

    // Consentimentos (LGPD): política de privacidade da conta e termo desta inscrição.
    const consents = [
      { id: id('7', p.n), userId: user.id, kind: 'PRIVACY_POLICY' as const, registrationId: null },
      { id: id('8', p.n), userId: user.id, kind: 'LIABILITY_WAIVER' as const, registrationId },
    ];
    for (const c of consents) {
      await prisma.consent.upsert({
        where: { id: c.id },
        create: { ...c, documentVersion: CONSENT_DOCUMENT_VERSION },
        update: {},
      });
    }
  }
}
