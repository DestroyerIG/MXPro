import { Prisma, type PrismaClient } from '@mxpro/db';
import { MOTOCROSS_TEMPLATE, type RaceConfig, raceConfigSchema } from '@mxpro/rules-engine';
import { type EventCategoryRulesDto, MODALITY_LABELS, type Modality, type RulesVersionDto, saveRulesSchema } from '@mxpro/shared';
import { AppError } from '../errors.ts';
import { editableEvent, existingEvent, fieldError } from './event-guard.ts';

/**
 * Regras da prova por categoria do evento (docs/arquitetura.md §5.1).
 *
 * "Congelar a configuração na largada": enquanto nenhuma bateria da categoria começou, salvar
 * atualiza a versão atual (rascunho). Depois, a configuração está congelada: mudar exige motivo e
 * cria uma NOVA versão; a anterior continua guardada (quem, quando, por quê, antes e depois).
 */

/** Modelo pronto de cada modalidade que o motor já cobre. */
const TEMPLATES: Partial<Record<Modality, RaceConfig>> = { MOTOCROSS: MOTOCROSS_TEMPLATE };

const versionInclude = { createdBy: { select: { id: true, name: true } } } satisfies Prisma.RaceConfigVersionInclude;
type VersionRow = Prisma.RaceConfigVersionGetPayload<{ include: typeof versionInclude }>;

function toVersionDto(v: VersionRow): RulesVersionDto {
  return {
    version: v.version,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    createdBy: v.createdBy,
    reason: v.reason,
  };
}

async function eventCategoryOf(db: PrismaClient, eventId: string, id: string) {
  const ec = await db.eventCategory.findFirst({ where: { id, eventId }, select: { id: true, modality: true } });
  if (!ec) throw new AppError(404, 'EVENT_CATEGORY_NOT_FOUND', 'Categoria não encontrada neste evento.');
  return ec;
}

/** Congelada = alguma bateria com esta categoria já começou (em prova ou encerrada). */
async function isFrozen(db: PrismaClient, eventCategoryId: string): Promise<boolean> {
  const started = await db.heatCategory.count({
    where: { eventCategoryId, heat: { status: { in: ['IN_PROGRESS', 'FINISHED'] } } },
  });
  return started > 0;
}

async function buildDto(db: PrismaClient, ec: { id: string; modality: Modality }): Promise<EventCategoryRulesDto> {
  const [versions, frozen] = await Promise.all([
    db.raceConfigVersion.findMany({ where: { eventCategoryId: ec.id }, include: versionInclude, orderBy: { version: 'desc' } }),
    isFrozen(db, ec.id),
  ]);
  const latest = versions[0];
  const template = TEMPLATES[ec.modality];
  return {
    eventCategoryId: ec.id,
    supported: template !== undefined,
    // O que está no banco passa pelo motor de novo: nunca devolvemos uma configuração inválida.
    config: latest ? raceConfigSchema.parse(latest.config) : template ? structuredClone(template) : null,
    saved: latest !== undefined,
    frozen,
    current: latest ? toVersionDto(latest) : null,
    history: versions.map(toVersionDto),
  };
}

export async function getRules(db: PrismaClient, eventId: string, eventCategoryId: string): Promise<EventCategoryRulesDto> {
  await existingEvent(db, eventId);
  return buildDto(db, await eventCategoryOf(db, eventId, eventCategoryId));
}

export async function saveRules(
  db: PrismaClient,
  eventId: string,
  eventCategoryId: string,
  body: unknown,
  userId: string | null,
): Promise<EventCategoryRulesDto> {
  const { config: rawConfig, reason } = saveRulesSchema.parse(body);
  await editableEvent(db, eventId);
  const ec = await eventCategoryOf(db, eventId, eventCategoryId);

  if (!TEMPLATES[ec.modality]) {
    throw new AppError(
      409,
      'MODALITY_NOT_SUPPORTED',
      `As regras de ${MODALITY_LABELS[ec.modality]} ainda não estão disponíveis no sistema.`,
    );
  }
  // O motor valida a configuração; os erros saem por campo ("minLapMs", "finish.durationMs"…).
  const config = raceConfigSchema.parse(rawConfig);
  if (config.modality !== ec.modality) {
    throw fieldError('modality', `Esta categoria é de ${MODALITY_LABELS[ec.modality]}; a configuração enviada é de outra modalidade.`);
  }

  const frozen = await isFrozen(db, ec.id);
  if (frozen && (!reason || reason.length < 5)) {
    throw fieldError('reason', 'A categoria já largou: informe o motivo da mudança (ao menos 5 caracteres).');
  }

  const latest = await db.raceConfigVersion.findFirst({ where: { eventCategoryId: ec.id }, orderBy: { version: 'desc' } });
  const json = config as unknown as Prisma.InputJsonValue;
  try {
    if (latest && !frozen) {
      // Rascunho (antes da largada): atualiza a versão atual.
      await db.raceConfigVersion.update({
        where: { id: latest.id },
        data: { config: json, reason: reason ?? null, createdById: userId },
      });
    } else {
      // Primeira versão, ou mudança depois da largada: nova versão, a anterior fica guardada.
      await db.raceConfigVersion.create({
        data: { eventCategoryId: ec.id, version: (latest?.version ?? 0) + 1, config: json, reason: reason ?? null, createdById: userId },
      });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'RULES_CHANGED', 'As regras foram alteradas por outra pessoa agora há pouco. Atualize a página e tente de novo.');
    }
    throw err;
  }
  return buildDto(db, ec);
}

/** Usado ao mudar a modalidade de uma categoria: com regras salvas, a troca é recusada. */
export async function hasSavedRules(db: PrismaClient, eventCategoryId: string): Promise<boolean> {
  return (await db.raceConfigVersion.count({ where: { eventCategoryId } })) > 0;
}
