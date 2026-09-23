# Roadmap de Finalização — Real-Time Messaging Platform

**Data:** 2026-09-23
**Referência:** [.github/SRS.md](../../../.github/SRS.md) (seção 12 — Plano de Sprints)
**Status:** Design aprovado — aguardando plano de implementação

---

## 1. Objetivo

Levar o projeto do estado atual (Sprints 1–3 concluídas, Sprint 4 parcial) até a conclusão da Sprint 10 do SRS, entregando um backend completo de mensagens em tempo real, com cliente demo mínimo, CI verde e documentação atualizada.

O trabalho é decomposto em **8 subprojetos** (0–7). Este documento define:

- As convenções globais válidas para todos os subprojetos (seção 2)
- O escopo e critério de saída de cada subprojeto (seção 3)
- O design detalhado dos subprojetos 0 e 1 (seções 4 e 5)

Os subprojetos 2–7 recebem spec próprio (`docs/superpowers/specs/`) no momento em que forem iniciados.

---

## 2. Convenções Globais

### 2.1 Ciclo de trabalho

Cada subprojeto segue:

1. Spec em `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md` (exceto 0 e 1, cobertos aqui)
2. Plano em `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`
3. Branch `feature/<slug>` (ou `chore/<slug>`) a partir da `main`
4. Implementação com TDD
5. Checklist da sprint correspondente em `.github/SRS.md` atualizado no mesmo PR
6. Pull Request para `main`

### 2.2 Padrão de módulo

Seguir a estrutura existente em `src/modules/<mod>/`:

```
constants/ controllers/ errors/ interfaces/ models/ repositories/ routes/ services/ types/ validation/
```

Cada pasta com `index.ts` de exports.

- **Controllers:** service injetado no construtor com fallback para instância padrão (`constructor(service?: IService) { this.service = service ?? new Service(); }`); validação com `schema.safeParse()` dentro do controller; resposta `{ success: true, data }`.
- **Rotas:** `authenticate` + `asyncHandler((req, res) => controller.method(req, res))`; rotas estáticas declaradas **antes** de rotas com parâmetro (`/:id`).
- **Services:** implementam interface de `interfaces/`; dependências injetadas via construtor com default.
- **Erros:** classes que estendem `AppError` em `errors/`.

### 2.3 Comunicação entre módulos

- Um módulo só consome outro via **interface exportada** ou via **EventBus** (`src/shared/event-bus`), com eventos tipados em `EventMap` (`src/shared/interfaces/event.interfaces.ts`).
- Nenhum módulo importa repository de outro módulo.

### 2.4 Persistência de mensagens

**Decisão:** MongoDB é a **fonte única** de mensagens.

- `MessageService` grava a mensagem no MongoDB de forma síncrona e, em seguida, publica `message.sent` no EventBus.
- Listeners fazem o fan-out: indexação no Elasticsearch, broadcast Socket.IO (Redis adapter), notificação de offline, atualização de `conversations.last_message_at` no PostgreSQL.
- PostgreSQL armazena apenas dados relacionais: conversas, participantes (`last_read_at`, `is_muted`, `role`), contatos e bloqueios.
- Contagem de não lidas: consulta Mongo `created_at > last_read_at` com índice `{ conversation_id: 1, created_at: -1 }`, cacheada no Redis.

Isto **substitui** o passo 4 do fluxo 9.1 do SRS ("MessageRepository salva no PostgreSQL"). O SRS será corrigido no subprojeto 2.

### 2.5 Integrações externas

Toda integração externa é definida por interface, com duas implementações selecionadas por variável de ambiente:

| Interface | Adapter local (dev/test) | Adapter real (produção) |
|---|---|---|
| `IStorage` (já existe) | disco local | S3 / Cloudflare R2 |
| `IEmailProvider` | SMTP → Mailpit (docker-compose) | SendGrid |
| `IPushProvider` | logger | Firebase Cloud Messaging |
| `IVirusScanner` | ClamAV (docker-compose) | ClamAV |

Métricas: Prometheus + Grafana adicionados ao `docker-compose.yml`.

Todo o sistema deve rodar 100% localmente sem contas pagas.

### 2.6 Testes

- TDD em todo código novo.
- Meta de **100% de cobertura no código novo**.
- `coverageThreshold` global de **90%** em `jest.config.ts` (branches, functions, lines, statements).
- Unitários em `tests/unit/`, integração em `tests/feature/` com supertest; a partir do subprojeto 3, `socket.io-client` para testes de WebSocket.

### 2.7 Commits

- Gitmoji + Conventional Commits em PT-BR (padrão do histórico atual), ex.: `✨ feat: adiciona ContactController`.
- Commits pequenos e atômicos.
- Nenhuma menção a ferramentas de IA em commits, PRs ou issues.

### 2.8 Cliente demo

A partir do subprojeto 3, página estática mínima em `public/demo/` (HTML + JS puro, `socket.io-client` via CDN) servida pelo Express, cobrindo: login, lista de conversas, chat em tempo real, indicador de digitação e presença. Não é um frontend de produção.

---

## 3. Subprojetos

Ordem de execução: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**.
(O 5 depende só do 2 e poderia rodar em paralelo com 3/4; mantido sequencial por simplicidade.)

| # | Subprojeto | Sprint SRS | Depende de | Branch |
|---|---|---|---|---|
| 0 | Baseline | — | — | `chore/baseline` |
| 1 | Fechar Usuários | 4 | 0 | `feature/user-contacts-blocks` |
| 2 | Chat Base | 5 | 1 | `feature/chat-base` |
| 3 | Real-Time | 6 | 2 | `feature/realtime` |
| 4 | Presença e Cache | 7 | 3 | `feature/presence-cache` |
| 5 | Busca | 8 | 2 | `feature/search` |
| 6 | Notificações, Email e Arquivos | 9 | 3, 4 | `feature/notifications-files` |
| 7 | Hardening e Entrega | 10 | todos | `feature/hardening` |

### 3.0 Baseline

- **Escopo:** ambiente funcionando, testes verdes, cobertura medida e ≥ 90%, `coverageThreshold` configurado, README honesto.
- **DoD:** `npm test` passa com threshold de 90% ativo.
- Design detalhado: seção 4.

### 3.1 Fechar Usuários (Sprint 4)

- **Escopo:** expor contatos, bloqueios e busca de usuários via REST; rate limit de autenticação; eventos de bloqueio.
- **DoD:** RF002.2, RF002.3 (parte REST) e rate limit do RF001.2 cobertos por feature tests.
- Design detalhado: seção 5.

### 3.2 Chat Base (Sprint 5) — módulo `chat`

- **Modelos:** `Conversation` e `Participant` (PostgreSQL/Sequelize, conforme SRS 7.1, acrescido de `conversations.last_message_at` e `participants.archived_at` — arquivamento é por participante); `Message` (MongoDB/Mongoose, conforme SRS 7.2).
- **ConversationService:** criar conversa 1:1 (idempotente — retorna a existente se já houver), criar grupo (até 256 participantes), renomear, arquivar/desarquivar, sair, adicionar/remover membro (apenas `admin`), listar ordenado por `last_message_at`.
- **MessageService:** enviar (texto até 10.000 caracteres, `reply_to`, `mentions`), listar com paginação por cursor (50 por página, mais recentes primeiro), soft delete (`metadata.deleted_at`).
- **Regras:** envio em conversa 1:1 bloqueado se `contactService.isBlockedByEither()`; apenas participantes leem/enviam.
- **Eventos:** `message.sent`, `message.deleted`, `conversation.created`, `conversation.updated`.
- **REST:** `/api/conversations`, `/api/conversations/:id/messages`.
- **DoD:** RF003.1, RF003.2 (via REST), RF005.1, RF005.2 atendidos; SRS 9.1 corrigido.

### 3.3 Real-Time (Sprint 6) — módulo `realtime`

- Socket.IO sobre o servidor HTTP existente, com `@socket.io/redis-adapter` para escala horizontal.
- Autenticação via JWT no handshake (`auth.token`), reutilizando `authService.validateAccessToken`.
- Ao conectar: join automático em rooms `conversation:<id>` de todas as conversas do usuário e na room `user:<id>`.
- Handlers cliente→servidor: `message:send`, `message:delivered`, `message:read`, `typing:start`, `typing:stop` (typing apenas em 1:1, expira em 3s).
- Listener do EventBus faz broadcast servidor→cliente: `message:new`, `message:status`, `conversation:updated`, `typing:indicator`.
- Cliente demo (seção 2.8).
- **DoD:** RF003.2 (WS), RF003.4, RF003.5 cobertos por testes com `socket.io-client`.

### 3.4 Presença e Cache (Sprint 7) — módulo `presence`

- `PresenceService` com Redis: chave `user:presence:<id>` com TTL de 30s renovado por heartbeat; contagem de sockets por usuário (múltiplas abas/dispositivos).
- Status manual (disponível, ocupado, ausente), integrado aos endpoints existentes de `/api/profile/status`.
- `last_seen_at` atualizado ao desconectar o último socket.
- Eventos `user:online`/`user:offline` enviados aos contatos; presença oculta para usuários bloqueados (consome `user:blocked`).
- Cache de perfil e de lista de conversas no Redis com invalidação via EventBus.
- **DoD:** RF004 atendido; presença atualiza em < 3s.

### 3.5 Busca (Sprint 8) — módulo `search`

- Índice `messages` no Elasticsearch com analyzer `portuguese` + `asciifolding`.
- `MessageIndexer` escuta `message.sent` e `message.deleted`.
- `GET /api/search/messages?q=&conversationId=&senderId=&from=&to=`: relevância, highlight, máximo 100 resultados.
- Autorização: resultados restritos às conversas em que o usuário é participante.
- **DoD:** RF006 atendido, incluindo busca com e sem acentos.

### 3.6 Notificações, Email e Arquivos (Sprint 9) — módulos `notification` e `files`

- `IEmailProvider` + templates: confirmação de email (fecha RF001.1), reset de senha (fecha RF001.3), boas-vindas.
- `IPushProvider`: push apenas para usuário offline, agrupado por conversa, respeitando `is_muted`.
- Contador de não lidas por conversa e total (via `last_read_at`).
- Upload de anexos: imagens (jpg, png, gif, até 10MB) e PDF (até 25MB); thumbnails em 3 resoluções reutilizando `ImageProcessorService`; scan com `IVirusScanner` antes de persistir.
- **DoD:** RF003.3 e RF007 atendidos; email chega no Mailpit em dev.

### 3.7 Hardening e Entrega (Sprint 10)

- `AuditLog` no MongoDB (login, exclusão, bloqueio) + `GET /api/admin/audit` (requer adicionar `role` ao User).
- Sanitização de inputs contra XSS.
- `/metrics` (Prometheus) + dashboard Grafana provisionado.
- `/health` (liveness) e `/ready` (readiness checando PostgreSQL, MongoDB, Redis, Elasticsearch).
- Swagger/OpenAPI em `/docs`.
- GitHub Actions: lint, build e testes com serviços.
- README e `docs/ARCHITECTURE.md` atualizados.
- **DoD:** CI verde; RNFs do SRS verificados.

### 3.8 Fora de escopo

MFA, E2EE, app mobile/desktop, frontend completo, som configurável (RF007.2 limitado a uma flag nas configurações do usuário).

---

## 4. Design Detalhado — Subprojeto 0: Baseline

Branch: `chore/baseline`.

1. **Ambiente:** `npm install`; `docker compose up -d`; `npm run db:migrate` (script deve existir no `package.json`; se ausente, adicionar `db:migrate` e `db:seed` usando `sequelize-cli`, pois o README os documenta).
2. **Testes:** rodar `npm test`; corrigir falhas existentes antes de qualquer outra mudança.
3. **Cobertura:** medir. Se < 90% global, adicionar testes priorizando código sem teste: `ProfileController`, `AvatarService`, `FileService`, `ImageProcessorService`, `StorageService`, `middlewares/upload`, `profile.routes`.
4. **Threshold:** em `jest.config.ts`, `coverageThreshold.global` = 90 para branches, functions, lines, statements.
5. **README:** remover o badge/tabela de "100% coverage"; marcar funcionalidades não implementadas (Socket.IO, busca, notificações, presença) como "planejado"; corrigir scripts listados que não existem.
6. **SRS:** atualizar o checklist da Sprint 4 com o que já existe (ProfileService, ProfileController, upload de avatar com multer, processamento com sharp).

**DoD:** `npm test` passa com threshold de 90% ativo; README reflete o estado real.

---

## 5. Design Detalhado — Subprojeto 1: Fechar Usuários

Branch: `feature/user-contacts-blocks`.

### 5.1 Estado atual

- `ContactService` (`src/modules/user/services/ContactService.ts`) já implementa: `addContact`, `updateContact`, `removeContact`, `getContact`, `listContacts`, `listFavorites`, `getStats`, `blockUser`, `unblockUser`, `listBlocked`, `isBlocked`, `isBlockedByEither`, `searchUsers`.
- Schemas Zod já existem em `src/modules/user/validation/contact.schemas.ts`: `addContactSchema`, `updateContactSchema`, `contactIdParamSchema`, `blockUserSchema`, `listContactsSchema`, `searchUsersForContactSchema`.
- Exceções já existem em `src/modules/user/errors/contact.errors.ts`.
- `UserEvents.BLOCKED` e `UserEvents.UNBLOCKED` já tipados no `EventMap`, mas nunca publicados.
- `authRateLimiter` existe em `src/shared/middlewares/rateLimiter.ts`, mas não é aplicado em nenhuma rota; janela atual de 1 min (SRS exige 15 min).
- **Falta:** controllers, rotas, registro em `app.ts`, publicação de eventos, aplicação do rate limit.

### 5.2 Controllers

Três controllers pequenos em `src/modules/user/controllers/`, seguindo o padrão do `ProfileController`:

**`ContactController`** (depende de `IContactService`)

| Método | Rota | Validação | Resposta |
|---|---|---|---|
| `list` | `GET /api/contacts` | `listContactsSchema` (query) | 200 paginado |
| `add` | `POST /api/contacts` | `addContactSchema` (body) | 201 |
| `listFavorites` | `GET /api/contacts/favorites` | — | 200 |
| `stats` | `GET /api/contacts/stats` | — | 200 |
| `get` | `GET /api/contacts/:contactId` | `contactIdParamSchema` | 200 |
| `update` | `PATCH /api/contacts/:contactId` | `contactIdParamSchema` + `updateContactSchema` (apelido e favorito) | 200 |
| `remove` | `DELETE /api/contacts/:contactId` | `contactIdParamSchema` | 204 |

**`BlockController`** (depende de `IContactService`)

| Método | Rota | Validação | Resposta |
|---|---|---|---|
| `list` | `GET /api/blocks` | — | 200 |
| `block` | `POST /api/blocks` | `blockUserSchema` (body `{ userId }`) | 201 |
| `unblock` | `DELETE /api/blocks/:userId` | `userIdParamSchema` | 204 |

**`UserController`** (depende de `IContactService`)

| Método | Rota | Validação | Resposta |
|---|---|---|---|
| `search` | `GET /api/users/search?query=&limit=&excludeBlocked=` | `searchUsersForContactSchema` (query) | 200 — exclui o próprio usuário; exclui bloqueados por padrão (`excludeBlocked` default `true`) |

Falha de validação: 400 `{ success: false, message, errors }`, no mesmo formato usado pelo `ProfileController`.

Os schemas existentes cobrem todos os campos acima; não criar schemas novos. `userIdParamSchema` vem de `user.schemas.ts`.

### 5.3 Rotas

- Arquivos: `src/modules/user/routes/contact.routes.ts`, `block.routes.ts`, `user.routes.ts`, exportados por `routes/index.ts`.
- Todas as rotas com `authenticate`.
- Em `contact.routes.ts`, `/favorites` e `/stats` declaradas **antes** de `/:contactId`.
- Registro em `src/app.ts`: `/api/contacts`, `/api/blocks`, `/api/users`.
- Instâncias `contactController`, `blockController`, `userController` exportadas por `controllers/index.ts`.

### 5.4 Eventos de bloqueio

- `ContactService` recebe `eventBus` como terceiro parâmetro do construtor (default: instância singleton `eventBus`).
- `blockUser` publica `UserEvents.BLOCKED` com `{ userId, blockedUserId }` após persistir.
- `unblockUser` publica `UserEvents.UNBLOCKED` com `{ userId, unblockedUserId }` após persistir.
- Consumidores serão adicionados nos subprojetos 3 e 4.

### 5.5 Rate limit (RF001.2)

- `RATE_LIMIT_AUTH_WINDOW_MS` → `15 * 60 * 1000`; `RATE_LIMIT_AUTH_MAX_REQUESTS` permanece `5`; mensagem → `'Too many authentication attempts, please try again later'`.
- `RateLimiterOptions` ganha `store?: Store` e `skipSuccessfulRequests?: boolean`.
- `createRateLimiter` usa `options.store` quando fornecido; caso contrário, `MemoryStore` se `NODE_ENV === 'test'`, senão `RedisStore`.
- Novo `getLoginRateLimiter()`: mesma configuração do auth + `skipSuccessfulRequests: true` e prefixo próprio (apenas tentativas falhas contam).
- Aplicação em `src/modules/auth/routes/auth.routes.ts`:
  - `/login` → `loginRateLimiter`
  - `/register`, `/forgot-password`, `/reset-password` → `authRateLimiter`
- Rate limiter global (`rateLimiter`, 100 req / 15 min) aplicado em `app.use('/api', ...)`.

### 5.6 Tratamento de erros

Nenhuma exceção nova. Mapeamento pelo `errorHandler` existente:

| Exceção | HTTP |
|---|---|
| `ContactNotFoundException` | 404 |
| `ContactAlreadyExistsException` | 409 |
| `CannotAddSelfException`, `CannotBlockSelfException` | 400 |
| `UserBlockedException` | 403 |
| `UserNotFoundException` | 404 |
| Rate limit excedido | 429 |
| Sem token / token inválido | 401 |

### 5.7 Testes

**Unitários** (`tests/unit/modules/user/controllers/`, `tests/unit/shared/middlewares/`):

- `ContactController`, `BlockController`, `UserController`: service mockado; para cada método — sucesso, falha de validação (400), exceção propagada.
- `ContactService`: publicação de `BLOCKED`/`UNBLOCKED` com eventBus mockado; não publica quando a operação falha.
- `rateLimiter`: seleção de store (injetado / memory em test / redis), `skipSuccessfulRequests` no login limiter.

**Feature** (`tests/feature/modules/user/`, `tests/feature/modules/auth/`), com supertest:

- Fluxo de contatos: adicionar → listar → favoritar via PATCH → listar favoritos → remover.
- Bloqueio: bloquear → busca não retorna o bloqueado → `POST /api/contacts` com o bloqueado retorna 403 → desbloquear → busca volta a retorná-lo.
- Rate limit: 5 logins com senha errada → 6ª tentativa retorna 429; logins bem-sucedidos não consomem a cota.
- Qualquer rota nova sem token → 401.

**Meta:** 100% de cobertura nos arquivos novos/alterados.

### 5.8 Adiado para outros subprojetos

- "Bloqueio impede mensagens" → subprojeto 2 (`MessageService` usa `isBlockedByEither`).
- "Ocultar presença de bloqueados" → subprojeto 4.
- "Listar contatos ordenados por última interação" (RF002.2) → subprojeto 2, quando existir `last_message_at`.

### 5.9 Definition of Done

- Todos os endpoints das seções 5.2 e 5.5 funcionando e cobertos por feature tests.
- `npm test` verde com threshold de 90%; 100% nos arquivos novos.
- `npm run lint` e `npm run build` sem erros.
- Checklist da Sprint 4 em `.github/SRS.md` totalmente marcado.
- PR aberto para `main`.
