/**
 * Seed de DESENVOLVIMENTO com dados fictícios (docs/arquitetura.md §6).
 * Idempotente: pode rodar quantas vezes quiser (upsert). Recusa-se a rodar em produção.
 *
 * Uso: pnpm db:seed   (lê DATABASE_URL e SEED_PASSWORD do .env da raiz)
 */
import { hash } from '@node-rs/argon2';
import { config } from 'dotenv';
import { type Role, SETTINGS_ID, createPrismaClient } from '../src/index.ts';

config({ path: new URL('../../../.env', import.meta.url) });

if (process.env['NODE_ENV'] === 'production') {
  console.error('Seed de desenvolvimento não roda com NODE_ENV=production.');
  process.exit(1);
}

const databaseUrl = process.env['DATABASE_URL'];
const password = process.env['SEED_PASSWORD'];
if (!databaseUrl || !password) {
  console.error('Defina DATABASE_URL e SEED_PASSWORD no .env (veja .env.example).');
  process.exit(1);
}

/** Um usuário fictício por perfil. Domínio .test é reservado e nunca recebe e-mail de verdade. */
const USERS: { email: string; name: string; role: Role }[] = [
  { email: 'organizador@mxpro.test', name: 'Marina Duarte', role: 'ORGANIZER' },
  { email: 'secretaria@mxpro.test', name: 'Paulo Ribeiro', role: 'SECRETARY' },
  { email: 'cronometrista@mxpro.test', name: 'Ana Souza', role: 'TIMEKEEPER' },
  { email: 'piloto@mxpro.test', name: 'Rafael Menezes', role: 'PILOT' },
];

const prisma = createPrismaClient(databaseUrl);

try {
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, brandName: 'MXPRO', brandNameAccent: 'MX', primaryColor: '#E8590C' },
    update: {},
  });

  const passwordHash = await hash(password);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash },
      update: { name: u.name, role: u.role, passwordHash, active: true },
    });
  }

  const [users, settings] = await Promise.all([prisma.user.count(), prisma.settings.count()]);
  console.log(`Seed concluído: ${users} usuários, ${settings} configuração da marca.`);
  console.log(`Logins: ${USERS.map((u) => `${u.email} (${u.role})`).join(', ')} — senha: SEED_PASSWORD do .env`);
} finally {
  await prisma.$disconnect();
}
