# Arquitetura e regras do projeto

> Documento de referência da Plataforma de Gestão de Provas Off-Road (MXPro): escopo, princípios,
> arquitetura, convenções e roadmap. O código cita as seções deste arquivo (ex.: `docs/arquitetura.md §5.3`).
> Idioma do produto, da UI e dos commits: **português do Brasil**. Identificadores de código: **inglês**.

---

## 1. O que estamos construindo

Sistema web **exclusivo (sob demanda, NÃO é SaaS, single-tenant)** para organizar provas de motociclismo off-road: **Motocross, Enduro, Enduro de Regularidade, Cross Country, Supercross/Arenacross** e modalidades personalizadas.

Tudo é configurado pelo **painel do organizador**: formato da prova, categorias, pontuação e forma de cronometrar. Pilotos se inscrevem e pagam por Pix, a equipe de pista lança tempos/voltas em tablet ou celular (**funciona offline**) e o público acompanha o resultado **ao vivo**.

### Jornada de uma prova (7 etapas)
1. **Configurar** modalidade, categorias, regras → 2. **Inscrições** (formulário + Pix) → 3. **Check-in** (vistoria, nº de largada) → 4. **Largada** (grid, ondas ou intervalos) → 5. **Cronometragem** (voltas, tempos, penalidades) → 6. **Resultado** (ao vivo + oficial em PDF/planilha) → 7. **Campeonato** (ranking atualizado)

### Perfis de usuário (RBAC)
| Perfil (`role`) | Pode |
|---|---|
| `ORGANIZER` (organizador/admin) | Tudo: eventos, campeonatos, regras, inscrições, financeiro, equipe, fechar/oficializar resultados |
| `SECRETARY` (secretaria) | Check-in e vistoria, conferir pagamentos, definir nº de largada e grid |
| `TIMEKEEPER` (cronometrista/fiscal) | Lançar passagens, voltas, penalidades e bandeirada na tela de cronometragem (offline) |
| `PILOT` (piloto) | Inscrever-se, pagar via Pix, ver resultados, histórico e pontuação do campeonato |
| público/equipes | Sem login: classificação ao vivo no celular ou telão |

Permissões são checadas **no backend** em toda rota; esconder botão no front não é segurança.

---

## 2. Princípios inegociáveis

1. **Cronometragem é a parte crítica.** Nunca perder um lançamento. Tudo que o cronometrista toca deve ser salvo localmente primeiro (IndexedDB) e sincronizado depois.
2. **Eventos são append-only.** Passagens, penalidades e desclassificações são *eventos imutáveis*. Resultados e classificação são **derivados** (recalculáveis) desses eventos. Correção = novo evento compensatório, nunca `UPDATE`/`DELETE` em evento de tempo.
3. **Toda correção de tempo é auditada**: quem, quando, por quê (motivo obrigatório), valor antes/depois.
4. **Regras de prova são dados, não código.** O organizador configura sem programador. O motor de regras é uma biblioteca **pura e determinística** (mesmos eventos + mesma config = mesmo resultado), com testes extensivos.
5. **Idempotência em tudo que sincroniza**: lançamentos offline e webhooks de pagamento podem chegar duplicados/fora de ordem.
6. **Tempo em milissegundos inteiros** (`int`), nunca `float`. Dinheiro em **centavos inteiros**. Formatação só na camada de apresentação.
7. **Identidade visual do contratante** (logo, cores, domínio) é configurável e aplicada em telas públicas, telão e PDFs — nada de cores/logos hardcoded nesses pontos.
8. **LGPD**: coletar o mínimo de dados do piloto, consentimento explícito (termo de responsabilidade + política de privacidade), possibilidade de exportar/anonimizar dados de um piloto.
9. **Simplicidade antes de generalidade.** É single-tenant: não criar abstração multi-organizador. Mas **gateway de pagamento** e **leitor de transponder** ficam atrás de interfaces (ainda não definidos).

---

## 3. Stack

> A stack abaixo é a **proposta padrão** (alinhada com a stack que o desenvolvedor já domina). O escopo não a fixa — se houver motivo forte para trocar algo, registre a decisão em `docs/decisions/` (ADR curto) antes de mudar.

- **Linguagem:** TypeScript em todo o projeto (`strict: true`)
- **Monorepo:** pnpm workspaces
- **Web (painel, área do piloto, páginas públicas, telão, cronometragem PWA):** **Angular** (versão estável mais recente; confirmar com `ng version`) + TypeScript + RxJS + Tailwind CSS. Usar **standalone components**, **Signals**, control flow moderno (`@if`/`@for`), Reactive Forms, Router com **lazy loading** por área e `HttpClient` com interceptors. Biblioteca de UI opcional: Angular Material ou PrimeNG (escolher uma e manter).
- **PWA/offline:** `@angular/service-worker` (`ng add @angular/pwa`) para precache dos assets + **IndexedDB via Dexie** para a fila de lançamentos, encapsulada em um service Angular. Não depender de Background Sync API (suporte irregular, principalmente no iOS): o loop de sincronização roda no próprio app, reagindo a eventos `online`/`offline` e a tentativas periódicas.
- **API:** Node.js + Express ou Fastify (preferir Fastify se for começar do zero; manter consistência com um só) + Zod para validação
- **Banco:** PostgreSQL + Prisma (migrations versionadas)
- **Tempo real:** WebSocket (Socket.IO ou `ws`) para resultados ao vivo; fallback para polling na página pública
- **Auth:** sessão com cookie httpOnly (`secure`, `sameSite` correto) ou JWT curto + refresh; senhas com argon2/bcrypt; rate limit em login
- **PDF/planilha:** geração server-side (PDF: Puppeteer/`pdfkit`/React-PDF; planilha: `exceljs`)
- **Jobs/filas (se necessário):** BullMQ + Redis, ou tabela de jobs no Postgres para começar simples
- **Testes:** Vitest nos pacotes e na API (**obrigatório no motor de regras**); runner padrão do Angular CLI nos componentes/services do front; Playwright (E2E dos fluxos críticos, incluindo cronometragem offline)
- **Qualidade:** ESLint (`angular-eslint`) + Prettier + `tsc --noEmit` no CI; commits no padrão Conventional Commits em português

### Estrutura sugerida
```
/
├─ apps/
│  ├─ web/            # Angular: painel, piloto, público, telão, cronometragem (PWA)
│  └─ api/            # API REST + WebSocket
├─ packages/
│  ├─ rules-engine/   # Motor de regras/pontuação (puro, sem I/O) ← núcleo do domínio
│  ├─ shared/         # Tipos, schemas Zod, constantes, utils de tempo/dinheiro
│  ├─ db/             # Prisma schema, migrations, seeds
│  └─ timing-adapters/# Adaptadores de transponder (arquivo/API/manual)
├─ docs/
│  ├─ decisions/      # ADRs
│  └─ escopo/         # PDF do escopo e protótipos (não versionado)
└─ README.md
```

---

## 4. Módulos e telas (do escopo)

### 4.1 Painel do organizador
- **Dashboard do evento:** inscritos, pagos, pendentes, nº de baterias; próximas baterias (horário, nº de pilotos, status: *pronta / grid pendente / aguardando*); gráfico de inscritos por categoria.
- **Menu lateral:** Painel, Eventos, Categorias, Inscrições, Cronometragem, Resultados, Campeonato, Financeiro, Equipe.
- **Configuração da prova (wizard de 5 passos):** 1 Modalidade → 2 Categorias → 3 Regras → 4 Pontuação → 5 Revisão.
  - Escolhe modelo pronto (Motocross, Enduro, Enduro Regularidade, Cross Country, Supercross) **ou cria o seu**.
  - Define: largada (ex.: grid por sorteio), término (ex.: tempo + 2 voltas), duração, nº de baterias, **volta mínima válida** (ex.: 00:45.000), penalidade padrão (ex.: +10 s por infração).
  - Tabela de pontos editável (1º=25, 2º=22, 3º=20, 4º=18, 5º=16, 6º=15…) e **critério de desempate** (ex.: melhor bateria final).
  - Salvar como modelo reaproveitável.

### 4.2 Inscrição e check-in
- **Inscrição pelo celular (link público do evento):** nome completo, nº de largada, categoria, moto, equipe, aceite do termo de responsabilidade → pagamento.
- **Pix com QR Code + "copia e cola"**; tela "Aguardando pagamento…" que muda sozinha para "Inscrição confirmada!" quando o webhook confirmar.
- **Lista de inscritos (secretaria):** filtros por categoria/status (Pagos, Pendentes, Sem vistoria), busca por nome ou número, colunas Nº, Piloto, Categoria, Moto, Pagamento, Vistoria; rodapé com totais (ex.: 128 inscritos • 112 pagos • 96 vistorias aprovadas).
- Geração de **grid e números de largada**; número de largada único por categoria/evento.

### 4.3 Cronometragem (tablet/celular, PWA offline)
- Cabeçalho: bateria + categoria, nome do cronometrista, **relógio da bateria** com "restantes + N voltas", badge **EM PROVA** e **OFFLINE – N pendentes / Sincroniza ao reconectar**.
- **Um cartão grande por piloto** (nº, nome, voltas, último tempo): um toque = uma passagem/volta registrada.
- Painel **"Últimas passagens"** (nº, volta, tempo).
- Ações: **Penalidade**, **Desclassificar**, **Desfazer última**, **BANDEIRADA**.
- Aceita também tempos de **leitor de transponder** (arquivo ou integração) conforme equipamento adotado.
- Alvos de toque grandes (uso com luvas, sol forte, poeira). Alto contraste. Sem confirmações que atrasem o toque (usar *desfazer* em vez de "tem certeza?").

### 4.4 Resultados ao vivo
- Tabela: POS, Nº, PILOTO, VOLTAS, MELHOR, DIF. (diferença para o líder ou "+1 volta"), com indicador "Volta 7/10".
- **Modo telão** (tela cheia, com espaço para logos de patrocinadores) e **página pública leve para celular** (abas por categoria).
- Resultado **oficial em PDF e planilha** após o organizador fechar/oficializar.

### 4.5 Enduro
- Organizador desenha o percurso: **Largada → CH (controle de horário) → ES (especial cronometrada) → … → Chegada**.
- Sistema soma os tempos das ES e aplica **automaticamente** penalidade por atraso/adiantamento nos CH (ex.: atraso de 1 min = +00:30, **configurável**).
- Resultado por dia e acumulado, com diferença para o líder (colunas: ES1, ES2…, Penal. CH, Total, Dif.).

### 4.6 Campeonato e área do piloto
- Pontuação somada etapa a etapa, com **descarte** e **desempate** configuráveis; atualiza automaticamente ao encerrar cada etapa.
- Perfil do piloto: histórico, resultados, etapas/vitórias/pódios, próxima etapa com botão de inscrição, "Ver meus resultados".

### 4.7 Modalidades (formato configurável → resultado gerado)
| Modalidade | Formato configurável | Resultado |
|---|---|---|
| Motocross | Baterias por categoria, grid, tempo + voltas ou nº fixo de voltas | Posição por bateria, melhor volta, pontos e geral do dia |
| Enduro | Especiais cronometradas e CH com penalidades | Tempo total por dia e acumulado |
| Enduro de regularidade | Velocidade média imposta e tempo ideal por trecho | Pontos perdidos; vence quem perde menos |
| Cross country | Corrida longa por tempo ou voltas, largada em ondas | Ordem de chegada e tempo líquido |
| Supercross/Arenacross | Baterias curtas, eliminatórias, repescagem e final | Quem avança, resultado da final e pontos |
| Personalizada | Blocos de regras combináveis | Modelo reaproveitável em outros eventos |

---

## 5. Arquitetura e decisões de design

### 5.1 Motor de regras (`packages/rules-engine`)
- **Funções puras**: `computeResults(config, events, entries) → Standings`. Sem acesso a banco, rede ou relógio do sistema.
- A config da prova é um **JSON versionado** (`schemaVersion`) validado por Zod: blocos combináveis (largada, término, duração, voltas mínimas, penalidades, pontuação, desempate, descarte, ondas, eliminatórias/repescagem, ES/CH).
- Cada modalidade é um **conjunto de blocos pré-configurados** (modelos prontos); "Personalizada" = o organizador combina blocos.
- **Congelar a config no momento da largada**: alterar regras depois da largada não pode reescrever silenciosamente resultados. Se alterar, gerar nova versão e recomputar com registro em auditoria.
- Cobertura de testes alta (casos: empate, volta abaixo da mínima, penalidade em tempo, bandeirada com "tempo + N voltas", piloto desclassificado, descarte, bateria sem finalistas, ES com adiantamento no CH).

### 5.2 Modelo de dados (rascunho — refinar na primeira migration)
- `User` (role), `Organization/Settings` (branding único: logo, cores, domínio), `Pilot` (dados pessoais + consentimentos)
- `Championship` → `Event` (etapa) → `EventCategory` → `Heat` (bateria) / `Stage` (ES/CH para enduro)
- `RaceTemplate` (modelo de prova reaproveitável), `RaceConfig` (JSON versionado por evento/categoria)
- `Registration` (piloto × evento × categoria; nº de largada, moto, equipe, status de pagamento, vistoria, termo aceito)
- `Payment` (provider, provider_id, valor em centavos, status, payload do webhook, idempotency key)
- `GridPosition`
- `TimingEvent` (**append-only**): `id` (UUID **gerado no cliente**), `heatId`/`stageId`, `registrationId`, `type` (`LAP_PASS`, `PENALTY`, `DSQ`, `UNDO`, `FINISH_FLAG`, `STAGE_TIME`, `CH_PASS`…), `deviceTimestamp`, `serverReceivedAt`, `source` (`MANUAL` | `TRANSPONDER`), `createdBy`, `deviceId`, `payload`
- `TimingCorrection`/`AuditLog`: quem, quando, motivo, antes/depois
- `ResultSnapshot` (resultado oficial congelado ao oficializar), `ChampionshipScore`

Índices: `(heatId, registrationId, deviceTimestamp)`, unique em `Registration(eventId, categoryId, raceNumber)` e em `TimingEvent.id`.

### 5.3 Offline e sincronização (PWA de cronometragem)
- Ao tocar: gerar `id` (UUID v4), capturar `deviceTimestamp` (usar `performance.now()` ancorado a um offset sincronizado com o servidor quando online), gravar em **IndexedDB** (fila `outbox`) e **atualizar a UI imediatamente** (otimista).
- Sync em background: enviar lotes ordenados; servidor faz `INSERT ... ON CONFLICT (id) DO NOTHING` (idempotente) e responde quais IDs foram aceitos.
- O servidor **nunca descarta** evento por estar "atrasado"; a ordenação de voltas usa `deviceTimestamp`, com `serverReceivedAt` para auditoria.
- Mostrar sempre: estado online/offline e **contador de pendentes**. Impedir perder fila ao recarregar/fechar a aba (persistência + `navigator.storage.persist()`).
- Pré-carregar para offline: lista de pilotos da bateria, config da prova, assets do app (precache). A tela de cronometragem **precisa abrir e operar com internet zerada**.
- Dois cronometristas na mesma bateria: eventos de dispositivos diferentes são mesclados; duplicata provável (mesmo piloto em janela de tempo muito curta) é **sinalizada**, não apagada automaticamente.
- "Desfazer última" gera evento `UNDO` referenciando o anterior (não deleta).

### 5.4 Tempo real
- Ao aceitar eventos, o servidor recalcula a classificação da bateria (via motor de regras) e emite via WebSocket por sala `heat:{id}` / `event:{id}`.
- Página pública e telão: somente leitura, sem autenticação, **leves** (pouco JS, reconexão automática, fallback para polling).

### 5.5 Pagamentos (Pix)
- Interface `PaymentGateway` com `createPixCharge`, `getCharge`, `handleWebhook` — **gateway ainda não definido** (Pix e cartão). Começar com implementação fake/sandbox atrás da interface.
- Webhook: validar assinatura/token, ser **idempotente**, nunca confiar no front para marcar "pago".
- Inscrição só vira `CONFIRMED` via confirmação do webhook (ou baixa manual da secretaria/organizador, auditada).
- Tratar: Pix expirado, pagamento duplicado, estorno/reembolso, conciliação no módulo Financeiro.

### 5.6 Transponder
- Interface `TimingSource` em `packages/timing-adapters`; implementações: **lançamento manual** (padrão, sempre disponível), **importação por arquivo** (CSV/formato do fabricante) e **API/integração** quando o equipamento for definido.
- Todo tempo vindo de transponder vira `TimingEvent` com `source = TRANSPONDER` e passa pelas mesmas regras (volta mínima, etc.).

### 5.7 Segurança e conformidade
- HTTPS obrigatório; cookies `httpOnly` + `secure`; CSRF onde aplicável; rate limiting (login, inscrição, webhook); validação Zod em toda entrada; CORS restrito aos domínios do projeto.
- Segredos só em variáveis de ambiente; **nunca** commitar `.env`.
- Backup automático do banco + auditoria de correções de tempo.
- LGPD: log de consentimento, endpoint/rotina de exportação e anonimização, não expor dados pessoais (CPF, telefone, e-mail) em páginas públicas — público vê apenas nº, nome (ou iniciais, configurável) e equipe.

---

## 6. Convenções de código

- Tipos compartilhados e schemas Zod ficam em `packages/shared`; API e front **importam** os mesmos schemas (o Angular consome o pacote do workspace; manter esse pacote livre de dependências de framework).
- **Organização do front (Angular):** pastas por *feature* (`features/organizer`, `features/registration`, `features/timekeeping`, `features/live`, `features/championship`, `features/pilot`) + `core/` (auth, interceptors, guards, serviços singleton) + `shared/` (componentes de UI reutilizáveis). Cada área é uma rota **lazy-loaded**; `live` (público/telão) e `timekeeping` devem ter bundle enxuto.
- Componentes **standalone**, `ChangeDetectionStrategy.OnPush`, estado local com **Signals**; RxJS para streams (WebSocket, eventos de conexão, polling). Estado global complexo só com NgRx/SignalStore **se** realmente precisar.
- Guards de rota (`CanActivate`) por perfil melhoram a UX, mas **a autorização real continua no backend**.
- Nada de lógica de negócio em componentes: usar services; cálculo de classificação vem do `rules-engine`/API, não é reimplementado no front.
- Funções de tempo: `msToDisplay(ms)` → `1:12.431`; entrada sempre parseada para ms. Nunca somar strings de tempo.
- Sem lógica de negócio em componentes Angular nem em controllers: controllers finos → *services* → motor de regras / repositórios.
- Erros da API com formato único `{ code, message, details? }`; mensagens ao usuário em pt-BR.
- Datas em UTC no banco; exibir em `America/Sao_Paulo` (confirmar fuso do evento).
- Acessibilidade: contraste alto no telão e na cronometragem, fontes grandes, foco visível; responsivo mobile-first nas telas de piloto/público.
- Migrations sempre versionadas e reversíveis quando possível; seeds com **dados fictícios** (o escopo usa "Copa Verão de Motocross – Etapa 2", MX1/MX2/Feminino/Master 35+/65cc/Cross Country) para desenvolvimento e demonstração.
- Commits: `feat(cronometragem): registra passagem offline na fila`. PRs pequenos, um assunto por vez.

---

## 7. Roadmap sugerido (ordem de implementação)

Entregar em fatias verticais que já funcionem ponta a ponta; **não** construir tudo em camadas horizontais.

1. **Fundação:** monorepo, CI, Postgres + Prisma, auth + RBAC, seeds, app Angular com layout base do painel (rotas lazy, interceptor de auth, guards) e branding configurável.
2. **Eventos e categorias:** CRUD de campeonato/evento/categoria/bateria, dashboard básico.
3. **Motor de regras (MVP Motocross)** + testes: baterias, grid, tempo + voltas, volta mínima, penalidade em tempo, tabela de pontos, desempate. *Esta fase é o coração — não pular testes.*
4. **Inscrição + Pix (gateway fake → real):** formulário público, pagamento, confirmação por webhook, lista de inscritos, check-in e vistoria, nº de largada e grid.
5. **Cronometragem PWA offline:** cartões por piloto, fila IndexedDB, sync idempotente, desfazer/penalidade/desclassificar/bandeirada, auditoria de correções.
6. **Resultados ao vivo:** WebSocket, página pública mobile, modo telão com patrocinadores, fechamento e **resultado oficial (PDF + planilha)**.
7. **Campeonato e área do piloto:** pontuação por etapa, descarte, perfil e histórico.
8. **Demais modalidades:** Enduro (ES/CH), Cross Country (ondas), Supercross (eliminatórias/repescagem/final), Regularidade (pontos perdidos), Personalizada (blocos combináveis).
9. **Integração com transponder** (após definição do equipamento), Financeiro completo, perfis de equipe.
10. **Acabamento:** LGPD, backups, manual de uso e treinamento, testes E2E dos fluxos críticos, simulação de prova com internet cortada.

---

## 8. Fora do escopo (não implementar)
- Equipamentos de cronometragem (transponders, leitores, antenas) e operação presencial nos eventos.
- Apps nativos Android/iOS — o sistema é **web/PWA**.
- Versão **multi-organizador / SaaS**.

## 9. Pontos em aberto com o contratante (não presumir — perguntar ou isolar atrás de configuração/interface)
- Regras exatas de cada modalidade e categorias do calendário.
- Equipamento de cronometragem (define o tipo de integração).
- Identidade visual, domínio e **gateway de pagamento**.

> As telas do escopo são **ilustrações de conceito**; o layout final será validado com o contratante. Siga a estrutura e o comportamento descritos aqui, mas não trate pixels dos protótipos como requisito.

---

## 10. Definição de pronto (Definition of Done)
- [ ] Tipos e lint passam (`tsc --noEmit`, ESLint); testes do que foi tocado passam.
- [ ] Regra de negócio nova no motor de regras tem teste unitário.
- [ ] Rotas novas validam entrada (Zod) e checam permissão por perfil.
- [ ] Nada de dados pessoais expostos em rotas/páginas públicas.
- [ ] Fluxo de cronometragem continua funcionando **offline** (se tocou nessa área).
- [ ] Front: `ng build` em produção sem erros/warnings novos; componentes standalone + OnPush; rotas novas lazy-loaded.
- [ ] Migration criada e aplicável do zero; seed continua rodando.
- [ ] Textos de UI em pt-BR; sem segredos no repositório.
