import { hash } from '@node-rs/argon2';
import { Prisma, type PrismaClient } from '@mxpro/db';
import {
  CONSENT_DOCUMENT_VERSION,
  type CreateRegistrationResponse,
  type PublicEventDto,
  type RegistrationDto,
  type SessionUser,
  createRegistrationSchema,
  isRegistrationOpen,
} from '@mxpro/shared';
import type { AuthService, LoginResult } from '../auth/auth.service.ts';
import { AppError } from '../errors.ts';
import { fieldError } from '../events/event-guard.ts';
import { PIX_TTL_MINUTES, type PixDeps, createPixCharge, refreshPaymentIfStale } from '../payments/pix.service.ts';

/**
 * Inscrições (ADR 0004). Regras:
 * - a primeira inscrição cria a conta do piloto (e já entra com ela);
 * - uma inscrição por categoria; o piloto escolhe o nº de largada (único entre as ativas);
 * - a vaga e o número ficam reservados por 30 min aguardando o Pix; inscrição gratuita já confirma;
 * - conta, inscrição e aceite do termo são gravados JUNTOS (tudo ou nada), sob uma trava por
 *   categoria: duas pessoas não pegam a última vaga ao mesmo tempo.
 */

const HOLD_MS = PIX_TTL_MINUTES * 60_000;
/** Data do calendário (coluna DATE) → "AAAA-MM-DD". */
const fromDate = (d: Date) => d.toISOString().slice(0, 10);

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Reservas ativas + confirmadas ocupam vaga e número. */
const activeWhere = (now: Date): Prisma.RegistrationWhereInput => ({
  OR: [{ status: 'CONFIRMED' }, { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } }],
});

// ─── Página pública do evento ──────────────────────────────────────────────────────────────

export async function getPublicEvent(db: PrismaClient, eventId: string, now: Date): Promise<PublicEventDto> {
  const event = await db.event.findFirst({
    where: { id: eventId, status: 'PUBLISHED' },
    include: { categories: { include: { category: { select: { name: true, description: true } } } } },
  });
  if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'Evento não encontrado ou ainda não publicado.');

  const taken = await db.registration.groupBy({
    by: ['eventCategoryId'],
    where: { eventId, ...activeWhere(now) },
    _count: { _all: true },
  });
  const takenBy = new Map(taken.map((t) => [t.eventCategoryId, t._count._all]));
  const byName = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  return {
    id: event.id,
    name: event.name,
    startDate: fromDate(event.startDate),
    endDate: fromDate(event.endDate),
    timeZone: event.timeZone,
    venue: event.venue,
    city: event.city,
    state: event.state,
    registration: {
      isOpen: isRegistrationOpen(event, now),
      opensAt: event.registrationOpensAt?.toISOString() ?? null,
      closesAt: event.registrationClosesAt?.toISOString() ?? null,
    },
    categories: event.categories
      .map((ec) => ({
        id: ec.id,
        name: ec.category.name,
        description: ec.category.description,
        modality: ec.modality,
        entryFeeCents: ec.entryFeeCents,
        spotsLeft: ec.maxEntries === null ? null : Math.max(0, ec.maxEntries - (takenBy.get(ec.id) ?? 0)),
      }))
      .sort((a, b) => byName.compare(a.name, b.name)),
  };
}

// ─── Inscrição ─────────────────────────────────────────────────────────────────────────────

const registrationInclude = {
  event: { select: { id: true, name: true, startDate: true, timeZone: true } },
  eventCategory: { select: { id: true, category: { select: { name: true } } } },
  payments: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.RegistrationInclude;
type RegistrationRow = Prisma.RegistrationGetPayload<{ include: typeof registrationInclude }>;

function toDto(r: RegistrationRow, now: Date): RegistrationDto {
  const open = r.payments[0];
  return {
    id: r.id,
    event: { id: r.event.id, name: r.event.name, startDate: fromDate(r.event.startDate), timeZone: r.event.timeZone },
    category: { id: r.eventCategory.id, name: r.eventCategory.category.name },
    raceNumber: r.raceNumber,
    bike: r.bike,
    team: r.team,
    status: r.status,
    entryFeeCents: r.entryFeeCents,
    holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    pix:
      r.status === 'PENDING_PAYMENT' && open && open.expiresAt > now
        ? { paymentId: open.id, status: open.status, amountCents: open.amountCents, pixCopyPaste: open.pixCopyPaste, expiresAt: open.expiresAt.toISOString() }
        : null,
  };
}

async function loadDto(db: PrismaClient, id: string, now: Date): Promise<RegistrationDto> {
  return toDto(await db.registration.findUniqueOrThrow({ where: { id }, include: registrationInclude }), now);
}

/** Trava por categoria do evento (dura até o fim da transação). */
function lockCategory(tx: Prisma.TransactionClient, eventCategoryId: string) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventCategoryId}))`;
}

/**
 * Reservas vencidas viram EXPIRED (liberam vaga e número). O índice único não pode depender do
 * relógio, então isso é feito aqui, antes de conferir vaga e número (ADR 0004).
 */
function expireStaleHolds(tx: Prisma.TransactionClient, where: Prisma.RegistrationWhereInput, now: Date) {
  return tx.registration.updateMany({
    where: { ...where, status: 'PENDING_PAYMENT', holdExpiresAt: { lte: now } },
    data: { status: 'EXPIRED', holdExpiresAt: null },
  });
}

const numberTaken = (n: string) => fieldError('raceNumber', `O número ${n} já está em uso nesta categoria. Escolha outro.`);
const alreadyRegistered = () =>
  new AppError(409, 'ALREADY_REGISTERED', 'Você já tem uma inscrição nesta categoria. Veja em "Minhas inscrições".');

/** Confere evento aberto, número livre e vaga; chamado com a categoria travada. */
async function checkAvailability(
  tx: Prisma.TransactionClient,
  ec: { id: string; maxEntries: number | null; event: Parameters<typeof isRegistrationOpen>[0] },
  input: { raceNumber: string; pilotId: string | null; exceptId?: string },
  now: Date,
) {
  if (!isRegistrationOpen(ec.event, now)) {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'As inscrições deste evento não estão abertas.');
  }
  await expireStaleHolds(tx, { eventCategoryId: ec.id }, now);
  const others = { eventCategoryId: ec.id, ...activeWhere(now), ...(input.exceptId ? { id: { not: input.exceptId } } : {}) };
  if (input.pilotId && (await tx.registration.count({ where: { ...others, pilotId: input.pilotId } })) > 0) throw alreadyRegistered();
  if ((await tx.registration.count({ where: { ...others, raceNumber: input.raceNumber } })) > 0) throw numberTaken(input.raceNumber);
  if (ec.maxEntries !== null && (await tx.registration.count({ where: others })) >= ec.maxEntries) {
    throw new AppError(409, 'CATEGORY_FULL', 'As vagas desta categoria acabaram.');
  }
}

/** Erro de índice único do banco (corrida que passou pelas checagens) → mensagem certa. */
function mapUniqueError(err: unknown, raceNumber: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = JSON.stringify(err.meta ?? {});
    if (target.includes('email')) throw fieldError('account.email', 'Já existe uma conta com este e-mail. Entre com ela para se inscrever.');
    if (target.includes('race_number')) throw numberTaken(raceNumber);
    throw alreadyRegistered();
  }
  throw err;
}

export interface CreateRegistrationDeps {
  db: PrismaClient;
  auth: AuthService;
  pix: PixDeps;
}

export async function createRegistration(
  deps: CreateRegistrationDeps,
  eventId: string,
  body: unknown,
  ctx: { user: SessionUser | null; meta: RequestMeta; now: Date },
): Promise<{ response: CreateRegistrationResponse; session: LoginResult | null }> {
  const { db } = deps;
  const input = createRegistrationSchema.parse(body);
  const { now } = ctx;

  if (ctx.user && ctx.user.role !== 'PILOT') {
    throw new AppError(403, 'STAFF_CANNOT_REGISTER', 'Você está conectado como equipe. Saia e entre com a conta do piloto para se inscrever.');
  }
  const account = ctx.user ? undefined : input.account;
  if (!ctx.user && !account) throw fieldError('account', 'Crie sua conta (ou entre) para se inscrever.');
  if (account && (await db.user.findUnique({ where: { email: account.email }, select: { id: true } }))) {
    throw fieldError('account.email', 'Já existe uma conta com este e-mail. Entre com ela para se inscrever.');
  }
  const passwordHash = account ? await hash(account.password) : null; // fora da transação (é lento de propósito)

  const ec = await db.eventCategory.findFirst({
    where: { id: input.eventCategoryId, eventId },
    select: {
      id: true,
      entryFeeCents: true,
      maxEntries: true,
      event: { select: { status: true, registrationOpensAt: true, registrationClosesAt: true, registrationClosedEarly: true } },
    },
  });
  if (!ec) throw fieldError('eventCategoryId', 'Categoria não encontrada neste evento.');

  let created: { registrationId: string; user: { id: string; name: string; email: string; role: 'PILOT' } | null };
  try {
    created = await db.$transaction(async (tx) => {
      await lockCategory(tx, ec.id);
      await checkAvailability(tx, ec, { raceNumber: input.raceNumber, pilotId: ctx.user?.id ?? null }, now);

      let pilotId = ctx.user?.id;
      let newUser: { id: string; name: string; email: string; role: 'PILOT' } | null = null;
      if (account && passwordHash) {
        const user = await tx.user.create({
          data: { name: account.name, email: account.email, passwordHash, role: 'PILOT' },
          select: { id: true, name: true, email: true },
        });
        newUser = { ...user, role: 'PILOT' };
        pilotId = user.id;
        await tx.consent.create({
          data: { userId: pilotId, kind: 'PRIVACY_POLICY', documentVersion: CONSENT_DOCUMENT_VERSION, ip: ctx.meta.ip ?? null, userAgent: ctx.meta.userAgent?.slice(0, 300) ?? null },
        });
      }

      const free = ec.entryFeeCents === 0;
      const registration = await tx.registration.create({
        data: {
          eventId,
          eventCategoryId: ec.id,
          pilotId: pilotId!,
          raceNumber: input.raceNumber,
          bike: input.bike,
          team: input.team,
          entryFeeCents: ec.entryFeeCents,
          status: free ? 'CONFIRMED' : 'PENDING_PAYMENT',
          confirmedAt: free ? now : null,
          holdExpiresAt: free ? null : new Date(now.getTime() + HOLD_MS),
        },
      });
      await tx.consent.create({
        data: {
          userId: pilotId!,
          registrationId: registration.id,
          kind: 'LIABILITY_WAIVER',
          documentVersion: CONSENT_DOCUMENT_VERSION,
          ip: ctx.meta.ip ?? null,
          userAgent: ctx.meta.userAgent?.slice(0, 300) ?? null,
        },
      });
      return { registrationId: registration.id, user: newUser };
    });
  } catch (err) {
    mapUniqueError(err, input.raceNumber);
  }

  // A conta nova já entra (o piloto vai direto para o pagamento).
  const session = created.user ? await deps.auth.createSession(created.user, ctx.meta) : null;

  // Pix: se o Mercado Pago falhar agora, a inscrição fica reservada e o piloto tenta de novo na tela.
  let pixError: string | null = null;
  if (ec.entryFeeCents > 0) {
    try {
      await createPixCharge(deps.pix, created.registrationId);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      pixError = err.message;
    }
  }
  return { response: { registration: await loadDto(db, created.registrationId, now), pixError }, session };
}

// ─── Acompanhar e pagar ────────────────────────────────────────────────────────────────────

async function ownRegistration(db: PrismaClient, id: string, user: SessionUser, { staffAllowed }: { staffAllowed: boolean }) {
  const reg = await db.registration.findUnique({ where: { id }, select: { id: true, pilotId: true, status: true } });
  const isStaff = user.role === 'ORGANIZER' || user.role === 'SECRETARY';
  // Inscrição de outro piloto responde 404 (não revela que existe).
  if (!reg || (reg.pilotId !== user.id && !(staffAllowed && isStaff))) {
    throw new AppError(404, 'REGISTRATION_NOT_FOUND', 'Inscrição não encontrada.');
  }
  return reg;
}

/**
 * Situação da inscrição (tela "Aguardando pagamento"). Se estiver aguardando, consulta o Mercado
 * Pago de tempos em tempos (funciona mesmo que o webhook não chegue).
 */
export async function getRegistration(pix: PixDeps, id: string, user: SessionUser, now: Date): Promise<RegistrationDto> {
  const { db } = pix;
  const reg = await ownRegistration(db, id, user, { staffAllowed: true });
  if (reg.status === 'PENDING_PAYMENT') {
    const open = await db.payment.findFirst({ where: { registrationId: id, status: 'PENDING' }, select: { id: true } });
    if (open) {
      try {
        await refreshPaymentIfStale(pix, open.id);
      } catch {
        // Mercado Pago fora do ar: mostra o que temos; a próxima consulta tenta de novo.
      }
    }
    // Reserva vencida sem pagamento libera a vaga (se o Pix for pago depois, o webhook trata).
    await db.$transaction((tx) => expireStaleHolds(tx, { id }, now));
  }
  return loadDto(db, id, now);
}

/**
 * Gera o Pix de novo: o atual, se ainda vale; ou, com a reserva vencida, um novo, desde que ainda
 * haja vaga e o número esteja livre (a vaga é reservada de novo por 30 min).
 */
export async function renewPix(pix: PixDeps, id: string, user: SessionUser, now: Date): Promise<CreateRegistrationResponse> {
  const { db } = pix;
  await ownRegistration(db, id, user, { staffAllowed: false });
  const reg = await db.registration.findUniqueOrThrow({
    where: { id },
    include: { eventCategory: { select: { id: true, maxEntries: true, event: { select: { status: true, registrationOpensAt: true, registrationClosesAt: true, registrationClosedEarly: true } } } } },
  });
  if (reg.status === 'CONFIRMED') throw new AppError(409, 'ALREADY_CONFIRMED', 'Esta inscrição já está confirmada.');
  if (reg.status === 'CANCELED') throw new AppError(409, 'REGISTRATION_CANCELED', 'Esta inscrição foi cancelada.');

  const holdValid = reg.status === 'PENDING_PAYMENT' && reg.holdExpiresAt !== null && reg.holdExpiresAt > now;
  if (!holdValid) {
    try {
      await db.$transaction(async (tx) => {
        await lockCategory(tx, reg.eventCategoryId);
        await expireStaleHolds(tx, { id }, now);
        await checkAvailability(tx, reg.eventCategory, { raceNumber: reg.raceNumber, pilotId: reg.pilotId, exceptId: id }, now);
        await tx.registration.update({ where: { id }, data: { status: 'PENDING_PAYMENT', holdExpiresAt: new Date(now.getTime() + HOLD_MS) } });
      });
    } catch (err) {
      mapUniqueError(err, reg.raceNumber);
    }
  }
  let pixError: string | null = null;
  try {
    await createPixCharge(pix, id);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    pixError = err.message;
  }
  return { registration: await loadDto(db, id, now), pixError };
}

export async function listMyRegistrations(db: PrismaClient, userId: string, now: Date): Promise<RegistrationDto[]> {
  const rows = await db.registration.findMany({
    where: { pilotId: userId },
    include: registrationInclude,
    orderBy: [{ event: { startDate: 'desc' } }, { createdAt: 'desc' }],
  });
  return rows.map((r) => toDto(r, now));
}
