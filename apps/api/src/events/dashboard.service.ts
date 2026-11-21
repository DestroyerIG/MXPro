import type { PrismaClient } from '@mxpro/db';
import { type EventDashboardDto, MODALITIES } from '@mxpro/shared';
import { byName } from './event-guard.ts';
import { getEvent } from './events.service.ts';

/**
 * Painel do evento: tudo o que a tela inicial do organizador mostra, numa resposta só.
 *
 * Inscrições ainda não existem (fase de inscrições): os totais vêm zerados e toda bateria
 * programada aparece como "aguardando". Quando inscrições e grid existirem, só este service muda;
 * o formato da resposta (e a tela) continuam os mesmos.
 */
export async function getEventDashboard(db: PrismaClient, eventId: string, now: Date): Promise<EventDashboardDto> {
  const event = await getEvent(db, eventId, now); // 404 se não existir

  const [categories, heats] = await Promise.all([
    db.eventCategory.findMany({ where: { eventId }, include: { category: { select: { name: true } } } }),
    db.heat.findMany({
      where: { eventId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      include: { categories: { include: { eventCategory: { include: { category: { select: { name: true } } } } } } },
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
  ]);

  const used = new Set(categories.map((c) => c.modality));
  return {
    event,
    modalities: MODALITIES.filter((m) => used.has(m)), // ordem fixa do escopo, sem repetir
    registrations: { total: 0, paid: 0 },
    heatCount: event.heatCount,
    upcomingHeats: heats.map((h) => ({
      id: h.id,
      name: h.name,
      scheduledAt: h.scheduledAt?.toISOString() ?? null,
      categoryNames: h.categories.map((hc) => hc.eventCategory.category.name).sort(byName((n) => n)),
      pilotCount: 0,
      status: 'WAITING',
    })),
    registrationsByCategory: categories
      .map((c) => ({ eventCategoryId: c.id, categoryName: c.category.name, count: 0 }))
      .sort(byName((c) => c.categoryName)),
  };
}
