import { SETTINGS_ID } from '@mxpro/db';
import { type Branding, DEFAULT_BRANDING, updateBrandingSchema } from '@mxpro/shared';
import type { FastifyInstance } from 'fastify';

/** Converte a linha do banco no contrato público (só os campos de identidade visual). */
function toBranding(s: {
  brandName: string;
  brandNameAccent: string | null;
  primaryColor: string;
  logoUrl: string | null;
  publicNameDisplay: Branding['publicNameDisplay'];
}): Branding {
  return {
    brandName: s.brandName,
    brandNameAccent: s.brandNameAccent,
    primaryColor: s.primaryColor,
    logoUrl: s.logoUrl,
    publicNameDisplay: s.publicNameDisplay,
  };
}

/** Identidade visual do contratante (docs/arquitetura.md §2.7). */
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Público: telão, página de inscrição e tela de login precisam da marca antes de qualquer login.
  app.get('/settings/branding', async (_request, reply) => {
    const settings = await app.db.settings.findUnique({ where: { id: SETTINGS_ID } });
    // Cache curto: muitas telas (telão, celulares do público) pedem a mesma coisa.
    reply.header('cache-control', 'public, max-age=60');
    return settings ? toBranding(settings) : DEFAULT_BRANDING;
  });

  app.put('/settings/branding', { preHandler: app.requireRole('ORGANIZER') }, async (request) => {
    const data = updateBrandingSchema.parse(request.body ?? {});
    const settings = await app.db.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    request.log.info({ userId: request.user?.id, branding: data }, 'marca do contratante alterada');
    return toBranding(settings);
  });
}
