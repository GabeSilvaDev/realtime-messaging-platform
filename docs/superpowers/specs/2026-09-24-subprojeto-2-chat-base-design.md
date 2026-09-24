# Subprojeto 2 — Chat Base (Sprint 5) — Design

**Data:** 2026-09-24
**Roadmap:** [2026-09-23-roadmap-finalizacao-design.md](2026-09-23-roadmap-finalizacao-design.md) §3.2
**Status:** Aprovado (execução autônoma autorizada pelo usuário)

---

## 1. Objetivo

Criar o módulo `chat`: conversas 1:1 e em grupo (PostgreSQL), mensagens (MongoDB, fonte única — roadmap §2.4), API REST, eventos no EventBus e regras de bloqueio. Cobre RF003.1, RF003.2 (via REST), RF005.1, RF005.2 e a pendência de RF002.2 (contatos ordenados por última interação).

Fora de escopo aqui (subprojetos seguintes): WebSocket (3), status entregue/lido e `last_read_at` (3), presença/cache (4), indexação (5), anexos e não lidas (6).

## 2. Estrutura

`src/modules/chat/` seguindo o padrão de módulo (roadmap §2.2):

```
constants/  chat.constants.ts         (limites: 256 participantes, 10.000 chars, página 50, nome 1..100)
errors/     chat.errors.ts            (exceções AppError)
interfaces/ IConversationRepository, IParticipantRepository, IMessageRepository,
            IConversationService, IMessageService
models/     Conversation.ts, Participant.ts (Sequelize) · Message.ts (Mongoose)
repositories/ ConversationRepository, ParticipantRepository, MessageRepository
services/   ConversationService, MessageService
controllers/ ConversationController, MessageController (+ reutiliza padrão helpers do módulo user)
routes/     conversation.routes.ts (inclui mensagens aninhadas)
listeners/  chat.listeners.ts         (registro de subscribers do EventBus)
types/      DTOs e tipos
validation/ chat.schemas.ts (Zod)
index.ts
```

Controllers usam `getAuthenticatedUserId`/`sendValidationError` de `src/shared/http/controller.helpers.ts` (movidos no subprojeto 1).

## 3. Modelo de dados

### 3.1 PostgreSQL (migrations novas)

**`conversations`**

| coluna | tipo | notas |
|---|---|---|
| id | UUID PK | default v4 |
| type | ENUM('direct','group') | not null |
| name | VARCHAR(100) | null; obrigatório para group |
| avatar_url | VARCHAR(500) | null |
| created_by | UUID FK users(id) | null, ON DELETE SET NULL |
| direct_key | VARCHAR(73) UNIQUE | null; para direct = `min(uuidA,uuidB) + ':' + max(...)` — garante 1 conversa 1:1 por par mesmo sob concorrência |
| last_message_at | TIMESTAMPTZ | null; índice |
| created_at / updated_at | TIMESTAMPTZ | |

**`participants`**

| coluna | tipo | notas |
|---|---|---|
| id | UUID PK | |
| conversation_id | UUID FK conversations(id) | ON DELETE CASCADE |
| user_id | UUID FK users(id) | ON DELETE CASCADE |
| role | ENUM('admin','member') | default member |
| joined_at | TIMESTAMPTZ | default now |
| last_read_at | TIMESTAMPTZ | null (usado a partir do subprojeto 3) |
| is_muted | BOOLEAN | default false |
| archived_at | TIMESTAMPTZ | null — arquivamento é por participante |
| | UNIQUE(conversation_id, user_id) | índice em user_id |

**`contacts`** (alteração): nova coluna `last_interaction_at TIMESTAMPTZ NULL` + índice.

### 3.2 MongoDB — coleção `messages`

```ts
{
  _id: ObjectId,
  conversationId: string (UUID),      // index
  senderId: string (UUID),
  content: { type: 'text', text: string },   // 'image'|'file' chegam no subprojeto 6
  replyTo: ObjectId | null,
  mentions: string[],                  // UUIDs de participantes
  metadata: { ip: string | null, device: string | null },
  deletedAt: Date | null,
  createdAt: Date, updatedAt: Date     // timestamps do Mongoose
}
índice composto: { conversationId: 1, createdAt: -1, _id: -1 }
```

## 4. Regras de negócio

**Conversas**
- `createDirect(userId, otherUserId)`: outro usuário deve existir (404), não pode ser o próprio (400), não pode haver bloqueio em nenhum sentido (`contactService.isBlockedByEither` → 403). Idempotente: se já existe (mesmo `direct_key`), retorna a existente com `created: false`; criação usa transação e trata violação de unicidade de `direct_key` relendo a existente. Os dois participantes entram como `member`.
- `createGroup(userId, { name, participantIds })`: nome 1..100; participantes deduplicados, sem o criador; todos devem existir (404 lista os ausentes); total ≤ 256 incluindo o criador (400); criador = `admin`.
- `list(userId, { archived=false, limit=20 (máx 100), offset=0 })`: conversas onde o usuário é participante, filtradas por `archived_at` nulo/não nulo, ordenadas por `last_message_at DESC NULLS LAST, created_at DESC`. Cada item inclui participantes (id, username, displayName, avatarUrl) e a própria linha de participante (role, isMuted, archivedAt).
- `get(userId, id)`: não participante recebe 404 (não revela existência).
- `rename(userId, id, name)`: apenas group, apenas admin (403); direct → 400.
- `archive/unarchive(userId, id)`: por participante.
- `leave(userId, id)`: apenas group (direct → 400). Se o último admin sai e restam membros, o membro mais antigo (`joined_at`) vira admin. Se não resta ninguém, a conversa é removida.
- `addMembers(userId, id, userIds)`: apenas admin de group; ignora quem já é participante; limite 256.
- `removeMember(userId, id, memberId)`: apenas admin de group; remover a si mesmo = `leave`.
- Métodos de consulta para outros módulos: `isParticipant(conversationId, userId)`, `getParticipantIds(conversationId)`, `getUserConversationIds(userId)`.

**Mensagens**
- `send(userId, conversationId, { text, replyTo?, mentions? }, meta)`: remetente deve ser participante (404 se não); em direct, bloqueio em qualquer sentido → 403; `text` com trim, 1..10.000; `replyTo` deve ser mensagem da mesma conversa (404 se não); `mentions` deduplicadas e todas devem ser participantes (400). Persiste no Mongo, atualiza `conversations.last_message_at`, publica `ChatEvents.MESSAGE_SENT`.
- `list(userId, conversationId, { limit=50 (máx 50), before? })`: participante (404); mais recentes primeiro; paginação por cursor `before` = id de mensagem (`createdAt/_id` estritamente anteriores); retorna `{ messages, nextCursor }` (`nextCursor` = id da última mensagem retornada quando `messages.length === limit`, senão `null`). Mensagens apagadas voltam como tombstone: `content: null`, `deletedAt` preenchido (preserva threads).
- `delete(userId, conversationId, messageId)`: apenas o autor (403); soft delete (`deletedAt`); publica `ChatEvents.MESSAGE_DELETED`. Apagar de novo é idempotente (204).

**Contatos — consistência de bloqueio (pendências do subprojeto 1)**
- `getContact`, `updateContact`/`setFavorite`/`setNickname` e `removeContact` passam a ignorar linhas bloqueadas: para o usuário, um bloqueado não é contato (404 `ContactNotFoundException`). Remover bloqueio só via `DELETE /api/blocks/:userId` (que publica `UNBLOCKED`). `isContact` e o enriquecimento `isContact` da busca também ignoram linhas bloqueadas.
- `created_by_block` passa a `NOT NULL DEFAULT false` (migration que faz backfill de nulos) e deixa de aparecer em `Contact.toJSON()` (campo interno).
- Concorrência em block/unblock: `ContactRepository.block` retorna `{ contact, changed }` (changed = linha criada ou `isBlocked` passou de false→true, via `UPDATE ... WHERE is_blocked = false` com contagem de linhas afetadas) e `unblock` retorna `changed` pela contagem de linhas afetadas do `DELETE`/`UPDATE ... WHERE is_blocked = true`; o service publica o evento só quando `changed` — elimina eventos duplicados sob concorrência.
- `excludeBlocked` da busca usa subconsulta em vez de lista `NOT IN` materializada (via `Sequelize.literal` com `replacements`/bind — nunca interpolação).
- `.env.example` e READMEs: aviso de que `TRUST_PROXY=true` permite spoof de IP; preferir número de hops ou lista de IPs/sub-redes.

**Contatos (RF002.2 pendente)**
- Listener de `MESSAGE_SENT` em conversa direct atualiza `last_interaction_at = now()` nas linhas de contato dos dois sentidos, se existirem.
- `ContactRepository.findAllByUser` passa a mapear `orderBy: 'lastInteraction'` para `last_interaction_at` com `NULLS LAST` (hoje esse valor passa na validação e quebra o SQL por não existir coluna — bug corrigido com teste).

## 5. Eventos

Ajustes em `src/shared/types/event.types.ts` / `event.interfaces.ts`:
- `ChatEvents.MESSAGE_SENT` payload: `{ messageId, conversationId, conversationType: 'direct'|'group', senderId, text, mentions, replyTo: string|null, createdAt: Date, participantIds: string[] }`.
- Novo `ChatEvents.MESSAGE_DELETED = 'chat:message-deleted'`: `{ messageId, conversationId, deletedBy }`.
- `ChatEvents.CONVERSATION_CREATED` mantém `{ conversationId, creatorId, participantIds }` e ganha `type`.
- Novo `ChatEvents.CONVERSATION_UPDATED = 'chat:conversation-updated'`: `{ conversationId, change: 'renamed'|'members_added'|'member_removed'|'member_left', actorId, participantIds }`.

Publicação via EventBus injetado (padrão do ContactService). Listeners registrados por `registerChatListeners(eventBus)` chamado no `bootstrap` (após conexões) — fora dos testes de app.

## 6. API REST (todas com `authenticate`)

| Método | Rota | Corpo/Query | Sucesso |
|---|---|---|---|
| POST | `/api/conversations/direct` | `{ userId }` | 201 (nova) / 200 (existente) |
| POST | `/api/conversations/group` | `{ name, participantIds[] }` | 201 |
| GET | `/api/conversations` | `archived?, limit?, offset?` | 200 `{ items, total, limit, offset, hasMore }` |
| GET | `/api/conversations/:id` | | 200 |
| PATCH | `/api/conversations/:id` | `{ name }` | 200 |
| POST / DELETE | `/api/conversations/:id/archive` | | 204 |
| POST | `/api/conversations/:id/leave` | | 204 |
| POST | `/api/conversations/:id/members` | `{ userIds[] }` | 200 (conversa atualizada) |
| DELETE | `/api/conversations/:id/members/:userId` | | 204 |
| GET | `/api/conversations/:id/messages` | `limit?, before?` | 200 `{ messages, nextCursor }` |
| POST | `/api/conversations/:id/messages` | `{ text, replyTo?, mentions? }` | 201 |
| DELETE | `/api/conversations/:id/messages/:messageId` | | 204 |

Metadados da mensagem: `ip` = `req.ip`, `device` = header `user-agent` (truncado a 255).

Erros: 400 validação (formato `sendValidationError`), 401, 403 (bloqueio, não-admin, não-autor), 404 (conversa/mensagem/usuário ou não participante), 409 não usado.

## 7. Testes

- Unitários: services (repos e EventBus mockados), controllers, rotas (ordem, authenticate), schemas, repositories (Sequelize/Mongoose mockados como nos repositórios existentes), listener de contatos, ContactRepository `lastInteraction`.
- Feature (supertest, services mockados no padrão do projeto): fluxo criar direct (idempotente) → enviar → listar com cursor → apagar (tombstone); grupo: criar → renomear (admin) → adicionar/remover → sair com promoção de admin; 403 bloqueio; 404 não participante; 401 sem token.
- Cobertura global continua 100% (threshold 90%).
- Smoke real (compose em portas alternativas, app no host): criar direct, enviar 3 mensagens, paginar com `limit=2`, apagar uma, conferir tombstone, bloquear e ver 403 no envio; contatos com `orderBy=lastInteraction` sem erro.

## 8. Documentação

READMEs (EN/pt-BR): tabelas de endpoints do chat, arquitetura (chat/MongoDB messages deixam de ser "planned"), roadmap. SRS local: Sprint 5 marcada.

## 9. Definition of Done

Endpoints da §6 funcionando e cobertos; regras da §4 testadas; smoke real OK; CI verde (lint, format, tsc, jest 100%); PR aberto e mergeado.
