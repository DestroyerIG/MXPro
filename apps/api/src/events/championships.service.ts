import { Prisma, type PrismaClient } from '@mxpro/db';
import { type ChampionshipDto, championshipInputSchema } from '@mxpro/shared';
import { AppError } from '../errors.ts';

/** Campeonatos: agrupam etapas para o ranking (fase 7). */

const include = { _count: { select: { events: true } } } satisfies Prisma.ChampionshipInclude;
type ChampionshipRow = Prisma.ChampionshipGetPayload<{ include: typeof include }>;

const notFound = () => new AppError(404, 'CHAMPIONSHIP_NOT_FOUND', 'Campeonato não encontrado.');

function toDto(c: ChampionshipRow): ChampionshipDto {
  return { id: c.id, name: c.name, season: c.season, eventCount: c._count.events };
}

/** Nome + temporada repetidos viram uma mensagem clara (o banco garante a unicidade). */
async function withDuplicateCheck<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CHAMPIONSHIP_EXISTS', 'Já existe um campeonato com esse nome nessa temporada.', [
        { field: 'name', message: 'Já existe um campeonato com esse nome nessa temporada.' },
      ]);
    }
    throw err;
  }
}

export async function listChampionships(db: PrismaClient): Promise<ChampionshipDto[]> {
  const rows = await db.championship.findMany({ include, orderBy: [{ season: 'desc' }, { name: 'asc' }] });
  return rows.map(toDto);
}

export async function createChampionship(db: PrismaClient, body: unknown): Promise<ChampionshipDto> {
  const data = championshipInputSchema.parse(body);
  return toDto(await withDuplicateCheck(() => db.championship.create({ data, include })));
}

export async function updateChampionship(db: PrismaClient, id: string, body: unknown): Promise<ChampionshipDto> {
  const data = championshipInputSchema.partial().parse(body);
  if (!(await db.championship.count({ where: { id } }))) throw notFound();
  return toDto(await withDuplicateCheck(() => db.championship.update({ where: { id }, data, include })));
}

/** Só campeonato sem etapas pode ser excluído (condição e exclusão num comando só). */
export async function deleteChampionship(db: PrismaClient, id: string): Promise<void> {
  if (!(await db.championship.count({ where: { id } }))) throw notFound();
  const { count } = await db.championship.deleteMany({ where: { id, events: { none: {} } } });
  if (count === 0) {
    throw new AppError(409, 'CHAMPIONSHIP_HAS_EVENTS', 'Este campeonato tem etapas. Exclua ou mova as etapas antes.');
  }
}
