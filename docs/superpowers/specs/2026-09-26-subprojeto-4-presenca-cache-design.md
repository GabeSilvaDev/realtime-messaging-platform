# Subprojeto 4 — Presença Online e Cache (Sprint 7) — Design

**Data:** 2026-09-26
**Roadmap:** [2026-09-23-roadmap-finalizacao-design.md](2026-09-23-roadmap-finalizacao-design.md) §3.4
**Depende de:** subprojeto 3 (módulo `realtime`)
**Status:** Aprovado (execução autônoma autorizada pelo usuário)

---

## 1. Objetivo

Presença em tempo real (RF004): online/offline por conexão WebSocket (múltiplas abas/dispositivos), status manual (disponível, ausente, ocupado) persistente entre reconexões, "visto por último", notificação aos interessados, ocultação para bloqueados e listagem de contatos online. Cache Redis dos caminhos quentes (perfis públicos, participantes de conversa, estado de bloqueio) com invalidação por eventos.

## 2. Modelo de presença

`PresenceState = 'online' | 'away' | 'busy' | 'offline'`.

- **Conexão** (Redis, por usuário): ZSET `presence:conns:<userId>` — membro = `<nodeId>:<socketId>`, score = timestamp (ms) do último heartbeat. Usuário está conectado se existir membro com score ≥ `now - PRESENCE_TTL_MS` (30 s). Entradas velhas são removidas com `ZREMRANGEBYSCORE` (cobre queda de nó sem disconnect).
- **Status manual** (Redis, sem TTL — persiste entre reconexões): `presence:manual:<userId>` ∈ `available|away|busy`; ausente = `available`.
- **Estado efetivo**: sem conexão → `offline`; com conexão → `online` se manual `available`, senão o manual (`away`/`busy`).
- **Visto por último**: `users.last_seen_at` atualizado (PG, via `userService.updateLastSeen`) quando o **último** socket do usuário desconecta; exposto como `lastSeenAt`.
- `nodeId` = UUID gerado por processo na criação do servidor realtime.

`PresenceService` (módulo `src/modules/presence/`) — única porta de acesso a essas chaves:
- `connect(userId, connectionId): Promise<{ becameOnline: boolean }>` — `ZADD`, limpa velhos, `becameOnline` se antes não havia conexão válida.
- `heartbeat(connectionIds: {userId, connectionId}[])` — `ZADD XX` em lote (pipeline).
- `disconnect(userId, connectionId): Promise<{ becameOffline: boolean; lastSeenAt?: Date }>` — `ZREM`, limpa velhos; se ficou vazio: `becameOffline`, grava `last_seen_at`.
- `setManualStatus(userId, status)` — grava; publica evento se o estado efetivo mudou.
- `getStates(userIds): Promise<Map<userId, { state, lastSeenAt }>>` — em lote (pipeline `ZCOUNT` + `GET`), `lastSeenAt` do PG só para quem está offline (uma query `IN`).
- `sweep()` — varredura periódica por nó: para cada usuário com entradas vencidas cujo conjunto ficou vazio, emite offline (cobre queda de outro nó). Implementação: `SCAN presence:conns:*` limitada (COUNT 100) a cada 30 s; custo aceitável para o porte do projeto (documentado).

Heartbeat: cada nó, a cada `PRESENCE_HEARTBEAT_MS` (15 s), atualiza o score de todos os seus sockets conectados (timer `unref`, parado no `close()`). A vivacidade da conexão em si continua sendo o ping/pong nativo do Socket.IO.

## 3. Integração com o realtime

A integração usa os hooks `onConnection`/`onDisconnect` de `createRealtimeServer` (criados na revisão final do subprojeto 3), registrados pelo módulo presence no `server.ts` — o realtime não conhece o presence. No `connection`: `presence.connect` → se `becameOnline`, publica `PresenceEvents.ONLINE { userId, timestamp }`. No `disconnect` (ignorando o motivo `server shutting down` — nesse caso as entradas do nó expiram sozinhas em 30 s e o `sweep` de outro nó, ou do próprio nó ao voltar, emite o offline): `presence.disconnect` → se `becameOffline`, publica `PresenceEvents.OFFLINE { userId, lastSeen }`. Novo evento cliente→servidor `presence:set { status: 'available'|'away'|'busy' }` (ack) → `setManualStatus` → publica `PresenceEvents.STATUS_CHANGED { userId, status }` quando o estado efetivo muda.

Ao conectar, o servidor envia ao próprio socket `presence:snapshot { states: [{ userId, state, lastSeenAt }] }` dos interessados visíveis (§4), para o cliente montar a lista sem REST.

## 4. Quem é notificado (audiência) e bloqueio

Audiência de um usuário U = contatos que têm U na lista (linhas `contacts` com `contact_id = U`, não bloqueadas) ∪ participantes das conversas **diretas** de U — **menos** qualquer usuário com bloqueio em qualquer sentido com U. Método `presenceAudience(userId): Promise<string[]>` no `PresenceService` via interfaces dos módulos user/chat (`contactService.listWatchers(userId)` novo — ids de quem tem U como contato não bloqueado; `conversationService.getDirectPartnerIds(userId)` novo; `contactService.listBlockedEitherIds(userId)` novo), com cache (§6).

Ponte (listeners do realtime): `ONLINE`/`OFFLINE`/`STATUS_CHANGED` → `io.to(audience.map(userRoom)).emit('presence:update', { userId, state, lastSeenAt })`.

Revogação de sessão (`AuthEvents.SESSIONS_REVOKED`) desconecta os sockets; a presença trata como disconnect normal.

Bloqueio: `UserEvents.BLOCKED` → o bloqueado passa a ver o bloqueador como `offline` imediatamente (`presence:update` com `offline` para `user:<blocked>` e vice-versa); `UNBLOCKED` → envia o estado real a ambos. Consultas REST de presença sempre retornam `offline` (sem `lastSeenAt`) para pares bloqueados.

## 5. API REST

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/presence?userIds=<uuid>,<uuid>` (≤ 100) | `{ items: [{ userId, state, lastSeenAt }] }`; bloqueados → offline |
| PUT | `/api/presence/status` `{ status }` | status manual (mesma regra do `presence:set`); 204 |
| GET | `/api/contacts/online` | contatos (não bloqueados) com estado ≠ offline, ordenados por nome |

`GET /api/contacts` passa a enriquecer cada item com `presence: { state, lastSeenAt }` e aceita `orderBy=presence` (online/away/busy primeiro, depois offline por `lastSeenAt` desc) — ordenação aplicada **na página** (documentado; para lista completa ordenada usar `/contacts/online`).

Endpoints legados `POST /api/profile/online|offline` e `PUT /api/profile/status`: passam a delegar para o status manual da presença (`online`→`available`, `away`, `busy`; `offline` → 400 "use a desconexão"), mantendo compatibilidade de rota, e deixam de escrever `users.status` para presença.

## 6. Cache Redis

`CacheService` genérico (`src/shared/cache/`): `get/set/del/getOrLoad(key, ttlSec, loader)` com JSON, `mget` em lote, prefixo `cache:`, TTL padrão 300 s, falha do Redis → degrada para o loader (log `warn`, nunca quebra a requisição).

Chaves e invalidação:

| Chave | Conteúdo | Usado por | Invalidação (EventBus) |
|---|---|---|---|
| `cache:user:<id>` | `PublicUserDTO` | `userService.getMultiple` (DTO de conversas), busca de perfil público | `UserEvents.UPDATED` (ProfileService passa a publicar em toda atualização de perfil/avatar), `UserEvents.DELETED` |
| `cache:conv:participants:<id>` | ids + papéis | `MessageService.send/list/markRead`, `isParticipant`, `getParticipantIds` | `CONVERSATION_CREATED/UPDATED/DELETED` |
| `cache:blocks:<id>` | ids com bloqueio em qualquer sentido | `isBlockedByEither`, audiência de presença | `USER BLOCKED/UNBLOCKED` (ambos os ids) |
| `cache:presence:audience:<id>` | ids da audiência | ponte de presença | `BLOCKED/UNBLOCKED`, `CONVERSATION_CREATED` (direct), mudanças de contato (`contact.added/removed` — novos eventos publicados pelo `ContactService`) |

Invalidação é síncrona (subscriber do EventBus sem `async`) para não servir dado velho logo após a escrita. TTL garante convergência caso um evento se perca.

## 7. Eventos novos/alterados

- `PresenceEvents.STATUS_CHANGED` payload passa a `{ userId, status: 'available'|'away'|'busy' }` (já existe; alinhar).
- `UserEvents.UPDATED` passa a ser publicado pelo `ProfileService` (`{ userId, fields }`).
- `UserEvents.CONTACT_ADDED` / `CONTACT_REMOVED` (`{ userId, contactId }`) publicados pelo `ContactService`.

## 8. Testes

- Unitários: PresenceService (Redis mockado por um fake em memória com ZSET/GET/SET/pipeline — `tests/support/redis/fakeRedis.ts`), CacheService (incl. degradação), invalidadores, audiência, handlers `presence:set`, heartbeat/sweep com fake timers, rotas/controllers novos, enriquecimento de contatos.
- Integração (socket.io-client, como no subprojeto 3, Redis fake injetado): duas abas do mesmo usuário → online uma vez, offline só quando as duas fecham; contato recebe `presence:update` em < 3 s (na prática imediato); status manual persiste após reconectar; bloqueado vê offline; snapshot ao conectar.
- Teste de cache: contagem de chamadas ao repositório cai após a primeira requisição; invalidação após evento.
- Cobertura global 100%.
- Smoke real: dois clientes, conectar/desconectar, status manual, bloqueio, e `redis-cli` confirmando chaves `presence:*`/`cache:*` com TTL.

## 9. Documentação

READMEs EN/pt-BR: seção Presença (estados, eventos `presence:update`/`presence:snapshot`/`presence:set`, REST), Cache (chaves, TTL, invalidação), roadmap; SRS local Sprint 7.

## 10. Definition of Done

RF004 atendido; presença atualiza em < 3 s; cache comprovadamente reduz queries; CI verde 100%; PR mergeado.
