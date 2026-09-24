# Subprojeto 3 — Real-Time com Socket.IO (Sprint 6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comunicação em tempo real sobre o servidor HTTP existente — handshake JWT, rooms por usuário e por conversa, envio por WebSocket (idempotente por `clientMessageId`), status entregue/lido (RF003.4), indicador de digitação (RF003.5), ponte EventBus → sockets, Redis adapter para escala horizontal e cliente demo em `/demo` — fechando antes as pendências herdadas do subprojeto 2 (spec §13).

**Architecture:** Novo módulo `src/modules/realtime` (constants, types, errors, validation, middlewares, services, handlers, listeners, server) que só consome o chat por interfaces (`IConversationService`/`IMessageService`) e pelo EventBus. `createRealtimeServer(httpServer)` cria o `Server` do Socket.IO com o mesmo CORS do HTTP, o `@socket.io/redis-adapter` (fora de `NODE_ENV=test`), dois middlewares de handshake (`socketAuth` → `joinRooms`), os handlers por conexão (mensagens e digitação, todos com ack) e a ponte síncrona `registerRealtimeListeners` (EventBus → rooms); `src/server.ts` passa a usar `http.createServer(app)` e encerra tudo em SIGTERM/SIGINT. O chat ganha status de entrega/leitura e `clientMessageId` no MongoDB, `markDelivered`/`markRead` com eventos, `POST /api/conversations/:id/read`, lock `SELECT ... FOR UPDATE` em `leave`/`removeMember`/`addMembers` e subscribers assíncronos no EventBus para os listeners pesados.

**Tech Stack:** Node 20, TypeScript 5.9 (strict), Express 5, Socket.IO 4.8 + `@socket.io/redis-adapter` 8.3 (ioredis 5), Sequelize 6 + PostgreSQL 17, Mongoose 9 + MongoDB 8, Zod 4, Jest 30 + ts-jest + supertest + socket.io-client 4.8.

**Spec:** `docs/superpowers/specs/2026-09-25-subprojeto-3-realtime-design.md` (fonte da verdade) · convenções em `docs/superpowers/specs/2026-09-23-roadmap-finalizacao-design.md` §2 · estilo do plano anterior: `docs/superpowers/plans/2026-09-24-subprojeto-2-chat-base.md`.

## Global Constraints

- Branch `feature/realtime` já existe — não há passo de criação de branch. Confirme com `git branch --show-current` antes da Task 1.
- NUNCA criar, modificar ou sobrescrever `.env` (segredos reais). Overrides vão como variáveis na linha de comando. NUNCA `docker compose down -v`.
- Rodar jest SEMPRE como `node node_modules/.bin/jest ...` (nunca `npx jest`: um hook reescreve e filtra a saída). `jest.config.ts` usa `roots: [src, tests]`, threshold global de 90% e a cobertura real é 100% — todo arquivo novo em `src/` precisa de teste; manter 100% (statements, branches, functions, lines).
- A suíte não depende do `.env`: basta que as variáveis de banco estejam preenchidas (qualquer valor), como no CI. Sem `.env` carregado, prefixe os comandos jest/tsc com `NODE_ENV=test POSTGRES_USER=ci POSTGRES_PASSWORD=ci POSTGRES_DB=ci REDIS_PASSWORD=ci MONGO_USER=ci MONGO_PASSWORD=ci MONGO_DB=ci ELASTIC_PASSWORD=ci`. Nenhum teste deste plano lê valores do `.env`; o que precisa de env seta no próprio teste (ex.: `env: { NODE_ENV: 'test' }` em `createRealtimeServer`).
- `jest.config.ts` tem `resetMocks`, `restoreMocks` e `clearMocks`: NUNCA colocar implementação de mock dentro de factory de `jest.mock` (nada de `jest.fn(() => ...)`/`mockReturnValue` na factory). Use funções simples na factory ou configure `mockResolvedValue`/`mockImplementation` em `beforeEach`/no próprio teste. `jest.fn()` sem implementação na factory é ok.
- `tests/setup.ts` não chama `initLogger` (só cria `Logger.getInstance`): mocke `@/shared/logger` ou chame `initLogger` num `beforeAll` onde código real usa `getLogger()` (ex.: `buildCorsOptions`, usado por `createRealtimeServer`).
- Prettier é verificado no CI (`npm run format:check` cobre `src/**/*.ts` e `tests/**/*.ts`): rodar `node node_modules/.bin/prettier --write <arquivos>` antes de cada commit. ESLint `strictTypeChecked` em `src`: `node node_modules/.bin/eslint src` deve sair com código 0. `tsconfig.json` inclui `tests/**`: `node node_modules/.bin/tsc --noEmit` também checa os testes. ts-jest roda com `isolatedModules` (sem checagem de tipos): erros de tipo só aparecem no `tsc`.
- Commits: gitmoji + Conventional Commits em PT-BR, atômicos; NUNCA mencionar Claude/Anthropic/IA nem adicionar `Co-Authored-By`; NUNCA commitar `.github/SRS.md`, `*.stale-root/` nem `.env*` (exceto `.env.example`). Sempre `git add <arquivos explícitos>` (nunca `git add -A`/`git add .`).
- Validação com stack real usa portas alternativas: `POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301`; app no host com `PORT=3100` (fluxo "Running the app (on the host)" do README, com `MONGODB_URL` montada com credenciais `encodeURIComponent` lidas do `.env` SEM modificá-lo); NUNCA tocar containers/processos de outros projetos (portas 3000/5432/6379 do host são deles); o container `rtm-app` não funciona — não usar. Os volumes são novos: rodar as migrations primeiro.
- Express 5: `req.query` é somente leitura — apenas ler. Fixtures de UUID devem ser v4 válidos (ex.: `11111111-1111-4111-8111-111111111111`); ObjectId: 24 hex (ex.: `65f000000000000000000001`).
- Testes de integração com `socket.io-client`: porta efêmera (`listen(0)`), fechar io/servidor HTTP e sockets cliente em `afterEach`/`afterAll` (sem open handles — rodar uma vez com `--detectOpenHandles` para provar), `transports: ['websocket']`, e TTL de digitação injetado curto (nada de esperar 3s reais nos testes Jest).
- Módulos só se consomem por interface exportada ou EventBus (roadmap §2.3): o realtime usa `IConversationService`/`IMessageService`/`IAuthService` e os singletons `conversationService`/`messageService`/`authService` importados dos arquivos de service — nunca repositórios do chat. `src/shared` não importa nada de `src/modules` (teste de camadas na Task 1).
- Limites (spec §5/§8): payload de `message:send` = corpo de `POST /messages` (`sendMessageSchema`) + `conversationId` UUID; `clientMessageId` UUID opcional; digitação só em conversa `direct`, expira em `TYPING_TTL_MS = 3000`; device = user-agent truncado a 255.
- Ack de todo evento cliente→servidor: `{ ok: true, data }` ou `{ ok: false, error: { code, message, statusCode, details? } }`; `message:send` devolve a `MessageDTO`, os demais `data: null`. Erro inesperado → `INTERNAL_ERROR` 500 ("Erro interno do servidor") e log.

## Decisões de design (ambiguidades do spec resolvidas)

1. **Camadas (§13):** `MessageContentType`, `MessageContent`, `MessageStatusEntry`, `MessageStatusDTO` e `MessageDTO` passam a morar em `src/shared/types/chat-message.types.ts`; o módulo chat os re-exporta com os mesmos nomes (`@/modules/chat/types` continua funcionando). `MESSAGE_CONTENT_TYPES` usa `satisfies readonly MessageContentType[]` para não divergir. Um teste de arquitetura garante que nada em `src/shared` importa `src/modules`.
2. **Listeners pesados fora do caminho da requisição (§13):** o EventBus ganha a opção **por subscriber** `{ async: true }` (callback agendado com `setImmediate`, `publish` não o aguarda, falhas só contam em `totalErrors`, `once` desinscreve no despacho). Os dois listeners do chat (`recordInteraction` em `MESSAGE_SENT` e `deleteByConversation` em `CONVERSATION_DELETED`) passam a usá-la. Rejeitado `publish(..., { async: true })`: atrasaria também a ponte Socket.IO, que deve continuar síncrona (latência < 100 ms, sem I/O).
3. **Lock da conversa (§13):** `IConversationRepository.withLock(conversationId, work)` abre `sequelize.transaction`, faz `Conversation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })` (`SELECT ... FOR UPDATE`) e executa `work(transaction)`. `ChatTransaction` (= `Transaction` do Sequelize) é repassado como último parâmetro opcional de `findById`/`delete` e de `find`/`listByConversation`/`addMembers`/`remove`/`setRole` do `IParticipantRepository`. `leave`, `removeMember` e `addMembers` fazem leitura de participação, checagens (admin, limite de 256) e escrita dentro do lock; os eventos só são publicados depois do commit (falha dentro do lock ⇒ nada publicado). Conversa inexistente não trava nada — `work` roda e responde 404. O repositório em memória executa `work` diretamente.
4. **`removeMember` com retorno `deleted` (§13):** publica `CONVERSATION_DELETED` com `participantIds: [memberId]` (quem participava imediatamente antes) e não publica `member_removed`. Sob o lock o caminho é defensivo (o admin ainda participa), mas fica coberto. JSDoc do evento corrigido.
5. **Idempotência (§6.1):** `IMessageRepository.create` passa a devolver `{ record, created }`; violação E11000 do índice único parcial `{ senderId: 1, clientMessageId: 1 }` (`partialFilterExpression: { clientMessageId: { $type: 'string' } }` — `null` não colide) devolve a existente com `created: false`. O service consulta `findByClientMessageId` logo após validar participação/conversa (antes do bloqueio, de `replyTo` e menções — um reenvio de algo já gravado não é revalidado) e, havendo a mensagem, a devolve sem evento e sem `last_message_at`. O mesmo `clientMessageId` em **outra** conversa responde **409** (`ClientMessageIdConflictException`). Via REST o reenvio responde 201 com o mesmo corpo.
6. **Status (§6):** `markDelivered` permite marcar mensagem apagada (inofensivo) e é no-op para o autor; `markRead` marca (e completa `deliveredTo`) só mensagens não apagadas de outros autores com `createdAt <= alvo`, em dois `updateMany` (entregue, depois lida) — retorna quantas passaram a lidas; `participants.last_read_at` avança sempre (`advanceLastReadAt`, nunca retrocede), mas `MESSAGE_READ` só é publicado quando algo mudou. `sentAt = createdAt`; tombstones mantêm `status`.
7. **Rooms no handshake:** a entrada nas rooms (`user:<id>` + `conversation:<id>` de `getUserConversationIds`) acontece num segundo middleware (`joinRooms`), não no handler `connection`: assim as rooms já existem quando o cliente recebe `connect` (nenhuma mensagem logo após conectar se perde) e cada reconexão as restaura. Falha ao carregar conversas ⇒ `connect_error` com `message: 'INTERNAL_ERROR'` (e log).
8. **Ponte (§7):** além do especificado, avisos que dependem de mudança de participação (`conversation:new`, `conversation:updated`, `conversation:deleted`) vão para `[room da conversa, ...rooms user:<id> dos afetados]` numa única emissão (o Socket.IO não duplica a entrega) — robusto mesmo se o `socketsJoin` ainda não tiver propagado entre instâncias. Ordem: `members_added` faz `socketsJoin` e depois emite; `member_left`/`member_removed` emitem e depois `socketsLeave`; `CONVERSATION_DELETED` emite e esvazia a room.
9. **`createRealtimeServer`** também registra a ponte (`registerRealtimeListeners(io, bus)`) e devolve `{ io, close }`; `close()` cancela a ponte, chama `io.close()` (que fecha sockets **e** o servidor HTTP) e faz `quit()` nos dois clientes pub/sub. Como o `server.ts` é quem chama `createRealtimeServer`, a ponte continua "registrada no server.ts após criar o io" e fora do app dos testes HTTP. `server.ts` trata SIGTERM/SIGINT: `realtime.close()` → `shutdown()` → `process.exit`.
10. **Adapter:** `shouldUseRedisAdapter(env)` = `REALTIME_REDIS_ADAPTER !== 'false' && NODE_ENV !== 'test'`; pub/sub = `redis.duplicate()` ×2 (o `lazyConnect` herdado conecta no primeiro comando do adapter). Validado no scratch contra um Redis real: `message:new` e `socketsJoin` atravessam instâncias.
11. **CORS:** `buildCorsOptions()` é extraído de `src/shared/middlewares/cors.ts` e passado a `new Server(httpServer, { cors })` — mesma política (`ALLOWED_ORIGINS` em produção, qualquer origem fora).
12. **Digitação (§8):** `TypingService` guarda `Map<socketId, Map<conversationId, Timeout>>` (equivalente ao `socketId:conversationId` do spec, mas com limpeza O(1) por socket no disconnect). A validação (participante + `direct`) usa o novo `IConversationService.getTypeForParticipant(userId, conversationId)` (404 para não participante) e só roda quando o indicador não está ativo — renovações não consultam o banco. Grupo ⇒ `TypingNotAllowedException` (400 `BAD_REQUEST`). `typing:stop` sem indicador ativo responde ok sem emitir. A limpeza na desconexão usa o evento `disconnecting`.
13. **Ack:** helper `withAck(context, schema, run)`; validação Zod ⇒ `VALIDATION_ERROR` 400 "Dados inválidos" com `details: [{ field, message }]`. Sem ack (ou ack que não é função) o evento é processado; recusas 4xx viram `logger.warn`, falhas 5xx sempre `logger.error`.
14. **Metadados do socket:** `ip = socket.handshake.address` (não lê `X-Forwarded-For`), `device = user-agent` truncado a 255 (`CHAT_CONSTANTS.MAX_DEVICE_LENGTH`).
15. **Demo:** servida de `path.resolve(process.cwd(), 'public', 'demo')` (a app sempre roda a partir da raiz, inclusive `npm start` com `dist/`); usa `crypto.randomUUID()` para `clientMessageId` (contexto seguro em `localhost`) e só `textContent` para dados do usuário.
16. **Testes:** unitários com socket/io falsos em `tests/support/realtime/fakeSocket.ts` (arquivo de suporte, não casa com `testMatch`); `createRealtimeServer` tem um teste com servidor real em porta efêmera para cobrir o handler `connection`; a integração ponta a ponta (`tests/feature/modules/realtime/realtime.test.ts`) usa os services reais do chat (singletons) sobre `tests/support/chat/inMemoryChat.ts`, auth e módulo user falsos, TTL de digitação 150 ms.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/types/chat-message.types.ts` | Criar | Contrato público da mensagem (`MessageDTO`, status) |
| `src/shared/types/index.ts` | Modificar | Re-exporta os tipos da mensagem |
| `src/shared/interfaces/event.interfaces.ts` | Modificar | Importa `MessageDTO` de shared; `SubscriptionOptions.async`; payloads `MESSAGE_DELIVERED`/`MESSAGE_READ`; JSDoc `CONVERSATION_DELETED` |
| `src/shared/event-bus/EventBus.ts` | Modificar | Subscribers `{ async: true }` (`runDetached`) |
| `src/shared/middlewares/cors.ts`, `index.ts` | Modificar | `buildCorsOptions` reusável pelo Socket.IO |
| `src/modules/chat/constants/chat.constants.ts` | Modificar | `MESSAGE_CONTENT_TYPES satisfies` |
| `src/modules/chat/types/{chat,message}.types.ts` | Modificar | `ChatTransaction`; re-exports; campos de status/idempotência |
| `src/modules/chat/interfaces/*` | Modificar | `withLock`, transações, `findByClientMessageId`, `markDelivered`, `markReadUpTo`, `advanceLastReadAt`, `markDelivered`/`markRead`, `getTypeForParticipant` |
| `src/modules/chat/models/Message.ts` | Modificar | `clientMessageId`, `deliveredTo`, `readBy`, índice único parcial |
| `src/modules/chat/repositories/*` | Modificar | Lock, transações, status, idempotência |
| `src/modules/chat/services/*` | Modificar | Lock + `publishRemoval`; idempotência; `markDelivered`/`markRead`; `getTypeForParticipant` |
| `src/modules/chat/listeners/chat.listeners.ts` | Modificar | Subscribers `{ async: true }` |
| `src/modules/chat/errors/*`, `validation/*`, `controllers/MessageController.ts`, `routes/conversation.routes.ts` | Modificar | 409 de `clientMessageId`; `clientMessageId` no schema; `markReadSchema`; `POST /:id/read` |
| `src/modules/realtime/constants/*` | Criar | Eventos, rooms, TTL, erros do handshake |
| `src/modules/realtime/types/*` | Criar | Eventos tipados, ack, `SocketData`, `RealtimeServer`/`RealtimeSocket`, `SocketMiddleware` |
| `src/modules/realtime/errors/*` | Criar | `TypingNotAllowedException` |
| `src/modules/realtime/validation/*` | Criar | Schemas Zod dos payloads recebidos |
| `src/modules/realtime/middlewares/*` | Criar | `socketAuth`, `joinRooms` |
| `src/modules/realtime/services/*` | Criar | `TypingService` |
| `src/modules/realtime/handlers/*` | Criar | `withAck`, handlers de mensagem e digitação |
| `src/modules/realtime/listeners/*` | Criar | Ponte EventBus → Socket.IO |
| `src/modules/realtime/server/*` | Criar | `createRealtimeServer`, `shouldUseRedisAdapter` |
| `src/modules/realtime/index.ts` | Criar | Barrel do módulo |
| `src/server.ts` | Modificar | `http.createServer(app)` + Socket.IO + SIGTERM/SIGINT |
| `src/app.ts` | Modificar | `express.static` em `/demo` |
| `public/demo/{index.html,app.js,styles.css}` | Criar | Cliente demo |
| `.env.example` | Modificar | `REALTIME_REDIS_ADAPTER` |
| `package.json`, `package-lock.json` | Modificar | `socket.io`, `@socket.io/redis-adapter`, `socket.io-client` (dev) |
| `tests/support/chat/inMemoryChat.ts` | Modificar | `withLock`, status, idempotência, `advanceLastReadAt` |
| `tests/support/realtime/fakeSocket.ts` | Criar | Socket/io falsos para unitários |
| `tests/unit/**`, `tests/feature/modules/{chat,realtime}/*` | Criar/Modificar | Ver cada task |
| `README.md`, `README.pt-BR.md` | Modificar | WebSocket, status, `/read`, `/demo`, arquitetura, roadmap |
| `.github/SRS.md` | Modificar (local, NÃO commitar) | Sprint 6 |

Comando de verificação usado ao fim de cada task (abreviado como **"verificação completa"**):

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: `tsc` e `eslint` sem erros (código 0), Prettier "All matched files use Prettier code style!", todas as suítes passando e o resumo com 100% em statements/branches/functions/lines.

---

### Task 1: Contrato `MessageDTO` em `src/shared` (camadas)

**Files:**
- Create: `tests/unit/shared/architecture/layering.test.ts`
- Create: `src/shared/types/chat-message.types.ts`
- Modify: `src/shared/types/index.ts`, `src/shared/interfaces/event.interfaces.ts`
- Modify: `src/modules/chat/types/message.types.ts`, `src/modules/chat/types/chat.types.ts`, `src/modules/chat/constants/chat.constants.ts`

**Interfaces:**
- Produces: `src/shared/types/chat-message.types.ts` exporta `MessageContentType = 'text'`, `MessageContent { type; text }`, `MessageDTO` (mesmos campos de hoje). `@/shared/types` e `@/modules/chat/types` re-exportam os três (o chat continua exportando `MessageContentType`, `MessageContent`, `MessageDTO`).

- [ ] **Step 1: Escrever o teste de camadas (falha hoje)**

Criar `tests/unit/shared/architecture/layering.test.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SHARED_DIR = join(__dirname, '../../../../src/shared');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTsFiles(fullPath);
    }
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('camadas — src/shared', () => {
  it('não deve importar nada de src/modules (shared é a base, módulos dependem dele)', () => {
    const offenders = listTsFiles(SHARED_DIR).filter((file) =>
      /from\s+['"](@\/modules\/|(\.\.\/)+modules\/)/.test(readFileSync(file, 'utf8'))
    );

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/shared/architecture --coverage=false`
Expected: FAIL — `offenders` contém `.../src/shared/interfaces/event.interfaces.ts`.

- [ ] **Step 3: Criar o contrato em shared e apontar o EventMap para ele**

Criar `src/shared/types/chat-message.types.ts`:

```ts
/**
 * Contrato público da mensagem de chat (REST, EventBus e Socket.IO).
 *
 * Fica em `shared` porque o `EventMap` (camada shared) o referencia no payload de
 * `chat:message-sent`; o módulo `chat` re-exporta estes tipos com os mesmos nomes.
 */
export type MessageContentType = 'text';

export interface MessageContent {
  type: MessageContentType;
  text: string;
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
```

Em `src/shared/types/index.ts`, logo após a linha `export { LogLevel, LogCategory } from './logger.types';`, acrescentar:

```ts
export type { MessageContentType, MessageContent, MessageDTO } from './chat-message.types';
```

Em `src/shared/interfaces/event.interfaces.ts`, trocar a primeira linha

```ts
import type { MessageDTO } from '@/modules/chat/types';
```

por

```ts
import type { MessageDTO } from '../types/chat-message.types';
```

- [ ] **Step 4: Re-exportar no módulo chat**

Substituir `src/modules/chat/types/message.types.ts` inteiro por:

```ts
import type { MessageContent, MessageDTO } from '@/shared/types/chat-message.types';

export type { MessageContent, MessageDTO } from '@/shared/types/chat-message.types';

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

Em `src/modules/chat/types/chat.types.ts`, trocar o cabeçalho

```ts
import type { CONVERSATION_TYPES, MESSAGE_CONTENT_TYPES, PARTICIPANT_ROLES } from '../constants';

export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type MessageContentType = (typeof MESSAGE_CONTENT_TYPES)[number];
```

por

```ts
import type { CONVERSATION_TYPES, PARTICIPANT_ROLES } from '../constants';

export type { MessageContentType } from '@/shared/types/chat-message.types';
export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
```

Substituir `src/modules/chat/constants/chat.constants.ts` inteiro por:

```ts
import type { MessageContentType } from '@/shared/types/chat-message.types';

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
export const MESSAGE_CONTENT_TYPES = ['text'] as const satisfies readonly MessageContentType[];
```

- [ ] **Step 5: Rodar o teste e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/shared/architecture --coverage=false` → PASS. Depois a **verificação completa** (Expected: tudo verde, 100%).

- [ ] **Step 6: Commit**

```bash
node node_modules/.bin/prettier --write src/shared/types src/shared/interfaces src/modules/chat/types src/modules/chat/constants tests/unit/shared/architecture
git add src/shared/types/chat-message.types.ts src/shared/types/index.ts src/shared/interfaces/event.interfaces.ts src/modules/chat/types/message.types.ts src/modules/chat/types/chat.types.ts src/modules/chat/constants/chat.constants.ts tests/unit/shared/architecture/layering.test.ts
git commit -m "♻️ refactor: move o contrato MessageDTO para shared e corrige a camada do EventMap"
```

---

### Task 2: Subscribers assíncronos no EventBus e listeners pesados do chat

**Files:**
- Create: `tests/unit/shared/event-bus/EventBus.async-subscriber.test.ts`
- Modify: `src/shared/event-bus/EventBus.ts`, `src/shared/interfaces/event.interfaces.ts`
- Modify: `src/modules/chat/listeners/chat.listeners.ts`
- Modify: `tests/unit/modules/chat/listeners/chat.listeners.test.ts`

**Interfaces:**
- Produces: `SubscriptionOptions.async?: boolean` — `bus.subscribe(event, cb, { async: true })` roda `cb` num `setImmediate`, fora do `await bus.publish(...)`; erros só incrementam `getStats().totalErrors`. `registerChatListeners` inscreve seus dois listeners com `{ async: true }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/unit/shared/event-bus/EventBus.async-subscriber.test.ts`:

```ts
import { EventBus } from '@/shared/event-bus/EventBus';

/** Deixa rodar os callbacks agendados com setImmediate e as promises encadeadas a eles. */
async function flushDetached(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('EventBus — subscriber com { async: true }', () => {
  const payload = { userId: '123', email: 'test@example.com' };
  let bus: EventBus;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('publish resolve sem esperar o subscriber assíncrono, que roda logo depois', async () => {
    const order: string[] = [];
    bus.subscribe(
      'user:created',
      () => {
        order.push('async');
      },
      { async: true }
    );
    bus.subscribe('user:created', () => {
      order.push('sync');
    });

    await bus.publish('user:created', payload);
    expect(order).toEqual(['sync']);

    await flushDetached();
    expect(order).toEqual(['sync', 'async']);
    expect(bus.getStats().totalProcessed).toBe(2);
  });

  it('erro no subscriber assíncrono não propaga e conta em totalErrors', async () => {
    bus.subscribe(
      'user:created',
      async () => {
        throw new Error('falhou');
      },
      { async: true }
    );

    await expect(bus.publish('user:created', payload)).resolves.toEqual(expect.any(String));
    await flushDetached();

    expect(bus.getStats().totalErrors).toBe(1);
    expect(bus.getStats().totalProcessed).toBe(0);
  });

  it('erro síncrono (throw) no subscriber assíncrono também é contido', async () => {
    bus.subscribe(
      'user:created',
      () => {
        throw new Error('falhou');
      },
      { async: true }
    );

    await bus.publish('user:created', payload);
    await flushDetached();

    expect(bus.getStats().totalErrors).toBe(1);
  });

  it('com once, é desinscrito no despacho e roda uma única vez', async () => {
    const callback = jest.fn();
    bus.subscribe('user:created', callback, { async: true, once: true });

    await bus.publish('user:created', payload);
    expect(bus.subscriberCount('user:created')).toBe(0);
    await bus.publish('user:created', payload);
    await flushDetached();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
```

Substituir `tests/unit/modules/chat/listeners/chat.listeners.test.ts` inteiro por (novo helper `flushDetached`, novo teste "roda fora do caminho de quem publica" e `await flushDetached()` depois de cada `publish`):

```ts
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/modules/chat/repositories', () => ({ messageRepository: {} }));
jest.mock('@/shared/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { registerChatListeners } from '@/modules/chat/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';

const mockLogger = logger as jest.Mocked<typeof logger>;

/** Os listeners do chat são `{ async: true }`: rodam num setImmediate depois do publish. */
async function flushDetached(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function messageSent(
  overrides: Partial<EventPayload<ChatEvents.MESSAGE_SENT>> = {}
): EventPayload<ChatEvents.MESSAGE_SENT> {
  const createdAt = new Date('2026-09-24T10:00:00.000Z');
  return {
    messageId: '65f000000000000000000001',
    conversationId: CONVERSATION_ID,
    conversationType: 'direct',
    senderId: USER_A,
    text: 'oi',
    mentions: [],
    replyTo: null,
    createdAt,
    participantIds: [USER_A, USER_B],
    message: {
      id: '65f000000000000000000001',
      conversationId: CONVERSATION_ID,
      senderId: USER_A,
      content: { type: 'text', text: 'oi' },
      replyTo: null,
      mentions: [],
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    ...overrides,
  };
}

function conversationDeleted(
  overrides: Partial<EventPayload<ChatEvents.CONVERSATION_DELETED>> = {}
): EventPayload<ChatEvents.CONVERSATION_DELETED> {
  return {
    conversationId: CONVERSATION_ID,
    actorId: USER_A,
    participantIds: [USER_A],
    ...overrides,
  };
}

describe('registerChatListeners', () => {
  let bus: EventBus;
  let contacts: { recordInteraction: jest.Mock };
  let messages: { deleteByConversation: jest.Mock };

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    contacts = { recordInteraction: jest.fn().mockResolvedValue(undefined) };
    messages = { deleteByConversation: jest.fn().mockResolvedValue(1) };
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('deve registrar a interação entre remetente e destinatário em conversa direct', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    expect(contacts.recordInteraction).toHaveBeenCalledWith(USER_A, USER_B);
  });

  it('roda fora do caminho de quem publica (subscribers com { async: true })', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
    expect(messages.deleteByConversation).not.toHaveBeenCalled();

    await flushDetached();

    expect(contacts.recordInteraction).toHaveBeenCalledTimes(1);
    expect(messages.deleteByConversation).toHaveBeenCalledTimes(1);
  });

  it('deve ignorar mensagens de grupo', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(
      ChatEvents.MESSAGE_SENT,
      messageSent({ conversationType: 'group', participantIds: [USER_A, USER_B, USER_C] })
    );
    await flushDetached();

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve ignorar direct sem outro participante', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent({ participantIds: [USER_A] }));
    await flushDetached();

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve cancelar as inscrições com a função retornada', async () => {
    const unregister = registerChatListeners(bus, contacts, messages);

    unregister();
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());
    await flushDetached();

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
    expect(messages.deleteByConversation).not.toHaveBeenCalled();
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_SENT)).toBe(false);
    expect(bus.hasSubscribers(ChatEvents.CONVERSATION_DELETED)).toBe(false);
  });

  it('deve usar o eventBus, o contactService e o messageRepository padrão quando nada é injetado', () => {
    const unregister = registerChatListeners();

    expect(typeof unregister).toBe('function');
    unregister();
  });

  describe('CONVERSATION_DELETED — mensagens órfãs', () => {
    it('deve apagar as mensagens da conversa removida', async () => {
      registerChatListeners(bus, contacts, messages);

      await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());
      await flushDetached();

      expect(messages.deleteByConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    });

    it('não deve propagar erro (best-effort) e deve logar a falha', async () => {
      const dbError = new Error('mongo down');
      messages.deleteByConversation.mockRejectedValue(dbError);
      registerChatListeners(bus, contacts, messages);

      await expect(
        bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted())
      ).resolves.not.toThrow();
      await flushDetached();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        dbError,
        expect.objectContaining({ conversationId: CONVERSATION_ID })
      );
    });

    it('deve envolver uma rejeição que não é Error antes de logar', async () => {
      messages.deleteByConversation.mockRejectedValue('mongo down');
      registerChatListeners(bus, contacts, messages);

      await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());
      await flushDetached();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'mongo down' }),
        expect.objectContaining({ conversationId: CONVERSATION_ID })
      );
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/shared/event-bus/EventBus.async-subscriber.test.ts tests/unit/modules/chat/listeners --coverage=false`
Expected: FAIL em "publish resolve sem esperar o subscriber assíncrono" (`['sync', 'async']` já no primeiro expect) e em "roda fora do caminho de quem publica" (listener chamado antes do flush). `tsc --noEmit` também acusa `async` inexistente em `SubscriptionOptions`.

- [ ] **Step 3: Implementar a opção por subscriber**

Em `src/shared/interfaces/event.interfaces.ts`, substituir a interface `SubscriptionOptions` por:

```ts
export interface SubscriptionOptions {
  once?: boolean;
  priority?: number;
  /**
   * Roda o callback fora do caminho de quem publica (agendado com setImmediate): `publish`
   * não o aguarda e erros só contam em `totalErrors`. Para listeners com I/O pesado.
   */
  async?: boolean;
}
```

Em `src/shared/event-bus/EventBus.ts`, dentro de `execute`, trocar

```ts
      for (const subscriber of sortedSubscribers) {
        try {
```

por

```ts
      for (const subscriber of sortedSubscribers) {
        if (subscriber.options.async === true) {
          this.runDetached(eventName, subscriber as Subscriber<K>, event);
          continue;
        }
        try {
```

e inserir o método privado abaixo imediatamente antes de `  public subscribe<K extends keyof EventMap>(`:

```ts
  /**
   * Executa um subscriber `{ async: true }` fora do caminho de quem publica (setImmediate):
   * `publish` não o aguarda e uma falha dele só conta em `totalErrors` (nunca propaga).
   */
  private runDetached<K extends keyof EventMap>(
    eventName: K,
    subscriber: Subscriber<K>,
    event: BaseEvent<EventPayload<K>>
  ): void {
    if (subscriber.options.once === true) {
      this.unsubscribe(eventName as string, subscriber.id);
    }

    setImmediate(() => {
      void Promise.resolve()
        .then(() => subscriber.callback(event))
        .then(
          () => {
            this.stats.totalProcessed++;
          },
          () => {
            this.stats.totalErrors++;
          }
        );
    });
  }
```

- [ ] **Step 4: Inscrever os listeners pesados do chat como assíncronos**

Substituir `src/modules/chat/listeners/chat.listeners.ts` inteiro por:

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import type { IMessageRepository } from '../interfaces';
import { messageRepository } from '../repositories';

const DETACHED = { async: true } as const;

/**
 * Registra os subscribers do módulo de chat no EventBus. Chamado no bootstrap (após as
 * conexões); retorna uma função que cancela todas as inscrições.
 *
 * - MESSAGE_SENT em conversa direct → atualiza `last_interaction_at` dos contatos (RF002.2).
 * - CONVERSATION_DELETED → apaga as mensagens órfãs da conversa no MongoDB (best-effort: uma
 *   falha aqui é logada, nunca propagada — a conversa já foi removida do Postgres).
 *
 * Ambos são inscritos com `{ async: true }`: fazem I/O que não precisa atrasar a resposta de
 * quem publicou (envio de mensagem, saída do grupo). A ponte Socket.IO continua síncrona.
 */
export function registerChatListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  contacts: Pick<IContactService, 'recordInteraction'> = contactService,
  messages: Pick<IMessageRepository, 'deleteByConversation'> = messageRepository
): () => void {
  const unsubscribers = [
    bus.subscribe(
      ChatEvents.MESSAGE_SENT,
      async ({ payload }) => {
        if (payload.conversationType !== 'direct') {
          return;
        }
        const otherId = payload.participantIds.find((id) => id !== payload.senderId);
        if (otherId === undefined) {
          return;
        }
        await contacts.recordInteraction(payload.senderId, otherId);
      },
      DETACHED
    ),
    bus.subscribe(
      ChatEvents.CONVERSATION_DELETED,
      async ({ payload }) => {
        try {
          await messages.deleteByConversation(payload.conversationId);
        } catch (error) {
          logger.error(
            'Falha ao apagar mensagens órfãs da conversa removida',
            error instanceof Error ? error : new Error(String(error)),
            { conversationId: payload.conversationId, actorId: payload.actorId }
          );
        }
      },
      DETACHED
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

- [ ] **Step 5: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/shared/event-bus tests/unit/modules/chat/listeners --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 6: Commit**

```bash
node node_modules/.bin/prettier --write src/shared src/modules/chat/listeners tests/unit/shared/event-bus tests/unit/modules/chat/listeners
git add src/shared/event-bus/EventBus.ts src/shared/interfaces/event.interfaces.ts src/modules/chat/listeners/chat.listeners.ts tests/unit/shared/event-bus/EventBus.async-subscriber.test.ts tests/unit/modules/chat/listeners/chat.listeners.test.ts
git commit -m "⚡ perf: executa listeners pesados do chat fora do caminho da requisição"
```

---

### Task 3: Lock da conversa em `leave`/`removeMember`/`addMembers` e `CONVERSATION_DELETED` no `removeMember`

**Files:**
- Modify: `src/modules/chat/types/chat.types.ts` (`ChatTransaction`)
- Modify: `src/modules/chat/interfaces/IConversationRepository.ts`, `src/modules/chat/interfaces/IParticipantRepository.ts`
- Modify: `src/modules/chat/repositories/ConversationRepository.ts`, `src/modules/chat/repositories/ParticipantRepository.ts`
- Modify: `src/modules/chat/services/ConversationService.ts`
- Modify: `src/shared/interfaces/event.interfaces.ts` (JSDoc de `CONVERSATION_DELETED`)
- Modify: `tests/support/chat/inMemoryChat.ts`
- Test: `tests/unit/modules/chat/repositories/ConversationRepository.test.ts`, `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`, `tests/unit/modules/chat/services/ConversationService.test.ts`, `tests/unit/modules/chat/services/MessageService.test.ts`

**Interfaces:**
- Produces:
  - `type ChatTransaction = Transaction` (Sequelize) em `@/modules/chat/types`.
  - `IConversationRepository.findById(id, transaction?)`, `delete(id, transaction?)`, `withLock<T>(conversationId: string, work: (transaction: ChatTransaction) => Promise<T>): Promise<T>`.
  - `IParticipantRepository.find(conversationId, userId, transaction?)`, `listByConversation(conversationId, transaction?)`, `addMembers(conversationId, userIds, transaction?)`, `remove(conversationId, userId, transaction?)`, `setRole(conversationId, userId, role, transaction?)`.
  - Toda implementação de `IConversationRepository` (inclusive mocks `jest.Mocked<IConversationRepository>`) precisa de `withLock`.

- [ ] **Step 1: Escrever os testes dos repositórios (falham)**

Em `tests/unit/modules/chat/repositories/ConversationRepository.test.ts`:

1. No teste `describe('findById')` → `'deve retornar a conversa serializada'`, trocar `expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID);` por:

```ts
      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID, {
        transaction: undefined,
      });
```

2. Logo depois desse teste (ainda dentro de `describe('findById')`), acrescentar:

```ts
    it('deve repassar a transação quando informada', async () => {
      MockConversation.findByPk.mockResolvedValue(conversationRow() as never);

      await repository.findById(CONVERSATION_ID, TX as never);

      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID, { transaction: TX });
    });
```

3. Substituir o `describe('delete', ...)` final (e o fechamento do arquivo) por:

```ts
  describe('delete', () => {
    it('deve remover a conversa', async () => {
      MockConversation.destroy.mockResolvedValue(1);

      await repository.delete(CONVERSATION_ID);

      expect(MockConversation.destroy).toHaveBeenCalledWith({ where: { id: CONVERSATION_ID } });
    });

    it('deve repassar a transação quando informada', async () => {
      MockConversation.destroy.mockResolvedValue(1);

      await repository.delete(CONVERSATION_ID, TX as never);

      expect(MockConversation.destroy).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID },
        transaction: TX,
      });
    });
  });

  describe('withLock', () => {
    const LOCK_TX = { LOCK: { UPDATE: 'UPDATE' } };

    beforeEach(() => {
      mockTransaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) =>
        callback(LOCK_TX)
      );
    });

    it('abre transação, trava a linha da conversa (SELECT ... FOR UPDATE) e executa o trabalho', async () => {
      MockConversation.findByPk.mockResolvedValue(conversationRow() as never);
      const work = jest.fn().mockResolvedValue('resultado');

      const result = await repository.withLock(CONVERSATION_ID, work);

      expect(MockConversation.findByPk).toHaveBeenCalledWith(CONVERSATION_ID, {
        transaction: LOCK_TX,
        lock: 'UPDATE',
      });
      expect(work).toHaveBeenCalledWith(LOCK_TX);
      expect(result).toBe('resultado');
    });

    it('executa o trabalho mesmo sem a linha (o service decide o 404) e propaga erros', async () => {
      MockConversation.findByPk.mockResolvedValue(null);
      const error = new Error('regra violada');

      await expect(
        repository.withLock(CONVERSATION_ID, jest.fn().mockRejectedValue(error))
      ).rejects.toBe(error);
    });
  });
});
```

Em `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`:

1. Logo antes de `const OLDEST_FIRST = [`, acrescentar `const TX = { id: 'tx' };`.
2. Antes do `});` final do arquivo (depois do `describe('remove / setRole / setArchivedAt')`), acrescentar:

```ts
  describe('dentro de transação (lock da conversa)', () => {
    it('find e listByConversation repassam a transação', async () => {
      MockParticipant.findOne.mockResolvedValue(null);
      MockParticipant.findAll.mockResolvedValue([] as never);

      await repository.find(CONVERSATION_ID, USER_A, TX as never);
      await repository.listByConversation(CONVERSATION_ID, TX as never);

      expect(MockParticipant.findOne).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
        transaction: TX,
      });
      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID },
        order: OLDEST_FIRST,
        transaction: TX,
      });
    });

    it('addMembers, remove e setRole repassam a transação', async () => {
      MockParticipant.bulkCreate.mockResolvedValue([] as never);
      MockParticipant.destroy.mockResolvedValue(1);
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.addMembers(CONVERSATION_ID, [USER_B], TX as never);
      await repository.remove(CONVERSATION_ID, USER_A, TX as never);
      await repository.setRole(CONVERSATION_ID, USER_B, 'admin', TX as never);

      expect(MockParticipant.bulkCreate).toHaveBeenCalledWith(
        [{ conversationId: CONVERSATION_ID, userId: USER_B, role: 'member' }],
        { ignoreDuplicates: true, transaction: TX }
      );
      expect(MockParticipant.destroy).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: USER_A },
        transaction: TX,
      });
      expect(MockParticipant.update).toHaveBeenCalledWith(
        { role: 'admin' },
        { where: { conversationId: CONVERSATION_ID, userId: USER_B }, transaction: TX }
      );
    });
  });
```

- [ ] **Step 2: Escrever os testes do service (falham)**

Em `tests/unit/modules/chat/services/ConversationService.test.ts`:

1. No `import type { ... } from '@/modules/chat/types';` acrescentar `ChatTransaction,` como primeiro nome.
2. Logo após `const NOW = new Date('2026-09-24T10:00:00.000Z');`, acrescentar:

```ts
/** Transação falsa: o lock é do repositório; o service só a repassa. */
const TX = { id: 'tx' } as unknown as ChatTransaction;
```

3. No `beforeEach`, no objeto `conversations`, acrescentar `withLock: jest.fn(),` depois de `delete: jest.fn(),` e, logo após o fechamento do objeto `conversations`, a linha:

```ts
    conversations.withLock.mockImplementation(async (_id, work) => work(TX));
```

4. Substituir os blocos `describe('leave', ...)`, `describe('addMembers', ...)` e `describe('removeMember', ...)` inteiros (de `  describe('leave', () => {` até imediatamente antes de `  describe('consultas para outros módulos', () => {`) por:

```ts
  describe('leave', () => {
    it('deve responder 400 em conversa direct', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.leave(USER_A, CONVERSATION_ID)).rejects.toThrow(
        GroupOnlyOperationException
      );
      expect(participants.remove).not.toHaveBeenCalled();
    });

    it('roda tudo dentro do lock da conversa (mesma transação) e publica só depois', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B)]);
      conversations.withLock.mockImplementation(async (_id, work) => {
        const result = await work(TX);
        expect(events.publish).not.toHaveBeenCalled();
        return result;
      });

      await service.leave(USER_A, CONVERSATION_ID);

      expect(conversations.withLock).toHaveBeenCalledWith(CONVERSATION_ID, expect.any(Function));
      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_A, TX);
      expect(conversations.findById).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(participants.listByConversation).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('último admin saindo promove o membro mais antigo', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_B), participant(USER_C)]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_A, TX);
      expect(participants.setRole).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, 'admin', TX);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'member_left',
        actorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
        affectedUserIds: [USER_A],
      });
    });

    it('não promove ninguém quando ainda resta admin', async () => {
      givenMembership(conversation(), [participant(USER_A), participant(USER_B, 'admin')]);
      participants.listByConversation.mockResolvedValue([participant(USER_B, 'admin')]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(participants.setRole).not.toHaveBeenCalled();
    });

    it('remove a conversa e publica CONVERSATION_DELETED (não member_left) quando não resta ninguém', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);
      participants.listByConversation.mockResolvedValue([]);

      await service.leave(USER_A, CONVERSATION_ID);

      expect(conversations.delete).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_DELETED, {
        conversationId: CONVERSATION_ID,
        actorId: USER_A,
        participantIds: [USER_A],
      });
      expect(events.publish).not.toHaveBeenCalledWith(
        ChatEvents.CONVERSATION_UPDATED,
        expect.anything()
      );
    });

    it('não publica nada quando o trabalho dentro do lock falha', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);
      participants.remove.mockRejectedValue(new Error('db down'));

      await expect(service.leave(USER_A, CONVERSATION_ID)).rejects.toThrow('db down');
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('addMembers', () => {
    it('deve adicionar apenas quem ainda não participa e publicar members_added', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      users.getMultiple.mockResolvedValueOnce([user(USER_C, 'carol')]);

      await service.addMembers(USER_A, CONVERSATION_ID, [USER_B, USER_C, USER_C]);

      expect(conversations.withLock).toHaveBeenCalledWith(CONVERSATION_ID, expect.any(Function));
      expect(participants.listByConversation).toHaveBeenNthCalledWith(1, CONVERSATION_ID, TX);
      expect(users.getMultiple).toHaveBeenNthCalledWith(1, [USER_C]);
      expect(participants.addMembers).toHaveBeenCalledWith(CONVERSATION_ID, [USER_C], TX);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'members_added',
        actorId: USER_A,
        participantIds: [USER_A, USER_B, USER_C],
        affectedUserIds: [USER_C],
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

    it('deve responder 400 ao estourar 256 participantes (contagem lida sob o lock)', async () => {
      const current = Array.from({ length: 256 }, (_, i) =>
        participant(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
      );
      givenMembership(conversation(), [participant(USER_A, 'admin'), ...current.slice(1)]);

      await expect(service.addMembers(USER_A, CONVERSATION_ID, [USER_C])).rejects.toThrow(
        GroupParticipantLimitException
      );
      expect(participants.addMembers).not.toHaveBeenCalled();
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

      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_A, TX);
      expect(events.publish).toHaveBeenCalledWith(
        ChatEvents.CONVERSATION_UPDATED,
        expect.objectContaining({ change: 'member_left' })
      );
    });

    it('admin remove membro (dentro do lock) e publica member_removed', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([participant(USER_A, 'admin')]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_B);

      expect(conversations.withLock).toHaveBeenCalledWith(CONVERSATION_ID, expect.any(Function));
      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, TX);
      expect(participants.remove).toHaveBeenCalledWith(CONVERSATION_ID, USER_B, TX);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change: 'member_removed',
        actorId: USER_A,
        participantIds: [USER_B, USER_A],
        affectedUserIds: [USER_B],
      });
    });

    it('publica CONVERSATION_DELETED (não member_removed) quando a remoção esvazia a conversa', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);
      participants.listByConversation.mockResolvedValue([]);

      await service.removeMember(USER_A, CONVERSATION_ID, USER_B);

      expect(conversations.delete).toHaveBeenCalledWith(CONVERSATION_ID, TX);
      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.CONVERSATION_DELETED, {
        conversationId: CONVERSATION_ID,
        actorId: USER_A,
        participantIds: [USER_B],
      });
    });

    it('deve responder 404 quando o alvo não participa', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin')]);

      await expect(service.removeMember(USER_A, CONVERSATION_ID, USER_C)).rejects.toThrow(
        ParticipantNotFoundException
      );
      expect(participants.remove).not.toHaveBeenCalled();
    });

    it('deve responder 403 para não admin', async () => {
      givenMembership(conversation(), [participant(USER_A, 'admin'), participant(USER_B)]);

      await expect(service.removeMember(USER_B, CONVERSATION_ID, USER_A)).rejects.toThrow(
        NotConversationAdminException
      );
    });
  });
```

Em `tests/unit/modules/chat/services/MessageService.test.ts`, no objeto `conversations` do `beforeEach`, acrescentar `withLock: jest.fn(),` depois de `delete: jest.fn(),` (o tipo `jest.Mocked<IConversationRepository>` passa a exigi-lo).

- [ ] **Step 3: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/repositories tests/unit/modules/chat/services --coverage=false`
Expected: FAIL — `repository.withLock is not a function`, chamadas sem `TX`, e o novo teste do `removeMember` recebe `member_removed` em vez de `CONVERSATION_DELETED`.

- [ ] **Step 4: Tipos e interfaces**

Em `src/modules/chat/types/chat.types.ts`, trocar o cabeçalho (até a linha de `ConversationChange`, inclusive) por:

```ts
import type { Transaction } from 'sequelize';
import type { CONVERSATION_TYPES, PARTICIPANT_ROLES } from '../constants';

export type { MessageContentType } from '@/shared/types/chat-message.types';
export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type ConversationChange = 'renamed' | 'members_added' | 'member_removed' | 'member_left';

/**
 * Transação do armazenamento relacional, aberta por `IConversationRepository.withLock` e
 * repassada às operações que precisam enxergar/alterar o mesmo estado travado. O service só a
 * repassa (nunca a inspeciona); repositórios em memória podem ignorá-la.
 */
export type ChatTransaction = Transaction;
```

Substituir `src/modules/chat/interfaces/IConversationRepository.ts` inteiro por:

```ts
import type {
  ChatTransaction,
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
  findById(id: string, transaction?: ChatTransaction): Promise<ConversationAttributes | null>;
  findByDirectKey(directKey: string): Promise<ConversationAttributes | null>;
  /** Cria a conversa 1:1 e os dois participantes; sob corrida, devolve a existente. */
  createDirect(data: CreateDirectData): Promise<CreateDirectRecord>;
  /** Cria o grupo com o criador como `admin` e os demais como `member`. */
  createGroup(data: CreateGroupData): Promise<ConversationAttributes>;
  listForUser(userId: string, options: ListForUserOptions): Promise<ConversationListPage>;
  rename(id: string, name: string): Promise<void>;
  /** Avança `last_message_at` (nunca retrocede). */
  touchLastMessageAt(id: string, at: Date): Promise<void>;
  delete(id: string, transaction?: ChatTransaction): Promise<void>;
  /**
   * Abre uma transação, trava a linha da conversa (`SELECT ... FOR UPDATE`) e executa `work`
   * com ela; commit ao resolver, rollback ao rejeitar. Serializa alterações concorrentes de
   * participantes (promoção de admin, limite do grupo). Conversa inexistente não trava nada —
   * `work` roda assim mesmo e decide (ex.: 404).
   */
  withLock<T>(
    conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T>;
}
```

Substituir `src/modules/chat/interfaces/IParticipantRepository.ts` inteiro por:

```ts
import type { ChatTransaction, ParticipantAttributes, ParticipantRole } from '../types';

/** `transaction` (opcional) vem de `IConversationRepository.withLock`. */
export interface IParticipantRepository {
  find(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes | null>;
  /** Participantes da conversa, do mais antigo (`joined_at`) para o mais novo. */
  listByConversation(
    conversationId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes[]>;
  listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]>;
  listConversationIdsByUser(userId: string): Promise<string[]>;
  /** Adiciona como `member`, ignorando quem já participa. */
  addMembers(
    conversationId: string,
    userIds: string[],
    transaction?: ChatTransaction
  ): Promise<void>;
  remove(conversationId: string, userId: string, transaction?: ChatTransaction): Promise<void>;
  setRole(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
    transaction?: ChatTransaction
  ): Promise<void>;
  setArchivedAt(conversationId: string, userId: string, archivedAt: Date | null): Promise<void>;
}
```

- [ ] **Step 5: Repositórios**

Em `src/modules/chat/repositories/ConversationRepository.ts`:

1. No `import type { ... } from '../types';` acrescentar `ChatTransaction,` como primeiro nome.
2. Trocar o método `findById` por:

```ts
  async findById(
    id: string,
    transaction?: ChatTransaction
  ): Promise<ConversationAttributes | null> {
    const conversation = await Conversation.findByPk(id, { transaction });
    return conversation?.toJSON() ?? null;
  }
```

3. Trocar o método `delete` (último da classe) por:

```ts
  async delete(id: string, transaction?: ChatTransaction): Promise<void> {
    await Conversation.destroy({ where: { id }, transaction });
  }

  async withLock<T>(
    conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T> {
    return sequelize.transaction(async (transaction) => {
      await Conversation.findByPk(conversationId, { transaction, lock: transaction.LOCK.UPDATE });
      return work(transaction);
    });
  }
```

Substituir `src/modules/chat/repositories/ParticipantRepository.ts` inteiro por:

```ts
import { Op } from 'sequelize';
import Participant from '../models/Participant';
import type { IParticipantRepository } from '../interfaces';
import type { ChatTransaction, ParticipantAttributes, ParticipantRole } from '../types';

const OLDEST_FIRST: [string, string][] = [
  ['joinedAt', 'ASC'],
  ['id', 'ASC'],
];

export class ParticipantRepository implements IParticipantRepository {
  async find(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes | null> {
    const participant = await Participant.findOne({
      where: { conversationId, userId },
      transaction,
    });
    return participant?.toJSON() ?? null;
  }

  async listByConversation(
    conversationId: string,
    transaction?: ChatTransaction
  ): Promise<ParticipantAttributes[]> {
    const rows = await Participant.findAll({
      where: { conversationId },
      order: OLDEST_FIRST,
      transaction,
    });
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

  async addMembers(
    conversationId: string,
    userIds: string[],
    transaction?: ChatTransaction
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    await Participant.bulkCreate(
      userIds.map((userId) => ({ conversationId, userId, role: 'member' as const })),
      { ignoreDuplicates: true, transaction }
    );
  }

  async remove(
    conversationId: string,
    userId: string,
    transaction?: ChatTransaction
  ): Promise<void> {
    await Participant.destroy({ where: { conversationId, userId }, transaction });
  }

  async setRole(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
    transaction?: ChatTransaction
  ): Promise<void> {
    await Participant.update({ role }, { where: { conversationId, userId }, transaction });
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

- [ ] **Step 6: Service com lock e `publishRemoval`**

Substituir `src/modules/chat/services/ConversationService.ts` inteiro por:

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
  ChatTransaction,
  ConversationChange,
  ConversationDTO,
  ConversationListEntry,
  CreateDirectResult,
  CreateGroupDTO,
  ListConversationsOptions,
  PaginatedConversations,
  ParticipantAttributes,
} from '../types';

/** Resultado de remover um participante sob o lock da conversa. */
interface ParticipantRemoval {
  remaining: string[];
  deleted: boolean;
}

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

    const participantsByConversation = groupParticipantsByConversation(participants);
    const usersById = indexUsersById(users);

    const items = page.rows.map((entry) =>
      this.toDTO(entry, participantsByConversation.get(entry.conversation.id) ?? [], usersById)
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
    return this.toDTO(context, participants, indexUsersById(users));
  }

  async rename(userId: string, conversationId: string, name: string): Promise<ConversationDTO> {
    const context = await this.requireMembership(conversationId, userId);
    this.assertGroupAdmin(context);

    await this.conversations.rename(conversationId, name);
    await this.publishUpdate(
      conversationId,
      'renamed',
      userId,
      await this.getParticipantIds(conversationId),
      [],
      name
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

  /**
   * Sai do grupo. Leitura, remoção e promoção de admin rodam sob o lock da conversa
   * (`withLock`); os eventos só são publicados depois do commit.
   */
  async leave(userId: string, conversationId: string): Promise<void> {
    const removal = await this.conversations.withLock(conversationId, async (transaction) => {
      const { conversation } = await this.requireMembership(conversationId, userId, transaction);
      if (conversation.type !== 'group') {
        throw new GroupOnlyOperationException();
      }
      return this.removeParticipant(conversationId, userId, transaction);
    });

    await this.publishRemoval(conversationId, userId, userId, 'member_left', removal);
  }

  /** O limite de 256 é checado sob o lock: dois admins adicionando ao mesmo tempo não o furam. */
  async addMembers(
    userId: string,
    conversationId: string,
    userIds: string[]
  ): Promise<ConversationDTO> {
    const { currentIds, toAdd } = await this.conversations.withLock(
      conversationId,
      async (transaction) => {
        const context = await this.requireMembership(conversationId, userId, transaction);
        this.assertGroupAdmin(context);

        const members = await this.participants.listByConversation(conversationId, transaction);
        const memberIds = members.map((p) => p.userId);
        const newIds = [...new Set(userIds)].filter((id) => !memberIds.includes(id));

        if (memberIds.length + newIds.length > CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS) {
          throw new GroupParticipantLimitException();
        }

        await this.ensureUsersExist(newIds);

        if (newIds.length > 0) {
          await this.participants.addMembers(conversationId, newIds, transaction);
        }
        return { currentIds: memberIds, toAdd: newIds };
      }
    );

    if (toAdd.length > 0) {
      await this.publishUpdate(
        conversationId,
        'members_added',
        userId,
        [...currentIds, ...toAdd],
        toAdd
      );
    }

    return this.get(userId, conversationId);
  }

  async removeMember(userId: string, conversationId: string, memberId: string): Promise<void> {
    if (memberId === userId) {
      await this.leave(userId, conversationId);
      return;
    }

    const removal = await this.conversations.withLock(conversationId, async (transaction) => {
      const context = await this.requireMembership(conversationId, userId, transaction);
      this.assertGroupAdmin(context);

      const target = await this.participants.find(conversationId, memberId, transaction);
      if (target === null) {
        throw new ParticipantNotFoundException();
      }

      return this.removeParticipant(conversationId, memberId, transaction);
    });

    await this.publishRemoval(conversationId, userId, memberId, 'member_removed', removal);
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
    userId: string,
    transaction?: ChatTransaction
  ): Promise<ConversationListEntry> {
    const membership = await this.participants.find(conversationId, userId, transaction);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }

    const conversation = await this.conversations.findById(conversationId, transaction);
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
   * Remove o participante; se não restar ninguém, apaga a conversa (`deleted: true`); se não
   * restar admin, promove o participante mais antigo (`joined_at`). Retorna os ids restantes.
   */
  private async removeParticipant(
    conversationId: string,
    userId: string,
    transaction: ChatTransaction
  ): Promise<ParticipantRemoval> {
    await this.participants.remove(conversationId, userId, transaction);
    const remaining = await this.participants.listByConversation(conversationId, transaction);

    const [oldest] = remaining;
    if (oldest === undefined) {
      await this.conversations.delete(conversationId, transaction);
      return { remaining: [], deleted: true };
    }

    if (!remaining.some((p) => p.role === 'admin')) {
      await this.participants.setRole(conversationId, oldest.userId, 'admin', transaction);
    }

    return { remaining: remaining.map((p) => p.userId), deleted: false };
  }

  /**
   * Publica o resultado de uma saída/remoção: `CONVERSATION_DELETED` quando a conversa ficou
   * vazia e foi apagada (e então NÃO publica `member_left`/`member_removed`); senão,
   * `CONVERSATION_UPDATED` com quem saiu/foi removido também em `participantIds`.
   */
  private async publishRemoval(
    conversationId: string,
    actorId: string,
    removedId: string,
    change: 'member_left' | 'member_removed',
    { remaining, deleted }: ParticipantRemoval
  ): Promise<void> {
    if (deleted) {
      await this.events.publish(ChatEvents.CONVERSATION_DELETED, {
        conversationId,
        actorId,
        participantIds: [removedId],
      });
      return;
    }

    await this.publishUpdate(
      conversationId,
      change,
      actorId,
      [removedId, ...remaining],
      [removedId]
    );
  }

  private async publishUpdate(
    conversationId: string,
    change: ConversationChange,
    actorId: string,
    participantIds: string[],
    affectedUserIds: string[],
    name?: string
  ): Promise<void> {
    await this.events.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId,
      change,
      actorId,
      participantIds,
      affectedUserIds,
      ...(name !== undefined ? { name } : {}),
    });
  }

  private toDTO(
    { conversation, membership }: ConversationListEntry,
    participants: ParticipantAttributes[],
    usersById: Map<string, PublicUserDTO>
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
        const user = usersById.get(participant.userId);
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

/** Agrupa em uma única passada — evita um `.filter` por conversa (O(n·m) → O(n)). */
function groupParticipantsByConversation(
  participants: ParticipantAttributes[]
): Map<string, ParticipantAttributes[]> {
  const byConversation = new Map<string, ParticipantAttributes[]>();
  for (const participant of participants) {
    const bucket = byConversation.get(participant.conversationId);
    if (bucket === undefined) {
      byConversation.set(participant.conversationId, [participant]);
    } else {
      bucket.push(participant);
    }
  }
  return byConversation;
}

/** Indexa por id — evita um `.find` por participante (O(n·m) → O(n)). */
function indexUsersById(users: PublicUserDTO[]): Map<string, PublicUserDTO> {
  return new Map(users.map((user) => [user.id, user]));
}

export const conversationService = new ConversationService();
```

Em `src/shared/interfaces/event.interfaces.ts`, trocar o JSDoc de `[ChatEvents.CONVERSATION_DELETED]` por:

```ts
  /**
   * Publicado quando a saída/remoção do último membro apaga a conversa (nesse caso
   * `member_left`/`member_removed` NÃO é publicado). `participantIds` traz quem participava
   * imediatamente antes da remoção: `[actorId]` quando o último membro sai (`leave`) e
   * `[memberId]` quando um admin remove o último membro restante (`removeMember`).
   */
```

- [ ] **Step 7: Repositório em memória**

Em `tests/support/chat/inMemoryChat.ts`:

1. No `import type { ... } from '@/modules/chat/types';` acrescentar `ChatTransaction,` como primeiro nome.
2. Logo antes de `export class InMemoryChatStore {`, acrescentar:

```ts
/** Os repositórios em memória não têm transação real: o lock vira execução direta. */
const IN_MEMORY_TRANSACTION = {} as ChatTransaction;
```

3. No fim da classe `InMemoryConversationRepository` (depois do método `delete`), acrescentar:

```ts
  async withLock<T>(
    _conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T> {
    return work(IN_MEMORY_TRANSACTION);
  }
```

(Os demais métodos em memória ignoram o parâmetro `transaction` opcional — TypeScript aceita implementações com menos parâmetros.)

- [ ] **Step 8: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/feature/modules/chat --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 9: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/chat src/shared/interfaces tests/support/chat tests/unit/modules/chat
git add src/modules/chat/types/chat.types.ts src/modules/chat/interfaces/IConversationRepository.ts src/modules/chat/interfaces/IParticipantRepository.ts src/modules/chat/repositories/ConversationRepository.ts src/modules/chat/repositories/ParticipantRepository.ts src/modules/chat/services/ConversationService.ts src/shared/interfaces/event.interfaces.ts tests/support/chat/inMemoryChat.ts tests/unit/modules/chat/repositories/ConversationRepository.test.ts tests/unit/modules/chat/repositories/ParticipantRepository.test.ts tests/unit/modules/chat/services/ConversationService.test.ts tests/unit/modules/chat/services/MessageService.test.ts
git commit -m "🐛 fix: serializa saída, remoção e adição de membros com lock da conversa"
```

---

### Task 4: Modelo `Message` com status e `clientMessageId` + repositório

**Files:**
- Modify: `src/shared/types/chat-message.types.ts`, `src/shared/types/index.ts` (`MessageStatusEntry`)
- Modify: `src/modules/chat/types/message.types.ts`, `src/modules/chat/interfaces/IMessageRepository.ts`
- Modify: `src/modules/chat/models/Message.ts`, `src/modules/chat/repositories/MessageRepository.ts`
- Modify: `src/modules/chat/services/MessageService.ts` (adaptação mínima ao novo retorno de `create`)
- Modify: `tests/support/chat/inMemoryChat.ts`
- Test: `tests/unit/modules/chat/models/Message.test.ts`, `tests/unit/modules/chat/repositories/MessageRepository.test.ts`, `tests/unit/modules/chat/services/MessageService.test.ts`, `tests/unit/modules/chat/types/chat.types.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces:
  - `MessageStatusEntry { userId: string; at: Date }` (shared, re-exportado pelo chat).
  - `MessageRecord` ganha `clientMessageId: string | null`, `deliveredTo: MessageStatusEntry[]`, `readBy: MessageStatusEntry[]`; `CreateMessageData` ganha `clientMessageId: string | null`; `CreateMessageResult { record: MessageRecord; created: boolean }`.
  - `IMessageRepository.create(data): Promise<CreateMessageResult>`; `findByClientMessageId(senderId, clientMessageId): Promise<MessageRecord | null>`; `markDelivered(messageId, userId, at): Promise<boolean>`; `markReadUpTo(conversationId, userId, upTo: Date, at: Date): Promise<number>`.

- [ ] **Step 1: Escrever os testes do model e do repositório (falham)**

Em `tests/unit/modules/chat/models/Message.test.ts`, inserir imediatamente antes de `  it('deve aplicar defaults (replyTo, mentions, metadata, deletedAt)', () => {`:

```ts
  it('deve declarar o índice único parcial de idempotência (senderId + clientMessageId)', () => {
    expect(MessageModel.schema.indexes()).toContainEqual([
      { senderId: 1, clientMessageId: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { clientMessageId: { $type: 'string' } },
      }),
    ]);
  });

  it('deve aplicar defaults de status e idempotência (clientMessageId, deliveredTo, readBy)', () => {
    const message = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'olá' },
    });

    expect(message.clientMessageId).toBeNull();
    expect(message.deliveredTo).toEqual([]);
    expect(message.readBy).toEqual([]);
  });

  it('deve aceitar entradas de status { userId, at } e exigir ambos os campos', () => {
    const at = new Date('2026-09-25T10:00:00.000Z');
    const valid = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'olá' },
      clientMessageId: '33333333-3333-4333-8333-333333333333',
      deliveredTo: [{ userId: '22222222-2222-4222-8222-222222222222', at }],
      readBy: [{ userId: '22222222-2222-4222-8222-222222222222', at }],
    });
    const invalid = new MessageModel({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: { type: 'text', text: 'olá' },
      readBy: [{}],
    }).validateSync();

    expect(valid.validateSync()).toBeUndefined();
    expect(valid.deliveredTo[0]?.userId).toBe('22222222-2222-4222-8222-222222222222');
    expect(valid.readBy[0]?.at).toEqual(at);
    expect(invalid?.errors['readBy.0.userId']).toBeDefined();
    expect(invalid?.errors['readBy.0.at']).toBeDefined();
  });
```

Substituir `tests/unit/modules/chat/repositories/MessageRepository.test.ts` inteiro por:

```ts
jest.mock('@/modules/chat/models/Message', () => ({
  MessageModel: {
    create: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

import { Types } from 'mongoose';
import { MessageModel } from '@/modules/chat/models/Message';
import {
  MessageRepository,
  messageRepository,
} from '@/modules/chat/repositories/MessageRepository';
import type { CreateMessageData } from '@/modules/chat/types';

const MockMessageModel = MessageModel as unknown as {
  create: jest.Mock;
  findById: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
  deleteMany: jest.Mock;
};

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SENDER_ID = '11111111-1111-4111-8111-111111111111';
const MENTIONED_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '65f000000000000000000001';
const REPLY_ID = '65f000000000000000000000';
const CREATED_AT = new Date('2026-09-24T10:00:00.000Z');
const STATUS_AT = new Date('2026-09-24T10:05:00.000Z');

function fakeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(MESSAGE_ID),
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [MENTIONED_ID],
    metadata: { ip: '127.0.0.1', device: 'jest' },
    clientMessageId: null,
    deliveredTo: [],
    readBy: [],
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
  clientMessageId: null,
  deliveredTo: [],
  readBy: [],
  deletedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

function createData(overrides: Partial<CreateMessageData> = {}): CreateMessageData {
  return {
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    content: { type: 'text', text: 'olá' },
    replyTo: null,
    mentions: [MENTIONED_ID],
    metadata: { ip: '127.0.0.1', device: 'jest' },
    clientMessageId: null,
    ...overrides,
  };
}

function execResult(value: unknown): { exec: jest.Mock } {
  return { exec: jest.fn().mockResolvedValue(value) };
}

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
    it('deve persistir sem replyTo e mapear o documento para MessageRecord (created=true)', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc());

      const result = await repository.create(createData());

      expect(MockMessageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          replyTo: null,
          clientMessageId: null,
        })
      );
      expect(result).toEqual({ record: expectedRecord, created: true });
    });

    it('deve converter replyTo para ObjectId', async () => {
      MockMessageModel.create.mockResolvedValue(fakeDoc({ replyTo: new Types.ObjectId(REPLY_ID) }));

      const { record } = await repository.create(
        createData({ replyTo: REPLY_ID, mentions: [], metadata: { ip: null, device: null } })
      );

      const payload = MockMessageModel.create.mock.calls[0]![0] as { replyTo: Types.ObjectId };
      expect(payload.replyTo).toBeInstanceOf(Types.ObjectId);
      expect(payload.replyTo.toString()).toBe(REPLY_ID);
      expect(record.replyTo).toBe(REPLY_ID);
    });

    it('deve mapear clientMessageId e as entradas de status', async () => {
      MockMessageModel.create.mockResolvedValue(
        fakeDoc({
          clientMessageId: CLIENT_MESSAGE_ID,
          deliveredTo: [{ userId: MENTIONED_ID, at: STATUS_AT }],
          readBy: [{ userId: MENTIONED_ID, at: STATUS_AT }],
        })
      );

      const { record } = await repository.create(
        createData({ clientMessageId: CLIENT_MESSAGE_ID })
      );

      expect(record.clientMessageId).toBe(CLIENT_MESSAGE_ID);
      expect(record.deliveredTo).toEqual([{ userId: MENTIONED_ID, at: STATUS_AT }]);
      expect(record.readBy).toEqual([{ userId: MENTIONED_ID, at: STATUS_AT }]);
    });

    it('reenvio concorrente (E11000 no índice de clientMessageId) devolve a existente com created=false', async () => {
      MockMessageModel.create.mockRejectedValue(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      );
      MockMessageModel.findOne.mockReturnValue(
        execResult(fakeDoc({ clientMessageId: CLIENT_MESSAGE_ID }))
      );

      const result = await repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }));

      expect(MockMessageModel.findOne).toHaveBeenCalledWith({
        senderId: SENDER_ID,
        clientMessageId: CLIENT_MESSAGE_ID,
      });
      expect(result.created).toBe(false);
      expect(result.record.clientMessageId).toBe(CLIENT_MESSAGE_ID);
    });

    it('relança E11000 quando a existente não é encontrada', async () => {
      const error = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      MockMessageModel.create.mockRejectedValue(error);
      MockMessageModel.findOne.mockReturnValue(execResult(null));

      await expect(
        repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }))
      ).rejects.toBe(error);
    });

    it('relança sem consultar quando não há clientMessageId ou o erro não é de chave duplicada', async () => {
      const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const other = new Error('mongo down');
      MockMessageModel.create.mockRejectedValueOnce(duplicate).mockRejectedValueOnce(other);

      await expect(repository.create(createData())).rejects.toBe(duplicate);
      await expect(
        repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }))
      ).rejects.toBe(other);
      expect(MockMessageModel.findOne).not.toHaveBeenCalled();
    });

    it('relança rejeições que não são objetos', async () => {
      MockMessageModel.create.mockRejectedValue('falhou');

      await expect(
        repository.create(createData({ clientMessageId: CLIENT_MESSAGE_ID }))
      ).rejects.toBe('falhou');
    });
  });

  describe('findById', () => {
    it('deve retornar o registro quando existe', async () => {
      MockMessageModel.findById.mockReturnValue(execResult(fakeDoc()));

      const result = await repository.findById(MESSAGE_ID);

      expect(MockMessageModel.findById).toHaveBeenCalledWith(MESSAGE_ID);
      expect(result).toEqual(expectedRecord);
    });

    it('deve retornar null quando não existe', async () => {
      MockMessageModel.findById.mockReturnValue(execResult(null));

      await expect(repository.findById(MESSAGE_ID)).resolves.toBeNull();
    });
  });

  describe('findByClientMessageId', () => {
    it('deve buscar pelo par remetente + clientMessageId', async () => {
      MockMessageModel.findOne.mockReturnValue(
        execResult(fakeDoc({ clientMessageId: CLIENT_MESSAGE_ID }))
      );

      const result = await repository.findByClientMessageId(SENDER_ID, CLIENT_MESSAGE_ID);

      expect(MockMessageModel.findOne).toHaveBeenCalledWith({
        senderId: SENDER_ID,
        clientMessageId: CLIENT_MESSAGE_ID,
      });
      expect(result?.id).toBe(MESSAGE_ID);
    });

    it('deve retornar null quando não existe', async () => {
      MockMessageModel.findOne.mockReturnValue(execResult(null));

      await expect(
        repository.findByClientMessageId(SENDER_ID, CLIENT_MESSAGE_ID)
      ).resolves.toBeNull();
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
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));

      const result = await repository.softDelete(MESSAGE_ID, at);

      expect(MockMessageModel.updateOne).toHaveBeenCalledWith(
        { _id: MESSAGE_ID, deletedAt: null },
        { $set: { deletedAt: at } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando já estava apagada', async () => {
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));

      await expect(repository.softDelete(MESSAGE_ID, new Date())).resolves.toBe(false);
    });
  });

  describe('markDelivered', () => {
    it('deve fazer $push condicional (só se o usuário ainda não consta) e retornar true', async () => {
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));

      const result = await repository.markDelivered(MESSAGE_ID, MENTIONED_ID, STATUS_AT);

      expect(MockMessageModel.updateOne).toHaveBeenCalledWith(
        { _id: MESSAGE_ID, 'deliveredTo.userId': { $ne: MENTIONED_ID } },
        { $push: { deliveredTo: { userId: MENTIONED_ID, at: STATUS_AT } } }
      );
      expect(result).toBe(true);
    });

    it('deve retornar false quando já estava entregue (idempotente)', async () => {
      MockMessageModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));

      await expect(repository.markDelivered(MESSAGE_ID, MENTIONED_ID, STATUS_AT)).resolves.toBe(
        false
      );
    });
  });

  describe('markReadUpTo', () => {
    it('marca entregue (se faltava) e lida as mensagens de outros autores até o limite', async () => {
      MockMessageModel.updateMany
        .mockReturnValueOnce(execResult({ modifiedCount: 1 }))
        .mockReturnValueOnce(execResult({ modifiedCount: 3 }));

      const count = await repository.markReadUpTo(
        CONVERSATION_ID,
        MENTIONED_ID,
        CREATED_AT,
        STATUS_AT
      );

      const fromOthers = {
        conversationId: CONVERSATION_ID,
        createdAt: { $lte: CREATED_AT },
        senderId: { $ne: MENTIONED_ID },
        deletedAt: null,
      };
      expect(MockMessageModel.updateMany).toHaveBeenNthCalledWith(
        1,
        { ...fromOthers, 'deliveredTo.userId': { $ne: MENTIONED_ID } },
        { $push: { deliveredTo: { userId: MENTIONED_ID, at: STATUS_AT } } }
      );
      expect(MockMessageModel.updateMany).toHaveBeenNthCalledWith(
        2,
        { ...fromOthers, 'readBy.userId': { $ne: MENTIONED_ID } },
        { $push: { readBy: { userId: MENTIONED_ID, at: STATUS_AT } } }
      );
      expect(count).toBe(3);
    });

    it('retorna 0 quando nada mudou', async () => {
      MockMessageModel.updateMany.mockReturnValue(execResult({ modifiedCount: 0 }));

      await expect(
        repository.markReadUpTo(CONVERSATION_ID, MENTIONED_ID, CREATED_AT, STATUS_AT)
      ).resolves.toBe(0);
    });
  });

  describe('deleteByConversation', () => {
    it('deve apagar todas as mensagens da conversa e retornar a quantidade removida', async () => {
      MockMessageModel.deleteMany.mockReturnValue(execResult({ deletedCount: 3 }));

      const result = await repository.deleteByConversation(CONVERSATION_ID);

      expect(MockMessageModel.deleteMany).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
      expect(result).toBe(3);
    });

    it('deve retornar 0 quando não havia mensagens', async () => {
      MockMessageModel.deleteMany.mockReturnValue(execResult({ deletedCount: 0 }));

      await expect(repository.deleteByConversation(CONVERSATION_ID)).resolves.toBe(0);
    });
  });
});
```

- [ ] **Step 2: Adaptar os testes que constroem `MessageRecord`/mocks do repositório**

Em `tests/unit/modules/chat/services/MessageService.test.ts`:

1. No `import type { ... } from '@/modules/chat/types';` acrescentar `CreateMessageResult,` depois de `ConversationAttributes,`.
2. Na função `record(...)`, logo depois de `metadata: META,`, acrescentar:

```ts
    clientMessageId: null,
    deliveredTo: [],
    readBy: [],
```

3. Logo depois da função `record(...)`, acrescentar:

```ts
function created(message: MessageRecord): CreateMessageResult {
  return { record: message, created: true };
}
```

4. No objeto `messages` do `beforeEach`, deixar exatamente:

```ts
    messages = {
      create: jest.fn(),
      findById: jest.fn(),
      findByClientMessageId: jest.fn(),
      findByConversation: jest.fn(),
      softDelete: jest.fn(),
      markDelivered: jest.fn(),
      markReadUpTo: jest.fn(),
      deleteByConversation: jest.fn(),
    };
```

5. Trocar cada `messages.create.mockResolvedValue(record(...))` por `messages.create.mockResolvedValue(created(record(...)))` — são 6 ocorrências, todas no `describe('send')`.
6. No primeiro teste do `send` (`'deve persistir, atualizar last_message_at e publicar MESSAGE_SENT'`), acrescentar `clientMessageId: null,` depois de `metadata: META,` dentro do `expect(messages.create).toHaveBeenCalledWith({ ... })`.

Em `tests/unit/modules/chat/types/chat.types.test.ts`, no objeto `record: MessageRecord`, acrescentar depois de `metadata: { ip: '127.0.0.1', device: 'jest' },`:

```ts
      clientMessageId: null,
      deliveredTo: [],
      readBy: [],
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/models tests/unit/modules/chat/repositories/MessageRepository.test.ts --coverage=false`
Expected: FAIL — índice/campos inexistentes no schema; `repository.findByClientMessageId is not a function`; `create` devolvendo o registro em vez de `{ record, created }`.

- [ ] **Step 4: Tipos e contrato do repositório**

Em `src/shared/types/chat-message.types.ts`, inserir imediatamente antes do JSDoc `/** Mensagem como exposta pela API...`:

```ts
/** Um destinatário no status da mensagem (entregue a / lida por) e quando. */
export interface MessageStatusEntry {
  userId: string;
  at: Date;
}
```

Em `src/shared/types/index.ts`, trocar a linha `export type { MessageContentType, MessageContent, MessageDTO } from './chat-message.types';` por:

```ts
export type {
  MessageContentType,
  MessageContent,
  MessageDTO,
  MessageStatusEntry,
} from './chat-message.types';
```

Substituir `src/modules/chat/types/message.types.ts` inteiro por:

```ts
import type {
  MessageContent,
  MessageDTO,
  MessageStatusEntry,
} from '@/shared/types/chat-message.types';

export type {
  MessageContent,
  MessageDTO,
  MessageStatusEntry,
} from '@/shared/types/chat-message.types';

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
  /** UUID gerado pelo cliente para envio idempotente (`null` quando não informado). */
  clientMessageId: string | null;
  deliveredTo: MessageStatusEntry[];
  readBy: MessageStatusEntry[];
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
  clientMessageId: string | null;
}

export interface CreateMessageResult {
  record: MessageRecord;
  /** `false` quando o `clientMessageId` já existia para o remetente (nada foi criado). */
  created: boolean;
}

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export interface FindMessagesOptions {
  limit: number;
  before?: MessageCursor;
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

Substituir `src/modules/chat/interfaces/IMessageRepository.ts` inteiro por:

```ts
import type {
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
} from '../types';

export interface IMessageRepository {
  /**
   * Persiste a mensagem. Com `clientMessageId` já usado pelo mesmo remetente (índice único
   * parcial), não duplica: devolve a existente com `created: false`.
   */
  create(data: CreateMessageData): Promise<CreateMessageResult>;
  findById(id: string): Promise<MessageRecord | null>;
  findByClientMessageId(senderId: string, clientMessageId: string): Promise<MessageRecord | null>;
  /** Mais recentes primeiro; com `before`, apenas mensagens estritamente anteriores ao cursor. */
  findByConversation(
    conversationId: string,
    options: FindMessagesOptions
  ): Promise<MessageRecord[]>;
  /** Marca `deletedAt`; retorna `true` só se esta chamada apagou (idempotente sob concorrência). */
  softDelete(id: string, deletedAt: Date): Promise<boolean>;
  /** Registra a entrega a `userId`; retorna `true` só se esta chamada registrou (idempotente). */
  markDelivered(messageId: string, userId: string, at: Date): Promise<boolean>;
  /**
   * Marca como lidas por `userId` — e entregues, se ainda não estavam — as mensagens da conversa
   * de outros autores, não apagadas, com `createdAt <= upTo`. Retorna quantas passaram a lidas.
   */
  markReadUpTo(conversationId: string, userId: string, upTo: Date, at: Date): Promise<number>;
  /** Apaga todas as mensagens da conversa (usado quando a conversa é removida). */
  deleteByConversation(conversationId: string): Promise<number>;
}
```

- [ ] **Step 5: Model e repositório**

Substituir `src/modules/chat/models/Message.ts` inteiro por:

```ts
import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { CHAT_CONSTANTS, MESSAGE_CONTENT_TYPES } from '../constants';
import type { MessageContentType, MessageStatusEntry } from '../types';

export interface IMessage {
  conversationId: string;
  senderId: string;
  content: { type: MessageContentType; text: string };
  replyTo: Types.ObjectId | null;
  mentions: string[];
  metadata: { ip: string | null; device: string | null };
  clientMessageId: string | null;
  deliveredTo: MessageStatusEntry[];
  readBy: MessageStatusEntry[];
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

const statusEntrySchema = new Schema<MessageStatusEntry>(
  {
    userId: { type: String, required: true },
    at: { type: Date, required: true },
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
    clientMessageId: { type: String, default: null },
    deliveredTo: { type: [statusEntrySchema], default: [] },
    readBy: { type: [statusEntrySchema], default: [] },
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

// Idempotência do envio: um `clientMessageId` por remetente. Parcial (`$type: 'string'`) porque
// mensagens sem o id gravam `null`, que não pode colidir entre si.
messageSchema.index(
  { senderId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } } }
);

export const MessageModel: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
```

Substituir `src/modules/chat/repositories/MessageRepository.ts` inteiro por:

```ts
import { Types, type HydratedDocument } from 'mongoose';
import { MessageModel, type IMessage } from '../models/Message';
import type { IMessageRepository } from '../interfaces';
import type {
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
  MessageStatusEntry,
} from '../types';

/** Código do MongoDB para violação de índice único. */
const DUPLICATE_KEY_ERROR_CODE = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}

function toStatusEntries(entries: readonly MessageStatusEntry[]): MessageStatusEntry[] {
  return entries.map(({ userId, at }) => ({ userId, at }));
}

function toRecord(doc: HydratedDocument<IMessage>): MessageRecord {
  return {
    id: doc._id.toString(),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: { type: doc.content.type, text: doc.content.text },
    replyTo: doc.replyTo === null ? null : doc.replyTo.toString(),
    mentions: [...doc.mentions],
    metadata: { ip: doc.metadata.ip, device: doc.metadata.device },
    clientMessageId: doc.clientMessageId,
    deliveredTo: toStatusEntries(doc.deliveredTo),
    readBy: toStatusEntries(doc.readBy),
    deletedAt: doc.deletedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MessageRepository implements IMessageRepository {
  async create(data: CreateMessageData): Promise<CreateMessageResult> {
    try {
      const doc = await MessageModel.create({
        ...data,
        replyTo: data.replyTo === null ? null : new Types.ObjectId(data.replyTo),
      });
      return { record: toRecord(doc), created: true };
    } catch (error) {
      // Reenvio concorrente com o mesmo clientMessageId: o índice único barra o segundo, que
      // devolve a mensagem gravada pelo primeiro.
      if (data.clientMessageId === null || !isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await this.findByClientMessageId(data.senderId, data.clientMessageId);
      if (existing === null) {
        throw error;
      }
      return { record: existing, created: false };
    }
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const doc = await MessageModel.findById(id).exec();
    return doc === null ? null : toRecord(doc);
  }

  async findByClientMessageId(
    senderId: string,
    clientMessageId: string
  ): Promise<MessageRecord | null> {
    const doc = await MessageModel.findOne({ senderId, clientMessageId }).exec();
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

  async markDelivered(messageId: string, userId: string, at: Date): Promise<boolean> {
    const result = await MessageModel.updateOne(
      { _id: messageId, 'deliveredTo.userId': { $ne: userId } },
      { $push: { deliveredTo: { userId, at } } }
    ).exec();
    return result.modifiedCount > 0;
  }

  async markReadUpTo(
    conversationId: string,
    userId: string,
    upTo: Date,
    at: Date
  ): Promise<number> {
    const fromOthers = {
      conversationId,
      createdAt: { $lte: upTo },
      senderId: { $ne: userId },
      deletedAt: null,
    };

    // Ler implica entregue: completa deliveredTo antes de registrar a leitura.
    await MessageModel.updateMany(
      { ...fromOthers, 'deliveredTo.userId': { $ne: userId } },
      { $push: { deliveredTo: { userId, at } } }
    ).exec();
    const result = await MessageModel.updateMany(
      { ...fromOthers, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, at } } }
    ).exec();
    return result.modifiedCount;
  }

  async deleteByConversation(conversationId: string): Promise<number> {
    const result = await MessageModel.deleteMany({ conversationId }).exec();
    return result.deletedCount;
  }
}

export const messageRepository = new MessageRepository();
```

- [ ] **Step 6: Adaptar o `MessageService` (sem mudar comportamento)**

Em `src/modules/chat/services/MessageService.ts`, dentro de `send`, trocar

```ts
    const record = await this.messages.create({
      conversationId,
      senderId: userId,
      content: { type: 'text', text: data.text.trim() },
      replyTo,
      mentions,
      metadata,
    });
```

por

```ts
    const { record } = await this.messages.create({
      conversationId,
      senderId: userId,
      content: { type: 'text', text: data.text.trim() },
      replyTo,
      mentions,
      metadata,
      clientMessageId: null,
    });
```

(A idempotência de verdade entra na Task 5.)

- [ ] **Step 7: Repositório em memória**

Substituir `tests/support/chat/inMemoryChat.ts` inteiro por (novo `copy` defensivo, `create` idempotente, `findByClientMessageId`, `markDelivered`, `markReadUpTo`):

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
  ChatTransaction,
  ConversationAttributes,
  ConversationListPage,
  CreateDirectData,
  CreateDirectRecord,
  CreateGroupData,
  CreateMessageData,
  CreateMessageResult,
  FindMessagesOptions,
  MessageRecord,
  ParticipantAttributes,
  ParticipantRole,
} from '@/modules/chat/types';

/** Os repositórios em memória não têm transação real: o lock vira execução direta. */
const IN_MEMORY_TRANSACTION = {} as ChatTransaction;

export class InMemoryChatStore {
  conversations = new Map<string, ConversationAttributes>();
  participants: ParticipantAttributes[] = [];
  messages: MessageRecord[] = [];
  private clock = Date.parse('2026-09-24T10:00:00.000Z');
  private participantIdCounter = 0;

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
    this.participantIdCounter = 0;
  }

  addParticipant(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
    joinedAt?: Date
  ): void {
    // Gera ID determinístico mas independente de ordem de inserção.
    // Usa descending counter: primeiro participante → 0xff, segundo → 0xfe, etc.
    // Garante que participantes inseridos depois podem ter IDs menores lexicograficamente.
    const counter = 0xff - this.participantIdCounter++;
    const counterHex = counter.toString(16).padStart(2, '0');
    const deterministic = `00000000-0000-4000-8000-0000000000${counterHex}`;
    this.participants.push({
      id: deterministic,
      conversationId,
      userId,
      role,
      joinedAt: joinedAt ?? this.now(),
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

/** Cópia defensiva (inclusive dos arrays de status) — o chamador não altera o store. */
function copy(record: MessageRecord): MessageRecord {
  return {
    ...record,
    mentions: [...record.mentions],
    deliveredTo: record.deliveredTo.map((entry) => ({ ...entry })),
    readBy: record.readBy.map((entry) => ({ ...entry })),
  };
}

function oldestFirst(a: ParticipantAttributes, b: ParticipantAttributes): number {
  const joinedDiff = a.joinedAt.getTime() - b.joinedAt.getTime();
  return joinedDiff !== 0 ? joinedDiff : a.id.localeCompare(b.id);
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
    const bulkJoinedAt = this.store.now();
    userIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member', bulkJoinedAt);
    });
    return { conversation, created: true };
  }

  async createGroup({
    name,
    createdBy,
    memberIds,
  }: CreateGroupData): Promise<ConversationAttributes> {
    const conversation = this.store.createConversation({ type: 'group', name, createdBy });
    const bulkJoinedAt = this.store.now();
    this.store.addParticipant(conversation.id, createdBy, 'admin', bulkJoinedAt);
    memberIds.forEach((userId) => {
      this.store.addParticipant(conversation.id, userId, 'member', bulkJoinedAt);
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

  async withLock<T>(
    _conversationId: string,
    work: (transaction: ChatTransaction) => Promise<T>
  ): Promise<T> {
    return work(IN_MEMORY_TRANSACTION);
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
    const bulkJoinedAt = this.store.now();
    for (const userId of userIds) {
      if ((await this.find(conversationId, userId)) === null) {
        this.store.addParticipant(conversationId, userId, 'member', bulkJoinedAt);
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

  async create(data: CreateMessageData): Promise<CreateMessageResult> {
    if (data.clientMessageId !== null) {
      const existing = await this.findByClientMessageId(data.senderId, data.clientMessageId);
      if (existing !== null) {
        return { record: existing, created: false };
      }
    }
    const at = this.store.now();
    const record: MessageRecord = {
      ...data,
      id: randomBytes(12).toString('hex'),
      deliveredTo: [],
      readBy: [],
      deletedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.store.messages.push(record);
    return { record: copy(record), created: true };
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const record = this.store.messages.find((m) => m.id === id);
    return record === undefined ? null : copy(record);
  }

  async findByClientMessageId(
    senderId: string,
    clientMessageId: string
  ): Promise<MessageRecord | null> {
    const record = this.store.messages.find(
      (m) => m.senderId === senderId && m.clientMessageId === clientMessageId
    );
    return record === undefined ? null : copy(record);
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
      .map(copy);
  }

  async softDelete(id: string, deletedAt: Date): Promise<boolean> {
    const record = this.store.messages.find((m) => m.id === id);
    if (record === undefined || record.deletedAt !== null) {
      return false;
    }
    record.deletedAt = deletedAt;
    return true;
  }

  async markDelivered(messageId: string, userId: string, at: Date): Promise<boolean> {
    const record = this.store.messages.find((m) => m.id === messageId);
    if (record === undefined || record.deliveredTo.some((entry) => entry.userId === userId)) {
      return false;
    }
    record.deliveredTo.push({ userId, at });
    return true;
  }

  async markReadUpTo(
    conversationId: string,
    userId: string,
    upTo: Date,
    at: Date
  ): Promise<number> {
    let count = 0;
    for (const record of this.store.messages) {
      const eligible =
        record.conversationId === conversationId &&
        record.createdAt <= upTo &&
        record.senderId !== userId &&
        record.deletedAt === null;
      if (!eligible) {
        continue;
      }
      if (!record.deliveredTo.some((entry) => entry.userId === userId)) {
        record.deliveredTo.push({ userId, at });
      }
      if (!record.readBy.some((entry) => entry.userId === userId)) {
        record.readBy.push({ userId, at });
        count++;
      }
    }
    return count;
  }

  async deleteByConversation(conversationId: string): Promise<number> {
    const before = this.store.messages.length;
    this.store.messages = this.store.messages.filter((m) => m.conversationId !== conversationId);
    return before - this.store.messages.length;
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

- [ ] **Step 8: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/feature/modules/chat --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 9: Commit**

```bash
node node_modules/.bin/prettier --write src/shared/types src/modules/chat tests/support/chat tests/unit/modules/chat
git add src/shared/types/chat-message.types.ts src/shared/types/index.ts src/modules/chat/types/message.types.ts src/modules/chat/interfaces/IMessageRepository.ts src/modules/chat/models/Message.ts src/modules/chat/repositories/MessageRepository.ts src/modules/chat/services/MessageService.ts tests/support/chat/inMemoryChat.ts tests/unit/modules/chat/models/Message.test.ts tests/unit/modules/chat/repositories/MessageRepository.test.ts tests/unit/modules/chat/services/MessageService.test.ts tests/unit/modules/chat/types/chat.types.test.ts
git commit -m "✨ feat: adiciona status de entrega/leitura e clientMessageId ao modelo de mensagens"
```

---

### Task 5: Envio idempotente e `status` na `MessageDTO`

**Files:**
- Modify: `src/shared/types/chat-message.types.ts`, `src/shared/types/index.ts` (`MessageStatusDTO`; `MessageDTO.status`/`clientMessageId`)
- Modify: `src/modules/chat/types/message.types.ts` (`SendMessageDTO.clientMessageId`)
- Modify: `src/modules/chat/errors/chat.errors.ts`, `src/modules/chat/errors/index.ts` (`ClientMessageIdConflictException`)
- Modify: `src/modules/chat/validation/chat.schemas.ts` (`clientMessageId` opcional)
- Modify: `src/modules/chat/services/MessageService.ts`
- Test: `tests/unit/modules/chat/services/MessageService.test.ts`, `tests/unit/modules/chat/errors/chat.errors.test.ts`, `tests/unit/modules/chat/validation/chat.schemas.test.ts`, `tests/feature/modules/chat/chat.test.ts`, e fixtures de `MessageDTO` em `tests/unit/modules/chat/listeners/chat.listeners.test.ts`, `tests/unit/shared/event-bus/chat-events.test.ts`, `tests/unit/modules/chat/types/chat.types.test.ts`

**Interfaces:**
- Consumes: `IMessageRepository.findByClientMessageId`/`create → { record, created }` (Task 4).
- Produces:
  - `MessageStatusDTO { sentAt: Date; deliveredTo: MessageStatusEntry[]; readBy: MessageStatusEntry[] }`; `MessageDTO` ganha `clientMessageId: string | null` e `status: MessageStatusDTO` (tombstone mantém `status`).
  - `SendMessageDTO.clientMessageId?: string`; `sendMessageSchema` aceita `clientMessageId` UUID (minúsculo) opcional.
  - `ClientMessageIdConflictException` (409, `CONFLICT`, "clientMessageId já usado em outra conversa").

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/unit/modules/chat/services/MessageService.test.ts`:

1. No `import { ... } from '@/modules/chat/errors';` acrescentar `ClientMessageIdConflictException,` como primeiro nome.
2. Logo depois de `const META = { ip: '127.0.0.1', device: 'jest' };`, acrescentar:

```ts
const CLIENT_MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const STATUS_AT = new Date('2026-09-24T10:05:00.000Z');
```

3. No `expectedDto` do primeiro teste do `send`, acrescentar depois de `mentions: [],`:

```ts
        clientMessageId: null,
        status: { sentAt: CREATED_AT, deliveredTo: [], readBy: [] },
```

4. Substituir o `  });` que fecha o `describe('send')` (logo depois do teste `'deve responder 400 para mention de não participante'`) pelo trecho abaixo, que traz o novo `describe` e o próprio fechamento:

```ts
    describe('idempotência por clientMessageId', () => {
      it('primeiro envio grava o clientMessageId e publica normalmente', async () => {
        messages.findByClientMessageId.mockResolvedValue(null);
        messages.create.mockResolvedValue(created(record({ clientMessageId: CLIENT_MESSAGE_ID })));

        const result = await service.send(
          USER_A,
          CONVERSATION_ID,
          { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
          META
        );

        expect(messages.findByClientMessageId).toHaveBeenCalledWith(USER_A, CLIENT_MESSAGE_ID);
        expect(messages.create).toHaveBeenCalledWith(
          expect.objectContaining({ clientMessageId: CLIENT_MESSAGE_ID })
        );
        expect(events.publish).toHaveBeenCalledTimes(1);
        expect(result.clientMessageId).toBe(CLIENT_MESSAGE_ID);
      });

      it('reenvio devolve a mensagem existente sem gravar, sem evento e sem last_message_at', async () => {
        messages.findByClientMessageId.mockResolvedValue(
          record({ clientMessageId: CLIENT_MESSAGE_ID })
        );

        const result = await service.send(
          USER_A,
          CONVERSATION_ID,
          { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
          META
        );

        expect(result.id).toBe(MESSAGE_ID);
        expect(messages.create).not.toHaveBeenCalled();
        expect(conversations.touchLastMessageAt).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      });

      it('reenvio concorrente (create devolve created=false) também não publica', async () => {
        messages.findByClientMessageId.mockResolvedValue(null);
        messages.create.mockResolvedValue({
          record: record({ clientMessageId: CLIENT_MESSAGE_ID }),
          created: false,
        });

        const result = await service.send(
          USER_A,
          CONVERSATION_ID,
          { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
          META
        );

        expect(result.id).toBe(MESSAGE_ID);
        expect(conversations.touchLastMessageAt).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      });

      it('clientMessageId já usado em outra conversa → 409', async () => {
        messages.findByClientMessageId.mockResolvedValueOnce(
          record({ conversationId: OTHER_CONVERSATION_ID })
        );
        messages.findByClientMessageId.mockResolvedValueOnce(null);
        messages.create.mockResolvedValue({
          record: record({ conversationId: OTHER_CONVERSATION_ID }),
          created: false,
        });

        const send = (): Promise<unknown> =>
          service.send(
            USER_A,
            CONVERSATION_ID,
            { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
            META
          );

        await expect(send()).rejects.toThrow(ClientMessageIdConflictException);
        await expect(send()).rejects.toThrow(ClientMessageIdConflictException);
        expect(events.publish).not.toHaveBeenCalled();
      });

      it('não consulta clientMessageId de quem não participa (404 antes)', async () => {
        await expect(
          service.send(
            USER_C,
            CONVERSATION_ID,
            { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
            META
          )
        ).rejects.toThrow(ConversationNotFoundException);
        expect(messages.findByClientMessageId).not.toHaveBeenCalled();
      });
    });
  });
```

(não duplique o fechamento: o trecho termina com o `  });` do `describe('send')`.)

5. No `describe('list')`, substituir desde `    it('mensagens apagadas voltam como tombstone', async () => {` até o `  });` que fecha o `describe('list')` (inclusive) por:

```ts
    it('mensagens apagadas voltam como tombstone (mantendo o status)', async () => {
      const deletedAt = new Date('2026-09-24T11:00:00.000Z');
      messages.findByConversation.mockResolvedValue([
        record({
          deletedAt,
          mentions: [USER_B],
          replyTo: REPLY_ID,
          readBy: [{ userId: USER_B, at: STATUS_AT }],
        }),
      ]);

      const result = await service.list(USER_A, CONVERSATION_ID);

      expect(result.messages[0]).toEqual(
        expect.objectContaining({
          id: MESSAGE_ID,
          content: null,
          mentions: [],
          replyTo: REPLY_ID,
          deletedAt,
          status: {
            sentAt: CREATED_AT,
            deliveredTo: [],
            readBy: [{ userId: USER_B, at: STATUS_AT }],
          },
        })
      );
    });

    it('expõe status (sentAt = createdAt, entregue a, lida por) e clientMessageId', async () => {
      messages.findByConversation.mockResolvedValue([
        record({
          clientMessageId: CLIENT_MESSAGE_ID,
          deliveredTo: [{ userId: USER_B, at: STATUS_AT }],
        }),
      ]);

      const { messages: page } = await service.list(USER_A, CONVERSATION_ID);

      expect(page[0]?.clientMessageId).toBe(CLIENT_MESSAGE_ID);
      expect(page[0]?.status).toEqual({
        sentAt: CREATED_AT,
        deliveredTo: [{ userId: USER_B, at: STATUS_AT }],
        readBy: [],
      });
      expect(page[0]).not.toHaveProperty('metadata');
    });
  });
```

(o trecho termina com o `  });` do `describe('list')`.)

Em `tests/unit/modules/chat/errors/chat.errors.test.ts`: acrescentar `ClientMessageIdConflictException,` no import (depois de `CannotConverseWithSelfException,`), acrescentar ao `it.each` (depois da entrada de `NotMessageAuthorException`):

```ts
    [
      new ClientMessageIdConflictException(),
      HttpStatus.CONFLICT,
      ErrorCode.CONFLICT,
      'clientMessageId já usado em outra conversa',
    ],
```

e, no teste `'deve aceitar mensagens personalizadas'`, a linha `expect(new ClientMessageIdConflictException('x').message).toBe('x');`.

Em `tests/unit/modules/chat/validation/chat.schemas.test.ts`, dentro de `describe('sendMessageSchema')`, depois do teste `'rejeita replyTo e mentions inválidos'`, acrescentar:

```ts
    it('aceita clientMessageId UUID opcional (normalizado em minúsculas) e rejeita inválido', () => {
      const clientMessageId = '33333333-3333-4333-8333-333333333333';

      expect(
        sendMessageSchema.parse({ text: 'oi', clientMessageId: clientMessageId.toUpperCase() })
      ).toEqual({ text: 'oi', clientMessageId });
      expect(sendMessageSchema.parse({ text: 'oi' })).not.toHaveProperty('clientMessageId');
      expect(sendMessageSchema.safeParse({ text: 'oi', clientMessageId: 'x' }).success).toBe(false);
    });
```

Em `tests/feature/modules/chat/chat.test.ts`, dentro de `describe('conversa direct')`, imediatamente antes de `    it('bloqueio em qualquer sentido → 403 ao criar e ao enviar', async () => {`, acrescentar:

```ts
    it('envio idempotente: repetir o clientMessageId devolve a mesma mensagem, sem duplicar', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;
      const clientMessageId = '66666666-6666-4666-8666-666666666666';

      const first = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA))
        .send({ text: 'uma vez só', clientMessageId });
      const retry = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA))
        .send({ text: 'uma vez só', clientMessageId });

      expect(first.status).toBe(HttpStatus.CREATED);
      expect(retry.status).toBe(HttpStatus.CREATED);
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect(retry.body.data.clientMessageId).toBe(clientMessageId);
      expect(first.body.data.status).toEqual({
        sentAt: first.body.data.createdAt,
        deliveredTo: [],
        readBy: [],
      });

      const page = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(BOB));
      expect(page.body.data.messages).toHaveLength(1);
    });
```

Fixtures de `MessageDTO` (o `tsc` passa a exigir os campos novos):
- `tests/unit/modules/chat/listeners/chat.listeners.test.ts` e `tests/unit/shared/event-bus/chat-events.test.ts`: no objeto `message: { ... }`, depois de `mentions: [],`, acrescentar `clientMessageId: null,` e `status: { sentAt: createdAt, deliveredTo: [], readBy: [] },`.
- `tests/unit/modules/chat/types/chat.types.test.ts`: trocar `const tombstone: MessageDTO = { ...record, content: null, deletedAt: now };` por:

```ts
    const tombstone: MessageDTO = {
      ...record,
      content: null,
      deletedAt: now,
      status: { sentAt: record.createdAt, deliveredTo: [], readBy: [] },
    };
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/feature/modules/chat --coverage=false`
Expected: FAIL — `ClientMessageIdConflictException` indefinida, DTO sem `status`/`clientMessageId`, schema descartando `clientMessageId`, reenvio duplicando a mensagem.

- [ ] **Step 3: Contrato e tipos**

Em `src/shared/types/chat-message.types.ts`, substituir o JSDoc + `interface MessageDTO` pelo trecho abaixo (mantendo os tipos acima dele):

```ts
/** Status da mensagem (RF003.4): enviada = `sentAt` (= `createdAt`), entregue a, lida por. */
export interface MessageStatusDTO {
  sentAt: Date;
  deliveredTo: MessageStatusEntry[];
  readBy: MessageStatusEntry[];
}

/**
 * Mensagem como exposta pela API: apagada vira tombstone (`content: null`, `mentions: []`),
 * mantendo ids, datas e `status`. `clientMessageId` permite ao cliente conciliar mensagens
 * otimistas.
 */
export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  content: MessageContent | null;
  replyTo: string | null;
  mentions: string[];
  clientMessageId: string | null;
  status: MessageStatusDTO;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Em `src/shared/types/index.ts`, no `export type { ... } from './chat-message.types';` acrescentar `MessageStatusDTO,` depois de `MessageStatusEntry,`.

Em `src/modules/chat/types/message.types.ts`: no `export type { ... } from '@/shared/types/chat-message.types';` acrescentar `MessageStatusDTO,` depois de `MessageDTO,`; e trocar a interface `SendMessageDTO` por:

```ts
export interface SendMessageDTO {
  text: string;
  replyTo?: string;
  mentions?: string[];
  /** UUID gerado pelo cliente: reenviar o mesmo id devolve a mensagem já gravada. */
  clientMessageId?: string;
}
```

- [ ] **Step 4: Erro 409 e schema**

Em `src/modules/chat/errors/chat.errors.ts`, inserir antes de `export class NotMessageAuthorException extends AppError {`:

```ts
export class ClientMessageIdConflictException extends AppError {
  constructor(message = 'clientMessageId já usado em outra conversa') {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}
```

Em `src/modules/chat/errors/index.ts`, acrescentar `ClientMessageIdConflictException,` depois de `NotMessageAuthorException,`.

Em `src/modules/chat/validation/chat.schemas.ts`, no `sendMessageSchema`, acrescentar como último campo (depois do `.optional(),` de `mentions`):

```ts
  clientMessageId: uuid('clientMessageId inválido').optional(),
```

- [ ] **Step 5: `MessageService` idempotente**

Substituir `src/modules/chat/services/MessageService.ts` inteiro por:

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { CHAT_CONSTANTS } from '../constants';
import {
  ClientMessageIdConflictException,
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

/**
 * Mensagem apagada vira tombstone: mantém id/datas/status (preserva threads e confirmações),
 * esconde o conteúdo.
 */
function toMessageDTO(record: MessageRecord): MessageDTO {
  const deleted = record.deletedAt !== null;
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    content: deleted ? null : record.content,
    replyTo: record.replyTo,
    mentions: deleted ? [] : record.mentions,
    clientMessageId: record.clientMessageId,
    status: {
      sentAt: record.createdAt,
      deliveredTo: record.deliveredTo,
      readBy: record.readBy,
    },
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Reenvio com `clientMessageId` já usado pelo remetente: devolve a mensagem original (sem novo
 * evento nem `last_message_at`). O mesmo id reaproveitado em outra conversa é conflito (409).
 */
function toReplay(existing: MessageRecord, conversationId: string): MessageDTO {
  if (existing.conversationId !== conversationId) {
    throw new ClientMessageIdConflictException();
  }
  return toMessageDTO(existing);
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

    const clientMessageId = data.clientMessageId ?? null;
    if (clientMessageId !== null) {
      const existing = await this.messages.findByClientMessageId(userId, clientMessageId);
      if (existing !== null) {
        return toReplay(existing, conversationId);
      }
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

    const { record, created } = await this.messages.create({
      conversationId,
      senderId: userId,
      content: { type: 'text', text: data.text.trim() },
      replyTo,
      mentions,
      metadata,
      clientMessageId,
    });
    if (!created) {
      return toReplay(record, conversationId);
    }

    // Best-effort: falha em atualizar last_message_at não deve impedir o envio da mensagem.
    try {
      await this.conversations.touchLastMessageAt(conversationId, record.createdAt);
    } catch (error) {
      logger.warn('Falha ao atualizar last_message_at da conversa', {
        conversationId,
        messageId: record.id,
        error,
      });
    }

    const dto = toMessageDTO(record);

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
      message: dto,
    });

    return dto;
  }

  async list(
    userId: string,
    conversationId: string,
    options: ListMessagesOptions = {}
  ): Promise<PaginatedMessages> {
    await this.requireParticipant(conversationId, userId);

    const pageSize = Math.max(
      1,
      Math.min(options.limit ?? CHAT_CONSTANTS.MESSAGE_PAGE_SIZE, CHAT_CONSTANTS.MESSAGE_PAGE_SIZE)
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

- [ ] **Step 6: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/unit/shared tests/feature/modules/chat --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 7: Commit**

```bash
node node_modules/.bin/prettier --write src/shared/types src/modules/chat tests/unit/modules/chat tests/unit/shared tests/feature/modules/chat
git add src/shared/types/chat-message.types.ts src/shared/types/index.ts src/modules/chat/types/message.types.ts src/modules/chat/errors/chat.errors.ts src/modules/chat/errors/index.ts src/modules/chat/validation/chat.schemas.ts src/modules/chat/services/MessageService.ts tests/unit/modules/chat/services/MessageService.test.ts tests/unit/modules/chat/errors/chat.errors.test.ts tests/unit/modules/chat/validation/chat.schemas.test.ts tests/feature/modules/chat/chat.test.ts tests/unit/modules/chat/listeners/chat.listeners.test.ts tests/unit/shared/event-bus/chat-events.test.ts tests/unit/modules/chat/types/chat.types.test.ts
git commit -m "✨ feat: torna o envio de mensagens idempotente e expõe o status na MessageDTO"
```

---

### Task 6: `markDelivered`/`markRead` com eventos no EventBus

**Files:**
- Modify: `src/shared/interfaces/event.interfaces.ts` (payloads `MESSAGE_DELIVERED`/`MESSAGE_READ`)
- Modify: `src/modules/chat/interfaces/IParticipantRepository.ts`, `src/modules/chat/repositories/ParticipantRepository.ts` (`advanceLastReadAt`)
- Modify: `src/modules/chat/interfaces/IMessageService.ts`, `src/modules/chat/services/MessageService.ts`
- Modify: `tests/support/chat/inMemoryChat.ts`
- Test: `tests/unit/modules/chat/services/MessageService.test.ts`, `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`, `tests/unit/shared/event-bus/chat-events.test.ts`, `tests/unit/modules/chat/services/ConversationService.test.ts`, `tests/unit/modules/chat/controllers/MessageController.test.ts`

**Interfaces:**
- Consumes: `IMessageRepository.markDelivered`/`markReadUpTo` (Task 4).
- Produces:
  - `EventPayload<ChatEvents.MESSAGE_DELIVERED> = { messageId; conversationId; userId; senderId; at: Date }`.
  - `EventPayload<ChatEvents.MESSAGE_READ> = { conversationId; userId; upToMessageId; at: Date }`.
  - `IParticipantRepository.advanceLastReadAt(conversationId, userId, at): Promise<void>`.
  - `IMessageService.markDelivered(userId, conversationId, messageId): Promise<void>` e `markRead(userId, conversationId, messageId): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/unit/shared/event-bus/chat-events.test.ts`, imediatamente antes de `  it('deve entregar MESSAGE_DELETED', async () => {`, acrescentar:

```ts
  it('deve entregar MESSAGE_DELIVERED com senderId e at', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.MESSAGE_DELIVERED, handler);
    const payload: EventPayload<ChatEvents.MESSAGE_DELIVERED> = {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '22222222-2222-4222-8222-222222222222',
      senderId: '11111111-1111-4111-8111-111111111111',
      at: new Date('2026-09-25T10:00:00.000Z'),
    };

    await bus.publish(ChatEvents.MESSAGE_DELIVERED, payload);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat:message-delivered', payload })
    );
  });

  it('deve entregar MESSAGE_READ com upToMessageId e at', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.MESSAGE_READ, handler);
    const payload: EventPayload<ChatEvents.MESSAGE_READ> = {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '22222222-2222-4222-8222-222222222222',
      upToMessageId: '65f000000000000000000001',
      at: new Date('2026-09-25T10:00:00.000Z'),
    };

    await bus.publish(ChatEvents.MESSAGE_READ, payload);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat:message-read', payload })
    );
  });
```

Em `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`, imediatamente antes de `  describe('dentro de transação (lock da conversa)', () => {`, acrescentar:

```ts
  describe('advanceLastReadAt', () => {
    it('avança last_read_at só quando nulo ou anterior (nunca retrocede)', async () => {
      const at = new Date('2026-09-25T10:00:00.000Z');
      MockParticipant.update.mockResolvedValue([1] as never);

      await repository.advanceLastReadAt(CONVERSATION_ID, USER_A, at);

      expect(MockParticipant.update).toHaveBeenCalledWith(
        { lastReadAt: at },
        {
          where: {
            conversationId: CONVERSATION_ID,
            userId: USER_A,
            [Op.or]: [{ lastReadAt: null }, { lastReadAt: { [Op.lt]: at } }],
          },
        }
      );
    });
  });
```

Em `tests/unit/modules/chat/services/ConversationService.test.ts` e `tests/unit/modules/chat/services/MessageService.test.ts`, no objeto `participants` do `beforeEach`, acrescentar `advanceLastReadAt: jest.fn(),` depois de `setArchivedAt: jest.fn(),`.

Em `tests/unit/modules/chat/services/MessageService.test.ts`, imediatamente antes de `  describe('delete', () => {`, acrescentar:

```ts
  describe('markDelivered', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());
    });

    it('registra a entrega e publica MESSAGE_DELIVERED para o remetente', async () => {
      messages.markDelivered.mockResolvedValue(true);

      await service.markDelivered(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_B);
      expect(messages.markDelivered).toHaveBeenCalledWith(MESSAGE_ID, USER_B, expect.any(Date));
      const at = messages.markDelivered.mock.calls[0]![2];
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.MESSAGE_DELIVERED, {
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_B,
        senderId: USER_A,
        at,
      });
    });

    it('é idempotente: já entregue não publica de novo', async () => {
      messages.markDelivered.mockResolvedValue(false);

      await service.markDelivered(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(events.publish).not.toHaveBeenCalled();
    });

    it('o autor não marca a própria mensagem (no-op, sem evento)', async () => {
      participants.find.mockResolvedValue(participant(USER_A));

      await service.markDelivered(USER_A, CONVERSATION_ID, MESSAGE_ID);

      expect(messages.markDelivered).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('404 para não participante e para mensagem inexistente ou de outra conversa', async () => {
      participants.find.mockResolvedValueOnce(null);
      await expect(service.markDelivered(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
      );

      messages.findById.mockResolvedValueOnce(null);
      await expect(service.markDelivered(USER_B, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );

      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));
      await expect(service.markDelivered(USER_B, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );
      expect(messages.markDelivered).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());
    });

    it('marca tudo até a mensagem como lido, avança last_read_at e publica MESSAGE_READ', async () => {
      messages.markReadUpTo.mockResolvedValue(3);

      await service.markRead(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(messages.markReadUpTo).toHaveBeenCalledWith(
        CONVERSATION_ID,
        USER_B,
        CREATED_AT,
        expect.any(Date)
      );
      expect(participants.advanceLastReadAt).toHaveBeenCalledWith(
        CONVERSATION_ID,
        USER_B,
        CREATED_AT
      );
      const at = messages.markReadUpTo.mock.calls[0]![3];
      expect(events.publish).toHaveBeenCalledWith(ChatEvents.MESSAGE_READ, {
        conversationId: CONVERSATION_ID,
        userId: USER_B,
        upToMessageId: MESSAGE_ID,
        at,
      });
    });

    it('sem nada novo para marcar: avança last_read_at mas não publica', async () => {
      messages.markReadUpTo.mockResolvedValue(0);

      await service.markRead(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(participants.advanceLastReadAt).toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('404 para não participante e para mensagem de outra conversa', async () => {
      participants.find.mockResolvedValueOnce(null);
      await expect(service.markRead(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
      );

      messages.findById.mockResolvedValueOnce(record({ conversationId: OTHER_CONVERSATION_ID }));
      await expect(service.markRead(USER_B, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        MessageNotFoundException
      );
      expect(messages.markReadUpTo).not.toHaveBeenCalled();
      expect(participants.advanceLastReadAt).not.toHaveBeenCalled();
    });
  });
```

Em `tests/unit/modules/chat/controllers/MessageController.test.ts`, trocar o corpo de `createService()` por:

```ts
  return {
    send: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    markDelivered: jest.fn(),
    markRead: jest.fn(),
  };
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/unit/shared/event-bus --coverage=false`
Expected: FAIL — `service.markDelivered`/`markRead`/`repository.advanceLastReadAt` não existem. (`tsc` também acusa os payloads novos do EventMap.)

- [ ] **Step 3: Payloads no EventMap**

Em `src/shared/interfaces/event.interfaces.ts`, trocar as entradas `[ChatEvents.MESSAGE_DELIVERED]` e `[ChatEvents.MESSAGE_READ]` por:

```ts
  /** `userId` confirmou a entrega de `messageId` (uma vez por destinatário; `senderId` é o autor). */
  [ChatEvents.MESSAGE_DELIVERED]: {
    messageId: string;
    conversationId: string;
    userId: string;
    senderId: string;
    at: Date;
  };
  /** Leitura em lote: tudo de outros autores até `upToMessageId` (inclusive) foi lido por `userId`. */
  [ChatEvents.MESSAGE_READ]: {
    conversationId: string;
    userId: string;
    upToMessageId: string;
    at: Date;
  };
```

- [ ] **Step 4: `advanceLastReadAt`**

Em `src/modules/chat/interfaces/IParticipantRepository.ts`, acrescentar como último membro da interface:

```ts
  /** `last_read_at = max(atual, at)` — nunca retrocede. */
  advanceLastReadAt(conversationId: string, userId: string, at: Date): Promise<void>;
```

Em `src/modules/chat/repositories/ParticipantRepository.ts`, acrescentar como último método da classe:

```ts
  async advanceLastReadAt(conversationId: string, userId: string, at: Date): Promise<void> {
    await Participant.update(
      { lastReadAt: at },
      {
        where: {
          conversationId,
          userId,
          [Op.or]: [{ lastReadAt: null }, { lastReadAt: { [Op.lt]: at } }],
        },
      }
    );
  }
```

Em `tests/support/chat/inMemoryChat.ts`, acrescentar como último método de `InMemoryParticipantRepository`:

```ts
  async advanceLastReadAt(conversationId: string, userId: string, at: Date): Promise<void> {
    const participant = await this.find(conversationId, userId);
    if (participant !== null && (participant.lastReadAt === null || participant.lastReadAt < at)) {
      participant.lastReadAt = at;
    }
  }
```

- [ ] **Step 5: `IMessageService` e `MessageService`**

Substituir `src/modules/chat/interfaces/IMessageService.ts` inteiro por:

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
  /** Confirma a entrega a `userId` (autor não marca a própria; idempotente). */
  markDelivered(userId: string, conversationId: string, messageId: string): Promise<void>;
  /** Marca como lido tudo de outros autores até `messageId` e avança `last_read_at`. */
  markRead(userId: string, conversationId: string, messageId: string): Promise<void>;
}
```

Substituir `src/modules/chat/services/MessageService.ts` inteiro por (novo `requireMessage` também usado por `delete`):

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { CHAT_CONSTANTS } from '../constants';
import {
  ClientMessageIdConflictException,
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

/**
 * Mensagem apagada vira tombstone: mantém id/datas/status (preserva threads e confirmações),
 * esconde o conteúdo.
 */
function toMessageDTO(record: MessageRecord): MessageDTO {
  const deleted = record.deletedAt !== null;
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    content: deleted ? null : record.content,
    replyTo: record.replyTo,
    mentions: deleted ? [] : record.mentions,
    clientMessageId: record.clientMessageId,
    status: {
      sentAt: record.createdAt,
      deliveredTo: record.deliveredTo,
      readBy: record.readBy,
    },
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Reenvio com `clientMessageId` já usado pelo remetente: devolve a mensagem original (sem novo
 * evento nem `last_message_at`). O mesmo id reaproveitado em outra conversa é conflito (409).
 */
function toReplay(existing: MessageRecord, conversationId: string): MessageDTO {
  if (existing.conversationId !== conversationId) {
    throw new ClientMessageIdConflictException();
  }
  return toMessageDTO(existing);
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

    const clientMessageId = data.clientMessageId ?? null;
    if (clientMessageId !== null) {
      const existing = await this.messages.findByClientMessageId(userId, clientMessageId);
      if (existing !== null) {
        return toReplay(existing, conversationId);
      }
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

    const { record, created } = await this.messages.create({
      conversationId,
      senderId: userId,
      content: { type: 'text', text: data.text.trim() },
      replyTo,
      mentions,
      metadata,
      clientMessageId,
    });
    if (!created) {
      return toReplay(record, conversationId);
    }

    // Best-effort: falha em atualizar last_message_at não deve impedir o envio da mensagem.
    try {
      await this.conversations.touchLastMessageAt(conversationId, record.createdAt);
    } catch (error) {
      logger.warn('Falha ao atualizar last_message_at da conversa', {
        conversationId,
        messageId: record.id,
        error,
      });
    }

    const dto = toMessageDTO(record);

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
      message: dto,
    });

    return dto;
  }

  async list(
    userId: string,
    conversationId: string,
    options: ListMessagesOptions = {}
  ): Promise<PaginatedMessages> {
    await this.requireParticipant(conversationId, userId);

    const pageSize = Math.max(
      1,
      Math.min(options.limit ?? CHAT_CONSTANTS.MESSAGE_PAGE_SIZE, CHAT_CONSTANTS.MESSAGE_PAGE_SIZE)
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
    const message = await this.requireMessage(conversationId, messageId);

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

  async markDelivered(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.requireParticipant(conversationId, userId);
    const message = await this.requireMessage(conversationId, messageId);

    if (message.senderId === userId) {
      return;
    }

    const at = new Date();
    const changed = await this.messages.markDelivered(messageId, userId, at);
    if (changed) {
      await this.events.publish(ChatEvents.MESSAGE_DELIVERED, {
        messageId,
        conversationId,
        userId,
        senderId: message.senderId,
        at,
      });
    }
  }

  async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.requireParticipant(conversationId, userId);
    const message = await this.requireMessage(conversationId, messageId);

    const at = new Date();
    const marked = await this.messages.markReadUpTo(conversationId, userId, message.createdAt, at);
    await this.participants.advanceLastReadAt(conversationId, userId, message.createdAt);

    if (marked > 0) {
      await this.events.publish(ChatEvents.MESSAGE_READ, {
        conversationId,
        userId,
        upToMessageId: messageId,
        at,
      });
    }
  }

  /** Mensagem inexistente ou de outra conversa → 404 (não revela mensagens alheias). */
  private async requireMessage(conversationId: string, messageId: string): Promise<MessageRecord> {
    const message = await this.messages.findById(messageId);
    if (message?.conversationId !== conversationId) {
      throw new MessageNotFoundException();
    }
    return message;
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

- [ ] **Step 6: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/unit/shared tests/feature/modules/chat --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 7: Commit**

```bash
node node_modules/.bin/prettier --write src/shared/interfaces src/modules/chat tests/support/chat tests/unit/modules/chat tests/unit/shared/event-bus
git add src/shared/interfaces/event.interfaces.ts src/modules/chat/interfaces/IParticipantRepository.ts src/modules/chat/repositories/ParticipantRepository.ts src/modules/chat/interfaces/IMessageService.ts src/modules/chat/services/MessageService.ts tests/support/chat/inMemoryChat.ts tests/unit/shared/event-bus/chat-events.test.ts tests/unit/modules/chat/repositories/ParticipantRepository.test.ts tests/unit/modules/chat/services/ConversationService.test.ts tests/unit/modules/chat/services/MessageService.test.ts tests/unit/modules/chat/controllers/MessageController.test.ts
git commit -m "✨ feat: confirma entrega e leitura de mensagens com eventos no EventBus"
```

---

### Task 7: `POST /api/conversations/:id/read`

**Files:**
- Modify: `src/modules/chat/validation/chat.schemas.ts`, `src/modules/chat/validation/index.ts` (`markReadSchema`, `MarkReadInput`)
- Modify: `src/modules/chat/controllers/MessageController.ts` (`markRead`)
- Modify: `src/modules/chat/routes/conversation.routes.ts`
- Test: `tests/unit/modules/chat/validation/chat.schemas.test.ts`, `tests/unit/modules/chat/controllers/MessageController.test.ts`, `tests/unit/modules/chat/routes/conversation.routes.test.ts`, `tests/feature/modules/chat/chat.test.ts`

**Interfaces:**
- Consumes: `IMessageService.markRead` (Task 6).
- Produces: `markReadSchema = z.object({ messageId: ObjectId })`; `MessageController.markRead(req, res)` → 204; rota `POST /:id/read` (autenticada).

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/unit/modules/chat/validation/chat.schemas.test.ts`: acrescentar `markReadSchema,` no import de `@/modules/chat/validation` (depois de `sendMessageSchema,`) e, imediatamente antes de `  describe('sendMessageSchema', () => {`:

```ts
  describe('markReadSchema', () => {
    it('exige messageId ObjectId (24 hex)', () => {
      expect(markReadSchema.parse({ messageId: MESSAGE_ID })).toEqual({ messageId: MESSAGE_ID });
      expect(markReadSchema.safeParse({ messageId: 'x' }).success).toBe(false);
      expect(markReadSchema.safeParse({}).success).toBe(false);
    });
  });
```

Em `tests/unit/modules/chat/controllers/MessageController.test.ts`, imediatamente antes de `  describe('delete', () => {`:

```ts
  describe('markRead', () => {
    it('deve marcar como lido até a mensagem e responder 204', async () => {
      service.markRead.mockResolvedValue(undefined);

      await controller.markRead(createReq({ body: { messageId: MESSAGE_ID } }), res);

      expect(service.markRead).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 para id da conversa ou messageId inválidos', async () => {
      await controller.markRead(
        createReq({ params: { id: 'x' }, body: { messageId: MESSAGE_ID } }),
        res
      );
      await controller.markRead(createReq({ body: { messageId: 'x' } }), res);
      await controller.markRead(createReq({ body: {} }), res);

      expect(res.status).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(3, HttpStatus.BAD_REQUEST);
      expect(service.markRead).not.toHaveBeenCalled();
    });
  });
```

Em `tests/unit/modules/chat/routes/conversation.routes.test.ts`: no mock de `messageController`, acrescentar `markRead: jest.fn(),` depois de `delete: jest.fn(),`; em `ROUTES`, acrescentar como última entrada `['POST', '/:id/read', messageController, 'markRead'],`; e renomear o teste `'deve definir exatamente as 13 rotas do chat'` para `'deve definir exatamente as 14 rotas do chat'`.

Em `tests/feature/modules/chat/chat.test.ts`: no `it.each` de `describe('autenticação')`, acrescentar como última entrada ``['post', `/api/conversations/${FAKE_CONVERSATION}/read`],``; e, imediatamente antes de `    it('bloqueio em qualquer sentido → 403 ao criar e ao enviar', async () => {`:

```ts
    it('POST /:id/read marca como lidas (e entregues) as mensagens do outro até a indicada', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;
      const m1 = await send(ANA, conversationId, 'm1');
      const m2 = await send(ANA, conversationId, 'm2');
      const own = await send(BOB, conversationId, 'minha');

      const read = await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set(as(BOB))
        .send({ messageId: m2.body.data.id });
      expect(read.status).toBe(HttpStatus.NO_CONTENT);

      const page = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA));
      const byId = new Map(
        page.body.data.messages.map((m: { id: string; status: unknown }) => [m.id, m.status])
      );
      for (const id of [m1.body.data.id, m2.body.data.id]) {
        expect(byId.get(id)).toEqual(
          expect.objectContaining({
            deliveredTo: [expect.objectContaining({ userId: BOB })],
            readBy: [expect.objectContaining({ userId: BOB })],
          })
        );
      }
      expect(byId.get(own.body.data.id)).toEqual(expect.objectContaining({ readBy: [] }));

      const membership = store.participants.find(
        (p) => p.conversationId === conversationId && p.userId === BOB
      );
      expect(membership?.lastReadAt?.toISOString()).toBe(m2.body.data.createdAt);
    });

    it('POST /:id/read valida o corpo (400) e esconde mensagens de outras conversas (404)', async () => {
      const first = await createDirect(ANA, BOB);
      const second = await createDirect(ANA, CAROL);
      const elsewhere = await send(ANA, second.body.data.id as string, 'noutra conversa');

      const invalid = await request(app)
        .post(`/api/conversations/${String(first.body.data.id)}/read`)
        .set(as(BOB))
        .send({ messageId: 'x' });
      const foreign = await request(app)
        .post(`/api/conversations/${String(first.body.data.id)}/read`)
        .set(as(BOB))
        .send({ messageId: elsewhere.body.data.id });

      expect(invalid.status).toBe(HttpStatus.BAD_REQUEST);
      expect(foreign.status).toBe(HttpStatus.NOT_FOUND);
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/feature/modules/chat --coverage=false`
Expected: FAIL — `markReadSchema` indefinido, `controller.markRead is not a function`, 14ª rota ausente, `POST /:id/read` → 404.

- [ ] **Step 3: Schema, controller e rota**

Em `src/modules/chat/validation/chat.schemas.ts`, acrescentar antes de `export type CreateDirectConversationInput`:

```ts
export const markReadSchema = z.object({
  messageId: objectId('ID de mensagem inválido'),
});

```

e, depois de `export type SendMessageInput = z.infer<typeof sendMessageSchema>;`, a linha `export type MarkReadInput = z.infer<typeof markReadSchema>;`.

Em `src/modules/chat/validation/index.ts`, acrescentar `markReadSchema,` ao `export { ... }` (depois de `sendMessageSchema,`) e `MarkReadInput,` ao `export type { ... }` (depois de `SendMessageInput,`).

Em `src/modules/chat/controllers/MessageController.ts`: acrescentar `markReadSchema,` ao import de `../validation/chat.schemas` (depois de `listMessagesQuerySchema,`) e inserir antes de `  async delete(req: Request, res: Response): Promise<void> {`:

```ts
  /** Marca como lido tudo de outros autores até `messageId` (equivalente REST de `message:read`). */
  async markRead(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const conversationId = parseConversationId(req, res);
    if (conversationId === null) {
      return;
    }

    const body = markReadSchema.safeParse(req.body);
    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    await this.messages.markRead(userId, conversationId, body.data.messageId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
```

Em `src/modules/chat/routes/conversation.routes.ts`, inserir antes de `export { router as conversationRoutes };`:

```ts
/**
 * @route POST /conversations/:id/read
 * @description Marca como lidas as mensagens até `messageId` (inclusive) — 204
 * @access Private
 */
router.post(
  '/:id/read',
  authenticate,
  asyncHandler((req, res) => messageController.markRead(req, res))
);
```

- [ ] **Step 4: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/chat tests/feature/modules/chat --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 5: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/chat tests/unit/modules/chat tests/feature/modules/chat
git add src/modules/chat/validation/chat.schemas.ts src/modules/chat/validation/index.ts src/modules/chat/controllers/MessageController.ts src/modules/chat/routes/conversation.routes.ts tests/unit/modules/chat/validation/chat.schemas.test.ts tests/unit/modules/chat/controllers/MessageController.test.ts tests/unit/modules/chat/routes/conversation.routes.test.ts tests/feature/modules/chat/chat.test.ts
git commit -m "✨ feat: adiciona POST /api/conversations/:id/read"
```

---

### Task 8: Dependências do Socket.IO e esqueleto do módulo `realtime`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/modules/realtime/constants/{realtime.constants.ts,index.ts}`
- Create: `src/modules/realtime/types/{realtime.types.ts,index.ts}`
- Create: `src/modules/realtime/errors/{realtime.errors.ts,index.ts}`
- Create: `src/modules/realtime/validation/{realtime.schemas.ts,index.ts}`
- Test: `tests/unit/modules/realtime/{constants/realtime.constants,errors/realtime.errors,validation/realtime.schemas,types/realtime.types}.test.ts`

**Interfaces:**
- Consumes: `CHAT_CONSTANTS.MAX_DEVICE_LENGTH`; `conversationIdParamSchema`, `messageParamSchema`, `sendMessageSchema` (de `@/modules/chat/validation`); `ConversationChange`, `ConversationType`, `MessageDTO` (de `@/modules/chat/types`).
- Produces:
  - `REALTIME_CONSTANTS = { TYPING_TTL_MS: 3000, MAX_DEVICE_LENGTH: 255 }`, `ROOM_PREFIXES`, `userRoom(userId)`, `conversationRoom(conversationId)`, `CLIENT_EVENTS`, `SERVER_EVENTS`, `SOCKET_ERRORS = { UNAUTHORIZED, INTERNAL_ERROR }`.
  - Tipos: `SocketData { userId; ip: string | null; device: string | null }`, `AckError`, `AckErrorDetail`, `AckResponse<T>`, `AckCallback<T>`, `ClientToServerEvents` (payload/ack `unknown`), `ServerToClientEvents`, payloads (`MessageStatusPayload`, `TypingIndicatorPayload`, `ConversationUpdatedPayload`…), `RealtimeServer`, `RealtimeSocket`.
  - `TypingNotAllowedException` (400 `BAD_REQUEST`, "Indicador de digitação disponível apenas em conversas 1:1").
  - `messageSendPayloadSchema`, `messageStatusPayloadSchema`, `typingPayloadSchema` (+ tipos inferidos).

- [ ] **Step 1: Instalar as dependências (major 4 do Socket.IO)**

```bash
npm install socket.io@^4.8.3 @socket.io/redis-adapter@^8.3.0
npm install -D socket.io-client@^4.8.3
npm ls socket.io socket.io-client @socket.io/redis-adapter socket.io-adapter
```

Expected: `socket.io@4.8.x`, `socket.io-client@4.8.x`, `@socket.io/redis-adapter@8.3.x` e um único `socket.io-adapter@2.5.x` (`deduped`) — o peer `socket.io-adapter ^2.5.4` do redis-adapter fica satisfeito. Compatibilidade verificada: `socket.io` 4.8 exige Node ≥ 10 (usamos 20 local / 22 no CI) e se acopla a `http.Server` — o Express 5 continua sendo só o request handler (`http.createServer(app)`, Task 14). `@socket.io/redis-adapter` aceita clientes `ioredis` 5 (o projeto já usa). `git diff package.json` deve mostrar só as três linhas novas (`socket.io` e `@socket.io/redis-adapter` em `dependencies`, `socket.io-client` em `devDependencies`).

- [ ] **Step 2: Commit das dependências**

```bash
git add package.json package-lock.json
git commit -m "➕ chore: adiciona socket.io, @socket.io/redis-adapter e socket.io-client"
```

- [ ] **Step 3: Escrever os testes que falham**

Criar `tests/unit/modules/realtime/constants/realtime.constants.test.ts`:

```ts
import {
  CLIENT_EVENTS,
  REALTIME_CONSTANTS,
  ROOM_PREFIXES,
  SERVER_EVENTS,
  SOCKET_ERRORS,
  conversationRoom,
  userRoom,
} from '@/modules/realtime/constants';

describe('realtime constants', () => {
  it('deve definir o TTL de digitação (3s) e o limite do device', () => {
    expect(REALTIME_CONSTANTS).toEqual({ TYPING_TTL_MS: 3000, MAX_DEVICE_LENGTH: 255 });
  });

  it('deve nomear as rooms por usuário e por conversa', () => {
    expect(ROOM_PREFIXES).toEqual({ USER: 'user:', CONVERSATION: 'conversation:' });
    expect(userRoom('u1')).toBe('user:u1');
    expect(conversationRoom('c1')).toBe('conversation:c1');
  });

  it('deve listar os eventos cliente → servidor', () => {
    expect(CLIENT_EVENTS).toEqual({
      MESSAGE_SEND: 'message:send',
      MESSAGE_DELIVERED: 'message:delivered',
      MESSAGE_READ: 'message:read',
      TYPING_START: 'typing:start',
      TYPING_STOP: 'typing:stop',
    });
  });

  it('deve listar os eventos servidor → cliente', () => {
    expect(SERVER_EVENTS).toEqual({
      MESSAGE_NEW: 'message:new',
      MESSAGE_DELETED: 'message:deleted',
      MESSAGE_STATUS: 'message:status',
      TYPING_INDICATOR: 'typing:indicator',
      CONVERSATION_NEW: 'conversation:new',
      CONVERSATION_UPDATED: 'conversation:updated',
      CONVERSATION_DELETED: 'conversation:deleted',
    });
  });

  it('deve definir as mensagens de erro do handshake (connect_error)', () => {
    expect(SOCKET_ERRORS).toEqual({
      UNAUTHORIZED: 'UNAUTHORIZED',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
    });
  });
});
```

Criar `tests/unit/modules/realtime/errors/realtime.errors.test.ts`:

```ts
import { TypingNotAllowedException } from '@/modules/realtime/errors';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

describe('realtime errors', () => {
  it('TypingNotAllowedException é 400 BAD_REQUEST com mensagem padrão', () => {
    const error = new TypingNotAllowedException();

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(error.code).toBe(ErrorCode.BAD_REQUEST);
    expect(error.message).toBe('Indicador de digitação disponível apenas em conversas 1:1');
  });

  it('aceita mensagem personalizada', () => {
    expect(new TypingNotAllowedException('x').message).toBe('x');
  });
});
```

Criar `tests/unit/modules/realtime/validation/realtime.schemas.test.ts`:

```ts
import {
  messageSendPayloadSchema,
  messageStatusPayloadSchema,
  typingPayloadSchema,
} from '@/modules/realtime/validation';

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

describe('realtime schemas', () => {
  describe('messageSendPayloadSchema (reusa sendMessageSchema do chat)', () => {
    it('aceita o payload completo, normaliza UUIDs e faz trim do texto', () => {
      const parsed = messageSendPayloadSchema.parse({
        conversationId: CONVERSATION_ID.toUpperCase(),
        text: '  oi  ',
        replyTo: MESSAGE_ID,
        mentions: [USER_B],
        clientMessageId: CLIENT_MESSAGE_ID,
      });

      expect(parsed).toEqual({
        conversationId: CONVERSATION_ID,
        text: 'oi',
        replyTo: MESSAGE_ID,
        mentions: [USER_B],
        clientMessageId: CLIENT_MESSAGE_ID,
      });
    });

    it('rejeita conversa ausente/inválida, texto vazio e payload que não é objeto', () => {
      expect(messageSendPayloadSchema.safeParse({ text: 'oi' }).success).toBe(false);
      expect(messageSendPayloadSchema.safeParse({ conversationId: 'x', text: 'oi' }).success).toBe(
        false
      );
      expect(
        messageSendPayloadSchema.safeParse({ conversationId: CONVERSATION_ID, text: '  ' }).success
      ).toBe(false);
      expect(messageSendPayloadSchema.safeParse('oi').success).toBe(false);
      expect(messageSendPayloadSchema.safeParse(undefined).success).toBe(false);
    });
  });

  describe('messageStatusPayloadSchema', () => {
    it('exige conversationId UUID e messageId ObjectId', () => {
      expect(
        messageStatusPayloadSchema.parse({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID })
      ).toEqual({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID });
      expect(
        messageStatusPayloadSchema.safeParse({ conversationId: CONVERSATION_ID, messageId: 'x' })
          .success
      ).toBe(false);
      expect(messageStatusPayloadSchema.safeParse({ messageId: MESSAGE_ID }).success).toBe(false);
    });
  });

  describe('typingPayloadSchema', () => {
    it('exige conversationId UUID', () => {
      expect(typingPayloadSchema.parse({ conversationId: CONVERSATION_ID })).toEqual({
        conversationId: CONVERSATION_ID,
      });
      expect(typingPayloadSchema.safeParse({ conversationId: 'x' }).success).toBe(false);
      expect(typingPayloadSchema.safeParse(null).success).toBe(false);
    });
  });
});
```

Criar `tests/unit/modules/realtime/types/realtime.types.test.ts` (checagem de tipos pelo `tsc`):

```ts
import type {
  AckResponse,
  MessageStatusPayload,
  ServerToClientEvents,
  SocketData,
} from '@/modules/realtime/types';

describe('realtime types', () => {
  it('descrevem o ack e os payloads servidor → cliente', () => {
    const ok: AckResponse<null> = { ok: true, data: null };
    const failure: AckResponse<null> = {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Conversa não encontrada', statusCode: 404 },
    };
    const status: MessageStatusPayload = {
      type: 'read',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '22222222-2222-4222-8222-222222222222',
      upToMessageId: '65f000000000000000000001',
      at: new Date(),
    };
    const data: SocketData = { userId: 'u1', ip: null, device: null };
    const indicator: Parameters<ServerToClientEvents['typing:indicator']>[0] = {
      conversationId: 'c1',
      userId: 'u1',
      isTyping: true,
    };

    expect([ok.ok, failure.ok, status.type, data.userId, indicator.isTyping]).toEqual([
      true,
      false,
      'read',
      'u1',
      true,
    ]);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/constants'` (e errors/validation). O teste de tipos passa no Jest (ts-jest sem type-check), mas `node node_modules/.bin/tsc --noEmit` falha com `Cannot find module '@/modules/realtime/types'`.

- [ ] **Step 5: Constantes**

Criar `src/modules/realtime/constants/realtime.constants.ts`:

```ts
import { CHAT_CONSTANTS } from '@/modules/chat/constants';

export const REALTIME_CONSTANTS = {
  /** Sem novo `typing:start` nesse intervalo, o indicador expira (RF003.5). */
  TYPING_TTL_MS: 3000,
  /** Mesmo limite do `device` gravado nas mensagens enviadas via REST. */
  MAX_DEVICE_LENGTH: CHAT_CONSTANTS.MAX_DEVICE_LENGTH,
} as const;

export const ROOM_PREFIXES = {
  USER: 'user:',
  CONVERSATION: 'conversation:',
} as const;

/** Room pessoal: todos os sockets (abas/dispositivos) de um usuário. */
export function userRoom(userId: string): string {
  return `${ROOM_PREFIXES.USER}${userId}`;
}

/** Room da conversa: todos os sockets dos participantes. */
export function conversationRoom(conversationId: string): string {
  return `${ROOM_PREFIXES.CONVERSATION}${conversationId}`;
}

/** Eventos cliente → servidor (todos aceitam ack). */
export const CLIENT_EVENTS = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

/** Eventos servidor → cliente. */
export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_STATUS: 'message:status',
  TYPING_INDICATOR: 'typing:indicator',
  CONVERSATION_NEW: 'conversation:new',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',
} as const;

/** `message` do `connect_error` que o cliente recebe quando o handshake é recusado. */
export const SOCKET_ERRORS = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
```

Criar `src/modules/realtime/constants/index.ts`:

```ts
export {
  REALTIME_CONSTANTS,
  ROOM_PREFIXES,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SOCKET_ERRORS,
  userRoom,
  conversationRoom,
} from './realtime.constants';
```

- [ ] **Step 6: Tipos**

Criar `src/modules/realtime/types/realtime.types.ts`:

```ts
import type { Server, Socket } from 'socket.io';
import type { ConversationChange, ConversationType, MessageDTO } from '@/modules/chat/types';

/** Dados do socket preenchidos pelo middleware de autenticação do handshake. */
export interface SocketData {
  userId: string;
  ip: string | null;
  device: string | null;
}

export interface AckErrorDetail {
  field: string;
  message: string;
}

/** Mesmo formato de erro da API REST (`AppError`), sem timestamp. */
export interface AckError {
  code: string;
  message: string;
  statusCode: number;
  details?: AckErrorDetail[];
}

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: AckError };

export type AckCallback<T> = (response: AckResponse<T>) => void;

/**
 * Eventos cliente → servidor. Payload e ack chegam sem garantia de formato (qualquer cliente
 * pode emitir qualquer coisa): os handlers validam o payload com Zod e só chamam o ack se for
 * uma função.
 */
export interface ClientToServerEvents {
  'message:send': (payload: unknown, ack?: unknown) => void;
  'message:delivered': (payload: unknown, ack?: unknown) => void;
  'message:read': (payload: unknown, ack?: unknown) => void;
  'typing:start': (payload: unknown, ack?: unknown) => void;
  'typing:stop': (payload: unknown, ack?: unknown) => void;
}

export interface MessageDeletedPayload {
  conversationId: string;
  messageId: string;
}

export interface MessageDeliveredStatus {
  type: 'delivered';
  conversationId: string;
  messageId: string;
  userId: string;
  at: Date;
}

export interface MessageReadStatus {
  type: 'read';
  conversationId: string;
  userId: string;
  upToMessageId: string;
  at: Date;
}

export type MessageStatusPayload = MessageDeliveredStatus | MessageReadStatus;

export interface TypingIndicatorPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ConversationNewPayload {
  conversationId: string;
  type: ConversationType;
}

export interface ConversationUpdatedPayload {
  conversationId: string;
  change: ConversationChange;
  actorId: string;
  affectedUserIds: string[];
  name?: string;
}

export interface ConversationDeletedPayload {
  conversationId: string;
}

/** Eventos servidor → cliente (datas chegam ao cliente como strings ISO). */
export interface ServerToClientEvents {
  'message:new': (message: MessageDTO) => void;
  'message:deleted': (payload: MessageDeletedPayload) => void;
  'message:status': (payload: MessageStatusPayload) => void;
  'typing:indicator': (payload: TypingIndicatorPayload) => void;
  'conversation:new': (payload: ConversationNewPayload) => void;
  'conversation:updated': (payload: ConversationUpdatedPayload) => void;
  'conversation:deleted': (payload: ConversationDeletedPayload) => void;
}

/** Sem eventos entre servidores além dos do próprio adapter. */
export type InterServerEvents = Record<string, never>;

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
```

Criar `src/modules/realtime/types/index.ts`:

```ts
export type {
  SocketData,
  AckErrorDetail,
  AckError,
  AckResponse,
  AckCallback,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  MessageDeletedPayload,
  MessageDeliveredStatus,
  MessageReadStatus,
  MessageStatusPayload,
  TypingIndicatorPayload,
  ConversationNewPayload,
  ConversationUpdatedPayload,
  ConversationDeletedPayload,
  RealtimeServer,
  RealtimeSocket,
} from './realtime.types';
```

- [ ] **Step 7: Erros e schemas**

Criar `src/modules/realtime/errors/realtime.errors.ts`:

```ts
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

export class TypingNotAllowedException extends AppError {
  constructor(message = 'Indicador de digitação disponível apenas em conversas 1:1') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
  }
}
```

Criar `src/modules/realtime/errors/index.ts`:

```ts
export { TypingNotAllowedException } from './realtime.errors';
```

Criar `src/modules/realtime/validation/realtime.schemas.ts`:

```ts
import { z } from 'zod';
import {
  conversationIdParamSchema,
  messageParamSchema,
  sendMessageSchema,
} from '@/modules/chat/validation';

/** Mesmas regras (e mensagens) da API REST: UUID normalizado e ObjectId de 24 hex. */
const conversationId = conversationIdParamSchema.shape.id;
const messageId = messageParamSchema.shape.messageId;

/** `message:send` — o corpo de `POST /messages` mais o `conversationId`. */
export const messageSendPayloadSchema = sendMessageSchema.extend({ conversationId });

/** `message:delivered` e `message:read`. */
export const messageStatusPayloadSchema = z.object({ conversationId, messageId });

/** `typing:start` e `typing:stop`. */
export const typingPayloadSchema = z.object({ conversationId });

export type MessageSendPayload = z.infer<typeof messageSendPayloadSchema>;
export type MessageStatusPayloadInput = z.infer<typeof messageStatusPayloadSchema>;
export type TypingPayload = z.infer<typeof typingPayloadSchema>;
```

Criar `src/modules/realtime/validation/index.ts`:

```ts
export {
  messageSendPayloadSchema,
  messageStatusPayloadSchema,
  typingPayloadSchema,
} from './realtime.schemas';

export type {
  MessageSendPayload,
  MessageStatusPayloadInput,
  TypingPayload,
} from './realtime.schemas';
```

- [ ] **Step 8: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 9: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime tests/unit/modules/realtime
git add src/modules/realtime/constants src/modules/realtime/types src/modules/realtime/errors src/modules/realtime/validation tests/unit/modules/realtime/constants tests/unit/modules/realtime/errors tests/unit/modules/realtime/validation tests/unit/modules/realtime/types
git commit -m "✨ feat: cria o módulo realtime com contratos de eventos, erros e schemas"
```

---

### Task 9: Handshake — `socketAuth` e `joinRooms`

**Files:**
- Modify: `src/modules/realtime/types/realtime.types.ts`, `src/modules/realtime/types/index.ts` (`SocketMiddleware`)
- Create: `src/modules/realtime/middlewares/{socketAuth.ts,joinRooms.ts,index.ts}`
- Create: `tests/support/realtime/fakeSocket.ts`
- Test: `tests/unit/modules/realtime/middlewares/{socketAuth,joinRooms,index}.test.ts`

**Interfaces:**
- Consumes: `IAuthService.validateAccessToken(token): { valid: boolean; userId?: string }` (singleton `authService` de `@/modules/auth/services/AuthService`); `IConversationService.getUserConversationIds(userId)` (singleton `conversationService`); `userRoom`/`conversationRoom`/`SOCKET_ERRORS`/`REALTIME_CONSTANTS` (Task 8).
- Produces:
  - `type SocketMiddleware = (socket: RealtimeSocket, next: (error?: ExtendedError) => void) => void`.
  - `extractHandshakeToken(handshake): string | null` — `auth.token` (preferido) ou `Authorization: Bearer`.
  - `createSocketAuthMiddleware(auth?)` — recusa com `Error('UNAUTHORIZED')`; aceito, `socket.data = { userId, ip, device }`.
  - `createJoinRoomsMiddleware(conversations?)` — `socket.join([user:<id>, ...conversation:<id>])`; falha ⇒ `Error('INTERNAL_ERROR')` + `logger.error`.
  - `tests/support/realtime/fakeSocket.ts`: `createFakeSocket({ id?, data? })` (registra `handlers` de `socket.on`, captura `socket.to(room).emit` em `broadcasts`) e `createFakeServer()` (captura `io.to(rooms).emit` em `emits`, `io.in(room).socketsJoin/Leave` em `joins`/`leaves`).

- [ ] **Step 1: Suporte de testes (socket/io falsos)**

Criar `tests/support/realtime/fakeSocket.ts`:

```ts
// Socket/io falsos para os unit tests do módulo realtime. Não é arquivo de teste (não casa com
// testMatch). Funções jest.fn() são criadas a cada chamada (resetMocks:true não as afeta).
import type { RealtimeServer, RealtimeSocket, SocketData } from '@/modules/realtime/types';

export interface FakeBroadcast {
  emit: jest.Mock;
}

export interface FakeSocket {
  id: string;
  data: Partial<SocketData>;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, string | undefined>;
    address: string;
  };
  join: jest.Mock;
  on: jest.Mock;
  to: jest.Mock;
  /** Emissões feitas via `socket.to(room).emit(...)`, na ordem: `[room, event, payload]`. */
  broadcasts: [string, string, unknown][];
  /** Handlers registrados com `socket.on(event, handler)`. */
  handlers: Map<string, (...args: unknown[]) => void>;
  asSocket(): RealtimeSocket;
}

export function createFakeSocket(
  overrides: Partial<Pick<FakeSocket, 'id' | 'data'>> = {}
): FakeSocket {
  const broadcasts: [string, string, unknown][] = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket: FakeSocket = {
    id: overrides.id ?? 'socket-1',
    data: overrides.data ?? {},
    handshake: { auth: {}, headers: {}, address: '127.0.0.1' },
    join: jest.fn(),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
        broadcasts.push([room, event, payload]);
        return true;
      },
    })),
    broadcasts,
    handlers,
    asSocket: () => socket as unknown as RealtimeSocket,
  };
  return socket;
}

export interface FakeServer {
  /** Emissões `io.to(rooms).emit(event, payload)`: `[rooms, event, payload]` (rooms sempre array). */
  emits: [string[], string, unknown][];
  /** Chamadas `io.in(room).socketsJoin(target)` e `socketsLeave`: `[room, target]`. */
  joins: [string, string][];
  leaves: [string, string][];
  to: jest.Mock;
  in: jest.Mock;
  asServer(): RealtimeServer;
}

export function createFakeServer(): FakeServer {
  const emits: [string[], string, unknown][] = [];
  const joins: [string, string][] = [];
  const leaves: [string, string][] = [];
  const server: FakeServer = {
    emits,
    joins,
    leaves,
    to: jest.fn((rooms: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        emits.push([Array.isArray(rooms) ? rooms : [rooms], event, payload]);
        return true;
      },
    })),
    in: jest.fn((room: string) => ({
      socketsJoin: (target: string) => {
        joins.push([room, target]);
      },
      socketsLeave: (target: string) => {
        leaves.push([room, target]);
      },
    })),
    asServer: () => server as unknown as RealtimeServer,
  };
  return server;
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `tests/unit/modules/realtime/middlewares/socketAuth.test.ts`:

```ts
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));

import {
  createSocketAuthMiddleware,
  extractHandshakeToken,
} from '@/modules/realtime/middlewares/socketAuth';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';

describe('socketAuth', () => {
  let auth: { validateAccessToken: jest.Mock };
  let socket: FakeSocket;
  let next: jest.Mock;

  beforeEach(() => {
    auth = { validateAccessToken: jest.fn() };
    socket = createFakeSocket();
    next = jest.fn();
  });

  describe('extractHandshakeToken', () => {
    it('prefere auth.token', () => {
      socket.handshake.auth = { token: 'from-auth' };
      socket.handshake.headers.authorization = 'Bearer from-header';

      expect(extractHandshakeToken(socket.asSocket().handshake)).toBe('from-auth');
    });

    it('usa o header Authorization: Bearer quando não há auth.token', () => {
      socket.handshake.auth = { token: '' };
      socket.handshake.headers.authorization = 'Bearer from-header';

      expect(extractHandshakeToken(socket.asSocket().handshake)).toBe('from-header');
    });

    it('retorna null sem token, com esquema diferente de Bearer ou Bearer vazio', () => {
      expect(extractHandshakeToken(socket.asSocket().handshake)).toBeNull();

      socket.handshake.auth = { token: 123 };
      socket.handshake.headers.authorization = 'Basic abc';
      expect(extractHandshakeToken(socket.asSocket().handshake)).toBeNull();

      socket.handshake.headers.authorization = 'Bearer   ';
      expect(extractHandshakeToken(socket.asSocket().handshake)).toBeNull();
    });
  });

  describe('createSocketAuthMiddleware', () => {
    it('token válido: preenche socket.data (userId, ip, device) e segue', () => {
      auth.validateAccessToken.mockReturnValue({ valid: true, userId: USER_A });
      socket.handshake.auth = { token: 'good' };
      socket.handshake.headers['user-agent'] = 'jest-agent';

      createSocketAuthMiddleware(auth)(socket.asSocket(), next);

      expect(auth.validateAccessToken).toHaveBeenCalledWith('good');
      expect(socket.data).toEqual({ userId: USER_A, ip: '127.0.0.1', device: 'jest-agent' });
      expect(next).toHaveBeenCalledWith();
    });

    it('trunca o user-agent em 255 e usa null sem user-agent/endereço', () => {
      auth.validateAccessToken.mockReturnValue({ valid: true, userId: USER_A });
      socket.handshake.auth = { token: 'good' };
      socket.handshake.headers['user-agent'] = 'a'.repeat(300);

      createSocketAuthMiddleware(auth)(socket.asSocket(), next);
      expect(socket.data.device).toBe('a'.repeat(255));

      const bare = createFakeSocket();
      bare.handshake.auth = { token: 'good' };
      bare.handshake.address = '';
      createSocketAuthMiddleware(auth)(bare.asSocket(), next);
      expect(bare.data).toEqual({ userId: USER_A, ip: null, device: null });
    });

    it('sem token: recusa com UNAUTHORIZED sem consultar o AuthService', () => {
      createSocketAuthMiddleware(auth)(socket.asSocket(), next);

      expect(auth.validateAccessToken).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'UNAUTHORIZED' }));
      expect(socket.data).toEqual({});
    });

    it('token inválido ou sem userId: recusa com UNAUTHORIZED', () => {
      socket.handshake.auth = { token: 'bad' };
      auth.validateAccessToken
        .mockReturnValueOnce({ valid: false })
        .mockReturnValueOnce({ valid: true })
        .mockReturnValueOnce({ valid: true, userId: '' });

      const middleware = createSocketAuthMiddleware(auth);
      middleware(socket.asSocket(), next);
      middleware(socket.asSocket(), next);
      middleware(socket.asSocket(), next);

      expect(next).toHaveBeenCalledTimes(3);
      for (const [error] of next.mock.calls) {
        expect(error).toEqual(expect.objectContaining({ message: 'UNAUTHORIZED' }));
      }
    });

    it('usa o authService padrão quando nada é injetado', () => {
      expect(typeof createSocketAuthMiddleware()).toBe('function');
    });
  });
});
```

Criar `tests/unit/modules/realtime/middlewares/joinRooms.test.ts`:

```ts
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createJoinRoomsMiddleware } from '@/modules/realtime/middlewares/joinRooms';
import { logger } from '@/shared/logger';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const mockLogger = logger as jest.Mocked<typeof logger>;
const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function run(
  middleware: ReturnType<typeof createJoinRoomsMiddleware>,
  socket: FakeSocket
): Promise<unknown[]> {
  return new Promise((resolve) => {
    middleware(socket.asSocket(), (...args: unknown[]) => {
      resolve(args);
    });
  });
}

describe('joinRooms', () => {
  let conversations: { getUserConversationIds: jest.Mock };
  let socket: FakeSocket;

  beforeEach(() => {
    conversations = { getUserConversationIds: jest.fn() };
    socket = createFakeSocket({ data: { userId: USER_A, ip: null, device: null } });
  });

  it('entra na room do usuário e nas de todas as conversas antes de concluir o handshake', async () => {
    conversations.getUserConversationIds.mockResolvedValue([CONVERSATION_1, CONVERSATION_2]);

    const args = await run(createJoinRoomsMiddleware(conversations), socket);

    expect(conversations.getUserConversationIds).toHaveBeenCalledWith(USER_A);
    expect(socket.join).toHaveBeenCalledWith([
      `user:${USER_A}`,
      `conversation:${CONVERSATION_1}`,
      `conversation:${CONVERSATION_2}`,
    ]);
    expect(args).toEqual([]);
  });

  it('falha ao carregar as conversas: recusa com INTERNAL_ERROR e loga', async () => {
    const dbError = new Error('db down');
    conversations.getUserConversationIds.mockRejectedValue(dbError);

    const [error] = await run(createJoinRoomsMiddleware(conversations), socket);

    expect(error).toEqual(expect.objectContaining({ message: 'INTERNAL_ERROR' }));
    expect(socket.join).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), dbError, {
      userId: USER_A,
    });
  });

  it('envolve rejeições que não são Error antes de logar', async () => {
    conversations.getUserConversationIds.mockRejectedValue('falhou');

    await run(createJoinRoomsMiddleware(conversations), socket);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'falhou' }),
      { userId: USER_A }
    );
  });

  it('usa o conversationService padrão quando nada é injetado', () => {
    expect(typeof createJoinRoomsMiddleware()).toBe('function');
  });
});
```

Criar `tests/unit/modules/realtime/middlewares/index.test.ts`:

```ts
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));

import * as middlewares from '@/modules/realtime/middlewares';

describe('realtime middlewares index', () => {
  it('deve exportar os middlewares do handshake', () => {
    expect(typeof middlewares.createSocketAuthMiddleware).toBe('function');
    expect(typeof middlewares.createJoinRoomsMiddleware).toBe('function');
    expect(typeof middlewares.extractHandshakeToken).toBe('function');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/middlewares --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/middlewares/socketAuth'` (e `joinRooms`, `index`).

- [ ] **Step 4: Tipo do middleware**

Em `src/modules/realtime/types/realtime.types.ts`, trocar a primeira linha por `import type { ExtendedError, Server, Socket } from 'socket.io';` e acrescentar no fim do arquivo:

```ts
/** Middleware do handshake (`io.use`): `next(error)` recusa a conexão com `connect_error`. */
export type SocketMiddleware = (
  socket: RealtimeSocket,
  next: (error?: ExtendedError) => void
) => void;
```

Em `src/modules/realtime/types/index.ts`, acrescentar `SocketMiddleware,` depois de `RealtimeSocket,`.

- [ ] **Step 5: Middlewares**

Criar `src/modules/realtime/middlewares/socketAuth.ts`:

```ts
import type { IAuthService } from '@/modules/auth/interfaces';
import { authService } from '@/modules/auth/services/AuthService';
import { REALTIME_CONSTANTS, SOCKET_ERRORS } from '../constants';
import type { RealtimeSocket, SocketMiddleware } from '../types';

const BEARER_PREFIX = 'Bearer ';

/** Token do handshake: `auth.token` (preferido) ou header `Authorization: Bearer <token>`. */
export function extractHandshakeToken(handshake: RealtimeSocket['handshake']): string | null {
  const { token } = handshake.auth as { token?: unknown };
  if (typeof token === 'string' && token !== '') {
    return token;
  }

  const header = handshake.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX) === true) {
    const bearer = header.slice(BEARER_PREFIX.length).trim();
    return bearer === '' ? null : bearer;
  }

  return null;
}

/**
 * Autentica o handshake com a mesma regra do middleware HTTP (`validateAccessToken`). Sem token
 * ou com token inválido, recusa com `connect_error` de `message: 'UNAUTHORIZED'`; aceito,
 * preenche `socket.data` com `userId`, `ip` e `device` (user-agent truncado a 255).
 */
export function createSocketAuthMiddleware(
  auth: Pick<IAuthService, 'validateAccessToken'> = authService
): SocketMiddleware {
  return (socket, next) => {
    const token = extractHandshakeToken(socket.handshake);
    const validation: { valid: boolean; userId?: string } =
      token === null ? { valid: false } : auth.validateAccessToken(token);

    if (!validation.valid || validation.userId === undefined || validation.userId === '') {
      next(new Error(SOCKET_ERRORS.UNAUTHORIZED));
      return;
    }

    const { address, headers } = socket.handshake;
    const userAgent = headers['user-agent'];
    socket.data = {
      userId: validation.userId,
      ip: address === '' ? null : address,
      device:
        userAgent === undefined ? null : userAgent.slice(0, REALTIME_CONSTANTS.MAX_DEVICE_LENGTH),
    };
    next();
  };
}
```

Criar `src/modules/realtime/middlewares/joinRooms.ts`:

```ts
import type { IConversationService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { logger } from '@/shared/logger';
import { SOCKET_ERRORS, conversationRoom, userRoom } from '../constants';
import type { RealtimeSocket, SocketMiddleware } from '../types';

async function joinUserRooms(
  socket: RealtimeSocket,
  conversations: Pick<IConversationService, 'getUserConversationIds'>
): Promise<void> {
  const { userId } = socket.data;
  const conversationIds = await conversations.getUserConversationIds(userId);
  await socket.join([userRoom(userId), ...conversationIds.map(conversationRoom)]);
}

/**
 * Coloca o socket na room `user:<id>` e nas `conversation:<id>` de todas as conversas do
 * usuário. Roda como middleware (depois do `socketAuth`) para que as rooms já existam quando o
 * cliente receber `connect` — nenhuma mensagem enviada logo após conectar se perde. Reconexões
 * repetem o handshake e, portanto, restauram as rooms.
 */
export function createJoinRoomsMiddleware(
  conversations: Pick<IConversationService, 'getUserConversationIds'> = conversationService
): SocketMiddleware {
  return (socket, next) => {
    joinUserRooms(socket, conversations).then(
      () => {
        next();
      },
      (error: unknown) => {
        logger.error(
          'Falha ao entrar nas rooms das conversas no handshake',
          error instanceof Error ? error : new Error(String(error)),
          { userId: socket.data.userId }
        );
        next(new Error(SOCKET_ERRORS.INTERNAL_ERROR));
      }
    );
  };
}
```

Criar `src/modules/realtime/middlewares/index.ts`:

```ts
export { createSocketAuthMiddleware, extractHandshakeToken } from './socketAuth';
export { createJoinRoomsMiddleware } from './joinRooms';
```

- [ ] **Step 6: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 7: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime tests/unit/modules/realtime tests/support/realtime
git add src/modules/realtime/types/realtime.types.ts src/modules/realtime/types/index.ts src/modules/realtime/middlewares tests/support/realtime/fakeSocket.ts tests/unit/modules/realtime/middlewares
git commit -m "✨ feat: autentica o handshake do Socket.IO e entra nas rooms do usuário"
```

---

### Task 10: `TypingService`

**Files:**
- Create: `src/modules/realtime/services/{TypingService.ts,index.ts}`
- Test: `tests/unit/modules/realtime/services/{TypingService,index}.test.ts`

**Interfaces:**
- Consumes: `REALTIME_CONSTANTS.TYPING_TTL_MS` (Task 8).
- Produces: `class TypingService { constructor(ttlMs = 3000); start(socketId, conversationId, onExpire: () => void): boolean /* true só na ativação */; isActive(socketId, conversationId): boolean; stop(socketId, conversationId): boolean /* true se estava ativo */; stopAll(socketId): string[] /* conversas que estavam ativas */; get activeCount(): number }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/unit/modules/realtime/services/TypingService.test.ts`:

```ts
import { TypingService } from '@/modules/realtime/services/TypingService';

const CONVERSATION_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('TypingService', () => {
  let service: TypingService;
  let onExpire: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new TypingService(3000);
    onExpire = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('usa TTL de 3s por padrão', () => {
    const defaultService = new TypingService();

    defaultService.start('s1', CONVERSATION_1, onExpire);
    jest.advanceTimersByTime(2999);
    expect(onExpire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('start retorna true só na ativação; os seguintes apenas renovam o timer', () => {
    expect(service.start('s1', CONVERSATION_1, onExpire)).toBe(true);
    jest.advanceTimersByTime(2000);
    expect(service.start('s1', CONVERSATION_1, onExpire)).toBe(false);
    jest.advanceTimersByTime(2000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(service.isActive('s1', CONVERSATION_1)).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(service.isActive('s1', CONVERSATION_1)).toBe(false);
    expect(service.activeCount).toBe(0);
  });

  it('expiração libera o par e um novo start volta a ativar', () => {
    service.start('s1', CONVERSATION_1, onExpire);
    jest.advanceTimersByTime(3000);

    expect(service.start('s1', CONVERSATION_1, onExpire)).toBe(true);
  });

  it('stop encerra (retorna true) sem chamar onExpire; stop repetido ou desconhecido retorna false', () => {
    service.start('s1', CONVERSATION_1, onExpire);

    expect(service.stop('s1', CONVERSATION_1)).toBe(true);
    expect(service.stop('s1', CONVERSATION_1)).toBe(false);
    expect(service.stop('desconhecido', CONVERSATION_1)).toBe(false);

    jest.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('stop de outra conversa do mesmo socket não afeta a ativa', () => {
    service.start('s1', CONVERSATION_1, onExpire);

    expect(service.stop('s1', CONVERSATION_2)).toBe(false);
    expect(service.isActive('s1', CONVERSATION_1)).toBe(true);
    expect(service.activeCount).toBe(1);
  });

  it('pares (socket, conversa) são independentes', () => {
    const other = jest.fn();
    service.start('s1', CONVERSATION_1, onExpire);
    service.start('s1', CONVERSATION_2, other);
    service.start('s2', CONVERSATION_1, other);

    expect(service.activeCount).toBe(3);
    service.stop('s1', CONVERSATION_1);
    jest.advanceTimersByTime(3000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(2);
  });

  it('stopAll encerra tudo do socket e devolve as conversas que estavam ativas', () => {
    service.start('s1', CONVERSATION_1, onExpire);
    service.start('s1', CONVERSATION_2, onExpire);
    service.start('s2', CONVERSATION_1, onExpire);

    expect(service.stopAll('s1')).toEqual([CONVERSATION_1, CONVERSATION_2]);
    expect(service.stopAll('s1')).toEqual([]);
    expect(service.activeCount).toBe(1);

    jest.advanceTimersByTime(3000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
```

Criar `tests/unit/modules/realtime/services/index.test.ts`:

```ts
import { TypingService } from '@/modules/realtime/services';

describe('realtime services index', () => {
  it('deve exportar o TypingService', () => {
    expect(new TypingService()).toBeInstanceOf(TypingService);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/services --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/services/TypingService'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/realtime/services/TypingService.ts`:

```ts
import { REALTIME_CONSTANTS } from '../constants';

/**
 * Timers do indicador "digitando" por (socket, conversa) (RF003.5). Só controla estado e tempo;
 * quem emite os eventos é o handler (via retorno e `onExpire`), então o serviço não depende do
 * Socket.IO. O TTL é injetável para os testes de integração usarem timers reais curtos.
 */
export class TypingService {
  private readonly timers = new Map<string, Map<string, NodeJS.Timeout>>();

  constructor(private readonly ttlMs: number = REALTIME_CONSTANTS.TYPING_TTL_MS) {}

  /**
   * Inicia ou renova o indicador. Retorna `true` só quando ele acabou de ficar ativo (o handler
   * emite `isTyping: true`); renovações retornam `false` (emissões duplicadas são suprimidas).
   * Sem novo `start` dentro do TTL, o par é liberado e `onExpire` roda.
   */
  start(socketId: string, conversationId: string, onExpire: () => void): boolean {
    let bySocket = this.timers.get(socketId);
    if (bySocket === undefined) {
      bySocket = new Map();
      this.timers.set(socketId, bySocket);
    }

    const current = bySocket.get(conversationId);
    if (current !== undefined) {
      clearTimeout(current);
    }

    const conversations = bySocket;
    conversations.set(
      conversationId,
      setTimeout(() => {
        this.forget(socketId, conversations, conversationId);
        onExpire();
      }, this.ttlMs)
    );

    return current === undefined;
  }

  isActive(socketId: string, conversationId: string): boolean {
    return this.timers.get(socketId)?.has(conversationId) === true;
  }

  /** Encerra o indicador; retorna `true` se estava ativo (o handler emite `isTyping: false`). */
  stop(socketId: string, conversationId: string): boolean {
    const bySocket = this.timers.get(socketId);
    const timer = bySocket?.get(conversationId);
    if (bySocket === undefined || timer === undefined) {
      return false;
    }

    clearTimeout(timer);
    this.forget(socketId, bySocket, conversationId);
    return true;
  }

  /** Encerra todos os indicadores do socket (desconexão); retorna as conversas que estavam ativas. */
  stopAll(socketId: string): string[] {
    const bySocket = this.timers.get(socketId);
    if (bySocket === undefined) {
      return [];
    }

    bySocket.forEach((timer) => {
      clearTimeout(timer);
    });
    this.timers.delete(socketId);
    return [...bySocket.keys()];
  }

  /** Total de indicadores ativos. */
  get activeCount(): number {
    let total = 0;
    this.timers.forEach((bySocket) => {
      total += bySocket.size;
    });
    return total;
  }

  private forget(
    socketId: string,
    bySocket: Map<string, NodeJS.Timeout>,
    conversationId: string
  ): void {
    bySocket.delete(conversationId);
    if (bySocket.size === 0) {
      this.timers.delete(socketId);
    }
  }
}
```

Criar `src/modules/realtime/services/index.ts`:

```ts
export { TypingService } from './TypingService';
```

- [ ] **Step 4: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/services --coverage=false` → PASS (fake timers: 3s por padrão, renovação, expiração, stop/stopAll). Depois a **verificação completa**.

- [ ] **Step 5: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime/services tests/unit/modules/realtime/services
git add src/modules/realtime/services tests/unit/modules/realtime/services
git commit -m "✨ feat: adiciona TypingService com expiração do indicador de digitação"
```

---

### Task 11: Ack e handlers de mensagem (`message:send`, `message:delivered`, `message:read`)

**Files:**
- Create: `src/modules/realtime/handlers/{ack.ts,messageHandlers.ts,index.ts}`
- Test: `tests/unit/modules/realtime/handlers/{ack,messageHandlers,index}.test.ts`

**Interfaces:**
- Consumes: `IMessageService.send`/`markDelivered`/`markRead` (Tasks 5–6); schemas (Task 8); `createFakeSocket` (Task 9).
- Produces:
  - `toAckError(error: unknown): AckError`; `withAck<S extends z.ZodType>(context: { event: string; userId: string }, schema: S, run: (payload: z.output<S>) => Promise<unknown>): AckListener` com `type AckListener = (payload: unknown, ack?: unknown) => void`.
  - `registerMessageHandlers(socket: RealtimeSocket, deps: { messages: Pick<IMessageService, 'send' | 'markDelivered' | 'markRead'> }): void` — ack de `message:send` = `MessageDTO`; dos outros = `null`. Nenhum broadcast aqui (a ponte da Task 13 emite `message:new`/`message:status`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/unit/modules/realtime/handlers/ack.test.ts`:

```ts
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { z } from 'zod';
import { toAckError, withAck } from '@/modules/realtime/handlers/ack';
import type { AckResponse } from '@/modules/realtime/types';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';

const mockLogger = logger as jest.Mocked<typeof logger>;
const CONTEXT = { event: 'test:event', userId: '11111111-1111-4111-8111-111111111111' };
const schema = z.object({ value: z.string().min(1) });

function call(
  listener: (payload: unknown, ack?: unknown) => void,
  payload: unknown
): Promise<AckResponse<unknown>> {
  return new Promise((resolve) => {
    listener(payload, resolve);
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('ack', () => {
  describe('toAckError', () => {
    it('mapeia AppError para { code, message, statusCode }', () => {
      const error = new AppError(
        'Conversa não encontrada',
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND
      );

      expect(toAckError(error)).toEqual({
        code: 'NOT_FOUND',
        message: 'Conversa não encontrada',
        statusCode: 404,
      });
    });

    it('erro inesperado vira INTERNAL_ERROR 500 sem vazar a mensagem', () => {
      expect(toAckError(new Error('segredo do banco'))).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor',
        statusCode: 500,
      });
      expect(toAckError('x')).toEqual(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
    });
  });

  describe('withAck', () => {
    it('payload válido: executa com os dados parseados e responde { ok: true, data }', async () => {
      const run = jest.fn().mockResolvedValue({ id: 1 });

      const response = await call(withAck(CONTEXT, schema, run), { value: 'x', extra: true });

      expect(run).toHaveBeenCalledWith({ value: 'x' });
      expect(response).toEqual({ ok: true, data: { id: 1 } });
    });

    it('payload inválido: responde VALIDATION_ERROR 400 com details e não executa', async () => {
      const run = jest.fn();

      const response = await call(withAck(CONTEXT, schema, run), { value: '' });

      expect(run).not.toHaveBeenCalled();
      expect(response).toEqual({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          statusCode: 400,
          details: [{ field: 'value', message: expect.any(String) }],
        },
      });
    });

    it('AppError do service vira { ok: false, error } sem log de erro', async () => {
      const run = jest
        .fn()
        .mockRejectedValue(new AppError('Proibido', HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN));

      const response = await call(withAck(CONTEXT, schema, run), { value: 'x' });

      expect(response).toEqual({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Proibido', statusCode: 403 },
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('erro inesperado responde INTERNAL_ERROR e é logado com o contexto', async () => {
      const failure = new Error('mongo down');
      const run = jest.fn().mockRejectedValue(failure);

      const response = await call(withAck(CONTEXT, schema, run), { value: 'x' });

      expect(response).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', statusCode: 500 },
      });
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), failure, CONTEXT);
    });

    it('rejeição que não é Error é envolvida antes de logar', async () => {
      const run = jest.fn().mockRejectedValue('falhou');

      await call(withAck(CONTEXT, schema, run), { value: 'x' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'falhou' }),
        CONTEXT
      );
    });

    describe('sem ack (ou ack que não é função)', () => {
      it('executa normalmente', async () => {
        const run = jest.fn().mockResolvedValue(null);

        withAck(CONTEXT, schema, run)({ value: 'x' });
        withAck(CONTEXT, schema, run)({ value: 'y' }, 'não é função');
        await flush();

        expect(run).toHaveBeenCalledTimes(2);
      });

      it('recusas (validação ou AppError) só são logadas como warn', async () => {
        const run = jest
          .fn()
          .mockRejectedValue(new AppError('Proibido', HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN));

        withAck(CONTEXT, schema, run)({ value: '' });
        withAck(CONTEXT, schema, run)({ value: 'x' });
        await flush();

        expect(mockLogger.warn).toHaveBeenNthCalledWith(1, expect.any(String), {
          ...CONTEXT,
          code: 'VALIDATION_ERROR',
        });
        expect(mockLogger.warn).toHaveBeenNthCalledWith(2, expect.any(String), {
          ...CONTEXT,
          code: 'FORBIDDEN',
        });
      });

      it('erro inesperado continua sendo logado como error', async () => {
        const run = jest.fn().mockRejectedValue(new Error('mongo down'));

        withAck(CONTEXT, schema, run)({ value: 'x' });
        await flush();

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
      });
    });
  });
});
```

Criar `tests/unit/modules/realtime/handlers/messageHandlers.test.ts`:

```ts
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerMessageHandlers } from '@/modules/realtime/handlers/messageHandlers';
import type { AckResponse } from '@/modules/realtime/types';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function emit(socket: FakeSocket, event: string, payload: unknown): Promise<AckResponse<unknown>> {
  const handler = socket.handlers.get(event);
  if (handler === undefined) {
    throw new Error(`handler ${event} não registrado`);
  }
  return new Promise((resolve) => {
    handler(payload, resolve);
  });
}

describe('registerMessageHandlers', () => {
  let socket: FakeSocket;
  let messages: { send: jest.Mock; markDelivered: jest.Mock; markRead: jest.Mock };

  beforeEach(() => {
    socket = createFakeSocket({ data: { userId: USER_A, ip: '10.0.0.1', device: 'jest' } });
    messages = { send: jest.fn(), markDelivered: jest.fn(), markRead: jest.fn() };
    registerMessageHandlers(socket.asSocket(), { messages });
  });

  it('registra message:send, message:delivered e message:read', () => {
    expect([...socket.handlers.keys()]).toEqual([
      'message:send',
      'message:delivered',
      'message:read',
    ]);
  });

  it('message:send envia com os metadados do handshake e devolve a MessageDTO no ack', async () => {
    const dto = { id: MESSAGE_ID };
    messages.send.mockResolvedValue(dto);

    const response = await emit(socket, 'message:send', {
      conversationId: CONVERSATION_ID,
      text: '  oi  ',
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(messages.send).toHaveBeenCalledWith(
      USER_A,
      CONVERSATION_ID,
      { text: 'oi', clientMessageId: CLIENT_MESSAGE_ID },
      { ip: '10.0.0.1', device: 'jest' }
    );
    expect(response).toEqual({ ok: true, data: dto });
    expect(socket.broadcasts).toEqual([]);
  });

  it('message:send com payload inválido responde 400 sem chamar o service', async () => {
    const response = await emit(socket, 'message:send', { conversationId: 'x', text: '' });

    expect(messages.send).not.toHaveBeenCalled();
    expect(response).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
    });
  });

  it('message:send mapeia o AppError do service (ex.: 403 bloqueio) no ack', async () => {
    messages.send.mockRejectedValue(
      new AppError('Bloqueado', HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED)
    );

    const response = await emit(socket, 'message:send', {
      conversationId: CONVERSATION_ID,
      text: 'oi',
    });

    expect(response).toEqual({
      ok: false,
      error: { code: 'USER_BLOCKED', message: 'Bloqueado', statusCode: 403 },
    });
  });

  it('message:delivered confirma a entrega e responde { ok: true, data: null }', async () => {
    messages.markDelivered.mockResolvedValue(undefined);

    const response = await emit(socket, 'message:delivered', {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });

    expect(messages.markDelivered).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
    expect(response).toEqual({ ok: true, data: null });
  });

  it('message:read marca como lido e responde { ok: true, data: null }', async () => {
    messages.markRead.mockResolvedValue(undefined);

    const response = await emit(socket, 'message:read', {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });

    expect(messages.markRead).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
    expect(response).toEqual({ ok: true, data: null });
  });

  it('message:delivered/read com messageId inválido respondem 400', async () => {
    const delivered = await emit(socket, 'message:delivered', {
      conversationId: CONVERSATION_ID,
      messageId: 'x',
    });
    const read = await emit(socket, 'message:read', { conversationId: CONVERSATION_ID });

    expect(delivered).toEqual(expect.objectContaining({ ok: false }));
    expect(read).toEqual(expect.objectContaining({ ok: false }));
    expect(messages.markDelivered).not.toHaveBeenCalled();
    expect(messages.markRead).not.toHaveBeenCalled();
  });
});
```

Criar `tests/unit/modules/realtime/handlers/index.test.ts`:

```ts
import * as handlers from '@/modules/realtime/handlers';

describe('realtime handlers index', () => {
  it('deve exportar o helper de ack e os registradores de handlers', () => {
    expect(typeof handlers.withAck).toBe('function');
    expect(typeof handlers.toAckError).toBe('function');
    expect(typeof handlers.registerMessageHandlers).toBe('function');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/handlers --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/handlers/ack'` (e `messageHandlers`, `index`).

- [ ] **Step 3: Implementar**

Criar `src/modules/realtime/handlers/ack.ts` (o limite 500 fica numa constante `number` porque comparar `number` com o enum `HttpStatus` viola `no-unsafe-enum-comparison`):

```ts
import type { z } from 'zod';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import { logger } from '@/shared/logger';
import type { AckCallback, AckError } from '../types';

/** Contexto dos logs de um evento recebido. */
export interface AckContext {
  event: string;
  userId: string;
}

/** Listener de um evento cliente → servidor: payload e ack chegam como `unknown`. */
export type AckListener = (payload: unknown, ack?: unknown) => void;

/** A partir deste status a falha é do servidor (sempre logada como `error`). */
const SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

const INTERNAL_ERROR: AckError = {
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Erro interno do servidor',
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** `AppError` vira `{ code, message, statusCode }`; qualquer outro erro vira INTERNAL_ERROR 500. */
export function toAckError(error: unknown): AckError {
  if (AppError.isAppError(error)) {
    return { code: error.code, message: error.message, statusCode: error.statusCode };
  }
  return INTERNAL_ERROR;
}

function validationError(issues: z.core.$ZodIssue[]): AckError {
  return {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Dados inválidos',
    statusCode: HttpStatus.BAD_REQUEST,
    details: issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  };
}

/**
 * Cria o listener de um evento com ack: valida o payload com `schema`, executa `run` e responde
 * `{ ok: true, data }` ou `{ ok: false, error }` (mesmos códigos da API REST).
 *
 * Sem ack (ou com um ack que não é função), o evento é processado do mesmo jeito e a falha só é
 * logada: recusas (validação, `AppError` 4xx) como `warn`; erros inesperados/5xx sempre como
 * `error`, com ou sem ack.
 */
export function withAck<S extends z.ZodType>(
  context: AckContext,
  schema: S,
  run: (payload: z.output<S>) => Promise<unknown>
): AckListener {
  return (payload, ack) => {
    const reply = typeof ack === 'function' ? (ack as AckCallback<unknown>) : null;

    const fail = (error: AckError, cause?: unknown): void => {
      if (error.statusCode >= SERVER_ERROR_STATUS) {
        logger.error(
          `Falha ao processar ${context.event}`,
          cause instanceof Error ? cause : new Error(String(cause)),
          { ...context }
        );
      } else if (reply === null) {
        logger.warn(`Evento ${context.event} recusado`, { ...context, code: error.code });
      }
      reply?.({ ok: false, error });
    };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      fail(validationError(parsed.error.issues));
      return;
    }

    run(parsed.data).then(
      (data) => {
        reply?.({ ok: true, data });
      },
      (error: unknown) => {
        fail(toAckError(error), error);
      }
    );
  };
}
```

Criar `src/modules/realtime/handlers/messageHandlers.ts`:

```ts
import type { IMessageService } from '@/modules/chat/interfaces';
import { CLIENT_EVENTS } from '../constants';
import type { RealtimeSocket } from '../types';
import { messageSendPayloadSchema, messageStatusPayloadSchema } from '../validation';
import { withAck } from './ack';

export interface MessageHandlerDeps {
  messages: Pick<IMessageService, 'send' | 'markDelivered' | 'markRead'>;
}

/**
 * `message:send`, `message:delivered` e `message:read`. Os handlers só chamam o service e
 * respondem o ack; o broadcast (`message:new`, `message:status`) sai da ponte do EventBus.
 */
export function registerMessageHandlers(
  socket: RealtimeSocket,
  { messages }: MessageHandlerDeps
): void {
  const { userId, ip, device } = socket.data;

  socket.on(
    CLIENT_EVENTS.MESSAGE_SEND,
    withAck(
      { event: CLIENT_EVENTS.MESSAGE_SEND, userId },
      messageSendPayloadSchema,
      ({ conversationId, ...message }) =>
        messages.send(userId, conversationId, message, { ip, device })
    )
  );

  socket.on(
    CLIENT_EVENTS.MESSAGE_DELIVERED,
    withAck(
      { event: CLIENT_EVENTS.MESSAGE_DELIVERED, userId },
      messageStatusPayloadSchema,
      async ({ conversationId, messageId }) => {
        await messages.markDelivered(userId, conversationId, messageId);
        return null;
      }
    )
  );

  socket.on(
    CLIENT_EVENTS.MESSAGE_READ,
    withAck(
      { event: CLIENT_EVENTS.MESSAGE_READ, userId },
      messageStatusPayloadSchema,
      async ({ conversationId, messageId }) => {
        await messages.markRead(userId, conversationId, messageId);
        return null;
      }
    )
  );
}
```

Criar `src/modules/realtime/handlers/index.ts`:

```ts
export { withAck, toAckError } from './ack';
export type { AckContext, AckListener } from './ack';
export { registerMessageHandlers } from './messageHandlers';
export type { MessageHandlerDeps } from './messageHandlers';
```

- [ ] **Step 4: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/handlers --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 5: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime/handlers tests/unit/modules/realtime/handlers
git add src/modules/realtime/handlers tests/unit/modules/realtime/handlers
git commit -m "✨ feat: recebe envio e confirmações de mensagens via Socket.IO com ack"
```

---

### Task 12: `getTypeForParticipant` e handlers de digitação

**Files:**
- Modify: `src/modules/chat/interfaces/IConversationService.ts`, `src/modules/chat/services/ConversationService.ts`
- Create: `src/modules/realtime/handlers/typingHandlers.ts`
- Modify: `src/modules/realtime/handlers/index.ts`
- Test: `tests/unit/modules/chat/services/ConversationService.test.ts`, `tests/unit/modules/chat/controllers/ConversationController.test.ts`, `tests/unit/modules/realtime/handlers/typingHandlers.test.ts`, `tests/unit/modules/realtime/handlers/index.test.ts`

**Interfaces:**
- Consumes: `TypingService` (Task 10), `withAck` (Task 11), `TypingNotAllowedException`/`typingPayloadSchema`/`SERVER_EVENTS`/`conversationRoom` (Task 8).
- Produces:
  - `IConversationService.getTypeForParticipant(userId: string, conversationId: string): Promise<ConversationType>` — 404 (`ConversationNotFoundException`) para quem não participa.
  - `registerTypingHandlers(socket: RealtimeSocket, deps: { conversations: Pick<IConversationService, 'getTypeForParticipant'>; typing: TypingService }): void` — registra `typing:start`, `typing:stop` e `disconnecting`; emite `typing:indicator { conversationId, userId, isTyping }` via `socket.to(conversation:<id>)`.

- [ ] **Step 1: Teste do chat (falha)**

Em `tests/unit/modules/chat/services/ConversationService.test.ts`, dentro de `describe('consultas para outros módulos')`, imediatamente antes de `    it('getUserConversationIds', async () => {`:

```ts
    it('getTypeForParticipant devolve o tipo para participante e 404 para quem não participa', async () => {
      givenMembership(conversation({ type: 'direct' }), [participant(USER_A), participant(USER_B)]);

      await expect(service.getTypeForParticipant(USER_A, CONVERSATION_ID)).resolves.toBe('direct');
      await expect(service.getTypeForParticipant(USER_C, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
```

Em `tests/unit/modules/chat/controllers/ConversationController.test.ts`, em `createService()`, acrescentar `getTypeForParticipant: jest.fn(),` depois de `getUserConversationIds: jest.fn(),`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/chat/services/ConversationService.test.ts --coverage=false`
Expected: FAIL — `service.getTypeForParticipant is not a function`.

- [ ] **Step 3: Implementar no chat**

Em `src/modules/chat/interfaces/IConversationService.ts`: acrescentar `ConversationType,` ao `import type { ... } from '../types';` (depois de `ConversationDTO,`) e, como último membro da interface:

```ts
  /** Tipo da conversa para quem participa; 404 (`ConversationNotFoundException`) para os demais. */
  getTypeForParticipant(userId: string, conversationId: string): Promise<ConversationType>;
```

Em `src/modules/chat/services/ConversationService.ts`: acrescentar `ConversationType,` ao `import type { ... } from '../types';` (depois de `ConversationListEntry,`) e, logo depois do método `getUserConversationIds`:

```ts
  async getTypeForParticipant(userId: string, conversationId: string): Promise<ConversationType> {
    const { conversation } = await this.requireMembership(conversationId, userId);
    return conversation.type;
  }
```

- [ ] **Step 4: Rodar e commitar o passo do chat**

Run: `node node_modules/.bin/jest tests/unit/modules/chat --coverage=false` → PASS; `node node_modules/.bin/tsc --noEmit` sem erros.

```bash
node node_modules/.bin/prettier --write src/modules/chat tests/unit/modules/chat
git add src/modules/chat/interfaces/IConversationService.ts src/modules/chat/services/ConversationService.ts tests/unit/modules/chat/services/ConversationService.test.ts tests/unit/modules/chat/controllers/ConversationController.test.ts
git commit -m "✨ feat: expõe getTypeForParticipant no ConversationService"
```

- [ ] **Step 5: Testes dos handlers de digitação (falham)**

Criar `tests/unit/modules/realtime/handlers/typingHandlers.test.ts`:

```ts
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ConversationNotFoundException } from '@/modules/chat/errors';
import { registerTypingHandlers } from '@/modules/realtime/handlers/typingHandlers';
import { TypingService } from '@/modules/realtime/services/TypingService';
import type { AckResponse } from '@/modules/realtime/types';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM = `conversation:${CONVERSATION_ID}`;

function emit(socket: FakeSocket, event: string, payload: unknown): Promise<AckResponse<unknown>> {
  const handler = socket.handlers.get(event);
  if (handler === undefined) {
    throw new Error(`handler ${event} não registrado`);
  }
  return new Promise((resolve) => {
    handler(payload, resolve);
  });
}

function indicator(conversationId: string, isTyping: boolean): [string, string, unknown] {
  return [
    `conversation:${conversationId}`,
    'typing:indicator',
    { conversationId, userId: USER_A, isTyping },
  ];
}

describe('registerTypingHandlers', () => {
  let socket: FakeSocket;
  let conversations: { getTypeForParticipant: jest.Mock };
  let typing: TypingService;

  beforeEach(() => {
    jest.useFakeTimers();
    socket = createFakeSocket({ data: { userId: USER_A, ip: null, device: null } });
    conversations = { getTypeForParticipant: jest.fn().mockResolvedValue('direct') };
    typing = new TypingService(3000);
    registerTypingHandlers(socket.asSocket(), { conversations, typing });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registra typing:start, typing:stop e a limpeza no disconnecting', () => {
    expect([...socket.handlers.keys()]).toEqual(['typing:start', 'typing:stop', 'disconnecting']);
  });

  it('typing:start em direct emite isTyping=true para a room, exceto o próprio socket', async () => {
    const response = await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    expect(response).toEqual({ ok: true, data: null });
    expect(conversations.getTypeForParticipant).toHaveBeenCalledWith(USER_A, CONVERSATION_ID);
    expect(socket.to).toHaveBeenCalledWith(ROOM);
    expect(socket.broadcasts).toEqual([indicator(CONVERSATION_ID, true)]);
  });

  it('starts repetidos só renovam o timer (sem nova emissão nem nova consulta)', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });
    jest.advanceTimersByTime(2000);
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });
    jest.advanceTimersByTime(2000);

    expect(conversations.getTypeForParticipant).toHaveBeenCalledTimes(1);
    expect(socket.broadcasts).toEqual([indicator(CONVERSATION_ID, true)]);
  });

  it('expira em 3s sem novo start e emite isTyping=false', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    jest.advanceTimersByTime(3000);

    expect(socket.broadcasts).toEqual([
      indicator(CONVERSATION_ID, true),
      indicator(CONVERSATION_ID, false),
    ]);
  });

  it('typing:stop encerra e emite isTyping=false; sem indicador ativo não emite', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    const stopped = await emit(socket, 'typing:stop', { conversationId: CONVERSATION_ID });
    const again = await emit(socket, 'typing:stop', { conversationId: CONVERSATION_ID });
    jest.advanceTimersByTime(5000);

    expect(stopped).toEqual({ ok: true, data: null });
    expect(again).toEqual({ ok: true, data: null });
    expect(socket.broadcasts).toEqual([
      indicator(CONVERSATION_ID, true),
      indicator(CONVERSATION_ID, false),
    ]);
  });

  it('grupo: responde 400 e não emite', async () => {
    conversations.getTypeForParticipant.mockResolvedValue('group');

    const response = await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    expect(response).toEqual({
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Indicador de digitação disponível apenas em conversas 1:1',
        statusCode: 400,
      },
    });
    expect(socket.broadcasts).toEqual([]);
    expect(typing.activeCount).toBe(0);
  });

  it('não participante: responde 404 e não emite', async () => {
    conversations.getTypeForParticipant.mockRejectedValue(new ConversationNotFoundException());

    const response = await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });

    expect(response).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    });
    expect(socket.broadcasts).toEqual([]);
  });

  it('payload inválido responde 400', async () => {
    const start = await emit(socket, 'typing:start', { conversationId: 'x' });
    const stop = await emit(socket, 'typing:stop', {});

    expect(start).toEqual(expect.objectContaining({ ok: false }));
    expect(stop).toEqual(expect.objectContaining({ ok: false }));
  });

  it('disconnecting encerra todos os indicadores do socket (isTyping=false em cada conversa)', async () => {
    await emit(socket, 'typing:start', { conversationId: CONVERSATION_ID });
    await emit(socket, 'typing:start', { conversationId: OTHER_CONVERSATION_ID });

    socket.handlers.get('disconnecting')!();
    jest.advanceTimersByTime(5000);

    expect(socket.broadcasts).toEqual([
      indicator(CONVERSATION_ID, true),
      indicator(OTHER_CONVERSATION_ID, true),
      indicator(CONVERSATION_ID, false),
      indicator(OTHER_CONVERSATION_ID, false),
    ]);
    expect(typing.activeCount).toBe(0);
  });
});
```

Em `tests/unit/modules/realtime/handlers/index.test.ts`, acrescentar depois de `expect(typeof handlers.registerMessageHandlers).toBe('function');`:

```ts
    expect(typeof handlers.registerTypingHandlers).toBe('function');
```

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/handlers --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/handlers/typingHandlers'` e `registerTypingHandlers` indefinido no barrel.

- [ ] **Step 6: Implementar os handlers de digitação**

Criar `src/modules/realtime/handlers/typingHandlers.ts`:

```ts
import type { IConversationService } from '@/modules/chat/interfaces';
import { CLIENT_EVENTS, SERVER_EVENTS, conversationRoom } from '../constants';
import { TypingNotAllowedException } from '../errors';
import type { TypingService } from '../services';
import type { RealtimeSocket } from '../types';
import { typingPayloadSchema } from '../validation';
import { withAck } from './ack';

export interface TypingHandlerDeps {
  conversations: Pick<IConversationService, 'getTypeForParticipant'>;
  typing: TypingService;
}

/**
 * Indicador de digitação (RF003.5), só em conversas 1:1. `typing:indicator` vai para a room da
 * conversa exceto o próprio socket; o primeiro `start` emite `isTyping: true`, os seguintes só
 * renovam o timer; `stop`, expiração (3s) ou desconexão emitem `isTyping: false`.
 */
export function registerTypingHandlers(
  socket: RealtimeSocket,
  { conversations, typing }: TypingHandlerDeps
): void {
  const { userId } = socket.data;

  const indicate = (conversationId: string, isTyping: boolean): void => {
    socket
      .to(conversationRoom(conversationId))
      .emit(SERVER_EVENTS.TYPING_INDICATOR, { conversationId, userId, isTyping });
  };

  socket.on(
    CLIENT_EVENTS.TYPING_START,
    withAck(
      { event: CLIENT_EVENTS.TYPING_START, userId },
      typingPayloadSchema,
      async ({ conversationId }) => {
        // Renovar um indicador já validado não consulta o banco de novo.
        if (!typing.isActive(socket.id, conversationId)) {
          const type = await conversations.getTypeForParticipant(userId, conversationId);
          if (type !== 'direct') {
            throw new TypingNotAllowedException();
          }
        }

        const activated = typing.start(socket.id, conversationId, () => {
          indicate(conversationId, false);
        });
        if (activated) {
          indicate(conversationId, true);
        }
        return null;
      }
    )
  );

  socket.on(
    CLIENT_EVENTS.TYPING_STOP,
    withAck(
      { event: CLIENT_EVENTS.TYPING_STOP, userId },
      typingPayloadSchema,
      ({ conversationId }) => {
        if (typing.stop(socket.id, conversationId)) {
          indicate(conversationId, false);
        }
        return Promise.resolve(null);
      }
    )
  );

  socket.on('disconnecting', () => {
    for (const conversationId of typing.stopAll(socket.id)) {
      indicate(conversationId, false);
    }
  });
}
```

Substituir `src/modules/realtime/handlers/index.ts` inteiro por:

```ts
export { withAck, toAckError } from './ack';
export type { AckContext, AckListener } from './ack';
export { registerMessageHandlers } from './messageHandlers';
export type { MessageHandlerDeps } from './messageHandlers';
export { registerTypingHandlers } from './typingHandlers';
export type { TypingHandlerDeps } from './typingHandlers';
```

- [ ] **Step 7: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 8: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime/handlers tests/unit/modules/realtime/handlers
git add src/modules/realtime/handlers/typingHandlers.ts src/modules/realtime/handlers/index.ts tests/unit/modules/realtime/handlers/typingHandlers.test.ts tests/unit/modules/realtime/handlers/index.test.ts
git commit -m "✨ feat: adiciona indicador de digitação em conversas 1:1 via Socket.IO"
```

---

### Task 13: Ponte EventBus → Socket.IO

**Files:**
- Create: `src/modules/realtime/listeners/{realtime.listeners.ts,index.ts}`
- Test: `tests/unit/modules/realtime/listeners/realtime.listeners.test.ts`

**Interfaces:**
- Consumes: payloads do `EventMap` (Tasks 1, 6); `SERVER_EVENTS`, `userRoom`, `conversationRoom` (Task 8); `createFakeServer` (Task 9).
- Produces: `registerRealtimeListeners(io: Pick<RealtimeServer, 'to' | 'in'>, bus: Pick<EventBus, 'subscribe'> = eventBus): () => void` — subscribers síncronos; a função retornada cancela todos.

| Evento interno | Emissão |
|---|---|
| `MESSAGE_SENT` | `conversation:<id>` ← `message:new` (a `MessageDTO` do payload) |
| `MESSAGE_DELETED` | `conversation:<id>` ← `message:deleted { conversationId, messageId }` |
| `MESSAGE_DELIVERED` | `user:<senderId>` ← `message:status { type: 'delivered', conversationId, messageId, userId, at }` |
| `MESSAGE_READ` | `conversation:<id>` ← `message:status { type: 'read', conversationId, userId, upToMessageId, at }` |
| `CONVERSATION_CREATED` | `socketsJoin` de cada `user:<participante>`; `[conversation, ...user:<participantes>]` ← `conversation:new { conversationId, type }` |
| `CONVERSATION_UPDATED` | `members_added`: `socketsJoin` dos afetados, depois emite; sempre `[conversation, ...user:<afetados>]` ← `conversation:updated { conversationId, change, actorId, affectedUserIds, name? }`; `member_left`/`member_removed`: depois de emitir, `socketsLeave` dos afetados |
| `CONVERSATION_DELETED` | `[conversation, ...user:<participantIds>]` ← `conversation:deleted { conversationId }`; `io.in(conversation).socketsLeave(conversation)` |

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/unit/modules/realtime/listeners/realtime.listeners.test.ts`:

```ts
import { registerRealtimeListeners } from '@/modules/realtime/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import { ChatEvents, type MessageDTO } from '@/shared/types';
import { createFakeServer, type FakeServer } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';
const ROOM = `conversation:${CONVERSATION_ID}`;
const AT = new Date('2026-09-25T10:00:00.000Z');

function message(): MessageDTO {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: USER_A,
    content: { type: 'text', text: 'oi' },
    replyTo: null,
    mentions: [],
    clientMessageId: null,
    status: { sentAt: AT, deliveredTo: [], readBy: [] },
    deletedAt: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

describe('registerRealtimeListeners (ponte EventBus → Socket.IO)', () => {
  let bus: EventBus;
  let io: FakeServer;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    io = createFakeServer();
    registerRealtimeListeners(io.asServer(), bus);
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('MESSAGE_SENT → message:new (a própria MessageDTO) para a room da conversa', async () => {
    const dto = message();

    await bus.publish(ChatEvents.MESSAGE_SENT, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      conversationType: 'direct',
      senderId: USER_A,
      text: 'oi',
      mentions: [],
      replyTo: null,
      createdAt: AT,
      participantIds: [USER_A, USER_B],
      message: dto,
    });

    expect(io.emits).toEqual([[[ROOM], 'message:new', dto]]);
  });

  it('MESSAGE_DELETED → message:deleted para a room da conversa', async () => {
    await bus.publish(ChatEvents.MESSAGE_DELETED, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      deletedBy: USER_A,
    });

    expect(io.emits).toEqual([
      [[ROOM], 'message:deleted', { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID }],
    ]);
  });

  it('MESSAGE_DELIVERED → message:status delivered só para a room do remetente', async () => {
    await bus.publish(ChatEvents.MESSAGE_DELIVERED, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_B,
      senderId: USER_A,
      at: AT,
    });

    expect(io.emits).toEqual([
      [
        [`user:${USER_A}`],
        'message:status',
        {
          type: 'delivered',
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          userId: USER_B,
          at: AT,
        },
      ],
    ]);
  });

  it('MESSAGE_READ → message:status read para a room da conversa', async () => {
    await bus.publish(ChatEvents.MESSAGE_READ, {
      conversationId: CONVERSATION_ID,
      userId: USER_B,
      upToMessageId: MESSAGE_ID,
      at: AT,
    });

    expect(io.emits).toEqual([
      [
        [ROOM],
        'message:status',
        {
          type: 'read',
          conversationId: CONVERSATION_ID,
          userId: USER_B,
          upToMessageId: MESSAGE_ID,
          at: AT,
        },
      ],
    ]);
  });

  it('CONVERSATION_CREATED → sockets dos participantes entram na room e recebem conversation:new', async () => {
    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: CONVERSATION_ID,
      type: 'group',
      creatorId: USER_A,
      participantIds: [USER_A, USER_B],
    });

    expect(io.joins).toEqual([
      [`user:${USER_A}`, ROOM],
      [`user:${USER_B}`, ROOM],
    ]);
    expect(io.emits).toEqual([
      [
        [ROOM, `user:${USER_A}`, `user:${USER_B}`],
        'conversation:new',
        { conversationId: CONVERSATION_ID, type: 'group' },
      ],
    ]);
  });

  it('CONVERSATION_UPDATED members_added → novos entram na room antes do aviso', async () => {
    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: CONVERSATION_ID,
      change: 'members_added',
      actorId: USER_A,
      participantIds: [USER_A, USER_B, USER_C],
      affectedUserIds: [USER_B, USER_C],
    });

    expect(io.joins).toEqual([
      [`user:${USER_B}`, ROOM],
      [`user:${USER_C}`, ROOM],
    ]);
    expect(io.leaves).toEqual([]);
    expect(io.emits).toEqual([
      [
        [ROOM, `user:${USER_B}`, `user:${USER_C}`],
        'conversation:updated',
        {
          conversationId: CONVERSATION_ID,
          change: 'members_added',
          actorId: USER_A,
          affectedUserIds: [USER_B, USER_C],
        },
      ],
    ]);
  });

  it.each(['member_left', 'member_removed'] as const)(
    'CONVERSATION_UPDATED %s → avisa a room e o afetado, depois o tira da room',
    async (change) => {
      await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change,
        actorId: USER_A,
        participantIds: [USER_B, USER_A],
        affectedUserIds: [USER_B],
      });

      expect(io.emits).toEqual([
        [
          [ROOM, `user:${USER_B}`],
          'conversation:updated',
          { conversationId: CONVERSATION_ID, change, actorId: USER_A, affectedUserIds: [USER_B] },
        ],
      ]);
      expect(io.leaves).toEqual([[`user:${USER_B}`, ROOM]]);
      expect(io.joins).toEqual([]);
    }
  );

  it('CONVERSATION_UPDATED renamed → conversation:updated com o novo nome, sem mexer em rooms', async () => {
    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: CONVERSATION_ID,
      change: 'renamed',
      actorId: USER_A,
      participantIds: [USER_A, USER_B],
      affectedUserIds: [],
      name: 'Novo nome',
    });

    expect(io.emits).toEqual([
      [
        [ROOM],
        'conversation:updated',
        {
          conversationId: CONVERSATION_ID,
          change: 'renamed',
          actorId: USER_A,
          affectedUserIds: [],
          name: 'Novo nome',
        },
      ],
    ]);
    expect(io.joins).toEqual([]);
    expect(io.leaves).toEqual([]);
  });

  it('CONVERSATION_DELETED → conversation:deleted para quem participava e esvazia a room', async () => {
    await bus.publish(ChatEvents.CONVERSATION_DELETED, {
      conversationId: CONVERSATION_ID,
      actorId: USER_A,
      participantIds: [USER_A],
    });

    expect(io.emits).toEqual([
      [[ROOM, `user:${USER_A}`], 'conversation:deleted', { conversationId: CONVERSATION_ID }],
    ]);
    expect(io.leaves).toEqual([[ROOM, ROOM]]);
  });

  it('a função retornada cancela todas as inscrições', async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    const unregister = registerRealtimeListeners(io.asServer(), bus);

    unregister();
    await bus.publish(ChatEvents.MESSAGE_DELETED, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      deletedBy: USER_A,
    });

    expect(io.emits).toEqual([]);
    expect(bus.subscriberCount()).toBe(0);
  });

  it('usa o eventBus padrão quando nada é injetado', () => {
    const unregister = registerRealtimeListeners(io.asServer());

    expect(typeof unregister).toBe('function');
    unregister();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/listeners --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/listeners'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/realtime/listeners/realtime.listeners.ts`:

```ts
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';
import { SERVER_EVENTS, conversationRoom, userRoom } from '../constants';
import type { RealtimeServer } from '../types';

/**
 * Ponte EventBus → Socket.IO: traduz os eventos do chat em emissões para as rooms. Os
 * subscribers são síncronos (só emitem; sem I/O). Retorna a função que cancela as inscrições.
 *
 * Mudanças de participação também ajustam as rooms de quem já está conectado
 * (`socketsJoin`/`socketsLeave` via room `user:<id>`, válido entre instâncias com o Redis
 * adapter). Avisos que dependem dessa mudança vão também para as rooms `user:<id>` dos
 * afetados — o Socket.IO não duplica a entrega a quem está nas duas rooms.
 */
export function registerRealtimeListeners(
  io: Pick<RealtimeServer, 'to' | 'in'>,
  bus: Pick<EventBus, 'subscribe'> = eventBus
): () => void {
  const unsubscribers = [
    bus.subscribe(ChatEvents.MESSAGE_SENT, ({ payload }) => {
      io.to(conversationRoom(payload.conversationId)).emit(
        SERVER_EVENTS.MESSAGE_NEW,
        payload.message
      );
    }),

    bus.subscribe(ChatEvents.MESSAGE_DELETED, ({ payload: { conversationId, messageId } }) => {
      io.to(conversationRoom(conversationId)).emit(SERVER_EVENTS.MESSAGE_DELETED, {
        conversationId,
        messageId,
      });
    }),

    bus.subscribe(ChatEvents.MESSAGE_DELIVERED, ({ payload }) => {
      io.to(userRoom(payload.senderId)).emit(SERVER_EVENTS.MESSAGE_STATUS, {
        type: 'delivered',
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        userId: payload.userId,
        at: payload.at,
      });
    }),

    bus.subscribe(ChatEvents.MESSAGE_READ, ({ payload }) => {
      io.to(conversationRoom(payload.conversationId)).emit(SERVER_EVENTS.MESSAGE_STATUS, {
        type: 'read',
        conversationId: payload.conversationId,
        userId: payload.userId,
        upToMessageId: payload.upToMessageId,
        at: payload.at,
      });
    }),

    bus.subscribe(ChatEvents.CONVERSATION_CREATED, ({ payload }) => {
      const room = conversationRoom(payload.conversationId);
      const participantRooms = payload.participantIds.map(userRoom);
      participantRooms.forEach((participantRoom) => {
        io.in(participantRoom).socketsJoin(room);
      });
      io.to([room, ...participantRooms]).emit(SERVER_EVENTS.CONVERSATION_NEW, {
        conversationId: payload.conversationId,
        type: payload.type,
      });
    }),

    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, ({ payload }) => {
      const room = conversationRoom(payload.conversationId);
      const affectedRooms = payload.affectedUserIds.map(userRoom);

      if (payload.change === 'members_added') {
        affectedRooms.forEach((affectedRoom) => {
          io.in(affectedRoom).socketsJoin(room);
        });
      }

      io.to([room, ...affectedRooms]).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId: payload.conversationId,
        change: payload.change,
        actorId: payload.actorId,
        affectedUserIds: payload.affectedUserIds,
        ...(payload.name !== undefined ? { name: payload.name } : {}),
      });

      if (payload.change === 'member_left' || payload.change === 'member_removed') {
        affectedRooms.forEach((affectedRoom) => {
          io.in(affectedRoom).socketsLeave(room);
        });
      }
    }),

    bus.subscribe(ChatEvents.CONVERSATION_DELETED, ({ payload }) => {
      const room = conversationRoom(payload.conversationId);
      io.to([room, ...payload.participantIds.map(userRoom)]).emit(
        SERVER_EVENTS.CONVERSATION_DELETED,
        { conversationId: payload.conversationId }
      );
      io.in(room).socketsLeave(room);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

Criar `src/modules/realtime/listeners/index.ts`:

```ts
export { registerRealtimeListeners } from './realtime.listeners';
```

- [ ] **Step 4: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/listeners --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 5: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime/listeners tests/unit/modules/realtime/listeners
git add src/modules/realtime/listeners tests/unit/modules/realtime/listeners
git commit -m "✨ feat: faz a ponte dos eventos do chat no EventBus para as rooms do Socket.IO"
```

---

### Task 14: `createRealtimeServer` (CORS, Redis adapter, handshake, handlers, ponte) e `server.ts`

**Files:**
- Modify: `src/shared/middlewares/cors.ts`, `src/shared/middlewares/index.ts` (`buildCorsOptions`)
- Create: `src/modules/realtime/server/{createRealtimeServer.ts,index.ts}`
- Create: `src/modules/realtime/index.ts`
- Modify: `src/server.ts`, `.env.example`
- Test: `tests/unit/shared/middlewares/cors.test.ts`, `tests/unit/shared/middlewares/index.test.ts`, `tests/unit/modules/realtime/server/{createRealtimeServer,index}.test.ts`, `tests/unit/modules/realtime/index.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 8–13; `redis` (`@/shared/database/redis`); `createAdapter` (`@socket.io/redis-adapter`).
- Produces:
  - `buildCorsOptions(config?: CorsConfig): CorsOptions` (mesma política do `createCorsMiddleware`, que passa a usá-la).
  - `shouldUseRedisAdapter(env = process.env): boolean`.
  - `createRealtimeServer(httpServer: http.Server, options?: RealtimeServerOptions): RealtimeServerHandle` com `RealtimeServerOptions { auth?; conversations?: Pick<IConversationService, 'getUserConversationIds' | 'getTypeForParticipant'>; messages?: Pick<IMessageService, 'send' | 'markDelivered' | 'markRead'>; bus?; typing?: TypingService; redisClient?: Pick<Redis, 'duplicate'>; env?: Record<string, string | undefined> }` e `RealtimeServerHandle { io: RealtimeServer; close(): Promise<void> }`.
  - Barrel `@/modules/realtime` com todos os exports públicos do módulo.

- [ ] **Step 1: `buildCorsOptions` — testes (falham)**

Em `tests/unit/shared/middlewares/cors.test.ts`: acrescentar `buildCorsOptions,` como primeiro nome do import nomeado de `@/shared/middlewares/cors` (`import createCorsMiddlewareDefault, { buildCorsOptions, corsMiddleware, ... }`) e, imediatamente antes de `  describe('getCorsMiddleware / aliases', () => {`:

```ts
  describe('buildCorsOptions (mesma política reusada pelo Socket.IO)', () => {
    it('devolve as opções do pacote cors usadas pelo middleware HTTP', () => {
      const options = buildCorsOptions({ allowedOrigins: ['http://a.com'] });

      expect(options).toEqual(
        expect.objectContaining({
          methods: CORS_DEFAULT_METHODS,
          allowedHeaders: CORS_DEFAULT_ALLOWED_HEADERS,
          exposedHeaders: CORS_DEFAULT_EXPOSED_HEADERS,
          credentials: true,
          maxAge: CORS_DEFAULT_MAX_AGE,
        })
      );
    });

    it('a função origin aplica a lista de origens permitidas', () => {
      const { origin } = buildCorsOptions({ allowedOrigins: ['http://a.com'] });
      const check = origin as (
        requestOrigin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void
      ) => void;
      const callback = jest.fn();

      check('http://a.com', callback);
      check('http://c.com', callback);

      expect(callback).toHaveBeenNthCalledWith(1, null, true);
      expect(callback).toHaveBeenNthCalledWith(2, expect.any(Error));
    });
  });
```

Dentro desse mesmo `describe`, entre os dois `it`, acrescentar também o teste abaixo — sem ele o valor padrão `config = {}` de `buildCorsOptions` fica sem cobertura de branch até a Task 14 chamá-la sem argumentos:

```ts
    it('sem argumentos usa os padrões do projeto', () => {
      expect(buildCorsOptions()).toEqual(
        expect.objectContaining({ credentials: true, maxAge: CORS_DEFAULT_MAX_AGE })
      );
    });
```

Em `tests/unit/shared/middlewares/index.test.ts`: acrescentar `buildCorsOptions,` ao import (depois de `createCorsMiddleware,`) e, no teste `'deve exportar middlewares de cors'`, a linha `expect(typeof buildCorsOptions).toBe('function');`.

Run: `node node_modules/.bin/jest tests/unit/shared/middlewares --coverage=false`
Expected: FAIL — `buildCorsOptions is not a function`.

- [ ] **Step 2: Extrair `buildCorsOptions`**

Em `src/shared/middlewares/cors.ts`, trocar a assinatura `export function createCorsMiddleware(config: CorsConfig = {}): RequestHandler {` por:

```ts
/**
 * Opções do pacote `cors` com a política do projeto (`ALLOWED_ORIGINS` em produção, qualquer
 * origem fora dela). Reusadas pelo Socket.IO para que HTTP e WebSocket sigam a mesma política.
 */
export function buildCorsOptions(config: CorsConfig = {}): CorsOptions {
```

e o fim da função (`  return cors(corsOptions);\n}`) por:

```ts
  return corsOptions;
}

export function createCorsMiddleware(config: CorsConfig = {}): RequestHandler {
  return cors(buildCorsOptions(config));
}
```

Em `src/shared/middlewares/index.ts`, trocar `export { corsMiddleware, createCorsMiddleware } from './cors';` por `export { corsMiddleware, createCorsMiddleware, buildCorsOptions } from './cors';`.

Run: `node node_modules/.bin/jest tests/unit/shared/middlewares --coverage=false` → PASS.

- [ ] **Step 3: Commit do refactor**

```bash
node node_modules/.bin/prettier --write src/shared/middlewares tests/unit/shared/middlewares
git add src/shared/middlewares/cors.ts src/shared/middlewares/index.ts tests/unit/shared/middlewares/cors.test.ts tests/unit/shared/middlewares/index.test.ts
git commit -m "♻️ refactor: extrai buildCorsOptions para reusar a política de CORS"
```

- [ ] **Step 4: Testes do servidor (falham)**

Criar `tests/unit/modules/realtime/server/createRealtimeServer.test.ts` (o `createAdapter` mockado devolve o `Adapter` em memória do `socket.io-adapter`, dependência transitiva do `socket.io`; os testes de conexão usam servidor real em porta efêmera):

```ts
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }));

import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { createAdapter } from '@socket.io/redis-adapter';
import { Adapter } from 'socket.io-adapter';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import {
  createRealtimeServer,
  shouldUseRedisAdapter,
  type RealtimeServerHandle,
} from '@/modules/realtime/server/createRealtimeServer';
import { TypingService } from '@/modules/realtime/services/TypingService';
import { EventBus } from '@/shared/event-bus/EventBus';
import { initLogger, LogCategory, LogLevel } from '@/shared/logger';

const mockCreateAdapter = createAdapter as jest.Mock;
const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function fakeDeps(): {
  auth: { validateAccessToken: jest.Mock };
  conversations: { getUserConversationIds: jest.Mock; getTypeForParticipant: jest.Mock };
  messages: { send: jest.Mock; markDelivered: jest.Mock; markRead: jest.Mock };
} {
  return {
    auth: {
      validateAccessToken: jest.fn((token: string) =>
        token === 'good' ? { valid: true, userId: USER_A } : { valid: false }
      ),
    },
    conversations: {
      getUserConversationIds: jest.fn().mockResolvedValue([CONVERSATION_ID]),
      getTypeForParticipant: jest.fn().mockResolvedValue('direct'),
    },
    messages: { send: jest.fn(), markDelivered: jest.fn(), markRead: jest.fn() },
  };
}

describe('createRealtimeServer', () => {
  let bus: EventBus;

  beforeAll(() => {
    // O CORS do Socket.IO usa getLogger(); tests/setup.ts não chama initLogger.
    initLogger({
      service: 'test',
      environment: 'test',
      minLevel: LogLevel.FATAL,
      enableConsole: false,
      enableMongo: false,
      category: LogCategory.SYSTEM,
    });
  });

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  describe('shouldUseRedisAdapter', () => {
    it.each([
      [{ NODE_ENV: 'production' }, true],
      [{ NODE_ENV: 'development', REALTIME_REDIS_ADAPTER: 'true' }, true],
      [{}, true],
      [{ NODE_ENV: 'test' }, false],
      [{ NODE_ENV: 'production', REALTIME_REDIS_ADAPTER: 'false' }, false],
    ])('%j → %s', (env, expected) => {
      expect(shouldUseRedisAdapter(env)).toBe(expected);
    });

    it('usa process.env por padrão (NODE_ENV=test na suíte)', () => {
      expect(shouldUseRedisAdapter()).toBe(false);
    });
  });

  describe('adapter', () => {
    it('com Redis: duplica o cliente em pub/sub, instala o adapter e fecha ambos no close', async () => {
      const pub = { quit: jest.fn().mockResolvedValue('OK') };
      const sub = { quit: jest.fn().mockResolvedValue('OK') };
      const redisClient = {
        duplicate: jest.fn().mockReturnValueOnce(pub).mockReturnValueOnce(sub),
      };
      mockCreateAdapter.mockReturnValue(Adapter);

      const handle = createRealtimeServer(createServer(), {
        ...fakeDeps(),
        bus,
        redisClient: redisClient as never,
        env: { NODE_ENV: 'production' },
      });

      expect(redisClient.duplicate).toHaveBeenCalledTimes(2);
      expect(mockCreateAdapter).toHaveBeenCalledWith(pub, sub);
      await handle.close();
      expect(pub.quit).toHaveBeenCalledTimes(1);
      expect(sub.quit).toHaveBeenCalledTimes(1);
    });

    it('em teste ou com REALTIME_REDIS_ADAPTER=false: adapter em memória, sem tocar no Redis', async () => {
      const redisClient = { duplicate: jest.fn() };

      const handles = [
        createRealtimeServer(createServer(), {
          ...fakeDeps(),
          bus,
          redisClient: redisClient as never,
          env: { NODE_ENV: 'test' },
        }),
        createRealtimeServer(createServer(), {
          ...fakeDeps(),
          bus,
          redisClient: redisClient as never,
          env: { NODE_ENV: 'production', REALTIME_REDIS_ADAPTER: 'false' },
        }),
      ];

      expect(redisClient.duplicate).not.toHaveBeenCalled();
      expect(mockCreateAdapter).not.toHaveBeenCalled();
      await Promise.all(handles.map((handle) => handle.close()));
    });

    it('usa os singletons (services, Redis, EventBus, process.env) quando nada é injetado', async () => {
      const handle = createRealtimeServer(createServer());

      expect(handle.io).toBeDefined();
      await handle.close();
    });
  });

  describe('conexão (servidor HTTP real em porta efêmera)', () => {
    let httpServer: HttpServer;
    let handle: RealtimeServerHandle;
    let deps: ReturnType<typeof fakeDeps>;
    let url: string;
    const clients: ClientSocket[] = [];

    function client(token?: string): ClientSocket {
      const socket = connect(url, {
        auth: token === undefined ? {} : { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(socket);
      return socket;
    }

    beforeEach(async () => {
      deps = fakeDeps();
      httpServer = createServer();
      handle = createRealtimeServer(httpServer, {
        ...deps,
        bus,
        typing: new TypingService(50),
        env: { NODE_ENV: 'test' },
      });
      await new Promise<void>((resolve) => {
        httpServer.listen(0, resolve);
      });
      url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;
    });

    afterEach(async () => {
      clients.splice(0).forEach((socket) => socket.disconnect());
      await handle.close();
    });

    it('recusa handshake sem token válido com connect_error UNAUTHORIZED', async () => {
      const error = await new Promise<Error>((resolve) => {
        client('bad').on('connect_error', resolve);
      });

      expect(error.message).toBe('UNAUTHORIZED');
    });

    it('autentica, entra nas rooms e registra os handlers de mensagem e digitação', async () => {
      const socket = client('good');
      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          resolve();
        });
      });

      const rooms = handle.io.of('/').adapter.rooms;
      expect(rooms.get(`user:${USER_A}`)?.size).toBe(1);
      expect(rooms.get(`conversation:${CONVERSATION_ID}`)?.size).toBe(1);

      await expect(
        socket.emitWithAck('typing:stop', { conversationId: CONVERSATION_ID })
      ).resolves.toEqual({ ok: true, data: null });
      await expect(
        socket.emitWithAck('message:read', { conversationId: CONVERSATION_ID, messageId: 'x' })
      ).resolves.toEqual(expect.objectContaining({ ok: false }));
    });

    it('close cancela a ponte do EventBus', async () => {
      expect(bus.subscriberCount()).toBeGreaterThan(0);

      await handle.close();

      expect(bus.subscriberCount()).toBe(0);
    });
  });
});
```

Criar `tests/unit/modules/realtime/server/index.test.ts`:

```ts
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { createRealtimeServer, shouldUseRedisAdapter } from '@/modules/realtime/server';

describe('realtime server index', () => {
  it('deve exportar a fábrica do servidor e a regra do adapter', () => {
    expect(typeof createRealtimeServer).toBe('function');
    expect(typeof shouldUseRedisAdapter).toBe('function');
  });
});
```

Criar `tests/unit/modules/realtime/index.test.ts` (acessa cada re-export nomeado — o `export { x } from` gera getters que contam como funções na cobertura):

```ts
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import * as realtime from '@/modules/realtime';

describe('realtime module index', () => {
  it('deve exportar constantes, erros e schemas', () => {
    expect(realtime.REALTIME_CONSTANTS.TYPING_TTL_MS).toBe(3000);
    expect(realtime.TypingNotAllowedException).toBeDefined();
    expect(realtime.messageSendPayloadSchema).toBeDefined();
  });

  it('deve exportar middlewares, serviço, handlers, ponte e o servidor', () => {
    expect(typeof realtime.createSocketAuthMiddleware).toBe('function');
    expect(typeof realtime.createJoinRoomsMiddleware).toBe('function');
    expect(typeof realtime.extractHandshakeToken).toBe('function');
    expect(typeof realtime.withAck).toBe('function');
    expect(typeof realtime.toAckError).toBe('function');
    expect(new realtime.TypingService()).toBeInstanceOf(realtime.TypingService);
    expect(typeof realtime.registerMessageHandlers).toBe('function');
    expect(typeof realtime.registerTypingHandlers).toBe('function');
    expect(typeof realtime.registerRealtimeListeners).toBe('function');
    expect(typeof realtime.createRealtimeServer).toBe('function');
    expect(typeof realtime.shouldUseRedisAdapter).toBe('function');
  });
});
```

Run: `node node_modules/.bin/jest tests/unit/modules/realtime/server tests/unit/modules/realtime/index.test.ts --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/realtime/server/createRealtimeServer'` (e `server`, barrel).

- [ ] **Step 5: Implementar o servidor e o barrel**

Criar `src/modules/realtime/server/createRealtimeServer.ts`:

```ts
import type { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { Server } from 'socket.io';
import type { IAuthService } from '@/modules/auth/interfaces';
import { authService } from '@/modules/auth/services/AuthService';
import type { IConversationService, IMessageService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { messageService } from '@/modules/chat/services/MessageService';
import { redis } from '@/shared/database/redis';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { buildCorsOptions } from '@/shared/middlewares/cors';
import { registerMessageHandlers, registerTypingHandlers } from '../handlers';
import { registerRealtimeListeners } from '../listeners';
import { createJoinRoomsMiddleware, createSocketAuthMiddleware } from '../middlewares';
import { TypingService } from '../services';
import type { RealtimeServer } from '../types';

export interface RealtimeServerOptions {
  auth?: Pick<IAuthService, 'validateAccessToken'>;
  conversations?: Pick<IConversationService, 'getUserConversationIds' | 'getTypeForParticipant'>;
  messages?: Pick<IMessageService, 'send' | 'markDelivered' | 'markRead'>;
  bus?: Pick<EventBus, 'subscribe'>;
  /** Injetável para testes usarem um TTL curto. */
  typing?: TypingService;
  /** Cliente base duplicado em pub/sub para o Redis adapter. */
  redisClient?: Pick<Redis, 'duplicate'>;
  env?: Record<string, string | undefined>;
}

export interface RealtimeServerHandle {
  io: RealtimeServer;
  /** Fecha os sockets e o servidor HTTP, cancela a ponte do EventBus e os clientes pub/sub. */
  close(): Promise<void>;
}

/** Redis adapter (escala horizontal) fora de `NODE_ENV=test`, salvo `REALTIME_REDIS_ADAPTER=false`. */
export function shouldUseRedisAdapter(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REALTIME_REDIS_ADAPTER !== 'false' && env.NODE_ENV !== 'test';
}

/**
 * Cria o servidor Socket.IO sobre o servidor HTTP da API: CORS igual ao HTTP, Redis adapter
 * (quando habilitado), handshake autenticado (`socketAuth`) que já entra nas rooms do usuário
 * (`joinRooms`), handlers de mensagem/digitação por conexão e a ponte EventBus → rooms.
 */
export function createRealtimeServer(
  httpServer: HttpServer,
  options: RealtimeServerOptions = {}
): RealtimeServerHandle {
  const {
    auth = authService,
    conversations = conversationService,
    messages = messageService,
    bus = eventBus,
    typing = new TypingService(),
    redisClient = redis,
    env = process.env,
  } = options;

  const io: RealtimeServer = new Server(httpServer, { cors: buildCorsOptions() });

  const pubSubClients: Pick<Redis, 'quit'>[] = [];
  if (shouldUseRedisAdapter(env)) {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    pubSubClients.push(pubClient, subClient);
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use(createSocketAuthMiddleware(auth));
  io.use(createJoinRoomsMiddleware(conversations));

  io.on('connection', (socket) => {
    registerMessageHandlers(socket, { messages });
    registerTypingHandlers(socket, { conversations, typing });
  });

  const unregisterListeners = registerRealtimeListeners(io, bus);

  return {
    io,
    close: async (): Promise<void> => {
      unregisterListeners();
      await io.close();
      await Promise.all(pubSubClients.map((client) => client.quit()));
    },
  };
}
```

Criar `src/modules/realtime/server/index.ts`:

```ts
export { createRealtimeServer, shouldUseRedisAdapter } from './createRealtimeServer';
export type { RealtimeServerOptions, RealtimeServerHandle } from './createRealtimeServer';
```

Criar `src/modules/realtime/index.ts`:

```ts
export * from './constants';

export * from './errors';

export * from './types';

export * from './validation';

export {
  createSocketAuthMiddleware,
  createJoinRoomsMiddleware,
  extractHandshakeToken,
} from './middlewares';

export { TypingService } from './services';

export { withAck, toAckError, registerMessageHandlers, registerTypingHandlers } from './handlers';
export type { AckContext, AckListener, MessageHandlerDeps, TypingHandlerDeps } from './handlers';

export { registerRealtimeListeners } from './listeners';

export { createRealtimeServer, shouldUseRedisAdapter } from './server';
export type { RealtimeServerOptions, RealtimeServerHandle } from './server';
```

- [ ] **Step 6: `server.ts` e `.env.example`**

Substituir `src/server.ts` inteiro por (fora da cobertura, como hoje):

```ts
import { createServer } from 'http';
import app from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createRealtimeServer } from './modules/realtime';
import { logger } from './shared/logger';

const PORT = process.env.PORT ?? 3000;

async function startServer(): Promise<void> {
  try {
    await bootstrap();

    // Socket.IO compartilha o servidor HTTP (e a porta) da API Express.
    const httpServer = createServer(app);
    const realtime = createRealtimeServer(httpServer);
    httpServer.listen(PORT);

    const stop = (signal: NodeJS.Signals): void => {
      logger.info(`${signal} recebido: encerrando o servidor`);
      realtime
        .close()
        .then(shutdown)
        .then(
          () => process.exit(0),
          () => process.exit(1)
        );
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  } catch {
    process.exit(1);
  }
}

void startServer();
```

Em `.env.example`, logo depois do bloco do `TRUST_PROXY` (linha `# TRUST_PROXY=1` e a linha em branco seguinte), acrescentar:

```bash
# Socket.IO: o Redis adapter (escala horizontal entre instâncias) fica ligado fora de
# NODE_ENV=test; REALTIME_REDIS_ADAPTER=false usa o adapter em memória (uma única instância).
# REALTIME_REDIS_ADAPTER=true
```

- [ ] **Step 7: Rodar os testes, provar ausência de open handles e a verificação completa**

```bash
node node_modules/.bin/jest tests/unit/modules/realtime tests/unit/shared/middlewares --coverage=false
node node_modules/.bin/jest tests/unit/modules/realtime/server --coverage=false --detectOpenHandles
npm run build && rm -rf dist
```

Expected: PASS; a execução com `--detectOpenHandles` termina sozinha e não imprime "Jest has detected the following open handle"; o build compila `src/server.ts`. Depois a **verificação completa**.

- [ ] **Step 8: Commit**

```bash
node node_modules/.bin/prettier --write src/modules/realtime src/server.ts tests/unit/modules/realtime
git add src/modules/realtime/server src/modules/realtime/index.ts src/server.ts .env.example tests/unit/modules/realtime/server tests/unit/modules/realtime/index.test.ts
git commit -m "✨ feat: sobe o Socket.IO no servidor HTTP com Redis adapter e encerramento gracioso"
```

---

### Task 15: Integração ponta a ponta com `socket.io-client`

**Files:**
- Create: `tests/feature/modules/realtime/realtime.test.ts`

**Interfaces:**
- Consumes: `createRealtimeServer` (Task 14) com `auth` falso (token = UUID do usuário), `typing: new TypingService(150)` e `env: { NODE_ENV: 'test' }`; `conversationRoutes` e os singletons `conversationService`/`messageService` sobre `createInMemoryChatRepositories()`; `eventBus` singleton (a ponte é cancelada no `realtime.close()`).
- Produces: cobertura dos cenários do spec §11 — handshake sem token/inválido, entrega < 100 ms, ack de erro, idempotência, delivered/read, typing start/stop/expiração, grupo sem typing, reconexão, conversa criada via REST e remoção de membro.

- [ ] **Step 1: Escrever o teste de integração**

Criar `tests/feature/modules/realtime/realtime.test.ts`:

```ts
// Integração do tempo real: servidor HTTP real em porta efêmera + createRealtimeServer +
// socket.io-client. Services do chat reais (singletons) sobre repositórios em memória; auth e
// módulo user falsos. Sem Docker e sem .env.
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const TYPING_TTL_MS = 150;

// Funções simples (não jest.fn) porque resetMocks:true apagaria implementações.
const mockUsers = new Set<string>([ANA, BOB, CAROL]);
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
const mockContactService = { isBlockedByEither: async (): Promise<boolean> => false };

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // REST: "Authorization: Bearer <uuid do usuário>".
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const id = (req.headers.authorization ?? '').replace('Bearer ', '');
    req.user = { id, email: `${id}@example.com`, username: id };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import * as chatRepositories from '@/modules/chat/repositories';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { createRealtimeServer, type RealtimeServerHandle } from '@/modules/realtime/server';
import { TypingService } from '@/modules/realtime/services';
import type { AckResponse } from '@/modules/realtime/types';
import { initLogger, LogCategory, LogLevel } from '@/shared/logger';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Handshake: o token é o próprio id do usuário (UUID); qualquer outra coisa é inválida.
const fakeAuth = {
  validateAccessToken: (token: string): { valid: boolean; userId?: string } =>
    UUID.test(token) ? { valid: true, userId: token } : { valid: false },
};

interface WireMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string | null;
  content: { text: string } | null;
}

describe('Tempo real — integração com socket.io-client', () => {
  let app: express.Application;
  let httpServer: HttpServer;
  let realtime: RealtimeServerHandle;
  let url: string;
  const clients: ClientSocket[] = [];

  function client(token: string, options: { reconnection?: boolean } = {}): ClientSocket {
    const socket = connect(url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: options.reconnection ?? false,
      reconnectionDelay: 10,
      reconnectionDelayMax: 20,
    });
    clients.push(socket);
    return socket;
  }

  async function connected(token: string): Promise<ClientSocket> {
    const socket = client(token);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => {
        resolve();
      });
      socket.once('connect_error', reject);
    });
    return socket;
  }

  /** Próximo `event` que satisfaz `predicate`; falha em 2s (timer sempre limpo). */
  function next<T>(
    socket: ClientSocket,
    event: string,
    predicate: (payload: T) => boolean = () => true
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, listener);
        reject(new Error(`timeout esperando ${event}`));
      }, 2000);
      const listener = (payload: T): void => {
        if (predicate(payload)) {
          clearTimeout(timer);
          socket.off(event, listener);
          resolve(payload);
        }
      };
      socket.on(event, listener);
    });
  }

  /** Coleta tudo que chegar em `event` durante `ms` (para provar que NÃO chegou). */
  async function collect<T>(socket: ClientSocket, event: string, ms: number): Promise<T[]> {
    const received: T[] = [];
    const listener = (payload: T): void => {
      received.push(payload);
    };
    socket.on(event, listener);
    await new Promise((resolve) => setTimeout(resolve, ms));
    socket.off(event, listener);
    return received;
  }

  async function createDirect(from: string, to: string): Promise<string> {
    const response = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${from}`)
      .send({ userId: to });
    return response.body.data.id as string;
  }

  async function send(
    socket: ClientSocket,
    payload: Record<string, unknown>
  ): Promise<AckResponse<WireMessage>> {
    return (await socket.emitWithAck('message:send', payload)) as AckResponse<WireMessage>;
  }

  beforeAll(async () => {
    initLogger({
      service: 'test',
      environment: 'test',
      minLevel: LogLevel.FATAL,
      enableConsole: false,
      enableMongo: false,
      category: LogCategory.SYSTEM,
    });

    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    app.use(errorHandler);

    httpServer = createServer(app);
    realtime = createRealtimeServer(httpServer, {
      auth: fakeAuth,
      typing: new TypingService(TYPING_TTL_MS),
      env: { NODE_ENV: 'test' },
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, resolve);
    });
    url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;
  });

  afterEach(() => {
    clients.splice(0).forEach((socket) => socket.disconnect());
    store.reset();
  });

  afterAll(async () => {
    await realtime.close();
  });

  describe('handshake', () => {
    it.each([
      ['sem token', ''],
      ['com token inválido', 'nao-e-um-token'],
    ])('%s → connect_error UNAUTHORIZED', async (_case, token) => {
      const error = await new Promise<Error>((resolve) => {
        client(token).once('connect_error', resolve);
      });

      expect(error.message).toBe('UNAUTHORIZED');
    });
  });

  describe('mensagens', () => {
    it('envio via socket chega ao outro participante em menos de 100 ms (e ao remetente)', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const bobReceives = next<WireMessage>(bob, 'message:new');
      const anaReceives = next<WireMessage>(ana, 'message:new');
      const startedAt = Date.now();
      const ack = await send(ana, { conversationId, text: 'olá, bob' });
      const received = await bobReceives;
      const elapsed = Date.now() - startedAt;

      expect(ack.ok).toBe(true);
      expect(received.content?.text).toBe('olá, bob');
      expect(received.senderId).toBe(ANA);
      expect(elapsed).toBeLessThan(100);
      if (ack.ok) {
        expect(received.id).toBe(ack.data.id);
        expect((await anaReceives).id).toBe(ack.data.id);
      }
    });

    it('ack de erro: não participante recebe 404 e payload inválido 400', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const carol = await connected(CAROL);

      const outsider = await send(carol, { conversationId, text: 'intrusa' });
      const invalid = await send(carol, { conversationId: 'x', text: '' });

      expect(outsider).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
      });
      expect(invalid).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      });
    });

    it('clientMessageId repetido devolve a mesma mensagem e não gera novo message:new', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);
      const clientMessageId = '77777777-7777-4777-8777-777777777777';

      const seenByBob = collect<WireMessage>(bob, 'message:new', 300);
      const first = await send(ana, { conversationId, text: 'uma vez', clientMessageId });
      const retry = await send(ana, { conversationId, text: 'uma vez', clientMessageId });

      expect(first.ok && retry.ok && first.data.id === retry.data.id).toBe(true);
      expect(await seenByBob).toHaveLength(1);
      expect(store.messages).toHaveLength(1);
    });
  });

  describe('status (RF003.4)', () => {
    it('delivered → só o remetente recebe message:status delivered', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);
      const sent = await send(ana, { conversationId, text: 'chegou?' });
      const messageId = sent.ok ? sent.data.id : '';

      const anaStatus = next<Record<string, unknown>>(ana, 'message:status');
      const bobStatus = collect(bob, 'message:status', 200);
      const ack = await bob.emitWithAck('message:delivered', { conversationId, messageId });

      expect(ack).toEqual({ ok: true, data: null });
      expect(await anaStatus).toEqual({
        type: 'delivered',
        conversationId,
        messageId,
        userId: BOB,
        at: expect.any(String),
      });
      expect(await bobStatus).toEqual([]);
    });

    it('read → a room da conversa recebe message:status read', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);
      await send(ana, { conversationId, text: 'm1' });
      const last = await send(ana, { conversationId, text: 'm2' });
      const upToMessageId = last.ok ? last.data.id : '';

      const anaStatus = next<Record<string, unknown>>(ana, 'message:status');
      const bobStatus = next<Record<string, unknown>>(bob, 'message:status');
      const ack = await bob.emitWithAck('message:read', {
        conversationId,
        messageId: upToMessageId,
      });

      expect(ack).toEqual({ ok: true, data: null });
      const expected = {
        type: 'read',
        conversationId,
        userId: BOB,
        upToMessageId,
        at: expect.any(String),
      };
      expect(await anaStatus).toEqual(expected);
      expect(await bobStatus).toEqual(expected);
      expect(store.messages.every((m) => m.readBy.some((entry) => entry.userId === BOB))).toBe(
        true
      );
    });
  });

  describe('digitação (RF003.5)', () => {
    it('start → o outro recebe isTyping=true (o próprio não); stop → false', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const anaIndicators = collect(ana, 'typing:indicator', 250);
      const typingOn = next(bob, 'typing:indicator');
      expect(await ana.emitWithAck('typing:start', { conversationId })).toEqual({
        ok: true,
        data: null,
      });
      expect(await typingOn).toEqual({ conversationId, userId: ANA, isTyping: true });

      const typingOff = next(bob, 'typing:indicator');
      await ana.emitWithAck('typing:stop', { conversationId });
      expect(await typingOff).toEqual({ conversationId, userId: ANA, isTyping: false });
      expect(await anaIndicators).toEqual([]);
    });

    it('sem novo start, expira sozinho (TTL injetado) com isTyping=false', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const typingOn = next(bob, 'typing:indicator');
      await ana.emitWithAck('typing:start', { conversationId });
      await typingOn;
      const startedAt = Date.now();

      const expired = await next(bob, 'typing:indicator');

      expect(expired).toEqual({ conversationId, userId: ANA, isTyping: false });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(TYPING_TTL_MS - 20);
    });

    it('grupo não emite typing (ack 400)', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ANA}`)
        .send({ name: 'Time', participantIds: [BOB] });
      const conversationId = created.body.data.id as string;
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const bobIndicators = collect(bob, 'typing:indicator', 200);
      const ack = await ana.emitWithAck('typing:start', { conversationId });

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'BAD_REQUEST', statusCode: 400 }),
      });
      expect(await bobIndicators).toEqual([]);
    });
  });

  describe('rooms', () => {
    it('reconexão automática re-entra nas rooms e volta a receber mensagens', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const bob = await connected(BOB);
      const ana = client(ANA, { reconnection: true });
      await next(ana, 'connect');

      const reconnected = next(ana, 'connect');
      ana.io.engine.close();
      await reconnected;

      const received = next<WireMessage>(ana, 'message:new');
      await send(bob, { conversationId, text: 'depois da reconexão' });

      expect((await received).content?.text).toBe('depois da reconexão');
    });

    it('conversa criada via REST: o socket do participante entra na room e recebe mensagens', async () => {
      const carol = await connected(CAROL);
      const ana = await connected(ANA);

      const announced = next<{ conversationId: string; type: string }>(carol, 'conversation:new');
      const conversationId = await createDirect(ANA, CAROL);
      expect(await announced).toEqual({ conversationId, type: 'direct' });

      const received = next<WireMessage>(carol, 'message:new');
      await send(ana, { conversationId, text: 'bem-vinda' });

      expect((await received).conversationId).toBe(conversationId);
    });

    it('membro removido via REST é avisado e deixa de receber mensagens do grupo', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ANA}`)
        .send({ name: 'Time', participantIds: [BOB, CAROL] });
      const conversationId = created.body.data.id as string;
      const ana = await connected(ANA);
      const carol = await connected(CAROL);

      const notified = next<{ change: string }>(carol, 'conversation:updated');
      const removed = await request(app)
        .delete(`/api/conversations/${conversationId}/members/${CAROL}`)
        .set('Authorization', `Bearer ${ANA}`);
      expect(removed.status).toBe(204);
      expect(await notified).toEqual(
        expect.objectContaining({ conversationId, change: 'member_removed' })
      );

      const carolMessages = collect(carol, 'message:new', 200);
      await send(ana, { conversationId, text: 'só para quem ficou' });

      expect(await carolMessages).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Rodar (deve passar direto — as peças já existem) e repetir para flakiness**

```bash
node node_modules/.bin/jest tests/feature/modules/realtime --coverage=false
for i in 1 2 3 4 5; do node node_modules/.bin/jest tests/feature/modules/realtime --coverage=false 2>&1 | grep -E '^Tests:'; done
node node_modules/.bin/jest tests/feature/modules/realtime tests/unit/modules/realtime --coverage=false --detectOpenHandles
```

Expected: 13 testes passando nas cinco repetições; a rodada com `--detectOpenHandles` termina sozinha sem listar handles abertos. Se algum cenário falhar, o defeito está na task que criou a peça (ex.: `joinRooms` → Task 9, ponte → Task 13): corrija lá com teste unitário antes de seguir.

- [ ] **Step 3: Verificação completa e commit**

**Verificação completa** (Expected: 100%). Depois:

```bash
node node_modules/.bin/prettier --write tests/feature/modules/realtime
git add tests/feature/modules/realtime/realtime.test.ts
git commit -m "✅ test: cobre o tempo real ponta a ponta com socket.io-client"
```

---

### Task 16: Cliente demo em `/demo`

**Files:**
- Create: `public/demo/index.html`, `public/demo/app.js`, `public/demo/styles.css`
- Modify: `src/app.ts`
- Test: `tests/unit/app.test.ts`

**Interfaces:**
- Consumes: `POST /api/auth/login` (`data.tokens.accessToken`, `data.user`), `GET /api/conversations`, `GET /api/conversations/:id`, `GET /api/conversations/:id/messages?before=`, `GET /api/users/search?query=`, `POST /api/conversations/direct`; eventos da Task 8; `/socket.io/socket.io.js` servido pelo próprio Socket.IO.
- Produces: `GET /demo/` (HTML), `/demo/app.js`, `/demo/styles.css` via `express.static`, fora do rate limit de `/api`.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/unit/app.test.ts`, dentro de `describe('roteamento')`, imediatamente antes de `    it('retorna 404 em formato JSON (notFoundHandler + errorHandler) para rota desconhecida', async () => {`:

```ts
    it('serve o cliente demo estático em /demo, fora do rate limit de /api', async () => {
      const page = await request(app).get('/demo/');
      const script = await request(app).get('/demo/app.js');
      const styles = await request(app).get('/demo/styles.css');

      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.text).toContain('<script src="/socket.io/socket.io.js"></script>');
      expect(page.headers['x-test-global-limiter']).toBeUndefined();
      expect(script.status).toBe(200);
      expect(script.headers['content-type']).toMatch(/javascript/);
      expect(styles.status).toBe(200);
    });
```

Run: `node node_modules/.bin/jest tests/unit/app.test.ts --coverage=false`
Expected: FAIL — `/demo/` responde 404.

- [ ] **Step 2: Criar o cliente demo**

Criar `public/demo/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Real-Time Messaging — demo</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header>
      <h1>Real-Time Messaging — demo</h1>
      <span id="connection" class="badge">desconectado</span>
      <span id="me"></span>
      <button id="logout" type="button" hidden>Sair</button>
    </header>

    <section id="login-view">
      <form id="login-form">
        <h2>Entrar</h2>
        <label>E-mail <input name="email" type="email" required autocomplete="username" /></label>
        <label>
          Senha <input name="password" type="password" required autocomplete="current-password" />
        </label>
        <button type="submit">Entrar</button>
        <p id="login-error" class="error" role="alert"></p>
      </form>
    </section>

    <main id="chat-view" hidden>
      <aside>
        <form id="search-form">
          <input name="query" placeholder="Buscar usuário para conversa 1:1" minlength="2" required />
          <button type="submit">Buscar</button>
        </form>
        <ul id="search-results"></ul>
        <h2>Conversas</h2>
        <ul id="conversations"></ul>
      </aside>

      <section id="conversation" hidden>
        <h2 id="conversation-title"></h2>
        <button id="load-more" type="button" hidden>Carregar mais</button>
        <ol id="messages"></ol>
        <p id="typing" class="typing"></p>
        <form id="message-form">
          <input name="text" placeholder="Mensagem" autocomplete="off" required maxlength="10000" />
          <button type="submit">Enviar</button>
        </form>
      </section>
    </main>

    <!-- Cliente servido pelo próprio servidor Socket.IO (compatível com CSP script-src 'self'). -->
    <script src="/socket.io/socket.io.js"></script>
    <script src="app.js"></script>
  </body>
</html>
```

Criar `public/demo/styles.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1d2330; }
header { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1rem; background: #1d2330; color: #fff; }
header h1 { font-size: 1.1rem; margin: 0; flex: 1; }
.badge { padding: 0.15rem 0.5rem; border-radius: 1rem; background: #b3261e; font-size: 0.8rem; }
.badge.online { background: #1e7d34; }
#login-view { display: flex; justify-content: center; padding: 3rem 1rem; }
#login-form { display: grid; gap: 0.75rem; width: 20rem; background: #fff; padding: 1.5rem; border-radius: 0.5rem; }
label { display: grid; gap: 0.25rem; font-size: 0.9rem; }
input { padding: 0.5rem; border: 1px solid #c5cad3; border-radius: 0.25rem; font: inherit; }
button { padding: 0.5rem 0.75rem; border: 0; border-radius: 0.25rem; background: #2f5bea; color: #fff; cursor: pointer; font: inherit; }
.error { color: #b3261e; min-height: 1.2em; margin: 0; }
main { display: grid; grid-template-columns: 18rem 1fr; height: calc(100vh - 3.2rem); }
aside { overflow-y: auto; background: #fff; border-right: 1px solid #dde1e8; padding: 1rem; }
aside h2 { font-size: 0.95rem; margin: 1rem 0 0.5rem; }
#search-form { display: flex; gap: 0.5rem; }
#search-form input { flex: 1; min-width: 0; }
ul { list-style: none; margin: 0; padding: 0; }
aside li { padding: 0.5rem; border-radius: 0.25rem; cursor: pointer; }
aside li:hover, aside li.active { background: #e8edfc; }
#conversation { display: flex; flex-direction: column; padding: 1rem; min-height: 0; }
#conversation h2 { margin: 0 0 0.5rem; font-size: 1rem; }
#messages { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
#messages li { max-width: 70%; padding: 0.4rem 0.6rem; border-radius: 0.5rem; background: #fff; align-self: flex-start; }
#messages li.mine { align-self: flex-end; background: #dbe5ff; }
#messages li.pending { opacity: 0.6; }
#messages li.deleted { font-style: italic; color: #6b7280; }
.meta { font-size: 0.7rem; color: #6b7280; margin-left: 0.5rem; }
.ticks { font-size: 0.75rem; margin-left: 0.25rem; color: #6b7280; }
.ticks.read { color: #2f5bea; }
.typing { min-height: 1.2em; font-size: 0.85rem; color: #6b7280; margin: 0.25rem 0; }
#message-form { display: flex; gap: 0.5rem; }
#message-form input { flex: 1; }
#load-more { align-self: center; margin-bottom: 0.5rem; background: #6b7280; }
```

Criar `public/demo/app.js` (JS puro; `textContent` para todo dado de usuário; ✓ enviada, ✓✓ entregue, ✓✓ azul lida; `message:delivered` ao receber, `message:read` ao exibir; digitação só em 1:1; reconexão recarrega a conversa aberta via REST):

```js
// Cliente demo do tempo real (JS puro, sem build). NÃO é um frontend de produção: o access
// token fica no localStorage apenas para sobreviver a um reload da página.
(() => {
  'use strict';

  const TOKEN_KEY = 'rtm-demo-token';
  const USER_KEY = 'rtm-demo-user';
  const TYPING_RENEW_MS = 1000;

  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem(TOKEN_KEY),
    user: JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'),
    socket: null,
    conversations: [],
    current: null, // conversa aberta
    messages: [], // mensagens da conversa aberta, da mais antiga para a mais nova
    nextCursor: null,
    lastTypingAt: 0,
    typingTimer: null,
  };

  async function api(method, path, body) {
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) {
      return null;
    }
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error?.message ?? json.message ?? `HTTP ${response.status}`);
    }
    return json.data;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text; // nunca innerHTML com dados do usuário
    }
    return node;
  }

  function otherParticipant(conversation) {
    return conversation.participants.find((p) => p.id !== state.user.id);
  }

  function conversationTitle(conversation) {
    if (conversation.type === 'group') {
      return conversation.name ?? 'Grupo';
    }
    const other = otherParticipant(conversation);
    return other ? (other.displayName ?? other.username) : 'Conversa';
  }

  function participantName(userId) {
    const participant = state.current?.participants.find((p) => p.id === userId);
    return participant ? (participant.displayName ?? participant.username) : 'alguém';
  }

  // ---------- sessão ----------

  function showChat() {
    $('login-view').hidden = true;
    $('chat-view').hidden = false;
    $('logout').hidden = false;
    $('me').textContent = state.user.displayName ?? state.user.username;
    connectSocket();
    void loadConversations();
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    $('login-error').textContent = '';
    try {
      const data = await api('POST', '/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      });
      state.token = data.tokens.accessToken;
      state.user = data.user;
      localStorage.setItem(TOKEN_KEY, state.token);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      showChat();
    } catch (error) {
      $('login-error').textContent = error.message;
    }
  });

  $('logout').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.socket?.disconnect();
    window.location.reload();
  });

  // ---------- socket ----------

  function connectSocket() {
    const socket = io({ auth: { token: state.token } });
    state.socket = socket;

    socket.on('connect', () => {
      $('connection').textContent = 'conectado';
      $('connection').classList.add('online');
      // Reconexão: o servidor restaura as rooms; o que chegou no intervalo vem pelo REST.
      if (state.current) {
        void openConversation(state.current.id);
      }
    });
    socket.on('disconnect', () => {
      $('connection').textContent = 'reconectando…';
      $('connection').classList.remove('online');
    });
    socket.on('connect_error', (error) => {
      $('connection').textContent = `erro: ${error.message}`;
      if (error.message === 'UNAUTHORIZED') {
        $('logout').click();
      }
    });

    socket.on('message:new', onMessageNew);
    socket.on('message:status', onMessageStatus);
    socket.on('message:deleted', ({ messageId }) => {
      const message = state.messages.find((m) => m.id === messageId);
      if (message) {
        message.content = null;
        message.deletedAt = new Date().toISOString();
        renderMessages();
      }
    });
    socket.on('typing:indicator', ({ conversationId, userId, isTyping }) => {
      if (state.current?.id === conversationId) {
        $('typing').textContent = isTyping ? `${participantName(userId)} está digitando…` : '';
      }
    });
    socket.on('conversation:new', () => void loadConversations());
    socket.on('conversation:updated', () => void loadConversations());
    socket.on('conversation:deleted', ({ conversationId }) => {
      if (state.current?.id === conversationId) {
        state.current = null;
        $('conversation').hidden = true;
      }
      void loadConversations();
    });
  }

  function onMessageNew(message) {
    const fromOther = message.senderId !== state.user.id;
    if (fromOther) {
      state.socket.emit('message:delivered', {
        conversationId: message.conversationId,
        messageId: message.id,
      });
    }
    void loadConversations();

    if (state.current?.id !== message.conversationId) {
      return;
    }
    // Deduplica: o remetente também recebe message:new (e já tem a otimista pelo clientMessageId).
    const index = state.messages.findIndex(
      (m) =>
        m.id === message.id ||
        (message.clientMessageId !== null && m.clientMessageId === message.clientMessageId)
    );
    if (index === -1) {
      state.messages.push(message);
    } else {
      state.messages[index] = message;
    }
    renderMessages();
    if (fromOther) {
      markRead();
    }
  }

  function onMessageStatus(status) {
    if (state.current?.id !== status.conversationId) {
      return;
    }
    if (status.type === 'delivered') {
      const message = state.messages.find((m) => m.id === status.messageId);
      message?.status.deliveredTo.push({ userId: status.userId, at: status.at });
    } else {
      const upTo = state.messages.findIndex((m) => m.id === status.upToMessageId);
      state.messages.slice(0, upTo + 1).forEach((m) => {
        if (m.senderId !== status.userId && !m.status.readBy.some((r) => r.userId === status.userId)) {
          m.status.readBy.push({ userId: status.userId, at: status.at });
        }
      });
    }
    renderMessages();
  }

  // ---------- conversas ----------

  async function loadConversations() {
    const page = await api('GET', '/conversations?limit=100');
    state.conversations = page.items;
    const list = $('conversations');
    list.replaceChildren(
      ...page.items.map((conversation) => {
        const item = el('li', state.current?.id === conversation.id ? 'active' : '', conversationTitle(conversation));
        item.addEventListener('click', () => void openConversation(conversation.id));
        return item;
      })
    );
  }

  async function openConversation(conversationId) {
    state.current = await api('GET', `/conversations/${conversationId}`);
    const page = await api('GET', `/conversations/${conversationId}/messages`);
    state.messages = page.messages.reverse();
    state.nextCursor = page.nextCursor;
    $('conversation').hidden = false;
    $('conversation-title').textContent = conversationTitle(state.current);
    $('typing').textContent = '';
    renderMessages(true);
    markRead();
    void loadConversations();
  }

  $('load-more').addEventListener('click', async () => {
    const page = await api(
      'GET',
      `/conversations/${state.current.id}/messages?before=${state.nextCursor}`
    );
    state.messages = [...page.messages.reverse(), ...state.messages];
    state.nextCursor = page.nextCursor;
    renderMessages();
  });

  $('search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = new FormData(event.target).get('query');
    const users = await api('GET', `/users/search?query=${encodeURIComponent(query)}`);
    $('search-results').replaceChildren(
      ...users.map((user) => {
        const item = el('li', '', `+ ${user.displayName ?? user.username}`);
        item.addEventListener('click', async () => {
          const conversation = await api('POST', '/conversations/direct', { userId: user.id });
          $('search-results').replaceChildren();
          await openConversation(conversation.id);
        });
        return item;
      })
    );
  });

  // ---------- mensagens ----------

  function ticks(message) {
    const others = state.current.participants.length - 1;
    if (message.status.readBy.length >= others) {
      return ['✓✓', 'ticks read'];
    }
    if (message.status.deliveredTo.length >= others) {
      return ['✓✓', 'ticks'];
    }
    return ['✓', 'ticks'];
  }

  function renderMessages(scrollToEnd = false) {
    const list = $('messages');
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 10;
    list.replaceChildren(
      ...state.messages.map((message) => {
        const mine = message.senderId === state.user.id;
        const classes = [mine ? 'mine' : '', message.pending ? 'pending' : '', message.deletedAt ? 'deleted' : ''];
        const item = el('li', classes.join(' ').trim());
        item.append(el('span', '', message.deletedAt ? 'mensagem apagada' : message.content.text));
        const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        item.append(el('span', 'meta', time));
        if (mine && !message.pending) {
          const [symbol, className] = ticks(message);
          item.append(el('span', className, symbol));
        }
        return item;
      })
    );
    $('load-more').hidden = state.nextCursor === null;
    if (scrollToEnd || atBottom) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function markRead() {
    const lastFromOthers = [...state.messages].reverse().find((m) => m.senderId !== state.user.id && !m.pending);
    if (lastFromOthers && document.visibilityState === 'visible') {
      state.socket.emit('message:read', {
        conversationId: state.current.id,
        messageId: lastFromOthers.id,
      });
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (state.current) {
      markRead();
    }
  });

  $('message-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.target.elements.text;
    const text = input.value.trim();
    if (!text || !state.current) {
      return;
    }
    input.value = '';
    stopTyping();

    const clientMessageId = crypto.randomUUID();
    const optimistic = {
      id: `pending-${clientMessageId}`,
      clientMessageId,
      senderId: state.user.id,
      conversationId: state.current.id,
      content: { type: 'text', text },
      createdAt: new Date().toISOString(),
      deletedAt: null,
      status: { deliveredTo: [], readBy: [] },
      pending: true,
    };
    state.messages.push(optimistic);
    renderMessages(true);

    state.socket.emit(
      'message:send',
      { conversationId: state.current.id, text, clientMessageId },
      (ack) => {
        const index = state.messages.findIndex((m) => m.clientMessageId === clientMessageId);
        if (ack.ok) {
          if (index !== -1) {
            state.messages[index] = ack.data;
          }
        } else {
          state.messages.splice(index, 1);
          window.alert(`Falha ao enviar: ${ack.error.message}`);
        }
        renderMessages();
      }
    );
  });

  // ---------- digitação (apenas 1:1) ----------

  function stopTyping() {
    if (state.typingTimer !== null) {
      clearTimeout(state.typingTimer);
      state.typingTimer = null;
      state.lastTypingAt = 0;
      state.socket.emit('typing:stop', { conversationId: state.current.id });
    }
  }

  $('message-form').elements.text.addEventListener('input', () => {
    if (!state.current || state.current.type !== 'direct') {
      return;
    }
    const now = Date.now();
    if (now - state.lastTypingAt > TYPING_RENEW_MS) {
      state.lastTypingAt = now;
      state.socket.emit('typing:start', { conversationId: state.current.id });
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(stopTyping, 2 * TYPING_RENEW_MS);
  });

  if (state.token && state.user) {
    showChat();
  }
})();
```

Run: `node --check public/demo/app.js` → sem saída (sintaxe ok). `public/` não entra no ESLint (`**/*.js` ignorado) nem no Prettier do CI.

- [ ] **Step 3: Montar o estático no app**

Em `src/app.ts`: acrescentar `import path from 'path';` como primeira linha; logo depois da linha `const env: Environment = ...`, acrescentar:

```ts
/** Cliente demo estático (HTML + JS puro); resolvido a partir da raiz do projeto (cwd). */
const DEMO_DIR = path.resolve(process.cwd(), 'public', 'demo');
```

e trocar

```ts
app.use(requestLogger);

app.use('/api', getRateLimiter());
```

por

```ts
app.use(requestLogger);

app.use('/demo', express.static(DEMO_DIR));

app.use('/api', getRateLimiter());
```

- [ ] **Step 4: Rodar os testes e a verificação completa**

Run: `node node_modules/.bin/jest tests/unit/app.test.ts --coverage=false` → PASS. Depois a **verificação completa**.

- [ ] **Step 5: Commit**

```bash
node node_modules/.bin/prettier --write src/app.ts tests/unit/app.test.ts
git add public/demo/index.html public/demo/app.js public/demo/styles.css src/app.ts tests/unit/app.test.ts
git commit -m "✨ feat: adiciona cliente demo em /demo com chat em tempo real"
```

---

### Task 17: Verificação completa, smoke na stack real, READMEs, SRS local e PR

**Files:**
- Modify: `README.md`, `README.pt-BR.md`
- Modify (local, NÃO commitar): `.github/SRS.md`
- Create (fora do repo, no seu diretório de scratchpad): `smoke-realtime.sh`, `smoke-rt-ana.cjs`, `smoke-rt-bob.cjs`, `pr-body.md`

Defina antes: `export SCRATCH=<seu diretório de scratchpad da sessão>` (arquivos temporários nunca vão para o repo).

- [ ] **Step 1: Suíte completa + lint + format + tipos + build + open handles**

```bash
node node_modules/.bin/jest --silent --coverageReporters=text-summary
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/tsc --noEmit
npm run build && rm -rf dist
node node_modules/.bin/jest tests/feature/modules/realtime tests/unit/modules/realtime --coverage=false --detectOpenHandles
```

Expected: todas as suítes passam (esperado ≈ 2.509 testes em 166 suítes — anote os números exatos impressos para os READMEs); resumo 100% statements/branches/functions/lines; eslint sai com código 0; Prettier "All matched files use Prettier code style!"; `tsc` e `build` sem erros; a rodada com `--detectOpenHandles` termina sozinha, sem listar handles.

- [ ] **Step 2: Conferir 100% nos arquivos novos/alterados**

```bash
node node_modules/.bin/jest --coverage --coverageReporters=text \
  --collectCoverageFrom='src/modules/realtime/**/*.ts' \
  --collectCoverageFrom='src/modules/chat/**/*.ts' \
  --collectCoverageFrom='src/shared/event-bus/*.ts' \
  --collectCoverageFrom='src/shared/middlewares/cors.ts' \
  --collectCoverageFrom='src/app.ts' \
  --coverageThreshold='{}'
```

Expected: 100% em todas as colunas de todos os arquivos listados. Faltou algo → acrescentar teste no arquivo de teste da task que criou o código e commitar como `✅ test: …`.

- [ ] **Step 3: Subir os bancos em portas alternativas e rodar as migrations (volumes novos)**

```bash
set -a && source .env && set +a
export POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301
docker compose up -d postgres redis mongodb elasticsearch
docker compose ps
DB_HOST=localhost DB_PORT=15532 npm run db:migrate
```

Expected: `rtm-postgres`, `rtm-redis`, `rtm-mongodb`, `rtm-elasticsearch` "Up" nas portas 15532/16390/27117/9201 e todas as migrations aplicadas (este subprojeto não cria migrations novas: os campos de status vivem no MongoDB). Não subir `real-time-app` (rtm-app não funciona) e não tocar em nenhum outro container. O `.env` só é lido (`source`), nunca escrito.

- [ ] **Step 4: Subir a app no host na porta 3100 (em background, com o Redis adapter ligado)**

Confirme antes que a porta 3100 está livre (`ss -ltn | grep ':3100 '` sem saída) — há outros projetos rodando na máquina; não encerre processos que não são seus.

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

`NODE_ENV` vem do `.env` (`development`), então `shouldUseRedisAdapter` liga o `@socket.io/redis-adapter`. Aguarde a app responder (polling com a ferramenta de espera do seu ambiente, não `sleep` em primeiro plano) até `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/api/conversations` imprimir `401`. Se o processo morrer, ver `$SCRATCH/rtm-app.log`.

- [ ] **Step 5: Criar os dois clientes Node do smoke**

Criar `$SCRATCH/smoke-rt-bob.cjs` (processo do Bob: confirma entrega, lê mensagens `read:*`, registra digitação e sai no `bye`):

```js
// Cliente "Bob" do smoke de tempo real (processo separado). Uso:
//   NODE_PATH=$PWD/node_modules node smoke-rt-bob.cjs <baseUrl> <token> <bobId>
// Confirma entrega de toda mensagem de outro autor, lê as que começam com "read:", registra
// indicadores de digitação e sai ao receber "bye".
const { io } = require('socket.io-client');

const [baseUrl, token, bobId] = process.argv.slice(2);
const log = (...args) => console.log('[bob]', ...args);
let typingOnAt = 0;

const socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });
const safety = setTimeout(() => {
  log('TIMEOUT');
  process.exit(1);
}, 30_000);

socket.on('connect', () => log('ready'));
socket.on('connect_error', (error) => log(`connect_error=${error.message}`));

socket.on('message:new', async (message) => {
  if (message.senderId === bobId) {
    return;
  }
  const latencyMs = Date.now() - Date.parse(message.createdAt);
  log(`message:new text=${message.content.text} latency<100ms=${latencyMs < 100}`);

  const target = { conversationId: message.conversationId, messageId: message.id };
  const delivered = await socket.emitWithAck('message:delivered', target);
  log(`delivered-ack=${delivered.ok}`);
  if (message.content.text.startsWith('read:')) {
    const read = await socket.emitWithAck('message:read', target);
    log(`read-ack=${read.ok}`);
  }
  if (message.content.text === 'bye') {
    clearTimeout(safety);
    socket.disconnect();
  }
});

socket.on('typing:indicator', ({ userId, isTyping }) => {
  if (isTyping) {
    typingOnAt = Date.now();
    log(`typing userId-ok=${userId !== bobId} isTyping=true`);
  } else {
    const after = Date.now() - typingOnAt;
    log(`typing isTyping=false after~3s=${after >= 2900 && after < 4000} (${String(after)}ms)`);
  }
});

socket.on('conversation:new', ({ type }) => log(`conversation:new type=${type}`));
```

Criar `$SCRATCH/smoke-rt-ana.cjs` (processo da Ana: envio idempotente, status, digitação com expiração real de 3s, reconexão, grupo sem typing):

```js
// Cliente "Ana" do smoke de tempo real. Uso:
//   NODE_PATH=$PWD/node_modules node smoke-rt-ana.cjs <baseUrl> <token> <conversationId> <bobId>
// Envia (com idempotência), espera os status do Bob, testa digitação (inclusive expiração de
// 3s), reconexão automática e typing recusado em grupo; termina com "bye".
const { io } = require('socket.io-client');
const { randomUUID } = require('crypto');

const [baseUrl, token, conversationId, bobId] = process.argv.slice(2);
const log = (...args) => console.log('[ana]', ...args);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function next(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), 10_000);
    const listener = (payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, listener);
        resolve(payload);
      }
    };
    socket.on(event, listener);
  });
}

async function main() {
  const socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnectionDelay: 100,
    reconnectionDelayMax: 200,
  });
  await next(socket, 'connect');
  log('connected');

  // 1. envio idempotente (o listener do "entregue" já fica pronto antes do envio)
  const deliveredStatus = next(socket, 'message:status', (s) => s.type === 'delivered');
  const clientMessageId = randomUUID();
  const first = await socket.emitWithAck('message:send', { conversationId, text: 'm1', clientMessageId });
  const retry = await socket.emitWithAck('message:send', { conversationId, text: 'm1', clientMessageId });
  log(`send-ack=${first.ok} idempotent=${first.ok && retry.ok && first.data.id === retry.data.id}`);

  // 2. entregue (só o remetente recebe)
  const delivered = await deliveredStatus;
  log(`status=delivered by-bob=${delivered.userId === bobId} message-ok=${delivered.messageId === first.data.id}`);

  // 3. lida (a room recebe)
  const readStatus = next(socket, 'message:status', (s) => s.type === 'read');
  const second = await socket.emitWithAck('message:send', { conversationId, text: 'read:m2' });
  const read = await readStatus;
  log(`status=read by-bob=${read.userId === bobId} upTo-ok=${read.upToMessageId === second.data.id}`);

  // 4. digitação: expira sozinha em ~3s; depois start + stop explícito
  await socket.emitWithAck('typing:start', { conversationId });
  await wait(3500);
  await socket.emitWithAck('typing:start', { conversationId });
  await wait(300);
  const stop = await socket.emitWithAck('typing:stop', { conversationId });
  log(`typing-stop-ack=${stop.ok}`);

  // 5. reconexão automática: derruba o transporte; o handshake refeito restaura as rooms
  const reconnected = next(socket, 'connect');
  socket.io.engine.close();
  await reconnected;
  const own = next(socket, 'message:new', (m) => m.content.text === 'after-reconnect');
  await socket.emitWithAck('message:send', { conversationId, text: 'after-reconnect' });
  await own;
  log('reconnected=true rooms-restored=true');

  // 6. grupo criado via REST: Bob recebe conversation:new; typing em grupo é recusado (400)
  const response = await fetch(`${baseUrl}/api/conversations/group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Smoke', participantIds: [bobId] }),
  });
  const group = (await response.json()).data;
  await wait(200);
  const groupTyping = await socket.emitWithAck('typing:start', { conversationId: group.id });
  log(`group-typing-status=${groupTyping.ok ? 'ok' : groupTyping.error.statusCode}`);

  await socket.emitWithAck('message:send', { conversationId, text: 'bye' });
  await wait(300);
  socket.disconnect();
}

main().then(
  () => process.exit(0),
  (error) => {
    log(`FAIL ${error.message}`);
    process.exit(1);
  }
);
```

Criar `$SCRATCH/smoke-realtime.sh` (orquestra: registra os usuários, cria a conversa, testa o handshake, sobe o Bob em background, roda a Ana e confere REST/demo):

```bash
#!/usr/bin/env bash
# Smoke do tempo real contra a app no host (:3100). Uso: bash smoke-realtime.sh
# Rode a partir da raiz do repositório (usa node_modules/socket.io-client).
set -euo pipefail

SCRATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE=http://localhost:3100
API=$BASE/api
SUFFIX=$(date +%s)
CT='Content-Type: application/json'
export NODE_PATH="$PWD/node_modules"

j() { node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }
reg() {
  curl -s -X POST "$API/auth/register" -H "$CT" \
    -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"Password123!\",\"displayName\":\"$1\"}"
}

ANA=$(reg "rtana$SUFFIX")
BOB=$(reg "rtbob$SUFFIX")
A_ID=$(echo "$ANA" | j 'd.data.user.id')
B_ID=$(echo "$BOB" | j 'd.data.user.id')
A_TOKEN=$(echo "$ANA" | j 'd.data.tokens.accessToken')
B_TOKEN=$(echo "$BOB" | j 'd.data.tokens.accessToken')

CONV=$(curl -s -X POST "$API/conversations/direct" -H "Authorization: Bearer $A_TOKEN" -H "$CT" \
  -d "{\"userId\":\"$B_ID\"}" | j 'd.data.id')

# handshake sem token / token inválido
node -e "
const { io } = require('socket.io-client');
const check = (auth) => new Promise((resolve) => {
  const s = io('$BASE', { auth, transports: ['websocket'], reconnection: false });
  s.on('connect_error', (e) => { s.close(); resolve(e.message); });
  s.on('connect', () => { s.close(); resolve('CONNECTED'); });
});
Promise.all([check({}), check({ token: 'invalido' })]).then(([a, b]) => console.log('handshake-no-token=' + a + ' handshake-bad-token=' + b));
"

# Bob em outro processo; espera ficar pronto
node "$SCRATCH_DIR/smoke-rt-bob.cjs" "$BASE" "$B_TOKEN" "$B_ID" > "$SCRATCH_DIR/bob.log" 2>&1 &
BOB_PID=$!
for _ in $(seq 1 50); do grep -q '\[bob\] ready' "$SCRATCH_DIR/bob.log" && break; sleep 0.2; done

node "$SCRATCH_DIR/smoke-rt-ana.cjs" "$BASE" "$A_TOKEN" "$CONV" "$B_ID"
wait "$BOB_PID"
cat "$SCRATCH_DIR/bob.log"

# REST: POST /read e status persistido; cliente demo e bundle do Socket.IO servidos
LAST=$(curl -s "$API/conversations/$CONV/messages?limit=1" -H "Authorization: Bearer $B_TOKEN" | j 'd.data.messages[0].id')
curl -s -o /dev/null -w "rest-read=%{http_code}\n" -X POST "$API/conversations/$CONV/read" \
  -H "Authorization: Bearer $B_TOKEN" -H "$CT" -d "{\"messageId\":\"$LAST\"}"
curl -s "$API/conversations/$CONV/messages" -H "Authorization: Bearer $A_TOKEN" \
  | j '"all-read-by-bob="+d.data.messages.filter(m=>m.senderId==="'"$A_ID"'").every(m=>m.status.readBy.some(r=>r.userId==="'"$B_ID"'"))'
curl -s -o /dev/null -w "demo=%{http_code}\n" "$BASE/demo/"
curl -s -o /dev/null -w "socket-io-bundle=%{http_code}\n" "$BASE/socket.io/socket.io.js"
echo "CONV=$CONV"
```

- [ ] **Step 6: Rodar o smoke (da raiz do repositório)**

```bash
bash "$SCRATCH/smoke-realtime.sh"
```

Expected (o UUID de `CONV` e os milissegundos entre parênteses variam; `after~3s` do segundo indicador é `false` de propósito — foi um `typing:stop` explícito ~300 ms depois):

```
handshake-no-token=UNAUTHORIZED handshake-bad-token=UNAUTHORIZED
[ana] connected
[ana] send-ack=true idempotent=true
[ana] status=delivered by-bob=true message-ok=true
[ana] status=read by-bob=true upTo-ok=true
[ana] typing-stop-ack=true
[ana] reconnected=true rooms-restored=true
[ana] group-typing-status=400
[bob] ready
[bob] message:new text=m1 latency<100ms=true
[bob] delivered-ack=true
[bob] message:new text=read:m2 latency<100ms=true
[bob] delivered-ack=true
[bob] read-ack=true
[bob] typing userId-ok=true isTyping=true
[bob] typing isTyping=false after~3s=true (3001ms)
[bob] typing userId-ok=true isTyping=true
[bob] typing isTyping=false after~3s=false (302ms)
[bob] message:new text=after-reconnect latency<100ms=true
[bob] delivered-ack=true
[bob] conversation:new type=group
[bob] message:new text=bye latency<100ms=true
[bob] delivered-ack=true
rest-read=204
all-read-by-bob=true
demo=200
socket-io-bundle=200
CONV=<uuid>
```

Divergências e o que investigar (corrigir com TDD na task de origem, commitar e repetir o smoke):
- `handshake-*` ≠ `UNAUTHORIZED` → `socketAuth` (Task 9).
- `[bob] TIMEOUT` ou nenhum `message:new` → rooms do handshake (`joinRooms`, Task 9) ou ponte (Task 13); confira no log da app erros de `getUserConversationIds`.
- `idempotent=false` → índice parcial/`create` (Task 4) ou `send` (Task 5); `status=*` ausente → `markDelivered`/`markRead` (Task 6) ou ponte (Task 13).
- `after~3s=false` no primeiro indicador → `TypingService`/`TYPING_TTL_MS` (Tasks 8/10).
- `rooms-restored` não aparece → reconexão não refez o handshake/rooms (Task 9).
- `conversation:new` ausente → `CONVERSATION_CREATED` na ponte (Task 13).
- 429 no `register` → o limiter de auth (5 req/15 min por IP) já foi consumido: `docker exec rtm-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB` (só o Redis deste projeto) e rodar de novo.

- [ ] **Step 7: Conferir índice do MongoDB, `last_read_at` e o Redis adapter**

```bash
docker exec rtm-mongodb mongosh --quiet -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin "$MONGO_DB" \
  --eval 'db.messages.getIndexes().map(i => i.name + (i.partialFilterExpression ? " partial=" + JSON.stringify(i.partialFilterExpression) : "") + (i.unique ? " unique" : "")).join(",")'
docker exec rtm-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) > 0 FROM participants WHERE last_read_at IS NOT NULL"
docker exec rtm-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning PUBSUB CHANNELS 'socket.io*'
```

Expected: `_id_,conversationId_1_createdAt_-1__id_-1,senderId_1_clientMessageId_1 partial={"clientMessageId":{"$type":"string"}} unique`; `t`; canais `socket.io-request#/#`, `socket.io-response#/#` e `socket.io-response#/#<uid>#` (adapter ativo).

- [ ] **Step 8: Encerramento gracioso**

```bash
kill -TERM "$(cat "$SCRATCH/rtm-app.pid")"
```

Aguarde (ferramenta de espera, não `sleep`) até `kill -0 "$(cat "$SCRATCH/rtm-app.pid")" 2>/dev/null` falhar. Expected: `$SCRATCH/rtm-app.log` termina com `SIGTERM recebido: encerrando o servidor` e o processo sai sozinho (código 0) em poucos segundos. Use o PID salvo — nunca `pkill`/`pgrep -f` com padrão genérico (há processos de outros projetos, inclusive `tsx watch src/server.ts` do repositório principal). Os containers `rtm-*` podem ficar de pé (ou `docker compose stop postgres redis mongodb elasticsearch`); nunca `down -v`.

- [ ] **Step 9 (opcional): Demo no navegador**

Com a app de pé (Step 4), abrir `http://localhost:3100/demo/` em duas janelas (uma anônima), logar com os usuários do smoke (`rtana<SUFFIX>@example.com` / `Password123!`), trocar mensagens e observar ✓/✓✓/✓✓ azul e "digitando…". Não é critério de aceite (spec §11).

- [ ] **Step 10: Atualizar `README.md`**

Cada item é uma substituição literal (trecho atual → trecho novo). Os totais de testes vêm do Step 1.

1. Hero (linha 5) — trocar:

```text
Express 5 API with token auth, user profiles, contacts and a REST chat today; WebSocket delivery, presence, notifications and search on the way
```

por:

```text
Express 5 API with token auth, user profiles, contacts and chat — REST plus real-time delivery over Socket.IO with delivered/read receipts and typing indicators — today; presence, notifications and search on the way
```

2. Badge — trocar `tests-2335%20Jest` pelo total do Step 1 (ex.: `tests-2509%20Jest`).

3. Aviso — trocar a linha inteira que começa com `> **Work in progress.**` por:

```markdown
> **Work in progress.** Authentication, profiles, contacts/blocks and chat (1:1 and group conversations, messages in MongoDB) are implemented and tested, over REST and in real time over Socket.IO — delivered/read receipts, typing indicators and a minimal demo client at `/demo`. Presence and caching are the next milestone — see the [roadmap](#roadmap).
```

4. Architecture — substituir o conteúdo do bloco mermaid por:

```text
flowchart LR
    C[Client] -->|HTTP · Bearer JWT| API[Express 5 API]
    C <-->|WebSocket · JWT handshake| RT[realtime module<br/>Socket.IO]
    API --> AUTH[auth module]
    API --> USER[user module]
    API --> CHAT[chat module]
    RT --> CHAT
    API -.-> NOTIF[notifications]
    API -.-> SEARCH[search]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER & RT --> RD[(Redis<br/>rate limit · Socket.IO adapter)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>structured logs)]
    CHAT --> MG[(MongoDB<br/>messages)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT --> EB{{EventBus}}
    EB --> RT

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF,SEARCH,ES planned
```

5. Chat — trocar a linha:

```text
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions? }` — text 1–10,000 characters; 403 in a 1:1 conversation where either side blocked the other |
```

por:

```text
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions?, clientMessageId? }` — text 1–10,000 characters; 403 in a 1:1 conversation where either side blocked the other; resending the same `clientMessageId` (client-generated UUID) returns the stored message instead of a duplicate (409 if that id was used in another conversation) |
```

e, logo depois da linha do `DELETE` `/:id/messages/:messageId`, acrescentar:

```text
| `POST` | `/:id/read` | ✓ | `{ messageId }` — marks every message from others up to and including `messageId` as read (and delivered), advances the caller's `last_read_at`; 204 |
```

6. Chat — substituir o parágrafo que começa com `Messages live only in MongoDB` por:

```markdown
Messages live only in MongoDB (`messages` collection, indexes `{ conversationId: 1, createdAt: -1, _id: -1 }` and a unique partial `{ senderId: 1, clientMessageId: 1 }` for idempotent sends); conversations and participants live in PostgreSQL. Every message carries `clientMessageId` and `status: { sentAt, deliveredTo[], readBy[] }` (entries are `{ userId, at }`; deleted messages keep their status). Leaving, removing and adding members run inside a transaction that locks the conversation row (`SELECT … FOR UPDATE`), so concurrent changes can't skip the admin promotion or overflow the 256-member limit. The module publishes `chat:conversation-created`, `chat:conversation-updated`, `chat:conversation-deleted` (when the last member leaves and the conversation is removed), `chat:message-sent` (payload carries the same `MessageDTO` returned to the REST client), `chat:message-deleted`, `chat:message-delivered` and `chat:message-read` on the EventBus. Listeners registered at bootstrap update `contacts.last_interaction_at` on every direct message and best-effort delete the conversation's messages in MongoDB on `chat:conversation-deleted`; both run off the request path (`{ async: true }` subscribers).
```

7. Real-time — inserir imediatamente antes da linha `### Rate limiting`:

````markdown
### Real-time — Socket.IO

Socket.IO shares the HTTP server and port (`http://localhost:3000`, path `/socket.io/`). Connect with the access token in the handshake — `io(url, { auth: { token } })` (preferred) or an `Authorization: Bearer <token>` header; a missing or invalid token fails with `connect_error` and `message: 'UNAUTHORIZED'`. During the handshake the socket joins `user:<id>` and `conversation:<id>` for each of the user's conversations, so every automatic reconnection restores the rooms; messages sent while disconnected are fetched over REST (`GET /api/conversations/:id/messages?before=`). CORS follows the HTTP policy (`ALLOWED_ORIGINS` in production).

Client → server events (every one accepts an ack):

| Event | Payload | Effect / ack `data` |
|---|---|---|
| `message:send` | `{ conversationId, text, replyTo?, mentions?, clientMessageId? }` | Same rules as `POST /messages` (idempotent by `clientMessageId`); ack carries the `MessageDTO` |
| `message:delivered` | `{ conversationId, messageId }` | Marks the message as delivered to the caller (no-op for the author); `null` |
| `message:read` | `{ conversationId, messageId }` | Same as `POST /:id/read`; `null` |
| `typing:start` | `{ conversationId }` | 1:1 conversations only (groups → 400); expires after 3 s without a new `start`; `null` |
| `typing:stop` | `{ conversationId }` | Ends the indicator; `null` |

Server → client events:

| Event | Room | Payload |
|---|---|---|
| `message:new` | conversation | `MessageDTO` (the sender gets it too — dedupe by `id`/`clientMessageId`) |
| `message:deleted` | conversation | `{ conversationId, messageId }` |
| `message:status` | sender (`delivered`) · conversation (`read`) | `{ type: 'delivered', conversationId, messageId, userId, at }` · `{ type: 'read', conversationId, userId, upToMessageId, at }` |
| `typing:indicator` | conversation, except the typist | `{ conversationId, userId, isTyping }` |
| `conversation:new` | conversation + participants | `{ conversationId, type }` — participants' sockets join the room automatically |
| `conversation:updated` | conversation + affected users | `{ conversationId, change, actorId, affectedUserIds, name? }` — added members join, removed/leaving members leave the room |
| `conversation:deleted` | conversation + former participants | `{ conversationId }` |

Acks are `{ ok: true, data }` or `{ ok: false, error: { code, message, statusCode, details? } }`, with the same codes as the REST API (`VALIDATION_ERROR` 400, `NOT_FOUND` 404, `USER_BLOCKED` 403, …; unexpected failures → `INTERNAL_ERROR` 500). Horizontal scaling uses `@socket.io/redis-adapter` on two duplicated Redis connections; it is on outside `NODE_ENV=test` unless `REALTIME_REDIS_ADAPTER=false`. The EventBus → Socket.IO bridge is registered when the server starts, and `SIGTERM`/`SIGINT` close sockets, the adapter connections and the stores gracefully.

**Demo client** — `http://localhost:3000/demo/` is a single static page (plain JS, no build) to log in, list and open conversations, start a 1:1 chat by searching users, and watch messages, ✓ sent / ✓✓ delivered / ✓✓ (blue) read and "typing…" live. It keeps the access token in `localStorage`; it's a demo, not a production client.
````

8. Middleware bullet (Shared infrastructure) — trocar `Helmet, CORS, request id,` por `Helmet, CORS (shared with Socket.IO), request id,`.

9. EventBus bullet — trocar ``(e.g. auth events, `user:blocked` / `user:unblocked`, `chat:message-sent`) through it.`` por ``(e.g. auth events, `user:blocked` / `user:unblocked`, `chat:message-sent`) through it; `{ async: true }` subscribers run off the publisher's path.``.

10. Running the app — trocar a linha:

```text
The API listens on `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` by default).
```

por:

```text
The API listens on `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` by default); Socket.IO shares the same port (`/socket.io/`) and the demo client is at `http://localhost:${APP_HOST_PORT:-3000}/demo/`.
```

11. Tests — trocar `2,335 Jest tests in 145 suites (unit under `tests/unit`, HTTP feature tests with supertest under `tests/feature`)` pelos números do Step 1 e a nova descrição, ex.: `2,509 Jest tests in 166 suites (unit under `tests/unit`; HTTP feature tests with supertest and WebSocket integration tests with socket.io-client under `tests/feature`)`.

12. Project structure — trocar `├── server.ts                 entry point` por `├── server.ts                 entry point: HTTP server + Socket.IO, graceful shutdown`; trocar:

```text
│   └── chat/                 Conversation and Message controllers · services ·
│                             repositories (PostgreSQL + MongoDB) · models ·
│                             listeners · validation · routes
```

por:

```text
│   ├── chat/                 Conversation and Message controllers · services ·
│   │                         repositories (PostgreSQL + MongoDB) · models ·
│   │                         listeners · validation · routes
│   └── realtime/             Socket.IO server · handshake middlewares ·
│                             message/typing handlers · TypingService ·
│                             EventBus → rooms bridge
```

e trocar:

```text
tests/
├── unit/                     mirrors src/
```

por:

```text
public/
└── demo/                     static demo client (HTML + plain JS), served at /demo
tests/
├── unit/                     mirrors src/
```

13. Configuration — acrescentar depois da linha do `TRUST_PROXY`:

```text
| `ALLOWED_ORIGINS` | Comma-separated CORS origins in production (HTTP and Socket.IO); any origin is allowed outside production |
| `REALTIME_REDIS_ADAPTER` | `false` keeps Socket.IO on the in-memory adapter (single instance); otherwise the Redis adapter is used outside `NODE_ENV=test` |
```

14. Roadmap — trocar `- [ ] Real-time — Socket.IO delivery, delivered/read receipts and typing indicators` por `- [x] Real-time — Socket.IO with JWT handshake and per-user/per-conversation rooms, idempotent sends, delivered/read receipts, typing indicators, Redis adapter and a demo client at /demo`, e `- [ ] Presence — online status and typing indicators through Redis pub/sub` por `- [ ] Presence and cache — online/offline status with heartbeat, conversation and profile caching on Redis`.

- [ ] **Step 11: Atualizar `README.pt-BR.md` (mesmas mudanças, em português)**

1. Hero — trocar:

```text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat via REST hoje; entrega via WebSocket, presença, notificações e busca a caminho
```

por:

```text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat — REST e entrega em tempo real via Socket.IO, com confirmações de entrega/leitura e indicador de digitação — hoje; presença, notificações e busca a caminho
```

2. Badge `testes-2335%20Jest` → total do Step 1.

3. Aviso — trocar a linha que começa com `> **Em desenvolvimento.**` por:

```markdown
> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios e chat (conversas 1:1 e em grupo, mensagens no MongoDB) estão implementados e testados, via REST e em tempo real via Socket.IO — confirmações de entrega/leitura, indicador de digitação e um cliente demo mínimo em `/demo`. Presença e cache são o próximo marco — veja o [roadmap](#roadmap).
```

4. Arquitetura — conteúdo do bloco mermaid:

```text
flowchart LR
    C[Cliente] -->|HTTP · Bearer JWT| API[API Express 5]
    C <-->|WebSocket · JWT no handshake| RT[módulo realtime<br/>Socket.IO]
    API --> AUTH[módulo auth]
    API --> USER[módulo user]
    API --> CHAT[módulo chat]
    RT --> CHAT
    API -.-> NOTIF[notificações]
    API -.-> SEARCH[busca]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER & RT --> RD[(Redis<br/>rate limit · adapter do Socket.IO)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>logs estruturados)]
    CHAT --> MG[(MongoDB<br/>mensagens)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT --> EB{{EventBus}}
    EB --> RT

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF,SEARCH,ES planned
```

5. Chat — trocar a linha:

```text
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions? }` — texto de 1 a 10.000 caracteres; 403 em conversa 1:1 com bloqueio em qualquer sentido |
```

por:

```text
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions?, clientMessageId? }` — texto de 1 a 10.000 caracteres; 403 em conversa 1:1 com bloqueio em qualquer sentido; reenviar o mesmo `clientMessageId` (UUID gerado pelo cliente) devolve a mensagem já gravada em vez de duplicar (409 se o id foi usado em outra conversa) |
```

e, logo depois da linha do `DELETE` `/:id/messages/:messageId`, acrescentar:

```text
| `POST` | `/:id/read` | ✓ | `{ messageId }` — marca como lidas (e entregues) todas as mensagens de outros autores até `messageId`, inclusive, e avança o `last_read_at` de quem pede; 204 |
```

6. Chat — substituir o parágrafo que começa com `As mensagens ficam só no MongoDB` por:

```markdown
As mensagens ficam só no MongoDB (coleção `messages`, índices `{ conversationId: 1, createdAt: -1, _id: -1 }` e um único parcial `{ senderId: 1, clientMessageId: 1 }` para envio idempotente); conversas e participantes ficam no PostgreSQL. Toda mensagem traz `clientMessageId` e `status: { sentAt, deliveredTo[], readBy[] }` (entradas `{ userId, at }`; mensagens apagadas mantêm o status). Sair, remover e adicionar membros rodam numa transação que trava a linha da conversa (`SELECT … FOR UPDATE`), então mudanças concorrentes não pulam a promoção de admin nem estouram o limite de 256 participantes. O módulo publica `chat:conversation-created`, `chat:conversation-updated`, `chat:conversation-deleted` (quando o último membro sai e a conversa é removida), `chat:message-sent` (o payload leva o mesmo `MessageDTO` devolvido ao cliente REST), `chat:message-deleted`, `chat:message-delivered` e `chat:message-read` no EventBus. Listeners registrados no bootstrap atualizam `contacts.last_interaction_at` a cada mensagem direta e apagam, best-effort, as mensagens da conversa no MongoDB ao receber `chat:conversation-deleted`; ambos rodam fora do caminho da requisição (subscribers `{ async: true }`).
```

7. Tempo real — inserir imediatamente antes da linha `### Rate limit`:

````markdown
### Tempo real — Socket.IO

O Socket.IO compartilha o servidor e a porta HTTP (`http://localhost:3000`, path `/socket.io/`). Conecte com o access token no handshake — `io(url, { auth: { token } })` (preferido) ou header `Authorization: Bearer <token>`; token ausente ou inválido falha com `connect_error` e `message: 'UNAUTHORIZED'`. No handshake o socket entra em `user:<id>` e em `conversation:<id>` de cada conversa do usuário, então toda reconexão automática restaura as rooms; mensagens enviadas enquanto o cliente estava desconectado são buscadas via REST (`GET /api/conversations/:id/messages?before=`). O CORS segue a política do HTTP (`ALLOWED_ORIGINS` em produção).

Eventos cliente → servidor (todos aceitam ack):

| Evento | Payload | Efeito / `data` do ack |
|---|---|---|
| `message:send` | `{ conversationId, text, replyTo?, mentions?, clientMessageId? }` | Mesmas regras do `POST /messages` (idempotente por `clientMessageId`); o ack traz a `MessageDTO` |
| `message:delivered` | `{ conversationId, messageId }` | Marca como entregue a quem chama (no-op para o autor); `null` |
| `message:read` | `{ conversationId, messageId }` | Igual ao `POST /:id/read`; `null` |
| `typing:start` | `{ conversationId }` | Só conversas 1:1 (grupo → 400); expira em 3 s sem novo `start`; `null` |
| `typing:stop` | `{ conversationId }` | Encerra o indicador; `null` |

Eventos servidor → cliente:

| Evento | Room | Payload |
|---|---|---|
| `message:new` | conversa | `MessageDTO` (o remetente também recebe — deduplique por `id`/`clientMessageId`) |
| `message:deleted` | conversa | `{ conversationId, messageId }` |
| `message:status` | remetente (`delivered`) · conversa (`read`) | `{ type: 'delivered', conversationId, messageId, userId, at }` · `{ type: 'read', conversationId, userId, upToMessageId, at }` |
| `typing:indicator` | conversa, exceto quem digita | `{ conversationId, userId, isTyping }` |
| `conversation:new` | conversa + participantes | `{ conversationId, type }` — os sockets dos participantes entram na room automaticamente |
| `conversation:updated` | conversa + usuários afetados | `{ conversationId, change, actorId, affectedUserIds, name? }` — quem é adicionado entra, quem sai/é removido deixa a room |
| `conversation:deleted` | conversa + ex-participantes | `{ conversationId }` |

Os acks são `{ ok: true, data }` ou `{ ok: false, error: { code, message, statusCode, details? } }`, com os mesmos códigos da API REST (`VALIDATION_ERROR` 400, `NOT_FOUND` 404, `USER_BLOCKED` 403, …; falhas inesperadas → `INTERNAL_ERROR` 500). A escala horizontal usa o `@socket.io/redis-adapter` sobre duas conexões Redis duplicadas; fica ligado fora de `NODE_ENV=test`, salvo `REALTIME_REDIS_ADAPTER=false`. A ponte EventBus → Socket.IO é registrada quando o servidor sobe, e `SIGTERM`/`SIGINT` encerram sockets, conexões do adapter e bancos de forma graciosa.

**Cliente demo** — `http://localhost:3000/demo/` é uma página estática única (JS puro, sem build) para logar, listar e abrir conversas, iniciar um 1:1 buscando usuários e ver ao vivo as mensagens, ✓ enviada / ✓✓ entregue / ✓✓ (azul) lida e "digitando…". Guarda o access token no `localStorage`; é uma demo, não um cliente de produção.
````

8. Middlewares (Infraestrutura compartilhada) — trocar `Helmet, CORS, request id,` por `Helmet, CORS (compartilhado com o Socket.IO), request id,`.

9. EventBus — trocar ``(ex.: eventos de auth, `user:blocked` / `user:unblocked`, `chat:message-sent`) por ele.`` por ``(ex.: eventos de auth, `user:blocked` / `user:unblocked`, `chat:message-sent`) por ele; subscribers `{ async: true }` rodam fora do caminho de quem publica.``.

10. Rodando a app — trocar:

```text
A API escuta em `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` por padrão).
```

por:

```text
A API escuta em `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` por padrão); o Socket.IO usa a mesma porta (`/socket.io/`) e o cliente demo fica em `http://localhost:${APP_HOST_PORT:-3000}/demo/`.
```

11. Testes — trocar `2.335 testes Jest em 145 suítes (unitários em `tests/unit`, testes de feature HTTP com supertest em `tests/feature`)` pelos números do Step 1 e a nova descrição, ex.: `2.509 testes Jest em 166 suítes (unitários em `tests/unit`; testes de feature HTTP com supertest e de integração WebSocket com socket.io-client em `tests/feature`)`.

12. Estrutura — trocar `├── server.ts                 ponto de entrada` por `├── server.ts                 ponto de entrada: servidor HTTP + Socket.IO, encerramento gracioso`; trocar:

```text
│   └── chat/                 controllers de Conversation e Message · services ·
│                             repositories (PostgreSQL + MongoDB) · models ·
│                             listeners · validação · rotas
```

por:

```text
│   ├── chat/                 controllers de Conversation e Message · services ·
│   │                         repositories (PostgreSQL + MongoDB) · models ·
│   │                         listeners · validação · rotas
│   └── realtime/             servidor Socket.IO · middlewares do handshake ·
│                             handlers de mensagem/digitação · TypingService ·
│                             ponte EventBus → rooms
```

e trocar:

```text
tests/
├── unit/                     espelha src/
```

por:

```text
public/
└── demo/                     cliente demo estático (HTML + JS puro), servido em /demo
tests/
├── unit/                     espelha src/
```

13. Configuração — acrescentar depois da linha do `TRUST_PROXY`:

```text
| `ALLOWED_ORIGINS` | Origens de CORS separadas por vírgula em produção (HTTP e Socket.IO); fora de produção qualquer origem é aceita |
| `REALTIME_REDIS_ADAPTER` | `false` mantém o Socket.IO no adapter em memória (uma instância); senão o Redis adapter é usado fora de `NODE_ENV=test` |
```

14. Roadmap — trocar `- [ ] Tempo real — entrega via Socket.IO, confirmações de entrega/leitura e indicador de digitação` por `- [x] Tempo real — Socket.IO com handshake JWT e rooms por usuário/conversa, envio idempotente, confirmações de entrega/leitura, indicador de digitação, Redis adapter e cliente demo em /demo`, e `- [ ] Presença — status online e indicador de digitação via Redis pub/sub` por `- [ ] Presença e cache — status online/offline com heartbeat, cache de conversas e perfis no Redis`.

Conferir: `grep -n "Socket.IO\|/demo\|/read" README.md README.pt-BR.md` lista as seções novas nos dois arquivos; as tabelas renderizam no preview do GitHub.

- [ ] **Step 12: Atualizar o SRS local (`.github/SRS.md` — NÃO commitar; está em `.git/info/exclude`)**

Na seção da Sprint 6: título → `### 📅 Sprint 6 (Semana 6): Real-Time com Socket.IO ✅`; tarefas:

```markdown
- [x] Configurar Socket.IO server (mesmo servidor HTTP, `createRealtimeServer`)
- [x] Implementar ChatGateway (autenticação WS) — JWT no handshake (`socketAuth`, mesma regra do HTTP)
- [x] Criar handlers de eventos (send, delivered, read) — com ack e envio idempotente por `clientMessageId`
- [x] Implementar rooms por conversa (e por usuário, restauradas a cada handshake)
- [x] Criar indicadores de digitação (1:1, expiram em 3s)
- [x] Implementar Redis Pub/Sub para escala horizontal (`@socket.io/redis-adapter`)
- [x] Criar sistema de reconexão automática (socket.io-client; o handshake refaz as rooms; histórico via REST)
- [x] Implementar testes de WebSocket (socket.io-client em porta efêmera; 100% de cobertura)
```

Conferir que o arquivo não aparece como staged: `git status --short .github` não deve listar `SRS.md`.

- [ ] **Step 13: Commitar a documentação**

```bash
git add README.md README.pt-BR.md
git commit -m "📝 docs: documenta o tempo real com Socket.IO, status de mensagens e o cliente demo"
git status --short
```

Expected: árvore limpa (exceto arquivos locais ignorados).

- [ ] **Step 14: Push e PR**

Criar `$SCRATCH/pr-body.md`:

```markdown
## Resumo
- Módulo `realtime`: Socket.IO no mesmo servidor HTTP, handshake com JWT (`auth.token` ou `Authorization: Bearer`), rooms `user:<id>` e `conversation:<id>` montadas no handshake (reconexão as restaura), CORS igual ao HTTP
- Eventos com ack (`{ ok, data | error }`): `message:send` (idempotente por `clientMessageId`), `message:delivered`, `message:read`, `typing:start`/`typing:stop` (1:1, expira em 3s)
- Ponte EventBus → sockets: `message:new`, `message:deleted`, `message:status` (delivered/read), `typing:indicator`, `conversation:new`/`updated`/`deleted` com `socketsJoin`/`socketsLeave`
- Escala horizontal com `@socket.io/redis-adapter` (desligável com `REALTIME_REDIS_ADAPTER=false`) e encerramento gracioso em SIGTERM/SIGINT
- Chat: `status { sentAt, deliveredTo, readBy }` e `clientMessageId` na `MessageDTO` (índice único parcial), `markDelivered`/`markRead` com `chat:message-delivered`/`chat:message-read`, `POST /api/conversations/:id/read`
- Pendências do subprojeto 2: `MessageDTO` em `src/shared` (camadas), listeners pesados como subscribers `{ async: true }`, `leave`/`removeMember`/`addMembers` sob `SELECT … FOR UPDATE`, `removeMember` publicando `chat:conversation-deleted` quando esvazia a conversa
- Cliente demo em `/demo` (HTML + JS puro)

## Requisitos
RF003.2 (via WebSocket), RF003.4, RF003.5

## Testes
- Unitários de todo o módulo realtime (socket/io falsos, fake timers) e das mudanças do chat/EventBus — 100% de cobertura
- Integração com `socket.io-client` em porta efêmera (handshake, entrega < 100 ms, status, digitação, reconexão, rooms via REST), sem open handles
- Smoke na stack real (portas alternativas, app em :3100, Redis adapter ativo): dois clientes Node em processos separados trocando mensagens, status, digitação (expiração real de 3s) e reconexão; `POST /read`, `/demo`, índice do MongoDB e canais do adapter conferidos
```

```bash
git push -u origin feature/realtime
gh pr create --base main --head feature/realtime \
  --title "✨ Sprint 6: tempo real com Socket.IO" \
  --body-file "$SCRATCH/pr-body.md"
```

Se `gh pr create` falhar (ex.: GraphQL/permissão), usar a API REST:

```bash
gh api repos/GabeSilvaDev/realtime-messaging-platform/pulls \
  -f title="✨ Sprint 6: tempo real com Socket.IO" \
  -f head=feature/realtime -f base=main \
  -F body=@"$SCRATCH/pr-body.md" --jq .html_url
```

Expected: URL do PR impressa. Acompanhar o CI (`gh pr checks --watch`); o merge fica a cargo do controlador depois do CI verde e da revisão.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** §2 dependências → Task 8; §3 estrutura → Tasks 8–14 (+ `errors/` pelo padrão de módulo do roadmap) e `server.ts`/`public/demo` → Tasks 14 e 16; §4 handshake (auth.token/Bearer, `UNAUTHORIZED`, `socket.data`, rooms, reconexão, CORS) → Tasks 9 e 14; §5 eventos cliente→servidor com ack e mapeamento de `AppError`/`INTERNAL_ERROR`, sem ack só log → Tasks 11–12; §6 status (modelo, `markDelivered`, `markRead` em lote + `deliveredTo` + `last_read_at`, eventos, `POST /read`, `EventMap`) → Tasks 4, 6 e 7; §6.1 idempotência (índice único parcial, REST e socket, `clientMessageId` na DTO) → Tasks 4, 5 e 11; §7 ponte → Task 13 (registrada via `createRealtimeServer` no `server.ts`, Task 14); §8 digitação (1:1, 3s, supressão de duplicados, stop/disconnect) → Tasks 10 e 12; §9 Redis adapter por env e encerramento → Task 14; §10 demo → Task 16; §11 testes unitários, integração com `socket.io-client` e smoke real com dois clientes Node → Tasks 1–16 e 15/17; §12 docs → Task 17; §13 pendências (removeMember `deleted` + JSDoc, camadas, listeners assíncronos, `SELECT … FOR UPDATE`) → Tasks 1, 2 e 3.
- **Placeholders:** nenhum "TBD"/"implementar depois"; todo código de `src`, `tests`, `public` e dos scripts de smoke está completo. Os únicos valores preenchidos na execução são medidos (totais de testes no Step 1 da Task 17, `$SCRATCH`, UUIDs do smoke).
- **Consistência de tipos/nomes:** `ChatTransaction`/`withLock`, `CreateMessageResult`, `MessageStatusEntry`/`MessageStatusDTO`, `findByClientMessageId`/`markDelivered`/`markReadUpTo`/`advanceLastReadAt`, `ClientMessageIdConflictException`, `markReadSchema`, `getTypeForParticipant`, `REALTIME_CONSTANTS`/`CLIENT_EVENTS`/`SERVER_EVENTS`/`SOCKET_ERRORS`/`userRoom`/`conversationRoom`, `SocketMiddleware`, `createSocketAuthMiddleware`/`createJoinRoomsMiddleware`, `TypingService`, `withAck`/`toAckError`, `registerMessageHandlers`/`registerTypingHandlers`, `registerRealtimeListeners`, `buildCorsOptions`, `createRealtimeServer`/`shouldUseRedisAdapter`/`RealtimeServerHandle` são usados nas tasks posteriores exatamente como definidos nas anteriores.
- **Validação:** todo o código foi escrito e validado numa cópia do repositório (sem `.env`, com as variáveis do CI): cada task, na ordem do plano, passou `tsc --noEmit`, `eslint src`, `prettier --check` e a suíte com 100% de cobertura (a validação por commit revelou um branch descoberto no refactor do CORS, corrigido com o teste extra do Step 1 da Task 14); a integração com `socket.io-client` passou 5 vezes seguidas e sem open handles (`--detectOpenHandles`); `npm run build` compila. O smoke da Task 17 foi executado contra uma stack real descartável (PostgreSQL 17, Redis 7, MongoDB 8, Elasticsearch 8.17 em containers próprios) com a saída exatamente como a listada, o Redis adapter foi conferido entre duas instâncias (`message:new` e `socketsJoin` atravessando o Redis) e o SIGTERM encerrou a app com código 0.
