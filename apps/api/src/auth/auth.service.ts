import { hash, verify } from '@node-rs/argon2';
import type { PrismaClient } from '@mxpro/db';
import type { SessionUser } from '@mxpro/shared';
import { AppError } from '../errors.ts';
import { generateSessionToken, hashSessionToken } from './session-token.ts';

export interface LoginResult {
  token: string;
  user: SessionUser;
  expiresAt: Date;
}

export interface ResolvedSession {
  user: SessionUser;
  expiresAt: Date;
  /** A validade foi estendida nesta requisição: o cookie precisa ser reenviado com a nova data. */
  renewed: boolean;
}

/** Só atualiza "visto por último" a cada 5 min, para não escrever no banco em toda requisição. */
const LAST_SEEN_RESOLUTION_MS = 5 * 60_000;

/**
 * Regras de login e sessão. Não conhece HTTP (cookies ficam no plugin): fácil de testar e reusar.
 */
export class AuthService {
  /** Hash de uma senha qualquer, usado para gastar o mesmo tempo quando o e-mail não existe. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly db: PrismaClient,
    private readonly sessionTtlMs: number,
  ) {}

  async login(email: string, password: string, meta: { userAgent?: string; ip?: string }): Promise<LoginResult> {
    const user = await this.db.user.findUnique({ where: { email } });

    // Mesmo trabalho (verificação argon2) exista ou não o e-mail: o tempo de resposta não revela
    // quais e-mails estão cadastrados. E a mensagem é a mesma nos dois casos.
    const passwordOk = user
      ? await verify(user.passwordHash, password)
      : await verify(await this.getDummyHash(), password).then(() => false);

    if (!user || !passwordOk) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    }
    if (!user.active) {
      throw new AppError(403, 'USER_INACTIVE', 'Seu acesso está desativado. Fale com o organizador do evento.');
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);
    await this.db.session.create({
      data: {
        id: hashSessionToken(token),
        userId: user.id,
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
      },
    });
    return { token, expiresAt, user: toSessionUser(user) };
  }

  /** Valida o token do cookie. Devolve null (e limpa a sessão) se vencida, inexistente ou usuário inativo. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const id = hashSessionToken(token);
    const session = await this.db.session.findUnique({ where: { id }, include: { user: true } });
    if (!session) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now || !session.user.active) {
      await this.db.session.deleteMany({ where: { id } });
      return null;
    }

    // Renovação deslizante: passou da metade da validade → estende por mais um período inteiro.
    const renew = session.expiresAt.getTime() - now < this.sessionTtlMs / 2;
    const touch = now - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS;
    let expiresAt = session.expiresAt;
    if (renew || touch) {
      if (renew) expiresAt = new Date(now + this.sessionTtlMs);
      await this.db.session.update({ where: { id }, data: { expiresAt, lastSeenAt: new Date(now) } });
    }
    return { user: toSessionUser(session.user), expiresAt, renewed: renew };
  }

  async logout(token: string): Promise<void> {
    await this.db.session.deleteMany({ where: { id: hashSessionToken(token) } });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash('senha-que-nao-existe-em-lugar-nenhum');
    return this.dummyHash;
  }
}

function toSessionUser(u: { id: string; name: string; email: string; role: SessionUser['role'] }): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}
