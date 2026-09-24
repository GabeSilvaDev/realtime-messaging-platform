# Subprojeto 2 — Chat Base (Sprint 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o módulo `chat` (conversas 1:1 e em grupo no PostgreSQL, mensagens no MongoDB, API REST `/api/conversations`, eventos no EventBus e regras de bloqueio) e fechar as pendências de contatos do subprojeto 1 (consistência de bloqueio e ordenação por última interação).

**Architecture:** Novo módulo `src/modules/chat` no padrão do módulo `user`: models Sequelize `Conversation`/`Participant` + model Mongoose `Message`, repositórios por store, `ConversationService` e `MessageService` com dependências injetadas (repositórios, `IUserService`/`IContactService` do módulo user e `EventBus`), controllers finos com Zod e um router único `/api/conversations` (mensagens aninhadas). Um listener registrado no `bootstrap` consome `chat:message-sent` e grava `contacts.last_interaction_at` via `IContactService.recordInteraction`. MongoDB é a fonte única das mensagens (roadmap §2.4).

**Tech Stack:** Node 20, TypeScript 5.9 (strict), Express 5, Sequelize 6 + PostgreSQL 17, Mongoose 9 + MongoDB 8, Zod 4, Jest 30 + ts-jest + supertest.

**Spec:** `docs/superpowers/specs/2026-09-24-subprojeto-2-chat-base-design.md` (fonte da verdade) · convenções em `docs/superpowers/specs/2026-09-23-roadmap-finalizacao-design.md` §2.

## Global Constraints

- Branch `feature/chat-base` já existe (criada pelo controlador) — não há passo de criação de branch. Confirme com `git branch --show-current` antes da Task 1.
- Rodar jest SEMPRE como `node node_modules/.bin/jest ...` (nunca `npx jest`: um hook reescreve e filtra a saída). `jest.config.ts` usa `roots: [src, tests]`, threshold global de 90% e a cobertura real atual é 100% — todo arquivo novo em `src/` precisa de teste; manter 100% (statements, branches, functions, lines).
- `jest.config.ts` tem `resetMocks`, `restoreMocks` e `clearMocks`: NUNCA colocar implementação de mock dentro de factory de `jest.mock` (nada de `jest.fn(() => ...)`/`mockReturnValue` na factory). Use funções/classes simples na factory ou configure `mockResolvedValue`/`mockImplementation` em `beforeEach`/no próprio teste. `jest.fn()` sem implementação na factory é ok.
- `tests/setup.ts` não chama `initLogger` — mocke `@/shared/logger` ou chame `initLogger` onde middlewares reais logam (os testes deste plano usam `errorHandler`, que tolera logger ausente).
- Prettier é verificado no CI (`npm run format:check` cobre `src/**/*.ts` e `tests/**/*.ts`): rodar `node node_modules/.bin/prettier --write <arquivos>` antes de cada commit. ESLint `strictTypeChecked` em `src`: `node node_modules/.bin/eslint src` deve sair com código 0. `tsconfig.json` inclui `tests/**`: `node node_modules/.bin/tsc --noEmit` (como no CI) também checa os testes.
- Commits: gitmoji + Conventional Commits em PT-BR, atômicos; NUNCA mencionar Claude/Anthropic/IA nem adicionar `Co-Authored-By`; NUNCA commitar `.github/SRS.md` nem `*.stale-root/`. Sempre `git add <arquivos explícitos>` (nunca `git add -A`/`git add .`).
- Validação com stack real usa portas alternativas: `POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301`; app no host com `PORT=3100` (fluxo "Running the app (on the host)" do README); NUNCA tocar containers de outros projetos (portas 3000/5432/6379 do host são deles); o container `rtm-app` não funciona — não usar.
- Express 5: `req.query` é somente leitura — apenas ler (validar com `schema.safeParse(req.query)`), nunca atribuir.
- Fixtures de UUID devem ser v4 válidos (Zod 4 `z.uuid()` valida versão/variante), ex.: `11111111-1111-4111-8111-111111111111`. Fixtures de ObjectId: 24 hex, ex.: `65f000000000000000000001`.
- Módulos só se consomem por interface exportada ou EventBus (roadmap §2.3): o chat usa `IUserService`/`IContactService` e os singletons `userService`/`contactService` importados de `@/modules/user/services/UserService` e `@/modules/user/services/ContactService` — nunca repositórios do módulo user.
- Limites (spec §2/§4): grupo ≤ 256 participantes incluindo o criador; texto 1..10.000 caracteres após trim; página de mensagens 50 (máx 50); nome de grupo 1..100; lista de conversas `limit` 20 (máx 100), `offset` 0.
- Respostas: sucesso `{ success: true, data }`; validação 400 via `sendValidationError` (`{ success: false, message: 'Dados inválidos', errors }`) de `@/shared/http/controller.helpers`; demais erros são `AppError` tratados pelo `errorHandler`. Rotas estáticas (`/direct`, `/group`) antes de `/:id`.

## Decisões de design (ambiguidades do spec resolvidas)

1. **`created_by_block` interno:** `ContactAttributes` (público, retornado por `toJSON()`) perde `createdByBlock`; o model usa `ContactModelAttributes extends ContactAttributes { createdByBlock; lastInteractionAt }`. `lastInteractionAt` também é interno (só ordena a lista; não aparece no JSON).
2. **Bloqueio idempotente sem eventos duplicados:** `ContactRepository.block` retorna `{ contact, changed }` (`findOrCreate` + `UPDATE ... WHERE is_blocked = false`); `ContactService.blockUser` não faz mais o pré-check `isBlocked` e publica `user:blocked` só se `changed`. `unblock` apaga (linha criada pelo bloqueio) ou atualiza condicionalmente e retorna `affected > 0`; um segundo desbloqueio concorrente continua recebendo 404 "Usuário não está bloqueado" (comportamento atual).
3. **Tombstone:** mensagem apagada volta com `content: null`, `mentions: []`, `deletedAt` preenchido; `replyTo`/datas preservados. `metadata` (ip/device) nunca é exposto na API.
4. **`CONVERSATION_UPDATED.participantIds`:** inclui todos os afetados — após a mudança em `members_added`/`renamed`; antes da mudança em `member_removed`/`member_left` (quem saiu/foi removido também é notificado).
5. **Listener:** `registerChatListeners(bus?, contacts?)` fica em `src/modules/chat/listeners` e consome `IContactService.recordInteraction(userId, otherUserId)` (novo método do módulo user). Chamado no `bootstrap` após as conexões.
6. **UUIDs em minúsculas:** os schemas Zod do chat normalizam UUIDs para minúsculas (a `direct_key` e as comparações de ids dependem disso).
7. **Cursor/replyTo de outra conversa:** respondem 404 (`MessageNotFoundException`), assim como ids inexistentes.
8. **Feature tests:** o spec pede "services mockados no padrão do projeto"; aqui os services **do módulo user** (fronteira) são falsos e os do chat são reais sobre repositórios em memória (`tests/support/chat/inMemoryChat.ts`), para que os fluxos (promoção de admin, cursor, tombstone, 403/404) sejam de fato exercitados via HTTP. Os unit tests continuam com tudo mockado.
9. **Índices Mongo:** só o composto `{ conversationId: 1, createdAt: -1, _id: -1 }` — o prefixo já atende consultas por `conversationId`, então não há índice simples redundante.
10. **Promoção de admin:** "membro mais antigo" = menor `(joined_at, id)`; membros criados juntos têm o mesmo `joined_at` (empate resolvido por `id`).
11. **`last_message_at` monotônico:** `touchLastMessageAt` só avança (`WHERE last_message_at IS NULL OR last_message_at < :at`).
12. **Grupo:** `participantIds` exige ≥ 1 item no schema; após deduplicar e remover o criador pode sobrar 0 (grupo só com o criador é aceito). Cada participante no DTO traz também `role`.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/types/event.types.ts` | Modificar | `ChatEvents.MESSAGE_DELETED`, `CONVERSATION_UPDATED` |
| `src/shared/interfaces/event.interfaces.ts` | Modificar | Payloads tipados dos eventos de chat |
| `src/modules/user/types/contact.types.ts` | Modificar | `ContactModelAttributes`, `BlockResult` |
| `src/modules/user/models/Contact.ts` | Modificar | `created_by_block` NOT NULL/interno; `last_interaction_at` |
| `src/modules/user/interfaces/IContactRepository.ts` | Modificar | `block → BlockResult`; `touchInteraction` |
| `src/modules/user/interfaces/IContactService.ts` | Modificar | `recordInteraction` |
| `src/modules/user/repositories/ContactRepository.ts` | Modificar | block/unblock por linhas afetadas; `isContact` ignora bloqueados; ordem `lastInteraction`; `touchInteraction` |
| `src/modules/user/repositories/UserRepository.ts` | Modificar | `excludeBlocked` via subconsulta + `replacements`; `isContact` ignora bloqueados |
| `src/modules/user/services/ContactService.ts` | Modificar | linha bloqueada ≠ contato; evento só com `changed`; `recordInteraction` |
| `.env.example` | Modificar | Aviso sobre `TRUST_PROXY=true` |
| `src/database/migrations/20260924000000-make-contacts-created-by-block-not-null.ts` | Criar | Backfill + NOT NULL |
| `src/database/migrations/20260924000100-create-conversations-table.ts` | Criar | Tabela `conversations` |
| `src/database/migrations/20260924000200-create-participants-table.ts` | Criar | Tabela `participants` |
| `src/database/migrations/20260924000300-add-last-interaction-at-to-contacts.ts` | Criar | `contacts.last_interaction_at` + índice |
| `src/modules/chat/constants/*` | Criar | Limites e enums |
| `src/modules/chat/errors/*` | Criar | Exceções `AppError` do chat |
| `src/modules/chat/types/*` | Criar | Atributos, DTOs, registros de mensagem |
| `src/modules/chat/models/{Conversation,Participant,Message,index}.ts` | Criar | Models Sequelize + Mongoose |
| `src/modules/chat/interfaces/*` | Criar | Contratos de repositórios e services |
| `src/modules/chat/repositories/*` | Criar | `ConversationRepository`, `ParticipantRepository`, `MessageRepository` |
| `src/modules/chat/services/*` | Criar | `ConversationService`, `MessageService`, `buildDirectKey` |
| `src/modules/chat/listeners/*` | Criar | `registerChatListeners` |
| `src/modules/chat/validation/*` | Criar | Schemas Zod |
| `src/modules/chat/controllers/*` | Criar | `ConversationController`, `MessageController`, `parseConversationId` |
| `src/modules/chat/routes/*` | Criar | `conversationRoutes` |
| `src/modules/chat/index.ts` | Criar | Barrel do módulo |
| `src/app.ts` | Modificar | Monta `/api/conversations` |
| `src/bootstrap.ts` | Modificar | `registerChatListeners()` após conexões |
| `tests/support/chat/inMemoryChat.ts` | Criar | Repositórios em memória para feature tests |
| `tests/unit/...`, `tests/feature/modules/chat/chat.test.ts` | Criar/Modificar | Ver cada task |
| `README.md`, `README.pt-BR.md` | Modificar | Endpoints do chat, arquitetura, roadmap, TRUST_PROXY |
| `.github/SRS.md` | Modificar (local, NÃO commitar) | Sprint 5 e fluxo 9.1 |

---

### Task 1: Eventos de chat tipados no EventBus

**Files:**
- Modify: `src/shared/types/event.types.ts` (enum `ChatEvents`)
- Modify: `src/shared/interfaces/event.interfaces.ts` (entradas de `ChatEvents` no `EventMap`)
- Modify: `tests/unit/shared/types/index.test.ts`
- Create: `tests/unit/shared/event-bus/chat-events.test.ts`

**Interfaces:**
- Produces:
  - `ChatEvents.MESSAGE_DELETED = 'chat:message-deleted'`, `ChatEvents.CONVERSATION_UPDATED = 'chat:conversation-updated'`.
  - `EventPayload<ChatEvents.MESSAGE_SENT>` = `{ messageId: string; conversationId: string; conversationType: 'direct' | 'group'; senderId: string; text: string; mentions: string[]; replyTo: string | null; createdAt: Date; participantIds: string[] }`.
  - `EventPayload<ChatEvents.MESSAGE_DELETED>` = `{ messageId: string; conversationId: string; deletedBy: string }`.
  - `EventPayload<ChatEvents.CONVERSATION_CREATED>` = `{ conversationId: string; type: 'direct' | 'group'; creatorId: string; participantIds: string[] }`.
  - `EventPayload<ChatEvents.CONVERSATION_UPDATED>` = `{ conversationId: string; change: 'renamed' | 'members_added' | 'member_removed' | 'member_left'; actorId: string; participantIds: string[] }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/unit/shared/types/index.test.ts`, no teste `'should export ChatEvents enum'`, trocar a última linha:

```ts
      expect(ChatEvents.CONVERSATION_CREATED).toBe('chat:conversation-created');
```

por:

```ts
      expect(ChatEvents.CONVERSATION_CREATED).toBe('chat:conversation-created');
      expect(ChatEvents.CONVERSATION_UPDATED).toBe('chat:conversation-updated');
      expect(ChatEvents.MESSAGE_DELETED).toBe('chat:message-deleted');
```

Criar `tests/unit/shared/event-bus/chat-events.test.ts`:

```ts
import { EventBus } from '@/shared/event-bus/EventBus';
import type { BaseEvent, EventPayload } from '@/shared/interfaces';
import { ChatEvents } from '@/shared/types';

describe('EventBus — eventos de chat tipados', () => {
  let bus: EventBus;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('deve entregar MESSAGE_SENT com o payload completo', async () => {
    const received: BaseEvent<EventPayload<ChatEvents.MESSAGE_SENT>>[] = [];
    bus.subscribe(ChatEvents.MESSAGE_SENT, (event) => {
      received.push(event);
    });
    const payload: EventPayload<ChatEvents.MESSAGE_SENT> = {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      conversationType: 'direct',
      senderId: '11111111-1111-4111-8111-111111111111',
      text: 'olá',
      mentions: [],
      replyTo: null,
      createdAt: new Date('2026-09-24T10:00:00.000Z'),
      participantIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    };

    await bus.publish(ChatEvents.MESSAGE_SENT, payload);

    expect(received).toHaveLength(1);
    expect(received[0]!.name).toBe('chat:message-sent');
    expect(received[0]!.payload).toEqual(payload);
  });

  it('deve entregar MESSAGE_DELETED', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.MESSAGE_DELETED, handler);

    await bus.publish(ChatEvents.MESSAGE_DELETED, {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deletedBy: '11111111-1111-4111-8111-111111111111',
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat:message-deleted',
        payload: expect.objectContaining({ deletedBy: '11111111-1111-4111-8111-111111111111' }),
      })
    );
  });

  it('deve entregar CONVERSATION_CREATED com type', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.CONVERSATION_CREATED, handler);

    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'group',
      creatorId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ type: 'group' }) })
    );
  });

  it('deve entregar CONVERSATION_UPDATED', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, handler);

    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      change: 'renamed',
      actorId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat:conversation-updated',
        payload: expect.objectContaining({ change: 'renamed' }),
      })
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/shared/event-bus/chat-events.test.ts tests/unit/shared/types/index.test.ts --coverage=false`
Expected: FAIL — erros de tipo do ts-jest (`conversationType`/`type`/`change` não existem nos payloads; `ChatEvents.MESSAGE_DELETED` inexistente) e `expect(...).toBe('chat:conversation-updated')` recebendo `undefined`.

- [ ] **Step 3: Implementar**

Em `src/shared/types/event.types.ts`, o enum `ChatEvents` passa a ser:

```ts
export enum ChatEvents {
  MESSAGE_SENT = 'chat:message-sent',
  MESSAGE_DELIVERED = 'chat:message-delivered',
  MESSAGE_READ = 'chat:message-read',
  TYPING_STARTED = 'chat:typing-started',
  TYPING_STOPPED = 'chat:typing-stopped',
  CONVERSATION_CREATED = 'chat:conversation-created',
  CONVERSATION_UPDATED = 'chat:conversation-updated',
  MESSAGE_DELETED = 'chat:message-deleted',
}
```

Em `src/shared/interfaces/event.interfaces.ts`, substituir a entrada `[ChatEvents.MESSAGE_SENT]: { messageId; conversationId; senderId; content }` por:

```ts
  [ChatEvents.MESSAGE_SENT]: {
    messageId: string;
    conversationId: string;
    conversationType: 'direct' | 'group';
    senderId: string;
    text: string;
    mentions: string[];
    replyTo: string | null;
    createdAt: Date;
    participantIds: string[];
  };
  [ChatEvents.MESSAGE_DELETED]: {
    messageId: string;
    conversationId: string;
    deletedBy: string;
  };
```

e substituir a entrada `[ChatEvents.CONVERSATION_CREATED]` (atual `{ conversationId; creatorId; participantIds }`) por:

```ts
  [ChatEvents.CONVERSATION_CREATED]: {
    conversationId: string;
    type: 'direct' | 'group';
    creatorId: string;
    participantIds: string[];
  };
  /**
   * `participantIds` inclui todos os afetados: em `members_added`, os participantes após a
   * mudança; em `member_removed`/`member_left`, os participantes antes da mudança (o removido
   * ou quem saiu também é notificado).
   */
  [ChatEvents.CONVERSATION_UPDATED]: {
    conversationId: string;
    change: 'renamed' | 'members_added' | 'member_removed' | 'member_left';
    actorId: string;
    participantIds: string[];
  };
```

(As demais entradas do `EventMap` ficam como estão. Nenhum código de `src` publicava `MESSAGE_SENT`/`CONVERSATION_CREATED`, então não há outros ajustes.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/shared --coverage=false`
Expected: PASS.

- [ ] **Step 5: Verificar tipos, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write src/shared/types/event.types.ts src/shared/interfaces/event.interfaces.ts tests/unit/shared/types/index.test.ts tests/unit/shared/event-bus/chat-events.test.ts
git add src/shared/types/event.types.ts src/shared/interfaces/event.interfaces.ts tests/unit/shared/types/index.test.ts tests/unit/shared/event-bus/chat-events.test.ts
git commit -m "✨ feat: tipa eventos de chat no EventBus (message-deleted, conversation-updated)"
```

---

### Task 2: `created_by_block` NOT NULL e interno ao `Contact`

**Files:**
- Modify: `src/modules/user/types/contact.types.ts`
- Modify: `src/modules/user/models/Contact.ts`
- Create: `src/database/migrations/20260924000000-make-contacts-created-by-block-not-null.ts`
- Modify: `tests/unit/modules/user/models/Contact.test.ts`
- Modify: `tests/unit/modules/user/types/contact.types.test.ts`
- Modify: `tests/unit/modules/user/services/ContactService.test.ts`

**Interfaces:**
- Produces:
  - `ContactAttributes` sem `createdByBlock` (é o que `Contact.toJSON()` e os repositórios devolvem).
  - `interface ContactModelAttributes extends ContactAttributes { createdByBlock: boolean }` (a Task 11 acrescenta `lastInteractionAt`).
  - `Contact extends Model<ContactModelAttributes, …> implements ContactModelAttributes`; `toJSON(): ContactAttributes`.

- [ ] **Step 1: Escrever os testes que falham**

Substituir `tests/unit/modules/user/models/Contact.test.ts` por:

```ts
import Contact from '@/modules/user/models/Contact';

describe('Contact Model', () => {
  describe('toJSON', () => {
    it('deve retornar ContactAttributes corretamente', () => {
      const mockDate = new Date('2026-01-01T00:00:00.000Z');

      const contact = Contact.build(
        {
          userId: 'user-123',
          contactId: 'user-456',
          nickname: 'Meu Amigo',
          isBlocked: false,
          isFavorite: true,
          blockedAt: null,
          createdByBlock: false,
        },
        { isNewRecord: false }
      );

      contact.setDataValue('id', 'contact-123');
      contact.setDataValue('createdAt', mockDate);
      contact.setDataValue('updatedAt', mockDate);

      const json = contact.toJSON();

      expect(json).toEqual({
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: 'Meu Amigo',
        isBlocked: false,
        isFavorite: true,
        blockedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
    });

    it('não deve expor o campo interno createdByBlock no toJSON', () => {
      const mockDate = new Date('2026-01-01T00:00:00.000Z');

      const contact = Contact.build(
        {
          userId: 'user-123',
          contactId: 'user-999',
          nickname: null,
          isBlocked: true,
          isFavorite: false,
          blockedAt: mockDate,
          createdByBlock: true,
        },
        { isNewRecord: false }
      );

      contact.setDataValue('id', 'contact-789');
      contact.setDataValue('createdAt', mockDate);
      contact.setDataValue('updatedAt', mockDate);

      const json = contact.toJSON();

      expect(json).not.toHaveProperty('createdByBlock');
      expect(contact.createdByBlock).toBe(true);
    });

    it('deve retornar ContactAttributes com isBlocked true e blockedAt preenchido', () => {
      const mockDate = new Date('2026-01-01T00:00:00.000Z');
      const blockedDate = new Date('2026-01-02T00:00:00.000Z');

      const contact = Contact.build(
        {
          userId: 'user-123',
          contactId: 'user-789',
          nickname: null,
          isBlocked: true,
          isFavorite: false,
          blockedAt: blockedDate,
        },
        { isNewRecord: false }
      );

      contact.setDataValue('id', 'contact-456');
      contact.setDataValue('createdAt', mockDate);
      contact.setDataValue('updatedAt', mockDate);

      const json = contact.toJSON();

      expect(json.isBlocked).toBe(true);
      expect(json.blockedAt).toEqual(blockedDate);
      expect(json.nickname).toBeNull();
    });
  });

  describe('atributos', () => {
    it('deve declarar created_by_block como NOT NULL com default false', () => {
      const attribute = Contact.getAttributes().createdByBlock;

      expect(attribute.allowNull).toBe(false);
      expect(attribute.defaultValue).toBe(false);
      expect(attribute.field).toBe('created_by_block');
    });
  });
});
```

Em `tests/unit/modules/user/types/contact.types.test.ts`:

1. Trocar o import por:

```ts
import {
  ContactAttributes,
  ContactCreationAttributes,
  ContactModelAttributes,
  ContactWithUser,
  ContactListFilters,
  ContactListOptions,
  PaginatedContacts,
  BlockedUser,
  ContactStats,
} from '@/modules/user/types/contact.types';
```

2. Apagar a linha `createdByBlock: …,` de todos os literais tipados como `ContactAttributes`, `ContactWithUser` e dos itens de `PaginatedContacts.contacts` (são 6 linhas: nos três testes de `describe('ContactAttributes')`, nos dois de `describe('ContactWithUser')` e no primeiro de `describe('PaginatedContacts')`) e a linha `expect(contact.createdByBlock).toBe(true);` do teste `'deve aceitar blockedAt com data quando bloqueado'`. **Manter** `createdByBlock` nos literais de `ContactCreationAttributes` (o tipo de criação continua aceitando o campo).

3. Inserir, imediatamente antes de `describe('ContactCreationAttributes', () => {`:

```ts
  describe('ContactModelAttributes', () => {
    it('deve estender ContactAttributes com o campo interno createdByBlock', () => {
      const attrs: ContactModelAttributes = {
        id: 'contact-123',
        userId: 'user-123',
        contactId: 'user-456',
        nickname: null,
        isBlocked: true,
        isFavorite: false,
        blockedAt: new Date(),
        createdByBlock: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const publicAttrs: ContactAttributes = attrs;

      expect(attrs.createdByBlock).toBe(true);
      expect(publicAttrs.id).toBe('contact-123');
    });
  });
```

Em `tests/unit/modules/user/services/ContactService.test.ts`, remover `createdByBlock: true,` dos dois literais que o usam (agora seria propriedade excedente em `ContactAttributes`):
- no teste `'deve lançar UserBlockedException (403) mesmo quando já existe um contato criado pelo bloqueio, …'`, o objeto passado a `findByUserAndContact.mockResolvedValue({ ...mockContact, isBlocked: true, createdByBlock: true })` vira `{ ...mockContact, isBlocked: true }`;
- no teste `'deve bloquear usuário com sucesso'`, o objeto passado a `block.mockResolvedValue({ ...mockContact, isBlocked: true, blockedAt: new Date(), createdByBlock: true })` vira `{ ...mockContact, isBlocked: true, blockedAt: new Date() }`.

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/models/Contact.test.ts tests/unit/modules/user/types/contact.types.test.ts --coverage=false`
Expected: FAIL — `ContactModelAttributes` não exportado; `toJSON()` ainda contém `createdByBlock`; `allowNull` de `createdByBlock` é `true`.

- [ ] **Step 3: Implementar**

Substituir `src/modules/user/types/contact.types.ts` por:

```ts
export interface ContactAttributes {
  id: string;
  userId: string;
  contactId: string;
  nickname: string | null;
  isBlocked: boolean;
  isFavorite: boolean;
  blockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Atributos persistidos do model `Contact`, incluindo campos internos que não são expostos
 * pela API (`toJSON()` devolve apenas `ContactAttributes`).
 */
export interface ContactModelAttributes extends ContactAttributes {
  createdByBlock: boolean;
}

export interface ContactCreationAttributes {
  userId: string;
  contactId: string;
  nickname?: string | null;
  isBlocked?: boolean;
  isFavorite?: boolean;
  blockedAt?: Date | null;
  createdByBlock?: boolean;
}

export interface ContactWithUser extends ContactAttributes {
  contact: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    lastSeenAt: Date | null;
  };
}

export interface ContactListFilters {
  isBlocked?: boolean;
  isFavorite?: boolean;
  search?: string;
}

export interface ContactListOptions {
  filters?: ContactListFilters;
  orderBy?: 'nickname' | 'createdAt' | 'lastInteraction';
  order?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface PaginatedContacts {
  contacts: ContactWithUser[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BlockedUser {
  id: string;
  userId: string;
  blockedUserId: string;
  blockedAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface ContactStats {
  total: number;
  favorites: number;
  blocked: number;
}
```

Substituir `src/modules/user/models/Contact.ts` por:

```ts
import type {
  ContactAttributes,
  ContactCreationAttributes,
  ContactModelAttributes,
} from '@/modules/user/types';
import User from '@/shared/database/models/User';
import sequelize from '@/shared/database/sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

class Contact
  extends Model<
    ContactModelAttributes,
    Optional<ContactCreationAttributes, 'nickname' | 'isFavorite' | 'createdByBlock'>
  >
  implements ContactModelAttributes
{
  declare id: string;
  declare userId: string;
  declare contactId: string;
  declare nickname: string | null;
  declare isBlocked: boolean;
  declare isFavorite: boolean;
  declare blockedAt: Date | null;
  declare createdByBlock: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;

  declare user?: User;
  declare contact?: User;

  toJSON(): ContactAttributes {
    return {
      id: this.id,
      userId: this.userId,
      contactId: this.contactId,
      nickname: this.nickname,
      isBlocked: this.isBlocked,
      isFavorite: this.isFavorite,
      blockedAt: this.blockedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

Contact.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    contactId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'contact_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    nickname: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    isBlocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_blocked',
    },
    isFavorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_favorite',
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'blocked_at',
    },
    createdByBlock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'created_by_block',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'contacts',
    modelName: 'Contact',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'contact_id'],
        name: 'contacts_user_contact_unique',
      },
    ],
  }
);

Contact.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

Contact.belongsTo(User, {
  foreignKey: 'contactId',
  as: 'contact',
});

export default Contact;
```

Criar `src/database/migrations/20260924000000-make-contacts-created-by-block-not-null.ts` (migrations ficam fora da cobertura; são validadas no smoke da Task 15):

```ts
import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    'UPDATE contacts SET created_by_block = false WHERE created_by_block IS NULL'
  );
  await queryInterface.changeColumn('contacts', 'created_by_block', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn('contacts', 'created_by_block', {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  });
}
```

`ContactRepository.unblock` continua lendo `contact.createdByBlock` da instância do model (atributo do model), então compila sem mudanças nesta task.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/user --coverage=false && node node_modules/.bin/tsc --noEmit`
Expected: PASS e `tsc` sem erros.

- [ ] **Step 5: Formatar e commitar**

```bash
node node_modules/.bin/prettier --write src/modules/user/types/contact.types.ts src/modules/user/models/Contact.ts src/database/migrations/20260924000000-make-contacts-created-by-block-not-null.ts tests/unit/modules/user/models/Contact.test.ts tests/unit/modules/user/types/contact.types.test.ts tests/unit/modules/user/services/ContactService.test.ts
node node_modules/.bin/eslint src
git add src/modules/user/types/contact.types.ts src/modules/user/models/Contact.ts src/database/migrations/20260924000000-make-contacts-created-by-block-not-null.ts tests/unit/modules/user/models/Contact.test.ts tests/unit/modules/user/types/contact.types.test.ts tests/unit/modules/user/services/ContactService.test.ts
git commit -m "🗃️ feat: torna created_by_block NOT NULL e interno ao Contact"
```

---

### Task 3: Bloqueio/desbloqueio sem eventos duplicados sob concorrência

**Files:**
- Modify: `src/modules/user/types/contact.types.ts` (acrescentar `BlockResult`)
- Modify: `src/modules/user/interfaces/IContactRepository.ts`
- Modify: `src/modules/user/repositories/ContactRepository.ts` (`block`, `unblock`)
- Modify: `src/modules/user/services/ContactService.ts` (`blockUser`)
- Modify: `tests/unit/modules/user/repositories/ContactRepository.test.ts`
- Modify: `tests/unit/modules/user/services/ContactService.test.ts`
- Modify: `tests/unit/modules/user/services/ContactService.events.test.ts`
- Modify: `tests/unit/modules/user/types/contact.types.test.ts`

**Interfaces:**
- Consumes: `ContactModelAttributes` (Task 2).
- Produces:
  - `interface BlockResult { contact: ContactAttributes; changed: boolean }`.
  - `IContactRepository.block(userId: string, contactId: string): Promise<BlockResult>`.
  - `IContactRepository.unblock(userId: string, contactId: string): Promise<boolean>` — `true` só se esta chamada alterou/apagou uma linha.
  - `ContactService.blockUser` publica `UserEvents.BLOCKED` apenas quando `changed === true` (sem pré-check `isBlocked`).

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/unit/modules/user/repositories/ContactRepository.test.ts`:

1. Na factory de `jest.mock('@/modules/user/models/Contact', …)`, acrescentar `update: jest.fn(),` logo após `create: jest.fn(),`.
2. Substituir os blocos `describe('block', …)` e `describe('unblock', …)` (os dois últimos do arquivo) por:

```ts
  describe('block', () => {
    it('deve criar a linha bloqueada e retornar changed=true quando não existia', async () => {
      const blockedContact = {
        ...mockContactInstance,
        isBlocked: true,
        toJSON: jest.fn().mockReturnValue({ ...mockContactInstance, isBlocked: true }),
      };
      MockContact.findOrCreate.mockResolvedValue([blockedContact as any, true]);

      const result = await repository.block('user-123', 'contact-456');

      expect(MockContact.findOrCreate).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456' },
        defaults: {
          userId: 'user-123',
          contactId: 'contact-456',
          isBlocked: true,
          blockedAt: expect.any(Date),
          createdByBlock: true,
        },
      });
      expect(MockContact.update).not.toHaveBeenCalled();
      expect(result.changed).toBe(true);
      expect(result.contact.isBlocked).toBe(true);
    });

    it('deve bloquear contato existente via UPDATE condicional e retornar changed=true', async () => {
      const existingContact = {
        ...mockContactInstance,
        isBlocked: false,
        toJSON: jest.fn().mockReturnValue({ ...mockContactInstance, isBlocked: true }),
        reload: jest.fn().mockResolvedValue(undefined),
      };
      MockContact.findOrCreate.mockResolvedValue([existingContact as any, false]);
      MockContact.update.mockResolvedValue([1] as any);

      const result = await repository.block('user-123', 'contact-456');

      expect(MockContact.update).toHaveBeenCalledWith(
        { isBlocked: true, blockedAt: expect.any(Date) },
        { where: { id: 'contact-id-1', isBlocked: false } }
      );
      expect(existingContact.reload).toHaveBeenCalledTimes(1);
      expect(result.changed).toBe(true);
    });

    it('deve retornar changed=false quando outra requisição já bloqueou (0 linhas afetadas)', async () => {
      const alreadyBlocked = {
        ...mockContactInstance,
        isBlocked: true,
        toJSON: jest.fn().mockReturnValue({ ...mockContactInstance, isBlocked: true }),
        reload: jest.fn(),
      };
      MockContact.findOrCreate.mockResolvedValue([alreadyBlocked as any, false]);
      MockContact.update.mockResolvedValue([0] as any);

      const result = await repository.block('user-123', 'contact-456');

      expect(alreadyBlocked.reload).not.toHaveBeenCalled();
      expect(result.changed).toBe(false);
    });
  });

  describe('unblock', () => {
    it('deve apagar a linha criada só pelo bloqueio e retornar true', async () => {
      MockContact.destroy.mockResolvedValue(1);

      const result = await repository.unblock('user-123', 'contact-456');

      expect(MockContact.destroy).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          contactId: 'contact-456',
          isBlocked: true,
          createdByBlock: true,
        },
      });
      expect(MockContact.update).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('deve limpar isBlocked/blockedAt de contato pré-existente via UPDATE condicional', async () => {
      MockContact.destroy.mockResolvedValue(0);
      MockContact.update.mockResolvedValue([1] as any);

      const result = await repository.unblock('user-123', 'contact-456');

      expect(MockContact.update).toHaveBeenCalledWith(
        { isBlocked: false, blockedAt: null },
        { where: { userId: 'user-123', contactId: 'contact-456', isBlocked: true } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando nenhuma linha foi alterada (não bloqueado ou concorrência)', async () => {
      MockContact.destroy.mockResolvedValue(0);
      MockContact.update.mockResolvedValue([0] as any);

      const result = await repository.unblock('user-123', 'contact-456');

      expect(result).toBe(false);
    });
  });
```

Em `tests/unit/modules/user/services/ContactService.test.ts`, substituir o bloco `describe('blockUser', …)` inteiro por:

```ts
  describe('blockUser', () => {
    it('deve bloquear usuário com sucesso', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.block.mockResolvedValue({
        contact: { ...mockContact, isBlocked: true, blockedAt: new Date() },
        changed: true,
      });

      await contactService.blockUser('user-123', 'contact-456');

      expect(mockContactRepository.block).toHaveBeenCalledWith('user-123', 'contact-456');
    });

    it('deve ser idempotente quando já está bloqueado (repositório retorna changed=false)', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.block.mockResolvedValue({
        contact: { ...mockContact, isBlocked: true },
        changed: false,
      });

      await expect(contactService.blockUser('user-123', 'contact-456')).resolves.toBeUndefined();
      expect(mockContactRepository.isBlocked).not.toHaveBeenCalled();
    });

    it('deve lançar CannotBlockSelfException ao bloquear a si mesmo', async () => {
      await expect(contactService.blockUser('user-123', 'user-123')).rejects.toThrow(
        CannotBlockSelfException
      );
    });

    it('deve lançar UserNotFoundException quando usuário alvo não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(contactService.blockUser('user-123', 'nonexistent')).rejects.toThrow(
        UserNotFoundException
      );
    });
  });
```

Substituir `tests/unit/modules/user/services/ContactService.events.test.ts` por:

```ts
jest.mock('@/shared/database', () => ({
  sequelize: { models: {} },
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.mock('@/modules/user/repositories', () => ({
  contactRepository: {},
  userRepository: {},
  ContactRepository: jest.fn(),
  UserRepository: jest.fn(),
}));

import { ContactService } from '@/modules/user/services/ContactService';
import type { IContactRepository, IUserRepository } from '@/modules/user/interfaces';
import { UserEvents } from '@/shared/types';

describe('ContactService — eventos de bloqueio', () => {
  const contacts = {
    block: jest.fn(),
    unblock: jest.fn(),
    isBlocked: jest.fn(),
  } as unknown as jest.Mocked<IContactRepository>;
  const users = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;
  const events = { publish: jest.fn().mockResolvedValue('event-id') };

  let service: ContactService;

  beforeEach(() => {
    jest.clearAllMocks();
    events.publish.mockResolvedValue('event-id');
    service = new ContactService(contacts, users, events);
  });

  it('deve publicar user:blocked quando o bloqueio alterou a linha (changed=true)', async () => {
    (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1' });
    (contacts.block as jest.Mock).mockResolvedValue({ contact: {}, changed: true });

    await service.blockUser('user-1', 'target-1');

    expect(contacts.block).toHaveBeenCalledWith('user-1', 'target-1');
    expect(events.publish).toHaveBeenCalledWith(UserEvents.BLOCKED, {
      userId: 'user-1',
      blockedUserId: 'target-1',
    });
  });

  it('não deve publicar quando o repositório informa changed=false (já bloqueado/concorrência)', async () => {
    (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1' });
    (contacts.block as jest.Mock).mockResolvedValue({ contact: {}, changed: false });

    await service.blockUser('user-1', 'target-1');

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('não deve publicar quando o alvo não existe', async () => {
    (users.findById as jest.Mock).mockResolvedValue(null);

    await expect(service.blockUser('user-1', 'target-1')).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('não deve publicar ao tentar bloquear a si mesmo', async () => {
    await expect(service.blockUser('user-1', 'user-1')).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('deve publicar user:unblocked após desbloquear', async () => {
    (contacts.unblock as jest.Mock).mockResolvedValue(true);

    await service.unblockUser('user-1', 'target-1');

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UNBLOCKED, {
      userId: 'user-1',
      unblockedUserId: 'target-1',
    });
  });

  it('não deve publicar quando não havia bloqueio', async () => {
    (contacts.unblock as jest.Mock).mockResolvedValue(false);

    await expect(service.unblockUser('user-1', 'target-1')).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
```

Em `tests/unit/modules/user/types/contact.types.test.ts`, acrescentar `BlockResult,` como primeiro nome do import de `@/modules/user/types/contact.types` e inserir, imediatamente antes de `describe('ContactCreationAttributes', () => {`:

```ts
  describe('BlockResult', () => {
    it('deve carregar o contato e o indicador changed', () => {
      const result: BlockResult = {
        contact: {
          id: 'contact-123',
          userId: 'user-123',
          contactId: 'user-456',
          nickname: null,
          isBlocked: true,
          isFavorite: false,
          blockedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        changed: false,
      };

      expect(result.changed).toBe(false);
      expect(result.contact.isBlocked).toBe(true);
    });
  });
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services --coverage=false`
Expected: FAIL — `BlockResult` inexistente; `block` retorna o contato em vez de `{ contact, changed }`; `unblock` usa `findOne`.

- [ ] **Step 3: Implementar**

Em `src/modules/user/types/contact.types.ts`, acrescentar ao final do arquivo:

```ts
export interface BlockResult {
  contact: ContactAttributes;
  /** `true` quando a linha foi criada ou passou de não bloqueada para bloqueada. */
  changed: boolean;
}
```

Substituir `src/modules/user/interfaces/IContactRepository.ts` por:

```ts
import type {
  BlockResult,
  ContactAttributes,
  ContactCreationAttributes,
  ContactListOptions,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
} from '../types';

export interface IContactRepository {
  findById(id: string): Promise<ContactAttributes | null>;
  findByUserAndContact(userId: string, contactId: string): Promise<ContactAttributes | null>;
  findAllByUser(userId: string, options?: ContactListOptions): Promise<PaginatedContacts>;
  findBlockedByUser(userId: string): Promise<ContactWithUser[]>;
  findFavoritesByUser(userId: string): Promise<ContactWithUser[]>;
  create(data: ContactCreationAttributes): Promise<ContactAttributes>;
  update(id: string, data: Partial<ContactAttributes>): Promise<ContactAttributes | null>;
  delete(id: string): Promise<boolean>;
  deleteByUserAndContact(userId: string, contactId: string): Promise<boolean>;
  isBlocked(userId: string, targetId: string): Promise<boolean>;
  isContact(userId: string, contactId: string): Promise<boolean>;
  getStats(userId: string): Promise<ContactStats>;
  block(userId: string, contactId: string): Promise<BlockResult>;
  unblock(userId: string, contactId: string): Promise<boolean>;
}
```

Substituir `src/modules/user/repositories/ContactRepository.ts` por:

```ts
import User from '@/shared/database/models/User';
import { Op } from 'sequelize';
import Contact from '../models/Contact';
import type { IContactRepository } from '../interfaces';
import type {
  BlockResult,
  ContactAttributes,
  ContactCreationAttributes,
  ContactListOptions,
  ContactStats,
  ContactWithUser,
  PaginatedContacts,
} from '../types';

export type { IContactRepository } from '../interfaces';

export class ContactRepository implements IContactRepository {
  async findById(id: string): Promise<ContactAttributes | null> {
    const contact = await Contact.findByPk(id);
    return contact?.toJSON() ?? null;
  }

  async findByUserAndContact(userId: string, contactId: string): Promise<ContactAttributes | null> {
    const contact = await Contact.findOne({
      where: { userId, contactId },
    });
    return contact?.toJSON() ?? null;
  }

  async findAllByUser(
    userId: string,
    options: ContactListOptions = {}
  ): Promise<PaginatedContacts> {
    const { filters = {}, orderBy = 'createdAt', order = 'DESC', limit = 50, offset = 0 } = options;

    const where: Record<string, unknown> = { userId };

    where.isBlocked = filters.isBlocked ?? false;

    if (filters.isFavorite !== undefined) {
      where.isFavorite = filters.isFavorite;
    }

    const include = [
      {
        model: User,
        as: 'contact',
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        where:
          filters.search !== undefined && filters.search !== ''
            ? {
                [Op.or]: [
                  { username: { [Op.iLike]: `%${filters.search}%` } },
                  { displayName: { [Op.iLike]: `%${filters.search}%` } },
                ],
              }
            : undefined,
      },
    ];

    const { count, rows } = await Contact.findAndCountAll({
      where,
      include,
      limit: limit + 1,
      offset,
      order: [[orderBy, order]],
    });

    const hasMore = rows.length > limit;
    const contacts = rows.slice(0, limit);

    return {
      contacts: contacts.map((c) => ({
        ...c.toJSON(),
        contact: c.contact?.toPublicJSON() ?? {
          id: c.contactId,
          username: '',
          displayName: null,
          avatarUrl: null,
          status: 'offline',
          lastSeenAt: null,
        },
      })) as ContactWithUser[],
      total: count,
      limit,
      offset,
      hasMore,
    };
  }

  async findBlockedByUser(userId: string): Promise<ContactWithUser[]> {
    const contacts = await Contact.findAll({
      where: { userId, isBlocked: true },
      include: [
        {
          model: User,
          as: 'contact',
          attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        },
      ],
      order: [['blockedAt', 'DESC']],
    });

    return contacts.map((c) => ({
      ...c.toJSON(),
      contact: c.contact?.toPublicJSON() ?? {
        id: c.contactId,
        username: '',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      },
    })) as ContactWithUser[];
  }

  async findFavoritesByUser(userId: string): Promise<ContactWithUser[]> {
    const contacts = await Contact.findAll({
      where: { userId, isFavorite: true, isBlocked: false },
      include: [
        {
          model: User,
          as: 'contact',
          attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return contacts.map((c) => ({
      ...c.toJSON(),
      contact: c.contact?.toPublicJSON() ?? {
        id: c.contactId,
        username: '',
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      },
    })) as ContactWithUser[];
  }

  async create(data: ContactCreationAttributes): Promise<ContactAttributes> {
    const contact = await Contact.create(data);
    return contact.toJSON();
  }

  async update(id: string, data: Partial<ContactAttributes>): Promise<ContactAttributes | null> {
    const contact = await Contact.findByPk(id);
    if (!contact) {
      return null;
    }

    await contact.update(data);
    return contact.toJSON();
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await Contact.destroy({ where: { id } });
    return deleted > 0;
  }

  async deleteByUserAndContact(userId: string, contactId: string): Promise<boolean> {
    const deleted = await Contact.destroy({ where: { userId, contactId } });
    return deleted > 0;
  }

  async isBlocked(userId: string, targetId: string): Promise<boolean> {
    const contact = await Contact.findOne({
      where: { userId, contactId: targetId, isBlocked: true },
    });
    return contact !== null;
  }

  async isContact(userId: string, contactId: string): Promise<boolean> {
    const contact = await Contact.findOne({
      where: { userId, contactId },
    });
    return contact !== null;
  }

  async getStats(userId: string): Promise<ContactStats> {
    const [total, favorites, blocked] = await Promise.all([
      Contact.count({ where: { userId, isBlocked: false } }),
      Contact.count({ where: { userId, isFavorite: true, isBlocked: false } }),
      Contact.count({ where: { userId, isBlocked: true } }),
    ]);

    return { total, favorites, blocked };
  }

  /**
   * Bloqueia `contactId` para `userId`. `changed` só é `true` para quem de fato criou a linha
   * ou a virou de não bloqueada para bloqueada (UPDATE condicional em `is_blocked = false`),
   * o que evita eventos duplicados quando duas requisições bloqueiam ao mesmo tempo.
   */
  async block(userId: string, contactId: string): Promise<BlockResult> {
    const blockedAt = new Date();
    const [contact, created] = await Contact.findOrCreate({
      where: { userId, contactId },
      defaults: {
        userId,
        contactId,
        isBlocked: true,
        blockedAt,
        createdByBlock: true,
      },
    });

    if (created) {
      return { contact: contact.toJSON(), changed: true };
    }

    const [affected] = await Contact.update(
      { isBlocked: true, blockedAt },
      { where: { id: contact.id, isBlocked: false } }
    );

    if (affected > 0) {
      await contact.reload();
    }

    return { contact: contact.toJSON(), changed: affected > 0 };
  }

  /**
   * Remove o bloqueio. A linha criada só pelo bloqueio é apagada; um contato pré-existente
   * volta a não bloqueado. Retorna `true` apenas se esta chamada alterou alguma linha
   * (contagem de linhas afetadas), o que torna o desbloqueio seguro sob concorrência.
   */
  async unblock(userId: string, contactId: string): Promise<boolean> {
    const destroyed = await Contact.destroy({
      where: { userId, contactId, isBlocked: true, createdByBlock: true },
    });

    if (destroyed > 0) {
      return true;
    }

    const [affected] = await Contact.update(
      { isBlocked: false, blockedAt: null },
      { where: { userId, contactId, isBlocked: true } }
    );

    return affected > 0;
  }
}

export const contactRepository = new ContactRepository();
```

Em `src/modules/user/services/ContactService.ts`, no método `blockUser`, substituir:

```ts
    const alreadyBlocked = await this.contacts.isBlocked(userId, targetId);
    if (alreadyBlocked) {
      return;
    }

    await this.contacts.block(userId, targetId);
    await this.events.publish(UserEvents.BLOCKED, { userId, blockedUserId: targetId });
```

por:

```ts
    const { changed } = await this.contacts.block(userId, targetId);
    if (changed) {
      await this.events.publish(UserEvents.BLOCKED, { userId, blockedUserId: targetId });
    }
```

(`unblockUser` não muda: já publica só quando `unblock` retorna `true`.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/user tests/feature/modules/user --coverage=false && node node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Formatar e commitar**

```bash
node node_modules/.bin/prettier --write src/modules/user/types/contact.types.ts src/modules/user/interfaces/IContactRepository.ts src/modules/user/repositories/ContactRepository.ts src/modules/user/services/ContactService.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/services/ContactService.events.test.ts tests/unit/modules/user/types/contact.types.test.ts
node node_modules/.bin/eslint src
git add src/modules/user/types/contact.types.ts src/modules/user/interfaces/IContactRepository.ts src/modules/user/repositories/ContactRepository.ts src/modules/user/services/ContactService.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/services/ContactService.events.test.ts tests/unit/modules/user/types/contact.types.test.ts
git commit -m "🐛 fix: publica eventos de bloqueio só quando a linha muda"
```

---

### Task 4: Bloqueado não é contato + busca com subconsulta + aviso de TRUST_PROXY

**Files:**
- Modify: `src/modules/user/services/ContactService.ts` (`findVisibleContact`)
- Modify: `src/modules/user/repositories/ContactRepository.ts` (`isContact`)
- Modify: `src/modules/user/repositories/UserRepository.ts` (`search`)
- Modify: `.env.example`
- Modify: `tests/unit/modules/user/services/ContactService.test.ts`
- Modify: `tests/unit/modules/user/repositories/ContactRepository.test.ts`
- Modify: `tests/unit/modules/user/repositories/UserRepository.test.ts`

**Interfaces:**
- Produces (comportamento):
  - `getContact`/`updateContact`/`setFavorite`/`setNickname`/`removeContact` respondem `ContactNotFoundException` (404) quando a linha existe mas `isBlocked === true`.
  - `ContactRepository.isContact` só conta linhas com `isBlocked: false`.
  - `UserRepository.search`: com `excludeBlocked`, `where.id = { [Op.ne]: me, [Op.notIn]: literal(<subconsulta com :excludeUserId>) }` e `replacements: { excludeUserId }`; `isContact` do resultado é `false` para linha bloqueada.

- [ ] **Step 1: Escrever os testes que falham (contatos)**

Em `tests/unit/modules/user/services/ContactService.test.ts`, inserir imediatamente antes de `describe('listContacts', () => {`:

```ts
  describe('linhas bloqueadas não são contatos', () => {
    const blockedRow = { ...mockContact, isBlocked: true, blockedAt: new Date() };

    it('getContact deve responder ContactNotFoundException para linha bloqueada', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(blockedRow);

      await expect(contactService.getContact('user-123', 'contact-456')).rejects.toThrow(
        ContactNotFoundException
      );
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
    });

    it('updateContact deve responder ContactNotFoundException para linha bloqueada', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(blockedRow);

      await expect(
        contactService.updateContact('user-123', 'contact-456', { isFavorite: true })
      ).rejects.toThrow(ContactNotFoundException);
      expect(mockContactRepository.update).not.toHaveBeenCalled();
    });

    it('setFavorite/setNickname herdam o 404 de updateContact', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(blockedRow);

      await expect(contactService.setFavorite('user-123', 'contact-456', true)).rejects.toThrow(
        ContactNotFoundException
      );
      await expect(contactService.setNickname('user-123', 'contact-456', 'x')).rejects.toThrow(
        ContactNotFoundException
      );
    });

    it('removeContact deve responder ContactNotFoundException e não apagar o bloqueio', async () => {
      mockContactRepository.findByUserAndContact.mockResolvedValue(blockedRow);

      await expect(contactService.removeContact('user-123', 'contact-456')).rejects.toThrow(
        ContactNotFoundException
      );
      expect(mockContactRepository.delete).not.toHaveBeenCalled();
    });
  });
```

Em `tests/unit/modules/user/repositories/ContactRepository.test.ts`, no teste `'deve retornar true quando é contato'` de `describe('isContact')`, trocar a expectativa por:

```ts
      expect(MockContact.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: 'contact-456', isBlocked: false },
      });
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/repositories/ContactRepository.test.ts --coverage=false`
Expected: FAIL — os 5 testes de "linhas bloqueadas" resolvem em vez de rejeitar; `isContact` sem `isBlocked: false`.

- [ ] **Step 3: Implementar (contatos)**

Em `src/modules/user/services/ContactService.ts`:

1. Acrescentar `ContactAttributes,` ao `import type { … } from '../types'` (logo após `AddContactDTO,`).
2. Em `updateContact`, `removeContact` e `getContact`, substituir o trecho

```ts
    const contact = await this.contacts.findByUserAndContact(userId, contactId);
    if (!contact) {
      throw new ContactNotFoundException();
    }
```

por

```ts
    const contact = await this.findVisibleContact(userId, contactId);
```

3. Acrescentar, imediatamente antes de `private toPublicUser(`:

```ts
  /**
   * Para o usuário, uma linha bloqueada não é um contato: get/update/remove respondem 404.
   * O desbloqueio acontece apenas por `DELETE /api/blocks/:userId`.
   */
  private async findVisibleContact(userId: string, contactId: string): Promise<ContactAttributes> {
    const contact = await this.contacts.findByUserAndContact(userId, contactId);
    if (!contact || contact.isBlocked) {
      throw new ContactNotFoundException();
    }
    return contact;
  }
```

Em `src/modules/user/repositories/ContactRepository.ts`, o método `isContact` (não confundir com `findByUserAndContact`, que usa o mesmo `where`) passa a ser:

```ts
  async isContact(userId: string, contactId: string): Promise<boolean> {
    const contact = await Contact.findOne({
      where: { userId, contactId, isBlocked: false },
    });
    return contact !== null;
  }
```

- [ ] **Step 4: Rodar, confirmar que passa e commitar**

```bash
node node_modules/.bin/jest tests/unit/modules/user tests/feature/modules/user --coverage=false
node node_modules/.bin/prettier --write src/modules/user/services/ContactService.ts src/modules/user/repositories/ContactRepository.ts tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/repositories/ContactRepository.test.ts
git add src/modules/user/services/ContactService.ts src/modules/user/repositories/ContactRepository.ts tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/repositories/ContactRepository.test.ts
git commit -m "🐛 fix: trata linha bloqueada como não contato"
```

Expected: PASS antes do commit.

- [ ] **Step 5: Escrever os testes que falham (busca)**

Em `tests/unit/modules/user/repositories/UserRepository.test.ts`, dentro de `describe('search')`, apagar os três testes `'deve excluir via SQL (id NOT IN) quem o próprio usuário bloqueou'`, `'deve excluir via SQL (id NOT IN) quem bloqueou o usuário (direção reversa)'` e `'não deve adicionar NOT IN quando ninguém está bloqueado em nenhuma direção'`, e inserir no lugar deles (imediatamente antes de `'não deve consultar bloqueios quando excludeBlocked não é true'`):

```ts
    it('deve excluir bloqueados (nos dois sentidos) via subconsulta NOT IN com replacements', async () => {
      MockUser.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as any);
      MockContact.findAll.mockResolvedValueOnce([] as any);

      await repository.search({ filters: { excludeUserId: 'me', excludeBlocked: true } });

      const call = MockUser.findAndCountAll.mock.calls[0]![0] as any;
      const idFilter = call.where.id;
      expect(idFilter[Op.ne]).toBe('me');
      expect(idFilter[Op.notIn].val).toBe(
        '(SELECT contact_id FROM contacts WHERE user_id = :excludeUserId AND is_blocked = true ' +
          'UNION SELECT user_id FROM contacts WHERE contact_id = :excludeUserId AND is_blocked = true)'
      );
      expect(call.replacements).toEqual({ excludeUserId: 'me' });
      expect(MockContact.findAll).toHaveBeenCalledTimes(1);
    });

    it('não deve enviar replacements quando excludeBlocked não é true', async () => {
      MockUser.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as any);
      MockContact.findAll.mockResolvedValueOnce([] as any);

      await repository.search({ filters: { excludeUserId: 'me' } });

      const call = MockUser.findAndCountAll.mock.calls[0]![0] as any;
      expect(call).not.toHaveProperty('replacements');
      expect(call.where.id).toEqual({ [Op.ne]: 'me' });
    });

    it('deve marcar isContact=false para linha bloqueada (bloqueado não é contato)', async () => {
      MockUser.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            ...mockSearchUsers[0],
            get: jest.fn().mockReturnValue({ ...mockUserInstance, id: 'user-1' }),
          },
        ],
      } as any);
      MockContact.findAll.mockResolvedValue([
        { contactId: 'user-1', isBlocked: true, isFavorite: false, nickname: null },
      ] as any);

      const result = await repository.search({ filters: { excludeUserId: 'me' } });

      expect(result.users[0]!.isContact).toBe(false);
      expect(result.users[0]!.isBlocked).toBe(true);
    });
```

Run: `node node_modules/.bin/jest tests/unit/modules/user/repositories/UserRepository.test.ts --coverage=false`
Expected: FAIL — `idFilter[Op.notIn].val` indefinido (hoje é um array) e `isContact` `true` para linha bloqueada.

- [ ] **Step 6: Implementar (busca)**

Substituir `src/modules/user/repositories/UserRepository.ts` por:

```ts
import User from '@/shared/database/models/User';
import type { UserAttributes, UserStatus } from '@/shared/types';
import { literal, Op } from 'sequelize';
import type { IUserRepository } from '../interfaces';
import Contact from '../models/Contact';
import type { UserSearchOptions, UserSearchResult, UserWithContactInfo } from '../types';

/**
 * Subconsulta com os ids bloqueados em qualquer sentido em relação a `:excludeUserId`.
 * O valor entra por `replacements` (nunca por interpolação de string).
 */
const BLOCKED_USER_IDS_SUBQUERY =
  '(SELECT contact_id FROM contacts WHERE user_id = :excludeUserId AND is_blocked = true ' +
  'UNION SELECT user_id FROM contacts WHERE contact_id = :excludeUserId AND is_blocked = true)';

/**
 * Escapa os caracteres especiais do LIKE/ILIKE (`\`, `%`, `_`) para que um termo de busca
 * livre não seja interpretado como padrão de wildcard do SQL.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserAttributes | null> {
    const user = await User.findByPk(id);
    return user?.get() ?? null;
  }

  async findByEmail(email: string): Promise<UserAttributes | null> {
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    return user?.get() ?? null;
  }

  async findByUsername(username: string): Promise<UserAttributes | null> {
    const user = await User.findOne({ where: { username: username.toLowerCase() } });
    return user?.get() ?? null;
  }

  async findByIds(ids: string[]): Promise<UserAttributes[]> {
    if (ids.length === 0) {
      return [];
    }
    const users = await User.findAll({ where: { id: { [Op.in]: ids } } });
    return users.map((u) => u.get());
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserAttributes> {
    const user = await User.create({
      ...data,
      email: data.email.toLowerCase(),
      username: data.username.toLowerCase(),
    });
    return user.get();
  }

  async update(id: string, data: Partial<UserAttributes>): Promise<UserAttributes | null> {
    const user = await User.findByPk(id);
    if (!user) {
      return null;
    }

    await user.update(data);
    return user.get();
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    await User.update({ password }, { where: { id: userId } });
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await User.destroy({ where: { id } });
    return deleted > 0;
  }

  async search(options: UserSearchOptions): Promise<UserSearchResult> {
    const { filters = {}, limit = 20, offset = 0, orderBy = 'username', order = 'ASC' } = options;

    const where: Record<string, unknown> = {};

    if (filters.query !== undefined && filters.query !== '') {
      const escapedQuery = escapeLikePattern(filters.query);
      where[Op.or as unknown as string] = [
        { username: { [Op.iLike]: `%${escapedQuery}%` } },
        { displayName: { [Op.iLike]: `%${escapedQuery}%` } },
        { email: { [Op.iLike]: escapedQuery } },
      ];
    }

    if (filters.status !== undefined) {
      where.status = filters.status;
    }

    let contactsMap = new Map<string, Contact>();
    let replacements: Record<string, string> | undefined;
    if (filters.excludeUserId !== undefined) {
      where.id = { [Op.ne]: filters.excludeUserId };

      const contacts = await Contact.findAll({
        where: { userId: filters.excludeUserId },
      });
      contactsMap = new Map(contacts.map((c) => [c.contactId, c]));

      if (filters.excludeBlocked === true) {
        where.id = {
          [Op.ne]: filters.excludeUserId,
          [Op.notIn]: literal(BLOCKED_USER_IDS_SUBQUERY),
        };
        replacements = { excludeUserId: filters.excludeUserId };
      }
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: limit + 1,
      offset,
      order: [[orderBy, order]],
      attributes: { exclude: ['password'] },
      ...(replacements !== undefined ? { replacements } : {}),
    });

    const hasMore = rows.length > limit;
    const users = rows.slice(0, limit);

    const usersWithContactInfo: UserWithContactInfo[] = users.map((user) => {
      const contact = contactsMap.get(user.id);
      return {
        ...user.get(),
        isContact: contact !== undefined && !contact.isBlocked,
        isBlocked: contact?.isBlocked ?? false,
        isFavorite: contact?.isFavorite ?? false,
        contactNickname: contact?.nickname ?? null,
      };
    });

    const finalUsers =
      filters.onlyContacts === true
        ? usersWithContactInfo.filter((u) => u.isContact === true)
        : usersWithContactInfo;

    return {
      users: finalUsers,
      total: count,
      hasMore,
    };
  }

  async updateLastSeen(userId: string): Promise<void> {
    await User.update({ lastSeenAt: new Date() }, { where: { id: userId } });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await User.update({ status, lastSeenAt: new Date() }, { where: { id: userId } });
  }
}

export const userRepository = new UserRepository();
```

O SQL gerado (conferido offline com o query generator do Sequelize) é `"User"."id" != :me AND "User"."id" NOT IN (SELECT contact_id FROM contacts WHERE user_id = :me AND is_blocked = true UNION SELECT user_id FROM contacts WHERE contact_id = :me AND is_blocked = true)`, com `:me` injetado pelo Sequelize a partir de `replacements` (escapado; nunca interpolado). O smoke da Task 15 confirma no PostgreSQL real.

- [ ] **Step 7: Rodar, confirmar que passa e commitar**

```bash
node node_modules/.bin/jest tests/unit/modules/user tests/feature/modules/user --coverage=false
node node_modules/.bin/prettier --write src/modules/user/repositories/UserRepository.ts tests/unit/modules/user/repositories/UserRepository.test.ts
node node_modules/.bin/eslint src
git add src/modules/user/repositories/UserRepository.ts tests/unit/modules/user/repositories/UserRepository.test.ts
git commit -m "🐛 fix: busca exclui bloqueados via subconsulta e não marca bloqueado como contato"
```

Expected: PASS antes do commit.

- [ ] **Step 8: Aviso de TRUST_PROXY no `.env.example` e commit**

Em `.env.example`, trocar:

```
# ou um preset do Express (ex.: "loopback", "linklocal", "uniquelocal") ou um IP/CIDR.
# TRUST_PROXY=1
```

por:

```
# ou um preset do Express (ex.: "loopback", "linklocal", "uniquelocal") ou um IP/CIDR.
# ATENÇÃO: TRUST_PROXY=true confia em QUALQUER X-Forwarded-For e permite spoof de IP (burlando
# o rate limit). Prefira o número de hops (ex.: "1") ou a lista de IPs/sub-redes dos proxies.
# TRUST_PROXY=1
```

```bash
git add .env.example
git commit -m "📝 docs: alerta sobre spoof de IP com TRUST_PROXY=true"
```

---
### Task 5: Base do módulo chat — constantes, erros, tipos, models Sequelize e migrations

**Files:**
- Create: `src/modules/chat/constants/chat.constants.ts`, `src/modules/chat/constants/index.ts`
- Create: `src/modules/chat/errors/chat.errors.ts`, `src/modules/chat/errors/index.ts`
- Create: `src/modules/chat/types/chat.types.ts`, `src/modules/chat/types/message.types.ts`, `src/modules/chat/types/index.ts`
- Create: `src/modules/chat/models/Conversation.ts`, `src/modules/chat/models/Participant.ts`, `src/modules/chat/models/index.ts`
- Create: `src/database/migrations/20260924000100-create-conversations-table.ts`
- Create: `src/database/migrations/20260924000200-create-participants-table.ts`
- Test: `tests/unit/modules/chat/constants/chat.constants.test.ts`, `tests/unit/modules/chat/errors/chat.errors.test.ts`, `tests/unit/modules/chat/types/chat.types.test.ts`, `tests/unit/modules/chat/models/Conversation.test.ts`, `tests/unit/modules/chat/models/Participant.test.ts`

**Interfaces:**
- Produces:
  - `CHAT_CONSTANTS` = `{ MAX_GROUP_PARTICIPANTS: 256, MAX_MESSAGE_LENGTH: 10_000, MESSAGE_PAGE_SIZE: 50, MIN_CONVERSATION_NAME_LENGTH: 1, MAX_CONVERSATION_NAME_LENGTH: 100, DEFAULT_CONVERSATION_LIMIT: 20, MAX_CONVERSATION_LIMIT: 100, MAX_DEVICE_LENGTH: 255 }`; `CONVERSATION_TYPES = ['direct','group']`, `PARTICIPANT_ROLES = ['admin','member']`, `MESSAGE_CONTENT_TYPES = ['text']`.
  - Exceções (`@/modules/chat/errors`): `ConversationNotFoundException` (404), `ParticipantNotFoundException` (404), `MessageNotFoundException(message?)` (404), `UsersNotFoundException(missingIds: string[])` (404, `details` com um item por id), `CannotConverseWithSelfException` (400), `ConversationBlockedException` (403, `USER_BLOCKED`), `NotConversationAdminException` (403), `GroupOnlyOperationException` (400), `GroupParticipantLimitException(max = 256)` (400), `InvalidMentionsException` (400), `NotMessageAuthorException` (403).
  - Tipos (`@/modules/chat/types`): `ConversationType`, `ParticipantRole`, `ConversationChange`, `ConversationAttributes`, `ConversationCreationAttributes`, `ParticipantAttributes`, `ParticipantCreationAttributes`, `ParticipantUserDTO`, `MembershipDTO`, `ConversationDTO`, `CreateDirectResult`, `CreateGroupDTO`, `ListConversationsOptions`, `PaginatedConversations`, `ConversationListEntry`, `ConversationListPage`, `CreateDirectData`, `CreateDirectRecord`, `CreateGroupData`, `MessageContent`, `MessageMetadata`, `MessageRecord`, `CreateMessageData`, `MessageCursor`, `FindMessagesOptions`, `MessageDTO`, `SendMessageDTO`, `ListMessagesOptions`, `PaginatedMessages` (definições completas abaixo).
  - Models default-export `Conversation` e `Participant` (re-exportados por `@/modules/chat/models`); `Participant.belongsTo(Conversation, { as: 'conversation', foreignKey: 'conversationId' })`; ambos com `toJSON()` tipado.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/constants/chat.constants.test.ts`:

```ts
import {
  CHAT_CONSTANTS,
  CONVERSATION_TYPES,
  MESSAGE_CONTENT_TYPES,
  PARTICIPANT_ROLES,
} from '@/modules/chat/constants';

describe('chat constants', () => {
  it('deve definir os limites do chat', () => {
    expect(CHAT_CONSTANTS).toEqual({
      MAX_GROUP_PARTICIPANTS: 256,
      MAX_MESSAGE_LENGTH: 10_000,
      MESSAGE_PAGE_SIZE: 50,
      MIN_CONVERSATION_NAME_LENGTH: 1,
      MAX_CONVERSATION_NAME_LENGTH: 100,
      DEFAULT_CONVERSATION_LIMIT: 20,
      MAX_CONVERSATION_LIMIT: 100,
      MAX_DEVICE_LENGTH: 255,
    });
  });

  it('deve listar tipos de conversa, papéis e tipos de conteúdo', () => {
    expect(CONVERSATION_TYPES).toEqual(['direct', 'group']);
    expect(PARTICIPANT_ROLES).toEqual(['admin', 'member']);
    expect(MESSAGE_CONTENT_TYPES).toEqual(['text']);
  });
});
```

`tests/unit/modules/chat/errors/chat.errors.test.ts`:

```ts
import {
  CannotConverseWithSelfException,
  ConversationBlockedException,
  ConversationNotFoundException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  InvalidMentionsException,
  MessageNotFoundException,
  NotConversationAdminException,
  NotMessageAuthorException,
  ParticipantNotFoundException,
  UsersNotFoundException,
} from '@/modules/chat/errors';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

describe('chat errors', () => {
  it.each([
    [
      new ConversationNotFoundException(),
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Conversa não encontrada',
    ],
    [
      new ParticipantNotFoundException(),
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Participante não encontrado',
    ],
    [
      new MessageNotFoundException(),
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Mensagem não encontrada',
    ],
    [
      new CannotConverseWithSelfException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Você não pode iniciar uma conversa consigo mesmo',
    ],
    [
      new ConversationBlockedException(),
      HttpStatus.FORBIDDEN,
      ErrorCode.USER_BLOCKED,
      'Não é possível conversar com este usuário',
    ],
    [
      new NotConversationAdminException(),
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'Apenas administradores do grupo podem realizar esta ação',
    ],
    [
      new GroupOnlyOperationException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.BAD_REQUEST,
      'Operação disponível apenas para grupos',
    ],
    [
      new GroupParticipantLimitException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Um grupo pode ter no máximo 256 participantes',
    ],
    [
      new InvalidMentionsException(),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Menções devem referenciar participantes da conversa',
    ],
    [
      new NotMessageAuthorException(),
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'Apenas o autor pode apagar a mensagem',
    ],
  ])('%p deve ter status, código e mensagem padrão', (error, status, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
  });

  it('deve aceitar mensagens personalizadas', () => {
    expect(new ConversationNotFoundException('x').message).toBe('x');
    expect(new ParticipantNotFoundException('x').message).toBe('x');
    expect(new MessageNotFoundException('x').message).toBe('x');
    expect(new CannotConverseWithSelfException('x').message).toBe('x');
    expect(new ConversationBlockedException('x').message).toBe('x');
    expect(new NotConversationAdminException('x').message).toBe('x');
    expect(new GroupOnlyOperationException('x').message).toBe('x');
    expect(new InvalidMentionsException('x').message).toBe('x');
    expect(new NotMessageAuthorException('x').message).toBe('x');
    expect(new GroupParticipantLimitException(10).message).toBe(
      'Um grupo pode ter no máximo 10 participantes'
    );
  });

  it('UsersNotFoundException deve listar os ids ausentes em details (404)', () => {
    const error = new UsersNotFoundException(['id-1', 'id-2']);

    expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe(ErrorCode.USER_NOT_FOUND);
    expect(error.message).toBe('Usuário(s) não encontrado(s)');
    expect(error.details).toEqual([
      { field: 'userId', message: 'id-1', code: ErrorCode.USER_NOT_FOUND },
      { field: 'userId', message: 'id-2', code: ErrorCode.USER_NOT_FOUND },
    ]);
  });
});
```

`tests/unit/modules/chat/types/chat.types.test.ts`:

```ts
import * as chatTypes from '@/modules/chat/types';
import type {
  ConversationAttributes,
  ConversationDTO,
  MessageDTO,
  MessageRecord,
  PaginatedMessages,
  ParticipantAttributes,
} from '@/modules/chat/types';

describe('chat types', () => {
  it('deve carregar o barrel de tipos', () => {
    expect(chatTypes).toBeDefined();
  });

  it('deve aceitar uma conversa com participante e DTO', () => {
    const now = new Date();
    const conversation: ConversationAttributes = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'group',
      name: 'Time',
      avatarUrl: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      directKey: null,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const membership: ParticipantAttributes = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      conversationId: conversation.id,
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
      joinedAt: now,
      lastReadAt: null,
      isMuted: false,
      archivedAt: null,
    };
    const dto: ConversationDTO = {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      avatarUrl: null,
      createdBy: conversation.createdBy,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
      participants: [
        {
          id: membership.userId,
          username: 'ana',
          displayName: null,
          avatarUrl: null,
          role: 'admin',
        },
      ],
      membership: { role: membership.role, isMuted: false, archivedAt: null },
    };

    expect(dto.participants[0]!.role).toBe('admin');
  });

  it('deve aceitar mensagem, tombstone e página', () => {
    const now = new Date();
    const record: MessageRecord = {
      id: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      senderId: '11111111-1111-4111-8111-111111111111',
      content: { type: 'text', text: 'oi' },
      replyTo: null,
      mentions: [],
      metadata: { ip: '127.0.0.1', device: 'jest' },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const tombstone: MessageDTO = { ...record, content: null, deletedAt: now };
    const page: PaginatedMessages = { messages: [tombstone], nextCursor: null };

    expect(page.messages[0]!.content).toBeNull();
  });
});
```

`tests/unit/modules/chat/models/Conversation.test.ts`:

```ts
import { Conversation } from '@/modules/chat/models';

describe('Conversation model', () => {
  it('deve usar a tabela conversations com colunas snake_case', () => {
    const attributes = Conversation.getAttributes();

    expect(Conversation.getTableName()).toBe('conversations');
    expect(attributes.avatarUrl!.field).toBe('avatar_url');
    expect(attributes.createdBy!.field).toBe('created_by');
    expect(attributes.directKey!.field).toBe('direct_key');
    expect(attributes.directKey!.unique).toBe(true);
    expect(attributes.lastMessageAt!.field).toBe('last_message_at');
    expect(attributes.type!.allowNull).toBe(false);
  });

  it('toJSON deve retornar os atributos da conversa', () => {
    const date = new Date('2026-09-24T00:00:00.000Z');
    const conversation = Conversation.build(
      {
        type: 'direct',
        name: null,
        avatarUrl: null,
        createdBy: '11111111-1111-4111-8111-111111111111',
        directKey: '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
        lastMessageAt: null,
      },
      { isNewRecord: false }
    );
    conversation.setDataValue('id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    conversation.setDataValue('createdAt', date);
    conversation.setDataValue('updatedAt', date);

    expect(conversation.toJSON()).toEqual({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'direct',
      name: null,
      avatarUrl: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      directKey: '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
      lastMessageAt: null,
      createdAt: date,
      updatedAt: date,
    });
  });
});
```

`tests/unit/modules/chat/models/Participant.test.ts`:

```ts
import { Conversation, Participant } from '@/modules/chat/models';

describe('Participant model', () => {
  it('deve usar a tabela participants sem timestamps automáticos', () => {
    const attributes = Participant.getAttributes();

    expect(Participant.getTableName()).toBe('participants');
    expect(Participant.options.timestamps).toBe(false);
    expect(attributes.conversationId!.field).toBe('conversation_id');
    expect(attributes.userId!.field).toBe('user_id');
    expect(attributes.role!.defaultValue).toBe('member');
    expect(attributes.isMuted!.defaultValue).toBe(false);
    expect(attributes.archivedAt!.field).toBe('archived_at');
    expect(attributes.lastReadAt!.field).toBe('last_read_at');
  });

  it('deve pertencer a Conversation via alias conversation', () => {
    const association = Participant.associations.conversation;

    expect(association).toBeDefined();
    expect(association!.target).toBe(Conversation);
    expect(association!.foreignKey).toBe('conversationId');
  });

  it('toJSON deve retornar os atributos do participante', () => {
    const joinedAt = new Date('2026-09-24T00:00:00.000Z');
    const participant = Participant.build(
      {
        conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: '11111111-1111-4111-8111-111111111111',
        role: 'admin',
        joinedAt,
      },
      { isNewRecord: false }
    );
    participant.setDataValue('id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    participant.setDataValue('lastReadAt', null);
    participant.setDataValue('isMuted', false);
    participant.setDataValue('archivedAt', null);

    expect(participant.toJSON()).toEqual({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
      joinedAt,
      lastReadAt: null,
      isMuted: false,
      archivedAt: null,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/constants'` (e demais módulos do chat).

- [ ] **Step 3: Implementar constantes, erros e tipos**

`src/modules/chat/constants/chat.constants.ts`:

```ts
export const CHAT_CONSTANTS = {
  MAX_GROUP_PARTICIPANTS: 256,
  MAX_MESSAGE_LENGTH: 10_000,
  MESSAGE_PAGE_SIZE: 50,
  MIN_CONVERSATION_NAME_LENGTH: 1,
  MAX_CONVERSATION_NAME_LENGTH: 100,
  DEFAULT_CONVERSATION_LIMIT: 20,
  MAX_CONVERSATION_LIMIT: 100,
  MAX_DEVICE_LENGTH: 255,
} as const;

export const CONVERSATION_TYPES = ['direct', 'group'] as const;
export const PARTICIPANT_ROLES = ['admin', 'member'] as const;
export const MESSAGE_CONTENT_TYPES = ['text'] as const;
```

`src/modules/chat/constants/index.ts`:

```ts
export {
  CHAT_CONSTANTS,
  CONVERSATION_TYPES,
  PARTICIPANT_ROLES,
  MESSAGE_CONTENT_TYPES,
} from './chat.constants';
```

`src/modules/chat/errors/chat.errors.ts`:

```ts
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { CHAT_CONSTANTS } from '../constants';

export class ConversationNotFoundException extends AppError {
  constructor(message = 'Conversa não encontrada') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class ParticipantNotFoundException extends AppError {
  constructor(message = 'Participante não encontrado') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class MessageNotFoundException extends AppError {
  constructor(message = 'Mensagem não encontrada') {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class UsersNotFoundException extends AppError {
  constructor(missingIds: string[]) {
    super(
      'Usuário(s) não encontrado(s)',
      HttpStatus.NOT_FOUND,
      ErrorCode.USER_NOT_FOUND,
      true,
      missingIds.map((id) => ({ field: 'userId', message: id, code: ErrorCode.USER_NOT_FOUND }))
    );
  }
}

export class CannotConverseWithSelfException extends AppError {
  constructor(message = 'Você não pode iniciar uma conversa consigo mesmo') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class ConversationBlockedException extends AppError {
  constructor(message = 'Não é possível conversar com este usuário') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED);
  }
}

export class NotConversationAdminException extends AppError {
  constructor(message = 'Apenas administradores do grupo podem realizar esta ação') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}

export class GroupOnlyOperationException extends AppError {
  constructor(message = 'Operação disponível apenas para grupos') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
  }
}

export class GroupParticipantLimitException extends AppError {
  constructor(max: number = CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
    super(
      `Um grupo pode ter no máximo ${String(max)} participantes`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export class InvalidMentionsException extends AppError {
  constructor(message = 'Menções devem referenciar participantes da conversa') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class NotMessageAuthorException extends AppError {
  constructor(message = 'Apenas o autor pode apagar a mensagem') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}
```

`src/modules/chat/errors/index.ts`:

```ts
export {
  ConversationNotFoundException,
  ParticipantNotFoundException,
  MessageNotFoundException,
  UsersNotFoundException,
  CannotConverseWithSelfException,
  ConversationBlockedException,
  NotConversationAdminException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  InvalidMentionsException,
  NotMessageAuthorException,
} from './chat.errors';
```

`src/modules/chat/types/chat.types.ts`:

```ts
import type { CONVERSATION_TYPES, MESSAGE_CONTENT_TYPES, PARTICIPANT_ROLES } from '../constants';

export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type MessageContentType = (typeof MESSAGE_CONTENT_TYPES)[number];
export type ConversationChange = 'renamed' | 'members_added' | 'member_removed' | 'member_left';

export interface ConversationAttributes {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  directKey: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationCreationAttributes {
  type: ConversationType;
  name?: string | null;
  avatarUrl?: string | null;
  createdBy?: string | null;
  directKey?: string | null;
  lastMessageAt?: Date | null;
}

export interface ParticipantAttributes {
  id: string;
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: Date;
  lastReadAt: Date | null;
  isMuted: boolean;
  archivedAt: Date | null;
}

export interface ParticipantCreationAttributes {
  conversationId: string;
  userId: string;
  role?: ParticipantRole;
  joinedAt?: Date;
}

export interface ParticipantUserDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ParticipantRole;
}

export interface MembershipDTO {
  role: ParticipantRole;
  isMuted: boolean;
  archivedAt: Date | null;
}

export interface ConversationDTO {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantUserDTO[];
  membership: MembershipDTO;
}

export interface CreateDirectResult {
  conversation: ConversationDTO;
  created: boolean;
}

export interface CreateGroupDTO {
  name: string;
  participantIds: string[];
}

export interface ListConversationsOptions {
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedConversations {
  items: ConversationDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ConversationListEntry {
  conversation: ConversationAttributes;
  membership: ParticipantAttributes;
}

export interface ConversationListPage {
  rows: ConversationListEntry[];
  total: number;
}

export interface CreateDirectData {
  directKey: string;
  createdBy: string;
  userIds: [string, string];
}

export interface CreateDirectRecord {
  conversation: ConversationAttributes;
  created: boolean;
}

export interface CreateGroupData {
  name: string;
  createdBy: string;
  memberIds: string[];
}
```

`src/modules/chat/types/message.types.ts`:

```ts
import type { MessageContentType } from './chat.types';

export interface MessageContent {
  type: MessageContentType;
  text: string;
}

export interface MessageMetadata {
  ip: string | null;
  device: string | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  content: MessageContent;
  replyTo: string | null;
  mentions: string[];
  metadata: MessageMetadata;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageData {
  conversationId: string;
  senderId: string;
  content: MessageContent;
  replyTo: string | null;
  mentions: string[];
  metadata: MessageMetadata;
}

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export interface FindMessagesOptions {
  limit: number;
  before?: MessageCursor;
}

/** Mensagem como exposta pela API: apagada vira tombstone (`content: null`). */
export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: MessageContent | null;
  replyTo: string | null;
  mentions: string[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessageDTO {
  text: string;
  replyTo?: string;
  mentions?: string[];
}

export interface ListMessagesOptions {
  limit?: number;
  before?: string;
}

export interface PaginatedMessages {
  messages: MessageDTO[];
  nextCursor: string | null;
}
```

`src/modules/chat/types/index.ts`:

```ts
export * from './chat.types';
export * from './message.types';
```

- [ ] **Step 4: Implementar os models Sequelize**

`src/modules/chat/models/Conversation.ts`:

```ts
import sequelize from '@/shared/database/sequelize';
import { DataTypes, Model, type Optional } from 'sequelize';
import { CONVERSATION_TYPES } from '../constants';
import type {
  ConversationAttributes,
  ConversationCreationAttributes,
  ConversationType,
} from '../types';

class Conversation
  extends Model<
    ConversationAttributes,
    Optional<
      ConversationCreationAttributes,
      'name' | 'avatarUrl' | 'createdBy' | 'directKey' | 'lastMessageAt'
    >
  >
  implements ConversationAttributes
{
  declare id: string;
  declare type: ConversationType;
  declare name: string | null;
  declare avatarUrl: string | null;
  declare createdBy: string | null;
  declare directKey: string | null;
  declare lastMessageAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  toJSON(): ConversationAttributes {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      avatarUrl: this.avatarUrl,
      createdBy: this.createdBy,
      directKey: this.directKey,
      lastMessageAt: this.lastMessageAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

Conversation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...CONVERSATION_TYPES),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'avatar_url',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
    directKey: {
      type: DataTypes.STRING(73),
      allowNull: true,
      unique: true,
      field: 'direct_key',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_message_at',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'conversations',
    modelName: 'Conversation',
    timestamps: true,
    underscored: true,
  }
);

export default Conversation;
```

`src/modules/chat/models/Participant.ts`:

```ts
import sequelize from '@/shared/database/sequelize';
import { DataTypes, Model, type Optional } from 'sequelize';
import { PARTICIPANT_ROLES } from '../constants';
import type {
  ParticipantAttributes,
  ParticipantCreationAttributes,
  ParticipantRole,
} from '../types';
import Conversation from './Conversation';

class Participant
  extends Model<ParticipantAttributes, Optional<ParticipantCreationAttributes, 'role' | 'joinedAt'>>
  implements ParticipantAttributes
{
  declare id: string;
  declare conversationId: string;
  declare userId: string;
  declare role: ParticipantRole;
  declare joinedAt: Date;
  declare lastReadAt: Date | null;
  declare isMuted: boolean;
  declare archivedAt: Date | null;

  declare conversation?: Conversation;

  toJSON(): ParticipantAttributes {
    return {
      id: this.id,
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      joinedAt: this.joinedAt,
      lastReadAt: this.lastReadAt,
      isMuted: this.isMuted,
      archivedAt: this.archivedAt,
    };
  }
}

Participant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'conversation_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    role: {
      type: DataTypes.ENUM(...PARTICIPANT_ROLES),
      allowNull: false,
      defaultValue: 'member',
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'joined_at',
    },
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_read_at',
    },
    isMuted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_muted',
    },
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'archived_at',
    },
  },
  {
    sequelize,
    tableName: 'participants',
    modelName: 'Participant',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['conversation_id', 'user_id'],
        name: 'participants_conversation_user_unique',
      },
    ],
  }
);

Participant.belongsTo(Conversation, {
  foreignKey: 'conversationId',
  as: 'conversation',
});

export default Participant;
```

`src/modules/chat/models/index.ts`:

```ts
export { default as Conversation } from './Conversation';
export { default as Participant } from './Participant';
```

Só `belongsTo` é usado (o mock de `sequelize.Model` em `tests/unit/app.test.ts` só define `init`/`belongsTo`; não use `hasMany`).

- [ ] **Step 5: Criar as migrations**

`src/database/migrations/20260924000100-create-conversations-table.ts`:

```ts
import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('conversations', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('direct', 'group'),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    avatar_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    direct_key: {
      type: DataTypes.STRING(73),
      allowNull: true,
    },
    last_message_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('conversations', ['direct_key'], {
    unique: true,
    name: 'conversations_direct_key_unique',
  });

  await queryInterface.addIndex('conversations', ['last_message_at'], {
    name: 'conversations_last_message_at_index',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('conversations');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_conversations_type";');
}
```

`src/database/migrations/20260924000200-create-participants-table.ts`:

```ts
import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('participants', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'conversations',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.ENUM('admin', 'member'),
      allowNull: false,
      defaultValue: 'member',
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    last_read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_muted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  });

  await queryInterface.addIndex('participants', ['conversation_id', 'user_id'], {
    unique: true,
    name: 'participants_conversation_user_unique',
  });

  await queryInterface.addIndex('participants', ['user_id'], {
    name: 'participants_user_id_index',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('participants');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_participants_role";');
}
```

(`down` remove também os tipos ENUM, senão um `db:migrate` após `db:migrate:undo` falha com "type already exists". Up/down são validados no smoke da Task 15.)

- [ ] **Step 6: Rodar e confirmar que passa (100% nos arquivos novos)**

Run: `node node_modules/.bin/jest tests/unit/modules/chat --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/**/*.ts' --coverageThreshold='{}'`
Expected: PASS; 100% em todas as colunas para `constants`, `errors`, `models`, `types/index.ts`.

- [ ] **Step 7: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write "src/modules/chat/**/*.ts" "tests/unit/modules/chat/**/*.ts" src/database/migrations/20260924000100-create-conversations-table.ts src/database/migrations/20260924000200-create-participants-table.ts
node node_modules/.bin/eslint src
git add src/modules/chat src/database/migrations/20260924000100-create-conversations-table.ts src/database/migrations/20260924000200-create-participants-table.ts tests/unit/modules/chat
git commit -m "✨ feat: adiciona base do módulo chat (tipos, erros, models Conversation/Participant e migrations)"
```

---

### Task 6: Model `Message` (MongoDB)

**Files:**
- Create: `src/modules/chat/models/Message.ts`
- Modify: `src/modules/chat/models/index.ts`
- Test: `tests/unit/modules/chat/models/Message.test.ts`

**Interfaces:**
- Produces: `interface IMessage { conversationId: string; senderId: string; content: { type: MessageContentType; text: string }; replyTo: Types.ObjectId | null; mentions: string[]; metadata: { ip: string | null; device: string | null }; deletedAt: Date | null; createdAt: Date; updatedAt: Date }` e `MessageModel: Model<IMessage>` (coleção `messages`, timestamps, índice `{ conversationId: 1, createdAt: -1, _id: -1 }`), exportados também por `@/modules/chat/models`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/modules/chat/models/Message.test.ts` (não precisa de conexão: usa `validateSync` e metadados do schema):

```ts
import { Types } from 'mongoose';
import { MessageModel } from '@/modules/chat/models';

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = '11111111-1111-4111-8111-111111111111';

describe('Message model (Mongoose)', () => {
  it('deve usar a coleção messages com timestamps', () => {
    expect(MessageModel.schema.get('collection')).toBe('messages');
    expect(MessageModel.schema.get('timestamps')).toBe(true);
  });

  it('deve declarar o índice composto da paginação por cursor', () => {
    expect(MessageModel.schema.indexes()).toContainEqual([
      { conversationId: 1, createdAt: -1, _id: -1 },
      expect.any(Object),
    ]);
  });

  it('deve aplicar defaults (replyTo, mentions, metadata, deletedAt)', () => {
    const message = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'olá' },
    });

    expect(message.validateSync()).toBeUndefined();
    expect(message.replyTo).toBeNull();
    expect(message.mentions).toEqual([]);
    expect(message.metadata.ip).toBeNull();
    expect(message.metadata.device).toBeNull();
    expect(message.deletedAt).toBeNull();
    expect(message._id).toBeInstanceOf(Types.ObjectId);
  });

  it('deve aceitar replyTo como ObjectId e mentions', () => {
    const replyTo = new Types.ObjectId();
    const message = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'resposta' },
      replyTo,
      mentions: ['22222222-2222-4222-8222-222222222222'],
      metadata: { ip: '127.0.0.1', device: 'jest' },
    });

    expect(message.validateSync()).toBeUndefined();
    expect(message.replyTo?.toString()).toBe(replyTo.toString());
    expect(message.mentions).toEqual(['22222222-2222-4222-8222-222222222222']);
  });

  it('deve exigir conversationId, senderId e content', () => {
    const error = new MessageModel({}).validateSync();

    expect(error?.errors.conversationId).toBeDefined();
    expect(error?.errors.senderId).toBeDefined();
    expect(error?.errors.content).toBeDefined();
  });

  it('deve rejeitar tipo de conteúdo desconhecido e texto acima de 10.000 caracteres', () => {
    const invalidType = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'image', text: 'x' },
    }).validateSync();
    const tooLong = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'a'.repeat(10_001) },
    }).validateSync();

    expect(invalidType?.errors['content.type']).toBeDefined();
    expect(tooLong?.errors['content.text']).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/models/Message.test.ts --coverage=false`
Expected: FAIL — `MessageModel` não exportado por `@/modules/chat/models`.

- [ ] **Step 3: Implementar**

`src/modules/chat/models/Message.ts`:

```ts
import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { CHAT_CONSTANTS, MESSAGE_CONTENT_TYPES } from '../constants';
import type { MessageContentType } from '../types';

export interface IMessage {
  conversationId: string;
  senderId: string;
  content: { type: MessageContentType; text: string };
  replyTo: Types.ObjectId | null;
  mentions: string[];
  metadata: { ip: string | null; device: string | null };
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contentSchema = new Schema<IMessage['content']>(
  {
    type: { type: String, enum: MESSAGE_CONTENT_TYPES, required: true },
    text: { type: String, required: true, maxlength: CHAT_CONSTANTS.MAX_MESSAGE_LENGTH },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    content: { type: contentSchema, required: true },
    replyTo: { type: Schema.Types.ObjectId, default: null },
    mentions: { type: [String], default: [] },
    metadata: {
      ip: { type: String, default: null },
      device: { type: String, default: null },
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

// Índice da paginação por cursor (mais recentes primeiro). O prefixo conversationId também
// atende consultas só por conversa, então não há índice simples separado.
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

export const MessageModel: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
```

Substituir `src/modules/chat/models/index.ts` por:

```ts
export { default as Conversation } from './Conversation';
export { default as Participant } from './Participant';
export { MessageModel, type IMessage } from './Message';
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/models --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/models/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% em `Message.ts` e `index.ts`.

- [ ] **Step 5: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write src/modules/chat/models/Message.ts src/modules/chat/models/index.ts tests/unit/modules/chat/models/Message.test.ts
node node_modules/.bin/eslint src
git add src/modules/chat/models/Message.ts src/modules/chat/models/index.ts tests/unit/modules/chat/models/Message.test.ts
git commit -m "✨ feat: adiciona model Message no MongoDB"
```

---

### Task 7: Repositórios de conversas e participantes (PostgreSQL)

**Files:**
- Create: `src/modules/chat/interfaces/IConversationRepository.ts`, `src/modules/chat/interfaces/IParticipantRepository.ts`, `src/modules/chat/interfaces/index.ts`
- Create: `src/modules/chat/repositories/ConversationRepository.ts`, `src/modules/chat/repositories/ParticipantRepository.ts`, `src/modules/chat/repositories/index.ts`
- Test: `tests/unit/modules/chat/repositories/ConversationRepository.test.ts`, `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`, `tests/unit/modules/chat/repositories/index.test.ts`

**Interfaces:**
- Consumes: models `Conversation`/`Participant` (Task 5), `sequelize` default de `@/shared/database/sequelize`.
- Produces:
  - `IConversationRepository`: `findById(id): Promise<ConversationAttributes | null>`, `findByDirectKey(directKey): Promise<ConversationAttributes | null>`, `createDirect(data: CreateDirectData): Promise<CreateDirectRecord>` (transação; em `UniqueConstraintError` relê e devolve `{ conversation, created: false }`), `createGroup(data: CreateGroupData): Promise<ConversationAttributes>` (criador `admin`, demais `member`), `listForUser(userId, { archived, limit, offset }: ListForUserOptions): Promise<ConversationListPage>` (ordem `last_message_at DESC NULLS LAST, created_at DESC`), `rename(id, name): Promise<void>`, `touchLastMessageAt(id, at): Promise<void>` (monotônico), `delete(id): Promise<void>`.
  - `IParticipantRepository`: `find(conversationId, userId)`, `listByConversation(conversationId)` (ordem `joinedAt ASC, id ASC`), `listByConversations(conversationIds)` (lista vazia não consulta), `listConversationIdsByUser(userId): Promise<string[]>`, `addMembers(conversationId, userIds)` (`member`, `ignoreDuplicates`), `remove(conversationId, userId): Promise<void>`, `setRole(conversationId, userId, role)`, `setArchivedAt(conversationId, userId, archivedAt: Date | null)`.
  - Singletons `conversationRepository`, `participantRepository` (e classes) em `@/modules/chat/repositories`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/repositories/ConversationRepository.test.ts`:

```ts
jest.mock('@/shared/database/sequelize', () => ({
  __esModule: true,
  default: { transaction: jest.fn() },
}));

jest.mock('@/modules/chat/models/Conversation', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('@/modules/chat/models/Participant', () => ({
  __esModule: true,
  default: {
    bulkCreate: jest.fn(),
    findAndCountAll: jest.fn(),
  },
}));

import { Op, UniqueConstraintError } from 'sequelize';
import sequelize from '@/shared/database/sequelize';
import Conversation from '@/modules/chat/models/Conversation';
import Participant from '@/modules/chat/models/Participant';
import {
  ConversationRepository,
  conversationRepository,
} from '@/modules/chat/repositories/ConversationRepository';

const MockConversation = Conversation as jest.Mocked<typeof Conversation>;
const MockParticipant = Participant as jest.Mocked<typeof Participant>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock;

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const DIRECT_KEY = `${USER_A}:${USER_B}`;
const TX = { id: 'tx' };

function conversationRow(overrides: Record<string, unknown> = {}): {
  id: string;
  toJSON: jest.Mock;
} {
  const attrs = {
    id: CONVERSATION_ID,
    type: 'direct',
    name: null,
    avatarUrl: null,
    createdBy: USER_A,
    directKey: DIRECT_KEY,
    lastMessageAt: null,
    createdAt: new Date('2026-09-24T00:00:00.000Z'),
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    ...overrides,
  };
  return { id: attrs.id as string, toJSON: jest.fn().mockReturnValue(attrs) };
}

describe('ConversationRepository', () => {
  let repository: ConversationRepository;

  beforeEach(() => {
    repository = new ConversationRepository();
    mockTransaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(TX)
    );
  });

  it('deve exportar a instância singleton', () => {
    expect(conversationRepository).toBeInstanceOf(ConversationRepository);
  });

  describe('findById', () => {
    it('deve retornar a conversa serializada', async () => {
      const row = conversationRow();
      MockConversation.findByPk.mockResolvedValue(row as never);

      const result = await repository.findById(CONVERSATION_ID);

      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID);
      expect(result?.id).toBe(CONVERSATION_ID);
    });

    it('deve retornar null quando não existe', async () => {
      MockConversation.findByPk.mockResolvedValue(null);

      await expect(repository.findById(CONVERSATION_ID)).resolves.toBeNull();
    });
  });

  describe('findByDirectKey', () => {
    it('deve buscar pela direct_key', async () => {
      MockConversation.findOne.mockResolvedValue(conversationRow() as never);

      const result = await repository.findByDirectKey(DIRECT_KEY);

      expect(MockConversation.findOne).toHaveBeenCalledWith({ where: { directKey: DIRECT_KEY } });
      expect(result?.directKey).toBe(DIRECT_KEY);
    });

    it('deve retornar null quando não existe', async () => {
      MockConversation.findOne.mockResolvedValue(null);

      await expect(repository.findByDirectKey(DIRECT_KEY)).resolves.toBeNull();
    });
  });

  describe('createDirect', () => {
    it('deve criar conversa e os dois participantes na mesma transação', async () => {
      MockConversation.create.mockResolvedValue(conversationRow() as never);
      MockParticipant.bulkCreate.mockResolvedValue([] as never);

      const result = await repository.createDirect({
        directKey: DIRECT_KEY,
        createdBy: USER_A,
        userIds: [USER_A, USER_B],
      });

      expect(MockConversation.create).toHaveBeenCalledWith(
        { type: 'direct', directKey: DIRECT_KEY, createdBy: USER_A },
        { transaction: TX }
      );
      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [
          { conversationId: CONVERSATION_ID, userId: USER_A, role: 'member' },
          { conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' },
        ],
        { transaction: TX }
      );
      expect(result).toEqual({
        conversation: expect.objectContaining({ id: CONVERSATION_ID }),
        created: true,
      });
    });

    it('deve devolver a conversa existente quando a direct_key já foi criada por outra requisição', async () => {
      mockTransaction.mockRejectedValue(new UniqueConstraintError({}));
      MockConversation.findOne.mockResolvedValue(conversationRow() as never);

      const result = await repository.createDirect({
        directKey: DIRECT_KEY,
        createdBy: USER_A,
        userIds: [USER_A, USER_B],
      });

      expect(result.created).toBe(false);
      expect(result.conversation.id).toBe(CONVERSATION_ID);
    });

    it('deve relançar a violação de unicidade quando a existente não é encontrada', async () => {
      const error = new UniqueConstraintError({});
      mockTransaction.mockRejectedValue(error);
      MockConversation.findOne.mockResolvedValue(null);

      await expect(
        repository.createDirect({
          directKey: DIRECT_KEY,
          createdBy: USER_A,
          userIds: [USER_A, USER_B],
        })
      ).rejects.toBe(error);
    });

    it('deve relançar erros que não são de unicidade', async () => {
      const error = new Error('db down');
      mockTransaction.mockRejectedValue(error);

      await expect(
        repository.createDirect({
          directKey: DIRECT_KEY,
          createdBy: USER_A,
          userIds: [USER_A, USER_B],
        })
      ).rejects.toBe(error);
      expect(MockConversation.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createGroup', () => {
    it('deve criar o grupo com o criador admin e os demais member', async () => {
      MockConversation.create.mockResolvedValue(
        conversationRow({ type: 'group', name: 'Time', directKey: null }) as never
      );
      MockParticipant.bulkCreate.mockResolvedValue([] as never);

      const result = await repository.createGroup({
        name: 'Time',
        createdBy: USER_A,
        memberIds: [USER_B, USER_C],
      });

      expect(MockConversation.create).toHaveBeenCalledWith(
        { type: 'group', name: 'Time', createdBy: USER_A },
        { transaction: TX }
      );
      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [
          { conversationId: CONVERSATION_ID, userId: USER_A, role: 'admin' },
          { conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' },
          { conversationId: CONVERSATION_ID, userId: USER_C, role: 'member' },
        ],
        { transaction: TX }
      );
      expect(result.type).toBe('group');
    });
  });

  describe('listForUser', () => {
    it('deve listar conversas ativas ordenadas por last_message_at DESC NULLS LAST', async () => {
      const membership = { userId: USER_A, role: 'member' };
      MockParticipant.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ conversation: conversationRow(), toJSON: jest.fn().mockReturnValue(membership) }],
      } as never);

      const result = await repository.listForUser(USER_A, {
        archived: false,
        limit: 20,
        offset: 0,
      });

      expect(MockParticipant.findAndCountAll).toHaveBeenCalledWith({
        where: { userId: USER_A, archivedAt: null },
        include: [{ model: Conversation, as: 'conversation', required: true }],
        order: [
          [{ model: Conversation, as: 'conversation' }, 'lastMessageAt', 'DESC NULLS LAST'],
          [{ model: Conversation, as: 'conversation' }, 'createdAt', 'DESC'],
        ],
        limit: 20,
        offset: 0,
      });
      expect(result.total).toBe(1);
      expect(result.rows).toEqual([
        { conversation: expect.objectContaining({ id: CONVERSATION_ID }), membership },
      ]);
    });

    it('deve filtrar arquivadas com archived_at IS NOT NULL', async () => {
      MockParticipant.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as never);

      await repository.listForUser(USER_A, { archived: true, limit: 10, offset: 5 });

      expect(MockParticipant.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_A, archivedAt: { [Op.ne]: null } },
          limit: 10,
          offset: 5,
        })
      );
    });

    it('deve ignorar linhas sem conversa carregada', async () => {
      MockParticipant.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ conversation: undefined, toJSON: jest.fn() }],
      } as never);

      const result = await repository.listForUser(USER_A, {
        archived: false,
        limit: 20,
        offset: 0,
      });

      expect(result.rows).toEqual([]);
    });
  });

  describe('rename', () => {
    it('deve atualizar o nome', async () => {
      MockConversation.update.mockResolvedValue([1] as never);

      await repository.rename(CONVERSATION_ID, 'Novo');

      expect(MockConversation.update).toHaveBeenCalledWith(
        { name: 'Novo' },
        { where: { id: CONVERSATION_ID } }
      );
    });
  });

  describe('touchLastMessageAt', () => {
    it('deve avançar last_message_at apenas se for mais recente', async () => {
      const at = new Date('2026-09-24T10:00:00.000Z');
      MockConversation.update.mockResolvedValue([1] as never);

      await repository.touchLastMessageAt(CONVERSATION_ID, at);

      expect(MockConversation.update).toHaveBeenCalledWith(
        { lastMessageAt: at },
        {
          where: {
            id: CONVERSATION_ID,
            [Op.or]: [{ lastMessageAt: null }, { lastMessageAt: { [Op.lt]: at } }],
          },
        }
      );
    });
  });

  describe('delete', () => {
    it('deve remover a conversa', async () => {
      MockConversation.destroy.mockResolvedValue(1);

      await repository.delete(CONVERSATION_ID);

      expect(MockConversation.destroy).toHaveBeenCalledWith({ where: { id: CONVERSATION_ID } });
    });
  });
});
```

`tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`:

```ts
jest.mock('@/modules/chat/models/Participant', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    update: jest.fn(),
  },
}));

import { Op } from 'sequelize';
import Participant from '@/modules/chat/models/Participant';
import {
  ParticipantRepository,
  participantRepository,
} from '@/modules/chat/repositories/ParticipantRepository';

const MockParticipant = Participant as jest.Mocked<typeof Participant>;

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const OLDEST_FIRST = [
  ['joinedAt', 'ASC'],
  ['id', 'ASC'],
];

function row(attrs: Record<string, unknown>): { toJSON: jest.Mock } & Record<string, unknown> {
  return { ...attrs, toJSON: jest.fn().mockReturnValue(attrs) };
}

describe('ParticipantRepository', () => {
  let repository: ParticipantRepository;

  beforeEach(() => {
    repository = new ParticipantRepository();
  });

  it('deve exportar a instância singleton', () => {
    expect(participantRepository).toBeInstanceOf(ParticipantRepository);
  });

  describe('find', () => {
    it('deve retornar o participante serializado', async () => {
      MockParticipant.findOne.mockResolvedValue(row({ userId: USER_A }) as never);

      const result = await repository.find(CONVERSATION_ID, USER_A);

      expect(MockParticipant.findOne).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
      });
      expect(result).toEqual({ userId: USER_A });
    });

    it('deve retornar null quando não participa', async () => {
      MockParticipant.findOne.mockResolvedValue(null);

      await expect(repository.find(CONVERSATION_ID, USER_A)).resolves.toBeNull();
    });
  });

  describe('listByConversation', () => {
    it('deve listar do mais antigo para o mais novo', async () => {
      MockParticipant.findAll.mockResolvedValue([
        row({ userId: USER_A }),
        row({ userId: USER_B }),
      ] as never);

      const result = await repository.listByConversation(CONVERSATION_ID);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID },
        order: OLDEST_FIRST,
      });
      expect(result).toEqual([{ userId: USER_A }, { userId: USER_B }]);
    });
  });

  describe('listByConversations', () => {
    it('não deve consultar quando a lista é vazia', async () => {
      await expect(repository.listByConversations([])).resolves.toEqual([]);
      expect(MockParticipant.findAll).not.toHaveBeenCalled();
    });

    it('deve listar participantes de várias conversas', async () => {
      MockParticipant.findAll.mockResolvedValue([row({ userId: USER_A })] as never);

      const result = await repository.listByConversations([CONVERSATION_ID, OTHER_CONVERSATION_ID]);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { conversationId: { [Op.in]: [CONVERSATION_ID, OTHER_CONVERSATION_ID] } },
        order: OLDEST_FIRST,
      });
      expect(result).toEqual([{ userId: USER_A }]);
    });
  });

  describe('listConversationIdsByUser', () => {
    it('deve retornar apenas os ids das conversas', async () => {
      MockParticipant.findAll.mockResolvedValue([
        { conversationId: CONVERSATION_ID },
        { conversationId: OTHER_CONVERSATION_ID },
      ] as never);

      const result = await repository.listConversationIdsByUser(USER_A);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { userId: USER_A },
        attributes: ['conversationId'],
      });
      expect(result).toEqual([CONVERSATION_ID, OTHER_CONVERSATION_ID]);
    });
  });

  describe('addMembers', () => {
    it('não deve inserir quando a lista é vazia', async () => {
      await repository.addMembers(CONVERSATION_ID, []);

      expect(MockParticipant.bulkCreate).not.toHaveBeenCalled();
    });

    it('deve inserir como member ignorando duplicados', async () => {
      MockParticipant.bulkCreate.mockResolvedValue([] as never);

      await repository.addMembers(CONVERSATION_ID, [USER_A, USER_B]);

      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [
          { conversationId: CONVERSATION_ID, userId: USER_A, role: 'member' },
          { conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' },
        ],
        { ignoreDuplicates: true }
      );
    });
  });

  describe('remove / setRole / setArchivedAt', () => {
    it('remove deve apagar a linha do participante', async () => {
      MockParticipant.destroy.mockResolvedValue(1);

      await repository.remove(CONVERSATION_ID, USER_A);

      expect(MockParticipant.destroy).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
      });
    });

    it('setRole deve atualizar o papel', async () => {
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.setRole(CONVERSATION_ID, USER_A, 'admin');

      expect(MockParticipant.update).toHaveBeenCalledWith(
        { role: 'admin' },
        { where: { conversationId: CONVERSATION_ID, userId: USER_A } }
      );
    });

    it('setArchivedAt deve gravar a data (ou null para desarquivar)', async () => {
      const at = new Date('2026-09-24T00:00:00.000Z');
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.setArchivedAt(CONVERSATION_ID, USER_A, at);
      await repository.setArchivedAt(CONVERSATION_ID, USER_A, null);

      expect(MockParticipant.update).toHaveBeenNthCalledWith(
        1,
        { archivedAt: at },
        { where: { conversationId: CONVERSATION_ID, userId: USER_A } }
      );
      expect(MockParticipant.update).toHaveBeenNthCalledWith(
        2,
        { archivedAt: null },
        { where: { conversationId: CONVERSATION_ID, userId: USER_A } }
      );
    });
  });
});
```

`tests/unit/modules/chat/repositories/index.test.ts`:

```ts
jest.mock('@/shared/database/sequelize', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Conversation', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Participant', () => ({ __esModule: true, default: {} }));

import * as repositories from '@/modules/chat/repositories';

describe('chat repositories index', () => {
  it('deve exportar classes e singletons', () => {
    expect(repositories.ConversationRepository).toBeDefined();
    expect(repositories.conversationRepository).toBeInstanceOf(repositories.ConversationRepository);
    expect(repositories.ParticipantRepository).toBeDefined();
    expect(repositories.participantRepository).toBeInstanceOf(repositories.ParticipantRepository);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/repositories --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/repositories/ConversationRepository'`.

- [ ] **Step 3: Implementar as interfaces**

`src/modules/chat/interfaces/IConversationRepository.ts`:

```ts
import type {
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
} from '../types';

export interface ListForUserOptions {
  archived: boolean;
  limit: number;
  offset: number;
}

export interface IConversationRepository {
  findById(id: string): Promise<ConversationAttributes | null>;
  findByDirectKey(directKey: string): Promise<ConversationAttributes | null>;
  /** Cria a conversa 1:1 e os dois participantes; sob corrida, devolve a existente. */
  createDirect(data: CreateDirectData): Promise<CreateDirectRecord>;
  /** Cria o grupo com o criador como `admin` e os demais como `member`. */
  createGroup(data: CreateGroupData): Promise<ConversationAttributes>;
  listForUser(userId: string, options: ListForUserOptions): Promise<ConversationListPage>;
  rename(id: string, name: string): Promise<void>;
  /** Avança `last_message_at` (nunca retrocede). */
  touchLastMessageAt(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
}
```

`src/modules/chat/interfaces/IParticipantRepository.ts`:

```ts
import type { ParticipantAttributes, ParticipantRole } from '../types';

export interface IParticipantRepository {
  find(conversationId: string, userId: string): Promise<ParticipantAttributes | null>;
  /** Participantes da conversa, do mais antigo (`joined_at`) para o mais novo. */
  listByConversation(conversationId: string): Promise<ParticipantAttributes[]>;
  listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]>;
  listConversationIdsByUser(userId: string): Promise<string[]>;
  /** Adiciona como `member`, ignorando quem já participa. */
  addMembers(conversationId: string, userIds: string[]): Promise<void>;
  remove(conversationId: string, userId: string): Promise<void>;
  setRole(conversationId: string, userId: string, role: ParticipantRole): Promise<void>;
  setArchivedAt(conversationId: string, userId: string, archivedAt: Date | null): Promise<void>;
}
```

`src/modules/chat/interfaces/index.ts`:

```ts
export type { IConversationRepository, ListForUserOptions } from './IConversationRepository';
export type { IParticipantRepository } from './IParticipantRepository';
```

- [ ] **Step 4: Implementar os repositórios**

`src/modules/chat/repositories/ConversationRepository.ts`:

```ts
import sequelize from '@/shared/database/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import Conversation from '../models/Conversation';
import Participant from '../models/Participant';
import type { IConversationRepository, ListForUserOptions } from '../interfaces';
import type {
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
} from '../types';

export class ConversationRepository implements IConversationRepository {
  async findById(id: string): Promise<ConversationAttributes | null> {
    const conversation = await Conversation.findByPk(id);
    return conversation?.toJSON() ?? null;
  }

  async findByDirectKey(directKey: string): Promise<ConversationAttributes | null> {
    const conversation = await Conversation.findOne({ where: { directKey } });
    return conversation?.toJSON() ?? null;
  }

  async createDirect({
    directKey,
    createdBy,
    userIds,
  }: CreateDirectData): Promise<CreateDirectRecord> {
    try {
      const conversation = await sequelize.transaction(async (transaction) => {
        const created = await Conversation.create(
          { type: 'direct', directKey, createdBy },
          { transaction }
        );
        await Participant.bulkCreate(
          userIds.map((userId) => ({
            conversationId: created.id,
            userId,
            role: 'member' as const,
          })),
          { transaction }
        );
        return created;
      });
      return { conversation: conversation.toJSON(), created: true };
    } catch (error) {
      // Duas requisições simultâneas para o mesmo par: o UNIQUE de direct_key barra a segunda,
      // que devolve a conversa criada pela primeira.
      if (!(error instanceof UniqueConstraintError)) {
        throw error;
      }
      const existing = await this.findByDirectKey(directKey);
      if (existing === null) {
        throw error;
      }
      return { conversation: existing, created: false };
    }
  }

  async createGroup({
    name,
    createdBy,
    memberIds,
  }: CreateGroupData): Promise<ConversationAttributes> {
    const conversation = await sequelize.transaction(async (transaction) => {
      const created = await Conversation.create(
        { type: 'group', name, createdBy },
        { transaction }
      );
      await Participant.bulkCreate(
        [
          { conversationId: created.id, userId: createdBy, role: 'admin' as const },
          ...memberIds.map((userId) => ({
            conversationId: created.id,
            userId,
            role: 'member' as const,
          })),
        ],
        { transaction }
      );
      return created;
    });
    return conversation.toJSON();
  }

  async listForUser(
    userId: string,
    { archived, limit, offset }: ListForUserOptions
  ): Promise<ConversationListPage> {
    const conversationAssociation = { model: Conversation, as: 'conversation' };
    const { count, rows } = await Participant.findAndCountAll({
      where: { userId, archivedAt: archived ? { [Op.ne]: null } : null },
      include: [{ model: Conversation, as: 'conversation', required: true }],
      order: [
        [conversationAssociation, 'lastMessageAt', 'DESC NULLS LAST'],
        [conversationAssociation, 'createdAt', 'DESC'],
      ],
      limit,
      offset,
    });

    return {
      total: count,
      rows: rows.flatMap((participant) =>
        participant.conversation
          ? [{ conversation: participant.conversation.toJSON(), membership: participant.toJSON() }]
          : []
      ),
    };
  }

  async rename(id: string, name: string): Promise<void> {
    await Conversation.update({ name }, { where: { id } });
  }

  async touchLastMessageAt(id: string, at: Date): Promise<void> {
    await Conversation.update(
      { lastMessageAt: at },
      {
        where: {
          id,
          [Op.or]: [{ lastMessageAt: null }, { lastMessageAt: { [Op.lt]: at } }],
        },
      }
    );
  }

  async delete(id: string): Promise<void> {
    await Conversation.destroy({ where: { id } });
  }
}

export const conversationRepository = new ConversationRepository();
```

`src/modules/chat/repositories/ParticipantRepository.ts`:

```ts
import { Op } from 'sequelize';
import Participant from '../models/Participant';
import type { IParticipantRepository } from '../interfaces';
import type { ParticipantAttributes, ParticipantRole } from '../types';

const OLDEST_FIRST: [string, string][] = [
  ['joinedAt', 'ASC'],
  ['id', 'ASC'],
];

export class ParticipantRepository implements IParticipantRepository {
  async find(conversationId: string, userId: string): Promise<ParticipantAttributes | null> {
    const participant = await Participant.findOne({ where: { conversationId, userId } });
    return participant?.toJSON() ?? null;
  }

  async listByConversation(conversationId: string): Promise<ParticipantAttributes[]> {
    const rows = await Participant.findAll({ where: { conversationId }, order: OLDEST_FIRST });
    return rows.map((row) => row.toJSON());
  }

  async listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]> {
    if (conversationIds.length === 0) {
      return [];
    }
    const rows = await Participant.findAll({
      where: { conversationId: { [Op.in]: conversationIds } },
      order: OLDEST_FIRST,
    });
    return rows.map((row) => row.toJSON());
  }

  async listConversationIdsByUser(userId: string): Promise<string[]> {
    const rows = await Participant.findAll({ where: { userId }, attributes: ['conversationId'] });
    return rows.map((row) => row.conversationId);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    await Participant.bulkCreate(
      userIds.map((userId) => ({ conversationId, userId, role: 'member' as const })),
      { ignoreDuplicates: true }
    );
  }

  async remove(conversationId: string, userId: string): Promise<void> {
    await Participant.destroy({ where: { conversationId, userId } });
  }

  async setRole(conversationId: string, userId: string, role: ParticipantRole): Promise<void> {
    await Participant.update({ role }, { where: { conversationId, userId } });
  }

  async setArchivedAt(
    conversationId: string,
    userId: string,
    archivedAt: Date | null
  ): Promise<void> {
    await Participant.update({ archivedAt }, { where: { conversationId, userId } });
  }
}

export const participantRepository = new ParticipantRepository();
```

`src/modules/chat/repositories/index.ts`:

```ts
export { ConversationRepository, conversationRepository } from './ConversationRepository';
export { ParticipantRepository, participantRepository } from './ParticipantRepository';
```

SQL de `listForUser` (conferido offline): `... FROM "participants" AS "Participant" INNER JOIN "conversations" AS "conversation" ON ... WHERE "Participant"."user_id" = ? AND "Participant"."archived_at" IS NULL ORDER BY "conversation"."last_message_at" DESC NULLS LAST, "conversation"."created_at" DESC LIMIT 20 OFFSET 0`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/repositories --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/repositories/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% nos três arquivos.

- [ ] **Step 6: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write "src/modules/chat/interfaces/*.ts" "src/modules/chat/repositories/*.ts" "tests/unit/modules/chat/repositories/*.ts"
node node_modules/.bin/eslint src
git add src/modules/chat/interfaces src/modules/chat/repositories tests/unit/modules/chat/repositories
git commit -m "✨ feat: adiciona repositórios de conversas e participantes"
```

---

### Task 8: `MessageRepository` (MongoDB) com paginação por cursor

**Files:**
- Create: `src/modules/chat/interfaces/IMessageRepository.ts`
- Modify: `src/modules/chat/interfaces/index.ts`
- Create: `src/modules/chat/repositories/MessageRepository.ts`
- Modify: `src/modules/chat/repositories/index.ts`
- Test: `tests/unit/modules/chat/repositories/MessageRepository.test.ts`
- Modify: `tests/unit/modules/chat/repositories/index.test.ts`

**Interfaces:**
- Consumes: `MessageModel`/`IMessage` (Task 6), tipos de mensagem (Task 5).
- Produces: `IMessageRepository` com `create(data: CreateMessageData): Promise<MessageRecord>`, `findById(id): Promise<MessageRecord | null>`, `findByConversation(conversationId, { limit, before? }: FindMessagesOptions): Promise<MessageRecord[]>` (mais recentes primeiro; cursor `createdAt < c.createdAt OR (createdAt = c.createdAt AND _id < c.id)`), `softDelete(id, deletedAt): Promise<boolean>` (`updateOne({ _id, deletedAt: null })` → `modifiedCount > 0`); singleton `messageRepository`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/repositories/MessageRepository.test.ts`:

```ts
jest.mock('@/modules/chat/models/Message', () => ({
  MessageModel: {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
  },
}));

import { Types } from 'mongoose';
import { MessageModel } from '@/modules/chat/models/Message';
import {
  MessageRepository,
  messageRepository,
} from '@/modules/chat/repositories/MessageRepository';

const MockMessageModel = MessageModel as unknown as {
  create: jest.Mock;
  findById: jest.Mock;
  find: jest.Mock;
  updateOne: jest.Mock;
};

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = '11111111-1111-4111-8111-111111111111';
const MENTIONED_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '65f000000000000000000001';
const REPLY_ID = '65f000000000000000000000';
const CREATED_AT = new Date('2026-09-24T10:00:00.000Z');

function fakeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(MESSAGE_ID),
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [MENTIONED_ID],
    metadata: { ip: '127.0.0.1', device: 'jest' },
    deletedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

const expectedRecord = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: SENDER_ID,
  content: { type: 'text', text: 'olá' },
  replyTo: null,
  mentions: [MENTIONED_ID],
  metadata: { ip: '127.0.0.1', device: 'jest' },
  deletedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

describe('MessageRepository', () => {
  let repository: MessageRepository;
  let query: { sort: jest.Mock; limit: jest.Mock; exec: jest.Mock };

  beforeEach(() => {
    repository = new MessageRepository();
    query = { sort: jest.fn(), limit: jest.fn(), exec: jest.fn() };
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    MockMessageModel.find.mockReturnValue(query);
  });

  it('deve exportar a instância singleton', () => {
    expect(messageRepository).toBeInstanceOf(MessageRepository);
  });

  describe('create', () => {
    it('deve persistir sem replyTo e mapear o documento para MessageRecord', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc());

      const result = await repository.create({
        conversationId: CONVERSATION_ID,
        senderId: SENDER_ID,
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [MENTIONED_ID],
        metadata: { ip: '127.0.0.1', device: 'jest' },
      });

      expect(MockMessageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: CONVERSATION_ID, replyTo: null })
      );
      expect(result).toEqual(expectedRecord);
    });

    it('deve converter replyTo para ObjectId', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc({ replyTo: new Types.ObjectId(REPLY_ID) }));

      const result = await repository.create({
        conversationId: CONVERSATION_ID,
        senderId: SENDER_ID,
        content: { type: 'text', text: 'olá' },
        replyTo: REPLY_ID,
        mentions: [],
        metadata: { ip: null, device: null },
      });

      const payload = MockMessageModel.create.mock.calls[0]![0] as { replyTo: Types.ObjectId };
      expect(payload.replyTo).toBeInstanceOf(Types.ObjectId);
      expect(payload.replyTo.toString()).toBe(REPLY_ID);
      expect(result.replyTo).toBe(REPLY_ID);
    });
  });

  describe('findById', () => {
    it('deve retornar o registro quando existe', async () => {
      MockMessageModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(fakeDoc()) });

      const result = await repository.findById(MESSAGE_ID);

      expect(MockMessageModel.findById).toHaveBeenCalledWith(MESSAGE_ID);
      expect(result).toEqual(expectedRecord);
    });

    it('deve retornar null quando não existe', async () => {
      MockMessageModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(repository.findById(MESSAGE_ID)).resolves.toBeNull();
    });
  });

  describe('findByConversation', () => {
    it('deve buscar a primeira página ordenada por createdAt/_id desc', async () => {
      query.exec.mockResolvedValue([fakeDoc()]);

      const result = await repository.findByConversation(CONVERSATION_ID, { limit: 50 });

      expect(MockMessageModel.find).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(query.limit).toHaveBeenCalledWith(50);
      expect(result).toEqual([expectedRecord]);
    });

    it('deve aplicar o cursor (createdAt menor, ou igual com _id menor)', async () => {
      query.exec.mockResolvedValue([]);

      await repository.findByConversation(CONVERSATION_ID, {
        limit: 2,
        before: { createdAt: CREATED_AT, id: MESSAGE_ID },
      });

      const filter = MockMessageModel.find.mock.calls[0]![0] as {
        conversationId: string;
        $or: [{ createdAt: { $lt: Date } }, { createdAt: Date; _id: { $lt: Types.ObjectId } }];
      };
      expect(filter.conversationId).toBe(CONVERSATION_ID);
      expect(filter.$or[0]).toEqual({ createdAt: { $lt: CREATED_AT } });
      expect(filter.$or[1].createdAt).toBe(CREATED_AT);
      expect(filter.$or[1]._id.$lt.toString()).toBe(MESSAGE_ID);
      expect(query.limit).toHaveBeenCalledWith(2);
    });
  });

  describe('softDelete', () => {
    it('deve marcar deletedAt só se ainda não apagada e retornar true', async () => {
      const at = new Date('2026-09-24T11:00:00.000Z');
      MockMessageModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });

      const result = await repository.softDelete(MESSAGE_ID, at);

      expect(MockMessageModel.updateOne).toHaveBeenCalledWith(
        { _id: MESSAGE_ID, deletedAt: null },
        { $set: { deletedAt: at } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando já estava apagada', async () => {
      MockMessageModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      });

      await expect(repository.softDelete(MESSAGE_ID, new Date())).resolves.toBe(false);
    });
  });
});
```

Substituir `tests/unit/modules/chat/repositories/index.test.ts` por:

```ts
jest.mock('@/shared/database/sequelize', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Conversation', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Participant', () => ({ __esModule: true, default: {} }));
jest.mock('@/modules/chat/models/Message', () => ({ MessageModel: {} }));

import * as repositories from '@/modules/chat/repositories';

describe('chat repositories index', () => {
  it('deve exportar classes e singletons', () => {
    expect(repositories.ConversationRepository).toBeDefined();
    expect(repositories.conversationRepository).toBeInstanceOf(repositories.ConversationRepository);
    expect(repositories.ParticipantRepository).toBeDefined();
    expect(repositories.participantRepository).toBeInstanceOf(repositories.ParticipantRepository);
    expect(repositories.MessageRepository).toBeDefined();
    expect(repositories.messageRepository).toBeInstanceOf(repositories.MessageRepository);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/repositories --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/repositories/MessageRepository'`.

- [ ] **Step 3: Implementar**

`src/modules/chat/interfaces/IMessageRepository.ts`:

```ts
import type { CreateMessageData, FindMessagesOptions, MessageRecord } from '../types';

export interface IMessageRepository {
  create(data: CreateMessageData): Promise<MessageRecord>;
  findById(id: string): Promise<MessageRecord | null>;
  /** Mais recentes primeiro; com `before`, apenas mensagens estritamente anteriores ao cursor. */
  findByConversation(
    conversationId: string,
    options: FindMessagesOptions
  ): Promise<MessageRecord[]>;
  /** Marca `deletedAt`; retorna `true` só se esta chamada apagou (idempotente sob concorrência). */
  softDelete(id: string, deletedAt: Date): Promise<boolean>;
}
```

Substituir `src/modules/chat/interfaces/index.ts` por:

```ts
export type { IConversationRepository, ListForUserOptions } from './IConversationRepository';
export type { IParticipantRepository } from './IParticipantRepository';
export type { IMessageRepository } from './IMessageRepository';
```

`src/modules/chat/repositories/MessageRepository.ts`:

```ts
import { Types, type HydratedDocument } from 'mongoose';
import { MessageModel, type IMessage } from '../models/Message';
import type { IMessageRepository } from '../interfaces';
import type { CreateMessageData, FindMessagesOptions, MessageRecord } from '../types';

function toRecord(doc: HydratedDocument<IMessage>): MessageRecord {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: { type: doc.content.type, text: doc.content.text },
    replyTo: doc.replyTo === null ? null : doc.replyTo.toString(),
    mentions: [...doc.mentions],
    metadata: { ip: doc.metadata.ip, device: doc.metadata.device },
    deletedAt: doc.deletedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MessageRepository implements IMessageRepository {
  async create(data: CreateMessageData): Promise<MessageRecord> {
    const doc = await MessageModel.create({
      ...data,
      replyTo: data.replyTo === null ? null : new Types.ObjectId(data.replyTo),
    });
    return toRecord(doc);
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const doc = await MessageModel.findById(id).exec();
    return doc === null ? null : toRecord(doc);
  }

  async findByConversation(
    conversationId: string,
    { limit, before }: FindMessagesOptions
  ): Promise<MessageRecord[]> {
    const filter =
      before === undefined
        ? { conversationId }
        : {
            conversationId,
            $or: [
              { createdAt: { $lt: before.createdAt } },
              { createdAt: before.createdAt, _id: { $lt: new Types.ObjectId(before.id) } },
            ],
          };

    const docs = await MessageModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();
    return docs.map(toRecord);
  }

  async softDelete(id: string, deletedAt: Date): Promise<boolean> {
    const result = await MessageModel.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt } }
    ).exec();
    return result.modifiedCount > 0;
  }
}

export const messageRepository = new MessageRepository();
```

Substituir `src/modules/chat/repositories/index.ts` por:

```ts
export { ConversationRepository, conversationRepository } from './ConversationRepository';
export { ParticipantRepository, participantRepository } from './ParticipantRepository';
export { MessageRepository, messageRepository } from './MessageRepository';
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/repositories --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/repositories/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% nos quatro arquivos.

- [ ] **Step 5: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write src/modules/chat/interfaces/IMessageRepository.ts src/modules/chat/interfaces/index.ts src/modules/chat/repositories/MessageRepository.ts src/modules/chat/repositories/index.ts tests/unit/modules/chat/repositories/MessageRepository.test.ts tests/unit/modules/chat/repositories/index.test.ts
node node_modules/.bin/eslint src
git add src/modules/chat/interfaces/IMessageRepository.ts src/modules/chat/interfaces/index.ts src/modules/chat/repositories/MessageRepository.ts src/modules/chat/repositories/index.ts tests/unit/modules/chat/repositories/MessageRepository.test.ts tests/unit/modules/chat/repositories/index.test.ts
git commit -m "✨ feat: adiciona MessageRepository (MongoDB) com paginação por cursor"
```

---

### Task 9: `ConversationService`

**Files:**
- Create: `src/modules/chat/interfaces/IConversationService.ts`
- Modify: `src/modules/chat/interfaces/index.ts`
- Create: `src/modules/chat/services/ConversationService.ts`, `src/modules/chat/services/index.ts`
- Test: `tests/unit/modules/chat/services/ConversationService.test.ts`, `tests/unit/modules/chat/services/index.test.ts`

**Interfaces:**
- Consumes: `IConversationRepository`, `IParticipantRepository` (Task 7); `IUserService.exists(id): Promise<boolean>` e `IUserService.getMultiple(ids): Promise<PublicUserDTO[]>` (existentes em `@/modules/user/interfaces`); `IContactService.isBlockedByEither(a, b): Promise<boolean>`; `EventBus.publish`; payloads da Task 1.
- Produces:
  - `buildDirectKey(userA, userB): string` → `menorUuid:maiorUuid`.
  - `class ConversationService implements IConversationService` com construtor `(conversations = conversationRepository, participants = participantRepository, users: Pick<IUserService,'exists'|'getMultiple'> = userService, contacts: Pick<IContactService,'isBlockedByEither'> = contactService, events: Pick<EventBus,'publish'> = eventBus)`.
  - `IConversationService`: `createDirect(userId, otherUserId): Promise<CreateDirectResult>`, `createGroup(userId, { name, participantIds }): Promise<ConversationDTO>`, `list(userId, { archived?, limit?, offset? }?): Promise<PaginatedConversations>`, `get(userId, conversationId): Promise<ConversationDTO>`, `rename(userId, conversationId, name): Promise<ConversationDTO>`, `archive`/`unarchive`/`leave(userId, conversationId): Promise<void>`, `addMembers(userId, conversationId, userIds): Promise<ConversationDTO>`, `removeMember(userId, conversationId, memberId): Promise<void>`, `isParticipant(conversationId, userId): Promise<boolean>`, `getParticipantIds(conversationId): Promise<string[]>`, `getUserConversationIds(userId): Promise<string[]>`.
  - Singleton `conversationService`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/services/ConversationService.test.ts`:

```ts
jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
}));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import {
  CannotConverseWithSelfException,
  ConversationBlockedException,
  ConversationNotFoundException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  NotConversationAdminException,
  ParticipantNotFoundException,
  UsersNotFoundException,
} from '@/modules/chat/errors';
import type { IConversationRepository, IParticipantRepository } from '@/modules/chat/interfaces';
import {
  ConversationService,
  buildDirectKey,
  conversationService,
} from '@/modules/chat/services/ConversationService';
import type {
  ConversationAttributes,
  ParticipantAttributes,
  ParticipantRole,
} from '@/modules/chat/types';
import type { PublicUserDTO } from '@/modules/user/types';
import { ChatEvents } from '@/shared/types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const USER_D = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-09-24T10:00:00.000Z');

function conversation(overrides: Partial<ConversationAttributes> = {}): ConversationAttributes {
  return {
    id: CONVERSATION_ID,
    type: 'group',
    name: 'Time',
    avatarUrl: null,
    createdBy: USER_A,
    directKey: null,
    lastMessageAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function participant(
  userId: string,
  role: ParticipantRole = 'member',
  overrides: Partial<ParticipantAttributes> = {}
): ParticipantAttributes {
  return {
    id: `p-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role,
    joinedAt: NOW,
    lastReadAt: null,
    isMuted: false,
    archivedAt: null,
    ...overrides,
  };
}

function user(id: string, username: string): PublicUserDTO {
  return { id, username, displayName: null, avatarUrl: null, status: 'offline', lastSeenAt: null };
}

describe('ConversationService', () => {
  let conversations: jest.Mocked<IConversationRepository>;
  let participants: jest.Mocked<IParticipantRepository>;
  let users: { exists: jest.Mock; getMultiple: jest.Mock };
  let contacts: { isBlockedByEither: jest.Mock };
  let events: { publish: jest.Mock };
  let service: ConversationService;

  /** Configura o repositório para que `get(userId, CONVERSATION_ID)` funcione. */
  function givenMembership(
    conv: ConversationAttributes,
    members: ParticipantAttributes[],
    knownUsers: PublicUserDTO[] = []
  ): void {
    participants.find.mockImplementation(
      async (_conversationId: string, userId: string) =>
        members.find((m) => m.userId === userId) ?? null
    );
    conversations.findById.mockResolvedValue(conv);
    participants.listByConversation.mockResolvedValue(members);
    users.getMultiple.mockResolvedValue(knownUsers);
  }

  beforeEach(() => {
    conversations = {
      findById: jest.fn(),
      findByDirectKey: jest.fn(),
      createDirect: jest.fn(),
      createGroup: jest.fn(),
      listForUser: jest.fn(),
      rename: jest.fn(),
      touchLastMessageAt: jest.fn(),
      delete: jest.fn(),
    };
    participants = {
      find: jest.fn(),
      listByConversation: jest.fn(),
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
      setRole: jest.fn(),
      setArchivedAt: jest.fn(),
    };
    users = { exists: jest.fn(), getMultiple: jest.fn() };
    contacts = { isBlockedByEither: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new ConversationService(conversations, participants, users, contacts, events);
  });

  it('deve exportar a instância padrão', () => {
    expect(conversationService).toBeInstanceOf(ConversationService);
  });

  describe('buildDirectKey', () => {
    it('deve ordenar os ids para que a chave independa de quem iniciou', () => {
      expect(buildDirectKey(USER_B, USER_A)).toBe(`${USER_A}:${USER_B}`);
      expect(buildDirectKey(USER_A, USER_B)).toBe(`${USER_A}:${USER_B}`);
    });
  });

  describe('createDirect', () => {
    const direct = conversation({ type: 'direct', name: null, directKey: `${USER_A}:${USER_B}` });

    it('deve lançar 400 ao conversar consigo mesmo', async () => {
      await expect(service.createDirect(USER_A, USER_A)).rejects.toThrow(
        CannotConverseWithSelfException
      );
    });

    it('deve lançar 404 quando o outro usuário não existe', async () => {
      users.exists.mockResolvedValue(false);

      await expect(service.createDirect(USER_A, USER_B)).rejects.toThrow(UsersNotFoundException);
    });

    it('deve lançar 403 quando há bloqueio em qualquer sentido', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(true);

      await expect(service.createDirect(USER_A, USER_B)).rejects.toThrow(
        ConversationBlockedException
      );
      expect(contacts.isBlockedByEither).toHaveBeenCalledWith(USER_A, USER_B);
    });

    it('deve retornar a conversa existente com created=false (idempotente)', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(false);
      conversations.findByDirectKey.mockResolvedValue(direct);
      givenMembership(
        direct,
        [participant(USER_A), participant(USER_B)],
        [user(USER_A, 'ana'), user(USER_B, 'bob')]
      );

      const result = await service.createDirect(USER_B, USER_A);

      expect(conversations.findByDirectKey).toHaveBeenCalledWith(`${USER_A}:${USER_B}`);
      expect(conversations.createDirect).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.conversation.id).toBe(CONVERSATION_ID);
    });

    it('deve criar a conversa e publicar CONVERSATION_CREATED', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(false);
      conversations.findByDirectKey.mockResolvedValue(null);
      conversations.createDirect.mockResolvedValue({ conversation: direct, created: true });
      givenMembership(
        direct,
        [participant(USER_A), participant(USER_B)],
        [user(USER_A, 'ana'), user(USER_B, 'bob')]
      );

      const result = await service.createDirect(USER_A, USER_B);

      expect(conversations.createDirect).toHaveBeenCalledWith({
        directKey: `${USER_A}:${USER_B}`,
        createdBy: USER_A,
        userIds: [USER_A, USER_B],
      });
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_CREATED, {
        conversationId: CONVERSATION_ID,
        type: 'direct',
        creatorId: USER_A,
        participantIds: [USER_A, USER_B],
      });
      expect(result.created).toBe(true);
      expect(result.conversation.participants.map((p) => p.username)).toEqual(['ana', 'bob']);
    });

    it('não deve publicar quando a criação perdeu a corrida (created=false)', async () => {
      users.exists.mockResolvedValue(true);
      contacts.isBlockedByEither.mockResolvedValue(false);
      conversations.findByDirectKey.mockResolvedValue(null);
      conversations.createDirect.mockResolvedValue({ conversation: direct, created: false });
      givenMembership(direct, [participant(USER_A), participant(USER_B)]);

      const result = await service.createDirect(USER_A, USER_B);

      expect(events.publish).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
    });
  });

  describe('createGroup', () => {
    it('deve deduplicar, remover o criador, criar e publicar', async () => {
      const group = conversation();
      users.getMultiple.mockResolvedValueOnce([user(USER_B, 'bob'), user(USER_C, 'carol')]);
      conversations.createGroup.mockResolvedValue(group);
      givenMembership(
        group,
        [participant(USER_A, 'admin'), participant(USER_B), participant(USER_C)],
        [user(USER_A, 'ana'), user(USER_B, 'bob'), user(USER_C, 'carol')]
      );

      const result = await service.createGroup(USER_A, {
        name: 'Time',
        participantIds: [USER_B, USER_C, USER_B, USER_A],
      });

      expect(conversations.createGroup).toHaveBeenCalledWith({
        name: 'Time',
        createdBy: USER_A,
        memberIds: [USER_B, USER_C],
      });
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_CREATED, {
        conversationId: CONVERSATION_ID,
        type: 'group',
        creatorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
      });
      expect(result.membership.role).toBe('admin');
    });

    it('deve lançar 404 listando os usuários ausentes', async () => {
      users.getMultiple.mockResolvedValue([user(USER_B, 'bob')]);

      const promise = service.createGroup(USER_A, {
        name: 'Time',
        participantIds: [USER_B, USER_C, USER_D],
      });

      await expect(promise).rejects.toThrow(UsersNotFoundException);
      await expect(promise).rejects.toMatchObject({
        details: [
          expect.objectContaining({ message: USER_C }),
          expect.objectContaining({ message: USER_D }),
        ],
      });
      expect(conversations.createGroup).not.toHaveBeenCalled();
    });

    it('deve lançar 400 acima de 256 participantes (incluindo o criador)', async () => {
      const many = Array.from(
        { length: 256 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      );

      await expect(
        service.createGroup(USER_A, { name: 'Time', participantIds: many })
      ).rejects.toThrow(GroupParticipantLimitException);
      expect(users.getMultiple).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('deve paginar e montar participantes por conversa', async () => {
      const other = conversation({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Outro' });
      conversations.listForUser.mockResolvedValue({
        total: 3,
        rows: [
          { conversation: conversation(), membership: participant(USER_A, 'admin') },
          { conversation: other, membership: participant(USER_A, 'member', { isMuted: true }) },
        ],
      });
      participants.listByConversations.mockResolvedValue([
        participant(USER_A, 'admin'),
        participant(USER_B),
        participant(USER_A, 'member', { conversationId: other.id }),
      ]);
      users.getMultiple.mockResolvedValue([user(USER_A, 'ana'), user(USER_B, 'bob')]);

      const result = await service.list(USER_A, { limit: 2, offset: 0 });

      expect(conversations.listForUser).toHaveBeenCalledWith(USER_A, {
        archived: false,
        limit: 2,
        offset: 0,
      });
      expect(participants.listByConversations).toHaveBeenCalledWith([CONVERSATION_ID, other.id]);
      expect(users.getMultiple).toHaveBeenCalledWith([USER_A, USER_B]);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
      expect(result.items[0]!.participants.map((p) => p.username)).toEqual(['ana', 'bob']);
      expect(result.items[1]!.participants).toEqual([
        { id: USER_A, username: 'ana', displayName: null, avatarUrl: null, role: 'member' },
      ]);
      expect(result.items[1]!.membership).toEqual({
        role: 'member',
        isMuted: true,
        archivedAt: null,
      });
    });

    it('deve usar defaults (archived=false, limit=20, offset=0) e limitar a 100', async () => {
      conversations.listForUser.mockResolvedValue({ total: 0, rows: [] });
      participants.listByConversations.mockResolvedValue([]);
      users.getMultiple.mockResolvedValue([]);

      const defaults = await service.list(USER_A);
      await service.list(USER_A, { archived: true, limit: 500, offset: 40 });

      expect(conversations.listForUser).toHaveBeenNthCalledWith(1, USER_A, {
        archived: false,
        limit: 20,
        offset: 0,
      });
      expect(conversations.listForUser).toHaveBeenNthCalledWith(2, USER_A, {
        archived: true,
        limit: 100,
        offset: 40,
      });
      expect(defaults).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
    });
  });

  describe('get', () => {
    it('deve responder 404 para não participante (não revela existência)', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.get(USER_D, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
      expect(conversations.findById).not.toHaveBeenCalled();
    });

    it('deve responder 404 quando a conversa sumiu', async () => {
      participants.find.mockResolvedValue(participant(USER_A));
      conversations.findById.mockResolvedValue(null);

      await expect(service.get(USER_A, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('deve omitir participantes cujo usuário não foi encontrado', async () => {
      givenMembership(
        conversation(),
        [participant(USER_A, 'admin'), participant(USER_B)],
        [user(USER_A, 'ana')]
      );

      const result = await service.get(USER_A, CONVERSATION_ID);

      expect(result.participants).toEqual([
        { id: USER_A, username: 'ana', displayName: null, avatarUrl: null, role: 'admin' },
      ]);
      expect(result).not.toHaveProperty('directKey');
    });
  });

  describe('rename', () => {
    it('deve renomear (admin de grupo) e publicar renamed', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await service.rename(USER_A, CONVERSATION_ID, 'Novo nome');

      expect(conversations.rename).toHaveBeenCalledWith(CONVERSATION_ID, 'Novo nome');
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'renamed',
        actorId: USER_A,
        participantIds: [USER_A, USER_B],
      });
    });

    it('deve responder 400 em conversa direct', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.rename(USER_A, CONVERSATION_ID, 'x')).rejects.toThrow(
        GroupOnlyOperationException
      );
    });

    it('deve responder 403 para membro não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await expect(service.rename(USER_B, CONVERSATION_ID, 'x')).rejects.toThrow(
        NotConversationAdminException
      );
      expect(conversations.rename).not.toHaveBeenCalled();
    });
  });

  describe('archive / unarchive', () => {
    it('deve arquivar e desarquivar apenas para o participante', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);

      await service.archive(USER_A, CONVERSATION_ID);
      await service.unarchive(USER_A, CONVERSATION_ID);

      expect(participants.setArchivedAt).toHaveBeenNthCalledWith(
        1,
        CONVERSATION_ID,
        USER_A,
        expect.any(Date)
      );
      expect(participants.setArchivedAt).toHaveBeenNthCalledWith(2, CONVERSATION_ID, USER_A, null);
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.archive(USER_D, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
  });

  describe('leave', () => {
    it('deve responder 400 em conversa direct', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.leave(USER_A, CONVERSATION_ID)).rejects.toThrow(
        GroupOnlyOperationException
      );
    });

    it('último admin saindo promove o membro mais antigo', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B), participant(USER_C)]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_A);
      expect(participants.setRole).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, 'admin');
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'member_left',
        actorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
      });
    });

    it('não promove ninguém quando ainda resta admin', async () => {
      givenMembership(conversation(), [participant(USER_A), participant(USER_B, 'admin')]);
      participants.listByConversation.mockResolvedValue([participant(USER_B, 'admin')]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(participants.setRole).not.toHaveBeenCalled();
    });

    it('remove a conversa quando não resta ninguém', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);
      participants.listByConversation.mockResolvedValue([]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(conversations.delete).toHaveBeenCalledWith(CONVERSATION_ID);
      expect(events.publish).toHaveBeenCalledWith(
        ChatEvents.CONVERSATION_UPDATED,
        expect.objectContaining({ change: 'member_left', participantIds: [USER_A] })
      );
    });
  });

  describe('addMembers', () => {
    it('deve adicionar apenas quem ainda não participa e publicar members_added', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      users.getMultiple.mockResolvedValueOnce([user(USER_C, 'carol')]);

      await service.addMembers(USER_A, CONVERSATION_ID, [USER_B, USER_C, USER_C]);

      expect(users.getMultiple).toHaveBeenNthCalledWith(1, [USER_C]);
      expect(participants.addMembers).toHaveBeenCalledWith(CONVERSATION_ID, [USER_C]);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'members_added',
        actorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
      });
    });

    it('não deve inserir nem publicar quando todos já participam', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await service.addMembers(USER_A, CONVERSATION_ID, [USER_B]);

      expect(participants.addMembers).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('deve responder 403 para não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await expect(service.addMembers(USER_B, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        NotConversationAdminException
      );
    });

    it('deve responder 400 ao estourar 256 participantes', async () => {
      const current = Array.from({ length: 256 }, (_, i) =>
        participant(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
      );
      givenMembership(conversation(), [participant(USER_A, 'admin'), ...current.slice(1)]);

      await expect(service.addMembers(USER_A, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        GroupParticipantLimitException
      );
    });

    it('deve responder 404 para usuário inexistente', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);
      users.getMultiple.mockResolvedValueOnce([]);

      await expect(service.addMembers(USER_A, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        UsersNotFoundException
      );
      expect(participants.addMembers).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('remover a si mesmo equivale a sair', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B)]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_A);

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_A);
      expect(events.publish).toHaveBeenCalledWith(
        ChatEvents.CONVERSATION_UPDATED,
        expect.objectContaining({ change: 'member_left' })
      );
    });

    it('admin remove membro e publica member_removed', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_A, 'admin')]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_B);

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_B);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'member_removed',
        actorId: USER_A,
        participantIds: [USER_B, USER_A],
      });
    });

    it('deve responder 404 quando o alvo não participa', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);

      await expect(service.removeMember(USER_A, CONVERSATION_ID, USER_C)).rejects.toThrow(
        ParticipantNotFoundException
      );
    });

    it('deve responder 403 para não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await expect(service.removeMember(USER_B, CONVERSATION_ID, USER_A)).rejects.toThrow(
        NotConversationAdminException
      );
    });
  });

  describe('consultas para outros módulos', () => {
    it('isParticipant', async () => {
      participants.find.mockResolvedValueOnce(participant(USER_A)).mockResolvedValueOnce(null);

      await expect(service.isParticipant(CONVERSATION_ID, USER_A)).resolves.toBe(true);
      await expect(service.isParticipant(CONVERSATION_ID, USER_D)).resolves.toBe(false);
    });

    it('getParticipantIds', async () => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);

      await expect(service.getParticipantIds(CONVERSATION_ID)).resolves.toEqual([USER_A, USER_B]);
    });

    it('getUserConversationIds', async () => {
      participants.listConversationIdsByUser.mockResolvedValue([CONVERSATION_ID]);

      await expect(service.getUserConversationIds(USER_A)).resolves.toEqual([CONVERSATION_ID]);
    });
  });
});
```

`tests/unit/modules/chat/services/index.test.ts`:

```ts
jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
  messageRepository: {},
}));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import * as services from '@/modules/chat/services';

describe('chat services index', () => {
  it('deve exportar ConversationService, a instância padrão e buildDirectKey', () => {
    expect(services.conversationService).toBeInstanceOf(services.ConversationService);
    expect(typeof services.buildDirectKey).toBe('function');
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/services --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/services/ConversationService'`.

- [ ] **Step 3: Implementar**

`src/modules/chat/interfaces/IConversationService.ts`:

```ts
import type {
  ConversationDTO,
  CreateDirectResult,
  CreateGroupDTO,
  ListConversationsOptions,
  PaginatedConversations,
} from '../types';

export interface IConversationService {
  createDirect(userId: string, otherUserId: string): Promise<CreateDirectResult>;
  createGroup(userId: string, data: CreateGroupDTO): Promise<ConversationDTO>;
  list(userId: string, options?: ListConversationsOptions): Promise<PaginatedConversations>;
  get(userId: string, conversationId: string): Promise<ConversationDTO>;
  rename(userId: string, conversationId: string, name: string): Promise<ConversationDTO>;
  archive(userId: string, conversationId: string): Promise<void>;
  unarchive(userId: string, conversationId: string): Promise<void>;
  leave(userId: string, conversationId: string): Promise<void>;
  addMembers(userId: string, conversationId: string, userIds: string[]): Promise<ConversationDTO>;
  removeMember(userId: string, conversationId: string, memberId: string): Promise<void>;
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
  getParticipantIds(conversationId: string): Promise<string[]>;
  getUserConversationIds(userId: string): Promise<string[]>;
}
```

Substituir `src/modules/chat/interfaces/index.ts` por:

```ts
export type { IConversationRepository, ListForUserOptions } from './IConversationRepository';
export type { IParticipantRepository } from './IParticipantRepository';
export type { IMessageRepository } from './IMessageRepository';
export type { IConversationService } from './IConversationService';
```

`src/modules/chat/services/ConversationService.ts`:

```ts
import type { IContactService, IUserService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { userService } from '@/modules/user/services/UserService';
import type { PublicUserDTO } from '@/modules/user/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';
import { CHAT_CONSTANTS } from '../constants';
import {
  CannotConverseWithSelfException,
  ConversationBlockedException,
  ConversationNotFoundException,
  GroupOnlyOperationException,
  GroupParticipantLimitException,
  NotConversationAdminException,
  ParticipantNotFoundException,
  UsersNotFoundException,
} from '../errors';
import type {
  IConversationRepository,
  IConversationService,
  IParticipantRepository,
} from '../interfaces';
import { conversationRepository, participantRepository } from '../repositories';
import type {
  ConversationChange,
  ConversationDTO,
  ConversationListEntry,
  CreateDirectResult,
  CreateGroupDTO,
  ListConversationsOptions,
  PaginatedConversations,
  ParticipantAttributes,
} from '../types';

/** Chave única da conversa 1:1: `menorUuid:maiorUuid` (independe de quem iniciou). */
export function buildDirectKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

export class ConversationService implements IConversationService {
  constructor(
    private readonly conversations: IConversationRepository = conversationRepository,
    private readonly participants: IParticipantRepository = participantRepository,
    private readonly users: Pick<IUserService, 'exists' | 'getMultiple'> = userService,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

  async createDirect(userId: string, otherUserId: string): Promise<CreateDirectResult> {
    if (userId === otherUserId) {
      throw new CannotConverseWithSelfException();
    }

    if (!(await this.users.exists(otherUserId))) {
      throw new UsersNotFoundException([otherUserId]);
    }

    if (await this.contacts.isBlockedByEither(userId, otherUserId)) {
      throw new ConversationBlockedException();
    }

    const directKey = buildDirectKey(userId, otherUserId);
    const existing = await this.conversations.findByDirectKey(directKey);
    if (existing !== null) {
      return { conversation: await this.get(userId, existing.id), created: false };
    }

    const { conversation, created } = await this.conversations.createDirect({
      directKey,
      createdBy: userId,
      userIds: [userId, otherUserId],
    });

    if (created) {
      await this.events.publish(ChatEvents.CONVERSATION_CREATED, {
        conversationId: conversation.id,
        type: 'direct',
        creatorId: userId,
        participantIds: [userId, otherUserId],
      });
    }

    return { conversation: await this.get(userId, conversation.id), created };
  }

  async createGroup(
    userId: string,
    { name, participantIds }: CreateGroupDTO
  ): Promise<ConversationDTO> {
    const memberIds = [...new Set(participantIds)].filter((id) => id !== userId);

    if (memberIds.length + 1 > CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
      throw new GroupParticipantLimitException();
    }

    await this.ensureUsersExist(memberIds);

    const conversation = await this.conversations.createGroup({
      name,
      createdBy: userId,
      memberIds,
    });

    await this.events.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: conversation.id,
      type: 'group',
      creatorId: userId,
      participantIds: [userId, ...memberIds],
    });

    return this.get(userId, conversation.id);
  }

  async list(
    userId: string,
    options: ListConversationsOptions = {}
  ): Promise<PaginatedConversations> {
    const {
      archived = false,
      limit = CHAT_CONSTANTS.DEFAULT_CONVERSATION_LIMIT,
      offset = 0,
    } = options;
    const pageSize = Math.min(limit, CHAT_CONSTANTS.MAX_CONVERSATION_LIMIT);

    const page = await this.conversations.listForUser(userId, {
      archived,
      limit: pageSize,
      offset,
    });

    const participants = await this.participants.listByConversations(
      page.rows.map((row) => row.conversation.id)
    );
    const users = await this.users.getMultiple([...new Set(participants.map((p) => p.userId))]);

    const items = page.rows.map((entry) =>
      this.toDTO(
        entry,
        participants.filter((p) => p.conversationId === entry.conversation.id),
        users
      )
    );

    return {
      items,
      total: page.total,
      limit: pageSize,
      offset,
      hasMore: offset + page.rows.length < page.total,
    };
  }

  async get(userId: string, conversationId: string): Promise<ConversationDTO> {
    const context = await this.requireMembership(conversationId, userId);
    const participants = await this.participants.listByConversation(conversationId);
    const users = await this.users.getMultiple(participants.map((p) => p.userId));
    return this.toDTO(context, participants, users);
  }

  async rename(userId: string, conversationId: string, name: string): Promise<ConversationDTO> {
    const context = await this.requireMembership(conversationId, userId);
    this.assertGroupAdmin(context);

    await this.conversations.rename(conversationId, name);
    await this.publishUpdate(
      conversationId,
      'renamed',
      userId,
      await this.getParticipantIds(conversationId)
    );

    return this.get(userId, conversationId);
  }

  async archive(userId: string, conversationId: string): Promise<void> {
    await this.requireMembership(conversationId, userId);
    await this.participants.setArchivedAt(conversationId, userId, new Date());
  }

  async unarchive(userId: string, conversationId: string): Promise<void> {
    await this.requireMembership(conversationId, userId);
    await this.participants.setArchivedAt(conversationId, userId, null);
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    const { conversation } = await this.requireMembership(conversationId, userId);
    if (conversation.type !== 'group') {
      throw new GroupOnlyOperationException();
    }

    const remaining = await this.removeParticipant(conversationId, userId);
    await this.publishUpdate(conversationId, 'member_left', userId, [userId, ...remaining]);
  }

  async addMembers(
    userId: string,
    conversationId: string,
    userIds: string[]
  ): Promise<ConversationDTO> {
    const context = await this.requireMembership(conversationId, userId);
    this.assertGroupAdmin(context);

    const currentIds = await this.getParticipantIds(conversationId);
    const toAdd = [...new Set(userIds)].filter((id) => !currentIds.includes(id));

    if (currentIds.length + toAdd.length > CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
      throw new GroupParticipantLimitException();
    }

    await this.ensureUsersExist(toAdd);

    if (toAdd.length > 0) {
      await this.participants.addMembers(conversationId, toAdd);
      await this.publishUpdate(conversationId, 'members_added', userId, [...currentIds, ...toAdd]);
    }

    return this.get(userId, conversationId);
  }

  async removeMember(userId: string, conversationId: string, memberId: string): Promise<void> {
    if (memberId === userId) {
      await this.leave(userId, conversationId);
      return;
    }

    const context = await this.requireMembership(conversationId, userId);
    this.assertGroupAdmin(context);

    const target = await this.participants.find(conversationId, memberId);
    if (target === null) {
      throw new ParticipantNotFoundException();
    }

    const remaining = await this.removeParticipant(conversationId, memberId);
    await this.publishUpdate(conversationId, 'member_removed', userId, [memberId, ...remaining]);
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    return (await this.participants.find(conversationId, userId)) !== null;
  }

  async getParticipantIds(conversationId: string): Promise<string[]> {
    const participants = await this.participants.listByConversation(conversationId);
    return participants.map((p) => p.userId);
  }

  async getUserConversationIds(userId: string): Promise<string[]> {
    return this.participants.listConversationIdsByUser(userId);
  }

  /** Não participante recebe 404 — não revela a existência da conversa. */
  private async requireMembership(
    conversationId: string,
    userId: string
  ): Promise<ConversationListEntry> {
    const membership = await this.participants.find(conversationId, userId);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }

    const conversation = await this.conversations.findById(conversationId);
    if (conversation === null) {
      throw new ConversationNotFoundException();
    }

    return { conversation, membership };
  }

  private assertGroupAdmin({ conversation, membership }: ConversationListEntry): void {
    if (conversation.type !== 'group') {
      throw new GroupOnlyOperationException();
    }
    if (membership.role !== 'admin') {
      throw new NotConversationAdminException();
    }
  }

  private async ensureUsersExist(userIds: string[]): Promise<void> {
    const found = await this.users.getMultiple(userIds);
    const foundIds = new Set(found.map((user) => user.id));
    const missing = userIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new UsersNotFoundException(missing);
    }
  }

  /**
   * Remove o participante; se não restar ninguém, apaga a conversa; se não restar admin,
   * promove o participante mais antigo (`joined_at`). Retorna os ids restantes.
   */
  private async removeParticipant(conversationId: string, userId: string): Promise<string[]> {
    await this.participants.remove(conversationId, userId);
    const remaining = await this.participants.listByConversation(conversationId);

    const [oldest] = remaining;
    if (oldest === undefined) {
      await this.conversations.delete(conversationId);
      return [];
    }

    if (!remaining.some((p) => p.role === 'admin')) {
      await this.participants.setRole(conversationId, oldest.userId, 'admin');
    }

    return remaining.map((p) => p.userId);
  }

  private async publishUpdate(
    conversationId: string,
    change: ConversationChange,
    actorId: string,
    participantIds: string[]
  ): Promise<void> {
    await this.events.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId,
      change,
      actorId,
      participantIds,
    });
  }

  private toDTO(
    { conversation, membership }: ConversationListEntry,
    participants: ParticipantAttributes[],
    users: PublicUserDTO[]
  ): ConversationDTO {
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      avatarUrl: conversation.avatarUrl,
      createdBy: conversation.createdBy,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      participants: participants.flatMap((participant) => {
        const user = users.find((u) => u.id === participant.userId);
        return user === undefined
          ? []
          : [
              {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                role: participant.role,
              },
            ];
      }),
      membership: {
        role: membership.role,
        isMuted: membership.isMuted,
        archivedAt: membership.archivedAt,
      },
    };
  }
}

export const conversationService = new ConversationService();
```

`src/modules/chat/services/index.ts`:

```ts
export { ConversationService, conversationService, buildDirectKey } from './ConversationService';
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/services --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/services/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% em `ConversationService.ts` e `index.ts`.

- [ ] **Step 5: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write src/modules/chat/interfaces/IConversationService.ts src/modules/chat/interfaces/index.ts "src/modules/chat/services/*.ts" "tests/unit/modules/chat/services/*.ts"
node node_modules/.bin/eslint src
git add src/modules/chat/interfaces/IConversationService.ts src/modules/chat/interfaces/index.ts src/modules/chat/services tests/unit/modules/chat/services
git commit -m "✨ feat: adiciona ConversationService"
```

---

### Task 10: `MessageService`

**Files:**
- Create: `src/modules/chat/interfaces/IMessageService.ts`
- Modify: `src/modules/chat/interfaces/index.ts`
- Create: `src/modules/chat/services/MessageService.ts`
- Modify: `src/modules/chat/services/index.ts`
- Test: `tests/unit/modules/chat/services/MessageService.test.ts`
- Modify: `tests/unit/modules/chat/services/index.test.ts`

**Interfaces:**
- Consumes: `IMessageRepository` (Task 8), `IConversationRepository`/`IParticipantRepository` (Task 7), `IContactService.isBlockedByEither`, `EventBus.publish`.
- Produces:
  - `class MessageService implements IMessageService` com construtor `(messages = messageRepository, conversations = conversationRepository, participants = participantRepository, contacts: Pick<IContactService,'isBlockedByEither'> = contactService, events: Pick<EventBus,'publish'> = eventBus)`.
  - `IMessageService`: `send(userId, conversationId, { text, replyTo?, mentions? }: SendMessageDTO, metadata: MessageMetadata): Promise<MessageDTO>`, `list(userId, conversationId, { limit?, before? }?): Promise<PaginatedMessages>`, `delete(userId, conversationId, messageId): Promise<void>`.
  - Singleton `messageService`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/services/MessageService.test.ts`:

```ts
jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
  messageRepository: {},
}));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import {
  ConversationBlockedException,
  ConversationNotFoundException,
  InvalidMentionsException,
  MessageNotFoundException,
  NotMessageAuthorException,
} from '@/modules/chat/errors';
import type {
  IConversationRepository,
  IMessageRepository,
  IParticipantRepository,
} from '@/modules/chat/interfaces';
import { MessageService, messageService } from '@/modules/chat/services/MessageService';
import type {
  ConversationAttributes,
  MessageRecord,
  ParticipantAttributes,
} from '@/modules/chat/types';
import { ChatEvents } from '@/shared/types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MESSAGE_ID = '65f000000000000000000002';
const REPLY_ID = '65f000000000000000000001';
const CREATED_AT = new Date('2026-09-24T10:00:00.000Z');
const META = { ip: '127.0.0.1', device: 'jest' };

function conversation(overrides: Partial<ConversationAttributes> = {}): ConversationAttributes {
  return {
    id: CONVERSATION_ID,
    type: 'direct',
    name: null,
    avatarUrl: null,
    createdBy: USER_A,
    directKey: `${USER_A}:${USER_B}`,
    lastMessageAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function participant(userId: string): ParticipantAttributes {
  return {
    id: `p-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role: 'member',
    joinedAt: CREATED_AT,
    lastReadAt: null,
    isMuted: false,
    archivedAt: null,
  };
}

function record(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: USER_A,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [],
    metadata: META,
    deletedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('MessageService', () => {
  let messages: jest.Mocked<IMessageRepository>;
  let conversations: jest.Mocked<IConversationRepository>;
  let participants: jest.Mocked<IParticipantRepository>;
  let contacts: { isBlockedByEither: jest.Mock };
  let events: { publish: jest.Mock };
  let service: MessageService;

  beforeEach(() => {
    messages = {
      create: jest.fn(),
      findById: jest.fn(),
      findByConversation: jest.fn(),
      softDelete: jest.fn(),
    };
    conversations = {
      findById: jest.fn(),
      findByDirectKey: jest.fn(),
      createDirect: jest.fn(),
      createGroup: jest.fn(),
      listForUser: jest.fn(),
      rename: jest.fn(),
      touchLastMessageAt: jest.fn(),
      delete: jest.fn(),
    };
    participants = {
      find: jest.fn(),
      listByConversation: jest.fn(),
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
      setRole: jest.fn(),
      setArchivedAt: jest.fn(),
    };
    contacts = { isBlockedByEither: jest.fn().mockResolvedValue(false) };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new MessageService(messages, conversations, participants, contacts, events);
  });

  it('deve exportar a instância padrão', () => {
    expect(messageService).toBeInstanceOf(MessageService);
  });

  describe('send', () => {
    beforeEach(() => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);
      conversations.findById.mockResolvedValue(conversation());
    });

    it('deve persistir, atualizar last_message_at e publicar MESSAGE_SENT', async () => {
      messages.create.mockResolvedValue(record({ content: { type: 'text', text: 'olá' } }));

      const result = await service.send(USER_A, CONVERSATION_ID, { text: '  olá  ' }, META);

      expect(messages.create).toHaveBeenCalledWith({
        conversationId: CONVERSATION_ID,
        senderId: USER_A,
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [],
        metadata: META,
      });
      expect(conversations.touchLastMessageAt).toHaveBeenCalledWith(CONVERSATION_ID, CREATED_AT);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.MESSAGE_SENT, {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        conversationType: 'direct',
        senderId: USER_A,
        text: 'olá',
        mentions: [],
        replyTo: null,
        createdAt: CREATED_AT,
        participantIds: [USER_A, USER_B],
      });
      expect(result).toEqual({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        senderId: USER_A,
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [],
        deletedAt: null,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      expect(result).not.toHaveProperty('metadata');
    });

    it('deve responder 404 quando o remetente não participa', async () => {
      await expect(service.send(USER_C, CONVERSATION_ID, { text: 'oi' }, META)).rejects.toThrow(
        ConversationNotFoundException
      );
      expect(messages.create).not.toHaveBeenCalled();
    });

    it('deve responder 404 quando a conversa sumiu', async () => {
      conversations.findById.mockResolvedValue(null);

      await expect(service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('deve responder 403 em direct com bloqueio em qualquer sentido', async () => {
      contacts.isBlockedByEither.mockResolvedValue(true);

      await expect(service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META)).rejects.toThrow(
        ConversationBlockedException
      );
      expect(contacts.isBlockedByEither).toHaveBeenCalledWith(USER_A, USER_B);
      expect(messages.create).not.toHaveBeenCalled();
    });

    it('não deve consultar bloqueio em grupo', async () => {
      conversations.findById.mockResolvedValue(conversation({ type: 'group', name: 'Time' }));
      messages.create.mockResolvedValue(record());

      await service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META);

      expect(contacts.isBlockedByEither).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        ChatEvents.MESSAGE_SENT,
        expect.objectContaining({ conversationType: 'group' })
      );
    });

    it('não deve consultar bloqueio em direct sem o outro participante', async () => {
      participants.listByConversation.mockResolvedValue([participant(USER_A)]);
      messages.create.mockResolvedValue(record());

      await service.send(USER_A, CONVERSATION_ID, { text: 'oi' }, META);

      expect(contacts.isBlockedByEither).not.toHaveBeenCalled();
    });

    it('deve aceitar replyTo da mesma conversa', async () => {
      messages.findById.mockResolvedValue(record({ id: REPLY_ID }));
      messages.create.mockResolvedValue(record({ replyTo: REPLY_ID }));

      const result = await service.send(
        USER_A,
        CONVERSATION_ID,
        { text: 'resposta', replyTo: REPLY_ID },
        META
      );

      expect(messages.findById).toHaveBeenCalledWith(REPLY_ID);
      expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ replyTo: REPLY_ID }));
      expect(result.replyTo).toBe(REPLY_ID);
    });

    it('deve responder 404 para replyTo inexistente ou de outra conversa', async () => {
      messages.findById.mockResolvedValueOnce(null);
      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));

      await expect(
        service.send(USER_A, CONVERSATION_ID, { text: 'x', replyTo: REPLY_ID }, META)
      ).rejects.toThrow(MessageNotFoundException);
      await expect(
        service.send(USER_A, CONVERSATION_ID, { text: 'x', replyTo: REPLY_ID }, META)
      ).rejects.toThrow('Mensagem respondida não encontrada');
    });

    it('deve deduplicar mentions de participantes', async () => {
      messages.create.mockResolvedValue(record({ mentions: [USER_B] }));

      await service.send(USER_A, CONVERSATION_ID, { text: 'oi', mentions: [USER_B, USER_B] }, META);

      expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ mentions: [USER_B] }));
    });

    it('deve responder 400 para mention de não participante', async () => {
      await expect(
        service.send(USER_A, CONVERSATION_ID, { text: 'oi', mentions: [USER_C] }, META)
      ).rejects.toThrow(InvalidMentionsException);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_A));
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.list(USER_C, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });

    it('primeira página com 50 por padrão e nextCursor nulo quando não veio cheia', async () => {
      messages.findByConversation.mockResolvedValue([record()]);

      const result = await service.list(USER_A, CONVERSATION_ID);

      expect(messages.findByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        limit: 50,
        before: undefined,
      });
      expect(result.nextCursor).toBeNull();
      expect(result.messages).toHaveLength(1);
    });

    it('página cheia devolve nextCursor = id da última mensagem', async () => {
      messages.findByConversation.mockResolvedValue([
        record({ id: '65f000000000000000000003' }),
        record({ id: '65f000000000000000000002' }),
      ]);

      const result = await service.list(USER_A, CONVERSATION_ID, { limit: 2 });

      expect(result.nextCursor).toBe('65f000000000000000000002');
    });

    it('deve limitar a página a 50', async () => {
      messages.findByConversation.mockResolvedValue([]);

      await service.list(USER_A, CONVERSATION_ID, { limit: 500 });

      expect(messages.findByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        limit: 50,
        before: undefined,
      });
    });

    it('deve converter o cursor before em createdAt/_id', async () => {
      messages.findById.mockResolvedValue(record({ id: MESSAGE_ID }));
      messages.findByConversation.mockResolvedValue([]);

      await service.list(USER_A, CONVERSATION_ID, { limit: 2, before: MESSAGE_ID });

      expect(messages.findByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
        limit: 2,
        before: { createdAt: CREATED_AT, id: MESSAGE_ID },
      });
    });

    it('deve responder 404 para cursor inexistente ou de outra conversa', async () => {
      messages.findById.mockResolvedValueOnce(null);
      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));

      await expect(service.list(USER_A, CONVERSATION_ID, { before: MESSAGE_ID })).rejects.toThrow(
        MessageNotFoundException
      );
      await expect(service.list(USER_A, CONVERSATION_ID, { before: MESSAGE_ID })).rejects.toThrow(
        MessageNotFoundException
      );
    });

    it('mensagens apagadas voltam como tombstone', async () => {
      const deletedAt = new Date('2026-09-24T11:00:00.000Z');
      messages.findByConversation.mockResolvedValue([
        record({ deletedAt, mentions: [USER_B], replyTo: REPLY_ID }),
      ]);

      const result = await service.list(USER_A, CONVERSATION_ID);

      expect(result.messages[0]).toEqual(
        expect.objectContaining({
          id: MESSAGE_ID,
          content: null,
          mentions: [],
          replyTo: REPLY_ID,
          deletedAt,
        })
      );
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_A));
    });

    it('deve fazer soft delete e publicar MESSAGE_DELETED', async () => {
      messages.findById.mockResolvedValue(record());
      messages.softDelete.mockResolvedValue(true);

      await service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID);

      expect(messages.softDelete).toHaveBeenCalledWith(MESSAGE_ID, expect.any(Date));
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.MESSAGE_DELETED, {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedBy: USER_A,
      });
    });

    it('apagar de novo é idempotente e não publica', async () => {
      messages.findById.mockResolvedValue(record({ deletedAt: CREATED_AT }));
      messages.softDelete.mockResolvedValue(false);

      await expect(service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID)).resolves.toBeUndefined();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('deve responder 403 para quem não é o autor', async () => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());

      await expect(service.delete(USER_B, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        NotMessageAuthorException
      );
      expect(messages.softDelete).not.toHaveBeenCalled();
    });

    it('deve responder 404 para mensagem inexistente ou de outra conversa', async () => {
      messages.findById.mockResolvedValueOnce(null);
      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));

      await expect(service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );
      await expect(service.delete(USER_A, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.delete(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
  });
});
```

Substituir `tests/unit/modules/chat/services/index.test.ts` por:

```ts
jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
  messageRepository: {},
}));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import * as services from '@/modules/chat/services';

describe('chat services index', () => {
  it('deve exportar ConversationService, a instância padrão e buildDirectKey', () => {
    expect(services.conversationService).toBeInstanceOf(services.ConversationService);
    expect(typeof services.buildDirectKey).toBe('function');
  });

  it('deve exportar MessageService e a instância padrão', () => {
    expect(services.messageService).toBeInstanceOf(services.MessageService);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/services --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/services/MessageService'`.

- [ ] **Step 3: Implementar**

`src/modules/chat/interfaces/IMessageService.ts`:

```ts
import type {
  ListMessagesOptions,
  MessageDTO,
  MessageMetadata,
  PaginatedMessages,
  SendMessageDTO,
} from '../types';

export interface IMessageService {
  send(
    userId: string,
    conversationId: string,
    data: SendMessageDTO,
    metadata: MessageMetadata
  ): Promise<MessageDTO>;
  list(
    userId: string,
    conversationId: string,
    options?: ListMessagesOptions
  ): Promise<PaginatedMessages>;
  delete(userId: string, conversationId: string, messageId: string): Promise<void>;
}
```

Substituir `src/modules/chat/interfaces/index.ts` por:

```ts
export type { IConversationRepository, ListForUserOptions } from './IConversationRepository';
export type { IParticipantRepository } from './IParticipantRepository';
export type { IMessageRepository } from './IMessageRepository';
export type { IConversationService } from './IConversationService';
export type { IMessageService } from './IMessageService';
```

`src/modules/chat/services/MessageService.ts`:

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';
import { CHAT_CONSTANTS } from '../constants';
import {
  ConversationBlockedException,
  ConversationNotFoundException,
  InvalidMentionsException,
  MessageNotFoundException,
  NotMessageAuthorException,
} from '../errors';
import type {
  IConversationRepository,
  IMessageRepository,
  IMessageService,
  IParticipantRepository,
} from '../interfaces';
import { conversationRepository, messageRepository, participantRepository } from '../repositories';
import type {
  ListMessagesOptions,
  MessageCursor,
  MessageDTO,
  MessageMetadata,
  MessageRecord,
  PaginatedMessages,
  SendMessageDTO,
} from '../types';

/** Mensagem apagada vira tombstone: mantém id/datas (preserva threads), esconde o conteúdo. */
function toMessageDTO(record: MessageRecord): MessageDTO {
  const deleted = record.deletedAt !== null;
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    content: deleted ? null : record.content,
    replyTo: record.replyTo,
    mentions: deleted ? [] : record.mentions,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class MessageService implements IMessageService {
  constructor(
    private readonly messages: IMessageRepository = messageRepository,
    private readonly conversations: IConversationRepository = conversationRepository,
    private readonly participants: IParticipantRepository = participantRepository,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

  async send(
    userId: string,
    conversationId: string,
    data: SendMessageDTO,
    metadata: MessageMetadata
  ): Promise<MessageDTO> {
    const members = await this.participants.listByConversation(conversationId);
    const participantIds = members.map((member) => member.userId);
    if (!participantIds.includes(userId)) {
      throw new ConversationNotFoundException();
    }

    const conversation = await this.conversations.findById(conversationId);
    if (conversation === null) {
      throw new ConversationNotFoundException();
    }

    if (conversation.type === 'direct') {
      const otherId = participantIds.find((id) => id !== userId);
      if (otherId !== undefined && (await this.contacts.isBlockedByEither(userId, otherId))) {
        throw new ConversationBlockedException();
      }
    }

    const replyTo = data.replyTo ?? null;
    if (replyTo !== null) {
      const original = await this.messages.findById(replyTo);
      if (original?.conversationId !== conversationId) {
        throw new MessageNotFoundException('Mensagem respondida não encontrada');
      }
    }

    const mentions = [...new Set(data.mentions ?? [])];
    if (mentions.some((id) => !participantIds.includes(id))) {
      throw new InvalidMentionsException();
    }

    const record = await this.messages.create({
      conversationId,
      senderId: userId,
      content: { type: 'text', text: data.text.trim() },
      replyTo,
      mentions,
      metadata,
    });

    await this.conversations.touchLastMessageAt(conversationId, record.createdAt);

    await this.events.publish(ChatEvents.MESSAGE_SENT, {
      messageId: record.id,
      conversationId,
      conversationType: conversation.type,
      senderId: userId,
      text: record.content.text,
      mentions: record.mentions,
      replyTo: record.replyTo,
      createdAt: record.createdAt,
      participantIds,
    });

    return toMessageDTO(record);
  }

  async list(
    userId: string,
    conversationId: string,
    options: ListMessagesOptions = {}
  ): Promise<PaginatedMessages> {
    await this.requireParticipant(conversationId, userId);

    const pageSize = Math.min(
      options.limit ?? CHAT_CONSTANTS.MESSAGE_PAGE_SIZE,
      CHAT_CONSTANTS.MESSAGE_PAGE_SIZE
    );

    let before: MessageCursor | undefined;
    if (options.before !== undefined) {
      const cursor = await this.messages.findById(options.before);
      if (cursor?.conversationId !== conversationId) {
        throw new MessageNotFoundException();
      }
      before = { createdAt: cursor.createdAt, id: cursor.id };
    }

    const records = await this.messages.findByConversation(conversationId, {
      limit: pageSize,
      before,
    });

    // nextCursor = id da última mensagem da página, apenas quando a página veio cheia.
    const nextCursor =
      records.length === pageSize
        ? records.reduce<string | null>((_last, record) => record.id, null)
        : null;

    return { messages: records.map(toMessageDTO), nextCursor };
  }

  async delete(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.requireParticipant(conversationId, userId);

    const message = await this.messages.findById(messageId);
    if (message?.conversationId !== conversationId) {
      throw new MessageNotFoundException();
    }

    if (message.senderId !== userId) {
      throw new NotMessageAuthorException();
    }

    const deleted = await this.messages.softDelete(messageId, new Date());
    if (deleted) {
      await this.events.publish(ChatEvents.MESSAGE_DELETED, {
        messageId,
        conversationId,
        deletedBy: userId,
      });
    }
  }

  private async requireParticipant(conversationId: string, userId: string): Promise<void> {
    const membership = await this.participants.find(conversationId, userId);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }
  }
}

export const messageService = new MessageService();
```

Substituir `src/modules/chat/services/index.ts` por:

```ts
export { ConversationService, conversationService, buildDirectKey } from './ConversationService';
export { MessageService, messageService } from './MessageService';
```

Notas: o texto chega já validado/trimado pelo schema (Task 12); o service apenas aplica `trim()` de novo por segurança. `nextCursor` usa `reduce` para pegar o id da última mensagem sem criar branch inalcançável (mantém 100% de branches).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/services --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/services/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% em `MessageService.ts`, `ConversationService.ts` e `index.ts`.

- [ ] **Step 5: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write src/modules/chat/interfaces/IMessageService.ts src/modules/chat/interfaces/index.ts "src/modules/chat/services/*.ts" "tests/unit/modules/chat/services/*.ts"
node node_modules/.bin/eslint src
git add src/modules/chat/interfaces/IMessageService.ts src/modules/chat/interfaces/index.ts src/modules/chat/services tests/unit/modules/chat/services
git commit -m "✨ feat: adiciona MessageService"
```

---
### Task 11: Contatos por última interação (RF002.2) + listener de `MESSAGE_SENT`

**Files:**
- Create: `src/database/migrations/20260924000300-add-last-interaction-at-to-contacts.ts`
- Modify: `src/modules/user/types/contact.types.ts`, `src/modules/user/models/Contact.ts`
- Modify: `src/modules/user/interfaces/IContactRepository.ts`, `src/modules/user/interfaces/IContactService.ts`
- Modify: `src/modules/user/repositories/ContactRepository.ts` (ordem `lastInteraction` + `touchInteraction`)
- Modify: `src/modules/user/services/ContactService.ts` (`recordInteraction`)
- Create: `src/modules/chat/listeners/chat.listeners.ts`, `src/modules/chat/listeners/index.ts`
- Modify: `tests/unit/modules/user/repositories/ContactRepository.test.ts`, `tests/unit/modules/user/services/ContactService.test.ts`, `tests/unit/modules/user/models/Contact.test.ts`, `tests/unit/modules/user/types/contact.types.test.ts`, `tests/unit/modules/user/controllers/ContactController.test.ts`
- Test: `tests/unit/modules/chat/listeners/chat.listeners.test.ts`

**Interfaces:**
- Consumes: payload de `ChatEvents.MESSAGE_SENT` (Task 1); `ContactModelAttributes` (Task 2).
- Produces:
  - `ContactModelAttributes.lastInteractionAt: Date | null` (coluna `last_interaction_at`, interna — fora do `toJSON`).
  - `IContactRepository.touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void>` — atualiza as linhas dos dois sentidos (se existirem), com `silent: true` (não mexe em `updated_at`).
  - `IContactService.recordInteraction(userId: string, otherUserId: string): Promise<void>`.
  - `ContactRepository.findAllByUser` com `orderBy: 'lastInteraction'` → `order: [['lastInteractionAt', '<ASC|DESC> NULLS LAST'], ['createdAt', 'DESC']]` (hoje o valor passa na validação e quebra o SQL — bug corrigido).
  - `registerChatListeners(bus?: Pick<EventBus,'subscribe'>, contacts?: Pick<IContactService,'recordInteraction'>): () => void` — em `MESSAGE_SENT` de conversa `direct`, chama `recordInteraction(senderId, outroParticipante)`; retorna função que cancela as inscrições.

- [ ] **Step 1: Escrever os testes que falham (módulo user)**

Em `tests/unit/modules/user/repositories/ContactRepository.test.ts`:

1. Acrescentar `import { Op } from 'sequelize';` logo após `import { UserStatus } from '@/shared/types';`.
2. Na lista `methods` do teste `'deve implementar todos os métodos da interface'`, acrescentar `'touchInteraction',` depois de `'unblock',`.
3. Dentro de `describe('findAllByUser')`, inserir imediatamente antes de `it('deve filtrar por isBlocked', …)`:

```ts
    it('deve ordenar por última interação (NULLS LAST) desempatando por createdAt', async () => {
      MockContact.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as any);

      await repository.findAllByUser('user-123', { orderBy: 'lastInteraction', order: 'DESC' });

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [
            ['lastInteractionAt', 'DESC NULLS LAST'],
            ['createdAt', 'DESC'],
          ],
        })
      );
    });

    it('deve respeitar ASC na ordenação por última interação', async () => {
      MockContact.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as any);

      await repository.findAllByUser('user-123', { orderBy: 'lastInteraction', order: 'ASC' });

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [
            ['lastInteractionAt', 'ASC NULLS LAST'],
            ['createdAt', 'DESC'],
          ],
        })
      );
    });

    it('deve repassar orderBy nickname diretamente', async () => {
      MockContact.findAndCountAll.mockResolvedValue({ count: 0, rows: [] } as any);

      await repository.findAllByUser('user-123', { orderBy: 'nickname', order: 'ASC' });

      expect(MockContact.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ order: [['nickname', 'ASC']] })
      );
    });
```

4. Acrescentar ao final do `describe('ContactRepository')` (antes do `});` final do arquivo):

```ts
  describe('touchInteraction', () => {
    it('deve atualizar last_interaction_at nos dois sentidos sem alterar updated_at', async () => {
      const at = new Date('2026-09-24T10:00:00.000Z');
      MockContact.update.mockResolvedValue([2] as any);

      await repository.touchInteraction('user-123', 'contact-456', at);

      expect(MockContact.update).toHaveBeenCalledWith(
        { lastInteractionAt: at },
        {
          where: {
            [Op.or]: [
              { userId: 'user-123', contactId: 'contact-456' },
              { userId: 'contact-456', contactId: 'user-123' },
            ],
          },
          silent: true,
        }
      );
    });
  });
```

Em `tests/unit/modules/user/services/ContactService.test.ts`, acrescentar `touchInteraction: jest.fn(),` depois de `unblock: jest.fn(),` no mock de `contactRepository` da factory e, ao final do `describe('ContactService')` (antes do `});` final):

```ts
  describe('recordInteraction', () => {
    it('deve registrar a interação com a data atual', async () => {
      mockContactRepository.touchInteraction.mockResolvedValue(undefined);

      await contactService.recordInteraction('user-123', 'contact-456');

      expect(mockContactRepository.touchInteraction).toHaveBeenCalledWith(
        'user-123',
        'contact-456',
        expect.any(Date)
      );
    });
  });
```

Em `tests/unit/modules/user/models/Contact.test.ts`, dentro de `describe('atributos')`, depois do teste de `created_by_block`:

```ts
    it('deve declarar last_interaction_at como coluna interna anulável', () => {
      const contact = Contact.build(
        { userId: 'user-123', contactId: 'user-456' },
        { isNewRecord: false }
      );
      contact.setDataValue('lastInteractionAt', new Date('2026-09-24T00:00:00.000Z'));

      expect(Contact.getAttributes().lastInteractionAt.field).toBe('last_interaction_at');
      expect(Contact.getAttributes().lastInteractionAt.allowNull).toBe(true);
      expect(contact.toJSON()).not.toHaveProperty('lastInteractionAt');
    });
```

Em `tests/unit/modules/user/types/contact.types.test.ts`, no literal `ContactModelAttributes` do teste `'deve estender ContactAttributes com o campo interno createdByBlock'`, acrescentar `lastInteractionAt: null,` logo após `createdByBlock: true,`.

Em `tests/unit/modules/user/controllers/ContactController.test.ts`, na função `createService()`, acrescentar `recordInteraction: jest.fn(),` logo após `getStats: jest.fn(),` (o tipo `jest.Mocked<IContactService>` exige o novo método).

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user --coverage=false`
Expected: FAIL — `touchInteraction`/`recordInteraction` inexistentes; ordenação `lastInteraction` ainda gera `[['lastInteraction', 'DESC']]`; atributo `lastInteractionAt` ausente no model.

- [ ] **Step 3: Implementar (módulo user)**

Criar `src/database/migrations/20260924000300-add-last-interaction-at-to-contacts.ts`:

```ts
import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('contacts', 'last_interaction_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await queryInterface.addIndex('contacts', ['user_id', 'last_interaction_at'], {
    name: 'contacts_user_last_interaction_index',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('contacts', 'contacts_user_last_interaction_index');
  await queryInterface.removeColumn('contacts', 'last_interaction_at');
}
```

Em `src/modules/user/types/contact.types.ts`, `ContactModelAttributes` passa a ser:

```ts
export interface ContactModelAttributes extends ContactAttributes {
  createdByBlock: boolean;
  lastInteractionAt: Date | null;
}
```

Em `src/modules/user/models/Contact.ts`:
1. Acrescentar `declare lastInteractionAt: Date | null;` logo após `declare createdByBlock: boolean;`.
2. Em `Contact.init`, logo após o atributo `createdByBlock: { … field: 'created_by_block', },`, acrescentar:

```ts
    lastInteractionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_interaction_at',
    },
```

(`toJSON()` não muda — o campo é interno.)

Em `src/modules/user/interfaces/IContactRepository.ts`, acrescentar após `unblock(...)`:

```ts
  /** Grava `last_interaction_at` nas linhas de contato dos dois sentidos, se existirem. */
  touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void>;
```

Em `src/modules/user/interfaces/IContactService.ts`, acrescentar após `getStats(userId: string): Promise<ContactStats>;`:

```ts
  recordInteraction(userId: string, otherUserId: string): Promise<void>;
```

Em `src/modules/user/services/ContactService.ts`, acrescentar logo após o método `getStats`:

```ts
  async recordInteraction(userId: string, otherUserId: string): Promise<void> {
    await this.contacts.touchInteraction(userId, otherUserId, new Date());
  }
```

Em `src/modules/user/repositories/ContactRepository.ts`:
1. Trocar `import { Op } from 'sequelize';` por `import { Op, type Order } from 'sequelize';`.
2. Logo após a linha `export type { IContactRepository } from '../interfaces';`, acrescentar:

```ts
/**
 * `lastInteraction` não é coluna: mapeia para `last_interaction_at` com NULLS LAST (quem nunca
 * conversou vai para o fim) e desempata pelos contatos mais recentes.
 */
function buildContactOrder(
  orderBy: NonNullable<ContactListOptions['orderBy']>,
  order: NonNullable<ContactListOptions['order']>
): Order {
  if (orderBy === 'lastInteraction') {
    return [
      ['lastInteractionAt', `${order} NULLS LAST`],
      ['createdAt', 'DESC'],
    ];
  }
  return [[orderBy, order]];
}
```

3. Em `findAllByUser`, trocar `order: [[orderBy, order]],` por `order: buildContactOrder(orderBy, order),`.
4. Acrescentar como último método da classe (depois de `unblock`):

```ts
  async touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void> {
    await Contact.update(
      { lastInteractionAt: at },
      {
        where: {
          [Op.or]: [
            { userId, contactId: otherUserId },
            { userId: otherUserId, contactId: userId },
          ],
        },
        silent: true,
      }
    );
  }
```

- [ ] **Step 4: Rodar e confirmar que passa (módulo user)**

Run: `node node_modules/.bin/jest tests/unit/modules/user tests/feature/modules/user --coverage=false && node node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Escrever o teste que falha (listener)**

`tests/unit/modules/chat/listeners/chat.listeners.test.ts`:

```ts
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import { registerChatListeners } from '@/modules/chat/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { ChatEvents } from '@/shared/types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

function messageSent(
  overrides: Partial<EventPayload<ChatEvents.MESSAGE_SENT>> = {}
): EventPayload<ChatEvents.MESSAGE_SENT> {
  return {
    messageId: '65f000000000000000000001',
    conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    conversationType: 'direct',
    senderId: USER_A,
    text: 'oi',
    mentions: [],
    replyTo: null,
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    participantIds: [USER_A, USER_B],
    ...overrides,
  };
}

describe('registerChatListeners', () => {
  let bus: EventBus;
  let contacts: { recordInteraction: jest.Mock };

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    contacts = { recordInteraction: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('deve registrar a interação entre remetente e destinatário em conversa direct', async () => {
    registerChatListeners(bus, contacts);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());

    expect(contacts.recordInteraction).toHaveBeenCalledWith(USER_A, USER_B);
  });

  it('deve ignorar mensagens de grupo', async () => {
    registerChatListeners(bus, contacts);

    await bus.publish(
      ChatEvents.MESSAGE_SENT,
      messageSent({ conversationType: 'group', participantIds: [USER_A, USER_B, USER_C] })
    );

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve ignorar direct sem outro participante', async () => {
    registerChatListeners(bus, contacts);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent({ participantIds: [USER_A] }));

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve cancelar as inscrições com a função retornada', async () => {
    const unregister = registerChatListeners(bus, contacts);

    unregister();
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_SENT)).toBe(false);
  });

  it('deve usar o eventBus e o contactService padrão quando nada é injetado', () => {
    const unregister = registerChatListeners();

    expect(typeof unregister).toBe('function');
    unregister();
  });
});
```

Run: `node node_modules/.bin/jest tests/unit/modules/chat/listeners --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/listeners'`.

- [ ] **Step 6: Implementar o listener**

`src/modules/chat/listeners/chat.listeners.ts`:

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';

/**
 * Registra os subscribers do módulo de chat no EventBus. Chamado no bootstrap (após as
 * conexões); retorna uma função que cancela todas as inscrições.
 *
 * - MESSAGE_SENT em conversa direct → atualiza `last_interaction_at` dos contatos (RF002.2).
 */
export function registerChatListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  contacts: Pick<IContactService, 'recordInteraction'> = contactService
): () => void {
  const unsubscribers = [
    bus.subscribe(ChatEvents.MESSAGE_SENT, async ({ payload }) => {
      if (payload.conversationType !== 'direct') {
        return;
      }
      const otherId = payload.participantIds.find((id) => id !== payload.senderId);
      if (otherId === undefined) {
        return;
      }
      await contacts.recordInteraction(payload.senderId, otherId);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

`src/modules/chat/listeners/index.ts`:

```ts
export { registerChatListeners } from './chat.listeners';
```

- [ ] **Step 7: Rodar e confirmar 100% nos arquivos tocados**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/listeners tests/unit/modules/user --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/listeners/*.ts' --collectCoverageFrom='src/modules/user/**/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% em todas as linhas da tabela.

- [ ] **Step 8: Verificar, formatar e commitar (dois commits)**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write src/database/migrations/20260924000300-add-last-interaction-at-to-contacts.ts src/modules/user/types/contact.types.ts src/modules/user/models/Contact.ts src/modules/user/interfaces/IContactRepository.ts src/modules/user/interfaces/IContactService.ts src/modules/user/repositories/ContactRepository.ts src/modules/user/services/ContactService.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/models/Contact.test.ts tests/unit/modules/user/types/contact.types.test.ts tests/unit/modules/user/controllers/ContactController.test.ts "src/modules/chat/listeners/*.ts" tests/unit/modules/chat/listeners/chat.listeners.test.ts
node node_modules/.bin/eslint src
git add src/database/migrations/20260924000300-add-last-interaction-at-to-contacts.ts src/modules/user/types/contact.types.ts src/modules/user/models/Contact.ts src/modules/user/interfaces/IContactRepository.ts src/modules/user/interfaces/IContactService.ts src/modules/user/repositories/ContactRepository.ts src/modules/user/services/ContactService.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts tests/unit/modules/user/models/Contact.test.ts tests/unit/modules/user/types/contact.types.test.ts tests/unit/modules/user/controllers/ContactController.test.ts
git commit -m "🐛 fix: ordena contatos por última interação (last_interaction_at, NULLS LAST)"
git add src/modules/chat/listeners tests/unit/modules/chat/listeners
git commit -m "✨ feat: registra interação de contatos a cada mensagem direta"
```

---

### Task 12: Schemas Zod e controllers do chat

**Files:**
- Create: `src/modules/chat/validation/chat.schemas.ts`, `src/modules/chat/validation/index.ts`
- Create: `src/modules/chat/controllers/params.ts`, `src/modules/chat/controllers/ConversationController.ts`, `src/modules/chat/controllers/MessageController.ts`, `src/modules/chat/controllers/index.ts`
- Test: `tests/unit/modules/chat/validation/chat.schemas.test.ts`, `tests/unit/modules/chat/controllers/ConversationController.test.ts`, `tests/unit/modules/chat/controllers/MessageController.test.ts`, `tests/unit/modules/chat/controllers/index.test.ts`

**Interfaces:**
- Consumes: `IConversationService`/`conversationService` (Task 9), `IMessageService`/`messageService` (Task 10), `getAuthenticatedUserId`/`sendValidationError` (`@/shared/http/controller.helpers`), `HttpStatus` (`@/shared/errors`).
- Produces:
  - Schemas: `conversationIdParamSchema {id}`, `memberParamSchema {id, userId}`, `messageParamSchema {id, messageId}`, `createDirectConversationSchema {userId}`, `createGroupConversationSchema {name, participantIds}`, `renameConversationSchema {name}`, `addMembersSchema {userIds}`, `listConversationsQuerySchema {archived=false, limit=20 (1..100), offset=0}`, `listMessagesQuerySchema {limit=50 (1..50), before?}`, `sendMessageSchema {text (trim, 1..10000), replyTo?, mentions? (≤256)}`. UUIDs normalizados para minúsculas; ObjectIds = 24 hex.
  - `parseConversationId(req, res): string | null` (responde 400 e retorna `null` se `:id` inválido).
  - `ConversationController` (métodos `createDirect` 201/200, `createGroup` 201, `list` 200, `get` 200, `rename` 200, `archive` 204, `unarchive` 204, `leave` 204, `addMembers` 200, `removeMember` 204) e `MessageController` (`list` 200, `send` 201 com metadados `{ ip: req.ip ?? null, device: user-agent truncado em 255 ou null }`, `delete` 204); instâncias `conversationController`/`messageController`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/validation/chat.schemas.test.ts`:

```ts
import {
  addMembersSchema,
  conversationIdParamSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  memberParamSchema,
  messageParamSchema,
  renameConversationSchema,
  sendMessageSchema,
} from '@/modules/chat/validation';

const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';

describe('chat.schemas', () => {
  describe('params', () => {
    it('conversationIdParamSchema aceita UUID v4 e normaliza para minúsculas', () => {
      const parsed = conversationIdParamSchema.parse({ id: CONVERSATION_ID.toUpperCase() });
      expect(parsed.id).toBe(CONVERSATION_ID);
      expect(conversationIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });

    it('memberParamSchema exige id e userId UUID', () => {
      expect(memberParamSchema.safeParse({ id: CONVERSATION_ID, userId: USER_A }).success).toBe(
        true
      );
      expect(memberParamSchema.safeParse({ id: CONVERSATION_ID, userId: 'x' }).success).toBe(false);
    });

    it('messageParamSchema exige messageId ObjectId (24 hex)', () => {
      expect(
        messageParamSchema.safeParse({ id: CONVERSATION_ID, messageId: MESSAGE_ID }).success
      ).toBe(true);
      expect(
        messageParamSchema.safeParse({ id: CONVERSATION_ID, messageId: 'not-an-id' }).success
      ).toBe(false);
    });
  });

  describe('createDirectConversationSchema', () => {
    it('aceita userId UUID', () => {
      expect(createDirectConversationSchema.parse({ userId: USER_A })).toEqual({ userId: USER_A });
    });

    it('rejeita userId ausente ou inválido', () => {
      expect(createDirectConversationSchema.safeParse({}).success).toBe(false);
      expect(createDirectConversationSchema.safeParse({ userId: '123' }).success).toBe(false);
    });
  });

  describe('createGroupConversationSchema / renameConversationSchema', () => {
    it('aceita nome com trim e participantes', () => {
      expect(
        createGroupConversationSchema.parse({ name: '  Time  ', participantIds: [USER_A] })
      ).toEqual({ name: 'Time', participantIds: [USER_A] });
    });

    it('rejeita nome vazio (após trim) ou acima de 100 caracteres', () => {
      expect(renameConversationSchema.safeParse({ name: '   ' }).success).toBe(false);
      expect(renameConversationSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
      expect(renameConversationSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true);
    });

    it('rejeita lista de participantes vazia, com id inválido ou acima de 256', () => {
      expect(
        createGroupConversationSchema.safeParse({ name: 'T', participantIds: [] }).success
      ).toBe(false);
      expect(
        createGroupConversationSchema.safeParse({ name: 'T', participantIds: ['x'] }).success
      ).toBe(false);
      expect(
        createGroupConversationSchema.safeParse({
          name: 'T',
          participantIds: Array.from({ length: 257 }, () => USER_A),
        }).success
      ).toBe(false);
    });
  });

  describe('addMembersSchema', () => {
    it('exige ao menos um userId UUID', () => {
      expect(addMembersSchema.safeParse({ userIds: [USER_A] }).success).toBe(true);
      expect(addMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
    });
  });

  describe('listConversationsQuerySchema', () => {
    it('aplica defaults', () => {
      expect(listConversationsQuerySchema.parse({})).toEqual({
        archived: false,
        limit: 20,
        offset: 0,
      });
    });

    it('converte strings da query', () => {
      expect(
        listConversationsQuerySchema.parse({ archived: 'true', limit: '5', offset: '10' })
      ).toEqual({ archived: true, limit: 5, offset: 10 });
      expect(listConversationsQuerySchema.parse({ archived: 'false' }).archived).toBe(false);
    });

    it('rejeita valores fora do intervalo', () => {
      expect(listConversationsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
      expect(listConversationsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
      expect(listConversationsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
      expect(listConversationsQuerySchema.safeParse({ archived: 'yes' }).success).toBe(false);
    });
  });

  describe('listMessagesQuerySchema', () => {
    it('usa 50 por padrão e aceita cursor before', () => {
      expect(listMessagesQuerySchema.parse({})).toEqual({ limit: 50 });
      expect(listMessagesQuerySchema.parse({ limit: '2', before: MESSAGE_ID })).toEqual({
        limit: 2,
        before: MESSAGE_ID,
      });
    });

    it('rejeita limit acima de 50 e cursor inválido', () => {
      expect(listMessagesQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
      expect(listMessagesQuerySchema.safeParse({ before: 'abc' }).success).toBe(false);
    });
  });

  describe('sendMessageSchema', () => {
    it('faz trim do texto e aceita replyTo/mentions', () => {
      expect(
        sendMessageSchema.parse({ text: '  oi  ', replyTo: MESSAGE_ID, mentions: [USER_A] })
      ).toEqual({ text: 'oi', replyTo: MESSAGE_ID, mentions: [USER_A] });
    });

    it('rejeita texto vazio, só espaços ou acima de 10.000 caracteres', () => {
      expect(sendMessageSchema.safeParse({ text: '' }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: '   ' }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: 'a'.repeat(10_001) }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: 'a'.repeat(10_000) }).success).toBe(true);
    });

    it('rejeita replyTo e mentions inválidos', () => {
      expect(sendMessageSchema.safeParse({ text: 'oi', replyTo: 'x' }).success).toBe(false);
      expect(sendMessageSchema.safeParse({ text: 'oi', mentions: ['x'] }).success).toBe(false);
    });
  });
});
```

`tests/unit/modules/chat/controllers/ConversationController.test.ts`:

```ts
jest.mock('@/modules/chat/services/ConversationService', () => ({
  conversationService: {},
}));

import type { Request, Response } from 'express';
import { ConversationController } from '@/modules/chat/controllers/ConversationController';
import type { IConversationService } from '@/modules/chat/interfaces';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DTO = { id: CONVERSATION_ID };

function createService(): jest.Mocked<IConversationService> {
  return {
    createDirect: jest.fn(),
    createGroup: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    rename: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    leave: jest.fn(),
    addMembers: jest.fn(),
    removeMember: jest.fn(),
    isParticipant: jest.fn(),
    getParticipantIds: jest.fn(),
    getUserConversationIds: jest.fn(),
  };
}

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: USER_A, email: 'a@b.com', username: 'ana' },
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('ConversationController', () => {
  let service: jest.Mocked<IConversationService>;
  let controller: ConversationController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new ConversationController(service);
    res = createRes();
  });

  it('deve usar o conversationService padrão quando nada é injetado', () => {
    expect(new ConversationController()).toBeInstanceOf(ConversationController);
  });

  it('deve propagar 401 quando não há usuário autenticado', async () => {
    await expect(controller.list(createReq({ user: undefined }), res)).rejects.toThrow(
      UnauthorizedError
    );
  });

  describe('createDirect', () => {
    it('deve responder 201 quando a conversa foi criada', async () => {
      service.createDirect.mockResolvedValue({ conversation: DTO as never, created: true });

      await controller.createDirect(createReq({ body: { userId: USER_B } }), res);

      expect(service.createDirect).toHaveBeenCalledWith(USER_A, USER_B);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: DTO });
    });

    it('deve responder 200 quando a conversa já existia', async () => {
      service.createDirect.mockResolvedValue({ conversation: DTO as never, created: false });

      await controller.createDirect(createReq({ body: { userId: USER_B } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para userId inválido', async () => {
      await controller.createDirect(createReq({ body: { userId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.createDirect).not.toHaveBeenCalled();
    });
  });

  describe('createGroup', () => {
    it('deve responder 201 com o grupo criado', async () => {
      service.createGroup.mockResolvedValue(DTO as never);

      await controller.createGroup(
        createReq({ body: { name: ' Time ', participantIds: [USER_B] } }),
        res
      );

      expect(service.createGroup).toHaveBeenCalledWith(USER_A, {
        name: 'Time',
        participantIds: [USER_B],
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('deve responder 400 para corpo inválido', async () => {
      await controller.createGroup(createReq({ body: { name: '' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });

  describe('list', () => {
    it('deve converter a query e responder 200', async () => {
      const page = { items: [], total: 0, limit: 5, offset: 0, hasMore: false };
      service.list.mockResolvedValue(page);

      await controller.list(createReq({ query: { archived: 'true', limit: '5' } }), res);

      expect(service.list).toHaveBeenCalledWith(USER_A, { archived: true, limit: 5, offset: 0 });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: page });
    });

    it('deve responder 400 para query inválida', async () => {
      await controller.list(createReq({ query: { limit: '0' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });

  describe('get', () => {
    it('deve responder 200 com a conversa', async () => {
      service.get.mockResolvedValue(DTO as never);

      await controller.get(createReq({ params: { id: CONVERSATION_ID } }), res);

      expect(service.get).toHaveBeenCalledWith(USER_A, CONVERSATION_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para id inválido', async () => {
      await controller.get(createReq({ params: { id: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.get).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('deve responder 200 com a conversa renomeada', async () => {
      service.rename.mockResolvedValue(DTO as never);

      await controller.rename(
        createReq({ params: { id: CONVERSATION_ID }, body: { name: 'Novo' } }),
        res
      );

      expect(service.rename).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, 'Novo');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para id ou nome inválidos', async () => {
      await controller.rename(createReq({ params: { id: 'x' }, body: { name: 'Novo' } }), res);
      await controller.rename(createReq({ params: { id: CONVERSATION_ID }, body: {} }), res);

      expect(res.status).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.rename).not.toHaveBeenCalled();
    });
  });

  describe.each(['archive', 'unarchive', 'leave'] as const)('%s', (method) => {
    it('deve responder 204', async () => {
      service[method].mockResolvedValue(undefined);

      await controller[method](createReq({ params: { id: CONVERSATION_ID } }), res);

      expect(service[method]).toHaveBeenCalledWith(USER_A, CONVERSATION_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 para id inválido', async () => {
      await controller[method](createReq({ params: { id: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service[method]).not.toHaveBeenCalled();
    });
  });

  describe('addMembers', () => {
    it('deve responder 200 com a conversa atualizada', async () => {
      service.addMembers.mockResolvedValue(DTO as never);

      await controller.addMembers(
        createReq({ params: { id: CONVERSATION_ID }, body: { userIds: [USER_B] } }),
        res
      );

      expect(service.addMembers).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, [USER_B]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para id ou corpo inválidos', async () => {
      await controller.addMembers(
        createReq({ params: { id: 'x' }, body: { userIds: [USER_B] } }),
        res
      );
      await controller.addMembers(
        createReq({ params: { id: CONVERSATION_ID }, body: { userIds: [] } }),
        res
      );

      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.addMembers).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('deve responder 204', async () => {
      service.removeMember.mockResolvedValue(undefined);

      await controller.removeMember(
        createReq({ params: { id: CONVERSATION_ID, userId: USER_B } }),
        res
      );

      expect(service.removeMember).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, USER_B);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    });

    it('deve responder 400 para params inválidos', async () => {
      await controller.removeMember(
        createReq({ params: { id: CONVERSATION_ID, userId: 'x' } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });
});
```

`tests/unit/modules/chat/controllers/MessageController.test.ts`:

```ts
jest.mock('@/modules/chat/services/MessageService', () => ({
  messageService: {},
}));

import type { Request, Response } from 'express';
import { MessageController } from '@/modules/chat/controllers/MessageController';
import type { IMessageService } from '@/modules/chat/interfaces';
import { HttpStatus } from '@/shared/errors';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';

function createService(): jest.Mocked<IMessageService> {
  return { send: jest.fn(), list: jest.fn(), delete: jest.fn() };
}

function createReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { id: USER_A, email: 'a@b.com', username: 'ana' },
    params: { id: CONVERSATION_ID },
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('MessageController', () => {
  let service: jest.Mocked<IMessageService>;
  let controller: MessageController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new MessageController(service);
    res = createRes();
  });

  it('deve usar o messageService padrão quando nada é injetado', () => {
    expect(new MessageController()).toBeInstanceOf(MessageController);
  });

  describe('list', () => {
    it('deve repassar limit/before e responder 200', async () => {
      const page = { messages: [], nextCursor: null };
      service.list.mockResolvedValue(page);

      await controller.list(createReq({ query: { limit: '2', before: MESSAGE_ID } }), res);

      expect(service.list).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, {
        limit: 2,
        before: MESSAGE_ID,
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: page });
    });

    it('deve responder 400 para id da conversa ou query inválidos', async () => {
      await controller.list(createReq({ params: { id: 'x' } }), res);
      await controller.list(createReq({ query: { limit: '51' } }), res);

      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('deve responder 201 repassando ip e user-agent como metadados', async () => {
      const message = { id: MESSAGE_ID };
      service.send.mockResolvedValue(message as never);

      await controller.send(
        createReq({
          body: { text: ' oi ', mentions: [USER_B] },
          headers: { 'user-agent': 'jest-agent' },
        }),
        res
      );

      expect(service.send).toHaveBeenCalledWith(
        USER_A,
        CONVERSATION_ID,
        { text: 'oi', mentions: [USER_B] },
        { ip: '127.0.0.1', device: 'jest-agent' }
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: message });
    });

    it('deve truncar o user-agent em 255 caracteres e aceitar ausência de ip/user-agent', async () => {
      service.send.mockResolvedValue({} as never);

      await controller.send(
        createReq({ body: { text: 'oi' }, headers: { 'user-agent': 'a'.repeat(300) } }),
        res
      );
      await controller.send(createReq({ body: { text: 'oi' }, ip: undefined }), res);

      expect(service.send.mock.calls[0]![3]).toEqual({ ip: '127.0.0.1', device: 'a'.repeat(255) });
      expect(service.send.mock.calls[1]![3]).toEqual({ ip: null, device: null });
    });

    it('deve responder 400 para id da conversa ou corpo inválidos', async () => {
      await controller.send(createReq({ params: { id: 'x' }, body: { text: 'oi' } }), res);
      await controller.send(createReq({ body: { text: '   ' } }), res);

      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.send).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deve responder 204', async () => {
      service.delete.mockResolvedValue(undefined);

      await controller.delete(
        createReq({ params: { id: CONVERSATION_ID, messageId: MESSAGE_ID } }),
        res
      );

      expect(service.delete).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 para messageId inválido', async () => {
      await controller.delete(createReq({ params: { id: CONVERSATION_ID, messageId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.delete).not.toHaveBeenCalled();
    });
  });
});
```

`tests/unit/modules/chat/controllers/index.test.ts`:

```ts
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));

import * as controllers from '@/modules/chat/controllers';

describe('chat controllers index', () => {
  it('deve exportar classes e instâncias padrão', () => {
    expect(controllers.conversationController).toBeInstanceOf(controllers.ConversationController);
    expect(controllers.messageController).toBeInstanceOf(controllers.MessageController);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/validation tests/unit/modules/chat/controllers --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/chat/validation'` e dos controllers.

- [ ] **Step 3: Implementar os schemas**

`src/modules/chat/validation/chat.schemas.ts`:

```ts
import { z } from 'zod';
import { CHAT_CONSTANTS } from '../constants';

/** UUID normalizado em minúsculas (a direct_key e as comparações de ids dependem disso). */
const uuid = (message: string): z.ZodPipe<z.ZodUUID, z.ZodTransform<string, string>> =>
  z.uuid({ message }).transform((value) => value.toLowerCase());

const objectId = (message: string): z.ZodString => z.string().regex(/^[a-f\d]{24}$/i, { message });

const conversationName = z
  .string()
  .trim()
  .min(
    CHAT_CONSTANTS.MIN_CONVERSATION_NAME_LENGTH,
    `Nome deve ter no mínimo ${String(CHAT_CONSTANTS.MIN_CONVERSATION_NAME_LENGTH)} caractere`
  )
  .max(
    CHAT_CONSTANTS.MAX_CONVERSATION_NAME_LENGTH,
    `Nome deve ter no máximo ${String(CHAT_CONSTANTS.MAX_CONVERSATION_NAME_LENGTH)} caracteres`
  );

const userIdList = z
  .array(uuid('ID de usuário inválido'))
  .min(1, 'Informe ao menos um usuário')
  .max(
    CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS,
    `Máximo de ${String(CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS)} usuários`
  );

export const conversationIdParamSchema = z.object({
  id: uuid('ID de conversa inválido'),
});

export const memberParamSchema = z.object({
  id: uuid('ID de conversa inválido'),
  userId: uuid('ID de usuário inválido'),
});

export const messageParamSchema = z.object({
  id: uuid('ID de conversa inválido'),
  messageId: objectId('ID de mensagem inválido'),
});

export const createDirectConversationSchema = z.object({
  userId: uuid('ID de usuário inválido'),
});

export const createGroupConversationSchema = z.object({
  name: conversationName,
  participantIds: userIdList,
});

export const renameConversationSchema = z.object({
  name: conversationName,
});

export const addMembersSchema = z.object({
  userIds: userIdList,
});

export const listConversationsQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_CONSTANTS.MAX_CONVERSATION_LIMIT)
    .optional()
    .default(CHAT_CONSTANTS.DEFAULT_CONVERSATION_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_CONSTANTS.MESSAGE_PAGE_SIZE)
    .optional()
    .default(CHAT_CONSTANTS.MESSAGE_PAGE_SIZE),
  before: objectId('Cursor inválido').optional(),
});

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Mensagem não pode estar vazia')
    .max(
      CHAT_CONSTANTS.MAX_MESSAGE_LENGTH,
      `Mensagem deve ter no máximo ${String(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH)} caracteres`
    ),
  replyTo: objectId('ID de mensagem inválido').optional(),
  mentions: z
    .array(uuid('ID de usuário inválido'))
    .max(
      CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS,
      `Máximo de ${String(CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS)} menções`
    )
    .optional(),
});

export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>;
export type CreateGroupConversationInput = z.infer<typeof createGroupConversationSchema>;
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

`src/modules/chat/validation/index.ts`:

```ts
export {
  conversationIdParamSchema,
  memberParamSchema,
  messageParamSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  renameConversationSchema,
  addMembersSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageSchema,
} from './chat.schemas';

export type {
  CreateDirectConversationInput,
  CreateGroupConversationInput,
  RenameConversationInput,
  AddMembersInput,
  ListConversationsQuery,
  ListMessagesQuery,
  SendMessageInput,
} from './chat.schemas';
```

- [ ] **Step 4: Implementar os controllers**

`src/modules/chat/controllers/params.ts`:

```ts
import type { Request, Response } from 'express';
import { sendValidationError } from '@/shared/http/controller.helpers';
import { conversationIdParamSchema } from '../validation/chat.schemas';

/** Valida `:id` da rota; em caso de erro já responde 400 e retorna `null`. */
export function parseConversationId(req: Request, res: Response): string | null {
  const params = conversationIdParamSchema.safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error.issues);
    return null;
  }
  return params.data.id;
}
```

`src/modules/chat/controllers/ConversationController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import type { IConversationService } from '../interfaces';
import { conversationService } from '../services/ConversationService';
import {
  addMembersSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  listConversationsQuerySchema,
  memberParamSchema,
  renameConversationSchema,
} from '../validation/chat.schemas';
import { parseConversationId } from './params';

export class ConversationController {
  private readonly conversations: IConversationService;

  constructor(conversations?: IConversationService) {
    this.conversations = conversations ?? conversationService;
  }

  async createDirect(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const body = createDirectConversationSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const { conversation, created } = await this.conversations.createDirect(
      userId,
      body.data.userId
    );

    res
      .status(created ? HttpStatus.CREATED : HttpStatus.OK)
      .json({ success: true, data: conversation });
  }

  async createGroup(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const body = createGroupConversationSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const conversation = await this.conversations.createGroup(userId, body.data);

    res.status(HttpStatus.CREATED).json({ success: true, data: conversation });
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const query = listConversationsQuerySchema.safeParse(req.query);
    if (!query.success) {
      sendValidationError(res, query.error.issues);
      return;
    }

    const page = await this.conversations.list(userId, query.data);

    res.status(HttpStatus.OK).json({ success: true, data: page });
  }

  async get(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const conversation = await this.conversations.get(userId, conversationId);

    res.status(HttpStatus.OK).json({ success: true, data: conversation });
  }

  async rename(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = renameConversationSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const conversation = await this.conversations.rename(userId, conversationId, body.data.name);

    res.status(HttpStatus.OK).json({ success: true, data: conversation });
  }

  async archive(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    await this.conversations.archive(userId, conversationId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async unarchive(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    await this.conversations.unarchive(userId, conversationId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async leave(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    await this.conversations.leave(userId, conversationId);

    res.status(HttpStatus.NO_CONTENT).send();
  }

  async addMembers(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = addMembersSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const conversation = await this.conversations.addMembers(
      userId,
      conversationId,
      body.data.userIds
    );

    res.status(HttpStatus.OK).json({ success: true, data: conversation });
  }

  async removeMember(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = memberParamSchema.safeParse(req.params);
    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.conversations.removeMember(userId, params.data.id, params.data.userId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const conversationController = new ConversationController();
```

`src/modules/chat/controllers/MessageController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import { CHAT_CONSTANTS } from '../constants';
import type { IMessageService } from '../interfaces';
import { messageService } from '../services/MessageService';
import type { MessageMetadata } from '../types';
import {
  listMessagesQuerySchema,
  messageParamSchema,
  sendMessageSchema,
} from '../validation/chat.schemas';
import { parseConversationId } from './params';

function extractMetadata(req: Request): MessageMetadata {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    device: userAgent === undefined ? null : userAgent.slice(0, CHAT_CONSTANTS.MAX_DEVICE_LENGTH),
  };
}

export class MessageController {
  private readonly messages: IMessageService;

  constructor(messages?: IMessageService) {
    this.messages = messages ?? messageService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const query = listMessagesQuerySchema.safeParse(req.query);
    if (!query.success) {
      sendValidationError(res, query.error.issues);
      return;
    }

    const page = await this.messages.list(userId, conversationId, query.data);

    res.status(HttpStatus.OK).json({ success: true, data: page });
  }

  async send(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = sendMessageSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const message = await this.messages.send(
      userId,
      conversationId,
      body.data,
      extractMetadata(req)
    );

    res.status(HttpStatus.CREATED).json({ success: true, data: message });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = messageParamSchema.safeParse(req.params);
    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.messages.delete(userId, params.data.id, params.data.messageId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const messageController = new MessageController();
```

`src/modules/chat/controllers/index.ts`:

```ts
export { ConversationController, conversationController } from './ConversationController';
export { MessageController, messageController } from './MessageController';
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/validation tests/unit/modules/chat/controllers --coverage --coverageReporters=text --collectCoverageFrom='src/modules/chat/validation/*.ts' --collectCoverageFrom='src/modules/chat/controllers/*.ts' --coverageThreshold='{}'`
Expected: PASS, 100% em todos os arquivos (incluindo `params.ts`).

- [ ] **Step 6: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write "src/modules/chat/validation/*.ts" "src/modules/chat/controllers/*.ts" "tests/unit/modules/chat/validation/*.ts" "tests/unit/modules/chat/controllers/*.ts"
node node_modules/.bin/eslint src
git add src/modules/chat/validation src/modules/chat/controllers tests/unit/modules/chat/validation tests/unit/modules/chat/controllers
git commit -m "✨ feat: adiciona schemas e controllers do chat"
```

---

### Task 13: Rotas `/api/conversations`, barrel do módulo e registro no app/bootstrap

**Files:**
- Create: `src/modules/chat/routes/conversation.routes.ts`, `src/modules/chat/routes/index.ts`
- Create: `src/modules/chat/index.ts`
- Modify: `src/app.ts`
- Modify: `src/bootstrap.ts` (fora da cobertura, mas precisa ficar correto)
- Test: `tests/unit/modules/chat/routes/conversation.routes.test.ts`, `tests/unit/modules/chat/routes/index.test.ts`, `tests/unit/modules/chat/index.test.ts`
- Modify: `tests/unit/app.test.ts`

**Interfaces:**
- Consumes: `conversationController`, `messageController` (Task 12); `authenticate`, `asyncHandler` (`@/modules/auth/middlewares`); `registerChatListeners` (Task 11).
- Produces: `conversationRoutes` (13 rotas, todas com `authenticate`, `/direct` e `/group` antes de `/:id`) montado em `/api/conversations`; `@/modules/chat` exporta constantes, erros, tipos, interfaces, validação, models, repositórios, services, controllers, rotas e `registerChatListeners`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/modules/chat/routes/conversation.routes.test.ts`:

```ts
jest.mock('@/modules/chat/controllers/ConversationController', () => ({
  conversationController: {
    createDirect: jest.fn(),
    createGroup: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    rename: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    leave: jest.fn(),
    addMembers: jest.fn(),
    removeMember: jest.fn(),
  },
}));

jest.mock('@/modules/chat/controllers/MessageController', () => ({
  messageController: {
    list: jest.fn(),
    send: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn(),
  asyncHandler: (fn: unknown): unknown => fn,
}));

import type { Router } from 'express';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { conversationController } from '@/modules/chat/controllers/ConversationController';
import { messageController } from '@/modules/chat/controllers/MessageController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((conversationRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

const ROUTES = [
  ['POST', '/direct', conversationController, 'createDirect'],
  ['POST', '/group', conversationController, 'createGroup'],
  ['GET', '/', conversationController, 'list'],
  ['GET', '/:id', conversationController, 'get'],
  ['PATCH', '/:id', conversationController, 'rename'],
  ['POST', '/:id/archive', conversationController, 'archive'],
  ['DELETE', '/:id/archive', conversationController, 'unarchive'],
  ['POST', '/:id/leave', conversationController, 'leave'],
  ['POST', '/:id/members', conversationController, 'addMembers'],
  ['DELETE', '/:id/members/:userId', conversationController, 'removeMember'],
  ['GET', '/:id/messages', messageController, 'list'],
  ['POST', '/:id/messages', messageController, 'send'],
  ['DELETE', '/:id/messages/:messageId', messageController, 'delete'],
] as const;

describe('conversation.routes', () => {
  it('deve definir exatamente as 13 rotas do chat', () => {
    expect(getRoutes().map(({ method, path }) => `${method} ${path}`)).toEqual(
      ROUTES.map(([method, path]) => `${method} ${path}`)
    );
  });

  it('deve declarar /direct e /group antes de /:id', () => {
    const paths = getRoutes().map((r) => r.path);
    const firstParam = paths.indexOf('/:id');
    expect(paths.indexOf('/direct')).toBeLessThan(firstParam);
    expect(paths.indexOf('/group')).toBeLessThan(firstParam);
  });

  it('deve proteger todas as rotas com authenticate', () => {
    for (const { layer } of getRoutes()) {
      expect(layer.route!.stack[0]!.handle).toBe(authenticate);
    }
  });

  it.each(ROUTES)('%s %s deve chamar o controller', async (method, path, controller, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path)!;
    const handle = route.layer.route!.stack[1]!.handle;
    const req = {};
    const res = {};

    await handle(req, res);

    expect((controller as unknown as Record<string, jest.Mock>)[handler]).toHaveBeenCalledWith(
      req,
      res
    );
  });
});
```

`tests/unit/modules/chat/routes/index.test.ts`:

```ts
jest.mock('@/modules/chat/controllers/ConversationController', () => ({
  conversationController: {},
}));
jest.mock('@/modules/chat/controllers/MessageController', () => ({ messageController: {} }));

import { conversationRoutes } from '@/modules/chat/routes';

describe('chat routes index', () => {
  it('deve exportar conversationRoutes', () => {
    expect(conversationRoutes).toBeDefined();
  });
});
```

`tests/unit/modules/chat/index.test.ts`:

```ts
import * as chatModule from '@/modules/chat';

describe('chat module index', () => {
  it('deve exportar constantes, erros e validação', () => {
    expect(chatModule.CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS).toBe(256);
    expect(chatModule.ConversationNotFoundException).toBeDefined();
    expect(chatModule.sendMessageSchema).toBeDefined();
  });

  it('deve exportar models, repositories e services', () => {
    expect(chatModule.Conversation).toBeDefined();
    expect(chatModule.Participant).toBeDefined();
    expect(chatModule.MessageModel).toBeDefined();
    expect(chatModule.conversationRepository).toBeInstanceOf(chatModule.ConversationRepository);
    expect(chatModule.participantRepository).toBeInstanceOf(chatModule.ParticipantRepository);
    expect(chatModule.messageRepository).toBeInstanceOf(chatModule.MessageRepository);
    expect(chatModule.conversationService).toBeInstanceOf(chatModule.ConversationService);
    expect(chatModule.messageService).toBeInstanceOf(chatModule.MessageService);
    expect(typeof chatModule.buildDirectKey).toBe('function');
  });

  it('deve exportar controllers, rotas e listeners', () => {
    expect(chatModule.conversationController).toBeInstanceOf(chatModule.ConversationController);
    expect(chatModule.messageController).toBeInstanceOf(chatModule.MessageController);
    expect(chatModule.conversationRoutes).toBeDefined();
    expect(typeof chatModule.registerChatListeners).toBe('function');
  });
});
```

Em `tests/unit/app.test.ts`, dentro de `describe('roteamento')`, inserir antes do teste `'retorna 404 em formato JSON (notFoundHandler + errorHandler) para rota desconhecida'`:

```ts
    it('monta o router de conversas em /api/conversations (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/conversations');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/routes tests/unit/modules/chat/index.test.ts tests/unit/app.test.ts --coverage=false`
Expected: FAIL — rotas/barrel inexistentes; `GET /api/conversations` retorna 404 em vez de 401.

- [ ] **Step 3: Implementar rotas e barrel**

`src/modules/chat/routes/conversation.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { conversationController } from '../controllers/ConversationController';
import { messageController } from '../controllers/MessageController';

const router = Router();

/**
 * @route POST /conversations/direct
 * @description Cria (ou retorna a existente) conversa 1:1 — 201 nova / 200 existente
 * @access Private
 */
router.post(
  '/direct',
  authenticate,
  asyncHandler((req, res) => conversationController.createDirect(req, res))
);

/**
 * @route POST /conversations/group
 * @description Cria um grupo (criador vira admin)
 * @access Private
 */
router.post(
  '/group',
  authenticate,
  asyncHandler((req, res) => conversationController.createGroup(req, res))
);

/**
 * @route GET /conversations
 * @description Lista conversas do usuário (archived, limit, offset)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => conversationController.list(req, res))
);

/**
 * @route GET /conversations/:id
 * @description Detalhe de uma conversa (404 para não participante)
 * @access Private
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler((req, res) => conversationController.get(req, res))
);

/**
 * @route PATCH /conversations/:id
 * @description Renomeia um grupo (apenas admin)
 * @access Private
 */
router.patch(
  '/:id',
  authenticate,
  asyncHandler((req, res) => conversationController.rename(req, res))
);

/**
 * @route POST /conversations/:id/archive
 * @description Arquiva a conversa para o usuário
 * @access Private
 */
router.post(
  '/:id/archive',
  authenticate,
  asyncHandler((req, res) => conversationController.archive(req, res))
);

/**
 * @route DELETE /conversations/:id/archive
 * @description Desarquiva a conversa para o usuário
 * @access Private
 */
router.delete(
  '/:id/archive',
  authenticate,
  asyncHandler((req, res) => conversationController.unarchive(req, res))
);

/**
 * @route POST /conversations/:id/leave
 * @description Sai de um grupo
 * @access Private
 */
router.post(
  '/:id/leave',
  authenticate,
  asyncHandler((req, res) => conversationController.leave(req, res))
);

/**
 * @route POST /conversations/:id/members
 * @description Adiciona membros a um grupo (apenas admin)
 * @access Private
 */
router.post(
  '/:id/members',
  authenticate,
  asyncHandler((req, res) => conversationController.addMembers(req, res))
);

/**
 * @route DELETE /conversations/:id/members/:userId
 * @description Remove um membro do grupo (apenas admin; a si mesmo = sair)
 * @access Private
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  asyncHandler((req, res) => conversationController.removeMember(req, res))
);

/**
 * @route GET /conversations/:id/messages
 * @description Lista mensagens (mais recentes primeiro; cursor `before`)
 * @access Private
 */
router.get(
  '/:id/messages',
  authenticate,
  asyncHandler((req, res) => messageController.list(req, res))
);

/**
 * @route POST /conversations/:id/messages
 * @description Envia mensagem de texto
 * @access Private
 */
router.post(
  '/:id/messages',
  authenticate,
  asyncHandler((req, res) => messageController.send(req, res))
);

/**
 * @route DELETE /conversations/:id/messages/:messageId
 * @description Apaga (soft delete) mensagem própria
 * @access Private
 */
router.delete(
  '/:id/messages/:messageId',
  authenticate,
  asyncHandler((req, res) => messageController.delete(req, res))
);

export { router as conversationRoutes };
```

`src/modules/chat/routes/index.ts`:

```ts
export { conversationRoutes } from './conversation.routes';
```

`src/modules/chat/index.ts`:

```ts
export * from './constants';

export * from './errors';

export * from './types';

export * from './interfaces';

export * from './validation';

export { Conversation, Participant, MessageModel, type IMessage } from './models';

export {
  ConversationRepository,
  conversationRepository,
  ParticipantRepository,
  participantRepository,
  MessageRepository,
  messageRepository,
} from './repositories';

export {
  ConversationService,
  conversationService,
  MessageService,
  messageService,
  buildDirectKey,
} from './services';

export {
  ConversationController,
  conversationController,
  MessageController,
  messageController,
} from './controllers';

export { conversationRoutes } from './routes';

export { registerChatListeners } from './listeners';
```

- [ ] **Step 4: Montar no app e registrar listeners no bootstrap**

Em `src/app.ts`, logo após `import { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './modules/user/routes';`, acrescentar:

```ts
import { conversationRoutes } from './modules/chat/routes';
```

e logo após `app.use('/api/users', userRoutes);`:

```ts
app.use('/api/conversations', conversationRoutes);
```

Substituir `src/bootstrap.ts` por:

```ts
import {
  connectPostgres,
  connectRedis,
  connectMongo,
  connectElasticsearch,
  disconnectPostgres,
  disconnectRedis,
  disconnectMongo,
  disconnectElasticsearch,
} from './shared/database';
import { registerChatListeners } from './modules/chat/listeners';

export async function bootstrap(): Promise<void> {
  await connectPostgres();
  await connectRedis();
  await connectMongo();
  await connectElasticsearch();
  registerChatListeners();
}

export async function shutdown(): Promise<void> {
  await disconnectElasticsearch();
  await disconnectMongo();
  await disconnectRedis();
  await disconnectPostgres();
}
```

(`bootstrap.ts` está excluído da cobertura; `server.ts` o chama uma única vez antes de `app.listen`. Os testes de app não chamam `bootstrap`, então nenhum listener é registrado neles.)

- [ ] **Step 5: Rodar a suíte completa**

Run: `node node_modules/.bin/jest --silent --coverageReporters=text-summary`
Expected: todas as suítes passam; resumo 100% statements/branches/functions/lines.

- [ ] **Step 6: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write "src/modules/chat/routes/*.ts" src/modules/chat/index.ts src/app.ts src/bootstrap.ts "tests/unit/modules/chat/routes/*.ts" tests/unit/modules/chat/index.test.ts tests/unit/app.test.ts
node node_modules/.bin/eslint src
git add src/modules/chat/routes src/modules/chat/index.ts src/app.ts src/bootstrap.ts tests/unit/modules/chat/routes tests/unit/modules/chat/index.test.ts tests/unit/app.test.ts
git commit -m "✨ feat: expõe /api/conversations e registra listeners do chat no bootstrap"
```

---

### Task 14: Feature tests HTTP do chat

**Files:**
- Create: `tests/support/chat/inMemoryChat.ts` (não é arquivo de teste: não casa com `testMatch`)
- Create: `tests/feature/modules/chat/chat.test.ts`

**Interfaces:**
- Consumes: `IConversationRepository`, `IParticipantRepository`, `IMessageRepository` (Tasks 7–8); `conversationRoutes` (Task 13); `errorHandler`.
- Produces: `createInMemoryChatRepositories(): { store: InMemoryChatStore; conversationRepository; participantRepository; messageRepository }` — usado via `jest.mock('@/modules/chat/repositories', () => jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories())`.

Cobre o spec §7: direct idempotente → enviar → listar com cursor → apagar (tombstone); grupo: criar → renomear (admin) → adicionar/remover → sair com promoção de admin; 403 bloqueio; 404 não participante; 401 sem token; além de validação 400, arquivamento por participante e remoção do grupo vazio. Os services do chat são reais; `userService`/`contactService` (fronteira com o módulo user) e `authenticate` são falsos com funções simples (não `jest.fn`, por causa do `resetMocks`). O token de teste é o próprio id do usuário (`Authorization: Bearer <uuid>`).

- [ ] **Step 1: Criar os repositórios em memória**

`tests/support/chat/inMemoryChat.ts`:

```ts
// Repositórios do chat em memória para os feature tests: exercitam os services reais
// (regras de negócio) sem PostgreSQL/MongoDB. Não é arquivo de teste (não casa com testMatch).
import { randomBytes, randomUUID } from 'crypto';
import type {
  IConversationRepository,
  IMessageRepository,
  IParticipantRepository,
  ListForUserOptions,
} from '@/modules/chat/interfaces';
import type {
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
  CreateMessageData,
  FindMessagesOptions,
  MessageRecord,
  ParticipantAttributes,
  ParticipantRole,
} from '@/modules/chat/types';

export class InMemoryChatStore {
  conversations = new Map<string, ConversationAttributes>();
  participants: ParticipantAttributes[] = [];
  messages: MessageRecord[] = [];
  private clock = Date.parse('2026-09-24T10:00:00.000Z');

  /** Relógio monotônico: cada chamada avança 1s (ordenações determinísticas). */
  now(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  reset(): void {
    this.conversations.clear();
    this.participants = [];
    this.messages = [];
    this.clock = Date.parse('2026-09-24T10:00:00.000Z');
  }

  addParticipant(conversationId: string, userId: string, role: ParticipantRole): void {
    this.participants.push({
      id: randomUUID(),
      conversationId,
      userId,
      role,
      joinedAt: this.now(),
      lastReadAt: null,
      isMuted: false,
      archivedAt: null,
    });
  }

  createConversation(
    data: Partial<ConversationAttributes> & Pick<ConversationAttributes, 'type'>
  ): ConversationAttributes {
    const at = this.now();
    const conversation: ConversationAttributes = {
      id: randomUUID(),
      name: null,
      avatarUrl: null,
      createdBy: null,
      directKey: null,
      lastMessageAt: null,
      createdAt: at,
      updatedAt: at,
      ...data,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }
}

function oldestFirst(a: ParticipantAttributes, b: ParticipantAttributes): number {
  return a.joinedAt.getTime() - b.joinedAt.getTime();
}

export class InMemoryConversationRepository implements IConversationRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async findById(id: string): Promise<ConversationAttributes | null> {
    return this.store.conversations.get(id) ?? null;
  }

  async findByDirectKey(directKey: string): Promise<ConversationAttributes | null> {
    return [...this.store.conversations.values()].find((c) => c.directKey === directKey) ?? null;
  }

  async createDirect({
    directKey,
    createdBy,
    userIds,
  }: CreateDirectData): Promise<CreateDirectRecord> {
    const existing = await this.findByDirectKey(directKey);
    if (existing !== null) {
      return { conversation: existing, created: false };
    }
    const conversation = this.store.createConversation({ type: 'direct', directKey, createdBy });
    userIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member');
    });
    return { conversation, created: true };
  }

  async createGroup({
    name,
    createdBy,
    memberIds,
  }: CreateGroupData): Promise<ConversationAttributes> {
    const conversation = this.store.createConversation({ type: 'group', name, createdBy });
    this.store.addParticipant(conversation.id, createdBy, 'admin');
    memberIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member');
    });
    return conversation;
  }

  async listForUser(
    userId: string,
    { archived, limit, offset }: ListForUserOptions
  ): Promise<ConversationListPage> {
    const rows = this.store.participants
      .filter((p) => p.userId === userId && (p.archivedAt !== null) === archived)
      .flatMap((membership) => {
        const conversation = this.store.conversations.get(membership.conversationId);
        return conversation === undefined ? [] : [{ conversation, membership }];
      })
      .sort((a, b) => {
        const lastA = a.conversation.lastMessageAt?.getTime() ?? -Infinity;
        const lastB = b.conversation.lastMessageAt?.getTime() ?? -Infinity;
        return (
          lastB - lastA || b.conversation.createdAt.getTime() - a.conversation.createdAt.getTime()
        );
      });
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  }

  async rename(id: string, name: string): Promise<void> {
    const conversation = this.store.conversations.get(id);
    if (conversation !== undefined) {
      conversation.name = name;
    }
  }

  async touchLastMessageAt(id: string, at: Date): Promise<void> {
    const conversation = this.store.conversations.get(id);
    if (
      conversation !== undefined &&
      (conversation.lastMessageAt === null || conversation.lastMessageAt < at)
    ) {
      conversation.lastMessageAt = at;
    }
  }

  async delete(id: string): Promise<void> {
    this.store.conversations.delete(id);
    this.store.participants = this.store.participants.filter((p) => p.conversationId !== id);
  }
}

export class InMemoryParticipantRepository implements IParticipantRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async find(conversationId: string, userId: string): Promise<ParticipantAttributes | null> {
    return (
      this.store.participants.find(
        (p) => p.conversationId === conversationId && p.userId === userId
      ) ?? null
    );
  }

  async listByConversation(conversationId: string): Promise<ParticipantAttributes[]> {
    return this.store.participants
      .filter((p) => p.conversationId === conversationId)
      .sort(oldestFirst);
  }

  async listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]> {
    return this.store.participants
      .filter((p) => conversationIds.includes(p.conversationId))
      .sort(oldestFirst);
  }

  async listConversationIdsByUser(userId: string): Promise<string[]> {
    return this.store.participants.filter((p) => p.userId === userId).map((p) => p.conversationId);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      if ((await this.find(conversationId, userId)) === null) {
        this.store.addParticipant(conversationId, userId, 'member');
      }
    }
  }

  async remove(conversationId: string, userId: string): Promise<void> {
    this.store.participants = this.store.participants.filter(
      (p) => !(p.conversationId === conversationId && p.userId === userId)
    );
  }

  async setRole(conversationId: string, userId: string, role: ParticipantRole): Promise<void> {
    const participant = await this.find(conversationId, userId);
    if (participant !== null) {
      participant.role = role;
    }
  }

  async setArchivedAt(
    conversationId: string,
    userId: string,
    archivedAt: Date | null
  ): Promise<void> {
    const participant = await this.find(conversationId, userId);
    if (participant !== null) {
      participant.archivedAt = archivedAt;
    }
  }
}

export class InMemoryMessageRepository implements IMessageRepository {
  constructor(private readonly store: InMemoryChatStore) {}

  async create(data: CreateMessageData): Promise<MessageRecord> {
    const at = this.store.now();
    const record: MessageRecord = {
      ...data,
      id: randomBytes(12).toString('hex'),
      deletedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.store.messages.push(record);
    return { ...record };
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const record = this.store.messages.find((m) => m.id === id);
    return record === undefined ? null : { ...record };
  }

  async findByConversation(
    conversationId: string,
    { limit, before }: FindMessagesOptions
  ): Promise<MessageRecord[]> {
    return this.store.messages
      .filter((m) => m.conversationId === conversationId)
      .filter(
        (m) =>
          before === undefined ||
          m.createdAt < before.createdAt ||
          (m.createdAt.getTime() === before.createdAt.getTime() && m.id < before.id)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }

  async softDelete(id: string, deletedAt: Date): Promise<boolean> {
    const record = this.store.messages.find((m) => m.id === id);
    if (record === undefined || record.deletedAt !== null) {
      return false;
    }
    record.deletedAt = deletedAt;
    return true;
  }
}

export function createInMemoryChatRepositories(): {
  store: InMemoryChatStore;
  conversationRepository: InMemoryConversationRepository;
  participantRepository: InMemoryParticipantRepository;
  messageRepository: InMemoryMessageRepository;
} {
  const store = new InMemoryChatStore();
  return {
    store,
    conversationRepository: new InMemoryConversationRepository(store),
    participantRepository: new InMemoryParticipantRepository(store),
    messageRepository: new InMemoryMessageRepository(store),
  };
}
```

- [ ] **Step 2: Escrever o feature test**

`tests/feature/modules/chat/chat.test.ts`:

```ts
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { HttpStatus } from '@/shared/errors';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';

// Serviços do módulo de usuários (fronteira do módulo chat) com estado em memória.
// Funções simples (não jest.fn) porque resetMocks:true apagaria implementações.
const mockUsers = new Set<string>([ANA, BOB, CAROL, DAVE]);
const mockBlocks = new Set<string>();
const mockUserService = {
  exists: async (id: string): Promise<boolean> => mockUsers.has(id),
  getMultiple: async (ids: string[]): Promise<unknown[]> =>
    ids
      .filter((id) => mockUsers.has(id))
      .map((id) => ({
        id,
        username: `user_${id.slice(0, 4)}`,
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      })),
};
const mockContactService = {
  isBlockedByEither: async (a: string, b: string): Promise<boolean> =>
    mockBlocks.has(`${a}:${b}`) || mockBlocks.has(`${b}:${a}`),
};

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // O token do teste é o próprio id do usuário: "Authorization: Bearer <uuid>".
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (header === undefined) {
      const errors = jest.requireActual('@/shared/errors');
      next(
        new errors.AppError(
          'Token de autenticação não fornecido',
          errors.HttpStatus.UNAUTHORIZED,
          errors.ErrorCode.UNAUTHORIZED
        )
      );
      return;
    }
    const id = header.replace('Bearer ', '');
    req.user = { id, email: `${id}@example.com`, username: id };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import * as chatRepositories from '@/modules/chat/repositories';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const as = (userId: string): { Authorization: string } => ({ Authorization: `Bearer ${userId}` });
const FAKE_CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FAKE_MESSAGE = '65f000000000000000000001';

describe('Chat — Feature', () => {
  let app: Application;

  beforeEach(() => {
    store.reset();
    mockBlocks.clear();
    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    app.use(errorHandler);
  });

  async function createDirect(from: string, to: string): Promise<request.Response> {
    return request(app).post('/api/conversations/direct').set(as(from)).send({ userId: to });
  }

  async function send(
    from: string,
    conversationId: string,
    text: string
  ): Promise<request.Response> {
    return request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(as(from))
      .send({ text });
  }

  describe('autenticação', () => {
    it.each([
      ['post', '/api/conversations/direct'],
      ['post', '/api/conversations/group'],
      ['get', '/api/conversations'],
      ['get', `/api/conversations/${FAKE_CONVERSATION}`],
      ['patch', `/api/conversations/${FAKE_CONVERSATION}`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/archive`],
      ['delete', `/api/conversations/${FAKE_CONVERSATION}/archive`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/leave`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/members`],
      ['delete', `/api/conversations/${FAKE_CONVERSATION}/members/${BOB}`],
      ['get', `/api/conversations/${FAKE_CONVERSATION}/messages`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/messages`],
      ['delete', `/api/conversations/${FAKE_CONVERSATION}/messages/${FAKE_MESSAGE}`],
    ] as const)('%s %s sem token deve retornar 401', async (method, url) => {
      const response = await request(app)[method](url);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('conversa direct', () => {
    it('criar (idempotente) → enviar → paginar com cursor → apagar (tombstone)', async () => {
      const created = await createDirect(ANA, BOB);
      expect(created.status).toBe(HttpStatus.CREATED);
      const conversationId = created.body.data.id as string;
      expect(created.body.data.participants).toHaveLength(2);

      const again = await createDirect(BOB, ANA);
      expect(again.status).toBe(HttpStatus.OK);
      expect(again.body.data.id).toBe(conversationId);

      const ids: string[] = [];
      for (const text of ['m1', 'm2', 'm3']) {
        const sent = await send(ANA, conversationId, text);
        expect(sent.status).toBe(HttpStatus.CREATED);
        ids.push(sent.body.data.id as string);
      }

      const page1 = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2`)
        .set(as(BOB));
      expect(page1.status).toBe(HttpStatus.OK);
      expect(
        page1.body.data.messages.map((m: { content: { text: string } }) => m.content.text)
      ).toEqual(['m3', 'm2']);
      expect(page1.body.data.nextCursor).toBe(ids[1]);

      const page2 = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2&before=${String(ids[1])}`)
        .set(as(BOB));
      expect(page2.body.data.messages).toHaveLength(1);
      expect(page2.body.data.messages[0].content.text).toBe('m1');
      expect(page2.body.data.nextCursor).toBeNull();

      const notAuthor = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${String(ids[1])}`)
        .set(as(BOB));
      expect(notAuthor.status).toBe(HttpStatus.FORBIDDEN);

      for (let attempt = 0; attempt < 2; attempt++) {
        const deleted = await request(app)
          .delete(`/api/conversations/${conversationId}/messages/${String(ids[1])}`)
          .set(as(ANA));
        expect(deleted.status).toBe(HttpStatus.NO_CONTENT);
      }

      const afterDelete = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA));
      const tombstone = afterDelete.body.data.messages.find((m: { id: string }) => m.id === ids[1]);
      expect(tombstone.content).toBeNull();
      expect(tombstone.deletedAt).not.toBeNull();

      const list = await request(app).get('/api/conversations').set(as(ANA));
      expect(list.body.data.total).toBe(1);
      expect(list.body.data.items[0].lastMessageAt).not.toBeNull();
    });

    it('bloqueio em qualquer sentido → 403 ao criar e ao enviar', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      mockBlocks.add(`${BOB}:${ANA}`);

      const sent = await send(ANA, conversationId, 'oi');
      expect(sent.status).toBe(HttpStatus.FORBIDDEN);
      expect(sent.body.error.code).toBe('USER_BLOCKED');

      const newDirect = await createDirect(BOB, ANA);
      expect(newDirect.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('não participante recebe 404 em conversa e mensagens', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      const get = await request(app).get(`/api/conversations/${conversationId}`).set(as(CAROL));
      const list = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(CAROL));
      const sent = await send(CAROL, conversationId, 'intruso');

      expect(get.status).toBe(HttpStatus.NOT_FOUND);
      expect(list.status).toBe(HttpStatus.NOT_FOUND);
      expect(sent.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('validação: 400 para ids inválidos, autoconversa, mention de não participante e rename em direct', async () => {
      const invalidUser = await request(app)
        .post('/api/conversations/direct')
        .set(as(ANA))
        .send({ userId: 'x' });
      expect(invalidUser.status).toBe(HttpStatus.BAD_REQUEST);
      expect(invalidUser.body.success).toBe(false);

      const self = await createDirect(ANA, ANA);
      expect(self.status).toBe(HttpStatus.BAD_REQUEST);

      const invalidId = await request(app).get('/api/conversations/nao-e-uuid').set(as(ANA));
      expect(invalidId.status).toBe(HttpStatus.BAD_REQUEST);

      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      const mention = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA))
        .send({ text: 'oi', mentions: [CAROL] });
      expect(mention.status).toBe(HttpStatus.BAD_REQUEST);

      const rename = await request(app)
        .patch(`/api/conversations/${conversationId}`)
        .set(as(ANA))
        .send({ name: 'x' });
      expect(rename.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('arquivar/desarquivar é por participante', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      const archived = await request(app)
        .post(`/api/conversations/${conversationId}/archive`)
        .set(as(ANA));
      expect(archived.status).toBe(HttpStatus.NO_CONTENT);

      const active = await request(app).get('/api/conversations').set(as(ANA));
      const archivedList = await request(app).get('/api/conversations?archived=true').set(as(ANA));
      const bobList = await request(app).get('/api/conversations').set(as(BOB));
      expect(active.body.data.total).toBe(0);
      expect(archivedList.body.data.total).toBe(1);
      expect(bobList.body.data.total).toBe(1);

      const unarchived = await request(app)
        .delete(`/api/conversations/${conversationId}/archive`)
        .set(as(ANA));
      expect(unarchived.status).toBe(HttpStatus.NO_CONTENT);
      const again = await request(app).get('/api/conversations').set(as(ANA));
      expect(again.body.data.total).toBe(1);
    });
  });

  describe('grupo', () => {
    it('criar → renomear (admin) → adicionar/remover → sair com promoção de admin', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Time', participantIds: [BOB] });
      expect(created.status).toBe(HttpStatus.CREATED);
      expect(created.body.data.membership.role).toBe('admin');
      const groupId = created.body.data.id as string;

      const renameByMember = await request(app)
        .patch(`/api/conversations/${groupId}`)
        .set(as(BOB))
        .send({ name: 'Hack' });
      expect(renameByMember.status).toBe(HttpStatus.FORBIDDEN);

      const renamed = await request(app)
        .patch(`/api/conversations/${groupId}`)
        .set(as(ANA))
        .send({ name: 'Time 2' });
      expect(renamed.status).toBe(HttpStatus.OK);
      expect(renamed.body.data.name).toBe('Time 2');

      const added = await request(app)
        .post(`/api/conversations/${groupId}/members`)
        .set(as(ANA))
        .send({ userIds: [CAROL, DAVE] });
      expect(added.status).toBe(HttpStatus.OK);
      expect(added.body.data.participants).toHaveLength(4);

      const removed = await request(app)
        .delete(`/api/conversations/${groupId}/members/${DAVE}`)
        .set(as(ANA));
      expect(removed.status).toBe(HttpStatus.NO_CONTENT);

      const left = await request(app).post(`/api/conversations/${groupId}/leave`).set(as(ANA));
      expect(left.status).toBe(HttpStatus.NO_CONTENT);

      const asBob = await request(app).get(`/api/conversations/${groupId}`).set(as(BOB));
      expect(asBob.status).toBe(HttpStatus.OK);
      expect(asBob.body.data.membership.role).toBe('admin');
      expect(asBob.body.data.participants).toHaveLength(2);

      const asAna = await request(app).get(`/api/conversations/${groupId}`).set(as(ANA));
      expect(asAna.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('404 listando usuários inexistentes ao criar grupo', async () => {
      const unknown = '55555555-5555-4555-8555-555555555555';

      const response = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Time', participantIds: [BOB, unknown] });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body.error.details).toEqual([expect.objectContaining({ message: unknown })]);
    });

    it('último participante saindo remove o grupo', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Solo', participantIds: [BOB] });
      const groupId = created.body.data.id as string;

      await request(app).post(`/api/conversations/${groupId}/leave`).set(as(ANA));
      await request(app).post(`/api/conversations/${groupId}/leave`).set(as(BOB));

      expect(store.conversations.has(groupId)).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Rodar**

Run: `node node_modules/.bin/jest tests/feature/modules/chat --coverage=false`
Expected: PASS (21 testes). Se algum fluxo falhar, o defeito está no service/controller correspondente — corrigir com TDD no unit test da task que o criou antes de seguir (não "consertar" o repositório em memória para acomodar o bug).

- [ ] **Step 4: Verificar, formatar e commitar**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/prettier --write tests/support/chat/inMemoryChat.ts tests/feature/modules/chat/chat.test.ts
git add tests/support/chat/inMemoryChat.ts tests/feature/modules/chat/chat.test.ts
git commit -m "✅ test: adiciona feature tests HTTP do chat"
```

---
### Task 15: Verificação completa, smoke na stack real, READMEs, SRS local e PR

**Files:**
- Modify: `README.md`, `README.pt-BR.md`
- Modify (local, NÃO commitar): `.github/SRS.md`
- Create (fora do repo, no seu diretório de scratchpad): `smoke-chat.sh`, `pr-body.md`

Defina antes: `export SCRATCH=<seu diretório de scratchpad da sessão>` (arquivos temporários nunca vão para o repo).

- [ ] **Step 1: Suíte completa + lint + format + tipos + build**

```bash
node node_modules/.bin/jest --silent --coverageReporters=text-summary
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/tsc --noEmit
npm run build
```

Expected: todas as suítes passam (esperado ≈ 2.507 testes em 148 suítes — anote os números exatos impressos para os READMEs); resumo 100% statements/branches/functions/lines; eslint sai com código 0; Prettier "All matched files use Prettier code style!"; `tsc` e `build` sem erros.

- [ ] **Step 2: Conferir 100% nos arquivos novos/alterados**

```bash
node node_modules/.bin/jest --coverage --coverageReporters=text \
  --collectCoverageFrom='src/modules/chat/**/*.ts' \
  --collectCoverageFrom='src/modules/user/models/Contact.ts' \
  --collectCoverageFrom='src/modules/user/repositories/{ContactRepository,UserRepository}.ts' \
  --collectCoverageFrom='src/modules/user/services/ContactService.ts' \
  --collectCoverageFrom='src/app.ts' \
  --coverageThreshold='{}'
```

Expected: 100% em todas as colunas de todos os arquivos listados. Faltou algo → acrescentar teste no arquivo de teste da task que criou o código (TDD) e commitar como `✅ test: …`.

- [ ] **Step 3: Subir os bancos em portas alternativas e validar migrations (up → down → up)**

```bash
set -a && source .env && set +a
export POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301
docker compose up -d postgres redis mongodb elasticsearch
docker compose ps
```

Expected: `rtm-postgres`, `rtm-redis`, `rtm-mongodb`, `rtm-elasticsearch` "Up" nas portas 15532/16390/27117/9201. Não subir `real-time-app` (rtm-app não funciona) e não tocar em nenhum outro container.

```bash
DB_HOST=localhost DB_PORT=15532 npm run db:migrate
for i in 1 2 3 4; do DB_HOST=localhost DB_PORT=15532 npm run db:migrate:undo; done
docker exec rtm-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt' -c '\dT'
DB_HOST=localhost DB_PORT=15532 npm run db:migrate
docker exec rtm-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\d conversations' -c '\d participants' -c '\d contacts'
```

Expected:
- O primeiro `db:migrate` aplica as 4 migrations novas (`20260924000000…` a `20260924000300…`); os 4 `undo` as revertem na ordem inversa.
- Após os `undo`: `\dt` sem `conversations`/`participants`; `\dT` sem `enum_conversations_type`/`enum_participants_role`.
- Após o segundo `db:migrate`: `conversations` com `direct_key` + índice único `conversations_direct_key_unique`, índice `conversations_last_message_at_index`, FK `created_by` → `users` `ON DELETE SET NULL`; `participants` com `participants_conversation_user_unique`, `participants_user_id_index`, FKs `ON DELETE CASCADE`; `contacts.created_by_block` `not null default false` e `contacts.last_interaction_at` + índice `contacts_user_last_interaction_index`.

Se o `db:migrate:undo` da migration `created_by_block` ou de um ENUM falhar, corrigir a migration (fora da cobertura, mas precisa ser reversível) e repetir o ciclo.

- [ ] **Step 4: Subir a app no host na porta 3100 (em background)**

```bash
MONGO_USER_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_USER))")
MONGO_PASSWORD_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_PASSWORD))")
DB_HOST=localhost DB_PORT=15532 \
REDIS_HOST=localhost REDIS_PORT=16390 \
MONGODB_URL="mongodb://${MONGO_USER_ENC}:${MONGO_PASSWORD_ENC}@localhost:27117/${MONGO_DB}?authSource=admin" \
ELASTICSEARCH_URL="http://localhost:9201" \
PORT=3100 node --import tsx src/server.ts > "$SCRATCH/rtm-app.log" 2>&1 &
echo $! > "$SCRATCH/rtm-app.pid"
```

(`node --import tsx` em vez de `npm run dev` para ter um único processo, fácil de encerrar.) Aguarde a app responder (polling com a ferramenta de espera do seu ambiente, não `sleep` em primeiro plano) até `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/api/conversations` imprimir `401`. Se o processo morrer, ver `$SCRATCH/rtm-app.log` (em geral `.env` com senha vazia ou porta errada).

- [ ] **Step 5: Rodar o smoke do chat**

Criar `$SCRATCH/smoke-chat.sh` com:

```bash
#!/usr/bin/env bash
# Smoke do chat contra a stack real (app no host em :3100). Uso: bash smoke-chat.sh
# Requer as variáveis do .env exportadas (POSTGRES_USER, POSTGRES_DB, MONGO_*).
set -euo pipefail

BASE=http://localhost:3100/api
SUFFIX=$(date +%s)
CT='Content-Type: application/json'

j() { node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }
reg() {
  curl -s -X POST "$BASE/auth/register" -H "$CT" \
    -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"Password123!\",\"displayName\":\"$1\"}"
}

ANA=$(reg "ana$SUFFIX")
BOB=$(reg "bob$SUFFIX")
CAROL=$(reg "carol$SUFFIX")
A_ID=$(echo "$ANA" | j 'd.data.user.id')
B_ID=$(echo "$BOB" | j 'd.data.user.id')
C_ID=$(echo "$CAROL" | j 'd.data.user.id')
A="Authorization: Bearer $(echo "$ANA" | j 'd.data.tokens.accessToken')"
B="Authorization: Bearer $(echo "$BOB" | j 'd.data.tokens.accessToken')"
C="Authorization: Bearer $(echo "$CAROL" | j 'd.data.tokens.accessToken')"

# 1. conversa direct idempotente
R1=$(curl -s -w '\n%{http_code}' -X POST "$BASE/conversations/direct" -H "$A" -H "$CT" -d "{\"userId\":\"$B_ID\"}")
echo "direct-1=$(echo "$R1" | tail -n 1)"
CONV=$(echo "$R1" | head -n 1 | j 'd.data.id')
curl -s -o /dev/null -w "direct-2=%{http_code}\n" -X POST "$BASE/conversations/direct" -H "$B" -H "$CT" -d "{\"userId\":\"$A_ID\"}"

# 2. três mensagens
for t in m1 m2 m3; do
  curl -s -X POST "$BASE/conversations/$CONV/messages" -H "$A" -H "$CT" -d "{\"text\":\"$t\"}" | j '"send="+d.data.content.text'
done

# 3. paginação com limit=2 e cursor
P1=$(curl -s "$BASE/conversations/$CONV/messages?limit=2" -H "$B")
echo "$P1" | j '"page1="+d.data.messages.map(m=>m.content.text).join(",")'
CURSOR=$(echo "$P1" | j 'd.data.nextCursor')
curl -s "$BASE/conversations/$CONV/messages?limit=2&before=$CURSOR" -H "$B" \
  | j '"page2="+d.data.messages.map(m=>m.content.text).join(",")+" next="+d.data.nextCursor'

# 4. apagar m2 (o cursor da página 1) e conferir o tombstone
curl -s -o /dev/null -w "delete=%{http_code}\n" -X DELETE "$BASE/conversations/$CONV/messages/$CURSOR" -H "$A"
curl -s -o /dev/null -w "delete-again=%{http_code}\n" -X DELETE "$BASE/conversations/$CONV/messages/$CURSOR" -H "$A"
curl -s "$BASE/conversations/$CONV/messages" -H "$B" \
  | j '"tombstone="+JSON.stringify(d.data.messages.find(m=>m.id==="'"$CURSOR"'").content)'

# 5. lista de conversas ordenada por última mensagem
curl -s "$BASE/conversations" -H "$A" \
  | j '"conversations="+d.data.total+" lastMessageAt="+(d.data.items[0].lastMessageAt!==null)'

# 6. contatos por última interação (RF002.2)
curl -s -o /dev/null -w "add-contact=%{http_code}\n" -X POST "$BASE/contacts" -H "$A" -H "$CT" -d "{\"contactId\":\"$B_ID\"}"
curl -s -o /dev/null -X POST "$BASE/conversations/$CONV/messages" -H "$A" -H "$CT" -d '{"text":"m4"}'
curl -s "$BASE/contacts?orderBy=lastInteraction" -H "$A" \
  | j '"contacts-lastInteraction="+d.success+" first="+(d.data.contacts[0].contactId==="'"$B_ID"'")'
echo "last-interaction-touched=$(docker exec rtm-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT last_interaction_at IS NOT NULL FROM contacts WHERE user_id='$A_ID' AND contact_id='$B_ID'")"

# 7. corrida na criação do direct (UNIQUE de direct_key): um 201 e um 200
curl -s -o /dev/null -w "race-a=%{http_code}\n" -X POST "$BASE/conversations/direct" -H "$A" -H "$CT" -d "{\"userId\":\"$C_ID\"}" &
curl -s -o /dev/null -w "race-c=%{http_code}\n" -X POST "$BASE/conversations/direct" -H "$C" -H "$CT" -d "{\"userId\":\"$A_ID\"}" &
wait
echo "race-rows=$(docker exec rtm-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT count(*) FROM participants p JOIN conversations c ON c.id = p.conversation_id WHERE c.type = 'direct' AND p.user_id = '$C_ID'")"

# 8. não participante → 404
curl -s -o /dev/null -w "outsider=%{http_code}\n" "$BASE/conversations/$CONV/messages" -H "$C"

# 9. bloqueio (bob bloqueia ana) → 403 no envio e busca sem o bloqueado (subconsulta real)
curl -s -o /dev/null -w "block=%{http_code}\n" -X POST "$BASE/blocks" -H "$B" -H "$CT" -d "{\"userId\":\"$A_ID\"}"
curl -s -o /dev/null -w "send-blocked=%{http_code}\n" -X POST "$BASE/conversations/$CONV/messages" -H "$A" -H "$CT" -d '{"text":"bloqueado"}'
curl -s "$BASE/users/search?query=bob$SUFFIX" -H "$A" | j '"search-after-block="+d.data.length'

echo "CONV=$CONV"
```

```bash
bash "$SCRATCH/smoke-chat.sh"
```

Expected (a ordem de `race-a`/`race-c` pode variar):

```
direct-1=201
direct-2=200
send=m1
send=m2
send=m3
page1=m3,m2
page2=m1 next=null
delete=204
delete-again=204
tombstone=null
conversations=1 lastMessageAt=true
add-contact=201
contacts-lastInteraction=true first=true
last-interaction-touched=t
race-a=201
race-c=200
race-rows=1
outsider=404
block=201
send-blocked=403
search-after-block=0
CONV=<uuid>
```

Divergências e o que investigar (corrigir com TDD na task de origem, commitar e repetir o smoke):
- `race-*` ambos 201 ou `race-rows=2` → `ConversationRepository.createDirect`/índice único de `direct_key`.
- `contacts-lastInteraction` com erro 500 → `buildContactOrder` (Task 11); `last-interaction-touched=f` → listener não registrado no `bootstrap` (Task 13) ou `touchInteraction` (Task 11).
- `search-after-block` ≠ 0 ou 500 → subconsulta/`replacements` do `UserRepository.search` (Task 4).
- 429 no `register` → o limiter de auth (5 req/15 min por IP) já foi consumido por execuções anteriores: `docker exec rtm-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB` (só o Redis deste projeto) e rodar de novo.

- [ ] **Step 6: Conferir o índice no MongoDB**

```bash
docker exec rtm-mongodb mongosh --quiet -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin "$MONGO_DB" \
  --eval 'db.messages.getIndexes().map(i => i.name).join(",")'
```

Expected: `_id_,conversationId_1_createdAt_-1__id_-1`.

- [ ] **Step 7: Encerrar a app**

```bash
kill "$(cat "$SCRATCH/rtm-app.pid")"
```

Os containers `rtm-*` podem ficar de pé (ou `docker compose stop postgres redis mongodb elasticsearch`). Nunca parar/remover containers de outros projetos.

- [ ] **Step 8: Atualizar `README.md`**

Cada item abaixo é uma substituição literal (trecho atual → trecho novo). Os totais de testes vêm do Step 1.

1. Hero (linha 5) — trocar:

```text
Express 5 API with token auth and user profiles today; WebSocket messaging, presence, notifications and search on the way
```

por:

```text
Express 5 API with token auth, user profiles, contacts and a REST chat today; WebSocket delivery, presence, notifications and search on the way
```

2. Badge — trocar `tests-2094%20Jest` pelo total do Step 1 (ex.: `tests-2507%20Jest`).

3. Aviso — trocar a linha inteira que começa com `> **Work in progress.**` por:

```markdown
> **Work in progress.** Authentication, profiles, contacts/blocks and the chat REST API (1:1 and group conversations, messages in MongoDB) are implemented and tested on top of the shared infrastructure. Real-time delivery over WebSocket is the next milestone — see the [roadmap](#roadmap).
```

4. Architecture — substituir o conteúdo do bloco mermaid por:

```text
flowchart LR
    C[Client] -->|HTTP · Bearer JWT| API[Express 5 API]
    API --> AUTH[auth module]
    API --> USER[user module]
    API --> CHAT[chat module]
    API -.-> RT[realtime · WebSocket]
    API -.-> NOTIF[notifications]
    API -.-> SEARCH[search]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER --> RD[(Redis<br/>rate limit · cache)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>structured logs)]
    CHAT --> MG[(MongoDB<br/>messages)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT --> EB{{EventBus}}

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class RT,NOTIF,SEARCH,ES planned
```

5. Contacts — trocar a linha:

```text
| `GET` | `/` | ✓ | List own contacts, paginated, with filters |
```

por:

```text
| `GET` | `/` | ✓ | List own contacts, paginated, with filters; `orderBy=lastInteraction` sorts by the latest direct message (contacts never messaged come last) |
```

e trocar:

```text
| `DELETE` | `/:contactId` | ✓ | Remove a contact |

### Blocks — `/api/blocks`
```

por:

```text
| `DELETE` | `/:contactId` | ✓ | Remove a contact |

A blocked user is not a contact: `GET`/`PATCH`/`DELETE /:contactId` answer 404 for them, and unblocking only happens through `DELETE /api/blocks/:userId`.

### Blocks — `/api/blocks`
```

6. Chat — inserir imediatamente antes da linha `### Rate limiting`:

```markdown
### Chat — `/api/conversations`

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `POST` | `/direct` | ✓ | `{ userId }` — 1:1 conversation; idempotent (201 new, 200 existing); 403 if either side blocked the other |
| `POST` | `/group` | ✓ | `{ name, participantIds[] }` — the creator becomes `admin`; up to 256 participants including the creator |
| `GET` | `/` | ✓ | `archived`, `limit` (≤ 100), `offset`; most recent activity first; each item carries its participants and the caller's membership (`role`, `isMuted`, `archivedAt`) |
| `GET` | `/:id` | ✓ | 404 for non-participants (existence isn't revealed) |
| `PATCH` | `/:id` | ✓ | `{ name }` — groups only, admins only |
| `POST` · `DELETE` | `/:id/archive` | ✓ | Archive / unarchive, per participant |
| `POST` | `/:id/leave` | ✓ | Groups only; if the last admin leaves, the oldest member is promoted; an empty group is deleted |
| `POST` | `/:id/members` | ✓ | `{ userIds[] }` — admins only; current participants are ignored |
| `DELETE` | `/:id/members/:userId` | ✓ | Admins only; removing yourself is the same as leaving |
| `GET` | `/:id/messages` | ✓ | Newest first, `limit` ≤ 50, cursor `before=<messageId>`; returns `{ messages, nextCursor }`; deleted messages come back as tombstones (`content: null`) |
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions? }` — text 1–10,000 characters; 403 in a 1:1 conversation where either side blocked the other |
| `DELETE` | `/:id/messages/:messageId` | ✓ | Author only; soft delete, idempotent |

Messages live only in MongoDB (`messages` collection, index `{ conversationId: 1, createdAt: -1, _id: -1 }`); conversations and participants live in PostgreSQL. The module publishes `chat:conversation-created`, `chat:conversation-updated`, `chat:message-sent` and `chat:message-deleted` on the EventBus; a listener registered at bootstrap updates `contacts.last_interaction_at` on every direct message.
```

7. TRUST_PROXY — no parágrafo que começa com `` `TRUST_PROXY` (unset by default) ``, trocar o final:

```text
when running behind a trusted proxy — see [Configuration](#configuration).
```

por:

```text
when running behind a trusted proxy — see [Configuration](#configuration). Avoid `TRUST_PROXY=true` outside a controlled setup: it trusts any `X-Forwarded-For` header, so clients can spoof their IP and dodge the rate limit — prefer a hop count or the proxies' IPs/subnets.
```

e, na tabela de Configuration, trocar:

```text
| `TRUST_PROXY` | `app.set('trust proxy', …)`; unset keeps Express's default (`false`) — see [Rate limiting](#rate-limiting) |
```

por:

```text
| `TRUST_PROXY` | `app.set('trust proxy', …)`; unset keeps Express's default (`false`) — see [Rate limiting](#rate-limiting); prefer a hop count or proxy IPs over `true` (IP spoofing) |
```

8. EventBus — trocar ``(e.g. auth events, `user:blocked` / `user:unblocked`)`` por ``(e.g. auth events, `user:blocked` / `user:unblocked`, `chat:message-sent`)``.

9. Tests — trocar `2,094 Jest tests in 122 suites` pelos números do Step 1 (ex.: `2,507 Jest tests in 148 suites`).

10. Project structure — trocar:

```text
│   └── user/                 Profile controller · services (Profile, User,
│                             Contact, Avatar) · repositories · models · routes
```

por:

```text
│   ├── user/                 Profile, Contact, Block and User controllers ·
│   │                         services (Profile, User, Contact, Avatar) ·
│   │                         repositories · models · routes
│   └── chat/                 Conversation and Message controllers · services ·
│                             repositories (PostgreSQL + MongoDB) · models ·
│                             listeners · validation · routes
```

e trocar:

```text
└── feature/                  supertest against the Express app
```

por:

```text
├── feature/                  supertest against the Express app
└── support/                  in-memory fakes used by feature tests
```

11. Roadmap — trocar:

```text
- [x] Contacts, blocks and user search — REST endpoints, EventBus events, rate limiting on auth routes
```

por:

```text
- [x] Contacts, blocks and user search — REST endpoints, EventBus events, rate limiting on auth routes
- [x] Chat base — 1:1 and group conversations, messages in MongoDB with cursor pagination, REST API and EventBus events
```

e trocar `- [ ] Chat — conversations and messages over Socket.IO, history in MongoDB` por `- [ ] Real-time — Socket.IO delivery, delivered/read receipts and typing indicators`.

- [ ] **Step 9: Atualizar `README.pt-BR.md` (mesmas mudanças, em português)**

1. Hero — trocar:

```text
API Express 5 com autenticação por token e perfis de usuário hoje; mensagens via WebSocket, presença, notificações e busca a caminho
```

por:

```text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat via REST hoje; entrega via WebSocket, presença, notificações e busca a caminho
```

2. Badge `tests-2094%20Jest` → total do Step 1.

3. Aviso — trocar a linha que começa com `> **Em desenvolvimento.**` por:

```markdown
> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios e a API REST de chat (conversas 1:1 e em grupo, mensagens no MongoDB) estão implementados e testados sobre a infraestrutura compartilhada. A entrega em tempo real via WebSocket é o próximo marco — veja o [roadmap](#roadmap).
```

4. Arquitetura — conteúdo do bloco mermaid:

```text
flowchart LR
    C[Cliente] -->|HTTP · Bearer JWT| API[API Express 5]
    API --> AUTH[módulo auth]
    API --> USER[módulo user]
    API --> CHAT[módulo chat]
    API -.-> RT[tempo real · WebSocket]
    API -.-> NOTIF[notificações]
    API -.-> SEARCH[busca]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER --> RD[(Redis<br/>rate limit · cache)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>logs estruturados)]
    CHAT --> MG[(MongoDB<br/>mensagens)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT --> EB{{EventBus}}

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class RT,NOTIF,SEARCH,ES planned
```

5. Contatos — trocar:

```text
| `GET` | `/` | ✓ | Lista os próprios contatos, paginado, com filtros |
```

por:

```text
| `GET` | `/` | ✓ | Lista os próprios contatos, paginado, com filtros; `orderBy=lastInteraction` ordena pela última mensagem direta (quem nunca conversou fica no fim) |
```

e trocar:

```text
| `DELETE` | `/:contactId` | ✓ | Remove um contato |

### Bloqueios — `/api/blocks`
```

por:

```text
| `DELETE` | `/:contactId` | ✓ | Remove um contato |

Um usuário bloqueado não é contato: `GET`/`PATCH`/`DELETE /:contactId` respondem 404 para ele, e o desbloqueio só acontece por `DELETE /api/blocks/:userId`.

### Bloqueios — `/api/blocks`
```

6. Chat — inserir imediatamente antes da linha `### Rate limit`:

```markdown
### Chat — `/api/conversations`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `POST` | `/direct` | ✓ | `{ userId }` — conversa 1:1; idempotente (201 nova, 200 existente); 403 se houver bloqueio em qualquer sentido |
| `POST` | `/group` | ✓ | `{ name, participantIds[] }` — o criador vira `admin`; até 256 participantes contando o criador |
| `GET` | `/` | ✓ | `archived`, `limit` (≤ 100), `offset`; atividade mais recente primeiro; cada item traz os participantes e a participação de quem pede (`role`, `isMuted`, `archivedAt`) |
| `GET` | `/:id` | ✓ | 404 para quem não participa (não revela a existência) |
| `PATCH` | `/:id` | ✓ | `{ name }` — só grupos, só admins |
| `POST` · `DELETE` | `/:id/archive` | ✓ | Arquiva / desarquiva, por participante |
| `POST` | `/:id/leave` | ✓ | Só grupos; se o último admin sai, o membro mais antigo é promovido; grupo vazio é removido |
| `POST` | `/:id/members` | ✓ | `{ userIds[] }` — só admins; quem já participa é ignorado |
| `DELETE` | `/:id/members/:userId` | ✓ | Só admins; remover a si mesmo equivale a sair |
| `GET` | `/:id/messages` | ✓ | Mais recentes primeiro, `limit` ≤ 50, cursor `before=<messageId>`; retorna `{ messages, nextCursor }`; mensagens apagadas voltam como tombstone (`content: null`) |
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions? }` — texto de 1 a 10.000 caracteres; 403 em conversa 1:1 com bloqueio em qualquer sentido |
| `DELETE` | `/:id/messages/:messageId` | ✓ | Só o autor; soft delete, idempotente |

As mensagens ficam só no MongoDB (coleção `messages`, índice `{ conversationId: 1, createdAt: -1, _id: -1 }`); conversas e participantes ficam no PostgreSQL. O módulo publica `chat:conversation-created`, `chat:conversation-updated`, `chat:message-sent` e `chat:message-deleted` no EventBus; um listener registrado no bootstrap atualiza `contacts.last_interaction_at` a cada mensagem direta.
```

7. TRUST_PROXY — trocar o final do parágrafo:

```text
ao rodar atrás de um proxy confiável — veja a seção Configuração, abaixo.
```

por:

```text
ao rodar atrás de um proxy confiável — veja a seção Configuração, abaixo. Evite `TRUST_PROXY=true` fora de um ambiente controlado: ele confia em qualquer header `X-Forwarded-For`, então clientes podem forjar o IP e escapar do rate limit — prefira o número de hops ou os IPs/sub-redes dos proxies.
```

e, na tabela de Configuração, trocar:

```text
| `TRUST_PROXY` | `app.set('trust proxy', …)`; sem definir mantém o padrão do Express (`false`) — veja Rate limit, acima |
```

por:

```text
| `TRUST_PROXY` | `app.set('trust proxy', …)`; sem definir mantém o padrão do Express (`false`) — veja Rate limit, acima; prefira número de hops ou IPs dos proxies a `true` (spoof de IP) |
```

8. EventBus — trocar ``(ex.: eventos de auth, `user:blocked` / `user:unblocked`)`` por ``(ex.: eventos de auth, `user:blocked` / `user:unblocked`, `chat:message-sent`)``.

9. Testes — trocar `2.094 testes Jest em 122 suítes` pelos números do Step 1 (ex.: `2.507 testes Jest em 148 suítes`).

10. Estrutura — trocar:

```text
│   └── user/                 controller de Profile · services (Profile, User,
│                             Contact, Avatar) · repositories · models · rotas
```

por:

```text
│   ├── user/                 controllers de Profile, Contact, Block e User ·
│   │                         services (Profile, User, Contact, Avatar) ·
│   │                         repositories · models · rotas
│   └── chat/                 controllers de Conversation e Message · services ·
│                             repositories (PostgreSQL + MongoDB) · models ·
│                             listeners · validação · rotas
```

e trocar:

```text
└── feature/                  supertest contra o app Express
```

por:

```text
├── feature/                  supertest contra o app Express
└── support/                  fakes em memória usados pelos feature tests
```

11. Roadmap — trocar:

```text
- [x] Contatos, bloqueios e busca de usuários — rotas REST, eventos no EventBus, rate limit nas rotas de auth
```

por:

```text
- [x] Contatos, bloqueios e busca de usuários — rotas REST, eventos no EventBus, rate limit nas rotas de auth
- [x] Chat base — conversas 1:1 e em grupo, mensagens no MongoDB com paginação por cursor, API REST e eventos no EventBus
```

e trocar `- [ ] Chat — conversas e mensagens via Socket.IO, histórico no MongoDB` por `- [ ] Tempo real — entrega via Socket.IO, confirmações de entrega/leitura e indicador de digitação`.

Conferir no preview do GitHub (ou `grep -n "Chat" README*.md`) que as tabelas renderizam e que nada de "planned" ficou apontando para o chat base.

- [ ] **Step 10: Atualizar o SRS local (`.github/SRS.md` — NÃO commitar; está em `.git/info/exclude`)**

1. Seção 9.1 — trocar as linhas

```
3. ChatService processa mensagem
4. MessageRepository salva no PostgreSQL (registro básico)
5. Event Bus emite 'message.sent'
6. Listeners executam em paralelo:
   a. MongoDB: salva mensagem completa
   b. Elasticsearch: indexa conteúdo
```

por

```
3. MessageService valida participante, bloqueio (1:1), replyTo e menções
4. MessageService salva a mensagem no MongoDB (fonte única) e atualiza conversations.last_message_at
5. Event Bus emite 'chat:message-sent'
6. Listeners executam em paralelo:
   a. Contatos: atualiza contacts.last_interaction_at (conversas 1:1)
   b. Elasticsearch: indexa conteúdo
```

2. Em "Integration Tests", trocar `- ✅ POST /messages persiste no PostgreSQL e MongoDB` por `- ✅ POST /conversations/:id/messages persiste no MongoDB`.
3. Sprint 5: título → `### 📅 Sprint 5 (Semana 5): Módulo de Chat - Base ✅`; marcar todas as tarefas com `[x]`, trocando `- [ ] Criar testes completos` por `- [x] Criar testes completos (unitários, feature com supertest; 100% de cobertura)`; no entregável, trocar `- ✅ Mensagens persistidas em PostgreSQL e MongoDB` por `- ✅ Mensagens persistidas no MongoDB (fonte única — roadmap §2.4)`.

Conferir que o arquivo não aparece como staged: `git status --short .github` deve listar só `.github/workflows` se modificado (não deve estar) — nunca `SRS.md`.

- [ ] **Step 11: Commitar a documentação**

```bash
git add README.md README.pt-BR.md
git commit -m "📝 docs: documenta a API de chat e atualiza arquitetura e roadmap"
git status --short
```

Expected: árvore limpa (exceto arquivos locais ignorados).

- [ ] **Step 12: Push e PR**

Criar `$SCRATCH/pr-body.md`:

```markdown
## Resumo
- Módulo `chat`: conversas 1:1 (idempotentes, `direct_key` única) e em grupo (até 256, admin/member) no PostgreSQL; mensagens no MongoDB (fonte única) com paginação por cursor, `replyTo`, menções e soft delete (tombstone)
- API REST `/api/conversations` (13 rotas, todas autenticadas) com validação Zod
- Eventos no EventBus: `chat:message-sent`, `chat:message-deleted`, `chat:conversation-created`, `chat:conversation-updated`
- Regras de bloqueio: 403 ao criar/enviar em conversa 1:1 com bloqueio em qualquer sentido; não participante recebe 404
- Contatos: ordenação por última interação (`contacts.last_interaction_at`, atualizado por listener de `chat:message-sent`); linha bloqueada deixa de ser contato (404); `created_by_block` NOT NULL e interno; block/unblock sem eventos duplicados sob concorrência; busca exclui bloqueados via subconsulta com `replacements`
- `.env.example`/READMEs: alerta sobre `TRUST_PROXY=true`

## Requisitos
RF003.1, RF003.2 (via REST), RF005.1, RF005.2, RF002.2

## Testes
- Unitários de models, repositórios, services, listener, schemas, controllers e rotas (100% de cobertura)
- Feature tests HTTP (supertest) com services reais sobre repositórios em memória
- Smoke na stack real (portas alternativas): migrations up/down/up, direct idempotente e corrida, paginação com cursor, tombstone, bloqueio 403, 404 de não participante, contatos por última interação, índice do MongoDB
```

```bash
git push -u origin feature/chat-base
gh pr create --base main --head feature/chat-base \
  --title "✨ Sprint 5: chat base (conversas, mensagens e eventos)" \
  --body-file "$SCRATCH/pr-body.md"
```

Se `gh pr create` falhar (ex.: GraphQL/permissão), usar a API REST:

```bash
gh api repos/GabeSilvaDev/realtime-messaging-platform/pulls \
  -f title="✨ Sprint 5: chat base (conversas, mensagens e eventos)" \
  -f head=feature/chat-base -f base=main \
  -F body=@"$SCRATCH/pr-body.md" --jq .html_url
```

Expected: URL do PR impressa. Acompanhar o CI (`gh pr checks --watch`); o merge fica a cargo do controlador depois do CI verde e da revisão.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** §2 estrutura → Tasks 5–13; §3.1 tabelas/colunas → Tasks 2, 5, 11 (migrations + models); §3.2 coleção `messages` e índice → Task 6; §4 conversas (createDirect idempotente com transação e releitura na violação de unicidade, createGroup com dedupe/limite/404 listando ausentes, list com filtro/ordem/participantes/membership, get 404, rename, archive/unarchive, leave com promoção/remoção, addMembers, removeMember, consultas `isParticipant`/`getParticipantIds`/`getUserConversationIds`) → Tasks 7 e 9; mensagens (send com participante/bloqueio/trim/replyTo/menções/`last_message_at`/evento; list com cursor e tombstone; delete autor/idempotente/evento) → Tasks 8 e 10; consistência de bloqueio em contatos → Tasks 2–4; RF002.2 → Task 11; §5 eventos → Tasks 1, 9, 10, 11 e bootstrap na Task 13; §6 API e metadados (`req.ip`, user-agent ≤ 255) → Tasks 12–13; §7 testes/smoke → Tasks 1–14 e 15; §8 docs → Task 15.
- **Placeholders:** nenhum trecho "TBD"/"implementar depois"; todo código de `src` e `tests` está completo. Os únicos valores preenchidos na execução são medidos (totais de testes no Step 1 da Task 15, `$SCRATCH`).
- **Consistência de tipos/nomes:** `BlockResult`, `ContactModelAttributes`, `touchInteraction`/`recordInteraction`, `IConversationRepository`/`IParticipantRepository`/`IMessageRepository`, `IConversationService`/`IMessageService`, `buildDirectKey`, `parseConversationId`, `registerChatListeners`, `conversationRoutes` e os payloads de `ChatEvents` usados nas tasks posteriores são exatamente os definidos nas anteriores. Todo o código foi validado numa cópia do repositório: estado final com todas as suítes passando, 100% de cobertura, `tsc --noEmit`, `eslint src` e `prettier --check` limpos, e cada task verificada isoladamente na ordem do plano.
