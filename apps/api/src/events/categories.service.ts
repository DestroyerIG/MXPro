import { Prisma, type PrismaClient } from '@mxpro/db';
import { type CategoryDto, categoryInputSchema, updateCategorySchema } from '@mxpro/shared';
import { AppError } from '../errors.ts';
import { byName } from './event-guard.ts';

/**
 * Catálogo de categorias (MX1, MX2…). É o MESMO em todos os eventos: é isso que permite somar
 * pontos de uma categoria etapa a etapa no campeonato. Categoria já usada não é excluída: é desativada.
 */

const include = { _count: { select: { events: true } } } satisfies Prisma.CategoryInclude;
type CategoryRow = Prisma.CategoryGetPayload<{ include: typeof include }>;

const notFound = () => new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');

function toDto(c: CategoryRow): CategoryDto {
  return { id: c.id, name: c.name, description: c.description, active: c.active, eventCount: c._count.events };
}

/** "MX2" e "mx2" são a mesma categoria: o banco garante (índice em lower(nome)); aqui vira mensagem clara. */
async function withDuplicateCheck<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CATEGORY_EXISTS', 'Já existe uma categoria com esse nome.', [
        { field: 'name', message: 'Já existe uma categoria com esse nome.' },
      ]);
    }
    throw err;
  }
}

export async function listCategories(db: PrismaClient, filters: { active?: boolean }): Promise<CategoryDto[]> {
  const rows = await db.category.findMany({ where: { active: filters.active }, include });
  return rows.map(toDto).sort(byName((c) => c.name));
}

export async function createCategory(db: PrismaClient, body: unknown): Promise<CategoryDto> {
  const data = categoryInputSchema.parse(body);
  return toDto(await withDuplicateCheck(() => db.category.create({ data, include })));
}

export async function updateCategory(db: PrismaClient, id: string, body: unknown): Promise<CategoryDto> {
  const data = updateCategorySchema.parse(body);
  if (!(await db.category.count({ where: { id } }))) throw notFound();
  return toDto(await withDuplicateCheck(() => db.category.update({ where: { id }, data, include })));
}

/** Exclui só categoria nunca usada (condição e exclusão num comando só). */
export async function deleteCategory(db: PrismaClient, id: string): Promise<void> {
  if (!(await db.category.count({ where: { id } }))) throw notFound();
  const { count } = await db.category.deleteMany({ where: { id, events: { none: {} } } });
  if (count === 0) {
    throw new AppError(409, 'CATEGORY_IN_USE', 'Esta categoria já foi usada em eventos. Desative-a em vez de excluir.');
  }
}
