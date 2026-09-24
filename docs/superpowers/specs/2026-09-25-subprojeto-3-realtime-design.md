# Subprojeto 3 — Real-Time com Socket.IO (Sprint 6) — Design

**Data:** 2026-09-25
**Roadmap:** [2026-09-23-roadmap-finalizacao-design.md](2026-09-23-roadmap-finalizacao-design.md) §3.3
**Depende de:** subprojeto 2 (módulo `chat`)
**Status:** Aprovado (execução autônoma autorizada pelo usuário)

---

## 1. Objetivo

Comunicação em tempo real sobre o servidor HTTP existente: autenticação JWT no handshake, rooms por usuário e por conversa, envio de mensagens por WebSocket, status entregue/lido (RF003.4), indicador de digitação (RF003.5), ponte EventBus → sockets, escala horizontal via Redis adapter e cliente demo mínimo.

Fora de escopo: presença online/offline e heartbeat de presença (subprojeto 4), notificações push (6).

## 2. Dependências novas

- `socket.io` (^4) e `@socket.io/redis-adapter` (dependências)
- `socket.io-client` (devDependency — testes de integração)

## 3. Estrutura

```
src/modules/realtime/
  constants/realtime.constants.ts   nomes de eventos, prefixos de room, TYPING_TTL_MS = 3000
  types/realtime.types.ts           payloads cliente→servidor e servidor→cliente, SocketData, tipos do io
  validation/realtime.schemas.ts    Zod dos payloads recebidos
  middlewares/socketAuth.ts          autenticação do handshake
  handlers/                          messageHandlers.ts, typingHandlers.ts (funções puras sobre (io, socket, deps))
  services/TypingService.ts         timers de "digitando" por (socket, conversa)
  listeners/realtime.listeners.ts   ponte EventBus → io
  server/createRealtimeServer.ts    cria o io, adapter, middlewares, connection handler
  index.ts
src/server.ts                        http.createServer(app) + createRealtimeServer(server) + listen
public/demo/                         index.html, app.js, styles.css (cliente demo)
```

## 4. Handshake e rooms

- Token JWT em `socket.handshake.auth.token` (preferido) ou header `Authorization: Bearer`. Validação via `authService.validateAccessToken` (mesma regra do middleware HTTP). Falha → `next(new Error('UNAUTHORIZED'))` (cliente recebe `connect_error` com `message: 'UNAUTHORIZED'`).
- `socket.data = { userId, ip, device }` (ip do handshake, device = user-agent truncado a 255).
- Ao conectar: `socket.join('user:<userId>')` e `socket.join('conversation:<id>')` para cada `conversationService.getUserConversationIds(userId)`. Reconexão (automática no `socket.io-client`) repete o fluxo, restaurando rooms; mensagens perdidas durante a desconexão são recuperadas pelo cliente via REST (`GET /messages?before=`), documentado.
- CORS do Socket.IO usa a mesma política do HTTP (`ALLOWED_ORIGINS` em produção, `*` fora).

## 5. Eventos cliente → servidor (todos com ack)

Todo handler valida o payload com Zod e responde via ack `{ ok: true, data }` ou `{ ok: false, error: { code, message, statusCode } }` (mapeando `AppError`; erro inesperado → `INTERNAL_ERROR` 500 e log). Sem ack fornecido, o handler ainda executa e erros são só logados.

| Evento | Payload | Efeito |
|---|---|---|
| `message:send` | `{ conversationId, text, replyTo?, mentions?, clientMessageId? }` | `messageService.send(userId, …, { ip, device })`; ack com a `MessageDTO`. Broadcast acontece pela ponte do EventBus (não no handler). `clientMessageId` (UUID gerado pelo cliente) torna o envio idempotente — ver §6.1. |
| `message:delivered` | `{ conversationId, messageId }` | `messageService.markDelivered(userId, conversationId, messageId)` |
| `message:read` | `{ conversationId, messageId }` | `messageService.markRead(userId, conversationId, messageId)` |
| `typing:start` | `{ conversationId }` | apenas conversa direct e participante; emite indicador; expira em 3s sem novo `start` |
| `typing:stop` | `{ conversationId }` | encerra indicador |

Limites: payload de `message:send` segue os mesmos schemas da API REST (reuso de `sendMessageSchema` + `conversationId` UUID). Rate limit de socket: fora de escopo (subprojeto 7).

## 6. Status de mensagens (RF003.4)

**Modelo (MongoDB `messages`)** ganha:
```ts
deliveredTo: [{ userId: string, at: Date }]   // default []
readBy:      [{ userId: string, at: Date }]   // default []
```
`sent` = `createdAt`. A `MessageDTO` passa a incluir `status: { sentAt, deliveredTo, readBy }` (arrays com `{ userId, at }`); tombstones mantêm `status`.

**`markDelivered(userId, conversationId, messageId)`**: participante (404); mensagem da conversa (404); autor não marca a própria (no-op, retorna sem evento); `$push` condicional (`deliveredTo.userId != userId`) — idempotente; publica `ChatEvents.MESSAGE_DELIVERED { messageId, conversationId, userId, senderId, at }` só quando mudou.

**`markRead(userId, conversationId, messageId)`**: participante (404); mensagem da conversa (404); marca como lidas **todas** as mensagens da conversa com `createdAt <= message.createdAt`, não apagadas, de outros autores e ainda não lidas pelo usuário (`updateMany` com `$push` em `readBy`, e também em `deliveredTo` se ausente — ler implica entregue); atualiza `participants.last_read_at = max(atual, message.createdAt)`; publica `ChatEvents.MESSAGE_READ { conversationId, userId, upToMessageId, at }` quando algo mudou.

**REST equivalente** (clientes sem WS e subprojeto 6): `POST /api/conversations/:id/read` `{ messageId }` → 204.

`EventMap` atualizado: `MESSAGE_DELIVERED` e `MESSAGE_READ` com os payloads acima.

### 6.1 Idempotência de envio

`messages` ganha `clientMessageId: string | null` com índice único parcial `{ senderId: 1, clientMessageId: 1 }` (apenas quando não nulo). `send` com `clientMessageId` já usado pelo mesmo remetente retorna a mensagem existente (sem novo evento, sem novo `last_message_at`). Vale para REST (`POST /messages` aceita `clientMessageId` opcional) e socket. A `MessageDTO` expõe `clientMessageId` para o cliente conciliar mensagens otimistas.

## 7. Ponte EventBus → sockets (`registerRealtimeListeners(io, eventBus)`)

| Evento interno | Ação no io |
|---|---|
| `MESSAGE_SENT` | `io.to('conversation:<id>').emit('message:new', payload.message)` (a própria `MessageDTO` carregada no evento desde o subprojeto 2) |
| `MESSAGE_DELETED` | `io.to(room).emit('message:deleted', { conversationId, messageId })` |
| `MESSAGE_DELIVERED` | `io.to('user:<senderId>').emit('message:status', { type: 'delivered', conversationId, messageId, userId, at })` |
| `MESSAGE_READ` | `io.to('conversation:<id>').emit('message:status', { type: 'read', conversationId, userId, upToMessageId, at })` |
| `CONVERSATION_CREATED` | para cada participante: `io.in('user:<id>').socketsJoin('conversation:<cid>')`; `io.to('conversation:<cid>').emit('conversation:new', { conversationId, type })` |
| `CONVERSATION_UPDATED` | `members_added`: `socketsJoin` de cada `affectedUserIds`; `member_left`/`member_removed`: `socketsLeave` de cada `affectedUserIds`; emite `conversation:updated { conversationId, change, actorId, affectedUserIds, name? }` para a room e também para `user:<id>` dos removidos/que saíram |
| `CONVERSATION_DELETED` | emite `conversation:deleted { conversationId }` para `user:<id>` de cada `participantIds` e `io.in('conversation:<id>').socketsLeave(...)` |

Listeners registrados no `server.ts` após criar o io (fora dos testes de app). O cliente deduplica `message:new` pelo `id` (o remetente também recebe).

## 8. Digitação (RF003.5)

`TypingService` mantém `Map<socketId:conversationId, Timeout>`. `start`: valida (participante, conversa direct — group → ack `{ ok:false, 400 }`), emite `typing:indicator { conversationId, userId, isTyping: true }` para a room **exceto** o próprio socket (`socket.to(room)`), reinicia timer de 3s que, ao expirar, emite `isTyping: false`. `stop` e `disconnect`: limpam timer e emitem `false` se havia indicador ativo. Emissões duplicadas de `true` durante o intervalo são suprimidas (só o primeiro `start` emite; os seguintes só renovam o timer).

## 9. Escala horizontal

`createRealtimeServer` usa `@socket.io/redis-adapter` com dois clientes `redis.duplicate()` (pub/sub) quando `REALTIME_REDIS_ADAPTER !== 'false'` e `NODE_ENV !== 'test'`; em teste usa o adapter em memória padrão. Encerramento gracioso: `closeRealtimeServer` fecha io e clientes pub/sub (usado por `shutdown`).

## 10. Cliente demo

`public/demo/` servido por `express.static` em `/demo` (fora do rate limit de `/api`). Página única, JS puro, sem build: login (email/senha → `/api/auth/login`), lista de conversas (`GET /api/conversations`), abrir conversa (histórico via REST com "carregar mais"), enviar via `message:send`, recebe `message:new`, mostra ✓ (enviada) / ✓✓ (entregue) / ✓✓ azul (lida), envia `message:delivered` ao receber e `message:read` ao exibir, "digitando..." em 1:1, criar conversa direct por busca de usuário. Cliente Socket.IO carregado de `/socket.io/socket.io.js` (servido pelo próprio servidor — compatível com a CSP de produção `script-src 'self'`). Sem frameworks, sem dados sensíveis em localStorage além do access token (documentado como demo).

## 11. Testes

- Unitários: socketAuth, schemas, handlers (socket/io fake), TypingService (fake timers), listeners (io fake), `markDelivered`/`markRead` (service + repository), controller/rota de `/read`, createRealtimeServer (adapter escolhido por env).
- Integração (Jest, sem Docker): servidor HTTP real em porta efêmera + `createRealtimeServer` + `socket.io-client`; services do chat reais sobre o `tests/support/chat/inMemoryChat.ts`; auth e user-module mockados. Cenários: handshake sem token/ token inválido → `connect_error`; dois clientes na mesma conversa — envio chega ao outro em < 100 ms; delivered → remetente recebe `message:status`; read → room recebe; typing start/stop/expiração (timers reais curtos via constante injetável); group não emite typing; reconexão re-entra nas rooms; conversa criada via REST faz o socket do participante entrar na room e receber mensagens.
- Cobertura global continua 100%.
- Smoke real (stack com portas alternativas, app no host): dois clientes Node com `socket.io-client` contra `:3100` trocando mensagens, status e typing; demo aberta no navegador não é exigida (verificação manual opcional).

## 12. Documentação

READMEs EN/pt-BR: seção WebSocket (URL, auth, tabela de eventos cliente→servidor e servidor→cliente, formato de ack), `/demo`, status de mensagens, `POST /read`, variável `REALTIME_REDIS_ADAPTER`; diagrama de arquitetura (chat WebSocket deixa de ser planned). SRS local: Sprint 6.

## 13. Pendências herdadas do subprojeto 2

- `ConversationService.removeMember`: tratar o retorno `deleted` de `removeParticipant` (corrida admin-sai + remoção) publicando `CONVERSATION_DELETED` em vez de `member_removed`; corrigir o JSDoc de `CONVERSATION_DELETED`.
- Camadas: `src/shared/interfaces/event.interfaces.ts` não deve importar de `@/modules/chat`. Mover o tipo do payload de mensagem usado no evento (`MessageDTO` e dependentes) para `src/shared/types/chat-message.types.ts`, re-exportado pelo módulo chat (o módulo continua usando o mesmo nome).
- Listeners pesados fora do caminho da requisição: `CONVERSATION_DELETED` (deleteMany) e o `touchInteraction` de contatos passam a ser inscritos com `{ async: true }` onde o EventBus suportar a opção por subscriber — se não suportar, publicar esses eventos com `publish(..., { async: true })` apenas quando não houver consumidor que dependa de execução síncrona; a ponte de sockets (§7) roda síncrona (latência baixa, sem I/O pesado). Decidir e documentar no plano.
- `leave`/`removeMember`/`addMembers` em transação com `SELECT ... FOR UPDATE` na linha da conversa (fecha as corridas de promoção de admin e do limite de 256), já que o tempo real aumenta a concorrência.

## 14. Definition of Done

Handshake autenticado, rooms, eventos das §5–§8 funcionando e cobertos; integração com `socket.io-client` verde; smoke real OK; CI verde (100%); PR aberto e mergeado.
