# ADR 0002 — Autenticação por sessão em cookie httpOnly

- **Status:** aceita
- **Data:** 2026-11-20
- **Contexto:** `docs/arquitetura.md` §3 permite "sessão com cookie httpOnly" ou "JWT curto + refresh". Sistema
  single-tenant, um único back-end, front servido no mesmo domínio.

## Decisão

Sessão **opaca** guardada no PostgreSQL, identificada por um **token aleatório de 256 bits** enviado num cookie:

| Aspecto | Escolha |
|---|---|
| Cookie | `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção, prefixo `__Host-` em produção |
| Banco | Guarda só o **SHA-256** do token (tabela `sessions`), com usuário, validade, IP e navegador |
| Validade | 12 h sem uso (`SESSION_TTL_HOURS`), **renovação deslizante** após metade do período |
| Logout / bloqueio | Apaga a sessão; desativar o usuário derruba as sessões na próxima requisição |
| Senha | **argon2id**; mesma mensagem e mesmo tempo para e-mail inexistente e senha errada |
| Força bruta | 10 tentativas de login por IP a cada 15 min (`@fastify/rate-limit`) |
| CSRF | `SameSite=Lax` + recusa de POST/PUT/PATCH/DELETE com `Origin` fora da lista do CORS |
| Autorização | `requireRole(...)` em cada rota protegida, sempre no back-end |

## Por quê (em vez de JWT)

- Revogação **imediata** (logout, usuário desativado) sem lista de bloqueio de tokens.
- O front nunca manipula o token: nada em `localStorage`, nada exposto a scripts (XSS).
- Uma consulta indexada por requisição é irrelevante para o volume de um sistema single-tenant.

## Consequências

- O front chama a API com `withCredentials` e, em desenvolvimento, por **proxy** do `ng serve` (mesma origem).
- Limite de tentativas fica em memória: com mais de uma instância da API, mover para Redis.
- Sessões vencidas são apagadas quando usadas; uma limpeza periódica entra junto com a fila de jobs.
