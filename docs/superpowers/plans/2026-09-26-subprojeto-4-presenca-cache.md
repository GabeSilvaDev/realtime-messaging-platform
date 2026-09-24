# Subprojeto 4 — Presença Online e Cache (Sprint 7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presença em tempo real (RF004) — online/offline por conexão WebSocket com várias abas/dispositivos, status manual (disponível/ausente/ocupado) persistente entre reconexões, "visto por último", aviso aos interessados em < 3 s, ocultação para bloqueados e contatos online — e cache Redis dos caminhos quentes (perfis públicos, participantes de conversa, bloqueios, audiência de presença) com invalidação por evento, comprovadamente reduzindo consultas ao PostgreSQL.

**Architecture:** `CacheService` genérico em `src/shared/cache` (JSON em `cache:*`, TTL 300 s, degradação para a fonte em qualquer falha do Redis) adotado pelos módulos user (perfis, bloqueios) e chat (participantes, via `ParticipantDirectory`), com listeners síncronos de invalidação registrados no bootstrap. Novo módulo `src/modules/presence`: `PresenceService` (única porta das chaves `presence:*` — ZSET de conexões com heartbeat, status manual sem TTL, estados em lote, varredura por `SCAN`, audiência cacheada), integração com o Socket.IO pelos hooks `onConnection`/`onDisconnect` do `createRealtimeServer` (o realtime não conhece o presence), handler `presence:set`, snapshot ao conectar, timers de heartbeat/varredura, ponte EventBus → `presence:update` serializada por usuário, REST (`/api/presence`, contatos online, enriquecimento de `GET /api/contacts`) e os endpoints legados de status do perfil delegando à presença.

**Tech Stack:** Node 20, TypeScript 5.9 (strict), Express 5, Socket.IO 4.8 + `@socket.io/redis-adapter`, ioredis 5 (Redis 7), Sequelize 6 + PostgreSQL 17, Mongoose 9, Zod 4, Jest 30 + ts-jest + supertest + socket.io-client 4.8.

**Spec:** `docs/superpowers/specs/2026-09-26-subprojeto-4-presenca-cache-design.md` (fonte da verdade) · convenções em `docs/superpowers/specs/2026-09-23-roadmap-finalizacao-design.md` §2 · estilo do plano anterior: `docs/superpowers/plans/2026-09-25-subprojeto-3-realtime.md`.

## Global Constraints

- Branch `feature/presence-cache` já existe — não há passo de criação de branch. Confirme com `git branch --show-current` antes da Task 1.
- NUNCA criar, modificar ou sobrescrever `.env` (segredos reais). Overrides vão como variáveis na linha de comando. NUNCA `docker compose down -v` nem apagar volumes. NUNCA tocar containers/processos de outros projetos (as portas 3000/5432/6379 do host são deles). Todo processo iniciado tem o PID gravado e é encerrado por esse PID (nunca `pkill`/`pgrep -f` com padrão).
- Rodar jest SEMPRE como `node node_modules/.bin/jest ...` (nunca `npx jest`: um hook reescreve e filtra a saída). `jest.config.ts` usa `roots: [src, tests]`, threshold global de 90% e a cobertura real é 100% — todo arquivo novo em `src/` é totalmente testado; manter 100% (statements, branches, functions, lines).
- A suíte não depende do `.env`: basta que as variáveis de banco estejam preenchidas (qualquer valor), como no CI. Sem `.env` carregado, prefixe os comandos jest/tsc com `NODE_ENV=test POSTGRES_USER=ci POSTGRES_PASSWORD=ci POSTGRES_DB=ci REDIS_PASSWORD=ci MONGO_USER=ci MONGO_PASSWORD=ci MONGO_DB=ci ELASTIC_PASSWORD=ci`.
- `jest.config.ts` tem `resetMocks`, `restoreMocks` e `clearMocks`: NUNCA colocar implementação de mock dentro de factory de `jest.mock` (nada de `jest.fn(() => ...)`/`mockReturnValue` na factory). Use funções simples ou objetos reais (ex.: `new FakeRedis()`) na factory, ou configure `mockResolvedValue`/`mockImplementation` em `beforeEach`/no teste. `jest.fn()` sem implementação na factory é ok.
- `tests/setup.ts` não chama `initLogger` (só cria `Logger.getInstance`): mocke `@/shared/logger` ou chame `initLogger` num `beforeAll` onde código real usa o logger.
- **Nenhum teste toca um Redis de verdade.** O `redis` de `@/shared/database/redis` é um ioredis com `lazyConnect` que, sem `.env`, aponta para `localhost:6379` — o Redis de OUTRO projeto nesta máquina. Todo teste que exercita código com cache ou presença injeta `new CacheService(new FakeRedis())`/`new PresenceService({ redis: new FakeRedis(), ... })` ou mocka `@/shared/database/redis` com um `FakeRedis` (ou `{}` — o cache degrada). A Task 18 prova isso rodando a suíte com o Redis apontado para um contador de conexões (esperado: 0).
- Prettier é verificado no CI (`npm run format:check` cobre `src/**/*.ts` e `tests/**/*.ts`): rodar `node node_modules/.bin/prettier --write <arquivos>` antes de cada commit. ESLint `strictTypeChecked` em `src`: `node node_modules/.bin/eslint src` deve sair com código 0. `tsconfig.json` inclui `tests/**`: `node node_modules/.bin/tsc --noEmit` também checa os testes. ts-jest roda com `isolatedModules` (sem checagem de tipos): erros de tipo só aparecem no `tsc`.
- Commits: gitmoji + Conventional Commits em PT-BR, atômicos (um por task); NUNCA mencionar Claude/Anthropic/IA nem adicionar `Co-Authored-By`; NUNCA commitar `.github/SRS.md`, `*.stale-root/` nem `.env*` (exceto `.env.example`). Sempre `git add <arquivos explícitos>` (nunca `git add -A`/`git add .`).
- Validação com stack real usa portas alternativas: `POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301`; app no host com `PORT=3100` (confira antes que a porta está livre); `MONGODB_URL` montada em tempo de execução com as credenciais do `.env` passadas por `encodeURIComponent`, sem escrever arquivo algum; rodar as migrations primeiro. O container `rtm-app` não funciona — não usar.
- Testes de integração com `socket.io-client`: porta efêmera (`listen(0)`), fechar sockets cliente, io e servidor HTTP em `afterEach`/`afterAll`, sem open handles (rodar uma vez com `--detectOpenHandles`), `transports: ['websocket']`, e TTL/heartbeat/varredura injetados curtos (nada de esperar 30 s reais no Jest).
- Módulos só se consomem por interface exportada ou EventBus (roadmap §2.3) e importando o ARQUIVO do service (ex.: `@/modules/user/services/ContactService`), nunca o barrel do módulo nem repositório alheio. `src/shared` não importa `src/modules` (teste de camadas existente). O `realtime` não importa o `presence`.
- Express 5: `req.query` é somente leitura. Fixtures de UUID v4 válidos (ex.: `11111111-1111-4111-8111-111111111111`).

## Decisões de design (ambiguidades do spec resolvidas)

1. **Dependências sem ciclo:** o `presence` depende de user/chat/realtime importando os arquivos dos services (`UserService`, `ContactService`, `ConversationService`) e os utilitários do realtime (`withAck`, `userRoom`, tipos). O user consome a presença em dois pontos (`ContactController` e `ProfileService`) importando `@/modules/presence/services/PresenceService` — nenhum arquivo importado pelo `PresenceService` importa esses dois, então não há ciclo de arquivos. O realtime continua sem conhecer o presence (hooks + ponte registrados no `server.ts`).
2. **Quem publica os eventos de presença:** o próprio `PresenceService` (`connect` → `presence:online` se `becameOnline`; `disconnect`/`sweep` → grava `last_seen_at` e publica `presence:offline`; `setManualStatus` → `presence:status-changed` se o estado efetivo mudou). Os hooks só chamam o service — um único lugar para a regra. Falha ao gravar `last_seen_at` é logada e o offline sai mesmo assim.
3. **Atomicidade entre instâncias:** toda leitura-e-escrita de conexão roda num `MULTI` (`connect`: remove vencidas → `ZCARD` → `ZADD` → `PEXPIRE`; `disconnect`: `ZREM` → remove vencidas → `ZCARD`; varredura: remove vencidas → `ZCARD` por chave). Só quem viu a transição publica; `disconnect` com `ZREM = 0` (a varredura já tirou a entrada) não publica de novo. Pipelines/multi usam o formato de array do ioredis (`client.multi([['zadd', ...]]).exec()`), o que mantém o `FakeRedis` pequeno e o tipo do cliente simples (`PresenceRedisClient`/`CacheClient` — o `Redis` do ioredis satisfaz ambos).
4. **Heartbeat e expiração:** `ZADD XX` (não ressuscita socket que acabou de sair ou que a varredura removeu) + `PEXPIRE` de 120 s na chave de conexões (chaves de usuários que ninguém renova somem sozinhas). Consequência documentada: se os heartbeats de um nó falharem por > 30 s (Redis fora), seus sockets aparecem offline até reconectarem. A varredura grava `last_seen_at` com o instante da detecção (≤ 30 s após o último heartbeat).
5. **Snapshot:** `presence:snapshot` traz o estado de quem o usuário OBSERVA (contatos não bloqueados dele ∪ parceiros 1:1, menos bloqueios) — exatamente o conjunto cujos `presence:update` ele passa a receber (a audiência de X contém U ⇔ U observa X). Para isso o `ContactService` ganha `listContactIds` além do `listWatchers`/`listBlockedEitherIds` do spec, e o `PresenceService` ganha `watchedUserIds` e `getVisibleStates` (estados como um usuário os vê: bloqueado ⇒ `offline` sem `lastSeenAt`).
6. **Ponte da presença no módulo presence** (`registerPresenceBridge(io)`), não nos listeners do realtime: ela precisa de I/O (audiência, estado) e o realtime não conhece o presence. As emissões sobre um mesmo usuário passam por uma fila por usuário (um `online` lento nunca chega depois do `offline` seguinte); os subscribers devolvem a promise da fila (quem publica espera a emissão, falhas só logam). `presence:status-changed` também vai para a room do próprio usuário (sincroniza o seletor das outras abas). `presence:online` emite o estado real lido na hora (conectar com status `busy` já aparece como `busy`).
7. **Cache de participantes (`cache:conv:participants:<id>`):** guarda só `[{ userId, role }]` (`ParticipantDirectory`, compartilhado por `ConversationService` e `MessageService`). Usado por `send`, `list`, `delete`, `markDelivered`, `isParticipant` e `getParticipantIds`. `markRead` continua lendo a linha da participação: precisa do `last_read_at`, que muda a cada leitura (não é cacheável).
8. **Cache de perfis (`cache:user:<id>`):** `userService.getMultiple` (MGET + uma consulta `IN` só para os ausentes + `setMany`) e `findByIdPublic` (via `getMultiple`). `lastSeenAt` volta do JSON como string e é reconvertido em `Date`. As escritas do próprio `UserService` (`updateLastSeen`, `updateStatus`, `update`, `delete`) apagam a chave diretamente; o `ProfileService` publica `user:updated` e o listener do módulo user apaga. `ProfileService.getPublicProfile` (inclui `bio`, que não faz parte do `PublicUserDTO`) não é cacheado. `updateLastSeen` ganha o parâmetro `at` (o `lastSeen` do evento é exatamente o valor gravado).
9. **Cache de bloqueios (`cache:blocks:<id>`):** `ContactRepository.listBlockedEitherIds` (uma consulta para os dois sentidos) cacheado em `ContactService.listBlockedEitherIds`; `isBlockedByEither(a, b)` passa a ser `listBlockedEitherIds(a).includes(b)` (uma leitura cacheada no lugar de duas consultas por mensagem enviada).
10. **Invalidação:** listeners síncronos (`registerUserCacheListeners`, `registerChatCacheListeners`, `registerPresenceCacheListeners`) que devolvem a promise do `del` — o `publish` (e portanto a requisição que mudou o dado) só termina com o cache limpo. Registrados no `bootstrap()`; os feature tests que dependem deles os registram explicitamente.
11. **Status manual:** gravado sempre (inclusive `available`); valor desconhecido no Redis vale `available`. Offline com status `busy` não publica nada (o estado efetivo continua `offline`); ao reconectar, o `presence:update` já sai como `busy`.
12. **Endpoints legados:** `ProfileService.updateStatus/setOnline/setAway/setBusy` delegam a `setManualStatus` (`online` → `available`) e não gravam mais `users.status`; `offline` (em `PUT /profile/status` e `POST /profile/offline`) lança `OfflineStatusNotAllowedException` (400 `BAD_REQUEST`, "Não é possível definir offline manualmente: use a desconexão") antes de qualquer consulta. O `ProfileController` não muda.
13. **REST:** `GET /api/presence` responde no envelope do projeto (`{ success, data: { items } }`), aceita quaisquer ids (≤ 100, UUID) e esconde pares bloqueados. `GET /api/contacts/online` = contatos não bloqueados com estado ≠ offline (ids → estados → carrega só as linhas dos conectados), ordenados por apelido › nome de exibição › username (`localeCompare` pt-BR, sem distinção de acento/caixa). `orderBy=presence` ordena a página carregada (o banco usa a ordem padrão): online → away → busy → offline pelo visto por último mais recente (sem data no fim).
14. **Encerramento:** `createStopHandler` ganha `beforeClose` (para heartbeat/varredura e a ponte da presença antes do `io.close()`); os sockets derrubados pelo `io.close()` saem com `server shutting down` e o hook de desconexão os ignora — as entradas do nó expiram e a varredura de outro nó (ou do próprio, ao voltar) publica o offline.
15. **FakeRedis:** `tests/support/redis/fakeRedis.ts` implementa exatamente os comandos usados (GET/SET EX/MGET/DEL, ZADD XX/ZREM/ZCOUNT/ZREMRANGEBYSCORE/ZCARD/ZSCORE, PEXPIRE/TTL/PTTL, SCAN MATCH COUNT, pipeline/multi em array) com relógio injetável e `failWith` para simular queda. A semântica foi conferida contra um Redis 7 real na escrita do plano (mesma sequência de comandos nos dois, resultados idênticos — incluindo `[erro, undefined]` no lote e WRONGTYPE).

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/types/presence.types.ts`, `src/shared/types/index.ts` | Criar/Modificar | `ManualPresenceStatus`, `PresenceState`, `PresenceStateDTO` (usados pelo EventMap e pelo realtime) |
| `src/shared/types/event.types.ts`, `src/shared/interfaces/event.interfaces.ts` | Modificar | `UserEvents.CONTACT_ADDED/REMOVED`; payloads de presença e contatos |
| `src/shared/cache/*` | Criar | `CacheService`, `CACHE_CONSTANTS`, tipos `CacheClient`/`ICacheService`/`RedisCommand`/`RedisBatch` |
| `src/modules/user/constants/cache.constants.ts` | Criar | `USER_CACHE_KEYS`, `USER_CACHE_TTL_SECONDS` |
| `src/modules/user/listeners/*` | Criar | `registerUserCacheListeners` |
| `src/modules/user/{interfaces,repositories,services}/*` | Modificar | Consultas de audiência, cache de bloqueios e de perfis, eventos, delegação do status legado |
| `src/modules/user/controllers/ContactController.ts`, `routes/contact.routes.ts`, `types/contact.types.ts`, `constants/contact.constants.ts` | Modificar | Presença nos contatos, `orderBy=presence`, `GET /online` |
| `src/modules/user/errors/profile.errors.ts` | Modificar | `OfflineStatusNotAllowedException` |
| `src/modules/chat/constants/cache.constants.ts` | Criar | `CHAT_CACHE_KEYS`, `CHAT_CACHE_TTL_SECONDS` |
| `src/modules/chat/services/ParticipantDirectory.ts` | Criar | Participantes (ids + papéis) cacheados |
| `src/modules/chat/{interfaces,repositories,services,listeners}/*` | Modificar | `listDirectPartnerIds`/`getDirectPartnerIds`, adoção do cache, `registerChatCacheListeners` |
| `src/modules/presence/constants/*` | Criar | TTLs, chaves, status/estados, `effectiveState`, `toManualStatus`, `compareByPresence` |
| `src/modules/presence/{types,interfaces,validation}/*` | Criar | Tipos, `IPresenceService`, `presenceStatusSchema`, `presenceQuerySchema` |
| `src/modules/presence/services/PresenceService.ts` | Criar | Conexões, heartbeat, status manual, estados, varredura, audiência, visibilidade |
| `src/modules/presence/listeners/*` | Criar | `registerPresenceCacheListeners` (audiência) |
| `src/modules/presence/realtime/*` | Criar | `registerPresenceHandlers` (`presence:set`), `createPresenceRealtime` (hooks, snapshot, timers), `registerPresenceBridge` |
| `src/modules/presence/{controllers,routes}/*`, `src/modules/presence/index.ts` | Criar | `GET /api/presence`, `PUT /api/presence/status`, barrel |
| `src/modules/realtime/constants/realtime.constants.ts`, `types/*` | Modificar | `presence:set`, `presence:update`, `presence:snapshot` |
| `src/app.ts`, `src/server.ts`, `src/bootstrap.ts`, `src/serverLifecycle.ts` | Modificar | Rota `/api/presence`, hooks/ponte/timers, listeners de cache, `beforeClose` |
| `public/demo/{index.html,app.js,styles.css}` | Modificar | Seletor de status e indicadores de presença |
| `tests/support/redis/fakeRedis.ts` (+ teste de contrato) | Criar | Redis em memória |
| `tests/support/realtime/fakeSocket.ts`, `tests/support/chat/inMemoryChat.ts` | Modificar | `socket.emit` registrado; `listDirectPartnerIds` |
| `tests/unit/**`, `tests/feature/modules/{chat,user,presence}/*` | Criar/Modificar | Ver cada task |
| `README.md`, `README.pt-BR.md` | Modificar | Presença, cache, eventos, REST, estrutura, roadmap |
| `.github/SRS.md` | Modificar (local, NÃO commitar) | Sprint 7 |

Comando de verificação usado ao fim de cada task (abreviado como **"verificação completa"**):

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: `tsc` e `eslint` sem erros (código 0), Prettier "All matched files use Prettier code style!", todas as suítes passando e o resumo com 100% em statements/branches/functions/lines.

---

### Task 1: Tipos de presença em `shared` e eventos de perfil/contatos

**Files:**
- Modify: `src/modules/user/services/ContactService.ts`
- Modify: `src/modules/user/services/ProfileService.ts`
- Modify: `src/shared/interfaces/event.interfaces.ts`
- Modify: `src/shared/types/event.types.ts`
- Modify: `src/shared/types/index.ts`
- Create: `src/shared/types/presence.types.ts`
- Modify: `tests/unit/modules/user/services/ContactService.events.test.ts`
- Create: `tests/unit/modules/user/services/ProfileService.events.test.ts`
- Modify: `tests/unit/shared/types/index.test.ts`

**Interfaces:**
- Produces: `@/shared/types` exporta `ManualPresenceStatus = 'available' | 'away' | 'busy'`, `PresenceState = 'online' | 'away' | 'busy' | 'offline'`, `PresenceStateDTO { userId; state: PresenceState; lastSeenAt: Date | null }`; `UserEvents.CONTACT_ADDED = 'user:contact-added'`, `UserEvents.CONTACT_REMOVED = 'user:contact-removed'` com payload `{ userId, contactId }`; `PresenceEvents.STATUS_CHANGED` com `{ userId, status: ManualPresenceStatus }`.
- Produces: `new ProfileService(users?, avatar?, events?: Pick<EventBus, 'publish'>)` publica `UserEvents.UPDATED { userId, fields }` em `updateProfile` (campos gravados; nada se vazio), `uploadAvatar` e `removeAvatar` (`['avatarUrl']`). `ContactService.addContact`/`removeContact` publicam `CONTACT_ADDED`/`CONTACT_REMOVED`.

Base de tudo que vem depois: os tipos públicos da presença ficam em `src/shared` (o `EventMap` e os tipos do realtime os referenciam), `UserEvents` ganha `CONTACT_ADDED/REMOVED`, o `ProfileService` publica `user:updated` a cada escrita de perfil/avatar e o `ContactService` publica a adição/remoção de contatos (§7 do spec).

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/user/services/ContactService.events.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
    unblock: jest.fn(),
    isBlocked: jest.fn(),
  } as unknown as jest.Mocked<IContactRepository>;
  const users = {
```

por:

```ts
    unblock: jest.fn(),
    isBlocked: jest.fn(),
    findByUserAndContact: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IContactRepository>;
  const users = {
```

2. Substituir:

```ts
    expect(events.publish).not.toHaveBeenCalled();
  });
});
```

por:

```ts
    expect(events.publish).not.toHaveBeenCalled();
  });

  describe('contatos (quem vê a presença de contactId mudou)', () => {
    const contactRow = {
      id: 'row-1',
      userId: 'user-1',
      contactId: 'target-1',
      nickname: null,
      isBlocked: false,
      isFavorite: false,
      blockedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    it('addContact publica user:contact-added', async () => {
      (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1', username: 'alvo' });
      jest.spyOn(service, 'isBlockedByEither').mockResolvedValue(false);
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(null);
      (contacts.create as jest.Mock).mockResolvedValue(contactRow);

      await service.addContact('user-1', { contactId: 'target-1' });

      expect(events.publish).toHaveBeenCalledWith(UserEvents.CONTACT_ADDED, {
        userId: 'user-1',
        contactId: 'target-1',
      });
    });

    it('addContact recusado (já é contato) não publica', async () => {
      (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1', username: 'alvo' });
      jest.spyOn(service, 'isBlockedByEither').mockResolvedValue(false);
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(contactRow);

      await expect(service.addContact('user-1', { contactId: 'target-1' })).rejects.toThrow();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('removeContact publica user:contact-removed', async () => {
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(contactRow);
      (contacts.delete as jest.Mock).mockResolvedValue(true);

      await service.removeContact('user-1', 'target-1');

      expect(events.publish).toHaveBeenCalledWith(UserEvents.CONTACT_REMOVED, {
        userId: 'user-1',
        contactId: 'target-1',
      });
    });

    it('removeContact de quem não é contato não publica', async () => {
      (contacts.findByUserAndContact as jest.Mock).mockResolvedValue(null);

      await expect(service.removeContact('user-1', 'target-1')).rejects.toThrow();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
```

Criar `tests/unit/modules/user/services/ProfileService.events.test.ts`:

```ts
jest.mock('@/modules/user/repositories', () => ({
  userRepository: {},
  UserRepository: jest.fn(),
}));

import type { IAvatarService, IUserRepository } from '@/modules/user/interfaces';
import type { AvatarFile, AvatarUploadResult } from '@/modules/user/types';
import { ProfileService } from '@/modules/user/services/ProfileService';
import { UserEvents, UserStatus } from '@/shared/types';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('ProfileService — user:updated (invalidação do cache do perfil público)', () => {
  const user = {
    id: USER_ID,
    username: 'ana',
    email: 'ana@example.com',
    password: 'hash',
    displayName: 'Ana',
    avatarUrl: null,
    status: UserStatus.OFFLINE,
    lastSeenAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const avatarFile: AvatarFile = {
    fieldname: 'avatar',
    originalname: 'a.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('x'),
    size: 1,
  };
  const uploadResult = {
    urls: { medium: '/uploads/avatars/medium/a.webp' },
  } as unknown as AvatarUploadResult;

  let users: jest.Mocked<Pick<IUserRepository, 'findById' | 'update'>>;
  let avatar: jest.Mocked<Pick<IAvatarService, 'upload' | 'delete'>>;
  let events: { publish: jest.Mock };
  let service: ProfileService;

  beforeEach(() => {
    users = { findById: jest.fn().mockResolvedValue(user), update: jest.fn() };
    users.update.mockResolvedValue(user);
    avatar = { upload: jest.fn(), delete: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new ProfileService(
      users as unknown as IUserRepository,
      avatar as unknown as IAvatarService,
      events
    );
  });

  it('updateProfile publica os campos gravados', async () => {
    await service.updateProfile(USER_ID, { displayName: 'Ana B', bio: null });

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UPDATED, {
      userId: USER_ID,
      fields: ['displayName', 'bio'],
    });
  });

  it('updateProfile sem campos não publica', async () => {
    await service.updateProfile(USER_ID, {});

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('updateProfile que falha (perfil sumiu) não publica', async () => {
    users.update.mockResolvedValue(null);

    await expect(service.updateProfile(USER_ID, { displayName: 'Ana B' })).rejects.toThrow();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('uploadAvatar publica avatarUrl', async () => {
    avatar.upload.mockResolvedValue(uploadResult);

    await service.uploadAvatar(USER_ID, avatarFile);

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UPDATED, {
      userId: USER_ID,
      fields: ['avatarUrl'],
    });
  });

  it('removeAvatar publica avatarUrl', async () => {
    avatar.delete.mockResolvedValue({ deleted: true, deletedFiles: [] });

    await service.removeAvatar(USER_ID);

    expect(events.publish).toHaveBeenCalledWith(UserEvents.UPDATED, {
      userId: USER_ID,
      fields: ['avatarUrl'],
    });
  });
});
```

Em `tests/unit/shared/types/index.test.ts`, substituir:

```ts
      expect(UserEvents.BLOCKED).toBe('user:blocked');
      expect(UserEvents.UNBLOCKED).toBe('user:unblocked');
    });

```

por:

```ts
      expect(UserEvents.BLOCKED).toBe('user:blocked');
      expect(UserEvents.UNBLOCKED).toBe('user:unblocked');
      expect(UserEvents.CONTACT_ADDED).toBe('user:contact-added');
      expect(UserEvents.CONTACT_REMOVED).toBe('user:contact-removed');
    });

```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/user/services/ContactService.events.test.ts tests/unit/modules/user/services/ProfileService.events.test.ts tests/unit/shared/types/index.test.ts --coverage=false`

Expected: FAIL — 6 testes: `UserEvents.CONTACT_ADDED` indefinido e `events.publish` nunca chamado com `user:updated` / `user:contact-added` / `user:contact-removed`.

- [ ] **Step 3: Implementar**

Em `src/modules/user/services/ContactService.ts` (2 trechos, na ordem):

1. Substituir:

```ts
      nickname: data.nickname ?? null,
    });

    return {
```

por:

```ts
      nickname: data.nickname ?? null,
    });
    await this.events.publish(UserEvents.CONTACT_ADDED, { userId, contactId: data.contactId });

    return {
```

2. Substituir:

```ts

    await this.contacts.delete(contact.id);
  }

```

por:

```ts

    await this.contacts.delete(contact.id);
    await this.events.publish(UserEvents.CONTACT_REMOVED, { userId, contactId });
  }

```

Em `src/modules/user/services/ProfileService.ts` (6 trechos, na ordem):

1. Substituir:

```ts
import { UserStatus } from '@/shared/types';
import { logger } from '@/shared/logger';
import { userRepository } from '../repositories';
```

por:

```ts
import { UserEvents, UserStatus } from '@/shared/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { userRepository } from '../repositories';
```

2. Substituir:

```ts
  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly avatar: IAvatarService = avatarService
  ) {}

```

por:

```ts
  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly avatar: IAvatarService = avatarService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

```

3. Substituir:

```ts
    }

    logger.info('Profile updated', { userId, fields: Object.keys(updateData) });

    return this.mapToUserProfile(updated as unknown as Record<string, unknown>);
```

por:

```ts
    }

    const fields = Object.keys(updateData);
    logger.info('Profile updated', { userId, fields });
    await this.publishUpdated(userId, fields);

    return this.mapToUserProfile(updated as unknown as Record<string, unknown>);
```

4. Substituir:

```ts
      avatarUrl: result.urls.medium,
    });

    return result;
```

por:

```ts
      avatarUrl: result.urls.medium,
    });
    await this.publishUpdated(userId, ['avatarUrl']);

    return result;
```

5. Substituir:

```ts

    logger.info('Avatar removed', { userId, filesDeleted: result.deletedFiles.length });

    return result;
```

por:

```ts

    logger.info('Avatar removed', { userId, filesDeleted: result.deletedFiles.length });
    await this.publishUpdated(userId, ['avatarUrl']);

    return result;
```

6. Substituir:

```ts
  }

  private isValidUrl(url: string): boolean {
    try {
```

por:

```ts
  }

  /** `user:updated` invalida o cache do perfil público; nada gravado ⇒ nada publicado. */
  private async publishUpdated(userId: string, fields: string[]): Promise<void> {
    if (fields.length > 0) {
      await this.events.publish(UserEvents.UPDATED, { userId, fields });
    }
  }

  private isValidUrl(url: string): boolean {
    try {
```

Em `src/shared/interfaces/event.interfaces.ts` (3 trechos, na ordem):

1. Substituir:

```ts
import type { MessageDTO } from '../types/chat-message.types';
import {
  SystemEvents,
```

por:

```ts
import type { MessageDTO } from '../types/chat-message.types';
import type { ManualPresenceStatus } from '../types/presence.types';
import {
  SystemEvents,
```

2. Substituir:

```ts

  [UserEvents.CREATED]: { userId: string; email: string };
  [UserEvents.UPDATED]: { userId: string; fields: string[] };
  [UserEvents.DELETED]: { userId: string };
  [UserEvents.BLOCKED]: { userId: string; blockedUserId: string };
  [UserEvents.UNBLOCKED]: { userId: string; unblockedUserId: string };

  [ChatEvents.MESSAGE_SENT]: {
```

por:

```ts

  [UserEvents.CREATED]: { userId: string; email: string };
  /** Perfil alterado (`fields` = campos gravados); invalida o cache do perfil público. */
  [UserEvents.UPDATED]: { userId: string; fields: string[] };
  [UserEvents.DELETED]: { userId: string };
  [UserEvents.BLOCKED]: { userId: string; blockedUserId: string };
  [UserEvents.UNBLOCKED]: { userId: string; unblockedUserId: string };
  /** `userId` adicionou `contactId` aos contatos (quem vê a presença de `contactId` mudou). */
  [UserEvents.CONTACT_ADDED]: { userId: string; contactId: string };
  /** `userId` removeu `contactId` dos contatos. */
  [UserEvents.CONTACT_REMOVED]: { userId: string; contactId: string };

  [ChatEvents.MESSAGE_SENT]: {
```

3. Substituir:

```ts
  };

  [PresenceEvents.ONLINE]: { userId: string; timestamp: Date };
  [PresenceEvents.OFFLINE]: { userId: string; lastSeen: Date };
  [PresenceEvents.STATUS_CHANGED]: {
    userId: string;
    status: 'available' | 'busy' | 'away';
  };

  [NotificationEvents.SEND]: {
```

por:

```ts
  };

  /** Primeira conexão válida do usuário (nenhuma outra aba/dispositivo conectado). */
  [PresenceEvents.ONLINE]: { userId: string; timestamp: Date };
  /** Última conexão encerrada (ou expirada); `lastSeen` = `users.last_seen_at` gravado. */
  [PresenceEvents.OFFLINE]: { userId: string; lastSeen: Date };
  /** Status manual alterado com o usuário conectado (o estado efetivo mudou). */
  [PresenceEvents.STATUS_CHANGED]: { userId: string; status: ManualPresenceStatus };

  [NotificationEvents.SEND]: {
```

Em `src/shared/types/event.types.ts`, substituir:

```ts
  BLOCKED = 'user:blocked',
  UNBLOCKED = 'user:unblocked',
}

```

por:

```ts
  BLOCKED = 'user:blocked',
  UNBLOCKED = 'user:unblocked',
  CONTACT_ADDED = 'user:contact-added',
  CONTACT_REMOVED = 'user:contact-removed',
}

```

Em `src/shared/types/index.ts`, substituir:

```ts
  MessageStatusEntry,
} from './chat-message.types';
export type {
  ValidationTarget,
```

por:

```ts
  MessageStatusEntry,
} from './chat-message.types';
export type { ManualPresenceStatus, PresenceState, PresenceStateDTO } from './presence.types';
export type {
  ValidationTarget,
```

Criar `src/shared/types/presence.types.ts`:

```ts
/**
 * Contrato público da presença (REST, EventBus e Socket.IO).
 *
 * Fica em `shared` porque o `EventMap` (camada shared) e os tipos de evento do realtime o
 * referenciam; o módulo `presence` re-exporta estes tipos.
 */

/** Status escolhido pelo usuário; persiste entre reconexões (ausente = `available`). */
export type ManualPresenceStatus = 'available' | 'away' | 'busy';

/**
 * Estado efetivo: sem conexão → `offline`; conectado → `online` se o status manual for
 * `available`, senão o próprio status manual (`away`/`busy`).
 */
export type PresenceState = 'online' | 'away' | 'busy' | 'offline';

/** Estado de um usuário como exposto aos clientes (`lastSeenAt` só quando `offline`). */
export interface PresenceStateDTO {
  userId: string;
  state: PresenceState;
  lastSeenAt: Date | null;
}
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/services/ContactService.events.test.ts tests/unit/modules/user/services/ProfileService.events.test.ts tests/unit/shared/types/index.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/user/services/ContactService.ts src/modules/user/services/ProfileService.ts src/shared/interfaces/event.interfaces.ts src/shared/types/event.types.ts src/shared/types/index.ts src/shared/types/presence.types.ts tests/unit/modules/user/services/ContactService.events.test.ts tests/unit/modules/user/services/ProfileService.events.test.ts tests/unit/shared/types/index.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/user/services/ContactService.ts \
  src/modules/user/services/ProfileService.ts \
  src/shared/interfaces/event.interfaces.ts \
  src/shared/types/event.types.ts \
  src/shared/types/index.ts \
  src/shared/types/presence.types.ts \
  tests/unit/modules/user/services/ContactService.events.test.ts \
  tests/unit/modules/user/services/ProfileService.events.test.ts \
  tests/unit/shared/types/index.test.ts
git commit -m "✨ feat: publica user:updated no perfil e eventos de contato adicionado/removido"
```


---

### Task 2: `FakeRedis` — Redis em memória para os testes

**Files:**
- Create: `tests/support/redis/fakeRedis.test.ts`
- Create: `tests/support/redis/fakeRedis.ts`

**Interfaces:**
- Produces: `tests/support/redis/fakeRedis.ts` exporta `class FakeRedis` (`constructor(clock = Date.now)`) com `get`, `set(key, value, ...['EX'|'PX', n])`, `mget(...keys)`, `del(...keys)`, `zadd(key, ['XX'], score, member, ...)`, `zrem`, `zcount`, `zremrangebyscore`, `zcard`, `zscore`, `pexpire`, `ttl`, `pttl`, `scan(cursor, 'MATCH', pattern, 'COUNT', n)`, `pipeline(commands)`/`multi(commands)` → `{ exec(): Promise<[Error | null, unknown][]> }`, além de `keys()`, `flushall()`, `commands: string[]` (nomes executados) e `failWith: Error | null` (todo comando rejeita).

Implementa só os comandos que o cache e a presença usam, com a semântica do Redis 7 (conferida contra um Redis real na escrita do plano). É um arquivo de suporte (não casa com `testMatch`); o contrato fica num teste ao lado dele. Os comandos rodam de forma síncrona por dentro, então `multi(...).exec()` é atômico como no Redis.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/support/redis/fakeRedis.test.ts`:

```ts
// Contrato do FakeRedis: os mesmos resultados que um Redis 7 real devolve para os comandos
// usados pelo cache e pela presença (conferido contra um Redis real na escrita do plano).
import { FakeRedis } from './fakeRedis';

describe('FakeRedis (contrato dos comandos usados)', () => {
  let now: number;
  let redis: FakeRedis;

  beforeEach(() => {
    now = 1_000_000;
    redis = new FakeRedis(() => now);
  });

  describe('strings', () => {
    it('GET/SET/MGET/DEL', async () => {
      expect(await redis.get('a')).toBeNull();
      expect(await redis.set('a', '1')).toBe('OK');
      await redis.set('b', '2');

      expect(await redis.get('a')).toBe('1');
      expect(await redis.mget('a', 'x', 'b')).toEqual(['1', null, '2']);
      expect(await redis.del('a', 'x')).toBe(1);
      expect(await redis.get('a')).toBeNull();
    });

    it('SET com EX expira pelo relógio; TTL/PTTL seguem o Redis (-2 sem chave, -1 sem expiração)', async () => {
      await redis.set('k', 'v', 'EX', 300);
      await redis.set('forever', 'v');

      expect(await redis.ttl('k')).toBe(300);
      expect(await redis.pttl('k')).toBe(300_000);
      expect(await redis.ttl('forever')).toBe(-1);
      expect(await redis.ttl('none')).toBe(-2);

      now += 299_999;
      expect(await redis.get('k')).toBe('v');
      now += 1;
      expect(await redis.get('k')).toBeNull();
      expect(await redis.ttl('k')).toBe(-2);
    });

    it('SET com PX também expira', async () => {
      await redis.set('k', 'v', 'PX', 50);
      now += 50;

      expect(await redis.get('k')).toBeNull();
    });

    it('GET/ZCARD no tipo errado respondem WRONGTYPE; MGET devolve null', async () => {
      await redis.zadd('z', 1, 'm');
      await redis.set('s', 'v');

      await expect(redis.get('z')).rejects.toThrow('WRONGTYPE');
      await expect(redis.zcard('s')).rejects.toThrow('WRONGTYPE');
      expect(await redis.mget('z')).toEqual([null]);
    });
  });

  describe('sorted sets', () => {
    it('ZADD devolve quantos membros são novos; ZADD XX só atualiza existentes', async () => {
      expect(await redis.zadd('z', 10, 'a', 20, 'b')).toBe(2);
      expect(await redis.zadd('z', 15, 'a')).toBe(0);
      expect(await redis.zadd('z', 'XX', 30, 'a', 40, 'c')).toBe(0);

      expect(await redis.zscore('z', 'a')).toBe('30');
      expect(await redis.zscore('z', 'c')).toBeNull();
      expect(await redis.zadd('missing', 'XX', 1, 'a')).toBe(0);
      expect(redis.keys()).toEqual(['z']);
    });

    it('ZCOUNT e ZREMRANGEBYSCORE aceitam -inf/+inf e limite exclusivo "("', async () => {
      await redis.zadd('z', 10, 'a', 20, 'b', 30, 'c');

      expect(await redis.zcount('z', '-inf', '+inf')).toBe(3);
      expect(await redis.zcount('z', 20, '+inf')).toBe(2);
      expect(await redis.zcount('z', '(20', '+inf')).toBe(1);
      expect(await redis.zcount('missing', '-inf', '+inf')).toBe(0);
      expect(await redis.zremrangebyscore('z', '-inf', '(20')).toBe(1);
      expect(await redis.zcard('z')).toBe(2);
      await expect(redis.zcount('z', 'x', '+inf')).rejects.toThrow('not a float');
    });

    it('ZREM e ZREMRANGEBYSCORE apagam o sorted set que fica vazio', async () => {
      await redis.zadd('z', 10, 'a');
      await redis.zadd('y', 10, 'a');

      expect(await redis.zrem('z', 'a', 'x')).toBe(1);
      expect(await redis.zremrangebyscore('y', '-inf', '+inf')).toBe(1);
      expect(await redis.zrem('missing', 'a')).toBe(0);
      expect(await redis.zremrangebyscore('missing', '-inf', '+inf')).toBe(0);
      expect(redis.keys()).toEqual([]);
    });

    it('PEXPIRE vale para o sorted set inteiro (0 quando a chave não existe)', async () => {
      await redis.zadd('z', 10, 'a');

      expect(await redis.pexpire('z', 1000)).toBe(1);
      expect(await redis.pexpire('missing', 1000)).toBe(0);
      expect(await redis.pttl('z')).toBe(1000);
      now += 1000;
      expect(await redis.zcard('z')).toBe(0);
    });
  });

  describe('SCAN', () => {
    it('percorre todas as chaves que casam com o MATCH, de COUNT em COUNT, até o cursor "0"', async () => {
      for (let i = 0; i < 5; i++) {
        await redis.zadd(`presence:conns:u${String(i)}`, 1, 'c');
      }
      await redis.set('presence:manual:u0', 'busy');

      const found: string[] = [];
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'presence:conns:*', 'COUNT', 2);
        found.push(...keys);
        cursor = next;
      } while (cursor !== '0');

      expect(found.sort()).toEqual([
        'presence:conns:u0',
        'presence:conns:u1',
        'presence:conns:u2',
        'presence:conns:u3',
        'presence:conns:u4',
      ]);
    });

    it('MATCH trata "?" como um caractere e o resto como literal', async () => {
      await redis.set('a.b', '1');
      await redis.set('axb', '1');
      await redis.set('ab', '1');

      expect((await redis.scan('0', 'MATCH', 'a.b', 'COUNT', 10))[1]).toEqual(['a.b']);
      expect((await redis.scan('0', 'MATCH', 'a?b', 'COUNT', 10))[1]).toEqual(['a.b', 'axb']);
    });
  });

  describe('pipeline/multi (formato de array do ioredis)', () => {
    it('devolve [erro, resultado] por comando, na ordem', async () => {
      await redis.set('s', 'v');

      const results = await redis
        .pipeline([
          ['set', 'k', 'v', 'EX', 10],
          ['get', 'k'],
          ['zcard', 's'],
        ])
        .exec();

      expect(results[0]).toEqual([null, 'OK']);
      expect(results[1]).toEqual([null, 'v']);
      expect(results[2]?.[0]?.message).toContain('WRONGTYPE');
      expect(results[2]?.[1]).toBeUndefined();
    });

    it('multi executa o lote inteiro sem intercalação', async () => {
      await redis.zadd('z', 1, 'old');

      const results = await redis
        .multi([
          ['zremrangebyscore', 'z', '-inf', '(5'],
          ['zcard', 'z'],
          ['zadd', 'z', 10, 'new'],
        ])
        .exec();

      expect(results).toEqual([
        [null, 1],
        [null, 0],
        [null, 1],
      ]);
    });

    it('comando desconhecido vira erro no resultado', async () => {
      const results = await redis.pipeline([['hset', 'h', 'f', 'v']]).exec();

      expect(results[0]?.[0]?.message).toContain('hset');
    });
  });

  describe('falha simulada e registro de comandos', () => {
    it('failWith faz todo comando (e o exec) rejeitar', async () => {
      redis.failWith = new Error('ECONNREFUSED');

      await expect(redis.get('a')).rejects.toThrow('ECONNREFUSED');
      await expect(redis.pipeline([['get', 'a']]).exec()).rejects.toThrow('ECONNREFUSED');
    });

    it('commands registra cada comando; flushall zera dados e registro', async () => {
      await redis.set('a', '1');
      await redis.multi([['get', 'a']]).exec();

      expect(redis.commands).toEqual(['set', 'get']);
      redis.flushall();
      expect(redis.commands).toEqual([]);
      expect(await redis.get('a')).toBeNull();
    });

    it('usa Date.now quando nenhum relógio é injetado', async () => {
      const real = new FakeRedis();
      await real.set('k', 'v', 'EX', 60);

      expect(await real.ttl('k')).toBe(60);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/support/redis/fakeRedis.test.ts --coverage=false`

Expected: FAIL — `Cannot find module './fakeRedis'`.

- [ ] **Step 3: Implementar**

Criar `tests/support/redis/fakeRedis.ts`:

```ts
// Redis em memória para os testes do cache e da presença. Não é arquivo de teste (não casa com
// testMatch). Implementa SÓ os comandos que o código usa, com a semântica do Redis 7 (validada
// contra um Redis real na escrita do plano): GET/SET (EX)/MGET/DEL, ZADD (XX)/ZREM/ZCOUNT/
// ZREMRANGEBYSCORE/ZCARD, PEXPIRE/TTL/PTTL, SCAN MATCH COUNT e pipeline/multi no formato de
// array do ioredis (`client.pipeline([['get', 'k'], ...]).exec()`).
//
// Os comandos rodam de forma síncrona por dentro (a Promise só embrulha o resultado): um
// `multi(...).exec()` é atômico como no Redis — nada se intercala entre os comandos do lote.
// O relógio é injetável (`clock`) para testar expiração sem esperar.

type Arg = string | number;

interface StringEntry {
  kind: 'string';
  value: string;
  expiresAt: number | null;
}

interface ZSetEntry {
  kind: 'zset';
  members: Map<string, number>;
  expiresAt: number | null;
}

type Entry = StringEntry | ZSetEntry;

export type ExecResult = [Error | null, unknown][];

export interface FakeBatch {
  exec(): Promise<ExecResult>;
}

const WRONGTYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';

/** Limite de score no formato do Redis: `-inf`, `+inf`, `123` (inclusivo) ou `(123` (exclusivo). */
function parseBound(raw: Arg): { value: number; exclusive: boolean } {
  const text = String(raw);
  const exclusive = text.startsWith('(');
  const body = exclusive ? text.slice(1) : text;
  if (body === '-inf') {
    return { value: -Infinity, exclusive };
  }
  if (body === '+inf' || body === 'inf') {
    return { value: Infinity, exclusive };
  }
  const value = Number(body);
  if (body === '' || Number.isNaN(value)) {
    throw new Error('ERR min or max is not a float');
  }
  return { value, exclusive };
}

function inRange(score: number, min: Arg, max: Arg): boolean {
  const low = parseBound(min);
  const high = parseBound(max);
  const aboveLow = low.exclusive ? score > low.value : score >= low.value;
  const belowHigh = high.exclusive ? score < high.value : score <= high.value;
  return aboveLow && belowHigh;
}

/** Glob do Redis para o MATCH do SCAN (`*`, `?` e literais). */
function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('')
    .map((char) => {
      if (char === '*') {
        return '.*';
      }
      if (char === '?') {
        return '.';
      }
      return char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

export class FakeRedis {
  private readonly data = new Map<string, Entry>();

  /** Quando preenchido, todo comando rejeita com este erro (simula o Redis fora do ar). */
  failWith: Error | null = null;

  /** Nome (minúsculo) de cada comando executado, na ordem — útil para contar idas ao Redis. */
  readonly commands: string[] = [];

  constructor(private readonly clock: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    return this.run('get', [key]) as string | null;
  }

  async set(key: string, value: string, ...options: Arg[]): Promise<'OK'> {
    return this.run('set', [key, value, ...options]) as 'OK';
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.run('mget', keys) as (string | null)[];
  }

  async del(...keys: string[]): Promise<number> {
    return this.run('del', keys) as number;
  }

  async zadd(key: string, ...args: Arg[]): Promise<number> {
    return this.run('zadd', [key, ...args]) as number;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.run('zrem', [key, ...members]) as number;
  }

  async zcount(key: string, min: Arg, max: Arg): Promise<number> {
    return this.run('zcount', [key, min, max]) as number;
  }

  async zremrangebyscore(key: string, min: Arg, max: Arg): Promise<number> {
    return this.run('zremrangebyscore', [key, min, max]) as number;
  }

  async zcard(key: string): Promise<number> {
    return this.run('zcard', [key]) as number;
  }

  async zscore(key: string, member: string): Promise<string | null> {
    return this.run('zscore', [key, member]) as string | null;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    return this.run('pexpire', [key, milliseconds]) as number;
  }

  async ttl(key: string): Promise<number> {
    return this.run('ttl', [key]) as number;
  }

  async pttl(key: string): Promise<number> {
    return this.run('pttl', [key]) as number;
  }

  async scan(
    cursor: Arg,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number
  ): Promise<[string, string[]]> {
    return this.run('scan', [cursor, matchToken, pattern, countToken, count]) as [string, string[]];
  }

  /** Lote sem atomicidade garantida no Redis real; aqui roda tudo de uma vez no `exec`. */
  pipeline(commands: Arg[][]): FakeBatch {
    return this.batch(commands);
  }

  /** MULTI/EXEC: o lote inteiro roda sem intercalação com outros comandos. */
  multi(commands: Arg[][]): FakeBatch {
    return this.batch(commands);
  }

  /** Chaves vivas (sem as expiradas), em ordem alfabética. */
  keys(): string[] {
    return [...this.data.keys()].filter((key) => this.entry(key) !== undefined).sort();
  }

  flushall(): void {
    this.data.clear();
    this.commands.length = 0;
  }

  private batch(commands: Arg[][]): FakeBatch {
    return {
      exec: async (): Promise<ExecResult> => {
        if (this.failWith !== null) {
          throw this.failWith;
        }
        return commands.map(([name, ...args]): [Error | null, unknown] => {
          try {
            return [null, this.execute(String(name).toLowerCase(), args)];
          } catch (error) {
            return [error as Error, undefined];
          }
        });
      },
    };
  }

  private run(name: string, args: Arg[]): unknown {
    if (this.failWith !== null) {
      throw this.failWith;
    }
    return this.execute(name, args);
  }

  /** Entrada viva da chave (remove a expirada, como o acesso preguiçoso do Redis). */
  private entry(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (entry?.expiresAt != null && entry.expiresAt <= this.clock()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  private zset(key: string): ZSetEntry | undefined {
    const entry = this.entry(key);
    if (entry !== undefined && entry.kind !== 'zset') {
      throw new Error(WRONGTYPE);
    }
    return entry;
  }

  private execute(name: string, args: Arg[]): unknown {
    this.commands.push(name);
    const [first] = args;
    const key = String(first);
    switch (name) {
      case 'get': {
        const entry = this.entry(key);
        if (entry !== undefined && entry.kind !== 'string') {
          throw new Error(WRONGTYPE);
        }
        return entry?.value ?? null;
      }
      case 'set': {
        const [, value, ...options] = args;
        let expiresAt: number | null = null;
        for (let i = 0; i < options.length; i++) {
          const option = String(options[i]).toUpperCase();
          if (option === 'EX' || option === 'PX') {
            const amount = Number(options[++i]);
            expiresAt = this.clock() + (option === 'EX' ? amount * 1000 : amount);
          }
        }
        this.data.set(key, { kind: 'string', value: String(value), expiresAt });
        return 'OK';
      }
      case 'mget':
        return args.map((k) => {
          const entry = this.entry(String(k));
          return entry?.kind === 'string' ? entry.value : null;
        });
      case 'del':
        return args.filter(
          (k) => this.entry(String(k)) !== undefined && this.data.delete(String(k))
        ).length;
      case 'zadd': {
        const rest = args.slice(1);
        const onlyExisting = String(rest[0]).toUpperCase() === 'XX';
        const pairs = onlyExisting ? rest.slice(1) : rest;
        let entry = this.zset(key);
        if (entry === undefined) {
          if (onlyExisting) {
            return 0;
          }
          entry = { kind: 'zset', members: new Map(), expiresAt: null };
          this.data.set(key, entry);
        }
        let added = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          const member = String(pairs[i + 1]);
          const exists = entry.members.has(member);
          if (onlyExisting && !exists) {
            continue;
          }
          if (!exists) {
            added++;
          }
          entry.members.set(member, Number(pairs[i]));
        }
        return added;
      }
      case 'zrem': {
        const entry = this.zset(key);
        if (entry === undefined) {
          return 0;
        }
        const removed = args
          .slice(1)
          .filter((member) => entry.members.delete(String(member))).length;
        this.dropIfEmpty(key, entry);
        return removed;
      }
      case 'zcount': {
        const [, min = '-inf', max = '+inf'] = args;
        const entry = this.zset(key);
        return entry === undefined
          ? 0
          : [...entry.members.values()].filter((score) => inRange(score, min, max)).length;
      }
      case 'zremrangebyscore': {
        const [, min = '-inf', max = '+inf'] = args;
        const entry = this.zset(key);
        if (entry === undefined) {
          return 0;
        }
        let removed = 0;
        for (const [member, score] of entry.members) {
          if (inRange(score, min, max)) {
            entry.members.delete(member);
            removed++;
          }
        }
        this.dropIfEmpty(key, entry);
        return removed;
      }
      case 'zcard':
        return this.zset(key)?.members.size ?? 0;
      case 'zscore': {
        const score = this.zset(key)?.members.get(String(args[1]));
        return score === undefined ? null : String(score);
      }
      case 'pexpire': {
        const entry = this.entry(key);
        if (entry === undefined) {
          return 0;
        }
        entry.expiresAt = this.clock() + Number(args[1]);
        return 1;
      }
      case 'ttl':
      case 'pttl': {
        const entry = this.entry(key);
        if (entry === undefined) {
          return -2;
        }
        if (entry.expiresAt === null) {
          return -1;
        }
        const remaining = entry.expiresAt - this.clock();
        return name === 'ttl' ? Math.round(remaining / 1000) : remaining;
      }
      case 'scan': {
        const pattern = globToRegExp(String(args[2]));
        const count = Number(args[4]);
        const all = this.keys();
        const start = Number(first);
        const end = start + count;
        const next = end >= all.length ? '0' : String(end);
        return [next, all.slice(start, end).filter((k) => pattern.test(k))];
      }
      default:
        throw new Error(`ERR comando não suportado pelo FakeRedis: ${name}`);
    }
  }

  /** O Redis apaga o sorted set que fica vazio. */
  private dropIfEmpty(key: string, entry: ZSetEntry): void {
    if (entry.members.size === 0) {
      this.data.delete(key);
    }
  }
}
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/support/redis/fakeRedis.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write tests/support/redis/fakeRedis.test.ts tests/support/redis/fakeRedis.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add tests/support/redis/fakeRedis.test.ts \
  tests/support/redis/fakeRedis.ts
git commit -m "✅ test: adiciona FakeRedis (Redis em memória) com contrato conferido contra o Redis 7"
```


---

### Task 3: `CacheService` (JSON, TTL, lote e degradação)

**Files:**
- Create: `src/shared/cache/CacheService.ts`
- Create: `src/shared/cache/cache.constants.ts`
- Create: `src/shared/cache/cache.types.ts`
- Create: `src/shared/cache/index.ts`
- Create: `tests/unit/shared/cache/CacheService.test.ts`

**Interfaces:**
- Consumes: `FakeRedis` (Task 2) nos testes.
- Produces: `@/shared/cache` exporta `CACHE_CONSTANTS = { KEY_PREFIX: 'cache:', DEFAULT_TTL_SECONDS: 300 }`, os tipos `RedisCommand = (string | number)[]`, `RedisBatch { exec(): Promise<[Error | null, unknown][] | null> }`, `CacheClient` (get/mget/set EX/del/pipeline), `ICacheService { get<T>(key): Promise<T | null>; mget<T>(keys): Promise<(T | null)[]>; set(key, value, ttlSeconds?); setMany(entries: [string, unknown][], ttlSeconds?); del(keys: string | string[]); getOrLoad<T>(key, ttlSeconds, loader): Promise<T> }`, `class CacheService implements ICacheService` (`constructor(client: CacheClient = redis, defaultTtlSeconds = 300)`) e o singleton `cacheService`. As chaves recebidas NÃO levam o prefixo (`cache.set('user:1', ...)` grava `cache:user:1`).

Cache genérico do spec §6 em `src/shared/cache` (não importa nada de `src/modules`). O construtor recebe o cliente (padrão: o `redis` da aplicação) e o TTL padrão; toda falha do Redis — conexão, timeout, valor corrompido, erro de um comando do pipeline — vira `logger.warn` e comportamento de "não estava no cache".

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/unit/shared/cache/CacheService.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/logger', () => ({ logger: { warn: jest.fn() } }));

import { CACHE_CONSTANTS, CacheService, cacheService, type CacheClient } from '@/shared/cache';
import { logger } from '@/shared/logger';
import { FakeRedis } from '../../../support/redis/fakeRedis';

describe('CacheService', () => {
  let now: number;
  let redis: FakeRedis;
  let cache: CacheService;

  beforeEach(() => {
    now = 1_000_000;
    redis = new FakeRedis(() => now);
    cache = new CacheService(redis);
  });

  it('exporta a instância padrão (Redis da aplicação) e as constantes', () => {
    expect(cacheService).toBeInstanceOf(CacheService);
    expect(CACHE_CONSTANTS).toEqual({ KEY_PREFIX: 'cache:', DEFAULT_TTL_SECONDS: 300 });
  });

  describe('get/set', () => {
    it('grava JSON com o prefixo cache: e TTL padrão de 300 s', async () => {
      await cache.set('user:1', { id: '1', tags: ['a'] });

      expect(await redis.get('cache:user:1')).toBe('{"id":"1","tags":["a"]}');
      expect(await redis.ttl('cache:user:1')).toBe(300);
      expect(await cache.get('user:1')).toEqual({ id: '1', tags: ['a'] });
    });

    it('TTL explícito no set e TTL padrão configurável no construtor', async () => {
      const shortLived = new CacheService(redis, 60);

      await cache.set('a', 1, 10);
      await shortLived.set('b', 2);

      expect(await redis.ttl('cache:a')).toBe(10);
      expect(await redis.ttl('cache:b')).toBe(60);
    });

    it('ausente ou expirado → null', async () => {
      await cache.set('k', 'v', 1);
      now += 1000;

      expect(await cache.get('k')).toBeNull();
      expect(await cache.get('nunca')).toBeNull();
    });
  });

  describe('mget/setMany', () => {
    it('mget devolve na ordem das chaves, null para ausentes', async () => {
      await cache.setMany([
        ['a', { n: 1 }],
        ['c', { n: 3 }],
      ]);

      expect(await cache.mget(['a', 'b', 'c'])).toEqual([{ n: 1 }, null, { n: 3 }]);
      expect(await redis.ttl('cache:c')).toBe(300);
    });

    it('setMany aceita TTL explícito', async () => {
      await cache.setMany([['a', 1]], 30);

      expect(await redis.ttl('cache:a')).toBe(30);
    });

    it('listas vazias não vão ao Redis', async () => {
      expect(await cache.mget([])).toEqual([]);
      await cache.setMany([]);
      await cache.del([]);

      expect(redis.commands).toEqual([]);
    });
  });

  describe('del', () => {
    it('apaga uma ou várias chaves (com o prefixo)', async () => {
      await cache.setMany([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      await cache.del('a');
      await cache.del(['b', 'c']);

      expect(redis.keys()).toEqual([]);
    });
  });

  describe('getOrLoad', () => {
    it('miss → chama o loader uma vez e cacheia; hit → não chama de novo', async () => {
      const loader = jest.fn().mockResolvedValue(['x', 'y']);

      expect(await cache.getOrLoad('list', 120, loader)).toEqual(['x', 'y']);
      expect(await cache.getOrLoad('list', 120, loader)).toEqual(['x', 'y']);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(await redis.ttl('cache:list')).toBe(120);
    });

    it('erro do loader propaga e nada é cacheado', async () => {
      const loader = jest.fn().mockRejectedValue(new Error('db down'));

      await expect(cache.getOrLoad('list', 120, loader)).rejects.toThrow('db down');
      expect(redis.keys()).toEqual([]);
    });
  });

  describe('Redis indisponível → degrada para a fonte, com log warn', () => {
    beforeEach(() => {
      redis.failWith = new Error('ECONNREFUSED');
    });

    it('get/mget viram miss; set/setMany/del não lançam', async () => {
      expect(await cache.get('a')).toBeNull();
      expect(await cache.mget(['a', 'b'])).toEqual([null, null]);
      await expect(cache.set('a', 1)).resolves.toBeUndefined();
      await expect(cache.setMany([['a', 1]])).resolves.toBeUndefined();
      await expect(cache.del(['a'])).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(5);
      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'get',
        key: 'a',
        error: 'ECONNREFUSED',
      });
      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'del',
        keys: ['a'],
        error: 'ECONNREFUSED',
      });
    });

    it('getOrLoad responde com o loader', async () => {
      const loader = jest.fn().mockResolvedValue([1]);

      expect(await cache.getOrLoad('k', 60, loader)).toEqual([1]);
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('falhas parciais', () => {
    it('valor corrompido no Redis vira miss com warn', async () => {
      await redis.set('cache:k', '{nao-e-json');

      expect(await cache.get('k')).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Cache Redis indisponível; seguindo sem cache',
        expect.objectContaining({ operation: 'get', key: 'k' })
      );
    });

    it('erro de um comando do pipeline do setMany é logado', async () => {
      const client = {
        pipeline: () => ({
          exec: async () => [[new Error('OOM command not allowed'), undefined]],
        }),
      } as unknown as CacheClient;

      await new CacheService(client).setMany([['a', 1]]);

      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'setMany',
        keys: 1,
        error: 'OOM command not allowed',
      });
    });

    it('pipeline sem resultados (exec → null) não é tratado como erro', async () => {
      const client = {
        pipeline: () => ({ exec: async () => null }),
      } as unknown as CacheClient;

      await new CacheService(client).setMany([['a', 1]]);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rejeição que não é Error também é descrita no log', async () => {
      const client = {
        get: () => Promise.reject(new Error('x')),
        mget: () => Promise.reject('timeout'),
      } as unknown as CacheClient;

      expect(await new CacheService(client).mget(['a'])).toEqual([null]);
      expect(logger.warn).toHaveBeenCalledWith('Cache Redis indisponível; seguindo sem cache', {
        operation: 'mget',
        keys: 1,
        error: 'timeout',
      });
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/shared/cache/CacheService.test.ts --coverage=false`

Expected: FAIL — `Could not locate module @/shared/cache` (Test suite failed to run).

- [ ] **Step 3: Implementar**

Criar `src/shared/cache/CacheService.ts`:

```ts
import { redis } from '../database/redis';
import { logger } from '../logger';
import { CACHE_CONSTANTS } from './cache.constants';
import type { CacheClient, ICacheService } from './cache.types';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Cache JSON sobre o Redis (chaves `cache:*`, TTL padrão de 300 s). O Redis é um acelerador,
 * nunca uma dependência: qualquer falha (conexão, timeout, valor corrompido) vira log `warn` e
 * o comportamento de "não estava no cache" — quem chamou segue com a fonte da verdade.
 *
 * Datas voltam como strings ISO (JSON): quem cacheia objetos com `Date` reconstrói os campos.
 */
export class CacheService implements ICacheService {
  constructor(
    private readonly client: CacheClient = redis,
    private readonly defaultTtlSeconds: number = CACHE_CONSTANTS.DEFAULT_TTL_SECONDS
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(this.key(key));
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.warn('get', error, { key });
      return null;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) {
      return [];
    }
    try {
      const raws = await this.client.mget(...keys.map((key) => this.key(key)));
      return raws.map((raw) => (raw === null ? null : (JSON.parse(raw) as T)));
    } catch (error) {
      this.warn('mget', error, { keys: keys.length });
      return keys.map(() => null);
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<void> {
    try {
      await this.client.set(this.key(key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warn('set', error, { key });
    }
  }

  async setMany(
    entries: [string, unknown][],
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    try {
      const results = await this.client
        .pipeline(
          entries.map(([key, value]) => [
            'set',
            this.key(key),
            JSON.stringify(value),
            'EX',
            ttlSeconds,
          ])
        )
        .exec();
      const failure = results
        ?.map(([error]) => error)
        .find((error): error is Error => error !== null);
      if (failure !== undefined) {
        throw failure;
      }
    } catch (error) {
      this.warn('setMany', error, { keys: entries.length });
    }
  }

  async del(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) {
      return;
    }
    try {
      await this.client.del(...list.map((key) => this.key(key)));
    } catch (error) {
      this.warn('del', error, { keys: list });
    }
  }

  async getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  private key(key: string): string {
    return `${CACHE_CONSTANTS.KEY_PREFIX}${key}`;
  }

  private warn(operation: string, error: unknown, context: Record<string, unknown>): void {
    logger.warn('Cache Redis indisponível; seguindo sem cache', {
      operation,
      ...context,
      error: describeError(error),
    });
  }
}

export const cacheService = new CacheService();
```

Criar `src/shared/cache/cache.constants.ts`:

```ts
export const CACHE_CONSTANTS = {
  /** Toda chave do cache começa com este prefixo (`cache:user:<id>`, ...). */
  KEY_PREFIX: 'cache:',
  /** TTL padrão (s): garante convergência se um evento de invalidação se perder. */
  DEFAULT_TTL_SECONDS: 300,
} as const;
```

Criar `src/shared/cache/cache.types.ts`:

```ts
/** Um comando no formato de array do ioredis: `['set', 'chave', 'valor', 'EX', 300]`. */
export type RedisCommand = (string | number)[];

/** Lote (`pipeline`/`multi`): `exec` devolve `[erro, resultado]` por comando, na ordem. */
export interface RedisBatch {
  exec(): Promise<[Error | null, unknown][] | null>;
}

/** Os comandos do Redis que o cache usa (o `Redis` do ioredis satisfaz esta interface). */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  pipeline(commands: RedisCommand[]): RedisBatch;
}

/**
 * Cache JSON sobre o Redis. Toda chave recebe o prefixo `cache:`; toda falha do Redis degrada
 * para "sem cache" (log `warn`) e nunca quebra quem chamou. `null` não é cacheável (é o valor
 * de "não está no cache").
 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  /** Na ordem de `keys`; `null` para ausentes (ou para todas, se o Redis falhar). */
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  /** Grava várias chaves num único pipeline, todas com o mesmo TTL. */
  setMany(entries: [string, unknown][], ttlSeconds?: number): Promise<void>;
  del(keys: string | string[]): Promise<void>;
  /** Devolve o valor cacheado ou chama `loader`, grava o resultado com o TTL e o devolve. */
  getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}
```

Criar `src/shared/cache/index.ts`:

```ts
export { CacheService, cacheService } from './CacheService';
export { CACHE_CONSTANTS } from './cache.constants';
export type { CacheClient, ICacheService, RedisBatch, RedisCommand } from './cache.types';
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/shared/cache/CacheService.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/shared/cache/CacheService.ts src/shared/cache/cache.constants.ts src/shared/cache/cache.types.ts src/shared/cache/index.ts tests/unit/shared/cache/CacheService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/shared/cache/CacheService.ts \
  src/shared/cache/cache.constants.ts \
  src/shared/cache/cache.types.ts \
  src/shared/cache/index.ts \
  tests/unit/shared/cache/CacheService.test.ts
git commit -m "✨ feat: adiciona CacheService com TTL, lote e degradação sem Redis"
```


---

### Task 4: Contatos: consultas da audiência e cache de bloqueios

**Files:**
- Create: `src/modules/user/constants/cache.constants.ts`
- Modify: `src/modules/user/constants/index.ts`
- Modify: `src/modules/user/index.ts`
- Modify: `src/modules/user/interfaces/IContactRepository.ts`
- Modify: `src/modules/user/interfaces/IContactService.ts`
- Create: `src/modules/user/listeners/index.ts`
- Create: `src/modules/user/listeners/user.listeners.ts`
- Modify: `src/modules/user/repositories/ContactRepository.ts`
- Modify: `src/modules/user/services/ContactService.ts`
- Modify: `tests/unit/modules/user/constants/index.test.ts`
- Modify: `tests/unit/modules/user/controllers/ContactController.test.ts`
- Modify: `tests/unit/modules/user/index.test.ts`
- Create: `tests/unit/modules/user/listeners/user.listeners.test.ts`
- Modify: `tests/unit/modules/user/repositories/ContactRepository.test.ts`
- Modify: `tests/unit/modules/user/services/ContactService.test.ts`

**Interfaces:**
- Consumes: `CacheService`/`ICacheService` (Task 3), `FakeRedis` (Task 2), `UserEvents` (Task 1).
- Produces: `USER_CACHE_KEYS.publicUser(id) = 'user:<id>'`, `USER_CACHE_KEYS.blocks(id) = 'blocks:<id>'`, `USER_CACHE_TTL_SECONDS = 300` (em `@/modules/user/constants`).
- Produces: `IContactRepository.listWatcherIds(userId)`, `listContactIds(userId)`, `listBlockedEitherIds(userId)` (todos `Promise<string[]>`) e `findByUserAndContactIds(userId, contactIds): Promise<ContactWithUser[]>`.
- Produces: `IContactService.listWatchers(userId)`, `listContactIds(userId)`, `listBlockedEitherIds(userId)` (cacheado) e `getContactsByIds(userId, contactIds)`; `new ContactService(contacts?, users?, events?, cache?: Pick<ICacheService, 'getOrLoad'>)`.
- Produces: `registerUserCacheListeners(bus = eventBus, cache = cacheService): () => void` (exportado também pelo barrel `@/modules/user`).

O repositório de contatos ganha as consultas que a presença usa (quem observa o usuário, os contatos dele, os bloqueios nos dois sentidos numa consulta só, as linhas de um conjunto de contatos) e o `ContactService` passa a cachear os bloqueios em `cache:blocks:<id>` — `isBlockedByEither`, chamado a cada mensagem 1:1 enviada, vira uma leitura cacheada. A invalidação (`user:blocked`/`unblocked`, e `user:updated`/`deleted` para o perfil da Task 5) fica em `registerUserCacheListeners`. O mapeamento repetido linha → `ContactWithUser` do repositório é extraído para `toContactWithUser`.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/user/constants/index.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  CONTACT_CONSTANTS,
  CONTACT_ORDER_BY,
} from '@/modules/user/constants';

```

por:

```ts
  CONTACT_CONSTANTS,
  CONTACT_ORDER_BY,
  USER_CACHE_KEYS,
  USER_CACHE_TTL_SECONDS,
} from '@/modules/user/constants';

```

2. Substituir:

```ts
    expect(CONTACT_ORDER_BY).toBeDefined();
  });
});
```

por:

```ts
    expect(CONTACT_ORDER_BY).toBeDefined();
  });

  it('deve exportar as chaves e o TTL do cache do módulo', () => {
    expect(USER_CACHE_KEYS.publicUser('u1')).toBe('user:u1');
    expect(USER_CACHE_KEYS.blocks('u1')).toBe('blocks:u1');
    expect(USER_CACHE_TTL_SECONDS).toBe(300);
  });
});
```

Em `tests/unit/modules/user/controllers/ContactController.test.ts`, substituir:

```ts
    searchUsers: jest.fn(),
    recordInteraction: jest.fn(),
  };
}
```

por:

```ts
    searchUsers: jest.fn(),
    recordInteraction: jest.fn(),
    listWatchers: jest.fn(),
    listContactIds: jest.fn(),
    listBlockedEitherIds: jest.fn(),
    getContactsByIds: jest.fn(),
  };
}
```

Em `tests/unit/modules/user/index.test.ts`, substituir:

```ts
      expect(userModuleIndex.userRoutes).toBeDefined();
    });
  });

```

por:

```ts
      expect(userModuleIndex.userRoutes).toBeDefined();
    });

    it('deve exportar os listeners de invalidação do cache', () => {
      expect(userModuleIndex.registerUserCacheListeners).toBeInstanceOf(Function);
    });
  });

```

Criar `tests/unit/modules/user/listeners/user.listeners.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { registerUserCacheListeners } from '@/modules/user/listeners';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import { UserEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

describe('registerUserCacheListeners', () => {
  let bus: EventBus;
  let redis: FakeRedis;
  let unregister: () => void;

  beforeEach(async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    redis = new FakeRedis();
    unregister = registerUserCacheListeners(bus, new CacheService(redis));
    for (const key of ['user:u1', 'user:u2', 'blocks:u1', 'blocks:u2', 'blocks:u3']) {
      await redis.set(`cache:${key}`, '[]');
    }
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it('user:updated e user:deleted apagam o perfil público do usuário', async () => {
    await bus.publish(UserEvents.UPDATED, { userId: 'u1', fields: ['displayName'] });
    await bus.publish(UserEvents.DELETED, { userId: 'u2' });

    expect(redis.keys()).toEqual(['cache:blocks:u1', 'cache:blocks:u2', 'cache:blocks:u3']);
  });

  it('user:blocked e user:unblocked apagam o conjunto de bloqueios dos dois envolvidos', async () => {
    await bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });

    expect(redis.keys()).toEqual(['cache:blocks:u3', 'cache:user:u1', 'cache:user:u2']);

    await bus.publish(UserEvents.UNBLOCKED, { userId: 'u3', unblockedUserId: 'u1' });

    expect(redis.keys()).toEqual(['cache:user:u1', 'cache:user:u2']);
  });

  it('a invalidação termina antes de o publish resolver (subscriber síncrono)', async () => {
    const pending = bus.publish(UserEvents.BLOCKED, { userId: 'u1', blockedUserId: 'u2' });

    await pending;

    expect(await redis.get('cache:blocks:u1')).toBeNull();
  });

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o cache da aplicação', async () => {
    unregister();
    await bus.publish(UserEvents.UPDATED, { userId: 'u1', fields: [] });

    expect(await redis.get('cache:user:u1')).toBe('[]');
    expect(registerUserCacheListeners()).toBeInstanceOf(Function);
  });
});
```

Em `tests/unit/modules/user/repositories/ContactRepository.test.ts`, substituir:

```ts
    });
  });
});
```

por:

```ts
    });
  });

  describe('consultas da presença', () => {
    it('listWatcherIds: quem tem o usuário como contato não bloqueado', async () => {
      MockContact.findAll.mockResolvedValue([{ userId: 'w1' }, { userId: 'w2' }] as any);

      const result = await repository.listWatcherIds('user-123');

      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: { contactId: 'user-123', isBlocked: false },
        attributes: ['userId'],
      });
      expect(result).toEqual(['w1', 'w2']);
    });

    it('listContactIds: contatos não bloqueados do usuário', async () => {
      MockContact.findAll.mockResolvedValue([{ contactId: 'c1' }] as any);

      const result = await repository.listContactIds('user-123');

      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-123', isBlocked: false },
        attributes: ['contactId'],
      });
      expect(result).toEqual(['c1']);
    });

    it('listBlockedEitherIds: os dois sentidos numa consulta, sem repetição', async () => {
      MockContact.findAll.mockResolvedValue([
        { userId: 'user-123', contactId: 'b1' },
        { userId: 'b2', contactId: 'user-123' },
        { userId: 'b1', contactId: 'user-123' },
      ] as any);

      const result = await repository.listBlockedEitherIds('user-123');

      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: {
          isBlocked: true,
          [Op.or]: [{ userId: 'user-123' }, { contactId: 'user-123' }],
        },
        attributes: ['userId', 'contactId'],
      });
      expect(result).toEqual(['b1', 'b2']);
    });

    it('findByUserAndContactIds: contatos não bloqueados entre os ids, com o usuário', async () => {
      const publicUser = { id: 'c1', username: 'c1', displayName: null, avatarUrl: null };
      const row = {
        contactId: 'c1',
        toJSON: () => ({ id: 'row-1', contactId: 'c1' }),
        contact: { toPublicJSON: () => publicUser },
      };
      MockContact.findAll.mockResolvedValue([row] as any);

      const result = await repository.findByUserAndContactIds('user-123', ['c1', 'c2']);

      expect(MockContact.findAll).toHaveBeenCalledWith({
        where: { userId: 'user-123', contactId: { [Op.in]: ['c1', 'c2'] }, isBlocked: false },
        include: [
          {
            model: expect.anything(),
            as: 'contact',
            attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
          },
        ],
      });
      expect(result).toEqual([{ id: 'row-1', contactId: 'c1', contact: publicUser }]);
    });

    it('findByUserAndContactIds: lista vazia não consulta', async () => {
      await expect(repository.findByUserAndContactIds('user-123', [])).resolves.toEqual([]);
      expect(MockContact.findAll).not.toHaveBeenCalled();
    });
  });
});
```

Em `tests/unit/modules/user/services/ContactService.test.ts` (10 trechos, na ordem):

1. Substituir:

```ts
    unblock: jest.fn(),
    touchInteraction: jest.fn(),
  },
  userRepository: {
```

por:

```ts
    unblock: jest.fn(),
    touchInteraction: jest.fn(),
    listWatcherIds: jest.fn(),
    listContactIds: jest.fn(),
    listBlockedEitherIds: jest.fn(),
    findByUserAndContactIds: jest.fn(),
  },
  userRepository: {
```

2. Substituir:

```ts
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';

const mockContactRepository = contactRepository as jest.Mocked<typeof contactRepository>;
const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

describe('ContactService', () => {
  let contactService: ContactService;

  const mockUser = {
```

por:

```ts
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const mockContactRepository = contactRepository as jest.Mocked<typeof contactRepository>;
const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

describe('ContactService', () => {
  let contactService: ContactService;
  let redis: FakeRedis;

  const mockUser = {
```

3. Substituir:

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    contactService = new ContactService(mockContactRepository, mockUserRepository);
  });

```

por:

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    redis = new FakeRedis();
    contactService = new ContactService(
      mockContactRepository,
      mockUserRepository,
      undefined,
      new CacheService(redis)
    );
  });

```

4. Substituir:

```ts
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValue(false);
      mockContactRepository.create.mockResolvedValue(mockContact);

```

por:

```ts
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.listBlockedEitherIds.mockResolvedValue([]);
      mockContactRepository.create.mockResolvedValue(mockContact);

```

5. Substituir:

```ts
        'contact-456'
      );
      expect(mockContactRepository.isBlocked).toHaveBeenCalledWith('user-123', 'contact-456');
      expect(mockContactRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
```

por:

```ts
        'contact-456'
      );
      expect(mockContactRepository.listBlockedEitherIds).toHaveBeenCalledWith('user-123');
      expect(mockContactRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
```

6. Substituir:

```ts
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValue(false);
      mockContactRepository.create.mockResolvedValue({ ...mockContact, nickname: null });

```

por:

```ts
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.listBlockedEitherIds.mockResolvedValue([]);
      mockContactRepository.create.mockResolvedValue({ ...mockContact, nickname: null });

```

7. Substituir:

```ts
    it('deve lançar ContactAlreadyExistsException quando contato já existe', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);

```

por:

```ts
    it('deve lançar ContactAlreadyExistsException quando contato já existe', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.listBlockedEitherIds.mockResolvedValue([]);
      mockContactRepository.findByUserAndContact.mockResolvedValue(mockContact);

```

8. Substituir:

```ts
    });

    it('deve lançar UserBlockedException quando usuário está bloqueado', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValue(true);

      await expect(
        contactService.addContact('user-123', { contactId: 'contact-456' })
      ).rejects.toThrow(UserBlockedException);
    });

    it('deve lançar UserBlockedException quando o alvo bloqueou o usuário (direção reversa)', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.isBlocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await expect(
```

por:

```ts
    });

    it('deve lançar UserBlockedException quando há bloqueio em qualquer sentido', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.findByUserAndContact.mockResolvedValue(null);
      mockContactRepository.listBlockedEitherIds.mockResolvedValue(['contact-456']);

      await expect(
```

9. Substituir:

```ts
    it('deve lançar UserBlockedException (403) mesmo quando já existe um contato criado pelo bloqueio, sem consultar findByUserAndContact antes', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.isBlocked.mockResolvedValue(true);
      mockContactRepository.findByUserAndContact.mockResolvedValue({
        ...mockContact,
```

por:

```ts
    it('deve lançar UserBlockedException (403) mesmo quando já existe um contato criado pelo bloqueio, sem consultar findByUserAndContact antes', async () => {
      mockUserRepository.findById.mockResolvedValue(mockContactUser);
      mockContactRepository.listBlockedEitherIds.mockResolvedValue(['contact-456']);
      mockContactRepository.findByUserAndContact.mockResolvedValue({
        ...mockContact,
```

10. Substituir:

```ts

  describe('isBlockedByEither', () => {
    it('deve retornar true quando userId bloqueou targetId', async () => {
      mockContactRepository.isBlocked.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(true);
    });

    it('deve retornar true quando targetId bloqueou userId', async () => {
      mockContactRepository.isBlocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(true);
    });

    it('deve retornar false quando nenhum bloqueou o outro', async () => {
      mockContactRepository.isBlocked.mockResolvedValue(false);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(false);
    });

    it('deve retornar true quando ambos se bloquearam', async () => {
      mockContactRepository.isBlocked.mockResolvedValue(true);

      const result = await contactService.isBlockedByEither('user-123', 'contact-456');

      expect(result).toBe(true);
    });
  });
```

por:

```ts

  describe('isBlockedByEither', () => {
    it('deve retornar true quando o alvo está no conjunto de bloqueios (qualquer sentido)', async () => {
      mockContactRepository.listBlockedEitherIds.mockResolvedValue(['contact-456']);

      await expect(contactService.isBlockedByEither('user-123', 'contact-456')).resolves.toBe(true);
      expect(mockContactRepository.listBlockedEitherIds).toHaveBeenCalledWith('user-123');
    });

    it('deve retornar false quando não há bloqueio entre os dois', async () => {
      mockContactRepository.listBlockedEitherIds.mockResolvedValue(['outro']);

      await expect(contactService.isBlockedByEither('user-123', 'contact-456')).resolves.toBe(
        false
      );
    });
  });

  describe('listBlockedEitherIds (cache:blocks:<id>)', () => {
    it('consulta o repositório uma vez e serve as próximas do cache (TTL 300 s)', async () => {
      mockContactRepository.listBlockedEitherIds.mockResolvedValue(['b1']);

      expect(await contactService.listBlockedEitherIds('user-123')).toEqual(['b1']);
      expect(await contactService.isBlockedByEither('user-123', 'b1')).toBe(true);

      expect(mockContactRepository.listBlockedEitherIds).toHaveBeenCalledTimes(1);
      expect(await redis.get('cache:blocks:user-123')).toBe('["b1"]');
      expect(await redis.ttl('cache:blocks:user-123')).toBe(300);
    });
  });

  describe('consultas da audiência de presença', () => {
    it('listWatchers delega ao repositório (quem tem o usuário como contato)', async () => {
      mockContactRepository.listWatcherIds.mockResolvedValue(['w1']);

      await expect(contactService.listWatchers('user-123')).resolves.toEqual(['w1']);
      expect(mockContactRepository.listWatcherIds).toHaveBeenCalledWith('user-123');
    });

    it('listContactIds delega ao repositório', async () => {
      mockContactRepository.listContactIds.mockResolvedValue(['c1']);

      await expect(contactService.listContactIds('user-123')).resolves.toEqual(['c1']);
      expect(mockContactRepository.listContactIds).toHaveBeenCalledWith('user-123');
    });

    it('getContactsByIds delega ao repositório', async () => {
      mockContactRepository.findByUserAndContactIds.mockResolvedValue([]);

      await expect(contactService.getContactsByIds('user-123', ['c1'])).resolves.toEqual([]);
      expect(mockContactRepository.findByUserAndContactIds).toHaveBeenCalledWith('user-123', [
        'c1',
      ]);
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/user/constants/index.test.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/index.test.ts tests/unit/modules/user/listeners/user.listeners.test.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts --coverage=false`

Expected: FAIL — 16 testes (métodos novos do repositório e do service inexistentes; `addContact`/`isBlockedByEither` ainda consultam `isBlocked`; `USER_CACHE_KEYS` e `registerUserCacheListeners` indefinidos).

- [ ] **Step 3: Implementar**

Criar `src/modules/user/constants/cache.constants.ts`:

```ts
/** Chaves do cache do módulo user (o `CacheService` acrescenta o prefixo `cache:`). */
export const USER_CACHE_KEYS = {
  /** `PublicUserDTO` do usuário. */
  publicUser: (userId: string): string => `user:${userId}`,
  /** Ids com bloqueio em qualquer sentido com o usuário. */
  blocks: (userId: string): string => `blocks:${userId}`,
} as const;

/** TTL (s) das chaves do módulo user: a invalidação é por evento; o TTL só garante convergência. */
export const USER_CACHE_TTL_SECONDS = 300;
```

Em `src/modules/user/constants/index.ts`, substituir:

```ts

export { CONTACT_CONSTANTS, CONTACT_ORDER_BY, type ContactOrderBy } from './contact.constants';
```

por:

```ts

export { CONTACT_CONSTANTS, CONTACT_ORDER_BY, type ContactOrderBy } from './contact.constants';

export { USER_CACHE_KEYS, USER_CACHE_TTL_SECONDS } from './cache.constants';
```

Em `src/modules/user/index.ts`, substituir:

```ts

export { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './routes';
```

por:

```ts

export { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './routes';

export { registerUserCacheListeners } from './listeners';
```

Em `src/modules/user/interfaces/IContactRepository.ts`, substituir:

```ts
  /** Grava `last_interaction_at` nas linhas de contato dos dois sentidos, se existirem. */
  touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void>;
}
```

por:

```ts
  /** Grava `last_interaction_at` nas linhas de contato dos dois sentidos, se existirem. */
  touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void>;
  /** Ids de quem tem `userId` como contato (linha não bloqueada). */
  listWatcherIds(userId: string): Promise<string[]>;
  /** Ids dos contatos (não bloqueados) de `userId`. */
  listContactIds(userId: string): Promise<string[]>;
  /** Ids com bloqueio em qualquer sentido com `userId` (sem repetição). */
  listBlockedEitherIds(userId: string): Promise<string[]>;
  /** Contatos não bloqueados de `userId` entre `contactIds`, com o usuário de cada um. */
  findByUserAndContactIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]>;
}
```

Em `src/modules/user/interfaces/IContactService.ts`, substituir:

```ts
    options?: { limit?: number; excludeBlocked?: boolean }
  ): Promise<PublicUserDTO[]>;
}
```

por:

```ts
    options?: { limit?: number; excludeBlocked?: boolean }
  ): Promise<PublicUserDTO[]>;
  /** Quem tem `userId` como contato não bloqueado (audiência da presença). */
  listWatchers(userId: string): Promise<string[]>;
  /** Ids dos contatos não bloqueados de `userId`. */
  listContactIds(userId: string): Promise<string[]>;
  /** Ids com bloqueio em qualquer sentido com `userId` (cacheado em `cache:blocks:<id>`). */
  listBlockedEitherIds(userId: string): Promise<string[]>;
  /** Contatos não bloqueados de `userId` entre `contactIds` (ex.: os que estão online). */
  getContactsByIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]>;
}
```

Criar `src/modules/user/listeners/index.ts`:

```ts
export { registerUserCacheListeners } from './user.listeners';
```

Criar `src/modules/user/listeners/user.listeners.ts`:

```ts
import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { UserEvents } from '@/shared/types';
import { USER_CACHE_KEYS } from '../constants';

/**
 * Invalidação do cache do módulo user pelo EventBus. Os subscribers são síncronos e devolvem a
 * promise do `del`: quem publica (ex.: `blockUser`) só termina depois de o cache ser limpo, então
 * a próxima leitura já vê o dado novo. O TTL cobre um evento perdido.
 *
 * - `user:updated`/`user:deleted` → `cache:user:<id>` (perfil público)
 * - `user:blocked`/`user:unblocked` → `cache:blocks:<id>` dos dois envolvidos
 */
export function registerUserCacheListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  cache: Pick<ICacheService, 'del'> = cacheService
): () => void {
  const unsubscribers = [
    bus.subscribe(UserEvents.UPDATED, ({ payload }) =>
      cache.del(USER_CACHE_KEYS.publicUser(payload.userId))
    ),
    bus.subscribe(UserEvents.DELETED, ({ payload }) =>
      cache.del(USER_CACHE_KEYS.publicUser(payload.userId))
    ),
    bus.subscribe(UserEvents.BLOCKED, ({ payload }) =>
      cache.del([
        USER_CACHE_KEYS.blocks(payload.userId),
        USER_CACHE_KEYS.blocks(payload.blockedUserId),
      ])
    ),
    bus.subscribe(UserEvents.UNBLOCKED, ({ payload }) =>
      cache.del([
        USER_CACHE_KEYS.blocks(payload.userId),
        USER_CACHE_KEYS.blocks(payload.unblockedUserId),
      ])
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

Em `src/modules/user/repositories/ContactRepository.ts` (6 trechos, na ordem):

1. Substituir:

```ts
}

export class ContactRepository implements IContactRepository {
  async findById(id: string): Promise<ContactAttributes | null> {
```

por:

```ts
}

/** Atributos do usuário do contato incluídos nas listagens. */
const CONTACT_USER_ATTRIBUTES = [
  'id',
  'username',
  'displayName',
  'avatarUrl',
  'status',
  'lastSeenAt',
];

/** Linha de contato + usuário público (placeholder se o usuário não veio no include). */
function toContactWithUser(row: Contact): ContactWithUser {
  return {
    ...row.toJSON(),
    contact: row.contact?.toPublicJSON() ?? {
      id: row.contactId,
      username: '',
      displayName: null,
      avatarUrl: null,
      status: 'offline',
      lastSeenAt: null,
    },
  };
}

export class ContactRepository implements IContactRepository {
  async findById(id: string): Promise<ContactAttributes | null> {
```

2. Substituir:

```ts
        model: User,
        as: 'contact',
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status', 'lastSeenAt'],
        where:
          filters.search !== undefined && filters.search !== ''
```

por:

```ts
        model: User,
        as: 'contact',
        attributes: CONTACT_USER_ATTRIBUTES,
        where:
          filters.search !== undefined && filters.search !== ''
```

3. Substituir:

```ts

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
```

por:

```ts

    return {
      contacts: contacts.map(toContactWithUser),
      total: count,
      limit,
```

4. Substituir:

```ts
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

```

por:

```ts
          model: User,
          as: 'contact',
          attributes: CONTACT_USER_ATTRIBUTES,
        },
      ],
      order: [['blockedAt', 'DESC']],
    });

    return contacts.map(toContactWithUser);
  }

```

5. Substituir:

```ts
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

```

por:

```ts
          model: User,
          as: 'contact',
          attributes: CONTACT_USER_ATTRIBUTES,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return contacts.map(toContactWithUser);
  }

```

6. Substituir:

```ts
  }

  async touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void> {
    await Contact.update(
```

por:

```ts
  }

  async listWatcherIds(userId: string): Promise<string[]> {
    const rows = await Contact.findAll({
      where: { contactId: userId, isBlocked: false },
      attributes: ['userId'],
    });
    return rows.map((row) => row.userId);
  }

  async listContactIds(userId: string): Promise<string[]> {
    const rows = await Contact.findAll({
      where: { userId, isBlocked: false },
      attributes: ['contactId'],
    });
    return rows.map((row) => row.contactId);
  }

  async listBlockedEitherIds(userId: string): Promise<string[]> {
    const rows = await Contact.findAll({
      where: { isBlocked: true, [Op.or]: [{ userId }, { contactId: userId }] },
      attributes: ['userId', 'contactId'],
    });
    return [...new Set(rows.map((row) => (row.userId === userId ? row.contactId : row.userId)))];
  }

  async findByUserAndContactIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]> {
    if (contactIds.length === 0) {
      return [];
    }
    const rows = await Contact.findAll({
      where: { userId, contactId: { [Op.in]: contactIds }, isBlocked: false },
      include: [{ model: User, as: 'contact', attributes: CONTACT_USER_ATTRIBUTES }],
    });
    return rows.map(toContactWithUser);
  }

  async touchInteraction(userId: string, otherUserId: string, at: Date): Promise<void> {
    await Contact.update(
```

Em `src/modules/user/services/ContactService.ts` (3 trechos, na ordem):

1. Substituir:

```ts
import type { UserAttributes } from '@/shared/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { UserEvents } from '@/shared/types';
import { contactRepository, userRepository } from '../repositories';
import type { IContactRepository, IContactService, IUserRepository } from '../interfaces';
```

por:

```ts
import type { UserAttributes } from '@/shared/types';
import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { UserEvents } from '@/shared/types';
import { USER_CACHE_KEYS, USER_CACHE_TTL_SECONDS } from '../constants';
import { contactRepository, userRepository } from '../repositories';
import type { IContactRepository, IContactService, IUserRepository } from '../interfaces';
```

2. Substituir:

```ts
    private readonly contacts: IContactRepository = contactRepository,
    private readonly users: IUserRepository = userRepository,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

```

por:

```ts
    private readonly contacts: IContactRepository = contactRepository,
    private readonly users: IUserRepository = userRepository,
    private readonly events: Pick<EventBus, 'publish'> = eventBus,
    private readonly cache: Pick<ICacheService, 'getOrLoad'> = cacheService
  ) {}

```

3. Substituir:

```ts
  }

  async isBlockedByEither(userId: string, targetId: string): Promise<boolean> {
    const [blockedByUser, blockedByTarget] = await Promise.all([
      this.contacts.isBlocked(userId, targetId),
      this.contacts.isBlocked(targetId, userId),
    ]);
    return blockedByUser || blockedByTarget;
  }

```

por:

```ts
  }

  /** Uma consulta (cacheada) cobre os dois sentidos do bloqueio. */
  async isBlockedByEither(userId: string, targetId: string): Promise<boolean> {
    return (await this.listBlockedEitherIds(userId)).includes(targetId);
  }

  async listBlockedEitherIds(userId: string): Promise<string[]> {
    return this.cache.getOrLoad(USER_CACHE_KEYS.blocks(userId), USER_CACHE_TTL_SECONDS, () =>
      this.contacts.listBlockedEitherIds(userId)
    );
  }

  async listWatchers(userId: string): Promise<string[]> {
    return this.contacts.listWatcherIds(userId);
  }

  async listContactIds(userId: string): Promise<string[]> {
    return this.contacts.listContactIds(userId);
  }

  async getContactsByIds(userId: string, contactIds: string[]): Promise<ContactWithUser[]> {
    return this.contacts.findByUserAndContactIds(userId, contactIds);
  }

```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/constants/index.test.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/index.test.ts tests/unit/modules/user/listeners/user.listeners.test.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/user/constants/cache.constants.ts src/modules/user/constants/index.ts src/modules/user/index.ts src/modules/user/interfaces/IContactRepository.ts src/modules/user/interfaces/IContactService.ts src/modules/user/listeners/index.ts src/modules/user/listeners/user.listeners.ts src/modules/user/repositories/ContactRepository.ts src/modules/user/services/ContactService.ts tests/unit/modules/user/constants/index.test.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/index.test.ts tests/unit/modules/user/listeners/user.listeners.test.ts tests/unit/modules/user/repositories/ContactRepository.test.ts tests/unit/modules/user/services/ContactService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/user/constants/cache.constants.ts \
  src/modules/user/constants/index.ts \
  src/modules/user/index.ts \
  src/modules/user/interfaces/IContactRepository.ts \
  src/modules/user/interfaces/IContactService.ts \
  src/modules/user/listeners/index.ts \
  src/modules/user/listeners/user.listeners.ts \
  src/modules/user/repositories/ContactRepository.ts \
  src/modules/user/services/ContactService.ts \
  tests/unit/modules/user/constants/index.test.ts \
  tests/unit/modules/user/controllers/ContactController.test.ts \
  tests/unit/modules/user/index.test.ts \
  tests/unit/modules/user/listeners/user.listeners.test.ts \
  tests/unit/modules/user/repositories/ContactRepository.test.ts \
  tests/unit/modules/user/services/ContactService.test.ts
git commit -m "✨ feat: consultas de audiência nos contatos e cache dos bloqueios"
```


---

### Task 5: `UserService`: perfis públicos em cache

**Files:**
- Modify: `src/modules/user/interfaces/IUserRepository.ts`
- Modify: `src/modules/user/interfaces/IUserService.ts`
- Modify: `src/modules/user/repositories/UserRepository.ts`
- Modify: `src/modules/user/services/UserService.ts`
- Modify: `tests/unit/modules/user/repositories/UserRepository.test.ts`
- Modify: `tests/unit/modules/user/services/UserService.test.ts`

**Interfaces:**
- Consumes: `USER_CACHE_KEYS`/`USER_CACHE_TTL_SECONDS` (Task 4), `CacheService` (Task 3).
- Produces: `new UserService(users?, passwords?, cache?: Pick<ICacheService, 'mget' | 'setMany' | 'del'>)`; `getMultiple(ids)` devolve na ordem dos ids, sem repetição, omitindo inexistentes, com `lastSeenAt: Date | null`; `IUserService.updateLastSeen(userId, at?: Date)` e `IUserRepository.updateLastSeen(userId, at?: Date)`.

`getMultiple` (usado pelo DTO das conversas e pela presença para o `lastSeenAt` dos offline) passa a ler do cache com um MGET e a buscar no Postgres, numa consulta `IN`, só os ausentes. `findByIdPublic` usa o mesmo caminho. As escritas do próprio service apagam a chave; `updateLastSeen` recebe o instante (a presença grava exatamente o `lastSeen` que publica).

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/user/repositories/UserRepository.test.ts`, substituir:

```ts
        { where: { id: 'user-123' } }
      );
    });
  });

  describe('updateStatus', () => {
```

por:

```ts
        { where: { id: 'user-123' } }
      );
    });

    it('deve gravar o instante informado', async () => {
      const at = new Date('2026-09-26T12:00:00.000Z');
      MockUser.update.mockResolvedValue([1]);

      await repository.updateLastSeen('user-123', at);

      expect(MockUser.update).toHaveBeenCalledWith(
        { lastSeenAt: at },
        { where: { id: 'user-123' } }
      );
    });
  });

  describe('updateStatus', () => {
```

Em `tests/unit/modules/user/services/UserService.test.ts` (7 trechos, na ordem):

1. Substituir:

```ts
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;
```

por:

```ts
import { UserStatus } from '@/shared/types';
import { HttpStatus, ErrorCode } from '@/shared/errors';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;
```

2. Substituir:

```ts
  let userService: UserService;
  let mockPasswordService: jest.Mocked<PasswordService>;

  const mockUser = {
```

por:

```ts
  let userService: UserService;
  let mockPasswordService: jest.Mocked<PasswordService>;
  let redis: FakeRedis;

  const mockUser = {
```

3. Substituir:

```ts
    } as unknown as jest.Mocked<PasswordService>;
    MockPasswordService.mockImplementation(() => mockPasswordService);
    userService = new UserService(mockUserRepository, mockPasswordService);
  });

```

por:

```ts
    } as unknown as jest.Mocked<PasswordService>;
    MockPasswordService.mockImplementation(() => mockPasswordService);
    redis = new FakeRedis();
    userService = new UserService(mockUserRepository, mockPasswordService, new CacheService(redis));
  });

```

4. Substituir:

```ts
  describe('findByIdPublic', () => {
    it('deve retornar dados públicos do usuário quando encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.findByIdPublic('user-123');
```

por:

```ts
  describe('findByIdPublic', () => {
    it('deve retornar dados públicos do usuário quando encontrado', async () => {
      mockUserRepository.findByIds.mockResolvedValue([mockUser]);

      const result = await userService.findByIdPublic('user-123');
```

5. Substituir:

```ts

    it('deve lançar UserNotFoundException quando usuário não encontrado', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.findByIdPublic('nonexistent')).rejects.toThrow(
```

por:

```ts

    it('deve lançar UserNotFoundException quando usuário não encontrado', async () => {
      mockUserRepository.findByIds.mockResolvedValue([]);

      await expect(userService.findByIdPublic('nonexistent')).rejects.toThrow(
```

6. Substituir:

```ts

  describe('updateLastSeen', () => {
    it('deve atualizar lastSeenAt do usuário', async () => {
      mockUserRepository.updateLastSeen.mockResolvedValue();

      await userService.updateLastSeen('user-123');

      expect(mockUserRepository.updateLastSeen).toHaveBeenCalledWith('user-123');
    });
  });
```

por:

```ts

  describe('updateLastSeen', () => {
    it('deve atualizar lastSeenAt do usuário (agora, por padrão)', async () => {
      mockUserRepository.updateLastSeen.mockResolvedValue();

      await userService.updateLastSeen('user-123');

      expect(mockUserRepository.updateLastSeen).toHaveBeenCalledWith('user-123', expect.any(Date));
    });

    it('deve gravar o instante informado', async () => {
      const at = new Date('2026-09-26T12:00:00.000Z');
      mockUserRepository.updateLastSeen.mockResolvedValue();

      await userService.updateLastSeen('user-123', at);

      expect(mockUserRepository.updateLastSeen).toHaveBeenCalledWith('user-123', at);
    });
  });
```

7. Substituir:

```ts

      expect(result).toEqual([]);
    });
  });
```

por:

```ts

      expect(result).toEqual([]);
      expect(mockUserRepository.findByIds).not.toHaveBeenCalled();
    });
  });

  describe('cache do perfil público (cache:user:<id>)', () => {
    const other = { ...mockUser, id: 'user-456', username: 'user2', lastSeenAt: null };

    it('a segunda leitura não vai ao Postgres e devolve lastSeenAt como Date', async () => {
      mockUserRepository.findByIds.mockResolvedValue([mockUser, other]);

      const first = await userService.getMultiple(['user-123', 'user-456']);
      const second = await userService.getMultiple(['user-456', 'user-123']);

      expect(mockUserRepository.findByIds).toHaveBeenCalledTimes(1);
      expect(second.map((u) => u.id)).toEqual(['user-456', 'user-123']);
      expect(second[1]).toEqual(first[0]);
      expect(second[1]?.lastSeenAt).toBeInstanceOf(Date);
      expect(second[0]?.lastSeenAt).toBeNull();
      expect(await redis.ttl('cache:user:user-123')).toBe(300);
    });

    it('busca só os ausentes, sem repetir ids, e omite quem não existe', async () => {
      mockUserRepository.findByIds.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([other]);
      await userService.getMultiple(['user-123']);

      const result = await userService.getMultiple(['user-456', 'user-123', 'user-456', 'ghost']);

      expect(mockUserRepository.findByIds).toHaveBeenLastCalledWith(['user-456', 'ghost']);
      expect(result.map((u) => u.id)).toEqual(['user-456', 'user-123']);
    });

    it('findByIdPublic usa o mesmo cache', async () => {
      mockUserRepository.findByIds.mockResolvedValue([mockUser]);

      await userService.findByIdPublic('user-123');
      await userService.findByIdPublic('user-123');

      expect(mockUserRepository.findByIds).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
    });

    it.each([
      ['updateLastSeen', (service: UserService) => service.updateLastSeen('user-123')],
      ['updateStatus', (service: UserService) => service.updateStatus('user-123', UserStatus.AWAY)],
      ['update', (service: UserService) => service.update('user-123', { displayName: 'Novo' })],
      ['delete', (service: UserService) => service.delete('user-123')],
    ])('%s invalida o perfil cacheado', async (_name, write) => {
      mockUserRepository.findByIds.mockResolvedValue([mockUser]);
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.update.mockResolvedValue(mockUser);
      mockUserRepository.delete.mockResolvedValue(true);
      await userService.getMultiple(['user-123']);

      await write(userService);

      expect(await redis.get('cache:user:user-123')).toBeNull();
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/user/repositories/UserRepository.test.ts tests/unit/modules/user/services/UserService.test.ts --coverage=false`

Expected: FAIL — 8 testes (`findByIds` chamado de novo na segunda leitura; `findByIdPublic` ainda usa `findById`; `updateLastSeen` sem o instante; escritas não invalidam).

- [ ] **Step 3: Implementar**

Em `src/modules/user/interfaces/IUserRepository.ts`, substituir:

```ts
  delete(id: string): Promise<boolean>;
  search(options: UserSearchOptions): Promise<UserSearchResult>;
  updateLastSeen(userId: string): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
}
```

por:

```ts
  delete(id: string): Promise<boolean>;
  search(options: UserSearchOptions): Promise<UserSearchResult>;
  updateLastSeen(userId: string, at?: Date): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
}
```

Em `src/modules/user/interfaces/IUserService.ts`, substituir:

```ts
  list(options?: UserListOptions): Promise<PaginatedUsers>;
  exists(id: string): Promise<boolean>;
  updateLastSeen(userId: string): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
  getMultiple(ids: string[]): Promise<PublicUserDTO[]>;
```

por:

```ts
  list(options?: UserListOptions): Promise<PaginatedUsers>;
  exists(id: string): Promise<boolean>;
  /** Grava `users.last_seen_at` (padrão: agora) e invalida o perfil público cacheado. */
  updateLastSeen(userId: string, at?: Date): Promise<void>;
  updateStatus(userId: string, status: UserStatus): Promise<void>;
  getMultiple(ids: string[]): Promise<PublicUserDTO[]>;
```

Em `src/modules/user/repositories/UserRepository.ts`, substituir:

```ts
  }

  async updateLastSeen(userId: string): Promise<void> {
    await User.update({ lastSeenAt: new Date() }, { where: { id: userId } });
  }

```

por:

```ts
  }

  async updateLastSeen(userId: string, at: Date = new Date()): Promise<void> {
    await User.update({ lastSeenAt: at }, { where: { id: userId } });
  }

```

Em `src/modules/user/services/UserService.ts` (6 trechos, na ordem):

1. Substituir:

```ts
import { PasswordService } from '@/modules/auth/services/PasswordService';
import type { UserAttributes, UserStatus } from '@/shared/types';
import { userRepository } from '../repositories';
import type { IUserRepository, IUserService } from '../interfaces';
```

por:

```ts
import { PasswordService } from '@/modules/auth/services/PasswordService';
import { cacheService, type ICacheService } from '@/shared/cache';
import type { UserAttributes, UserStatus } from '@/shared/types';
import { USER_CACHE_KEYS, USER_CACHE_TTL_SECONDS } from '../constants';
import { userRepository } from '../repositories';
import type { IUserRepository, IUserService } from '../interfaces';
```

2. Substituir:

```ts
} from '../errors';

export class UserService implements IUserService {
  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly passwords: PasswordService = new PasswordService()
  ) {}

```

por:

```ts
} from '../errors';

/** `PublicUserDTO` como volta do cache (JSON): datas viram strings ISO. */
type CachedPublicUser = Omit<PublicUserDTO, 'lastSeenAt'> & { lastSeenAt: string | null };

function reviveUser(cached: CachedPublicUser): PublicUserDTO {
  return { ...cached, lastSeenAt: cached.lastSeenAt === null ? null : new Date(cached.lastSeenAt) };
}

export class UserService implements IUserService {
  constructor(
    private readonly users: IUserRepository = userRepository,
    private readonly passwords: PasswordService = new PasswordService(),
    private readonly cache: Pick<ICacheService, 'mget' | 'setMany' | 'del'> = cacheService
  ) {}

```

3. Substituir:

```ts
  }

  async findByIdPublic(id: string): Promise<PublicUserDTO> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }
    return this.toPublicUser(user);
  }

```

por:

```ts
  }

  /** Perfil público via cache (`cache:user:<id>`). */
  async findByIdPublic(id: string): Promise<PublicUserDTO> {
    const [user] = await this.getMultiple([id]);
    if (user === undefined) {
      throw new UserNotFoundException();
    }
    return user;
  }

```

4. Substituir:

```ts
    }

    return this.toUserResponse(updated);
  }
```

por:

```ts
    }

    await this.forget(id);
    return this.toUserResponse(updated);
  }
```

5. Substituir:

```ts
      throw new UserNotFoundException();
    }
  }

```

por:

```ts
      throw new UserNotFoundException();
    }
    await this.forget(id);
  }

```

6. Substituir:

```ts
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.users.updateLastSeen(userId);
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.users.updateStatus(userId, status);
  }

  async getMultiple(ids: string[]): Promise<PublicUserDTO[]> {
    const users = await this.users.findByIds(ids);
    return users.map((u) => this.toPublicUser(u));
  }

```

por:

```ts
  }

  async updateLastSeen(userId: string, at: Date = new Date()): Promise<void> {
    await this.users.updateLastSeen(userId, at);
    await this.forget(userId);
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.users.updateStatus(userId, status);
    await this.forget(userId);
  }

  /**
   * Perfis públicos na ordem de `ids` (sem repetição; inexistentes ficam de fora). Lê do cache
   * (`cache:user:<id>`, um MGET) e busca no Postgres, numa só consulta `IN`, apenas os ausentes,
   * que passam a ser cacheados.
   */
  async getMultiple(ids: string[]): Promise<PublicUserDTO[]> {
    const unique = [...new Set(ids)];
    const cached = await this.cache.mget<CachedPublicUser>(unique.map(USER_CACHE_KEYS.publicUser));

    const byId = new Map<string, PublicUserDTO>();
    const missing: string[] = [];
    unique.forEach((id, index) => {
      const hit = cached[index] ?? null;
      if (hit === null) {
        missing.push(id);
      } else {
        byId.set(id, reviveUser(hit));
      }
    });

    if (missing.length > 0) {
      const loaded = (await this.users.findByIds(missing)).map((u) => this.toPublicUser(u));
      await this.cache.setMany(
        loaded.map((user) => [USER_CACHE_KEYS.publicUser(user.id), user]),
        USER_CACHE_TTL_SECONDS
      );
      loaded.forEach((user) => byId.set(user.id, user));
    }

    return unique.flatMap((id) => {
      const user = byId.get(id);
      return user === undefined ? [] : [user];
    });
  }

  /** Escritas do próprio service invalidam o perfil público cacheado. */
  private async forget(userId: string): Promise<void> {
    await this.cache.del(USER_CACHE_KEYS.publicUser(userId));
  }

```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/repositories/UserRepository.test.ts tests/unit/modules/user/services/UserService.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/user/interfaces/IUserRepository.ts src/modules/user/interfaces/IUserService.ts src/modules/user/repositories/UserRepository.ts src/modules/user/services/UserService.ts tests/unit/modules/user/repositories/UserRepository.test.ts tests/unit/modules/user/services/UserService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/user/interfaces/IUserRepository.ts \
  src/modules/user/interfaces/IUserService.ts \
  src/modules/user/repositories/UserRepository.ts \
  src/modules/user/services/UserService.ts \
  tests/unit/modules/user/repositories/UserRepository.test.ts \
  tests/unit/modules/user/services/UserService.test.ts
git commit -m "⚡️ perf: cacheia os perfis públicos no UserService"
```


---

### Task 6: Chat: participantes em cache e parceiros 1:1

**Files:**
- Create: `src/modules/chat/constants/cache.constants.ts`
- Modify: `src/modules/chat/constants/index.ts`
- Modify: `src/modules/chat/index.ts`
- Modify: `src/modules/chat/interfaces/IConversationService.ts`
- Modify: `src/modules/chat/interfaces/IParticipantRepository.ts`
- Modify: `src/modules/chat/listeners/chat.listeners.ts`
- Modify: `src/modules/chat/listeners/index.ts`
- Modify: `src/modules/chat/repositories/ParticipantRepository.ts`
- Modify: `src/modules/chat/services/ConversationService.ts`
- Modify: `src/modules/chat/services/MessageService.ts`
- Create: `src/modules/chat/services/ParticipantDirectory.ts`
- Modify: `src/modules/chat/services/index.ts`
- Modify: `tests/feature/modules/chat/chat.test.ts`
- Modify: `tests/support/chat/inMemoryChat.ts`
- Modify: `tests/unit/modules/chat/constants/chat.constants.test.ts`
- Modify: `tests/unit/modules/chat/controllers/ConversationController.test.ts`
- Modify: `tests/unit/modules/chat/index.test.ts`
- Modify: `tests/unit/modules/chat/listeners/chat.listeners.test.ts`
- Modify: `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts`
- Modify: `tests/unit/modules/chat/services/ConversationService.test.ts`
- Modify: `tests/unit/modules/chat/services/MessageService.test.ts`
- Create: `tests/unit/modules/chat/services/ParticipantDirectory.test.ts`
- Modify: `tests/unit/modules/chat/services/index.test.ts`

**Interfaces:**
- Consumes: `CacheService` (Task 3), `FakeRedis` (Task 2).
- Produces: `CHAT_CACHE_KEYS.participants(id) = 'conv:participants:<id>'`, `CHAT_CACHE_TTL_SECONDS = 300`; `class ParticipantDirectory` (`constructor(participants = participantRepository, cache = cacheService)`) com `list(conversationId): Promise<ParticipantSummary[]>`, `userIds(conversationId)`, `isParticipant(conversationId, userId)`; `ParticipantSummary { userId; role }`.
- Produces: `IParticipantRepository.listDirectPartnerIds(userId): Promise<string[]>`, `IConversationService.getDirectPartnerIds(userId): Promise<string[]>`; `ConversationService`/`MessageService` ganham o 6º parâmetro `directory` (padrão `new ParticipantDirectory(participants)`).
- Produces: `registerChatCacheListeners(bus = eventBus, cache = cacheService): () => void` (exportado por `@/modules/chat/listeners` e pelo barrel do chat).

`ParticipantDirectory` guarda `[{ userId, role }]` por conversa em `cache:conv:participants:<id>` e é usado por `send`/`list`/`delete`/`markDelivered` (`MessageService`) e `isParticipant`/`getParticipantIds` (`ConversationService`); `markRead` continua lendo a participação (precisa do `last_read_at`). `registerChatCacheListeners` apaga a chave em `chat:conversation-created/updated/deleted`. Para a audiência da presença, `listDirectPartnerIds` (repositório) e `getDirectPartnerIds` (service). O feature test do chat passa a usar o `FakeRedis`, registra a invalidação e prova a redução de leituras.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/feature/modules/chat/chat.test.ts` (3 trechos, na ordem):

1. Substituir:

```ts
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // O token do teste é o próprio id do usuário: "Authorization: Bearer <uuid>".
```

por:

```ts
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
// Cache de participantes sobre um Redis em memória (nunca o Redis real da máquina).
jest.mock('@/shared/database/redis', () => {
  const { FakeRedis } = jest.requireActual('../../../support/redis/fakeRedis');
  return { redis: new FakeRedis() };
});
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // O token do teste é o próprio id do usuário: "Authorization: Bearer <uuid>".
```

2. Substituir:

```ts
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
```

por:

```ts
}));

import { registerChatCacheListeners } from '@/modules/chat/listeners';
import * as chatRepositories from '@/modules/chat/repositories';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { redis } from '@/shared/database/redis';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';
import type { FakeRedis } from '../../../support/redis/fakeRedis';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const as = (userId: string): { Authorization: string } => ({ Authorization: `Bearer ${userId}` });
const FAKE_CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FAKE_MESSAGE = '65f000000000000000000001';

const fakeRedis = redis as unknown as FakeRedis;

describe('Chat — Feature', () => {
  let app: Application;
  let unregisterCacheListeners: () => void;

  beforeAll(() => {
    // Em produção o bootstrap registra a invalidação; aqui o teste faz o mesmo.
    unregisterCacheListeners = registerChatCacheListeners();
  });

  afterAll(() => {
    unregisterCacheListeners();
  });

  beforeEach(() => {
    store.reset();
    fakeRedis.flushall();
    mockBlocks.clear();
    app = express();
```

3. Substituir:

```ts
    });
  });
});
```

por:

```ts
    });
  });

  describe('cache de participantes (cache:conv:participants:<id>)', () => {
    it('leituras seguidas não voltam ao repositório; mudança de membros invalida', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Cache', participantIds: [BOB] });
      const groupId = created.body.data.id as string;
      const listByConversation = jest.spyOn(
        chatRepositories.participantRepository,
        'listByConversation'
      );

      await send(ANA, groupId, 'um');
      await send(BOB, groupId, 'dois');
      await request(app).get(`/api/conversations/${groupId}/messages`).set(as(ANA));
      expect(listByConversation).toHaveBeenCalledTimes(1);
      expect(await fakeRedis.ttl(`cache:conv:participants:${groupId}`)).toBe(300);

      const outsider = await send(CAROL, groupId, 'ainda não');
      expect(outsider.status).toBe(HttpStatus.NOT_FOUND);

      const added = await request(app)
        .post(`/api/conversations/${groupId}/members`)
        .set(as(ANA))
        .send({ userIds: [CAROL] });
      expect(added.status).toBe(HttpStatus.OK);
      listByConversation.mockClear();

      const member = await send(CAROL, groupId, 'agora sim');
      expect(member.status).toBe(HttpStatus.CREATED);
      expect(listByConversation).toHaveBeenCalledTimes(1);
    });

    it('membro removido deixa de enviar imediatamente (invalidação síncrona)', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Cache', participantIds: [BOB, CAROL] });
      const groupId = created.body.data.id as string;
      expect((await send(CAROL, groupId, 'oi')).status).toBe(HttpStatus.CREATED);

      await request(app).delete(`/api/conversations/${groupId}/members/${CAROL}`).set(as(ANA));

      expect((await send(CAROL, groupId, 'ainda estou?')).status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
```

Em `tests/support/chat/inMemoryChat.ts`, substituir:

```ts
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<void> {
    const bulkJoinedAt = this.store.now();
```

por:

```ts
  }

  async listDirectPartnerIds(userId: string): Promise<string[]> {
    const direct = new Set(
      this.store.participants
        .filter(
          (p) =>
            p.userId === userId && this.store.conversations.get(p.conversationId)?.type === 'direct'
        )
        .map((p) => p.conversationId)
    );
    return this.store.participants
      .filter((p) => direct.has(p.conversationId) && p.userId !== userId)
      .map((p) => p.userId);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<void> {
    const bulkJoinedAt = this.store.now();
```

Em `tests/unit/modules/chat/constants/chat.constants.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import {
  CHAT_CONSTANTS,
  CONVERSATION_TYPES,
```

por:

```ts
import {
  CHAT_CACHE_KEYS,
  CHAT_CACHE_TTL_SECONDS,
  CHAT_CONSTANTS,
  CONVERSATION_TYPES,
```

2. Substituir:

```ts
    expect(MESSAGE_CONTENT_TYPES).toEqual(['text']);
  });
});
```

por:

```ts
    expect(MESSAGE_CONTENT_TYPES).toEqual(['text']);
  });

  it('deve definir a chave e o TTL do cache de participantes', () => {
    expect(CHAT_CACHE_KEYS.participants('c1')).toBe('conv:participants:c1');
    expect(CHAT_CACHE_TTL_SECONDS).toBe(300);
  });
});
```

Em `tests/unit/modules/chat/controllers/ConversationController.test.ts`, substituir:

```ts
    getUserConversationIds: jest.fn(),
    getTypeForParticipant: jest.fn(),
  };
}
```

por:

```ts
    getUserConversationIds: jest.fn(),
    getTypeForParticipant: jest.fn(),
    getDirectPartnerIds: jest.fn(),
  };
}
```

Em `tests/unit/modules/chat/index.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
    expect(chatModule.messageService).toBeInstanceOf(chatModule.MessageService);
    expect(typeof chatModule.buildDirectKey).toBe('function');
  });

```

por:

```ts
    expect(chatModule.messageService).toBeInstanceOf(chatModule.MessageService);
    expect(typeof chatModule.buildDirectKey).toBe('function');
    expect(chatModule.ParticipantDirectory).toBeDefined();
  });

```

2. Substituir:

```ts
    expect(chatModule.conversationRoutes).toBeDefined();
    expect(typeof chatModule.registerChatListeners).toBe('function');
  });
});
```

por:

```ts
    expect(chatModule.conversationRoutes).toBeDefined();
    expect(typeof chatModule.registerChatListeners).toBe('function');
    expect(typeof chatModule.registerChatCacheListeners).toBe('function');
  });
});
```

Em `tests/unit/modules/chat/listeners/chat.listeners.test.ts` (3 trechos, na ordem):

1. Substituir:

```ts
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/modules/chat/repositories', () => ({ messageRepository: {} }));
jest.mock('@/shared/logger', () => ({
  logger: {
```

por:

```ts
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/modules/chat/repositories', () => ({ messageRepository: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/logger', () => ({
  logger: {
```

2. Substituir:

```ts
}));

import { registerChatListeners } from '@/modules/chat/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';

const mockLogger = logger as jest.Mocked<typeof logger>;
```

por:

```ts
}));

import { registerChatCacheListeners, registerChatListeners } from '@/modules/chat/listeners';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const mockLogger = logger as jest.Mocked<typeof logger>;
```

3. Substituir:

```ts
  });
});
```

por:

```ts
  });
});

describe('registerChatCacheListeners', () => {
  const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const KEY = `cache:conv:participants:${CONVERSATION}`;
  const USER = '11111111-1111-4111-8111-111111111111';
  let bus: EventBus;
  let redis: FakeRedis;
  let unregister: () => void;

  beforeEach(async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    redis = new FakeRedis();
    unregister = registerChatCacheListeners(bus, new CacheService(redis));
    await redis.set(KEY, '[]');
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it.each([
    [
      ChatEvents.CONVERSATION_CREATED,
      { conversationId: CONVERSATION, type: 'group', creatorId: USER, participantIds: [USER] },
    ],
    [
      ChatEvents.CONVERSATION_UPDATED,
      {
        conversationId: CONVERSATION,
        change: 'member_left',
        actorId: USER,
        participantIds: [USER],
        affectedUserIds: [USER],
      },
    ],
    [
      ChatEvents.CONVERSATION_DELETED,
      { conversationId: CONVERSATION, actorId: USER, participantIds: [USER] },
    ],
  ] as const)(
    '%s apaga os participantes cacheados antes de o publish resolver',
    async (event, payload) => {
      await bus.publish(event, payload as never);

      expect(await redis.get(KEY)).toBeNull();
    }
  );

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o cache da aplicação', async () => {
    unregister();
    await bus.publish(ChatEvents.CONVERSATION_DELETED, {
      conversationId: CONVERSATION,
      actorId: USER,
      participantIds: [USER],
    });

    expect(await redis.get(KEY)).toBe('[]');
    expect(registerChatCacheListeners()).toBeInstanceOf(Function);
  });
});
```

Em `tests/unit/modules/chat/repositories/ParticipantRepository.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
}));

import { Op } from 'sequelize';
import Participant from '@/modules/chat/models/Participant';
import {
```

por:

```ts
}));

import { Op, literal } from 'sequelize';
import Participant from '@/modules/chat/models/Participant';
import {
```

2. Substituir:

```ts
      });
      expect(result).toEqual([CONVERSATION_ID, OTHER_CONVERSATION_ID]);
    });
  });
```

por:

```ts
      });
      expect(result).toEqual([CONVERSATION_ID, OTHER_CONVERSATION_ID]);
    });
  });

  describe('listDirectPartnerIds', () => {
    it('deve listar o outro participante de cada conversa direct do usuário', async () => {
      MockParticipant.findAll.mockResolvedValue([{ userId: USER_B }] as never);

      const result = await repository.listDirectPartnerIds(USER_A);

      expect(MockParticipant.findAll).toHaveBeenCalledWith({
        where: {
          userId: { [Op.ne]: USER_A },
          conversationId: {
            [Op.in]: literal(
              '(SELECT p.conversation_id FROM participants p ' +
                'JOIN conversations c ON c.id = p.conversation_id ' +
                "WHERE p.user_id = :userId AND c.type = 'direct')"
            ),
          },
        },
        attributes: ['userId'],
        replacements: { userId: USER_A },
      });
      expect(result).toEqual([USER_B]);
    });
  });
```

Em `tests/unit/modules/chat/services/ConversationService.test.ts` (4 trechos, na ordem):

1. Substituir:

```ts
} from '@/modules/chat/errors';
import type { IConversationRepository, IParticipantRepository } from '@/modules/chat/interfaces';
import {
  ConversationService,
```

por:

```ts
} from '@/modules/chat/errors';
import type { IConversationRepository, IParticipantRepository } from '@/modules/chat/interfaces';
import { ParticipantDirectory } from '@/modules/chat/services/ParticipantDirectory';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';
import {
  ConversationService,
```

2. Substituir:

```ts
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
```

por:

```ts
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      listDirectPartnerIds: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
```

3. Substituir:

```ts
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    conversations.withLock.mockImplementation(async (_id, work) => work(TX));
    service = new ConversationService(conversations, participants, users, contacts, events);
  });

```

por:

```ts
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    conversations.withLock.mockImplementation(async (_id, work) => work(TX));
    service = new ConversationService(
      conversations,
      participants,
      users,
      contacts,
      events,
      new ParticipantDirectory(participants, new CacheService(new FakeRedis()))
    );
  });

```

4. Substituir:

```ts

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

```

por:

```ts

  describe('consultas para outros módulos', () => {
    it('isParticipant e getParticipantIds vêm do cache de participantes (uma leitura)', async () => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);

      await expect(service.isParticipant(CONVERSATION_ID, USER_A)).resolves.toBe(true);
      await expect(service.isParticipant(CONVERSATION_ID, USER_D)).resolves.toBe(false);
      await expect(service.getParticipantIds(CONVERSATION_ID)).resolves.toEqual([USER_A, USER_B]);

      expect(participants.listByConversation).toHaveBeenCalledTimes(1);
      expect(participants.find).not.toHaveBeenCalled();
    });

    it('getDirectPartnerIds delega ao repositório', async () => {
      participants.listDirectPartnerIds.mockResolvedValue([USER_B]);

      await expect(service.getDirectPartnerIds(USER_A)).resolves.toEqual([USER_B]);
      expect(participants.listDirectPartnerIds).toHaveBeenCalledWith(USER_A);
    });

```

Em `tests/unit/modules/chat/services/MessageService.test.ts` (11 trechos, na ordem):

1. Substituir:

```ts
} from '@/modules/chat/interfaces';
import { MessageService, messageService } from '@/modules/chat/services/MessageService';
import type {
  ConversationAttributes,
  CreateMessageResult,
  MessageRecord,
  ParticipantAttributes,
} from '@/modules/chat/types';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';

const mockLogger = logger as jest.Mocked<typeof logger>;
```

por:

```ts
} from '@/modules/chat/interfaces';
import { MessageService, messageService } from '@/modules/chat/services/MessageService';
import { ParticipantDirectory } from '@/modules/chat/services/ParticipantDirectory';
import type {
  ConversationAttributes,
  CreateMessageResult,
  MessageRecord,
  ParticipantAttributes,
} from '@/modules/chat/types';
import { CacheService } from '@/shared/cache';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const mockLogger = logger as jest.Mocked<typeof logger>;
```

2. Substituir:

```ts
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
```

por:

```ts
      listByConversations: jest.fn(),
      listConversationIdsByUser: jest.fn(),
      listDirectPartnerIds: jest.fn(),
      addMembers: jest.fn(),
      remove: jest.fn(),
```

3. Substituir:

```ts
    contacts = { isBlockedByEither: jest.fn().mockResolvedValue(false) };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new MessageService(messages, conversations, participants, contacts, events);
  });

```

por:

```ts
    contacts = { isBlockedByEither: jest.fn().mockResolvedValue(false) };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new MessageService(
      messages,
      conversations,
      participants,
      contacts,
      events,
      new ParticipantDirectory(participants, new CacheService(new FakeRedis()))
    );
  });

```

4. Substituir:

```ts
  describe('list', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_A));
    });

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.list(USER_C, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
```

por:

```ts
  describe('list', () => {
    beforeEach(() => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);
    });

    it('deve responder 404 para não participante', async () => {
      await expect(service.list(USER_C, CONVERSATION_ID)).rejects.toThrow(
        ConversationNotFoundException
```

5. Substituir:

```ts
  describe('markDelivered', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());
    });
```

por:

```ts
  describe('markDelivered', () => {
    beforeEach(() => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);
      messages.findById.mockResolvedValue(record());
    });
```

6. Substituir:

```ts
      await service.markDelivered(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_B);
      expect(messages.markDelivered).toHaveBeenCalledWith(MESSAGE_ID, USER_B, expect.any(Date));
      const at = messages.markDelivered.mock.calls[0]![2];
```

por:

```ts
      await service.markDelivered(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(participants.listByConversation).toHaveBeenCalledWith(CONVERSATION_ID);
      expect(messages.markDelivered).toHaveBeenCalledWith(MESSAGE_ID, USER_B, expect.any(Date));
      const at = messages.markDelivered.mock.calls[0]![2];
```

7. Substituir:

```ts

    it('o autor não marca a própria mensagem (no-op, sem evento)', async () => {
      participants.find.mockResolvedValue(participant(USER_A));

      await service.markDelivered(USER_A, CONVERSATION_ID, MESSAGE_ID);

```

por:

```ts

    it('o autor não marca a própria mensagem (no-op, sem evento)', async () => {
      await service.markDelivered(USER_A, CONVERSATION_ID, MESSAGE_ID);

```

8. Substituir:

```ts

    it('404 para não participante e para mensagem inexistente ou de outra conversa', async () => {
      participants.find.mockResolvedValueOnce(null);
      await expect(service.markDelivered(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
```

por:

```ts

    it('404 para não participante e para mensagem inexistente ou de outra conversa', async () => {
      await expect(service.markDelivered(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
```

9. Substituir:

```ts
  describe('delete', () => {
    beforeEach(() => {
      participants.find.mockResolvedValue(participant(USER_A));
    });

```

por:

```ts
  describe('delete', () => {
    beforeEach(() => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);
    });

```

10. Substituir:

```ts

    it('deve responder 403 para quem não é o autor', async () => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());

```

por:

```ts

    it('deve responder 403 para quem não é o autor', async () => {
      messages.findById.mockResolvedValue(record());

```

11. Substituir:

```ts

    it('deve responder 404 para não participante', async () => {
      participants.find.mockResolvedValue(null);

      await expect(service.delete(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
  });
});
```

por:

```ts

    it('deve responder 404 para não participante', async () => {
      await expect(service.delete(USER_C, CONVERSATION_ID, MESSAGE_ID)).rejects.toThrow(
        ConversationNotFoundException
      );
    });
  });

  describe('cache de participantes (cache:conv:participants:<id>)', () => {
    beforeEach(() => {
      participants.listByConversation.mockResolvedValue([participant(USER_A), participant(USER_B)]);
      conversations.findById.mockResolvedValue(conversation());
      messages.create.mockResolvedValue(created(record()));
      messages.findByConversation.mockResolvedValue([]);
    });

    it('envios e listagens seguidos leem os participantes do Postgres uma vez só', async () => {
      await service.send(USER_A, CONVERSATION_ID, { text: 'um' }, META);
      await service.send(USER_A, CONVERSATION_ID, { text: 'dois' }, META);
      await service.list(USER_B, CONVERSATION_ID);

      expect(participants.listByConversation).toHaveBeenCalledTimes(1);
      expect(participants.find).not.toHaveBeenCalled();
    });

    it('markRead lê a participação do Postgres (last_read_at muda a cada leitura)', async () => {
      participants.find.mockResolvedValue(participant(USER_B));
      messages.findById.mockResolvedValue(record());
      messages.markReadUpTo.mockResolvedValue(0);

      await service.markRead(USER_B, CONVERSATION_ID, MESSAGE_ID);

      expect(participants.find).toHaveBeenCalledWith(CONVERSATION_ID, USER_B);
      expect(participants.listByConversation).not.toHaveBeenCalled();
    });
  });
});
```

Criar `tests/unit/modules/chat/services/ParticipantDirectory.test.ts`:

```ts
jest.mock('@/modules/chat/repositories', () => ({ participantRepository: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import type { IParticipantRepository } from '@/modules/chat/interfaces';
import { ParticipantDirectory } from '@/modules/chat/services/ParticipantDirectory';
import type { ParticipantAttributes } from '@/modules/chat/types';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

function participant(userId: string, role: 'admin' | 'member'): ParticipantAttributes {
  return {
    id: `p-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role,
    joinedAt: new Date('2026-09-24T10:00:00.000Z'),
    lastReadAt: new Date('2026-09-24T11:00:00.000Z'),
    isMuted: false,
    archivedAt: null,
  };
}

describe('ParticipantDirectory', () => {
  let participants: { listByConversation: jest.Mock };
  let redis: FakeRedis;
  let directory: ParticipantDirectory;

  beforeEach(() => {
    participants = {
      listByConversation: jest
        .fn()
        .mockResolvedValue([participant(USER_A, 'admin'), participant(USER_B, 'member')]),
    };
    redis = new FakeRedis();
    directory = new ParticipantDirectory(
      participants as unknown as IParticipantRepository,
      new CacheService(redis)
    );
  });

  it('guarda só ids e papéis, com TTL de 300 s', async () => {
    await expect(directory.list(CONVERSATION_ID)).resolves.toEqual([
      { userId: USER_A, role: 'admin' },
      { userId: USER_B, role: 'member' },
    ]);
    expect(JSON.parse((await redis.get(`cache:conv:participants:${CONVERSATION_ID}`))!)).toEqual([
      { userId: USER_A, role: 'admin' },
      { userId: USER_B, role: 'member' },
    ]);
    expect(await redis.ttl(`cache:conv:participants:${CONVERSATION_ID}`)).toBe(300);
  });

  it('userIds e isParticipant reaproveitam a mesma leitura', async () => {
    await expect(directory.userIds(CONVERSATION_ID)).resolves.toEqual([USER_A, USER_B]);
    await expect(directory.isParticipant(CONVERSATION_ID, USER_B)).resolves.toBe(true);
    await expect(directory.isParticipant(CONVERSATION_ID, USER_C)).resolves.toBe(false);

    expect(participants.listByConversation).toHaveBeenCalledTimes(1);
  });

  it('Redis fora do ar: lê do repositório a cada chamada (sem quebrar)', async () => {
    redis.failWith = new Error('ECONNREFUSED');

    await directory.userIds(CONVERSATION_ID);
    await directory.userIds(CONVERSATION_ID);

    expect(participants.listByConversation).toHaveBeenCalledTimes(2);
  });

  it('instância com dependências padrão', () => {
    expect(new ParticipantDirectory()).toBeInstanceOf(ParticipantDirectory);
  });
});
```

Em `tests/unit/modules/chat/services/index.test.ts`, substituir:

```ts
    expect(services.messageService).toBeInstanceOf(services.MessageService);
  });
});
```

por:

```ts
    expect(services.messageService).toBeInstanceOf(services.MessageService);
  });

  it('deve exportar o ParticipantDirectory', () => {
    expect(typeof services.ParticipantDirectory).toBe('function');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/feature/modules/chat/chat.test.ts tests/unit/modules/chat/constants/chat.constants.test.ts tests/unit/modules/chat/controllers/ConversationController.test.ts tests/unit/modules/chat/index.test.ts tests/unit/modules/chat/listeners/chat.listeners.test.ts tests/unit/modules/chat/repositories/ParticipantRepository.test.ts tests/unit/modules/chat/services/ConversationService.test.ts tests/unit/modules/chat/services/MessageService.test.ts tests/unit/modules/chat/services/ParticipantDirectory.test.ts tests/unit/modules/chat/services/index.test.ts --coverage=false`

Expected: FAIL — 37 testes (o feature test do chat falha no `beforeAll`: `registerChatCacheListeners` não existe; `ParticipantDirectory`, `CHAT_CACHE_KEYS` e `listDirectPartnerIds` inexistentes; as leituras ainda vão ao repositório a cada chamada).

- [ ] **Step 3: Implementar**

Criar `src/modules/chat/constants/cache.constants.ts`:

```ts
/** Chaves do cache do módulo chat (o `CacheService` acrescenta o prefixo `cache:`). */
export const CHAT_CACHE_KEYS = {
  /** Participantes da conversa: `[{ userId, role }]`. */
  participants: (conversationId: string): string => `conv:participants:${conversationId}`,
} as const;

/** TTL (s) das chaves do chat: a invalidação é por evento; o TTL só garante convergência. */
export const CHAT_CACHE_TTL_SECONDS = 300;
```

Em `src/modules/chat/constants/index.ts`, substituir:

```ts
  MESSAGE_CONTENT_TYPES,
} from './chat.constants';
```

por:

```ts
  MESSAGE_CONTENT_TYPES,
} from './chat.constants';
export { CHAT_CACHE_KEYS, CHAT_CACHE_TTL_SECONDS } from './cache.constants';
```

Em `src/modules/chat/index.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  messageService,
  buildDirectKey,
} from './services';

export {
```

por:

```ts
  messageService,
  buildDirectKey,
  ParticipantDirectory,
} from './services';
export type { ParticipantSummary } from './services';

export {
```

2. Substituir:

```ts
export { conversationRoutes } from './routes';

export { registerChatListeners } from './listeners';
```

por:

```ts
export { conversationRoutes } from './routes';

export { registerChatListeners, registerChatCacheListeners } from './listeners';
```

Em `src/modules/chat/interfaces/IConversationService.ts`, substituir:

```ts
  getParticipantIds(conversationId: string): Promise<string[]>;
  getUserConversationIds(userId: string): Promise<string[]>;
  /** Tipo da conversa para quem participa; 404 (`ConversationNotFoundException`) para os demais. */
  getTypeForParticipant(userId: string, conversationId: string): Promise<ConversationType>;
```

por:

```ts
  getParticipantIds(conversationId: string): Promise<string[]>;
  getUserConversationIds(userId: string): Promise<string[]>;
  /** Ids de quem tem conversa 1:1 com `userId` (audiência da presença). */
  getDirectPartnerIds(userId: string): Promise<string[]>;
  /** Tipo da conversa para quem participa; 404 (`ConversationNotFoundException`) para os demais. */
  getTypeForParticipant(userId: string, conversationId: string): Promise<ConversationType>;
```

Em `src/modules/chat/interfaces/IParticipantRepository.ts`, substituir:

```ts
  listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]>;
  listConversationIdsByUser(userId: string): Promise<string[]>;
  /** Adiciona como `member`, ignorando quem já participa. */
  addMembers(
```

por:

```ts
  listByConversations(conversationIds: string[]): Promise<ParticipantAttributes[]>;
  listConversationIdsByUser(userId: string): Promise<string[]>;
  /** Quem conversa com `userId` em conversas `direct` (o outro participante de cada uma). */
  listDirectPartnerIds(userId: string): Promise<string[]>;
  /** Adiciona como `member`, ignorando quem já participa. */
  addMembers(
```

Em `src/modules/chat/listeners/chat.listeners.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import type { IMessageRepository } from '../interfaces';
import { messageRepository } from '../repositories';
```

por:

```ts
import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { CHAT_CACHE_KEYS } from '../constants';
import type { IMessageRepository } from '../interfaces';
import { messageRepository } from '../repositories';
```

2. Substituir:

```ts
  };
}
```

por:

```ts
  };
}

/**
 * Invalida `cache:conv:participants:<id>` em toda mudança de participação. Subscribers
 * síncronos que devolvem a promise do `del`: quem publica só termina com o cache já limpo (o
 * próximo envio/listagem relê do Postgres).
 */
export function registerChatCacheListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  cache: Pick<ICacheService, 'del'> = cacheService
): () => void {
  const forget = ({ payload }: { payload: { conversationId: string } }): Promise<void> =>
    cache.del(CHAT_CACHE_KEYS.participants(payload.conversationId));

  const unsubscribers = [
    bus.subscribe(ChatEvents.CONVERSATION_CREATED, forget),
    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, forget),
    bus.subscribe(ChatEvents.CONVERSATION_DELETED, forget),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

Em `src/modules/chat/listeners/index.ts`, substituir:

```ts
export { registerChatListeners } from './chat.listeners';
```

por:

```ts
export { registerChatListeners, registerChatCacheListeners } from './chat.listeners';
```

Em `src/modules/chat/repositories/ParticipantRepository.ts` (3 trechos, na ordem):

1. Substituir:

```ts
import { Op } from 'sequelize';
import Participant from '../models/Participant';
import type { IParticipantRepository } from '../interfaces';
```

por:

```ts
import { Op, literal } from 'sequelize';
import Participant from '../models/Participant';
import type { IParticipantRepository } from '../interfaces';
```

2. Substituir:

```ts
  ['id', 'ASC'],
];

export class ParticipantRepository implements IParticipantRepository {
```

por:

```ts
  ['id', 'ASC'],
];

/**
 * Conversas `direct` de `:userId`. O valor entra por `replacements` (nunca por interpolação).
 */
const DIRECT_CONVERSATIONS_OF_USER =
  '(SELECT p.conversation_id FROM participants p ' +
  'JOIN conversations c ON c.id = p.conversation_id ' +
  "WHERE p.user_id = :userId AND c.type = 'direct')";

export class ParticipantRepository implements IParticipantRepository {
```

3. Substituir:

```ts
    const rows = await Participant.findAll({ where: { userId }, attributes: ['conversationId'] });
    return rows.map((row) => row.conversationId);
  }

```

por:

```ts
    const rows = await Participant.findAll({ where: { userId }, attributes: ['conversationId'] });
    return rows.map((row) => row.conversationId);
  }

  async listDirectPartnerIds(userId: string): Promise<string[]> {
    const rows = await Participant.findAll({
      where: {
        userId: { [Op.ne]: userId },
        conversationId: { [Op.in]: literal(DIRECT_CONVERSATIONS_OF_USER) },
      },
      attributes: ['userId'],
      replacements: { userId },
    });
    return rows.map((row) => row.userId);
  }

```

Em `src/modules/chat/services/ConversationService.ts` (3 trechos, na ordem):

1. Substituir:

```ts
} from '../interfaces';
import { conversationRepository, participantRepository } from '../repositories';
import type {
  ChatTransaction,
```

por:

```ts
} from '../interfaces';
import { conversationRepository, participantRepository } from '../repositories';
import { ParticipantDirectory } from './ParticipantDirectory';
import type {
  ChatTransaction,
```

2. Substituir:

```ts
    private readonly users: Pick<IUserService, 'exists' | 'getMultiple'> = userService,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

```

por:

```ts
    private readonly users: Pick<IUserService, 'exists' | 'getMultiple'> = userService,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus,
    private readonly directory: Pick<
      ParticipantDirectory,
      'userIds' | 'isParticipant'
    > = new ParticipantDirectory(participants)
  ) {}

```

3. Substituir:

```ts
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

```

por:

```ts
  }

  /** Via cache de participantes (`cache:conv:participants:<id>`). */
  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    return this.directory.isParticipant(conversationId, userId);
  }

  /** Via cache de participantes (`cache:conv:participants:<id>`). */
  async getParticipantIds(conversationId: string): Promise<string[]> {
    return this.directory.userIds(conversationId);
  }

  async getUserConversationIds(userId: string): Promise<string[]> {
    return this.participants.listConversationIdsByUser(userId);
  }

  async getDirectPartnerIds(userId: string): Promise<string[]> {
    return this.participants.listDirectPartnerIds(userId);
  }

```

Em `src/modules/chat/services/MessageService.ts` (6 trechos, na ordem):

1. Substituir:

```ts
} from '../interfaces';
import { conversationRepository, messageRepository, participantRepository } from '../repositories';
import type {
  ListMessagesOptions,
```

por:

```ts
} from '../interfaces';
import { conversationRepository, messageRepository, participantRepository } from '../repositories';
import { ParticipantDirectory } from './ParticipantDirectory';
import type {
  ListMessagesOptions,
```

2. Substituir:

```ts
  MessageRecord,
  PaginatedMessages,
  ParticipantAttributes,
  SendMessageDTO,
} from '../types';
```

por:

```ts
  MessageRecord,
  PaginatedMessages,
  SendMessageDTO,
} from '../types';
```

3. Substituir:

```ts
    private readonly participants: IParticipantRepository = participantRepository,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

```

por:

```ts
    private readonly participants: IParticipantRepository = participantRepository,
    private readonly contacts: Pick<IContactService, 'isBlockedByEither'> = contactService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus,
    private readonly directory: Pick<
      ParticipantDirectory,
      'userIds' | 'isParticipant'
    > = new ParticipantDirectory(participants)
  ) {}

```

4. Substituir:

```ts
    metadata: MessageMetadata
  ): Promise<MessageDTO> {
    const members = await this.participants.listByConversation(conversationId);
    const participantIds = members.map((member) => member.userId);
    if (!participantIds.includes(userId)) {
      throw new ConversationNotFoundException();
```

por:

```ts
    metadata: MessageMetadata
  ): Promise<MessageDTO> {
    const participantIds = await this.directory.userIds(conversationId);
    if (!participantIds.includes(userId)) {
      throw new ConversationNotFoundException();
```

5. Substituir:

```ts

  async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
    const membership = await this.requireParticipant(conversationId, userId);
    const message = await this.requireMessage(conversationId, messageId);

```

por:

```ts

  async markRead(userId: string, conversationId: string, messageId: string): Promise<void> {
    // A linha da participação (e não o cache): `last_read_at` muda a cada leitura.
    const membership = await this.participants.find(conversationId, userId);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }
    const message = await this.requireMessage(conversationId, messageId);

```

6. Substituir:

```ts
  }

  /** Não participante → 404; devolve a participação (ex.: `lastReadAt`). */
  private async requireParticipant(
    conversationId: string,
    userId: string
  ): Promise<ParticipantAttributes> {
    const membership = await this.participants.find(conversationId, userId);
    if (membership === null) {
      throw new ConversationNotFoundException();
    }
    return membership;
  }
}
```

por:

```ts
  }

  /** Não participante → 404 (consulta o cache de participantes). */
  private async requireParticipant(conversationId: string, userId: string): Promise<void> {
    if (!(await this.directory.isParticipant(conversationId, userId))) {
      throw new ConversationNotFoundException();
    }
  }
}
```

Criar `src/modules/chat/services/ParticipantDirectory.ts`:

```ts
import { cacheService, type ICacheService } from '@/shared/cache';
import { CHAT_CACHE_KEYS, CHAT_CACHE_TTL_SECONDS } from '../constants';
import type { IParticipantRepository } from '../interfaces';
import { participantRepository } from '../repositories';
import type { ParticipantRole } from '../types';

/** O que o cache guarda de cada participante (o resto da linha muda a cada leitura). */
export interface ParticipantSummary {
  userId: string;
  role: ParticipantRole;
}

/**
 * Participantes por conversa (ids + papéis) no cache `cache:conv:participants:<id>` — o caminho
 * quente de toda mensagem enviada/listada. Invalidado por `chat:conversation-created/updated/
 * deleted` (`registerChatCacheListeners`); o TTL de 300 s cobre um evento perdido.
 */
export class ParticipantDirectory {
  constructor(
    private readonly participants: Pick<
      IParticipantRepository,
      'listByConversation'
    > = participantRepository,
    private readonly cache: Pick<ICacheService, 'getOrLoad'> = cacheService
  ) {}

  /** Do mais antigo para o mais novo (mesma ordem do repositório). */
  async list(conversationId: string): Promise<ParticipantSummary[]> {
    return this.cache.getOrLoad(
      CHAT_CACHE_KEYS.participants(conversationId),
      CHAT_CACHE_TTL_SECONDS,
      async () =>
        (await this.participants.listByConversation(conversationId)).map(({ userId, role }) => ({
          userId,
          role,
        }))
    );
  }

  async userIds(conversationId: string): Promise<string[]> {
    return (await this.list(conversationId)).map((participant) => participant.userId);
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    return (await this.list(conversationId)).some((participant) => participant.userId === userId);
  }
}
```

Em `src/modules/chat/services/index.ts`, substituir:

```ts
export { ConversationService, conversationService, buildDirectKey } from './ConversationService';
export { MessageService, messageService } from './MessageService';
```

por:

```ts
export { ConversationService, conversationService, buildDirectKey } from './ConversationService';
export { MessageService, messageService } from './MessageService';
export { ParticipantDirectory } from './ParticipantDirectory';
export type { ParticipantSummary } from './ParticipantDirectory';
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/feature/modules/chat/chat.test.ts tests/unit/modules/chat/constants/chat.constants.test.ts tests/unit/modules/chat/controllers/ConversationController.test.ts tests/unit/modules/chat/index.test.ts tests/unit/modules/chat/listeners/chat.listeners.test.ts tests/unit/modules/chat/repositories/ParticipantRepository.test.ts tests/unit/modules/chat/services/ConversationService.test.ts tests/unit/modules/chat/services/MessageService.test.ts tests/unit/modules/chat/services/ParticipantDirectory.test.ts tests/unit/modules/chat/services/index.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/chat/constants/cache.constants.ts src/modules/chat/constants/index.ts src/modules/chat/index.ts src/modules/chat/interfaces/IConversationService.ts src/modules/chat/interfaces/IParticipantRepository.ts src/modules/chat/listeners/chat.listeners.ts src/modules/chat/listeners/index.ts src/modules/chat/repositories/ParticipantRepository.ts src/modules/chat/services/ConversationService.ts src/modules/chat/services/MessageService.ts src/modules/chat/services/ParticipantDirectory.ts src/modules/chat/services/index.ts tests/feature/modules/chat/chat.test.ts tests/support/chat/inMemoryChat.ts tests/unit/modules/chat/constants/chat.constants.test.ts tests/unit/modules/chat/controllers/ConversationController.test.ts tests/unit/modules/chat/index.test.ts tests/unit/modules/chat/listeners/chat.listeners.test.ts tests/unit/modules/chat/repositories/ParticipantRepository.test.ts tests/unit/modules/chat/services/ConversationService.test.ts tests/unit/modules/chat/services/MessageService.test.ts tests/unit/modules/chat/services/ParticipantDirectory.test.ts tests/unit/modules/chat/services/index.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat/constants/cache.constants.ts \
  src/modules/chat/constants/index.ts \
  src/modules/chat/index.ts \
  src/modules/chat/interfaces/IConversationService.ts \
  src/modules/chat/interfaces/IParticipantRepository.ts \
  src/modules/chat/listeners/chat.listeners.ts \
  src/modules/chat/listeners/index.ts \
  src/modules/chat/repositories/ParticipantRepository.ts \
  src/modules/chat/services/ConversationService.ts \
  src/modules/chat/services/MessageService.ts \
  src/modules/chat/services/ParticipantDirectory.ts \
  src/modules/chat/services/index.ts \
  tests/feature/modules/chat/chat.test.ts \
  tests/support/chat/inMemoryChat.ts \
  tests/unit/modules/chat/constants/chat.constants.test.ts \
  tests/unit/modules/chat/controllers/ConversationController.test.ts \
  tests/unit/modules/chat/index.test.ts \
  tests/unit/modules/chat/listeners/chat.listeners.test.ts \
  tests/unit/modules/chat/repositories/ParticipantRepository.test.ts \
  tests/unit/modules/chat/services/ConversationService.test.ts \
  tests/unit/modules/chat/services/MessageService.test.ts \
  tests/unit/modules/chat/services/ParticipantDirectory.test.ts \
  tests/unit/modules/chat/services/index.test.ts
git commit -m "⚡️ perf: cacheia os participantes das conversas com invalidação por evento"
```


---

### Task 7: Módulo `presence`: constantes, tipos, interface e validação

**Files:**
- Create: `src/modules/presence/constants/index.ts`
- Create: `src/modules/presence/constants/presence.constants.ts`
- Create: `src/modules/presence/index.ts`
- Create: `src/modules/presence/interfaces/IPresenceService.ts`
- Create: `src/modules/presence/interfaces/index.ts`
- Create: `src/modules/presence/types/index.ts`
- Create: `src/modules/presence/types/presence.types.ts`
- Create: `src/modules/presence/validation/index.ts`
- Create: `src/modules/presence/validation/presence.schemas.ts`
- Create: `tests/unit/modules/presence/constants/presence.constants.test.ts`
- Create: `tests/unit/modules/presence/index.test.ts`
- Create: `tests/unit/modules/presence/validation/presence.schemas.test.ts`

**Interfaces:**
- Produces: `PRESENCE_CONSTANTS { TTL_MS: 30000, HEARTBEAT_MS: 15000, SWEEP_MS: 30000, SWEEP_SCAN_COUNT: 100, CONNECTIONS_KEY_TTL_MS: 120000, MAX_QUERY_USER_IDS: 100, AUDIENCE_CACHE_TTL_SECONDS: 300 }`, `PRESENCE_KEYS { CONNECTIONS_PREFIX: 'presence:conns:', connections(id), manual(id) }`, `PRESENCE_CACHE_KEYS.audience(id) = 'presence:audience:<id>'`, `MANUAL_PRESENCE_STATUSES`, `PRESENCE_STATES`, `toManualStatus(raw: unknown): ManualPresenceStatus`, `effectiveState(connected: boolean, manual): PresenceState`.
- Produces: tipos `PresenceConnection { userId; connectionId }`, `ConnectResult { becameOnline }`, `DisconnectResult { becameOffline; lastSeenAt? }`, `SetManualStatusResult { state; changed }`, `PresenceStateEntry { state; lastSeenAt }`, `PresenceRedisClient` (multi/pipeline em array + scan); `IPresenceService` com `connect`, `heartbeat`, `disconnect`, `setManualStatus`, `getStates`, `sweep`.
- Produces: `presenceStatusSchema` (`{ status: 'available' | 'away' | 'busy' }`, mensagem "Status inválido. Use: available, away ou busy") e `presenceQuerySchema` (`userIds` separados por vírgula, 1–100 UUIDs).

Esqueleto do módulo (padrão do roadmap §2.2). As constantes seguem o spec §2 (TTL 30 s, heartbeat 15 s, varredura 30 s com `COUNT 100`); `effectiveState` e `toManualStatus` são as regras puras de estado. A interface ainda só tem as operações de conexão/estado (a audiência entra na Task 9).

- [ ] **Step 1: Escrever o teste (falha hoje)**

Criar `tests/unit/modules/presence/constants/presence.constants.test.ts`:

```ts
import {
  MANUAL_PRESENCE_STATUSES,
  PRESENCE_CACHE_KEYS,
  PRESENCE_CONSTANTS,
  PRESENCE_KEYS,
  PRESENCE_STATES,
  effectiveState,
  toManualStatus,
} from '@/modules/presence/constants';

describe('presence constants', () => {
  it('define TTL de 30 s, heartbeat de 15 s e varredura de 30 s (spec §2)', () => {
    expect(PRESENCE_CONSTANTS).toEqual({
      TTL_MS: 30_000,
      HEARTBEAT_MS: 15_000,
      SWEEP_MS: 30_000,
      SWEEP_SCAN_COUNT: 100,
      CONNECTIONS_KEY_TTL_MS: 120_000,
      MAX_QUERY_USER_IDS: 100,
      AUDIENCE_CACHE_TTL_SECONDS: 300,
    });
  });

  it('monta as chaves do Redis', () => {
    expect(PRESENCE_KEYS.connections('u1')).toBe('presence:conns:u1');
    expect(PRESENCE_KEYS.manual('u1')).toBe('presence:manual:u1');
    expect(PRESENCE_KEYS.CONNECTIONS_PREFIX).toBe('presence:conns:');
    expect(PRESENCE_CACHE_KEYS.audience('u1')).toBe('presence:audience:u1');
  });

  it('lista status manuais e estados', () => {
    expect(MANUAL_PRESENCE_STATUSES).toEqual(['available', 'away', 'busy']);
    expect(PRESENCE_STATES).toEqual(['online', 'away', 'busy', 'offline']);
  });

  it.each([
    ['available', 'available'],
    ['away', 'away'],
    ['busy', 'busy'],
    [null, 'available'],
    ['online', 'available'],
    [42, 'available'],
  ])('toManualStatus(%p) → %s', (raw, expected) => {
    expect(toManualStatus(raw)).toBe(expected);
  });

  it.each([
    [false, 'busy', 'offline'],
    [true, 'available', 'online'],
    [true, 'away', 'away'],
    [true, 'busy', 'busy'],
  ] as const)('effectiveState(conectado=%p, %s) → %s', (connected, manual, expected) => {
    expect(effectiveState(connected, manual)).toBe(expected);
  });
});
```

Criar `tests/unit/modules/presence/index.test.ts`:

```ts
import * as presenceModule from '@/modules/presence';

describe('presence module index', () => {
  it('deve exportar constantes e validação', () => {
    expect(presenceModule.PRESENCE_CONSTANTS.TTL_MS).toBe(30_000);
    expect(presenceModule.effectiveState(true, 'busy')).toBe('busy');
    expect(presenceModule.presenceStatusSchema).toBeDefined();
    expect(presenceModule.presenceQuerySchema).toBeDefined();
  });
});
```

Criar `tests/unit/modules/presence/validation/presence.schemas.test.ts`:

```ts
import { presenceQuerySchema, presenceStatusSchema } from '@/modules/presence/validation';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

describe('presence schemas', () => {
  describe('presenceStatusSchema', () => {
    it.each(['available', 'away', 'busy'])('aceita %s', (status) => {
      expect(presenceStatusSchema.parse({ status })).toEqual({ status });
    });

    it.each(['online', 'offline', '', undefined])('recusa %p', (status) => {
      const result = presenceStatusSchema.safeParse({ status });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'Status inválido. Use: available, away ou busy'
      );
    });
  });

  describe('presenceQuerySchema', () => {
    it('separa por vírgula e apara espaços', () => {
      expect(presenceQuerySchema.parse({ userIds: `${ANA}, ${BOB}` })).toEqual({
        userIds: [ANA, BOB],
      });
    });

    it('exige o parâmetro', () => {
      const result = presenceQuerySchema.safeParse({});

      expect(result.error?.issues[0]?.message).toBe('userIds é obrigatório');
    });

    it('recusa id que não é UUID', () => {
      const result = presenceQuerySchema.safeParse({ userIds: `${ANA},x` });

      expect(result.error?.issues[0]?.message).toBe('ID de usuário inválido');
    });

    it('aceita até 100 ids e recusa 101', () => {
      const ids = (count: number): string => Array.from({ length: count }, () => ANA).join(',');

      expect(presenceQuerySchema.safeParse({ userIds: ids(100) }).success).toBe(true);
      expect(presenceQuerySchema.safeParse({ userIds: ids(101) }).error?.issues[0]?.message).toBe(
        'Máximo de 100 usuários por consulta'
      );
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/constants/presence.constants.test.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/validation/presence.schemas.test.ts --coverage=false`

Expected: FAIL — `Could not locate module @/modules/presence/constants` (e `@/modules/presence/validation`, `@/modules/presence`).

- [ ] **Step 3: Implementar**

Criar `src/modules/presence/constants/index.ts`:

```ts
export {
  PRESENCE_CONSTANTS,
  PRESENCE_KEYS,
  PRESENCE_CACHE_KEYS,
  MANUAL_PRESENCE_STATUSES,
  PRESENCE_STATES,
  toManualStatus,
  effectiveState,
} from './presence.constants';
```

Criar `src/modules/presence/constants/presence.constants.ts`:

```ts
import type { ManualPresenceStatus, PresenceState } from '@/shared/types';

export const PRESENCE_CONSTANTS = {
  /** Conexão sem heartbeat há mais que isto está vencida (usuário offline se não houver outra). */
  TTL_MS: 30_000,
  /** Cada nó renova o score de todos os seus sockets neste intervalo. */
  HEARTBEAT_MS: 15_000,
  /** Varredura de conexões vencidas (queda de nó sem `disconnect`). */
  SWEEP_MS: 30_000,
  /** `COUNT` de cada `SCAN presence:conns:*` da varredura. */
  SWEEP_SCAN_COUNT: 100,
  /** Expiração do sorted set inteiro (renovada a cada conexão/heartbeat): some se ninguém o renova. */
  CONNECTIONS_KEY_TTL_MS: 120_000,
  /** Máximo de ids por consulta de presença (`GET /api/presence`). */
  MAX_QUERY_USER_IDS: 100,
  /** TTL (s) da audiência cacheada; a invalidação é por evento. */
  AUDIENCE_CACHE_TTL_SECONDS: 300,
} as const;

/** Chaves da presença no Redis (sem o prefixo `cache:` — não são cache, são estado). */
export const PRESENCE_KEYS = {
  CONNECTIONS_PREFIX: 'presence:conns:',
  /** ZSET: membro = `<nodeId>:<socketId>`, score = último heartbeat (ms). */
  connections: (userId: string): string => `presence:conns:${userId}`,
  /** Status manual (`available`/`away`/`busy`), sem TTL: sobrevive às reconexões. */
  manual: (userId: string): string => `presence:manual:${userId}`,
} as const;

/** Chaves de cache da presença (o `CacheService` acrescenta `cache:`). */
export const PRESENCE_CACHE_KEYS = {
  /** Quem é notificado quando o usuário muda de estado. */
  audience: (userId: string): string => `presence:audience:${userId}`,
} as const;

export const MANUAL_PRESENCE_STATUSES = [
  'available',
  'away',
  'busy',
] as const satisfies readonly ManualPresenceStatus[];

export const PRESENCE_STATES = [
  'online',
  'away',
  'busy',
  'offline',
] as const satisfies readonly PresenceState[];

/** Valor gravado no Redis → status manual; ausente/desconhecido vale `available`. */
export function toManualStatus(raw: unknown): ManualPresenceStatus {
  return MANUAL_PRESENCE_STATUSES.find((status) => status === raw) ?? 'available';
}

/** Sem conexão → `offline`; conectado → `online` (se `available`) ou o próprio status manual. */
export function effectiveState(connected: boolean, manual: ManualPresenceStatus): PresenceState {
  if (!connected) {
    return 'offline';
  }
  return manual === 'available' ? 'online' : manual;
}
```

Criar `src/modules/presence/index.ts`:

```ts
export * from './constants';

export * from './types';

export * from './interfaces';

export * from './validation';
```

Criar `src/modules/presence/interfaces/IPresenceService.ts`:

```ts
import type {
  ConnectResult,
  DisconnectResult,
  ManualPresenceStatus,
  PresenceConnection,
  PresenceStateEntry,
  SetManualStatusResult,
} from '../types';

/** Única porta de acesso às chaves `presence:*` do Redis. */
export interface IPresenceService {
  /** Registra a conexão; publica `presence:online` se for a primeira válida do usuário. */
  connect(userId: string, connectionId: string): Promise<ConnectResult>;
  /** Renova o score das conexões (só as que ainda existem — `ZADD XX`), em lote. */
  heartbeat(connections: PresenceConnection[]): Promise<void>;
  /** Remove a conexão; se era a última, grava `last_seen_at` e publica `presence:offline`. */
  disconnect(userId: string, connectionId: string): Promise<DisconnectResult>;
  /** Grava o status manual; publica `presence:status-changed` se o estado efetivo mudou. */
  setManualStatus(userId: string, status: ManualPresenceStatus): Promise<SetManualStatusResult>;
  /** Estados em lote (sem filtro de bloqueio); `lastSeenAt` do Postgres só para os offline. */
  getStates(userIds: string[]): Promise<Map<string, PresenceStateEntry>>;
  /** Remove conexões vencidas e publica `presence:offline` de quem ficou sem nenhuma. */
  sweep(): Promise<string[]>;
}
```

Criar `src/modules/presence/interfaces/index.ts`:

```ts
export type { IPresenceService } from './IPresenceService';
```

Criar `src/modules/presence/types/index.ts`:

```ts
export type {
  ManualPresenceStatus,
  PresenceState,
  PresenceStateDTO,
  PresenceConnection,
  ConnectResult,
  DisconnectResult,
  SetManualStatusResult,
  PresenceStateEntry,
  PresenceRedisClient,
} from './presence.types';
```

Criar `src/modules/presence/types/presence.types.ts`:

```ts
import type { RedisBatch, RedisCommand } from '@/shared/cache';
import type { PresenceState } from '@/shared/types';

export type { ManualPresenceStatus, PresenceState, PresenceStateDTO } from '@/shared/types';

/** Uma conexão (socket) de um usuário: `connectionId` = `<nodeId>:<socketId>`. */
export interface PresenceConnection {
  userId: string;
  connectionId: string;
}

export interface ConnectResult {
  /** `true` se não havia outra conexão válida (primeira aba/dispositivo). */
  becameOnline: boolean;
}

export interface DisconnectResult {
  /** `true` se esta era a última conexão do usuário. */
  becameOffline: boolean;
  /** Gravado em `users.last_seen_at` quando `becameOffline`. */
  lastSeenAt?: Date;
}

export interface SetManualStatusResult {
  /** Estado efetivo depois da mudança. */
  state: PresenceState;
  /** `true` se o estado efetivo mudou (e `presence:status-changed` foi publicado). */
  changed: boolean;
}

/** Estado de um usuário (`lastSeenAt` só quando `offline`). */
export interface PresenceStateEntry {
  state: PresenceState;
  lastSeenAt: Date | null;
}

/** Os comandos do Redis que a presença usa (o `Redis` do ioredis satisfaz esta interface). */
export interface PresenceRedisClient {
  multi(commands: RedisCommand[]): RedisBatch;
  pipeline(commands: RedisCommand[]): RedisBatch;
  scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number
  ): Promise<[string, string[]]>;
}
```

Criar `src/modules/presence/validation/index.ts`:

```ts
export { presenceStatusSchema, presenceQuerySchema } from './presence.schemas';
export type { PresenceStatusInput, PresenceQueryInput } from './presence.schemas';
```

Criar `src/modules/presence/validation/presence.schemas.ts`:

```ts
import { z } from 'zod';
import { MANUAL_PRESENCE_STATUSES, PRESENCE_CONSTANTS } from '../constants';

/** `PUT /api/presence/status` e `presence:set`. */
export const presenceStatusSchema = z.object({
  status: z.enum(MANUAL_PRESENCE_STATUSES, {
    message: 'Status inválido. Use: available, away ou busy',
  }),
});

/** `GET /api/presence?userIds=<uuid>,<uuid>` (1 a 100 ids). */
export const presenceQuerySchema = z.object({
  userIds: z
    .string({ message: 'userIds é obrigatório' })
    .transform((value) => value.split(',').map((id) => id.trim()))
    .pipe(
      z
        .array(z.uuid({ message: 'ID de usuário inválido' }))
        .min(1, 'Pelo menos um ID é obrigatório')
        .max(
          PRESENCE_CONSTANTS.MAX_QUERY_USER_IDS,
          `Máximo de ${String(PRESENCE_CONSTANTS.MAX_QUERY_USER_IDS)} usuários por consulta`
        )
    ),
});

export type PresenceStatusInput = z.infer<typeof presenceStatusSchema>;
export type PresenceQueryInput = z.infer<typeof presenceQuerySchema>;
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/constants/presence.constants.test.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/validation/presence.schemas.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/presence/constants/index.ts src/modules/presence/constants/presence.constants.ts src/modules/presence/index.ts src/modules/presence/interfaces/IPresenceService.ts src/modules/presence/interfaces/index.ts src/modules/presence/types/index.ts src/modules/presence/types/presence.types.ts src/modules/presence/validation/index.ts src/modules/presence/validation/presence.schemas.ts tests/unit/modules/presence/constants/presence.constants.test.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/validation/presence.schemas.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/presence/constants/index.ts \
  src/modules/presence/constants/presence.constants.ts \
  src/modules/presence/index.ts \
  src/modules/presence/interfaces/IPresenceService.ts \
  src/modules/presence/interfaces/index.ts \
  src/modules/presence/types/index.ts \
  src/modules/presence/types/presence.types.ts \
  src/modules/presence/validation/index.ts \
  src/modules/presence/validation/presence.schemas.ts \
  tests/unit/modules/presence/constants/presence.constants.test.ts \
  tests/unit/modules/presence/index.test.ts \
  tests/unit/modules/presence/validation/presence.schemas.test.ts
git commit -m "✨ feat: cria o módulo presence com constantes, tipos e validação"
```


---

### Task 8: `PresenceService`: conexões, status manual, estados e varredura

**Files:**
- Modify: `src/modules/presence/index.ts`
- Create: `src/modules/presence/services/PresenceService.ts`
- Create: `src/modules/presence/services/index.ts`
- Modify: `tests/unit/modules/presence/index.test.ts`
- Create: `tests/unit/modules/presence/services/PresenceService.test.ts`

**Interfaces:**
- Consumes: `PresenceRedisClient`, constantes (Task 7); `IUserService.getMultiple/updateLastSeen(userId, at)` (Task 5); `PresenceEvents` (Task 1).
- Produces: `new PresenceService(options?: PresenceServiceOptions)` com `{ redis?, users?, events?, now?, ttlMs?, connectionsKeyTtlMs?, sweepScanCount? }` e o singleton `presenceService`; `connect(userId, connectionId): Promise<ConnectResult>`, `heartbeat(connections: PresenceConnection[])`, `disconnect(userId, connectionId): Promise<DisconnectResult>`, `setManualStatus(userId, status): Promise<SetManualStatusResult>`, `getStates(userIds): Promise<Map<string, PresenceStateEntry>>`, `sweep(): Promise<string[]>` (ids que ficaram offline).

A única porta das chaves `presence:*` (spec §2). Recebe as dependências num objeto de opções (todas com padrão), inclusive relógio e TTL — os testes usam um relógio falso e a integração um TTL curto.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/presence/index.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import * as presenceModule from '@/modules/presence';

```

por:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import * as presenceModule from '@/modules/presence';

```

2. Substituir:

```ts
    expect(presenceModule.presenceQuerySchema).toBeDefined();
  });
});
```

por:

```ts
    expect(presenceModule.presenceQuerySchema).toBeDefined();
  });

  it('deve exportar o service e a instância padrão', () => {
    expect(presenceModule.presenceService).toBeInstanceOf(presenceModule.PresenceService);
  });
});
```

Criar `tests/unit/modules/presence/services/PresenceService.test.ts`:

```ts
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

import type { PresenceRedisClient } from '@/modules/presence/types';
import { PresenceService, presenceService } from '@/modules/presence/services';
import { logger } from '@/shared/logger';
import { PresenceEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const TTL_MS = 30_000;
const LAST_SEEN = new Date('2026-09-26T09:00:00.000Z');

const conns = (userId: string): string => `presence:conns:${userId}`;
const manual = (userId: string): string => `presence:manual:${userId}`;

describe('PresenceService — conexões, status manual, estados e varredura', () => {
  let now: number;
  let redis: FakeRedis;
  let users: { getMultiple: jest.Mock; updateLastSeen: jest.Mock };
  let events: { publish: jest.Mock };
  let service: PresenceService;

  beforeEach(() => {
    now = Date.parse('2026-09-26T10:00:00.000Z');
    redis = new FakeRedis(() => now);
    users = {
      getMultiple: jest.fn().mockResolvedValue([]),
      updateLastSeen: jest.fn().mockResolvedValue(undefined),
    };
    events = { publish: jest.fn().mockResolvedValue('event-id') };
    service = new PresenceService({ redis, users, events, now: () => now, sweepScanCount: 2 });
  });

  it('exporta a instância padrão (Redis e services da aplicação)', () => {
    expect(presenceService).toBeInstanceOf(PresenceService);
    expect(new PresenceService()).toBeInstanceOf(PresenceService);
  });

  describe('connect', () => {
    it('primeira conexão: ZADD com o instante, expiração da chave e presence:online', async () => {
      await expect(service.connect(ANA, 'node-a:s1')).resolves.toEqual({ becameOnline: true });

      expect(await redis.zscore(conns(ANA), 'node-a:s1')).toBe(String(now));
      expect(await redis.pttl(conns(ANA))).toBe(120_000);
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.ONLINE, {
        userId: ANA,
        timestamp: new Date(now),
      });
    });

    it('outra aba do mesmo usuário não publica de novo', async () => {
      await service.connect(ANA, 'node-a:s1');
      events.publish.mockClear();

      await expect(service.connect(ANA, 'node-b:s2')).resolves.toEqual({ becameOnline: false });
      expect(events.publish).not.toHaveBeenCalled();
      expect(await redis.zcard(conns(ANA))).toBe(2);
    });

    it('entrada vencida (nó que caiu) é removida e não conta como conexão', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead-node:s0');

      await expect(service.connect(ANA, 'node-a:s1')).resolves.toEqual({ becameOnline: true });
      expect(await redis.zscore(conns(ANA), 'dead-node:s0')).toBeNull();
    });

    it('entrada com heartbeat há exatamente 30 s ainda vale', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS, 'node-b:s0');

      await expect(service.connect(ANA, 'node-a:s1')).resolves.toEqual({ becameOnline: false });
    });
  });

  describe('heartbeat', () => {
    it('sem conexões não vai ao Redis', async () => {
      await service.heartbeat([]);

      expect(redis.commands).toEqual([]);
    });

    it('renova o score (e a expiração) só de quem ainda existe — ZADD XX', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.connect(BOB, 'node-a:s2');
      await service.disconnect(BOB, 'node-a:s2');
      now += 15_000;

      await service.heartbeat([
        { userId: ANA, connectionId: 'node-a:s1' },
        { userId: BOB, connectionId: 'node-a:s2' },
      ]);

      expect(await redis.zscore(conns(ANA), 'node-a:s1')).toBe(String(now));
      expect(await redis.pttl(conns(ANA))).toBe(120_000);
      expect(await redis.zcard(conns(BOB))).toBe(0);
    });
  });

  describe('disconnect', () => {
    it('última conexão: grava last_seen_at e publica presence:offline', async () => {
      await service.connect(ANA, 'node-a:s1');
      events.publish.mockClear();
      now += 5_000;

      const result = await service.disconnect(ANA, 'node-a:s1');

      expect(result).toEqual({ becameOffline: true, lastSeenAt: new Date(now) });
      expect(users.updateLastSeen).toHaveBeenCalledWith(ANA, new Date(now));
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.OFFLINE, {
        userId: ANA,
        lastSeen: new Date(now),
      });
      expect(redis.keys()).toEqual([]);
    });

    it('com outra aba conectada não fica offline', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.connect(ANA, 'node-a:s2');
      events.publish.mockClear();

      await expect(service.disconnect(ANA, 'node-a:s1')).resolves.toEqual({
        becameOffline: false,
      });
      expect(users.updateLastSeen).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('a outra "aba" vencida não segura o usuário online', async () => {
      await service.connect(ANA, 'node-a:s1');
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead-node:s0');

      await expect(service.disconnect(ANA, 'node-a:s1')).resolves.toMatchObject({
        becameOffline: true,
      });
    });

    it('entrada já removida pela varredura: nada a publicar', async () => {
      await expect(service.disconnect(ANA, 'node-a:s1')).resolves.toEqual({
        becameOffline: false,
      });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('falha ao gravar last_seen_at é logada e o offline sai mesmo assim', async () => {
      await service.connect(ANA, 'node-a:s1');
      users.updateLastSeen.mockRejectedValueOnce(new Error('pg down'));

      await service.disconnect(ANA, 'node-a:s1');

      expect(logger.error).toHaveBeenCalledWith(
        'Falha ao gravar last_seen_at na saída do usuário',
        expect.objectContaining({ message: 'pg down' }),
        { userId: ANA }
      );
      expect(events.publish).toHaveBeenCalledWith(
        PresenceEvents.OFFLINE,
        expect.objectContaining({ userId: ANA })
      );
    });

    it('rejeição que não é Error também é logada', async () => {
      await service.connect(ANA, 'node-a:s1');
      users.updateLastSeen.mockRejectedValueOnce('timeout');

      await service.disconnect(ANA, 'node-a:s1');

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'timeout' }),
        { userId: ANA }
      );
    });
  });

  describe('setManualStatus', () => {
    it('offline: grava o status sem mudar o estado (sem evento)', async () => {
      await expect(service.setManualStatus(ANA, 'busy')).resolves.toEqual({
        state: 'offline',
        changed: false,
      });
      expect(await redis.get(manual(ANA))).toBe('busy');
      expect(await redis.ttl(manual(ANA))).toBe(-1);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('conectado: available → busy publica presence:status-changed', async () => {
      await service.connect(ANA, 'node-a:s1');
      events.publish.mockClear();

      await expect(service.setManualStatus(ANA, 'busy')).resolves.toEqual({
        state: 'busy',
        changed: true,
      });
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.STATUS_CHANGED, {
        userId: ANA,
        status: 'busy',
      });
    });

    it('repetir o mesmo status não publica; voltar a available vira online', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.setManualStatus(ANA, 'away');
      events.publish.mockClear();

      await expect(service.setManualStatus(ANA, 'away')).resolves.toEqual({
        state: 'away',
        changed: false,
      });
      expect(events.publish).not.toHaveBeenCalled();
      await expect(service.setManualStatus(ANA, 'available')).resolves.toEqual({
        state: 'online',
        changed: true,
      });
    });

    it('valor desconhecido no Redis vale available', async () => {
      await service.connect(ANA, 'node-a:s1');
      await redis.set(manual(ANA), 'lixo');

      await expect(service.setManualStatus(ANA, 'available')).resolves.toEqual({
        state: 'online',
        changed: false,
      });
    });
  });

  describe('getStates', () => {
    it('lista vazia não vai ao Redis', async () => {
      await expect(service.getStates([])).resolves.toEqual(new Map());
      expect(redis.commands).toEqual([]);
    });

    it('efetivo por usuário; last_seen_at do Postgres só para os offline', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.connect(BOB, 'node-a:s2');
      await service.setManualStatus(BOB, 'busy');
      await redis.zadd(conns(CAROL), now - TTL_MS - 1, 'dead-node:s0');
      users.getMultiple.mockResolvedValue([{ id: CAROL, lastSeenAt: LAST_SEEN }]);

      const states = await service.getStates([ANA, BOB, CAROL, ANA, 'ghost']);

      expect(users.getMultiple).toHaveBeenCalledWith([CAROL, 'ghost']);
      expect([...states]).toEqual([
        [ANA, { state: 'online', lastSeenAt: null }],
        [BOB, { state: 'busy', lastSeenAt: null }],
        [CAROL, { state: 'offline', lastSeenAt: LAST_SEEN }],
        ['ghost', { state: 'offline', lastSeenAt: null }],
      ]);
    });

    it('status manual persiste entre reconexões', async () => {
      await service.connect(ANA, 'node-a:s1');
      await service.setManualStatus(ANA, 'away');
      await service.disconnect(ANA, 'node-a:s1');
      await service.connect(ANA, 'node-a:s9');

      expect((await service.getStates([ANA])).get(ANA)).toEqual({
        state: 'away',
        lastSeenAt: null,
      });
    });
  });

  describe('sweep', () => {
    it('percorre todas as chaves (SCAN em lotes) e só derruba quem ficou sem conexão', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead:s1');
      await redis.zadd(conns(BOB), now - TTL_MS - 1, 'dead:s2', now, 'alive:s3');
      await redis.zadd(conns(CAROL), now, 'alive:s4');
      await redis.zadd(conns('dave'), now - TTL_MS - 5, 'dead:s5');
      await redis.set(manual(ANA), 'busy');

      const wentOffline = await service.sweep();

      expect(wentOffline.sort()).toEqual([ANA, 'dave'].sort());
      expect(users.updateLastSeen).toHaveBeenCalledWith(ANA, new Date(now));
      expect(events.publish).toHaveBeenCalledTimes(2);
      expect(events.publish).toHaveBeenCalledWith(PresenceEvents.OFFLINE, {
        userId: ANA,
        lastSeen: new Date(now),
      });
      expect(await redis.zcard(conns(BOB))).toBe(1);
      expect(await redis.zcard(conns(CAROL))).toBe(1);
      expect(await redis.get(manual(ANA))).toBe('busy');
    });

    it('duas varreduras (duas instâncias) não publicam o mesmo offline duas vezes', async () => {
      await redis.zadd(conns(ANA), now - TTL_MS - 1, 'dead:s1');

      await service.sweep();
      await service.sweep();

      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('sem chaves de presença não publica nada', async () => {
      await expect(service.sweep()).resolves.toEqual([]);
    });
  });

  describe('falhas do Redis', () => {
    it('Redis fora do ar: a operação rejeita (quem chama loga)', async () => {
      redis.failWith = new Error('ECONNREFUSED');

      await expect(service.connect(ANA, 'node-a:s1')).rejects.toThrow('ECONNREFUSED');
    });

    it('erro de um comando do lote rejeita a operação', async () => {
      await redis.set(conns(ANA), 'não é um sorted set');

      await expect(service.connect(ANA, 'node-a:s1')).rejects.toThrow('WRONGTYPE');
    });

    it('lote abortado (exec → null) rejeita', async () => {
      const aborted = {
        multi: () => ({ exec: async () => null }),
      } as unknown as PresenceRedisClient;

      await expect(
        new PresenceService({ redis: aborted, users, events }).connect(ANA, 's1')
      ).rejects.toThrow('Lote do Redis abortado');
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/services/PresenceService.test.ts --coverage=false`

Expected: FAIL — `Could not locate module @/modules/presence/services` (e o teste do barrel não encontra `presenceService`).

- [ ] **Step 3: Implementar**

Em `src/modules/presence/index.ts`, substituir:

```ts

export * from './validation';
```

por:

```ts

export * from './validation';

export { PresenceService, presenceService } from './services';
export type { PresenceServiceOptions } from './services';
```

Criar `src/modules/presence/services/PresenceService.ts`:

```ts
import type { IUserService } from '@/modules/user/interfaces';
import { userService } from '@/modules/user/services/UserService';
import type { RedisCommand } from '@/shared/cache';
import { redis } from '@/shared/database/redis';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { PresenceEvents } from '@/shared/types';
import { PRESENCE_CONSTANTS, PRESENCE_KEYS, effectiveState, toManualStatus } from '../constants';
import type { IPresenceService } from '../interfaces';
import type {
  ConnectResult,
  DisconnectResult,
  ManualPresenceStatus,
  PresenceConnection,
  PresenceRedisClient,
  PresenceState,
  PresenceStateEntry,
  SetManualStatusResult,
} from '../types';

export interface PresenceServiceOptions {
  redis?: PresenceRedisClient;
  users?: Pick<IUserService, 'getMultiple' | 'updateLastSeen'>;
  events?: Pick<EventBus, 'publish'>;
  /** Relógio (ms) injetável nos testes. */
  now?: () => number;
  /** @default PRESENCE_CONSTANTS.TTL_MS */
  ttlMs?: number;
  /** @default PRESENCE_CONSTANTS.CONNECTIONS_KEY_TTL_MS */
  connectionsKeyTtlMs?: number;
  /** @default PRESENCE_CONSTANTS.SWEEP_SCAN_COUNT */
  sweepScanCount?: number;
}

/**
 * Presença (RF004) sobre o Redis — a única porta de acesso às chaves `presence:*`:
 *
 * - `presence:conns:<userId>`: ZSET com uma entrada por socket (`<nodeId>:<socketId>`), score =
 *   último heartbeat (ms). Conectado = alguma entrada com score ≥ agora − 30 s; as vencidas
 *   (queda de nó sem `disconnect`) são removidas com `ZREMRANGEBYSCORE`.
 * - `presence:manual:<userId>`: status manual (`available`/`away`/`busy`), sem TTL.
 *
 * Toda leitura-e-escrita de conexão roda num `MULTI` (atômico): com várias instâncias, só uma
 * delas vê a transição online/offline e publica o evento.
 */
export class PresenceService implements IPresenceService {
  private readonly redis: PresenceRedisClient;
  private readonly users: Pick<IUserService, 'getMultiple' | 'updateLastSeen'>;
  private readonly events: Pick<EventBus, 'publish'>;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly connectionsKeyTtlMs: number;
  private readonly sweepScanCount: number;

  constructor(options: PresenceServiceOptions = {}) {
    this.redis = options.redis ?? redis;
    this.users = options.users ?? userService;
    this.events = options.events ?? eventBus;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? PRESENCE_CONSTANTS.TTL_MS;
    this.connectionsKeyTtlMs =
      options.connectionsKeyTtlMs ?? PRESENCE_CONSTANTS.CONNECTIONS_KEY_TTL_MS;
    this.sweepScanCount = options.sweepScanCount ?? PRESENCE_CONSTANTS.SWEEP_SCAN_COUNT;
  }

  async connect(userId: string, connectionId: string): Promise<ConnectResult> {
    const now = this.now();
    const key = PRESENCE_KEYS.connections(userId);
    const [, validBefore] = await this.exec('multi', [
      ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
      ['zcard', key],
      ['zadd', key, now, connectionId],
      ['pexpire', key, this.connectionsKeyTtlMs],
    ]);

    const becameOnline = validBefore === 0;
    if (becameOnline) {
      await this.events.publish(PresenceEvents.ONLINE, { userId, timestamp: new Date(now) });
    }
    return { becameOnline };
  }

  async heartbeat(connections: PresenceConnection[]): Promise<void> {
    if (connections.length === 0) {
      return;
    }
    const now = this.now();
    // `XX`: só renova entradas que ainda existem — um socket que acabou de desconectar (ou que a
    // varredura já removeu) não é ressuscitado.
    await this.exec(
      'pipeline',
      connections.flatMap(({ userId, connectionId }): RedisCommand[] => {
        const key = PRESENCE_KEYS.connections(userId);
        return [
          ['zadd', key, 'XX', now, connectionId],
          ['pexpire', key, this.connectionsKeyTtlMs],
        ];
      })
    );
  }

  async disconnect(userId: string, connectionId: string): Promise<DisconnectResult> {
    const now = this.now();
    const key = PRESENCE_KEYS.connections(userId);
    const [removed, , remaining] = await this.exec('multi', [
      ['zrem', key, connectionId],
      ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
      ['zcard', key],
    ]);

    // `removed === 0`: a varredura já tirou esta entrada (e já publicou o offline).
    if (removed === 0 || remaining !== 0) {
      return { becameOffline: false };
    }
    const lastSeenAt = new Date(now);
    await this.goOffline(userId, lastSeenAt);
    return { becameOffline: true, lastSeenAt };
  }

  async setManualStatus(
    userId: string,
    status: ManualPresenceStatus
  ): Promise<SetManualStatusResult> {
    const [previous, , connections] = await this.exec('multi', [
      ['get', PRESENCE_KEYS.manual(userId)],
      ['set', PRESENCE_KEYS.manual(userId), status],
      ['zcount', PRESENCE_KEYS.connections(userId), this.now() - this.ttlMs, '+inf'],
    ]);

    const connected = (connections as number) > 0;
    const before = effectiveState(connected, toManualStatus(previous));
    const state = effectiveState(connected, status);
    const changed = before !== state;
    if (changed) {
      await this.events.publish(PresenceEvents.STATUS_CHANGED, { userId, status });
    }
    return { state, changed };
  }

  async getStates(userIds: string[]): Promise<Map<string, PresenceStateEntry>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }

    const cutoff = this.now() - this.ttlMs;
    const results = await this.exec(
      'pipeline',
      unique.flatMap((id): RedisCommand[] => [
        ['zcount', PRESENCE_KEYS.connections(id), cutoff, '+inf'],
        ['get', PRESENCE_KEYS.manual(id)],
      ])
    );

    const online = new Map<string, PresenceState>();
    unique.forEach((id, index) => {
      if ((results[index * 2] as number) > 0) {
        online.set(id, effectiveState(true, toManualStatus(results[index * 2 + 1])));
      }
    });

    // `last_seen_at` só de quem está offline, numa leitura em lote (cacheada no módulo user).
    const offlineIds = unique.filter((id) => !online.has(id));
    const lastSeen = new Map(
      (await this.users.getMultiple(offlineIds)).map((user) => [user.id, user.lastSeenAt])
    );

    return new Map(
      unique.map((id): [string, PresenceStateEntry] => {
        const state = online.get(id);
        return state === undefined
          ? [id, { state: 'offline', lastSeenAt: lastSeen.get(id) ?? null }]
          : [id, { state, lastSeenAt: null }];
      })
    );
  }

  /**
   * Varre `presence:conns:*` (SCAN com COUNT 100) e remove as entradas vencidas; quem ficou sem
   * nenhuma conexão vai para offline (cobre a queda de uma instância sem `disconnect`). O MULTI
   * por chave garante que só uma instância publique o offline. Custo O(chaves de presença) a
   * cada 30 s — aceitável para o porte do projeto.
   */
  async sweep(): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        `${PRESENCE_KEYS.CONNECTIONS_PREFIX}*`,
        'COUNT',
        this.sweepScanCount
      );
      batch.forEach((key) => keys.add(key));
      cursor = next;
    } while (cursor !== '0');

    const now = this.now();
    const wentOffline: string[] = [];
    for (const key of keys) {
      const [removed, remaining] = await this.exec('multi', [
        ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
        ['zcard', key],
      ]);
      if ((removed as number) > 0 && remaining === 0) {
        const userId = key.slice(PRESENCE_KEYS.CONNECTIONS_PREFIX.length);
        await this.goOffline(userId, new Date(now));
        wentOffline.push(userId);
      }
    }
    return wentOffline;
  }

  /**
   * Grava `last_seen_at` e publica `presence:offline`. Uma falha no Postgres é logada e não
   * impede o evento (os contatos precisam ver o offline mesmo assim).
   */
  private async goOffline(userId: string, at: Date): Promise<void> {
    try {
      await this.users.updateLastSeen(userId, at);
    } catch (error) {
      logger.error(
        'Falha ao gravar last_seen_at na saída do usuário',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
    }
    await this.events.publish(PresenceEvents.OFFLINE, { userId, lastSeen: at });
  }

  /** Executa o lote e devolve os resultados; erro em qualquer comando (ou lote abortado) lança. */
  private async exec(mode: 'multi' | 'pipeline', commands: RedisCommand[]): Promise<unknown[]> {
    const results = await this.redis[mode](commands).exec();
    if (results === null) {
      throw new Error('Lote do Redis abortado');
    }
    return results.map(([error, value]) => {
      if (error !== null) {
        throw error;
      }
      return value;
    });
  }
}

export const presenceService = new PresenceService();
```

Criar `src/modules/presence/services/index.ts`:

```ts
export { PresenceService, presenceService } from './PresenceService';
export type { PresenceServiceOptions } from './PresenceService';
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/services/PresenceService.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/presence/index.ts src/modules/presence/services/PresenceService.ts src/modules/presence/services/index.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/services/PresenceService.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/presence/index.ts \
  src/modules/presence/services/PresenceService.ts \
  src/modules/presence/services/index.ts \
  tests/unit/modules/presence/index.test.ts \
  tests/unit/modules/presence/services/PresenceService.test.ts
git commit -m "✨ feat: adiciona o PresenceService (conexões, status manual, estados e varredura)"
```


---

### Task 9: Audiência da presença (cache) e visibilidade com bloqueios

**Files:**
- Modify: `src/modules/presence/index.ts`
- Modify: `src/modules/presence/interfaces/IPresenceService.ts`
- Create: `src/modules/presence/listeners/index.ts`
- Create: `src/modules/presence/listeners/presence.listeners.ts`
- Modify: `src/modules/presence/services/PresenceService.ts`
- Modify: `tests/unit/modules/presence/index.test.ts`
- Create: `tests/unit/modules/presence/listeners/presence.listeners.test.ts`
- Create: `tests/unit/modules/presence/services/PresenceService.audience.test.ts`

**Interfaces:**
- Consumes: `IContactService.listWatchers/listContactIds/listBlockedEitherIds` (Task 4), `IConversationService.getDirectPartnerIds` (Task 6), `ICacheService.getOrLoad` (Task 3).
- Produces: `PresenceServiceOptions` ganha `contacts?`, `conversations?`, `cache?`; `IPresenceService`/`PresenceService` ganham `presenceAudience(userId): Promise<string[]>`, `watchedUserIds(userId): Promise<string[]>` e `getVisibleStates(viewerId, userIds): Promise<PresenceStateDTO[]>` (na ordem dos ids, sem repetição).
- Produces: `registerPresenceCacheListeners(bus = eventBus, cache = cacheService): () => void`.

Spec §4: audiência de U = quem tem U como contato não bloqueado ∪ parceiros das conversas 1:1 de U, menos qualquer um com bloqueio em qualquer sentido — cacheada em `cache:presence:audience:<id>`. Mais `watchedUserIds` (quem U observa, para o snapshot) e `getVisibleStates` (pares bloqueados sempre `offline` sem `lastSeenAt`). `registerPresenceCacheListeners` invalida a audiência em bloqueio/desbloqueio, contato adicionado/removido (de `contactId`) e conversa `direct` criada (dos dois). Os dois arquivos abaixo são reescritos inteiros.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/presence/index.test.ts`, substituir:

```ts
    expect(presenceModule.presenceService).toBeInstanceOf(presenceModule.PresenceService);
  });
});
```

por:

```ts
    expect(presenceModule.presenceService).toBeInstanceOf(presenceModule.PresenceService);
  });

  it('deve exportar os listeners de invalidação da audiência', () => {
    expect(presenceModule.registerPresenceCacheListeners).toBeInstanceOf(Function);
  });
});
```

Criar `tests/unit/modules/presence/listeners/presence.listeners.test.ts`:

```ts
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { registerPresenceCacheListeners } from '@/modules/presence/listeners';
import { CacheService } from '@/shared/cache';
import { EventBus } from '@/shared/event-bus/EventBus';
import { ChatEvents, UserEvents } from '@/shared/types';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const audience = (userId: string): string => `cache:presence:audience:${userId}`;

describe('registerPresenceCacheListeners', () => {
  let bus: EventBus;
  let redis: FakeRedis;
  let unregister: () => void;

  beforeEach(async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    redis = new FakeRedis();
    unregister = registerPresenceCacheListeners(bus, new CacheService(redis));
    for (const userId of ['a', 'b', 'c']) {
      await redis.set(audience(userId), '[]');
    }
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  const remaining = (): string[] => redis.keys();

  it('bloqueio e desbloqueio apagam a audiência dos dois envolvidos', async () => {
    await bus.publish(UserEvents.BLOCKED, { userId: 'a', blockedUserId: 'b' });
    expect(remaining()).toEqual([audience('c')]);

    await redis.set(audience('a'), '[]');
    await bus.publish(UserEvents.UNBLOCKED, { userId: 'c', unblockedUserId: 'a' });
    expect(remaining()).toEqual([]);
  });

  it('contato adicionado/removido apaga a audiência de quem passou (ou deixou) de ser observado', async () => {
    await bus.publish(UserEvents.CONTACT_ADDED, { userId: 'a', contactId: 'b' });
    expect(remaining()).toEqual([audience('a'), audience('c')]);

    await bus.publish(UserEvents.CONTACT_REMOVED, { userId: 'a', contactId: 'c' });
    expect(remaining()).toEqual([audience('a')]);
  });

  it('conversa direct criada apaga a audiência dos dois; grupo não mexe', async () => {
    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: 'g1',
      type: 'group',
      creatorId: 'a',
      participantIds: ['a', 'b', 'c'],
    });
    expect(remaining()).toHaveLength(3);

    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: 'd1',
      type: 'direct',
      creatorId: 'a',
      participantIds: ['a', 'b'],
    });
    expect(remaining()).toEqual([audience('c')]);
  });

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o cache da aplicação', async () => {
    unregister();
    await bus.publish(UserEvents.BLOCKED, { userId: 'a', blockedUserId: 'b' });

    expect(remaining()).toHaveLength(3);
    expect(registerPresenceCacheListeners()).toBeInstanceOf(Function);
  });
});
```

Criar `tests/unit/modules/presence/services/PresenceService.audience.test.ts`:

```ts
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { PresenceService } from '@/modules/presence/services';
import { CacheService } from '@/shared/cache';
import { FakeRedis } from '../../../../support/redis/fakeRedis';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';
const LAST_SEEN = new Date('2026-09-26T09:00:00.000Z');

describe('PresenceService — audiência, observados e visibilidade (bloqueios)', () => {
  let redis: FakeRedis;
  let cacheRedis: FakeRedis;
  let contacts: {
    listWatchers: jest.Mock;
    listContactIds: jest.Mock;
    listBlockedEitherIds: jest.Mock;
  };
  let conversations: { getDirectPartnerIds: jest.Mock };
  let users: { getMultiple: jest.Mock; updateLastSeen: jest.Mock };
  let service: PresenceService;

  beforeEach(() => {
    redis = new FakeRedis();
    cacheRedis = new FakeRedis();
    contacts = {
      listWatchers: jest.fn().mockResolvedValue([BOB, CAROL]),
      listContactIds: jest.fn().mockResolvedValue([BOB, DAVE]),
      listBlockedEitherIds: jest.fn().mockResolvedValue([CAROL]),
    };
    conversations = { getDirectPartnerIds: jest.fn().mockResolvedValue([BOB, DAVE, ANA]) };
    users = { getMultiple: jest.fn().mockResolvedValue([]), updateLastSeen: jest.fn() };
    service = new PresenceService({
      redis,
      users,
      contacts,
      conversations,
      events: { publish: jest.fn() },
      cache: new CacheService(cacheRedis),
    });
  });

  describe('presenceAudience', () => {
    it('quem tem o usuário como contato ∪ parceiros 1:1, menos bloqueios e ele mesmo', async () => {
      await expect(service.presenceAudience(ANA)).resolves.toEqual([BOB, DAVE]);

      expect(contacts.listWatchers).toHaveBeenCalledWith(ANA);
      expect(conversations.getDirectPartnerIds).toHaveBeenCalledWith(ANA);
      expect(contacts.listBlockedEitherIds).toHaveBeenCalledWith(ANA);
    });

    it('fica em cache:presence:audience:<id> por 300 s (segunda chamada sem consultas)', async () => {
      await service.presenceAudience(ANA);
      await service.presenceAudience(ANA);

      expect(contacts.listWatchers).toHaveBeenCalledTimes(1);
      expect(await cacheRedis.ttl(`cache:presence:audience:${ANA}`)).toBe(300);
    });
  });

  describe('watchedUserIds', () => {
    it('contatos do usuário ∪ parceiros 1:1, menos bloqueios e ele mesmo', async () => {
      await expect(service.watchedUserIds(ANA)).resolves.toEqual([BOB, DAVE]);
      expect(contacts.listContactIds).toHaveBeenCalledWith(ANA);
    });
  });

  describe('getVisibleStates', () => {
    it('par bloqueado sai offline sem lastSeenAt (e nem é consultado); demais, o estado real', async () => {
      await service.connect(BOB, 'node-a:s1');
      users.getMultiple.mockResolvedValue([{ id: DAVE, lastSeenAt: LAST_SEEN }]);

      const states = await service.getVisibleStates(ANA, [BOB, CAROL, DAVE, BOB]);

      expect(states).toEqual([
        { userId: BOB, state: 'online', lastSeenAt: null },
        { userId: CAROL, state: 'offline', lastSeenAt: null },
        { userId: DAVE, state: 'offline', lastSeenAt: LAST_SEEN },
      ]);
      expect(users.getMultiple).toHaveBeenCalledWith([DAVE]);
      expect(contacts.listBlockedEitherIds).toHaveBeenCalledWith(ANA);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/listeners/presence.listeners.test.ts tests/unit/modules/presence/services/PresenceService.audience.test.ts --coverage=false`

Expected: FAIL — 5 testes (`presenceAudience`/`watchedUserIds`/`getVisibleStates` não são funções) e `Could not locate module @/modules/presence/listeners`.

- [ ] **Step 3: Implementar**

Em `src/modules/presence/index.ts`, substituir:

```ts
export { PresenceService, presenceService } from './services';
export type { PresenceServiceOptions } from './services';
```

por:

```ts
export { PresenceService, presenceService } from './services';
export type { PresenceServiceOptions } from './services';

export { registerPresenceCacheListeners } from './listeners';
```

Substituir `src/modules/presence/interfaces/IPresenceService.ts` inteiro por:

```ts
import type {
  ConnectResult,
  DisconnectResult,
  ManualPresenceStatus,
  PresenceConnection,
  PresenceStateDTO,
  PresenceStateEntry,
  SetManualStatusResult,
} from '../types';

/** Única porta de acesso às chaves `presence:*` do Redis. */
export interface IPresenceService {
  /** Registra a conexão; publica `presence:online` se for a primeira válida do usuário. */
  connect(userId: string, connectionId: string): Promise<ConnectResult>;
  /** Renova o score das conexões (só as que ainda existem — `ZADD XX`), em lote. */
  heartbeat(connections: PresenceConnection[]): Promise<void>;
  /** Remove a conexão; se era a última, grava `last_seen_at` e publica `presence:offline`. */
  disconnect(userId: string, connectionId: string): Promise<DisconnectResult>;
  /** Grava o status manual; publica `presence:status-changed` se o estado efetivo mudou. */
  setManualStatus(userId: string, status: ManualPresenceStatus): Promise<SetManualStatusResult>;
  /** Estados em lote (sem filtro de bloqueio); `lastSeenAt` do Postgres só para os offline. */
  getStates(userIds: string[]): Promise<Map<string, PresenceStateEntry>>;
  /** Remove conexões vencidas e publica `presence:offline` de quem ficou sem nenhuma. */
  sweep(): Promise<string[]>;
  /** Quem deve ser notificado das mudanças de `userId` (cacheado). */
  presenceAudience(userId: string): Promise<string[]>;
  /** De quem `userId` recebe atualizações: contatos + parceiros 1:1, menos bloqueios. */
  watchedUserIds(userId: string): Promise<string[]>;
  /** Estados como `viewerId` os vê: pares bloqueados sempre `offline` sem `lastSeenAt`. */
  getVisibleStates(viewerId: string, userIds: string[]): Promise<PresenceStateDTO[]>;
}
```

Criar `src/modules/presence/listeners/index.ts`:

```ts
export { registerPresenceCacheListeners } from './presence.listeners';
```

Criar `src/modules/presence/listeners/presence.listeners.ts`:

```ts
import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents, UserEvents } from '@/shared/types';
import { PRESENCE_CACHE_KEYS } from '../constants';

/**
 * Invalida a audiência cacheada (`cache:presence:audience:<id>`) quando muda quem deve ver a
 * presença de alguém. Subscribers síncronos que devolvem a promise do `del` (a próxima mudança
 * de estado já usa a audiência nova); o TTL cobre um evento perdido.
 *
 * - bloqueio/desbloqueio → os dois envolvidos
 * - `user:contact-added`/`removed` → `contactId` (quem o observa mudou)
 * - conversa `direct` criada → os dois participantes
 */
export function registerPresenceCacheListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  cache: Pick<ICacheService, 'del'> = cacheService
): () => void {
  const forget = (...userIds: string[]): Promise<void> =>
    cache.del(userIds.map(PRESENCE_CACHE_KEYS.audience));

  const unsubscribers = [
    bus.subscribe(UserEvents.BLOCKED, ({ payload }) =>
      forget(payload.userId, payload.blockedUserId)
    ),
    bus.subscribe(UserEvents.UNBLOCKED, ({ payload }) =>
      forget(payload.userId, payload.unblockedUserId)
    ),
    bus.subscribe(UserEvents.CONTACT_ADDED, ({ payload }) => forget(payload.contactId)),
    bus.subscribe(UserEvents.CONTACT_REMOVED, ({ payload }) => forget(payload.contactId)),
    bus.subscribe(ChatEvents.CONVERSATION_CREATED, ({ payload }) =>
      payload.type === 'direct' ? forget(...payload.participantIds) : Promise.resolve()
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

Substituir `src/modules/presence/services/PresenceService.ts` inteiro por:

```ts
import type { IConversationService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import type { IContactService, IUserService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { userService } from '@/modules/user/services/UserService';
import { cacheService, type ICacheService, type RedisCommand } from '@/shared/cache';
import { redis } from '@/shared/database/redis';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { PresenceEvents } from '@/shared/types';
import {
  PRESENCE_CACHE_KEYS,
  PRESENCE_CONSTANTS,
  PRESENCE_KEYS,
  effectiveState,
  toManualStatus,
} from '../constants';
import type { IPresenceService } from '../interfaces';
import type {
  ConnectResult,
  DisconnectResult,
  ManualPresenceStatus,
  PresenceConnection,
  PresenceRedisClient,
  PresenceState,
  PresenceStateDTO,
  PresenceStateEntry,
  SetManualStatusResult,
} from '../types';

export interface PresenceServiceOptions {
  redis?: PresenceRedisClient;
  users?: Pick<IUserService, 'getMultiple' | 'updateLastSeen'>;
  contacts?: Pick<IContactService, 'listWatchers' | 'listContactIds' | 'listBlockedEitherIds'>;
  conversations?: Pick<IConversationService, 'getDirectPartnerIds'>;
  events?: Pick<EventBus, 'publish'>;
  cache?: Pick<ICacheService, 'getOrLoad'>;
  /** Relógio (ms) injetável nos testes. */
  now?: () => number;
  /** @default PRESENCE_CONSTANTS.TTL_MS */
  ttlMs?: number;
  /** @default PRESENCE_CONSTANTS.CONNECTIONS_KEY_TTL_MS */
  connectionsKeyTtlMs?: number;
  /** @default PRESENCE_CONSTANTS.SWEEP_SCAN_COUNT */
  sweepScanCount?: number;
}

/** Ids sem repetição, sem o próprio usuário e sem quem tem bloqueio com ele. */
function withoutBlocked(userId: string, ids: string[], blocked: string[]): string[] {
  const hidden = new Set([...blocked, userId]);
  return [...new Set(ids)].filter((id) => !hidden.has(id));
}

/**
 * Presença (RF004) sobre o Redis — a única porta de acesso às chaves `presence:*`:
 *
 * - `presence:conns:<userId>`: ZSET com uma entrada por socket (`<nodeId>:<socketId>`), score =
 *   último heartbeat (ms). Conectado = alguma entrada com score ≥ agora − 30 s; as vencidas
 *   (queda de nó sem `disconnect`) são removidas com `ZREMRANGEBYSCORE`.
 * - `presence:manual:<userId>`: status manual (`available`/`away`/`busy`), sem TTL.
 *
 * Toda leitura-e-escrita de conexão roda num `MULTI` (atômico): com várias instâncias, só uma
 * delas vê a transição online/offline e publica o evento.
 */
export class PresenceService implements IPresenceService {
  private readonly redis: PresenceRedisClient;
  private readonly users: Pick<IUserService, 'getMultiple' | 'updateLastSeen'>;
  private readonly contacts: Pick<
    IContactService,
    'listWatchers' | 'listContactIds' | 'listBlockedEitherIds'
  >;
  private readonly conversations: Pick<IConversationService, 'getDirectPartnerIds'>;
  private readonly events: Pick<EventBus, 'publish'>;
  private readonly cache: Pick<ICacheService, 'getOrLoad'>;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly connectionsKeyTtlMs: number;
  private readonly sweepScanCount: number;

  constructor(options: PresenceServiceOptions = {}) {
    this.redis = options.redis ?? redis;
    this.users = options.users ?? userService;
    this.contacts = options.contacts ?? contactService;
    this.conversations = options.conversations ?? conversationService;
    this.events = options.events ?? eventBus;
    this.cache = options.cache ?? cacheService;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? PRESENCE_CONSTANTS.TTL_MS;
    this.connectionsKeyTtlMs =
      options.connectionsKeyTtlMs ?? PRESENCE_CONSTANTS.CONNECTIONS_KEY_TTL_MS;
    this.sweepScanCount = options.sweepScanCount ?? PRESENCE_CONSTANTS.SWEEP_SCAN_COUNT;
  }

  async connect(userId: string, connectionId: string): Promise<ConnectResult> {
    const now = this.now();
    const key = PRESENCE_KEYS.connections(userId);
    const [, validBefore] = await this.exec('multi', [
      ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
      ['zcard', key],
      ['zadd', key, now, connectionId],
      ['pexpire', key, this.connectionsKeyTtlMs],
    ]);

    const becameOnline = validBefore === 0;
    if (becameOnline) {
      await this.events.publish(PresenceEvents.ONLINE, { userId, timestamp: new Date(now) });
    }
    return { becameOnline };
  }

  async heartbeat(connections: PresenceConnection[]): Promise<void> {
    if (connections.length === 0) {
      return;
    }
    const now = this.now();
    // `XX`: só renova entradas que ainda existem — um socket que acabou de desconectar (ou que a
    // varredura já removeu) não é ressuscitado.
    await this.exec(
      'pipeline',
      connections.flatMap(({ userId, connectionId }): RedisCommand[] => {
        const key = PRESENCE_KEYS.connections(userId);
        return [
          ['zadd', key, 'XX', now, connectionId],
          ['pexpire', key, this.connectionsKeyTtlMs],
        ];
      })
    );
  }

  async disconnect(userId: string, connectionId: string): Promise<DisconnectResult> {
    const now = this.now();
    const key = PRESENCE_KEYS.connections(userId);
    const [removed, , remaining] = await this.exec('multi', [
      ['zrem', key, connectionId],
      ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
      ['zcard', key],
    ]);

    // `removed === 0`: a varredura já tirou esta entrada (e já publicou o offline).
    if (removed === 0 || remaining !== 0) {
      return { becameOffline: false };
    }
    const lastSeenAt = new Date(now);
    await this.goOffline(userId, lastSeenAt);
    return { becameOffline: true, lastSeenAt };
  }

  async setManualStatus(
    userId: string,
    status: ManualPresenceStatus
  ): Promise<SetManualStatusResult> {
    const [previous, , connections] = await this.exec('multi', [
      ['get', PRESENCE_KEYS.manual(userId)],
      ['set', PRESENCE_KEYS.manual(userId), status],
      ['zcount', PRESENCE_KEYS.connections(userId), this.now() - this.ttlMs, '+inf'],
    ]);

    const connected = (connections as number) > 0;
    const before = effectiveState(connected, toManualStatus(previous));
    const state = effectiveState(connected, status);
    const changed = before !== state;
    if (changed) {
      await this.events.publish(PresenceEvents.STATUS_CHANGED, { userId, status });
    }
    return { state, changed };
  }

  async getStates(userIds: string[]): Promise<Map<string, PresenceStateEntry>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }

    const cutoff = this.now() - this.ttlMs;
    const results = await this.exec(
      'pipeline',
      unique.flatMap((id): RedisCommand[] => [
        ['zcount', PRESENCE_KEYS.connections(id), cutoff, '+inf'],
        ['get', PRESENCE_KEYS.manual(id)],
      ])
    );

    const online = new Map<string, PresenceState>();
    unique.forEach((id, index) => {
      if ((results[index * 2] as number) > 0) {
        online.set(id, effectiveState(true, toManualStatus(results[index * 2 + 1])));
      }
    });

    // `last_seen_at` só de quem está offline, numa leitura em lote (cacheada no módulo user).
    const offlineIds = unique.filter((id) => !online.has(id));
    const lastSeen = new Map(
      (await this.users.getMultiple(offlineIds)).map((user) => [user.id, user.lastSeenAt])
    );

    return new Map(
      unique.map((id): [string, PresenceStateEntry] => {
        const state = online.get(id);
        return state === undefined
          ? [id, { state: 'offline', lastSeenAt: lastSeen.get(id) ?? null }]
          : [id, { state, lastSeenAt: null }];
      })
    );
  }

  /**
   * Varre `presence:conns:*` (SCAN com COUNT 100) e remove as entradas vencidas; quem ficou sem
   * nenhuma conexão vai para offline (cobre a queda de uma instância sem `disconnect`). O MULTI
   * por chave garante que só uma instância publique o offline. Custo O(chaves de presença) a
   * cada 30 s — aceitável para o porte do projeto.
   */
  async sweep(): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        `${PRESENCE_KEYS.CONNECTIONS_PREFIX}*`,
        'COUNT',
        this.sweepScanCount
      );
      batch.forEach((key) => keys.add(key));
      cursor = next;
    } while (cursor !== '0');

    const now = this.now();
    const wentOffline: string[] = [];
    for (const key of keys) {
      const [removed, remaining] = await this.exec('multi', [
        ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
        ['zcard', key],
      ]);
      if ((removed as number) > 0 && remaining === 0) {
        const userId = key.slice(PRESENCE_KEYS.CONNECTIONS_PREFIX.length);
        await this.goOffline(userId, new Date(now));
        wentOffline.push(userId);
      }
    }
    return wentOffline;
  }

  async presenceAudience(userId: string): Promise<string[]> {
    return this.cache.getOrLoad(
      PRESENCE_CACHE_KEYS.audience(userId),
      PRESENCE_CONSTANTS.AUDIENCE_CACHE_TTL_SECONDS,
      async () => {
        const [watchers, partners, blocked] = await Promise.all([
          this.contacts.listWatchers(userId),
          this.conversations.getDirectPartnerIds(userId),
          this.contacts.listBlockedEitherIds(userId),
        ]);
        return withoutBlocked(userId, [...watchers, ...partners], blocked);
      }
    );
  }

  async watchedUserIds(userId: string): Promise<string[]> {
    const [contactIds, partners, blocked] = await Promise.all([
      this.contacts.listContactIds(userId),
      this.conversations.getDirectPartnerIds(userId),
      this.contacts.listBlockedEitherIds(userId),
    ]);
    return withoutBlocked(userId, [...contactIds, ...partners], blocked);
  }

  async getVisibleStates(viewerId: string, userIds: string[]): Promise<PresenceStateDTO[]> {
    const unique = [...new Set(userIds)];
    const blocked = new Set(await this.contacts.listBlockedEitherIds(viewerId));
    const states = await this.getStates(unique.filter((id) => !blocked.has(id)));
    return unique.map((userId) => {
      const entry = states.get(userId);
      return entry === undefined
        ? { userId, state: 'offline', lastSeenAt: null }
        : { userId, ...entry };
    });
  }

  /**
   * Grava `last_seen_at` e publica `presence:offline`. Uma falha no Postgres é logada e não
   * impede o evento (os contatos precisam ver o offline mesmo assim).
   */
  private async goOffline(userId: string, at: Date): Promise<void> {
    try {
      await this.users.updateLastSeen(userId, at);
    } catch (error) {
      logger.error(
        'Falha ao gravar last_seen_at na saída do usuário',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
    }
    await this.events.publish(PresenceEvents.OFFLINE, { userId, lastSeen: at });
  }

  /** Executa o lote e devolve os resultados; erro em qualquer comando (ou lote abortado) lança. */
  private async exec(mode: 'multi' | 'pipeline', commands: RedisCommand[]): Promise<unknown[]> {
    const results = await this.redis[mode](commands).exec();
    if (results === null) {
      throw new Error('Lote do Redis abortado');
    }
    return results.map(([error, value]) => {
      if (error !== null) {
        throw error;
      }
      return value;
    });
  }
}

export const presenceService = new PresenceService();
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/listeners/presence.listeners.test.ts tests/unit/modules/presence/services/PresenceService.audience.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/presence/index.ts src/modules/presence/interfaces/IPresenceService.ts src/modules/presence/listeners/index.ts src/modules/presence/listeners/presence.listeners.ts src/modules/presence/services/PresenceService.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/listeners/presence.listeners.test.ts tests/unit/modules/presence/services/PresenceService.audience.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/presence/index.ts \
  src/modules/presence/interfaces/IPresenceService.ts \
  src/modules/presence/listeners/index.ts \
  src/modules/presence/listeners/presence.listeners.ts \
  src/modules/presence/services/PresenceService.ts \
  tests/unit/modules/presence/index.test.ts \
  tests/unit/modules/presence/listeners/presence.listeners.test.ts \
  tests/unit/modules/presence/services/PresenceService.audience.test.ts
git commit -m "✨ feat: calcula a audiência da presença com cache e ocultação de bloqueados"
```


---

### Task 10: Presença no Socket.IO: hooks, `presence:set`, snapshot, heartbeat e varredura

**Files:**
- Modify: `src/modules/presence/index.ts`
- Create: `src/modules/presence/realtime/createPresenceRealtime.ts`
- Create: `src/modules/presence/realtime/index.ts`
- Create: `src/modules/presence/realtime/presenceHandlers.ts`
- Modify: `src/modules/realtime/constants/realtime.constants.ts`
- Modify: `src/modules/realtime/types/index.ts`
- Modify: `src/modules/realtime/types/realtime.types.ts`
- Modify: `tests/support/realtime/fakeSocket.ts`
- Modify: `tests/unit/modules/presence/index.test.ts`
- Create: `tests/unit/modules/presence/realtime/createPresenceRealtime.test.ts`
- Create: `tests/unit/modules/presence/realtime/presenceHandlers.test.ts`
- Modify: `tests/unit/modules/realtime/constants/realtime.constants.test.ts`
- Modify: `tests/unit/modules/realtime/types/realtime.types.test.ts`

**Interfaces:**
- Consumes: `IPresenceService` (Tasks 8–9), `withAck` (`@/modules/realtime/handlers/ack`), `ConnectionHook`/`DisconnectHook` (`@/modules/realtime/types`).
- Produces: `CLIENT_EVENTS.PRESENCE_SET = 'presence:set'`, `SERVER_EVENTS.PRESENCE_UPDATE = 'presence:update'`, `SERVER_EVENTS.PRESENCE_SNAPSHOT = 'presence:snapshot'`; tipos `PresenceUpdatePayload = PresenceStateDTO`, `PresenceSnapshotPayload { states: PresenceStateDTO[] }`.
- Produces: `registerPresenceHandlers(socket, { presence })` (ack `{ ok: true, data: { state } }`); `createPresenceRealtime(options?: { presence?, nodeId?, heartbeatMs?, sweepMs? }): PresenceRealtimeHandle` com `nodeId`, `onConnection`, `onDisconnect`, `start()`, `stop()`, `heartbeat()`, `sweep()`.

Os eventos novos entram nas constantes/tipos do realtime (sem o realtime importar o presence). `createPresenceRealtime` devolve os hooks para o `createRealtimeServer` (conexão: registra `presence:set`, `presence.connect` como `<nodeId>:<socketId>` e envia `presence:snapshot`; desconexão: `presence.disconnect`, exceto no `server shutting down`) e os timers `unref` de heartbeat dos sockets deste nó e de varredura (um ciclo por vez). O `fakeSocket` passa a registrar `socket.emit`.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/support/realtime/fakeSocket.ts` (3 trechos, na ordem):

1. Substituir:

```ts
  disconnect: jest.Mock;
  on: jest.Mock;
  to: jest.Mock;
  /** Emissões feitas via `socket.to(room).emit(...)`, na ordem: `[room, event, payload]`. */
```

por:

```ts
  disconnect: jest.Mock;
  on: jest.Mock;
  /** Emite direto para o próprio socket; registra em `emitted`. */
  emit: jest.Mock;
  /** Emissões feitas via `socket.emit(event, payload)`, na ordem: `[event, payload]`. */
  emitted: [string, unknown][];
  to: jest.Mock;
  /** Emissões feitas via `socket.to(room).emit(...)`, na ordem: `[room, event, payload]`. */
```

2. Substituir:

```ts
): FakeSocket {
  const broadcasts: [string, string, unknown][] = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = overrides.id ?? 'socket-1';
```

por:

```ts
): FakeSocket {
  const broadcasts: [string, string, unknown][] = [];
  const emitted: [string, unknown][] = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const id = overrides.id ?? 'socket-1';
```

3. Substituir:

```ts
      return socket;
    }),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
```

por:

```ts
      return socket;
    }),
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push([event, payload]);
      return true;
    }),
    emitted,
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
```

Em `tests/unit/modules/presence/index.test.ts`, substituir:

```ts
    expect(presenceModule.registerPresenceCacheListeners).toBeInstanceOf(Function);
  });
});
```

por:

```ts
    expect(presenceModule.registerPresenceCacheListeners).toBeInstanceOf(Function);
  });

  it('deve exportar a integração com o realtime', () => {
    expect(presenceModule.createPresenceRealtime).toBeInstanceOf(Function);
    expect(presenceModule.registerPresenceHandlers).toBeInstanceOf(Function);
  });
});
```

Criar `tests/unit/modules/presence/realtime/createPresenceRealtime.test.ts`:

```ts
jest.mock('@/modules/presence/services', () => ({ presenceService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createPresenceRealtime } from '@/modules/presence/realtime';
import type { RealtimeServer } from '@/modules/realtime/types';
import { logger } from '@/shared/logger';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const NODE = 'node-1';
const io = {} as RealtimeServer;

function socketOf(userId: string, id: string): FakeSocket {
  return createFakeSocket({ id, data: { userId, ip: null, device: null } });
}

describe('createPresenceRealtime', () => {
  let presence: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    heartbeat: jest.Mock;
    sweep: jest.Mock;
    setManualStatus: jest.Mock;
    watchedUserIds: jest.Mock;
    getVisibleStates: jest.Mock;
  };

  beforeEach(() => {
    presence = {
      connect: jest.fn().mockResolvedValue({ becameOnline: true }),
      disconnect: jest.fn().mockResolvedValue({ becameOffline: true }),
      heartbeat: jest.fn().mockResolvedValue(undefined),
      sweep: jest.fn().mockResolvedValue([]),
      setManualStatus: jest.fn(),
      watchedUserIds: jest.fn().mockResolvedValue([BOB]),
      getVisibleStates: jest
        .fn()
        .mockResolvedValue([{ userId: BOB, state: 'online', lastSeenAt: null }]),
    };
  });

  it('gera um nodeId (UUID) por padrão', () => {
    expect(createPresenceRealtime().nodeId).toMatch(/^[0-9a-f-]{36}$/);
  });

  describe('onConnection', () => {
    it('registra presence:set, conecta como <nodeId>:<socketId> e envia o snapshot ao próprio socket', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');

      await handle.onConnection(socket.asSocket(), io);

      expect(socket.handlers.has('presence:set')).toBe(true);
      expect(presence.connect).toHaveBeenCalledWith(ANA, 'node-1:s1');
      expect(presence.watchedUserIds).toHaveBeenCalledWith(ANA);
      expect(presence.getVisibleStates).toHaveBeenCalledWith(ANA, [BOB]);
      expect(socket.emitted).toEqual([
        ['presence:snapshot', { states: [{ userId: BOB, state: 'online', lastSeenAt: null }] }],
      ]);
    });

    it('não envia snapshot a um socket que já caiu', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      presence.connect.mockImplementation(async () => {
        socket.connected = false;
        return { becameOnline: true };
      });

      await handle.onConnection(socket.asSocket(), io);

      expect(socket.emitted).toEqual([]);
    });

    it('falha do Redis rejeita (o createRealtimeServer loga, o socket segue)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      presence.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(handle.onConnection(socketOf(ANA, 's1').asSocket(), io)).rejects.toThrow(
        'ECONNREFUSED'
      );
    });
  });

  describe('onDisconnect', () => {
    it('remove a conexão do Redis', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      await handle.onConnection(socket.asSocket(), io);

      await handle.onDisconnect(socket.asSocket(), 'transport close', io);

      expect(presence.disconnect).toHaveBeenCalledWith(ANA, 'node-1:s1');
    });

    it('no encerramento do servidor não mexe no Redis (as entradas expiram sozinhas)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      await handle.onConnection(socket.asSocket(), io);

      await handle.onDisconnect(socket.asSocket(), 'server shutting down', io);
      await handle.heartbeat();

      expect(presence.disconnect).not.toHaveBeenCalled();
      expect(presence.heartbeat).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('renova só os sockets ainda conectados neste nó', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const ana = socketOf(ANA, 's1');
      const bob = socketOf(BOB, 's2');
      await handle.onConnection(ana.asSocket(), io);
      await handle.onConnection(bob.asSocket(), io);
      await handle.onDisconnect(bob.asSocket(), 'client namespace disconnect', io);

      await handle.heartbeat();

      expect(presence.heartbeat).toHaveBeenCalledWith([{ userId: ANA, connectionId: 'node-1:s1' }]);
    });

    it('sem sockets não vai ao Redis; falha é logada', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      await handle.heartbeat();
      expect(presence.heartbeat).not.toHaveBeenCalled();

      await handle.onConnection(socketOf(ANA, 's1').asSocket(), io);
      presence.heartbeat.mockRejectedValue('down');
      await handle.heartbeat();

      expect(logger.error).toHaveBeenCalledWith(
        'Falha no heartbeat de presença',
        expect.objectContaining({ message: 'down' })
      );
    });
  });

  describe('sweep', () => {
    it('ignora um ciclo enquanto o anterior ainda roda; falha é logada', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      let finish: () => void = () => undefined;
      presence.sweep.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );

      const first = handle.sweep();
      await handle.sweep();
      finish();
      await first;
      expect(presence.sweep).toHaveBeenCalledTimes(1);

      presence.sweep.mockRejectedValueOnce(new Error('scan failed'));
      await handle.sweep();
      expect(logger.error).toHaveBeenCalledWith(
        'Falha na varredura de presença',
        expect.objectContaining({ message: 'scan failed' })
      );
    });
  });

  describe('timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('start liga heartbeat (15 s) e varredura (30 s); stop desliga; start é idempotente', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      await handle.onConnection(socketOf(ANA, 's1').asSocket(), io);

      handle.start();
      handle.start();
      await jest.advanceTimersByTimeAsync(30_000);

      expect(presence.heartbeat).toHaveBeenCalledTimes(2);
      expect(presence.sweep).toHaveBeenCalledTimes(1);

      handle.stop();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(presence.heartbeat).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('intervalos injetáveis (testes de integração usam timers curtos)', async () => {
      const handle = createPresenceRealtime({
        presence,
        nodeId: NODE,
        heartbeatMs: 50,
        sweepMs: 100,
      });

      handle.start();
      await jest.advanceTimersByTimeAsync(100);
      handle.stop();

      expect(presence.sweep).toHaveBeenCalledTimes(1);
    });
  });
});
```

Criar `tests/unit/modules/presence/realtime/presenceHandlers.test.ts`:

```ts
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerPresenceHandlers } from '@/modules/presence/realtime/presenceHandlers';
import type { AckResponse } from '@/modules/realtime/types';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const ANA = '11111111-1111-4111-8111-111111111111';

function emit(socket: FakeSocket, payload: unknown): Promise<AckResponse<unknown>> {
  const handler = socket.handlers.get('presence:set');
  if (handler === undefined) {
    throw new Error('handler presence:set não registrado');
  }
  return new Promise((resolve) => {
    handler(payload, resolve);
  });
}

describe('registerPresenceHandlers', () => {
  let socket: FakeSocket;
  let presence: { setManualStatus: jest.Mock };

  beforeEach(() => {
    socket = createFakeSocket({ data: { userId: ANA, ip: null, device: null } });
    presence = { setManualStatus: jest.fn().mockResolvedValue({ state: 'busy', changed: true }) };
    registerPresenceHandlers(socket.asSocket(), { presence });
  });

  it('presence:set grava o status e devolve o estado efetivo no ack', async () => {
    await expect(emit(socket, { status: 'busy' })).resolves.toEqual({
      ok: true,
      data: { state: 'busy' },
    });
    expect(presence.setManualStatus).toHaveBeenCalledWith(ANA, 'busy');
  });

  it('status fora de available/away/busy → VALIDATION_ERROR 400', async () => {
    const response = await emit(socket, { status: 'offline' });

    expect(response).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
    });
    expect(presence.setManualStatus).not.toHaveBeenCalled();
  });

  it('falha do Redis → INTERNAL_ERROR 500', async () => {
    presence.setManualStatus.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(emit(socket, { status: 'away' })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INTERNAL_ERROR', statusCode: 500 }),
    });
  });
});
```

Em `tests/unit/modules/realtime/constants/realtime.constants.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
      TYPING_START: 'typing:start',
      TYPING_STOP: 'typing:stop',
    });
  });
```

por:

```ts
      TYPING_START: 'typing:start',
      TYPING_STOP: 'typing:stop',
      PRESENCE_SET: 'presence:set',
    });
  });
```

2. Substituir:

```ts
      CONVERSATION_UPDATED: 'conversation:updated',
      CONVERSATION_DELETED: 'conversation:deleted',
    });
  });
```

por:

```ts
      CONVERSATION_UPDATED: 'conversation:updated',
      CONVERSATION_DELETED: 'conversation:deleted',
      PRESENCE_UPDATE: 'presence:update',
      PRESENCE_SNAPSHOT: 'presence:snapshot',
    });
  });
```

Em `tests/unit/modules/realtime/types/realtime.types.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  AckResponse,
  MessageStatusPayload,
  ServerToClientEvents,
  SocketData,
```

por:

```ts
  AckResponse,
  MessageStatusPayload,
  PresenceSnapshotPayload,
  PresenceUpdatePayload,
  ServerToClientEvents,
  SocketData,
```

2. Substituir:

```ts
    ]);
  });
});
```

por:

```ts
    ]);
  });

  it('descrevem os payloads de presença', () => {
    const update: PresenceUpdatePayload = { userId: 'u1', state: 'busy', lastSeenAt: null };
    const snapshot: PresenceSnapshotPayload = {
      states: [update, { userId: 'u2', state: 'offline', lastSeenAt: new Date(0) }],
    };

    expect(snapshot.states.map((entry) => entry.state)).toEqual(['busy', 'offline']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/realtime/createPresenceRealtime.test.ts tests/unit/modules/presence/realtime/presenceHandlers.test.ts tests/unit/modules/realtime/constants/realtime.constants.test.ts tests/unit/modules/realtime/types/realtime.types.test.ts --coverage=false`

Expected: FAIL — `CLIENT_EVENTS`/`SERVER_EVENTS` sem os eventos de presença, tipos `PresenceUpdatePayload`/`PresenceSnapshotPayload` ausentes e `Could not locate module @/modules/presence/realtime/...`.

- [ ] **Step 3: Implementar**

Em `src/modules/presence/index.ts`, substituir:

```ts

export { registerPresenceCacheListeners } from './listeners';
```

por:

```ts

export { registerPresenceCacheListeners } from './listeners';

export { registerPresenceHandlers, createPresenceRealtime } from './realtime';
export type {
  PresenceHandlerDeps,
  PresenceRealtimeOptions,
  PresenceRealtimeHandle,
} from './realtime';
```

Criar `src/modules/presence/realtime/createPresenceRealtime.ts`:

```ts
import { randomUUID } from 'crypto';
import { SERVER_EVENTS } from '@/modules/realtime/constants';
import type { ConnectionHook, DisconnectHook, RealtimeSocket } from '@/modules/realtime/types';
import { logger } from '@/shared/logger';
import { PRESENCE_CONSTANTS } from '../constants';
import type { IPresenceService } from '../interfaces';
import { presenceService } from '../services';
import type { PresenceConnection } from '../types';
import { registerPresenceHandlers } from './presenceHandlers';

/** Motivo do Socket.IO no `io.close()`: as entradas deste nó expiram sozinhas (e a varredura publica o offline). */
const SERVER_SHUTTING_DOWN = 'server shutting down';

export interface PresenceRealtimeOptions {
  presence?: Pick<
    IPresenceService,
    | 'connect'
    | 'disconnect'
    | 'heartbeat'
    | 'sweep'
    | 'setManualStatus'
    | 'watchedUserIds'
    | 'getVisibleStates'
  >;
  /** Identifica este processo nos membros `<nodeId>:<socketId>`; padrão: UUID novo. */
  nodeId?: string;
  /** @default PRESENCE_CONSTANTS.HEARTBEAT_MS */
  heartbeatMs?: number;
  /** @default PRESENCE_CONSTANTS.SWEEP_MS */
  sweepMs?: number;
}

export interface PresenceRealtimeHandle {
  nodeId: string;
  /** Hook de conexão para `createRealtimeServer({ onConnection })`. */
  onConnection: ConnectionHook;
  /** Hook de desconexão para `createRealtimeServer({ onDisconnect })`. */
  onDisconnect: DisconnectHook;
  /** Liga os timers de heartbeat e de varredura (`unref`; idempotente). */
  start(): void;
  /** Para os timers (antes de fechar o Socket.IO). */
  stop(): void;
  /** Um ciclo de heartbeat dos sockets deste nó (o timer chama; exposto para testes). */
  heartbeat(): Promise<void>;
  /** Um ciclo de varredura (o timer chama; ignorado se o anterior ainda roda). */
  sweep(): Promise<void>;
}

function logFailure(message: string, error: unknown): void {
  logger.error(message, error instanceof Error ? error : new Error(String(error)));
}

/**
 * Integração da presença com o Socket.IO, sem que o realtime conheça o presence: hooks de
 * conexão/desconexão (registrados no `server.ts`), o handler `presence:set`, o snapshot enviado
 * ao conectar, o heartbeat dos sockets deste nó e a varredura de conexões vencidas.
 */
export function createPresenceRealtime(
  options: PresenceRealtimeOptions = {}
): PresenceRealtimeHandle {
  const {
    presence = presenceService,
    nodeId = randomUUID(),
    heartbeatMs = PRESENCE_CONSTANTS.HEARTBEAT_MS,
    sweepMs = PRESENCE_CONSTANTS.SWEEP_MS,
  } = options;

  /** Sockets conectados neste nó (socket.id → conexão), renovados a cada heartbeat. */
  const local = new Map<string, PresenceConnection>();
  const timers: NodeJS.Timeout[] = [];
  let sweeping = false;

  const connectionOf = (socket: RealtimeSocket): PresenceConnection => ({
    userId: socket.data.userId,
    connectionId: `${nodeId}:${socket.id}`,
  });

  const onConnection: ConnectionHook = async (socket) => {
    const connection = connectionOf(socket);
    local.set(socket.id, connection);
    registerPresenceHandlers(socket, { presence });

    // O ZADD sai antes de qualquer `await`: um disconnect imediato chega ao Redis depois dele.
    await presence.connect(connection.userId, connection.connectionId);

    const watched = await presence.watchedUserIds(connection.userId);
    const states = await presence.getVisibleStates(connection.userId, watched);
    if (socket.connected) {
      socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, { states });
    }
  };

  const onDisconnect: DisconnectHook = async (socket, reason) => {
    local.delete(socket.id);
    if (reason === SERVER_SHUTTING_DOWN) {
      return;
    }
    const { userId, connectionId } = connectionOf(socket);
    await presence.disconnect(userId, connectionId);
  };

  const heartbeat = async (): Promise<void> => {
    if (local.size === 0) {
      return;
    }
    try {
      await presence.heartbeat([...local.values()]);
    } catch (error) {
      logFailure('Falha no heartbeat de presença', error);
    }
  };

  const sweep = async (): Promise<void> => {
    if (sweeping) {
      return;
    }
    sweeping = true;
    try {
      await presence.sweep();
    } catch (error) {
      logFailure('Falha na varredura de presença', error);
    } finally {
      sweeping = false;
    }
  };

  return {
    nodeId,
    onConnection,
    onDisconnect,
    start: (): void => {
      if (timers.length > 0) {
        return;
      }
      timers.push(
        setInterval(() => void heartbeat(), heartbeatMs),
        setInterval(() => void sweep(), sweepMs)
      );
      timers.forEach((timer) => timer.unref());
    },
    stop: (): void => {
      timers.splice(0).forEach((timer) => {
        clearInterval(timer);
      });
    },
    heartbeat,
    sweep,
  };
}
```

Criar `src/modules/presence/realtime/index.ts`:

```ts
export { registerPresenceHandlers } from './presenceHandlers';
export type { PresenceHandlerDeps } from './presenceHandlers';
export { createPresenceRealtime } from './createPresenceRealtime';
export type { PresenceRealtimeOptions, PresenceRealtimeHandle } from './createPresenceRealtime';
```

Criar `src/modules/presence/realtime/presenceHandlers.ts`:

```ts
import { CLIENT_EVENTS } from '@/modules/realtime/constants';
import { withAck } from '@/modules/realtime/handlers/ack';
import type { RealtimeSocket } from '@/modules/realtime/types';
import type { IPresenceService } from '../interfaces';
import { presenceStatusSchema } from '../validation';

export interface PresenceHandlerDeps {
  presence: Pick<IPresenceService, 'setManualStatus'>;
}

/**
 * `presence:set { status }` (ack): grava o status manual — a mesma regra do
 * `PUT /api/presence/status`. O ack devolve o estado efetivo resultante; o aviso aos contatos
 * sai da ponte (`presence:status-changed` → `presence:update`).
 */
export function registerPresenceHandlers(
  socket: RealtimeSocket,
  { presence }: PresenceHandlerDeps
): void {
  const { userId } = socket.data;

  socket.on(
    CLIENT_EVENTS.PRESENCE_SET,
    withAck(
      { event: CLIENT_EVENTS.PRESENCE_SET, userId },
      presenceStatusSchema,
      async ({ status }) => {
        const { state } = await presence.setManualStatus(userId, status);
        return { state };
      }
    )
  );
}
```

Em `src/modules/realtime/constants/realtime.constants.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

```

por:

```ts
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  PRESENCE_SET: 'presence:set',
} as const;

```

2. Substituir:

```ts
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',
} as const;

```

por:

```ts
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_SNAPSHOT: 'presence:snapshot',
} as const;

```

Em `src/modules/realtime/types/index.ts`, substituir:

```ts
  ConversationUpdatedPayload,
  ConversationDeletedPayload,
  RealtimeServer,
  RealtimeSocket,
```

por:

```ts
  ConversationUpdatedPayload,
  ConversationDeletedPayload,
  PresenceUpdatePayload,
  PresenceSnapshotPayload,
  RealtimeServer,
  RealtimeSocket,
```

Em `src/modules/realtime/types/realtime.types.ts` (4 trechos, na ordem):

1. Substituir:

```ts
import type { DisconnectReason, ExtendedError, Server, Socket } from 'socket.io';
import type { ConversationChange, ConversationType, MessageDTO } from '@/modules/chat/types';

/** Dados do socket preenchidos pelo middleware de autenticação do handshake. */
```

por:

```ts
import type { DisconnectReason, ExtendedError, Server, Socket } from 'socket.io';
import type { ConversationChange, ConversationType, MessageDTO } from '@/modules/chat/types';
import type { PresenceStateDTO } from '@/shared/types';

/** Dados do socket preenchidos pelo middleware de autenticação do handshake. */
```

2. Substituir:

```ts
  'typing:start': (payload: unknown, ack?: unknown) => void;
  'typing:stop': (payload: unknown, ack?: unknown) => void;
}

```

por:

```ts
  'typing:start': (payload: unknown, ack?: unknown) => void;
  'typing:stop': (payload: unknown, ack?: unknown) => void;
  'presence:set': (payload: unknown, ack?: unknown) => void;
}

```

3. Substituir:

```ts
}

/** Eventos servidor → cliente (datas chegam ao cliente como strings ISO). */
export interface ServerToClientEvents {
```

por:

```ts
}

/** Mudança de presença de alguém que o usuário observa (`lastSeenAt` só quando `offline`). */
export type PresenceUpdatePayload = PresenceStateDTO;

/** Enviado ao próprio socket ao conectar: estado de todos que o usuário observa. */
export interface PresenceSnapshotPayload {
  states: PresenceStateDTO[];
}

/** Eventos servidor → cliente (datas chegam ao cliente como strings ISO). */
export interface ServerToClientEvents {
```

4. Substituir:

```ts
  'conversation:updated': (payload: ConversationUpdatedPayload) => void;
  'conversation:deleted': (payload: ConversationDeletedPayload) => void;
}

```

por:

```ts
  'conversation:updated': (payload: ConversationUpdatedPayload) => void;
  'conversation:deleted': (payload: ConversationDeletedPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload) => void;
  'presence:snapshot': (payload: PresenceSnapshotPayload) => void;
}

```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/realtime/createPresenceRealtime.test.ts tests/unit/modules/presence/realtime/presenceHandlers.test.ts tests/unit/modules/realtime/constants/realtime.constants.test.ts tests/unit/modules/realtime/types/realtime.types.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/presence/index.ts src/modules/presence/realtime/createPresenceRealtime.ts src/modules/presence/realtime/index.ts src/modules/presence/realtime/presenceHandlers.ts src/modules/realtime/constants/realtime.constants.ts src/modules/realtime/types/index.ts src/modules/realtime/types/realtime.types.ts tests/support/realtime/fakeSocket.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/realtime/createPresenceRealtime.test.ts tests/unit/modules/presence/realtime/presenceHandlers.test.ts tests/unit/modules/realtime/constants/realtime.constants.test.ts tests/unit/modules/realtime/types/realtime.types.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/presence/index.ts \
  src/modules/presence/realtime/createPresenceRealtime.ts \
  src/modules/presence/realtime/index.ts \
  src/modules/presence/realtime/presenceHandlers.ts \
  src/modules/realtime/constants/realtime.constants.ts \
  src/modules/realtime/types/index.ts \
  src/modules/realtime/types/realtime.types.ts \
  tests/support/realtime/fakeSocket.ts \
  tests/unit/modules/presence/index.test.ts \
  tests/unit/modules/presence/realtime/createPresenceRealtime.test.ts \
  tests/unit/modules/presence/realtime/presenceHandlers.test.ts \
  tests/unit/modules/realtime/constants/realtime.constants.test.ts \
  tests/unit/modules/realtime/types/realtime.types.test.ts
git commit -m "✨ feat: integra a presença ao Socket.IO (hooks, heartbeat, varredura, presence:set e snapshot)"
```


---

### Task 11: Ponte `presence:update` (com ocultação por bloqueio)

**Files:**
- Modify: `src/modules/presence/index.ts`
- Modify: `src/modules/presence/realtime/index.ts`
- Create: `src/modules/presence/realtime/presenceBridge.ts`
- Modify: `tests/unit/modules/presence/index.test.ts`
- Create: `tests/unit/modules/presence/realtime/presenceBridge.test.ts`

**Interfaces:**
- Consumes: `IPresenceService.presenceAudience/getStates` (Tasks 8–9), `effectiveState` (Task 7), `SERVER_EVENTS.PRESENCE_UPDATE`/`userRoom` (realtime).
- Produces: `registerPresenceBridge(io: Pick<RealtimeServer, 'to'>, deps?: { presence?, bus? }): () => void`.

`registerPresenceBridge(io)` traduz `presence:online/offline/status-changed` em `presence:update` para as rooms `user:<id>` da audiência (status também para as outras abas do próprio usuário), esconde os dois lados no `user:blocked` e revela o estado real no `user:unblocked`. Emissões sobre o mesmo usuário são serializadas por uma fila por usuário.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/presence/index.test.ts`, substituir:

```ts
    expect(presenceModule.createPresenceRealtime).toBeInstanceOf(Function);
    expect(presenceModule.registerPresenceHandlers).toBeInstanceOf(Function);
  });
});
```

por:

```ts
    expect(presenceModule.createPresenceRealtime).toBeInstanceOf(Function);
    expect(presenceModule.registerPresenceHandlers).toBeInstanceOf(Function);
    expect(presenceModule.registerPresenceBridge).toBeInstanceOf(Function);
  });
});
```

Criar `tests/unit/modules/presence/realtime/presenceBridge.test.ts`:

```ts
jest.mock('@/modules/presence/services', () => ({ presenceService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerPresenceBridge } from '@/modules/presence/realtime';
import type { PresenceStateEntry } from '@/modules/presence/types';
import { EventBus } from '@/shared/event-bus/EventBus';
import { logger } from '@/shared/logger';
import { PresenceEvents, UserEvents } from '@/shared/types';
import { createFakeServer, type FakeServer } from '../../../../support/realtime/fakeSocket';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const LAST_SEEN = new Date('2026-09-26T10:00:00.000Z');

function states(entries: [string, PresenceStateEntry][]): Map<string, PresenceStateEntry> {
  return new Map(entries);
}

describe('registerPresenceBridge', () => {
  let bus: EventBus;
  let io: FakeServer;
  let presence: { presenceAudience: jest.Mock; getStates: jest.Mock };
  let unregister: () => void;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    io = createFakeServer();
    presence = {
      presenceAudience: jest.fn().mockResolvedValue([BOB, CAROL]),
      getStates: jest.fn(async (ids: string[]) =>
        states(ids.map((id) => [id, { state: 'busy', lastSeenAt: null }]))
      ),
    };
    unregister = registerPresenceBridge(io.asServer(), { presence, bus });
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it('presence:online → presence:update com o estado real para a audiência', async () => {
    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    expect(presence.presenceAudience).toHaveBeenCalledWith(ANA);
    expect(presence.getStates).toHaveBeenCalledWith([ANA]);
    expect(io.emits).toEqual([
      [
        [`user:${BOB}`, `user:${CAROL}`],
        'presence:update',
        { userId: ANA, state: 'busy', lastSeenAt: null },
      ],
    ]);
  });

  it('audiência vazia ou usuário ausente da leitura: nada é emitido', async () => {
    presence.presenceAudience.mockResolvedValueOnce([]);
    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    presence.getStates.mockResolvedValueOnce(new Map());
    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    expect(io.emits).toEqual([]);
  });

  it('presence:offline → offline com o lastSeen do evento', async () => {
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(io.emits).toEqual([
      [
        [`user:${BOB}`, `user:${CAROL}`],
        'presence:update',
        { userId: ANA, state: 'offline', lastSeenAt: LAST_SEEN },
      ],
    ]);
    expect(presence.getStates).not.toHaveBeenCalled();
  });

  it.each([
    ['busy', 'busy'],
    ['away', 'away'],
    ['available', 'online'],
  ] as const)(
    'presence:status-changed %s → %s para a audiência e as outras abas do usuário',
    async (status, state) => {
      await bus.publish(PresenceEvents.STATUS_CHANGED, { userId: ANA, status });

      expect(io.emits).toEqual([
        [
          [`user:${BOB}`, `user:${CAROL}`, `user:${ANA}`],
          'presence:update',
          { userId: ANA, state, lastSeenAt: null },
        ],
      ]);
    }
  );

  it('user:blocked → cada lado passa a ver o outro offline, na hora', async () => {
    await bus.publish(UserEvents.BLOCKED, { userId: ANA, blockedUserId: BOB });

    expect(io.emits).toEqual([
      [[`user:${BOB}`], 'presence:update', { userId: ANA, state: 'offline', lastSeenAt: null }],
      [[`user:${ANA}`], 'presence:update', { userId: BOB, state: 'offline', lastSeenAt: null }],
    ]);
  });

  it('user:unblocked → cada lado recebe o estado real do outro', async () => {
    presence.getStates.mockImplementation(async ([id]: string[]) =>
      id === ANA
        ? states([[ANA, { state: 'online', lastSeenAt: null }]])
        : states([[BOB, { state: 'offline', lastSeenAt: LAST_SEEN }]])
    );

    await bus.publish(UserEvents.UNBLOCKED, { userId: ANA, unblockedUserId: BOB });

    expect(io.emits).toEqual([
      [[`user:${BOB}`], 'presence:update', { userId: ANA, state: 'online', lastSeenAt: null }],
      [
        [`user:${ANA}`],
        'presence:update',
        { userId: BOB, state: 'offline', lastSeenAt: LAST_SEEN },
      ],
    ]);
  });

  it('user:unblocked de alguém que não veio na leitura não emite', async () => {
    presence.getStates.mockResolvedValue(new Map());

    await bus.publish(UserEvents.UNBLOCKED, { userId: ANA, unblockedUserId: BOB });

    expect(io.emits).toEqual([]);
  });

  it('emissões sobre o mesmo usuário saem na ordem dos eventos (online lento, offline rápido)', async () => {
    let releaseAudience: (ids: string[]) => void = () => undefined;
    presence.presenceAudience.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          releaseAudience = resolve;
        })
    );

    const online = bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });
    const offline = bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });
    await new Promise((resolve) => setImmediate(resolve));
    expect(io.emits).toEqual([]);
    releaseAudience([BOB]);
    await Promise.all([online, offline]);

    expect(io.emits.map(([, , payload]) => (payload as { state: string }).state)).toEqual([
      'busy',
      'offline',
    ]);
  });

  it('falha na leitura é logada, não propaga e não trava a fila do usuário', async () => {
    presence.presenceAudience.mockRejectedValueOnce(new Error('redis down'));
    presence.presenceAudience.mockRejectedValueOnce('timeout');

    await expect(
      bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN })
    ).resolves.toEqual(expect.any(String));
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao avisar a mudança de presença',
      expect.objectContaining({ message: 'redis down' }),
      { userId: ANA }
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao avisar a mudança de presença',
      expect.objectContaining({ message: 'timeout' }),
      { userId: ANA }
    );
    expect(io.emits).toHaveLength(1);
  });

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o presenceService', async () => {
    unregister();
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(io.emits).toEqual([]);
    expect(registerPresenceBridge(io.asServer())).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/realtime/presenceBridge.test.ts --coverage=false`

Expected: FAIL — 13 testes (`registerPresenceBridge` não é uma função).

- [ ] **Step 3: Implementar**

Em `src/modules/presence/index.ts`, substituir:

```ts
export { registerPresenceCacheListeners } from './listeners';

export { registerPresenceHandlers, createPresenceRealtime } from './realtime';
export type {
  PresenceHandlerDeps,
  PresenceRealtimeOptions,
```

por:

```ts
export { registerPresenceCacheListeners } from './listeners';

export {
  registerPresenceHandlers,
  createPresenceRealtime,
  registerPresenceBridge,
} from './realtime';
export type {
  PresenceBridgeDeps,
  PresenceHandlerDeps,
  PresenceRealtimeOptions,
```

Em `src/modules/presence/realtime/index.ts`, substituir:

```ts
export { createPresenceRealtime } from './createPresenceRealtime';
export type { PresenceRealtimeOptions, PresenceRealtimeHandle } from './createPresenceRealtime';
```

por:

```ts
export { createPresenceRealtime } from './createPresenceRealtime';
export type { PresenceRealtimeOptions, PresenceRealtimeHandle } from './createPresenceRealtime';
export { registerPresenceBridge } from './presenceBridge';
export type { PresenceBridgeDeps } from './presenceBridge';
```

Criar `src/modules/presence/realtime/presenceBridge.ts`:

```ts
import { SERVER_EVENTS, userRoom } from '@/modules/realtime/constants';
import type { PresenceUpdatePayload, RealtimeServer } from '@/modules/realtime/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { PresenceEvents, UserEvents } from '@/shared/types';
import { effectiveState } from '../constants';
import type { IPresenceService } from '../interfaces';
import { presenceService } from '../services';

export interface PresenceBridgeDeps {
  presence?: Pick<IPresenceService, 'presenceAudience' | 'getStates'>;
  bus?: Pick<EventBus, 'subscribe'>;
}

/** Visto por quem tem bloqueio com o usuário: sempre offline, sem "visto por último". */
function hidden(userId: string): PresenceUpdatePayload {
  return { userId, state: 'offline', lastSeenAt: null };
}

/**
 * Ponte EventBus → Socket.IO da presença: `presence:online/offline/status-changed` viram
 * `presence:update { userId, state, lastSeenAt }` para as rooms `user:<id>` da audiência (quem tem
 * o usuário como contato ∪ parceiros 1:1, menos bloqueios). A mudança de status manual também vai
 * para o próprio usuário (sincroniza as outras abas).
 *
 * Bloqueio: `user:blocked` faz cada lado ver o outro `offline` na hora; `user:unblocked` envia o
 * estado real a ambos.
 *
 * As emissões sobre um mesmo usuário são serializadas (fila por usuário): a audiência e o
 * estado são lidos no Redis, e sem a fila um `online` lento poderia chegar depois do `offline`
 * seguinte. Os subscribers devolvem a promise da fila (quem publica espera a emissão); falhas
 * são logadas e nunca propagam. Retorna a função que cancela as inscrições.
 */
export function registerPresenceBridge(
  io: Pick<RealtimeServer, 'to'>,
  { presence = presenceService, bus = eventBus }: PresenceBridgeDeps = {}
): () => void {
  const queues = new Map<string, Promise<void>>();

  const enqueue = (userId: string, task: () => Promise<void>): Promise<void> => {
    const next = (queues.get(userId) ?? Promise.resolve()).then(task).catch((error: unknown) => {
      logger.error(
        'Falha ao avisar a mudança de presença',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
    });
    queues.set(userId, next);
    void next.then(() => {
      if (queues.get(userId) === next) {
        queues.delete(userId);
      }
    });
    return next;
  };

  const emit = (rooms: string[], payload: PresenceUpdatePayload): void => {
    if (rooms.length > 0) {
      io.to(rooms).emit(SERVER_EVENTS.PRESENCE_UPDATE, payload);
    }
  };

  /** Estado real atual (lido na hora da emissão); `null` se o usuário não veio na leitura. */
  const currentState = async (userId: string): Promise<PresenceUpdatePayload | null> => {
    const entry = (await presence.getStates([userId])).get(userId);
    return entry === undefined ? null : { userId, ...entry };
  };

  const notifyAudience = (
    userId: string,
    payloadOf: () => Promise<PresenceUpdatePayload | null>,
    extraRooms: string[] = []
  ): Promise<void> =>
    enqueue(userId, async () => {
      const audience = await presence.presenceAudience(userId);
      const payload = await payloadOf();
      if (payload !== null) {
        emit([...audience.map(userRoom), ...extraRooms], payload);
      }
    });

  const unsubscribers = [
    bus.subscribe(PresenceEvents.ONLINE, ({ payload: { userId } }) =>
      notifyAudience(userId, () => currentState(userId))
    ),

    bus.subscribe(PresenceEvents.OFFLINE, ({ payload: { userId, lastSeen } }) =>
      notifyAudience(userId, () =>
        Promise.resolve({ userId, state: 'offline', lastSeenAt: lastSeen })
      )
    ),

    bus.subscribe(PresenceEvents.STATUS_CHANGED, ({ payload: { userId, status } }) =>
      notifyAudience(
        userId,
        () => Promise.resolve({ userId, state: effectiveState(true, status), lastSeenAt: null }),
        [userRoom(userId)]
      )
    ),

    bus.subscribe(UserEvents.BLOCKED, async ({ payload: { userId, blockedUserId } }) => {
      await Promise.all([
        enqueue(userId, () => {
          emit([userRoom(blockedUserId)], hidden(userId));
          return Promise.resolve();
        }),
        enqueue(blockedUserId, () => {
          emit([userRoom(userId)], hidden(blockedUserId));
          return Promise.resolve();
        }),
      ]);
    }),

    bus.subscribe(UserEvents.UNBLOCKED, async ({ payload: { userId, unblockedUserId } }) => {
      const reveal = (subject: string, viewer: string): Promise<void> =>
        enqueue(subject, async () => {
          const payload = await currentState(subject);
          if (payload !== null) {
            emit([userRoom(viewer)], payload);
          }
        });
      await Promise.all([reveal(userId, unblockedUserId), reveal(unblockedUserId, userId)]);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/realtime/presenceBridge.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/presence/index.ts src/modules/presence/realtime/index.ts src/modules/presence/realtime/presenceBridge.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/realtime/presenceBridge.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/presence/index.ts \
  src/modules/presence/realtime/index.ts \
  src/modules/presence/realtime/presenceBridge.ts \
  tests/unit/modules/presence/index.test.ts \
  tests/unit/modules/presence/realtime/presenceBridge.test.ts
git commit -m "✨ feat: adiciona a ponte presence:update com ocultação por bloqueio"
```


---

### Task 12: REST: `GET /api/presence` e `PUT /api/presence/status`

**Files:**
- Modify: `src/app.ts`
- Create: `src/modules/presence/controllers/PresenceController.ts`
- Create: `src/modules/presence/controllers/index.ts`
- Modify: `src/modules/presence/index.ts`
- Create: `src/modules/presence/routes/index.ts`
- Create: `src/modules/presence/routes/presence.routes.ts`
- Modify: `tests/unit/app.test.ts`
- Create: `tests/unit/modules/presence/controllers/PresenceController.test.ts`
- Modify: `tests/unit/modules/presence/index.test.ts`
- Create: `tests/unit/modules/presence/routes/presence.routes.test.ts`

**Interfaces:**
- Consumes: `presenceQuerySchema`/`presenceStatusSchema` (Task 7), `IPresenceService.getVisibleStates/setManualStatus`.
- Produces: `PresenceController` (`constructor(presence?)`) com `getStates(req, res)` → 200 `{ success: true, data: { items } }` e `setStatus(req, res)` → 204; `presenceRoutes`; `app.use('/api/presence', presenceRoutes)`.

Controller e rotas do módulo (spec §5), montados em `/api/presence` no `app.ts`.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/app.test.ts`, substituir:

```ts
    });

    it('serve o cliente demo estático em /demo, fora do rate limit de /api', async () => {
      const page = await request(app).get('/demo/');
```

por:

```ts
    });

    it('monta o router de presença em /api/presence (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/presence?userIds=x');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('serve o cliente demo estático em /demo, fora do rate limit de /api', async () => {
      const page = await request(app).get('/demo/');
```

Criar `tests/unit/modules/presence/controllers/PresenceController.test.ts`:

```ts
jest.mock('@/modules/presence/services', () => ({ presenceService: {} }));

import type { Request, Response } from 'express';
import { PresenceController } from '@/modules/presence/controllers/PresenceController';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: ANA, email: 'ana@example.com', username: 'ana' },
    query: {},
    body: {},
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

describe('PresenceController', () => {
  let presence: { getVisibleStates: jest.Mock; setManualStatus: jest.Mock };
  let controller: PresenceController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    presence = { getVisibleStates: jest.fn(), setManualStatus: jest.fn() };
    controller = new PresenceController(presence);
    res = createRes();
  });

  it('usa o presenceService padrão quando nenhum é injetado', () => {
    expect(new PresenceController()).toBeInstanceOf(PresenceController);
  });

  describe('getStates', () => {
    it('responde { items } com os estados visíveis para quem pergunta', async () => {
      const items = [{ userId: BOB, state: 'online', lastSeenAt: null }];
      presence.getVisibleStates.mockResolvedValue(items);

      await controller.getStates(createReq({ query: { userIds: `${BOB}` } }), res);

      expect(presence.getVisibleStates).toHaveBeenCalledWith(ANA, [BOB]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { items } });
    });

    it('userIds inválido → 400 sem consultar', async () => {
      await controller.getStates(createReq({ query: { userIds: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(presence.getVisibleStates).not.toHaveBeenCalled();
    });

    it('sem usuário autenticado lança UnauthorizedError', async () => {
      await expect(controller.getStates(createReq({ user: undefined }), res)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  describe('setStatus', () => {
    it('grava o status manual e responde 204', async () => {
      presence.setManualStatus.mockResolvedValue({ state: 'away', changed: true });

      await controller.setStatus(createReq({ body: { status: 'away' } }), res);

      expect(presence.setManualStatus).toHaveBeenCalledWith(ANA, 'away');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('status inválido → 400', async () => {
      await controller.setStatus(createReq({ body: { status: 'offline' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(presence.setManualStatus).not.toHaveBeenCalled();
    });
  });
});
```

Em `tests/unit/modules/presence/index.test.ts`, substituir:

```ts
    expect(presenceModule.registerPresenceBridge).toBeInstanceOf(Function);
  });
});
```

por:

```ts
    expect(presenceModule.registerPresenceBridge).toBeInstanceOf(Function);
  });

  it('deve exportar controller e rotas', () => {
    expect(presenceModule.presenceController).toBeInstanceOf(presenceModule.PresenceController);
    expect(presenceModule.presenceRoutes).toBeDefined();
  });
});
```

Criar `tests/unit/modules/presence/routes/presence.routes.test.ts`:

```ts
jest.mock('@/modules/presence/controllers/PresenceController', () => ({
  presenceController: { getStates: jest.fn(), setStatus: jest.fn() },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { authenticate } from '@/modules/auth/middlewares';
import { presenceController } from '@/modules/presence/controllers/PresenceController';
import { presenceRoutes } from '@/modules/presence/routes';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((presenceRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('presence.routes', () => {
  it('define GET / e PUT /status, ambos com authenticate', () => {
    expect(getRoutes().map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /',
      'PUT /status',
    ]);
    for (const { layer } of getRoutes()) {
      expect(layer.route!.stack[0]!.handle).toBe(authenticate);
    }
  });

  it.each([
    ['GET', '/', 'getStates'],
    ['PUT', '/status', 'setStatus'],
  ] as const)('%s %s deve chamar presenceController.%s', async (method, path, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path)!;
    const req = {};
    const res = {};

    await route.layer.route!.stack[1]!.handle(req, res);

    expect(presenceController[handler]).toHaveBeenCalledWith(req, res);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/app.test.ts tests/unit/modules/presence/controllers/PresenceController.test.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/routes/presence.routes.test.ts --coverage=false`

Expected: FAIL — `Could not locate module @/modules/presence/controllers/PresenceController` e `GET /api/presence` → 404 no app.

- [ ] **Step 3: Implementar**

Em `src/app.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './modules/user/routes';
import { conversationRoutes } from './modules/chat/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';
```

por:

```ts
import { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './modules/user/routes';
import { conversationRoutes } from './modules/chat/routes';
import { presenceRoutes } from './modules/presence/routes';

const env: Environment = (process.env.NODE_ENV as Environment | undefined) ?? 'development';
```

2. Substituir:

```ts
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFoundHandler);
```

por:

```ts
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/presence', presenceRoutes);

app.use(notFoundHandler);
```

Criar `src/modules/presence/controllers/PresenceController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';
import type { IPresenceService } from '../interfaces';
import { presenceService } from '../services';
import { presenceQuerySchema, presenceStatusSchema } from '../validation';

export class PresenceController {
  private readonly presence: Pick<IPresenceService, 'getVisibleStates' | 'setManualStatus'>;

  constructor(presence?: Pick<IPresenceService, 'getVisibleStates' | 'setManualStatus'>) {
    this.presence = presence ?? presenceService;
  }

  /** `GET /api/presence?userIds=a,b` → `{ items: [{ userId, state, lastSeenAt }] }`. */
  async getStates(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = presenceQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const items = await this.presence.getVisibleStates(userId, parsed.data.userIds);

    res.status(HttpStatus.OK).json({ success: true, data: { items } });
  }

  /** `PUT /api/presence/status { status }` → 204 (mesma regra do `presence:set`). */
  async setStatus(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = presenceStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    await this.presence.setManualStatus(userId, parsed.data.status);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const presenceController = new PresenceController();
```

Criar `src/modules/presence/controllers/index.ts`:

```ts
export { PresenceController, presenceController } from './PresenceController';
```

Em `src/modules/presence/index.ts`, substituir:

```ts
  PresenceRealtimeHandle,
} from './realtime';
```

por:

```ts
  PresenceRealtimeHandle,
} from './realtime';

export { PresenceController, presenceController } from './controllers';

export { presenceRoutes } from './routes';
```

Criar `src/modules/presence/routes/index.ts`:

```ts
export { presenceRoutes } from './presence.routes';
```

Criar `src/modules/presence/routes/presence.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { presenceController } from '../controllers/PresenceController';

const router = Router();

/**
 * @route GET /presence?userIds=<uuid>,<uuid>
 * @description Estado de presença de até 100 usuários (pares bloqueados sempre offline)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => presenceController.getStates(req, res))
);

/**
 * @route PUT /presence/status
 * @description Define o status manual (available, away ou busy)
 * @access Private
 */
router.put(
  '/status',
  authenticate,
  asyncHandler((req, res) => presenceController.setStatus(req, res))
);

export { router as presenceRoutes };
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/app.test.ts tests/unit/modules/presence/controllers/PresenceController.test.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/routes/presence.routes.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/app.ts src/modules/presence/controllers/PresenceController.ts src/modules/presence/controllers/index.ts src/modules/presence/index.ts src/modules/presence/routes/index.ts src/modules/presence/routes/presence.routes.ts tests/unit/app.test.ts tests/unit/modules/presence/controllers/PresenceController.test.ts tests/unit/modules/presence/index.test.ts tests/unit/modules/presence/routes/presence.routes.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts \
  src/modules/presence/controllers/PresenceController.ts \
  src/modules/presence/controllers/index.ts \
  src/modules/presence/index.ts \
  src/modules/presence/routes/index.ts \
  src/modules/presence/routes/presence.routes.ts \
  tests/unit/app.test.ts \
  tests/unit/modules/presence/controllers/PresenceController.test.ts \
  tests/unit/modules/presence/index.test.ts \
  tests/unit/modules/presence/routes/presence.routes.test.ts
git commit -m "✨ feat: adiciona GET /api/presence e PUT /api/presence/status"
```


---

### Task 13: Contatos com presença: enriquecimento, `orderBy=presence` e `GET /api/contacts/online`

**Files:**
- Modify: `src/modules/presence/constants/index.ts`
- Modify: `src/modules/presence/constants/presence.constants.ts`
- Modify: `src/modules/user/constants/contact.constants.ts`
- Modify: `src/modules/user/controllers/ContactController.ts`
- Modify: `src/modules/user/routes/contact.routes.ts`
- Modify: `src/modules/user/types/contact.types.ts`
- Modify: `tests/feature/modules/user/contacts.test.ts`
- Modify: `tests/unit/modules/presence/constants/presence.constants.test.ts`
- Modify: `tests/unit/modules/user/controllers/ContactController.test.ts`
- Modify: `tests/unit/modules/user/routes/contact.routes.test.ts`
- Modify: `tests/unit/modules/user/validation/contact.schemas.test.ts`

**Interfaces:**
- Consumes: `IPresenceService.getVisibleStates` (Task 9), `IContactService.listContactIds/getContactsByIds` (Task 4).
- Produces: `compareByPresence(a, b)` (em `@/modules/presence/constants`); `CONTACT_ORDER_BY` inclui `'presence'`; tipo `ContactWithPresence extends ContactWithUser { presence }`; `new ContactController(contacts?, presence?)` com `online(req, res)`; rota `GET /contacts/online` (antes de `/:contactId`).

O `ContactController` ganha a presença como segunda dependência: `GET /api/contacts` anexa `presence: { state, lastSeenAt }` a cada item (visto por quem lista — bloqueio ⇒ offline) e aceita `orderBy=presence` (ordena a página); `GET /api/contacts/online` lista os conectados por nome. O comparador fica no módulo presence (`compareByPresence`).

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/feature/modules/user/contacts.test.ts` (4 trechos, na ordem):

1. Substituir:

```ts
  listBlocked: jest.fn(),
  searchUsers: jest.fn(),
};

jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));

```

por:

```ts
  listBlocked: jest.fn(),
  searchUsers: jest.fn(),
  listContactIds: jest.fn(),
  getContactsByIds: jest.fn(),
};
const mockPresenceService = { getVisibleStates: jest.fn() };

jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({
  presenceService: mockPresenceService,
}));

```

2. Substituir:

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
```

por:

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    // Todos online (a presença em si é testada no módulo presence).
    mockPresenceService.getVisibleStates.mockImplementation(async (_viewer, ids: string[]) =>
      ids.map((userId) => ({ userId, state: 'online', lastSeenAt: null }))
    );
    app = express();
    app.use(express.json());
```

3. Substituir:

```ts
      ['post', '/api/contacts'],
      ['get', '/api/contacts/favorites'],
      ['get', '/api/contacts/stats'],
      ['get', `/api/contacts/${CONTACT_ID}`],
```

por:

```ts
      ['post', '/api/contacts'],
      ['get', '/api/contacts/favorites'],
      ['get', '/api/contacts/online'],
      ['get', '/api/contacts/stats'],
      ['get', `/api/contacts/${CONTACT_ID}`],
```

4. Substituir:

```ts
      const removed = await request(app).delete(`/api/contacts/${CONTACT_ID}`).set(AUTH);
      expect(removed.status).toBe(HttpStatus.NO_CONTENT);
    });

```

por:

```ts
      const removed = await request(app).delete(`/api/contacts/${CONTACT_ID}`).set(AUTH);
      expect(removed.status).toBe(HttpStatus.NO_CONTENT);
    });

    it('GET /api/contacts traz presence em cada contato e aceita orderBy=presence', async () => {
      mockContactService.listContacts.mockResolvedValue({
        contacts: [{ id: 'c-1', contactId: CONTACT_ID }],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const listed = await request(app).get('/api/contacts?orderBy=presence').set(AUTH);

      expect(listed.status).toBe(HttpStatus.OK);
      expect(listed.body.data.contacts[0].presence).toEqual({ state: 'online', lastSeenAt: null });
    });

    it('GET /api/contacts/online não deve ser capturado por /:contactId', async () => {
      mockContactService.listContactIds.mockResolvedValue([CONTACT_ID]);
      mockContactService.getContactsByIds.mockResolvedValue([
        { id: 'c-1', contactId: CONTACT_ID, nickname: 'Bia', contact: { username: 'bia' } },
      ]);

      const response = await request(app).get('/api/contacts/online').set(AUTH);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toEqual([
        expect.objectContaining({
          contactId: CONTACT_ID,
          presence: { state: 'online', lastSeenAt: null },
        }),
      ]);
      expect(mockContactService.getContact).not.toHaveBeenCalled();
    });

```

Em `tests/unit/modules/presence/constants/presence.constants.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  PRESENCE_KEYS,
  PRESENCE_STATES,
  effectiveState,
  toManualStatus,
```

por:

```ts
  PRESENCE_KEYS,
  PRESENCE_STATES,
  compareByPresence,
  effectiveState,
  toManualStatus,
```

2. Substituir:

```ts
    expect(effectiveState(connected, manual)).toBe(expected);
  });
});
```

por:

```ts
    expect(effectiveState(connected, manual)).toBe(expected);
  });

  it('compareByPresence: online → away → busy → offline (visto mais recente primeiro, sem data no fim)', () => {
    const entries = [
      { name: 'semData', state: 'offline', lastSeenAt: null },
      { name: 'ocupado', state: 'busy', lastSeenAt: null },
      { name: 'antigo', state: 'offline', lastSeenAt: new Date('2026-09-25T10:00:00.000Z') },
      { name: 'online', state: 'online', lastSeenAt: null },
      { name: 'recente', state: 'offline', lastSeenAt: new Date('2026-09-26T10:00:00.000Z') },
      { name: 'ausente', state: 'away', lastSeenAt: null },
    ] as const;

    expect([...entries].sort(compareByPresence).map((entry) => entry.name)).toEqual([
      'online',
      'ausente',
      'ocupado',
      'recente',
      'antigo',
      'semData',
    ]);
  });
});
```

Em `tests/unit/modules/user/controllers/ContactController.test.ts` (3 trechos, na ordem):

1. Substituir:

```ts
  contactService: {},
}));

import type { Request, Response } from 'express';
import { ContactController } from '@/modules/user/controllers/ContactController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

function createService(): jest.Mocked<IContactService> {
```

por:

```ts
  contactService: {},
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({ presenceService: {} }));

import type { Request, Response } from 'express';
import { ContactController } from '@/modules/user/controllers/ContactController';
import type { IContactService } from '@/modules/user/interfaces';
import type { ContactWithUser } from '@/modules/user/types';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const THIRD_ID = '44444444-4444-4444-8444-444444444444';

function contactRow(
  contactId: string,
  names: { nickname?: string | null; displayName?: string | null; username: string }
): ContactWithUser {
  return {
    id: `row-${contactId}`,
    userId: USER_ID,
    contactId,
    nickname: names.nickname ?? null,
    isBlocked: false,
    isFavorite: false,
    blockedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    contact: {
      id: contactId,
      username: names.username,
      displayName: names.displayName ?? null,
      avatarUrl: null,
      status: 'offline',
      lastSeenAt: null,
    },
  };
}

function createService(): jest.Mocked<IContactService> {
```

2. Substituir:

```ts
describe('ContactController', () => {
  let service: jest.Mocked<IContactService>;
  let controller: ContactController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new ContactController(service);
    res = createRes();
  });
```

por:

```ts
describe('ContactController', () => {
  let service: jest.Mocked<IContactService>;
  let presence: { getVisibleStates: jest.Mock };
  let controller: ContactController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    presence = { getVisibleStates: jest.fn().mockResolvedValue([]) };
    controller = new ContactController(service, presence);
    res = createRes();
  });
```

3. Substituir:

```ts
    });
  });
});
```

por:

```ts
    });
  });

  describe('presença nos contatos', () => {
    const page = (contacts: ContactWithUser[]) => ({
      contacts,
      total: contacts.length,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    it('list anexa presence { state, lastSeenAt } a cada contato (visto por quem lista)', async () => {
      const lastSeenAt = new Date('2026-09-26T09:00:00.000Z');
      service.listContacts.mockResolvedValue(
        page([
          contactRow(CONTACT_ID, { username: 'bia' }),
          contactRow(OTHER_ID, { username: 'caio' }),
        ])
      );
      presence.getVisibleStates.mockResolvedValue([
        { userId: CONTACT_ID, state: 'busy', lastSeenAt: null },
        { userId: OTHER_ID, state: 'offline', lastSeenAt },
      ]);

      await controller.list(createReq(), res);

      expect(presence.getVisibleStates).toHaveBeenCalledWith(USER_ID, [CONTACT_ID, OTHER_ID]);
      const { data } = res.json.mock.calls[0]![0] as { data: { contacts: unknown[] } };
      expect(data.contacts).toEqual([
        expect.objectContaining({
          contactId: CONTACT_ID,
          presence: { state: 'busy', lastSeenAt: null },
        }),
        expect.objectContaining({
          contactId: OTHER_ID,
          presence: { state: 'offline', lastSeenAt },
        }),
      ]);
    });

    it('contato sem estado conhecido sai offline', async () => {
      service.listContacts.mockResolvedValue(page([contactRow(CONTACT_ID, { username: 'bia' })]));

      await controller.list(createReq(), res);

      const { data } = res.json.mock.calls[0]![0] as {
        data: { contacts: { presence: unknown }[] };
      };
      expect(data.contacts[0]!.presence).toEqual({ state: 'offline', lastSeenAt: null });
    });

    it('orderBy=presence: banco na ordem padrão; página online → away → busy → offline (visto mais recente primeiro)', async () => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(
        (letter) => `${letter.repeat(8)}-0000-4000-8000-000000000000`
      );
      service.listContacts.mockResolvedValue(
        page(ids.map((id) => contactRow(id, { username: id.slice(0, 1) })))
      );
      presence.getVisibleStates.mockResolvedValue([
        { userId: ids[0], state: 'offline', lastSeenAt: null },
        { userId: ids[1], state: 'busy', lastSeenAt: null },
        { userId: ids[2], state: 'offline', lastSeenAt: new Date('2026-09-26T08:00:00.000Z') },
        { userId: ids[3], state: 'online', lastSeenAt: null },
        { userId: ids[4], state: 'offline', lastSeenAt: new Date('2026-09-26T09:00:00.000Z') },
        { userId: ids[5], state: 'away', lastSeenAt: null },
      ]);

      await controller.list(createReq({ query: { orderBy: 'presence' } }), res);

      expect(service.listContacts).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ orderBy: undefined })
      );
      const { data } = res.json.mock.calls[0]![0] as {
        data: { contacts: { contact: { username: string } }[] };
      };
      expect(data.contacts.map((c) => c.contact.username).join('')).toBe('dfbeca');
    });

    it('online: só os conectados, carregados em lote e ordenados pelo nome exibido', async () => {
      service.listContactIds.mockResolvedValue([CONTACT_ID, OTHER_ID, THIRD_ID]);
      presence.getVisibleStates.mockResolvedValue([
        { userId: CONTACT_ID, state: 'online', lastSeenAt: null },
        { userId: OTHER_ID, state: 'offline', lastSeenAt: null },
        { userId: THIRD_ID, state: 'away', lastSeenAt: null },
      ]);
      service.getContactsByIds.mockResolvedValue([
        contactRow(CONTACT_ID, { username: 'zeca', displayName: 'Zeca' }),
        contactRow(THIRD_ID, { username: 'yuri', nickname: 'Álvaro' }),
      ]);

      await controller.online(createReq(), res);

      expect(presence.getVisibleStates).toHaveBeenCalledWith(USER_ID, [
        CONTACT_ID,
        OTHER_ID,
        THIRD_ID,
      ]);
      expect(service.getContactsByIds).toHaveBeenCalledWith(USER_ID, [CONTACT_ID, THIRD_ID]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const { data } = res.json.mock.calls[0]![0] as {
        data: { contactId: string; presence: { state: string } }[];
      };
      expect(data.map((c) => [c.contactId, c.presence.state])).toEqual([
        [THIRD_ID, 'away'],
        [CONTACT_ID, 'online'],
      ]);
    });

    it('online ordena por username quando não há apelido nem nome de exibição', async () => {
      service.listContactIds.mockResolvedValue([CONTACT_ID, OTHER_ID]);
      presence.getVisibleStates.mockResolvedValue([
        { userId: CONTACT_ID, state: 'online', lastSeenAt: null },
        { userId: OTHER_ID, state: 'busy', lastSeenAt: null },
      ]);
      service.getContactsByIds.mockResolvedValue([
        contactRow(CONTACT_ID, { username: 'marta' }),
        contactRow(OTHER_ID, { username: 'bruno' }),
      ]);

      await controller.online(createReq(), res);

      const { data } = res.json.mock.calls[0]![0] as { data: { contactId: string }[] };
      expect(data.map((c) => c.contactId)).toEqual([OTHER_ID, CONTACT_ID]);
    });

    it('online sem usuário autenticado lança UnauthorizedError', async () => {
      await expect(controller.online(createReq({ user: undefined }), res)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });
});
```

Em `tests/unit/modules/user/routes/contact.routes.test.ts` (4 trechos, na ordem):

1. Substituir:

```ts
    add: jest.fn(),
    listFavorites: jest.fn(),
    stats: jest.fn(),
    get: jest.fn(),
```

por:

```ts
    add: jest.fn(),
    listFavorites: jest.fn(),
    online: jest.fn(),
    stats: jest.fn(),
    get: jest.fn(),
```

2. Substituir:

```ts
    ['POST', '/'],
    ['GET', '/favorites'],
    ['GET', '/stats'],
    ['GET', '/:contactId'],
```

por:

```ts
    ['POST', '/'],
    ['GET', '/favorites'],
    ['GET', '/online'],
    ['GET', '/stats'],
    ['GET', '/:contactId'],
```

3. Substituir:

```ts
    expect(paths.indexOf('/favorites')).toBeLessThan(firstParam);
    expect(paths.indexOf('/stats')).toBeLessThan(firstParam);
  });

```

por:

```ts
    expect(paths.indexOf('/favorites')).toBeLessThan(firstParam);
    expect(paths.indexOf('/stats')).toBeLessThan(firstParam);
    expect(paths.indexOf('/online')).toBeLessThan(firstParam);
  });

```

4. Substituir:

```ts
    ['POST', '/', 'add'],
    ['GET', '/favorites', 'listFavorites'],
    ['GET', '/stats', 'stats'],
    ['GET', '/:contactId', 'get'],
```

por:

```ts
    ['POST', '/', 'add'],
    ['GET', '/favorites', 'listFavorites'],
    ['GET', '/online', 'online'],
    ['GET', '/stats', 'stats'],
    ['GET', '/:contactId', 'get'],
```

Em `tests/unit/modules/user/validation/contact.schemas.test.ts`, substituir:

```ts
      });

      it('deve rejeitar orderBy inválido', () => {
        const data = { orderBy: 'invalid' };
```

por:

```ts
      });

      it('deve validar orderBy "presence"', () => {
        const result = listContactsSchema.safeParse({ orderBy: 'presence' });
        expect(result.success).toBe(true);
      });

      it('deve rejeitar orderBy inválido', () => {
        const data = { orderBy: 'invalid' };
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/feature/modules/user/contacts.test.ts tests/unit/modules/presence/constants/presence.constants.test.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/routes/contact.routes.test.ts tests/unit/modules/user/validation/contact.schemas.test.ts --coverage=false`

Expected: FAIL — 12 testes (itens sem `presence`, `GET /online` inexistente, `orderBy=presence` recusado pela validação, `compareByPresence` inexistente).

- [ ] **Step 3: Implementar**

Em `src/modules/presence/constants/index.ts`, substituir:

```ts
  toManualStatus,
  effectiveState,
} from './presence.constants';
```

por:

```ts
  toManualStatus,
  effectiveState,
  compareByPresence,
} from './presence.constants';
```

Em `src/modules/presence/constants/presence.constants.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import type { ManualPresenceStatus, PresenceState } from '@/shared/types';

export const PRESENCE_CONSTANTS = {
```

por:

```ts
import type { ManualPresenceStatus, PresenceState, PresenceStateDTO } from '@/shared/types';

export const PRESENCE_CONSTANTS = {
```

2. Substituir:

```ts
  return manual === 'available' ? 'online' : manual;
}
```

por:

```ts
  return manual === 'available' ? 'online' : manual;
}

/** Ordem de exibição: online, ausente, ocupado e, por fim, offline. */
const PRESENCE_RANK: Record<PresenceState, number> = { online: 0, away: 1, busy: 2, offline: 3 };

type PresenceSortKey = Pick<PresenceStateDTO, 'state' | 'lastSeenAt'>;

/** "Visto por último" em ms; sem data conta como o mais antigo possível. */
function lastSeenMs(entry: PresenceSortKey): number {
  return entry.lastSeenAt?.getTime() ?? 0;
}

/**
 * Comparador para `sort`: conectados primeiro (online → away → busy), depois offline pelo
 * "visto por último" mais recente (sem data vai para o fim). Empates mantêm a ordem original.
 */
export function compareByPresence(a: PresenceSortKey, b: PresenceSortKey): number {
  return PRESENCE_RANK[a.state] - PRESENCE_RANK[b.state] || lastSeenMs(b) - lastSeenMs(a);
}
```

Em `src/modules/user/constants/contact.constants.ts`, substituir:

```ts
} as const;

export const CONTACT_ORDER_BY = ['nickname', 'createdAt', 'lastInteraction'] as const;
export type ContactOrderBy = (typeof CONTACT_ORDER_BY)[number];
```

por:

```ts
} as const;

/** `presence` ordena a página já carregada (online/away/busy primeiro, depois offline). */
export const CONTACT_ORDER_BY = ['nickname', 'createdAt', 'lastInteraction', 'presence'] as const;
export type ContactOrderBy = (typeof CONTACT_ORDER_BY)[number];
```

Em `src/modules/user/controllers/ContactController.ts` (4 trechos, na ordem):

1. Substituir:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import {
  addContactSchema,
```

por:

```ts
import type { Request, Response } from 'express';
import { compareByPresence } from '@/modules/presence/constants';
import type { IPresenceService } from '@/modules/presence/interfaces';
import { presenceService } from '@/modules/presence/services/PresenceService';
import { HttpStatus } from '@/shared/errors';
import type { PresenceStateDTO } from '@/shared/types';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import type { ContactWithPresence, ContactWithUser } from '../types';
import {
  addContactSchema,
```

2. Substituir:

```ts
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';

export class ContactController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
```

por:

```ts
import { getAuthenticatedUserId, sendValidationError } from '@/shared/http/controller.helpers';

const OFFLINE: ContactWithPresence['presence'] = { state: 'offline', lastSeenAt: null };

/** Nome exibido do contato: apelido, nome de exibição ou username. */
function contactName(contact: ContactWithUser): string {
  return contact.nickname ?? contact.contact.displayName ?? contact.contact.username;
}

export class ContactController {
  private readonly contacts: IContactService;
  private readonly presence: Pick<IPresenceService, 'getVisibleStates'>;

  constructor(contacts?: IContactService, presence?: Pick<IPresenceService, 'getVisibleStates'>) {
    this.contacts = contacts ?? contactService;
    this.presence = presence ?? presenceService;
  }

  /**
   * Página de contatos com `presence: { state, lastSeenAt }` em cada item. `orderBy=presence`
   * ordena a PÁGINA carregada (o banco ordena por `createdAt`); para a lista completa de quem
   * está conectado, `GET /contacts/online`.
   */
  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
```

3. Substituir:

```ts

    const { search, isBlocked, isFavorite, limit, offset, orderBy, order } = parsed.data;
    const result = await this.contacts.listContacts(userId, {
      filters: { search, isBlocked, isFavorite },
      limit,
      offset,
      orderBy,
      order,
    });

    res.status(HttpStatus.OK).json({ success: true, data: result });
  }

```

por:

```ts

    const { search, isBlocked, isFavorite, limit, offset, orderBy, order } = parsed.data;
    const byPresence = orderBy === 'presence';
    const result = await this.contacts.listContacts(userId, {
      filters: { search, isBlocked, isFavorite },
      limit,
      offset,
      orderBy: byPresence ? undefined : orderBy,
      order,
    });

    const states = await this.presence.getVisibleStates(
      userId,
      result.contacts.map((contact) => contact.contactId)
    );
    const contacts = withPresence(result.contacts, states);
    if (byPresence) {
      contacts.sort((a, b) => compareByPresence(a.presence, b.presence));
    }

    res.status(HttpStatus.OK).json({ success: true, data: { ...result, contacts } });
  }

  /** Contatos (não bloqueados) conectados — online, ausente ou ocupado —, ordenados por nome. */
  async online(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const states = await this.presence.getVisibleStates(
      userId,
      await this.contacts.listContactIds(userId)
    );
    const connected = states.filter(({ state }) => state !== 'offline');
    const contacts = await this.contacts.getContactsByIds(
      userId,
      connected.map((entry) => entry.userId)
    );

    const items = withPresence(contacts, connected).sort((a, b) =>
      contactName(a).localeCompare(contactName(b), 'pt-BR', { sensitivity: 'base' })
    );

    res.status(HttpStatus.OK).json({ success: true, data: items });
  }

```

4. Substituir:

```ts
}

export const contactController = new ContactController();
```

por:

```ts
}

/** Anexa a presença a cada contato; sem estado conhecido, `offline`. */
function withPresence(
  contacts: ContactWithUser[],
  states: PresenceStateDTO[]
): ContactWithPresence[] {
  const byId = new Map(
    states.map(({ userId, state, lastSeenAt }) => [userId, { state, lastSeenAt }])
  );
  return contacts.map((contact) => ({
    ...contact,
    presence: byId.get(contact.contactId) ?? OFFLINE,
  }));
}

export const contactController = new ContactController();
```

Em `src/modules/user/routes/contact.routes.ts`, substituir:

```ts
  authenticate,
  asyncHandler((req, res) => contactController.listFavorites(req, res))
);

```

por:

```ts
  authenticate,
  asyncHandler((req, res) => contactController.listFavorites(req, res))
);

/**
 * @route GET /contacts/online
 * @description Contatos conectados (online, ausente ou ocupado), ordenados por nome
 * @access Private
 */
router.get(
  '/online',
  authenticate,
  asyncHandler((req, res) => contactController.online(req, res))
);

```

Em `src/modules/user/types/contact.types.ts` (2 trechos, na ordem):

1. Substituir:

```ts
export interface ContactAttributes {
  id: string;
```

por:

```ts
import type { PresenceStateDTO } from '@/shared/types';

export interface ContactAttributes {
  id: string;
```

2. Substituir:

```ts
    lastSeenAt: Date | null;
  };
}

```

por:

```ts
    lastSeenAt: Date | null;
  };
}

/** Contato com a presença do usuário (como quem lista a vê: bloqueio ⇒ offline). */
export interface ContactWithPresence extends ContactWithUser {
  presence: Pick<PresenceStateDTO, 'state' | 'lastSeenAt'>;
}

```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/feature/modules/user/contacts.test.ts tests/unit/modules/presence/constants/presence.constants.test.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/routes/contact.routes.test.ts tests/unit/modules/user/validation/contact.schemas.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/presence/constants/index.ts src/modules/presence/constants/presence.constants.ts src/modules/user/constants/contact.constants.ts src/modules/user/controllers/ContactController.ts src/modules/user/routes/contact.routes.ts src/modules/user/types/contact.types.ts tests/feature/modules/user/contacts.test.ts tests/unit/modules/presence/constants/presence.constants.test.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/routes/contact.routes.test.ts tests/unit/modules/user/validation/contact.schemas.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/presence/constants/index.ts \
  src/modules/presence/constants/presence.constants.ts \
  src/modules/user/constants/contact.constants.ts \
  src/modules/user/controllers/ContactController.ts \
  src/modules/user/routes/contact.routes.ts \
  src/modules/user/types/contact.types.ts \
  tests/feature/modules/user/contacts.test.ts \
  tests/unit/modules/presence/constants/presence.constants.test.ts \
  tests/unit/modules/user/controllers/ContactController.test.ts \
  tests/unit/modules/user/routes/contact.routes.test.ts \
  tests/unit/modules/user/validation/contact.schemas.test.ts
git commit -m "✨ feat: presença nos contatos, orderBy=presence e GET /api/contacts/online"
```


---

### Task 14: Endpoints legados de status delegam à presença

**Files:**
- Modify: `src/modules/user/errors/index.ts`
- Modify: `src/modules/user/errors/profile.errors.ts`
- Modify: `src/modules/user/services/ProfileService.ts`
- Modify: `src/modules/user/services/index.ts`
- Modify: `tests/unit/modules/user/errors/profile.errors.test.ts`
- Modify: `tests/unit/modules/user/services/ProfileService.events.test.ts`
- Modify: `tests/unit/modules/user/services/ProfileService.test.ts`
- Modify: `tests/unit/modules/user/services/index.test.ts`

**Interfaces:**
- Consumes: `IPresenceService.setManualStatus` (Task 8).
- Produces: `OfflineStatusNotAllowedException` (400, `BAD_REQUEST`; exportada por `@/modules/user/errors` e por `@/modules/user/services`); `new ProfileService(users?, avatar?, events?, presence?: Pick<IPresenceService, 'setManualStatus'>)`.

Spec §5: `PUT /api/profile/status` e `POST /api/profile/online|offline` mantêm as rotas, mas passam a definir o status manual da presença (`online` → `available`) e deixam de gravar `users.status`; `offline` responde 400 antes de qualquer consulta.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/modules/user/errors/profile.errors.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
} from '@/modules/user/errors/profile.errors';

```

por:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '@/modules/user/errors/profile.errors';

```

2. Substituir:

```ts
    });
  });
});
```

por:

```ts
    });
  });

  describe('OfflineStatusNotAllowedException', () => {
    it('deve responder 400 orientando a usar a desconexão', () => {
      const error = new OfflineStatusNotAllowedException();

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Não é possível definir offline manualmente: use a desconexão');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('deve aceitar mensagem personalizada', () => {
      expect(new OfflineStatusNotAllowedException('Outra').message).toBe('Outra');
    });
  });
});
```

Em `tests/unit/modules/user/services/ProfileService.events.test.ts`, substituir:

```ts
  UserRepository: jest.fn(),
}));

import type { IAvatarService, IUserRepository } from '@/modules/user/interfaces';
```

por:

```ts
  UserRepository: jest.fn(),
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({ presenceService: {} }));

import type { IAvatarService, IUserRepository } from '@/modules/user/interfaces';
```

Em `tests/unit/modules/user/services/ProfileService.test.ts` (3 trechos, na ordem):

1. Substituir:

```ts
  UserRepository: jest.fn(),
}));

import {
```

por:

```ts
  UserRepository: jest.fn(),
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({ presenceService: {} }));

import {
```

2. Substituir:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
} from '@/modules/user/services/ProfileService';
import type { IAvatarService } from '@/modules/user/interfaces';
```

por:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '@/modules/user/services/ProfileService';
import type { IAvatarService } from '@/modules/user/interfaces';
```

3. Substituir:

```ts
  });

  describe('updateStatus', () => {
    it('deve atualizar status do usuário', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.updateStatus('user-123', UserStatus.BUSY);

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.BUSY);
    });

    it('deve lançar ProfileNotFoundException quando usuário não existe', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(profileService.updateStatus('nonexistent', UserStatus.ONLINE)).rejects.toThrow(
        ProfileNotFoundException
      );
    });
  });

  describe('setOnline', () => {
    it('deve definir status como online', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.setOnline('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.ONLINE);
    });
  });

  describe('setOffline', () => {
    it('deve definir status como offline e atualizar lastSeen', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();
      mockUserRepository.updateLastSeen.mockResolvedValue();

      await profileService.setOffline('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.OFFLINE);
      expect(mockUserRepository.updateLastSeen).toHaveBeenCalledWith('user-123');
    });
  });

  describe('setAway', () => {
    it('deve definir status como away', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.setAway('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.AWAY);
    });
  });

  describe('setBusy', () => {
    it('deve definir status como busy', async () => {
      mockUserRepository.updateStatus.mockResolvedValue();

      await profileService.setBusy('user-123');

      expect(mockUserRepository.updateStatus).toHaveBeenCalledWith('user-123', UserStatus.BUSY);
    });
  });
```

por:

```ts
  });

  describe('status legado (delegado à presença)', () => {
    let presence: { setManualStatus: jest.Mock };
    let service: ProfileService;

    beforeEach(() => {
      presence = {
        setManualStatus: jest.fn().mockResolvedValue({ state: 'online', changed: false }),
      };
      service = new ProfileService(mockUserRepository, undefined, undefined, presence);
    });

    it.each([
      [UserStatus.ONLINE, 'available'],
      [UserStatus.AWAY, 'away'],
      [UserStatus.BUSY, 'busy'],
    ])(
      'updateStatus(%s) grava o status manual %s e não toca users.status',
      async (status, manual) => {
        mockUserRepository.findById.mockResolvedValue(mockUser);

        await service.updateStatus('user-123', status);

        expect(presence.setManualStatus).toHaveBeenCalledWith('user-123', manual);
        expect(mockUserRepository.updateStatus).not.toHaveBeenCalled();
      }
    );

    it('updateStatus(offline) → 400 sem consultar nada', async () => {
      await expect(service.updateStatus('user-123', UserStatus.OFFLINE)).rejects.toThrow(
        OfflineStatusNotAllowedException
      );
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(presence.setManualStatus).not.toHaveBeenCalled();
    });

    it('updateStatus de perfil inexistente → ProfileNotFoundException', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.updateStatus('nonexistent', UserStatus.ONLINE)).rejects.toThrow(
        ProfileNotFoundException
      );
      expect(presence.setManualStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['setOnline', 'available'],
      ['setAway', 'away'],
      ['setBusy', 'busy'],
    ] as const)('%s grava o status manual %s', async (method, manual) => {
      await service[method]('user-123');

      expect(presence.setManualStatus).toHaveBeenCalledWith('user-123', manual);
      expect(mockUserRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('setOffline → 400 (offline vem da desconexão)', async () => {
      await expect(service.setOffline('user-123')).rejects.toThrow(
        OfflineStatusNotAllowedException
      );
      expect(presence.setManualStatus).not.toHaveBeenCalled();
      expect(mockUserRepository.updateLastSeen).not.toHaveBeenCalled();
    });
  });
```

Em `tests/unit/modules/user/services/index.test.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  DisplayNameTooLongException,
  InvalidAvatarUrlException,
  ProfileNotFoundException,
  ProfileService,
```

por:

```ts
  DisplayNameTooLongException,
  InvalidAvatarUrlException,
  OfflineStatusNotAllowedException,
  ProfileNotFoundException,
  ProfileService,
```

2. Substituir:

```ts
      const exception = new InvalidAvatarUrlException();
      expect(exception.message).toBe('URL do avatar inválida');
    });

```

por:

```ts
      const exception = new InvalidAvatarUrlException();
      expect(exception.message).toBe('URL do avatar inválida');
    });

    it('deve exportar OfflineStatusNotAllowedException', () => {
      expect(new OfflineStatusNotAllowedException()).toBeInstanceOf(
        OfflineStatusNotAllowedException
      );
    });

```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/modules/user/errors/profile.errors.test.ts tests/unit/modules/user/services/ProfileService.events.test.ts tests/unit/modules/user/services/ProfileService.test.ts tests/unit/modules/user/services/index.test.ts --coverage=false`

Expected: FAIL — 11 testes (`OfflineStatusNotAllowedException` inexistente; o status ainda é gravado em `users.status`).

- [ ] **Step 3: Implementar**

Em `src/modules/user/errors/index.ts`, substituir:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
} from './profile.errors';

```

por:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from './profile.errors';

```

Em `src/modules/user/errors/profile.errors.ts`, substituir:

```ts
      `Nome de exibição muito longo. Máximo: ${String(maxLength)} caracteres`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}
```

por:

```ts
      `Nome de exibição muito longo. Máximo: ${String(maxLength)} caracteres`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

/** Offline não é status manual: o usuário fica offline ao desconectar o último socket. */
export class OfflineStatusNotAllowedException extends AppError {
  constructor(message = 'Não é possível definir offline manualmente: use a desconexão') {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
  }
}
```

Em `src/modules/user/services/ProfileService.ts` (5 trechos, na ordem):

1. Substituir:

```ts
import { UserEvents, UserStatus } from '@/shared/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
```

por:

```ts
import type { IPresenceService } from '@/modules/presence/interfaces';
import { presenceService } from '@/modules/presence/services/PresenceService';
import { UserEvents, UserStatus, type ManualPresenceStatus } from '@/shared/types';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
```

2. Substituir:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
} from '../errors';
import { PROFILE_CONSTANTS } from '../constants';
```

por:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '../errors';
import { PROFILE_CONSTANTS } from '../constants';
```

3. Substituir:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
} from '../errors';

export type { IProfileService } from '../interfaces';

export class ProfileService implements IProfileService {
```

por:

```ts
  BioTooLongException,
  DisplayNameTooLongException,
  OfflineStatusNotAllowedException,
} from '../errors';

export type { IProfileService } from '../interfaces';

/** Status legado (`users.status`) → status manual da presença; offline não é manual (400). */
function toManualStatus(status: UserStatus): ManualPresenceStatus {
  switch (status) {
    case UserStatus.ONLINE:
      return 'available';
    case UserStatus.AWAY:
      return 'away';
    case UserStatus.BUSY:
      return 'busy';
    case UserStatus.OFFLINE:
      throw new OfflineStatusNotAllowedException();
  }
}

export class ProfileService implements IProfileService {
```

4. Substituir:

```ts
    private readonly users: IUserRepository = userRepository,
    private readonly avatar: IAvatarService = avatarService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}

```

por:

```ts
    private readonly users: IUserRepository = userRepository,
    private readonly avatar: IAvatarService = avatarService,
    private readonly events: Pick<EventBus, 'publish'> = eventBus,
    private readonly presence: Pick<IPresenceService, 'setManualStatus'> = presenceService
  ) {}

```

5. Substituir:

```ts
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    await this.users.updateStatus(userId, status);
    logger.debug('User status updated', { userId, status });
  }

  async setOnline(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.ONLINE);
  }

  async setOffline(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.OFFLINE);
    await this.users.updateLastSeen(userId);
  }

  async setAway(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.AWAY);
  }

  async setBusy(userId: string): Promise<void> {
    await this.users.updateStatus(userId, UserStatus.BUSY);
  }

```

por:

```ts
  }

  /**
   * Endpoints legados (`PUT /profile/status`, `POST /profile/online|offline`): delegam ao status
   * manual da presença (`online` → `available`, `away`, `busy`) e não gravam mais `users.status`.
   * `offline` responde 400 — o usuário fica offline ao desconectar.
   */
  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    const manual = toManualStatus(status);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ProfileNotFoundException();
    }

    await this.presence.setManualStatus(userId, manual);
    logger.debug('User status updated', { userId, status: manual });
  }

  async setOnline(userId: string): Promise<void> {
    await this.presence.setManualStatus(userId, 'available');
  }

  setOffline(_userId: string): Promise<void> {
    return Promise.reject(new OfflineStatusNotAllowedException());
  }

  async setAway(userId: string): Promise<void> {
    await this.presence.setManualStatus(userId, 'away');
  }

  async setBusy(userId: string): Promise<void> {
    await this.presence.setManualStatus(userId, 'busy');
  }

```

Em `src/modules/user/services/index.ts`, substituir:

```ts
  DisplayNameTooLongException,
  InvalidAvatarUrlException,
  ProfileNotFoundException,
  ProfileService,
```

por:

```ts
  DisplayNameTooLongException,
  InvalidAvatarUrlException,
  OfflineStatusNotAllowedException,
  ProfileNotFoundException,
  ProfileService,
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/errors/profile.errors.test.ts tests/unit/modules/user/services/ProfileService.events.test.ts tests/unit/modules/user/services/ProfileService.test.ts tests/unit/modules/user/services/index.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/modules/user/errors/index.ts src/modules/user/errors/profile.errors.ts src/modules/user/services/ProfileService.ts src/modules/user/services/index.ts tests/unit/modules/user/errors/profile.errors.test.ts tests/unit/modules/user/services/ProfileService.events.test.ts tests/unit/modules/user/services/ProfileService.test.ts tests/unit/modules/user/services/index.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/modules/user/errors/index.ts \
  src/modules/user/errors/profile.errors.ts \
  src/modules/user/services/ProfileService.ts \
  src/modules/user/services/index.ts \
  tests/unit/modules/user/errors/profile.errors.test.ts \
  tests/unit/modules/user/services/ProfileService.events.test.ts \
  tests/unit/modules/user/services/ProfileService.test.ts \
  tests/unit/modules/user/services/index.test.ts
git commit -m "♻️ refactor: endpoints legados de status delegam à presença"
```


---

### Task 15: Wiring: hooks, ponte, timers, invalidação no bootstrap e `beforeClose`

**Files:**
- Modify: `src/bootstrap.ts`
- Modify: `src/server.ts`
- Modify: `src/serverLifecycle.ts`
- Modify: `tests/unit/serverLifecycle.test.ts`

**Interfaces:**
- Consumes: `createPresenceRealtime`, `registerPresenceBridge` (Tasks 10–11), `register{User,Chat,Presence}CacheListeners` (Tasks 4, 6, 9).
- Produces: `StopHandlerDeps.beforeClose?: () => void` (roda primeiro; falha é logada, o resto do encerramento continua e o código de saída vira 1).

`server.ts` cria a integração da presença, passa os hooks ao `createRealtimeServer`, registra a ponte e liga os timers; o encerramento para timers e ponte antes do `io.close()` (novo `beforeClose` do `createStopHandler`). O `bootstrap()` registra os três conjuntos de listeners de invalidação do cache. `server.ts` e `bootstrap.ts` estão fora da cobertura (wiring de processo); o `beforeClose` é testado.

- [ ] **Step 1: Escrever o teste (falha hoje)**

Em `tests/unit/serverLifecycle.test.ts`, substituir:

```ts
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Falha ao fechar o servidor realtime', closeError);
    expect(exit).toHaveBeenCalledWith(1);
  });
```

por:

```ts
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Falha ao fechar o servidor realtime', closeError);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('beforeClose roda antes de fechar o realtime', async () => {
    const order: string[] = [];
    const realtime = {
      close: jest.fn(async () => {
        order.push('realtime.close');
      }),
    };
    const beforeClose = jest.fn(() => {
      order.push('beforeClose');
    });
    const exit = jest.fn();

    createStopHandler({
      realtime,
      beforeClose,
      shutdown: jest.fn().mockResolvedValue(undefined),
      exit,
      logger: makeLogger(),
    })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(order).toEqual(['beforeClose', 'realtime.close']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('beforeClose falha: loga, fecha o resto mesmo assim e sai com 1', async () => {
    const realtime = { close: jest.fn().mockResolvedValue(undefined) };
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const logger = makeLogger();
    const failure = new Error('timer travado');

    createStopHandler({
      realtime,
      beforeClose: () => {
        throw failure;
      },
      shutdown,
      exit,
      logger,
    })('SIGTERM');
    await flushPromises();
    await flushPromises();

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao parar os serviços antes do encerramento',
      failure
    );
    expect(realtime.close).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/.bin/jest tests/unit/serverLifecycle.test.ts --coverage=false`

Expected: FAIL — 2 testes (`beforeClose` ignorado).

- [ ] **Step 3: Implementar**

Em `src/bootstrap.ts` (2 trechos, na ordem):

1. Substituir:

```ts
  disconnectElasticsearch,
} from './shared/database';
import { registerChatListeners } from './modules/chat/listeners';

export async function bootstrap(): Promise<void> {
```

por:

```ts
  disconnectElasticsearch,
} from './shared/database';
import { registerChatCacheListeners, registerChatListeners } from './modules/chat/listeners';
import { registerPresenceCacheListeners } from './modules/presence/listeners';
import { registerUserCacheListeners } from './modules/user/listeners';

export async function bootstrap(): Promise<void> {
```

2. Substituir:

```ts
  await connectElasticsearch();
  registerChatListeners();
}

```

por:

```ts
  await connectElasticsearch();
  registerChatListeners();
  // Invalidação do cache Redis por evento (perfis, bloqueios, participantes, audiência).
  registerUserCacheListeners();
  registerChatCacheListeners();
  registerPresenceCacheListeners();
}

```

Em `src/server.ts` (2 trechos, na ordem):

1. Substituir:

```ts
import app from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createRealtimeServer, type TrustProxyFn } from './modules/realtime';
import {
```

por:

```ts
import app from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createPresenceRealtime, registerPresenceBridge } from './modules/presence';
import { createRealtimeServer, type TrustProxyFn } from './modules/realtime';
import {
```

2. Substituir:

```ts
    // Socket.IO compartilha o servidor HTTP (e a porta) da API Express.
    const httpServer = createServer(app);
    // Mesmo `trust proxy` do Express: o IP do socket segue a regra do `req.ip`.
    const realtime = createRealtimeServer(httpServer, {
      trustProxy: app.get('trust proxy fn') as TrustProxyFn,
    });

    const stop = createStopHandler({
      realtime,
      shutdown,
      exit: (code: number): void => {
```

por:

```ts
    // Socket.IO compartilha o servidor HTTP (e a porta) da API Express.
    const httpServer = createServer(app);
    // Presença: hooks de conexão/desconexão (o realtime não conhece o presence).
    const presence = createPresenceRealtime();
    // Mesmo `trust proxy` do Express: o IP do socket segue a regra do `req.ip`.
    const realtime = createRealtimeServer(httpServer, {
      trustProxy: app.get('trust proxy fn') as TrustProxyFn,
      onConnection: [presence.onConnection],
      onDisconnect: [presence.onDisconnect],
    });
    const unregisterPresenceBridge = registerPresenceBridge(realtime.io);
    presence.start();

    const stop = createStopHandler({
      realtime,
      // Heartbeat/varredura param antes do `io.close()`: as entradas deste nó expiram em 30 s.
      beforeClose: () => {
        presence.stop();
        unregisterPresenceBridge();
      },
      shutdown,
      exit: (code: number): void => {
```

Em `src/serverLifecycle.ts` (4 trechos, na ordem):

1. Substituir:

```ts
export interface StopHandlerDeps {
  realtime: Pick<RealtimeServerHandle, 'close'>;
  shutdown: () => Promise<void>;
  exit: (code: number) => void;
```

por:

```ts
export interface StopHandlerDeps {
  realtime: Pick<RealtimeServerHandle, 'close'>;
  /**
   * Roda antes de fechar o realtime: para o que não pode seguir durante o encerramento (timers
   * de heartbeat/varredura da presença e a ponte dela no EventBus).
   */
  beforeClose?: () => void;
  shutdown: () => Promise<void>;
  exit: (code: number) => void;
```

2. Substituir:

```ts
 */
async function closeGracefully(
  deps: Pick<StopHandlerDeps, 'realtime' | 'shutdown' | 'logger'>
): Promise<number> {
  const { realtime, shutdown, logger } = deps;
  let hadError = false;

  try {
```

por:

```ts
 */
async function closeGracefully(
  deps: Pick<StopHandlerDeps, 'realtime' | 'beforeClose' | 'shutdown' | 'logger'>
): Promise<number> {
  const { realtime, beforeClose, shutdown, logger } = deps;
  let hadError = false;

  try {
    beforeClose?.();
  } catch (error) {
    hadError = true;
    logger.error('Falha ao parar os serviços antes do encerramento', toError(error));
  }

  try {
```

3. Substituir:

```ts
 */
export function createStopHandler(deps: StopHandlerDeps): StopHandler {
  const { realtime, shutdown, exit, logger, timeoutMs = SHUTDOWN_TIMEOUT_MS } = deps;
  let stopping = false;

```

por:

```ts
 */
export function createStopHandler(deps: StopHandlerDeps): StopHandler {
  const { realtime, beforeClose, shutdown, exit, logger, timeoutMs = SHUTDOWN_TIMEOUT_MS } = deps;
  let stopping = false;

```

4. Substituir:

```ts
    timer.unref();

    void closeGracefully({ realtime, shutdown, logger }).then((code) => {
      if (settled) {
        return;
```

por:

```ts
    timer.unref();

    void closeGracefully({ realtime, beforeClose, shutdown, logger }).then((code) => {
      if (settled) {
        return;
```

- [ ] **Step 4: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/unit/serverLifecycle.test.ts --coverage=false`

Expected: PASS.

- [ ] **Step 5: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write src/bootstrap.ts src/server.ts src/serverLifecycle.ts tests/unit/serverLifecycle.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 6: Commit**

```bash
git add src/bootstrap.ts \
  src/server.ts \
  src/serverLifecycle.ts \
  tests/unit/serverLifecycle.test.ts
git commit -m "✨ feat: liga a presença e a invalidação do cache no servidor"
```


---

### Task 16: Integração ponta a ponta com `socket.io-client`

**Files:**
- Create: `tests/feature/modules/presence/presence.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1–15.

Servidor HTTP real em porta efêmera + `createRealtimeServer` com os hooks da presença + ponte + timers curtos (TTL 400 ms, heartbeat 100 ms, varredura 150 ms), `PresenceService`, `ConversationService` e cache reais sobre o `FakeRedis`, repositórios do chat em memória, módulo user e auth falsos. Cobre spec §8: duas abas, aviso em < 3 s, snapshot, status persistente após reconectar (socket e REST), bloqueio, conversa 1:1 nova, heartbeat + varredura de nó que caiu, contatos online e os endpoints legados. Este task só acrescenta o teste: o comportamento já existe (Tasks 1–15), então ele passa de primeira — se algo falhar, corrigir com TDD na task de origem.

- [ ] **Step 1: Escrever o teste de integração**

Criar `tests/feature/modules/presence/presence.test.ts`:

```ts
// Integração da presença: servidor HTTP real em porta efêmera + createRealtimeServer com os hooks
// da presença + ponte + socket.io-client. PresenceService, ConversationService e o cache reais
// sobre um Redis em memória (FakeRedis) e repositórios do chat em memória; módulo user e auth
// falsos. TTL/heartbeat/varredura curtos injetados. Sem Docker e sem .env.
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';

const PRESENCE_TTL_MS = 400;
const HEARTBEAT_MS = 100;
const SWEEP_MS = 150;

// Módulo user em memória. Funções simples (não jest.fn): resetMocks:true apagaria implementações.
const mockUsers = new Set<string>([ANA, BOB, CAROL, DAVE]);
const mockLastSeen = new Map<string, Date>();
const mockContacts = new Set<string>(); // "<dono>:<contato>"
const mockBlocks = new Set<string>(); // "<quem bloqueou>:<bloqueado>"
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
        lastSeenAt: mockLastSeen.get(id) ?? null,
      })),
  updateLastSeen: async (id: string, at: Date): Promise<void> => {
    mockLastSeen.set(id, at);
  },
};
const mockBlockedEither = (a: string, b: string): boolean =>
  mockBlocks.has(`${a}:${b}`) || mockBlocks.has(`${b}:${a}`);
const mockContactService = {
  isBlockedByEither: async (a: string, b: string): Promise<boolean> => mockBlockedEither(a, b),
  listWatchers: async (userId: string): Promise<string[]> =>
    [...mockContacts].filter((row) => row.endsWith(`:${userId}`)).map((row) => row.split(':')[0]!),
  listContactIds: async (userId: string): Promise<string[]> =>
    [...mockContacts]
      .filter((row) => row.startsWith(`${userId}:`))
      .map((row) => row.split(':')[1]!),
  listBlockedEitherIds: async (userId: string): Promise<string[]> =>
    [...mockUsers].filter((other) => mockBlockedEither(userId, other)),
  getContactsByIds: async (userId: string, ids: string[]): Promise<unknown[]> =>
    ids
      .filter((id) => mockContacts.has(`${userId}:${id}`))
      .map((id) => ({
        id: `row-${id}`,
        userId,
        contactId: id,
        nickname: null,
        contact: { id, username: `user_${id.slice(0, 4)}`, displayName: null },
      })),
};

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/shared/database/redis', () => {
  const { FakeRedis } = jest.requireActual('../../../support/redis/fakeRedis');
  return { redis: new FakeRedis() };
});
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
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
import { registerChatCacheListeners } from '@/modules/chat/listeners';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { registerPresenceCacheListeners } from '@/modules/presence/listeners';
import { createPresenceRealtime, registerPresenceBridge } from '@/modules/presence/realtime';
import { presenceRoutes } from '@/modules/presence/routes';
import { PresenceService } from '@/modules/presence/services';
import { createRealtimeServer, type RealtimeServerHandle } from '@/modules/realtime/server';
import type { AckResponse, PresenceUpdatePayload } from '@/modules/realtime/types';
import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { profileRoutes } from '@/modules/user/routes/profile.routes';
import { redis } from '@/shared/database/redis';
import { eventBus } from '@/shared/event-bus';
import { initLogger, LogCategory, LogLevel } from '@/shared/logger';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { UserEvents } from '@/shared/types';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';
import type { FakeRedis } from '../../../support/redis/fakeRedis';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const fakeRedis = redis as unknown as FakeRedis;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Handshake: o token é o próprio id do usuário (UUID).
const fakeAuth = {
  validateAccessToken: (token: string): { valid: boolean; userId?: string } =>
    UUID.test(token) ? { valid: true, userId: token } : { valid: false },
};

type Update = PresenceUpdatePayload & { lastSeenAt: string | null };

describe('Presença — integração com socket.io-client', () => {
  const presence = new PresenceService({ ttlMs: PRESENCE_TTL_MS });
  const presenceRealtime = createPresenceRealtime({
    presence,
    heartbeatMs: HEARTBEAT_MS,
    sweepMs: SWEEP_MS,
  });
  let app: express.Application;
  let httpServer: HttpServer;
  let realtime: RealtimeServerHandle;
  let url: string;
  let stopListeners: (() => void)[] = [];
  const clients: ClientSocket[] = [];

  async function connected(userId: string): Promise<ClientSocket> {
    const socket = connect(url, {
      auth: { token: userId },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
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

  /** Tudo que chegar em `event` durante `ms` (para provar que NÃO chegou). */
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

  const update = (userId: string, state: string) => (payload: Update) =>
    payload.userId === userId && payload.state === state;

  /** Espera até `condition` valer (polling de 10 ms, falha em 2 s). */
  async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 2000;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error('condição não satisfeita em 2s');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const connectionKeys = (): string[] =>
    fakeRedis.keys().filter((key) => key.startsWith('presence:conns:'));

  async function addContact(owner: string, target: string): Promise<void> {
    mockContacts.add(`${owner}:${target}`);
    await eventBus.publish(UserEvents.CONTACT_ADDED, { userId: owner, contactId: target });
  }

  async function block(userId: string, target: string): Promise<void> {
    mockBlocks.add(`${userId}:${target}`);
    await eventBus.publish(UserEvents.BLOCKED, { userId, blockedUserId: target });
  }

  async function unblock(userId: string, target: string): Promise<void> {
    mockBlocks.delete(`${userId}:${target}`);
    await eventBus.publish(UserEvents.UNBLOCKED, { userId, unblockedUserId: target });
  }

  /** Desconecta a única aba do usuário e espera o servidor registrar o offline. */
  async function disconnect(socket: ClientSocket, userId: string): Promise<void> {
    socket.disconnect();
    await waitFor(() => !connectionKeys().includes(`presence:conns:${userId}`));
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
    app.use('/api/presence', presenceRoutes);
    app.use('/api/contacts', contactRoutes);
    app.use('/api/profile', profileRoutes);
    app.use(errorHandler);

    httpServer = createServer(app);
    realtime = createRealtimeServer(httpServer, {
      auth: fakeAuth,
      env: { NODE_ENV: 'test' },
      onConnection: [presenceRealtime.onConnection],
      onDisconnect: [presenceRealtime.onDisconnect],
    });
    stopListeners = [
      registerPresenceBridge(realtime.io, { presence }),
      registerPresenceCacheListeners(),
      registerChatCacheListeners(),
    ];
    presenceRealtime.start();
    await new Promise<void>((resolve) => {
      httpServer.listen(0, resolve);
    });
    url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;
  });

  afterEach(async () => {
    clients.splice(0).forEach((socket) => socket.disconnect());
    // Os hooks de desconexão terminam antes do próximo teste (sem eventos atrasados).
    await waitFor(() => connectionKeys().length === 0);
    fakeRedis.flushall();
    store.reset();
    mockContacts.clear();
    mockBlocks.clear();
    mockLastSeen.clear();
  });

  afterAll(async () => {
    presenceRealtime.stop();
    stopListeners.forEach((stop) => {
      stop();
    });
    await realtime.close();
  });

  it('duas abas: online uma vez; offline (com lastSeenAt) só quando as duas fecham', async () => {
    await addContact(BOB, ANA);
    const bob = await connected(BOB);

    const online = next<Update>(bob, 'presence:update', update(ANA, 'online'));
    const startedAt = Date.now();
    const tab1 = await connected(ANA);
    await online;
    expect(Date.now() - startedAt).toBeLessThan(3000);

    const quiet = collect<Update>(bob, 'presence:update', 300);
    const tab2 = await connected(ANA);
    tab1.disconnect();
    expect(await quiet).toEqual([]);

    const offline = next<Update>(bob, 'presence:update', update(ANA, 'offline'));
    tab2.disconnect();
    const received = await offline;

    expect(received.lastSeenAt).toBe(mockLastSeen.get(ANA)?.toISOString());
    expect(connectionKeys()).toEqual([`presence:conns:${BOB}`]);
  });

  it('snapshot ao conectar e presence:set chegam ao contato em menos de 3 s (e às outras abas)', async () => {
    await addContact(BOB, ANA);
    const ana = await connected(ANA);
    const anaOtherTab = await connected(ANA);

    const bob = connect(url, { auth: { token: BOB }, transports: ['websocket'], forceNew: true });
    clients.push(bob);
    const snapshot = await next<{ states: Update[] }>(bob, 'presence:snapshot');
    expect(snapshot.states).toEqual([{ userId: ANA, state: 'online', lastSeenAt: null }]);

    const seenByBob = next<Update>(bob, 'presence:update', update(ANA, 'busy'));
    const seenByOtherTab = next<Update>(anaOtherTab, 'presence:update', update(ANA, 'busy'));
    const startedAt = Date.now();
    const ack = (await ana.emitWithAck('presence:set', { status: 'busy' })) as AckResponse<unknown>;

    expect(ack).toEqual({ ok: true, data: { state: 'busy' } });
    await seenByBob;
    await seenByOtherTab;
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it('status manual persiste após reconectar (REST e reconexão)', async () => {
    await addContact(BOB, ANA);
    const bob = await connected(BOB);
    const ana = await connected(ANA);

    const status = await request(app)
      .put('/api/presence/status')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ status: 'away' });
    expect(status.status).toBe(204);
    await disconnect(ana, ANA);

    const back = next<Update>(bob, 'presence:update', update(ANA, 'away'));
    await connected(ANA);
    await back;

    const query = await request(app)
      .get(`/api/presence?userIds=${ANA}`)
      .set('Authorization', `Bearer ${BOB}`);
    expect(query.body.data.items).toEqual([{ userId: ANA, state: 'away', lastSeenAt: null }]);
  });

  it('bloqueio: cada lado vê o outro offline na hora, deixa de receber avisos e o REST esconde', async () => {
    const created = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ userId: BOB });
    expect(created.status).toBe(201);
    const bob = await connected(BOB);
    const ana = await connected(ANA);

    const hiddenForBob = next<Update>(bob, 'presence:update', update(ANA, 'offline'));
    const hiddenForAna = next<Update>(ana, 'presence:update', update(BOB, 'offline'));
    await block(ANA, BOB);
    expect((await hiddenForBob).lastSeenAt).toBeNull();
    await hiddenForAna;

    const silence = collect<Update>(bob, 'presence:update', 300);
    await ana.emitWithAck('presence:set', { status: 'busy' });
    expect(await silence).toEqual([]);

    const query = await request(app)
      .get(`/api/presence?userIds=${ANA}`)
      .set('Authorization', `Bearer ${BOB}`);
    expect(query.body.data.items).toEqual([{ userId: ANA, state: 'offline', lastSeenAt: null }]);

    const revealed = next<Update>(bob, 'presence:update', update(ANA, 'busy'));
    await unblock(ANA, BOB);
    await revealed;
  });

  it('conversa 1:1 nova passa a propagar a presença entre os dois', async () => {
    const ana = await connected(ANA);
    const carol = await connected(CAROL);

    const before = collect<Update>(carol, 'presence:update', 200);
    await ana.emitWithAck('presence:set', { status: 'away' });
    expect(await before).toEqual([]);

    await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ userId: CAROL });
    const after = next<Update>(carol, 'presence:update', update(ANA, 'busy'));
    await ana.emitWithAck('presence:set', { status: 'busy' });
    await after;
  });

  it('heartbeat mantém quem está conectado; a varredura derruba conexão de nó que caiu', async () => {
    await addContact(BOB, ANA);
    await addContact(BOB, DAVE);
    const bob = await connected(BOB);
    await connected(ANA);

    // "Nó que caiu": uma conexão registrada que nunca recebe heartbeat.
    const daveOnline = next<Update>(bob, 'presence:update', update(DAVE, 'online'));
    await presence.connect(DAVE, 'dead-node:socket-1');
    await daveOnline;

    const daveOffline = next<Update>(bob, 'presence:update', update(DAVE, 'offline'));
    const anaUpdates = collect<Update>(bob, 'presence:update', PRESENCE_TTL_MS * 2);
    await daveOffline;

    expect((await anaUpdates).filter((payload) => payload.userId === ANA)).toEqual([]);
    expect((await presence.getStates([ANA])).get(ANA)?.state).toBe('online');
  });

  it('GET /api/contacts/online lista só os contatos conectados', async () => {
    await addContact(BOB, ANA);
    await addContact(BOB, CAROL);
    await connected(ANA);

    const response = await request(app)
      .get('/api/contacts/online')
      .set('Authorization', `Bearer ${BOB}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((c: { contactId: string; presence: unknown }) => [
        c.contactId,
        c.presence,
      ])
    ).toEqual([[ANA, { state: 'online', lastSeenAt: null }]]);
  });

  it('endpoints legados de status delegam à presença; offline responde 400', async () => {
    await addContact(BOB, ANA);
    const bob = await connected(BOB);
    const ana = await connected(ANA);
    await ana.emitWithAck('presence:set', { status: 'busy' });

    const back = next<Update>(bob, 'presence:update', update(ANA, 'online'));
    const online = await request(app)
      .post('/api/profile/online')
      .set('Authorization', `Bearer ${ANA}`);
    expect(online.status).toBe(200);
    await back;

    const offline = await request(app)
      .post('/api/profile/offline')
      .set('Authorization', `Bearer ${ANA}`);
    const statusOffline = await request(app)
      .put('/api/profile/status')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ status: 'offline' });
    expect([offline.status, statusOffline.status]).toEqual([400, 400]);
    expect(offline.body.error.message).toBe(
      'Não é possível definir offline manualmente: use a desconexão'
    );
  });
});
```

- [ ] **Step 2: Rodar os testes da task**

Run: `node node_modules/.bin/jest tests/feature/modules/presence/presence.test.ts --coverage=false`

Expected: PASS. Rode mais 4 vezes seguidas (estável) e uma vez com `--detectOpenHandles` (termina sozinho, sem listar handles).

- [ ] **Step 3: Verificação completa (formatar antes)**

```bash
node node_modules/.bin/prettier --write tests/feature/modules/presence/presence.test.ts
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 4: Commit**

```bash
git add tests/feature/modules/presence/presence.test.ts
git commit -m "✅ test: integração da presença com socket.io-client"
```


---

### Task 17: Cliente demo: seletor de status e indicadores de presença

**Files:**
- Modify: `public/demo/app.js`
- Modify: `public/demo/index.html`
- Modify: `public/demo/styles.css`

**Interfaces:**
- Consumes: `presence:set`, `presence:snapshot`, `presence:update`, `GET /api/presence` (Tasks 10–12).

Seletor de status no cabeçalho (`presence:set`), ponto colorido por conversa 1:1 (online/ausente/ocupado/offline) e "visto por último" no cabeçalho da conversa aberta; estado inicial pelo `presence:snapshot`, mudanças pelo `presence:update` (o próprio status vindo de outra aba atualiza o seletor) e, para parceiros que o snapshot não trouxe, `GET /api/presence`. Só `textContent` para dados do usuário.

- [ ] **Step 1: Alterar os três arquivos do cliente demo**

Em `public/demo/app.js` (7 trechos, na ordem):

1. Substituir:

```js
    lastRefreshAt: 0,
    refreshTimer: null,
  };

  // Sessão inválida (401 no REST, token expirado ou sessões revogadas): limpa e volta ao login.
```

por:

```js
    lastRefreshAt: 0,
    refreshTimer: null,
    presence: new Map(), // userId → { state, lastSeenAt } (snapshot + presence:update)
  };

  const PRESENCE_LABELS = { online: 'online', away: 'ausente', busy: 'ocupado', offline: 'offline' };

  // Sessão inválida (401 no REST, token expirado ou sessões revogadas): limpa e volta ao login.
```

2. Substituir:

```js
  }

  function participantName(userId) {
    const participant = state.current?.participants.find((p) => p.id === userId);
```

por:

```js
  }

  function presenceOf(userId) {
    return state.presence.get(userId) ?? { state: 'offline', lastSeenAt: null };
  }

  // "online", "ausente", "ocupado" ou "visto por último em 26/09 14:05" (vai para textContent).
  function presenceText(userId) {
    const { state: current, lastSeenAt } = presenceOf(userId);
    if (current !== 'offline' || !lastSeenAt) {
      return PRESENCE_LABELS[current];
    }
    const time = new Date(lastSeenAt).toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `visto por último em ${time}`;
  }

  function renderPresence() {
    renderConversations();
    const other = state.current?.type === 'direct' ? otherParticipant(state.current) : null;
    $('conversation-presence').textContent = other ? presenceText(other.id) : '';
  }

  function participantName(userId) {
    const participant = state.current?.participants.find((p) => p.id === userId);
```

3. Substituir:

```js
    $('chat-view').hidden = false;
    $('logout').hidden = false;
    $('me').textContent = state.user.displayName ?? state.user.username;
    connectSocket();
```

por:

```js
    $('chat-view').hidden = false;
    $('logout').hidden = false;
    $('status-label').hidden = false;
    $('me').textContent = state.user.displayName ?? state.user.username;
    connectSocket();
```

4. Substituir:

```js

  $('logout').addEventListener('click', endSession);

  // ---------- socket ----------
```

por:

```js

  $('logout').addEventListener('click', endSession);

  // Status manual (persiste entre reconexões); offline é só a desconexão.
  $('status').addEventListener('change', (event) => {
    const status = event.target.value;
    state.socket?.emit('presence:set', { status }, (ack) => {
      if (!ack.ok) {
        window.alert(`Falha ao mudar o status: ${ack.error.message}`);
      }
    });
  });

  // ---------- socket ----------
```

5. Substituir:

```js
        $('typing').textContent = isTyping ? `${participantName(userId)} está digitando…` : '';
      }
    });
    socket.on('conversation:new', scheduleConversationsRefresh);
```

por:

```js
        $('typing').textContent = isTyping ? `${participantName(userId)} está digitando…` : '';
      }
    });
    // Presença: estado de quem o usuário observa ao conectar; depois, só as mudanças.
    socket.on('presence:snapshot', ({ states }) => {
      states.forEach((entry) => state.presence.set(entry.userId, entry));
      renderPresence();
    });
    socket.on('presence:update', (entry) => {
      if (entry.userId === state.user.id) {
        // Status mudado em outra aba deste usuário.
        $('status').value = entry.state === 'online' ? 'available' : entry.state;
        return;
      }
      state.presence.set(entry.userId, entry);
      renderPresence();
    });
    socket.on('conversation:new', scheduleConversationsRefresh);
```

6. Substituir:

```js
    state.conversations = page.items;
    renderConversations();
  }

  function renderConversations() {
    $('conversations').replaceChildren(
      ...state.conversations.map((conversation) => {
        const item = el('li', state.current?.id === conversation.id ? 'active' : '', conversationTitle(conversation));
        item.addEventListener('click', () => void openConversation(conversation.id));
        return item;
```

por:

```js
    state.conversations = page.items;
    renderConversations();
    void loadMissingPresence();
  }

  // Parceiros 1:1 que o snapshot não trouxe (ex.: conversa criada depois de conectar).
  async function loadMissingPresence() {
    const ids = state.conversations
      .filter((conversation) => conversation.type === 'direct')
      .map((conversation) => otherParticipant(conversation)?.id)
      .filter((id) => id && !state.presence.has(id))
      .slice(0, 100);
    if (ids.length === 0) {
      return;
    }
    const { items } = await api('GET', `/presence?userIds=${ids.join(',')}`);
    items.forEach((entry) => state.presence.set(entry.userId, entry));
    renderPresence();
  }

  function renderConversations() {
    $('conversations').replaceChildren(
      ...state.conversations.map((conversation) => {
        const item = el('li', state.current?.id === conversation.id ? 'active' : '');
        const other = conversation.type === 'direct' ? otherParticipant(conversation) : null;
        if (other) {
          const dot = el('span', `dot ${presenceOf(other.id).state}`);
          dot.title = presenceText(other.id);
          item.append(dot);
        }
        item.append(el('span', '', conversationTitle(conversation)));
        item.addEventListener('click', () => void openConversation(conversation.id));
        return item;
```

7. Substituir:

```js
    $('conversation').hidden = false;
    $('conversation-title').textContent = conversationTitle(state.current);
    $('typing').textContent = '';
    renderMessages(true);
```

por:

```js
    $('conversation').hidden = false;
    $('conversation-title').textContent = conversationTitle(state.current);
    renderPresence();
    $('typing').textContent = '';
    renderMessages(true);
```

Em `public/demo/index.html` (2 trechos, na ordem):

1. Substituir:

```html
      <span id="connection" class="badge">desconectado</span>
      <span id="me"></span>
      <button id="logout" type="button" hidden>Sair</button>
    </header>
```

por:

```html
      <span id="connection" class="badge">desconectado</span>
      <span id="me"></span>
      <label id="status-label" hidden>
        Status
        <select id="status">
          <option value="available">Disponível</option>
          <option value="away">Ausente</option>
          <option value="busy">Ocupado</option>
        </select>
      </label>
      <button id="logout" type="button" hidden>Sair</button>
    </header>
```

2. Substituir:

```html
      <section id="conversation" hidden>
        <h2 id="conversation-title"></h2>
        <button id="load-more" type="button" hidden>Carregar mais</button>
        <ol id="messages"></ol>
```

por:

```html
      <section id="conversation" hidden>
        <h2 id="conversation-title"></h2>
        <p id="conversation-presence" class="presence-line"></p>
        <button id="load-more" type="button" hidden>Carregar mais</button>
        <ol id="messages"></ol>
```

Em `public/demo/styles.css`, substituir:

```css
#message-form input { flex: 1; }
#load-more { align-self: center; margin-bottom: 0.5rem; background: #6b7280; }
```

por:

```css
#message-form input { flex: 1; }
#load-more { align-self: center; margin-bottom: 0.5rem; background: #6b7280; }
header label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
select { padding: 0.3rem; border-radius: 0.25rem; font: inherit; }
.dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; margin-right: 0.4rem; background: #9ca3af; }
.dot.online { background: #1e7d34; }
.dot.away { background: #d97706; }
.dot.busy { background: #b3261e; }
.presence-line { margin: 0 0 0.5rem; font-size: 0.8rem; color: #6b7280; min-height: 1em; }
```

- [ ] **Step 2: Checar sintaxe e o teste do app que serve a página**

```bash
node --check public/demo/app.js
node node_modules/.bin/jest tests/unit/app.test.ts --coverage=false
```

Expected: `node --check` sem saída (código 0); `tests/unit/app.test.ts` passa (a página continua servida com o `<script src="/socket.io/socket.io.js">`). A verificação visual fica no Step 10 da Task 18 (opcional, com a stack real).

- [ ] **Step 3: Verificação completa**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/jest --silent --coverageReporters=text-summary
```

Expected: tudo verde, 100%.

- [ ] **Step 4: Commit**

```bash
git add public/demo/app.js \
  public/demo/index.html \
  public/demo/styles.css
git commit -m "✨ feat: presença no cliente demo (status manual e indicadores)"
```


---

### Task 18: Verificação completa, prova "sem Redis real", smoke na stack real, READMEs, SRS local e PR

**Files:**
- Modify: `README.md`, `README.pt-BR.md`
- Modify (local, NÃO commitar): `.github/SRS.md`
- Create (fora do repo, no seu diretório de scratchpad): `redis-guard.cjs`, `smoke-presence.sh`, `smoke-presence-ana.cjs`, `smoke-presence-bob.cjs`, `smoke-presence-crash.cjs`, `pr-body.md`

Defina antes: `export SCRATCH=<seu diretório de scratchpad da sessão>` (arquivos temporários nunca vão para o repo).

- [ ] **Step 1: Suíte completa + lint + format + tipos + build + open handles**

```bash
node node_modules/.bin/jest --silent --coverageReporters=text-summary
node node_modules/.bin/eslint src
npm run format:check
node node_modules/.bin/tsc --noEmit
npm run build && rm -rf dist
node node_modules/.bin/jest tests/feature/modules/presence tests/feature/modules/realtime tests/feature/modules/chat --coverage=false --detectOpenHandles
```

Expected: todas as suítes passam (esperado ≈ 2.776 testes em 185 suítes — anote os números exatos impressos para os READMEs); resumo 100% statements/branches/functions/lines; eslint código 0; Prettier "All matched files use Prettier code style!"; `tsc` e `build` sem erros; a rodada com `--detectOpenHandles` termina sozinha, sem listar handles.

- [ ] **Step 2: Conferir 100% nos arquivos novos/alterados**

```bash
node node_modules/.bin/jest --coverage --coverageReporters=text \
  --collectCoverageFrom='src/modules/presence/**/*.ts' \
  --collectCoverageFrom='src/shared/cache/*.ts' \
  --collectCoverageFrom='src/modules/user/**/*.ts' \
  --collectCoverageFrom='src/modules/chat/**/*.ts' \
  --collectCoverageFrom='src/modules/realtime/**/*.ts' \
  --collectCoverageFrom='src/serverLifecycle.ts' \
  --collectCoverageFrom='src/app.ts' \
  --coverageThreshold='{}'
```

Expected: 100% em todas as colunas de todos os arquivos listados. Faltou algo → acrescentar teste no arquivo de teste da task que criou o código e commitar como `✅ test: …`.

- [ ] **Step 3: Provar que nenhum teste toca um Redis de verdade**

Confira que a porta 16998 está livre (`ss -ltn | grep ':16998 '` sem saída). Criar `$SCRATCH/redis-guard.cjs`:

```js
// Conta conexões TCP: qualquer teste que use o Redis "de verdade" da config cai aqui.
const net = require('net');
let count = 0;
net
  .createServer((socket) => {
    count += 1;
    console.log(`CONNECTION ${count}`);
    socket.destroy();
  })
  .listen(16998, '127.0.0.1', () => console.log('guard listening'));
```

```bash
node "$SCRATCH/redis-guard.cjs" > "$SCRATCH/redis-guard.log" 2>&1 &
echo $! > "$SCRATCH/redis-guard.pid"
REDIS_HOST=127.0.0.1 REDIS_PORT=16998 node node_modules/.bin/jest --silent --coverage=false
kill "$(cat "$SCRATCH/redis-guard.pid")"
cat "$SCRATCH/redis-guard.log"
```

Expected: a suíte inteira passa e o log tem só `guard listening` — nenhuma linha `CONNECTION` (nenhum teste abriu conexão com o Redis da config; sem o `REDIS_PORT` elas iriam para `localhost:6379`, o Redis de outro projeto). Se aparecer `CONNECTION`, rode os arquivos de teste isoladamente para achar o culpado e injete `CacheService(new FakeRedis())` ou mocke `@/shared/database/redis` nele.

- [ ] **Step 4: Subir os bancos em portas alternativas e rodar as migrations**

```bash
set -a && source .env && set +a
export POSTGRES_HOST_PORT=15532 REDIS_HOST_PORT=16390 MONGO_HOST_PORT=27117 ELASTIC_HOST_PORT=9201 ELASTIC_TRANSPORT_HOST_PORT=9301
docker compose up -d postgres redis mongodb elasticsearch
docker compose ps
DB_HOST=localhost DB_PORT=15532 npm run db:migrate
```

Expected: `rtm-postgres`, `rtm-redis`, `rtm-mongodb`, `rtm-elasticsearch` "Up" nas portas 15532/16390/27117/9201 e as migrations aplicadas ("No migrations were executed" se já estavam — este subprojeto não cria migrations). Não subir `real-time-app` e não tocar em nenhum outro container. O `.env` só é lido (`source`), nunca escrito.

- [ ] **Step 5: Subir a app no host na porta 3100 (em background)**

Confirme antes que as portas 3100 e 3101 estão livres (`ss -ltn | grep -E ':310[01] '` sem saída) — há outros projetos rodando na máquina; não encerre processos que não são seus.

```bash
MONGO_USER_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_USER))")
MONGO_PASSWORD_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_PASSWORD))")
export APP_ENV="DB_HOST=localhost DB_PORT=15532 REDIS_HOST=localhost REDIS_PORT=16390 ELASTICSEARCH_URL=http://localhost:9201"
export MONGODB_URL="mongodb://${MONGO_USER_ENC}:${MONGO_PASSWORD_ENC}@localhost:27117/${MONGO_DB}?authSource=admin"
env $APP_ENV PORT=3100 node --import tsx src/server.ts > "$SCRATCH/rtm-app.log" 2>&1 &
echo $! > "$SCRATCH/rtm-app.pid"
```

`NODE_ENV` vem do `.env` (`development`): Redis adapter ligado, heartbeat de 15 s e varredura de 30 s reais. Aguarde a app responder (polling com a ferramenta de espera do seu ambiente, não `sleep` em primeiro plano) até `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/api/conversations` imprimir `401`. Se o processo morrer, ver `$SCRATCH/rtm-app.log`.

- [ ] **Step 6: Criar os scripts do smoke**

Criar `$SCRATCH/smoke-presence-bob.cjs` (Bob, processo separado: registra o snapshot e cada `presence:update` da Ana com a latência desde a última ação dela):

```js
// Cliente "Bob" do smoke de presença (processo separado). Uso:
//   NODE_PATH=$PWD/node_modules node smoke-presence-bob.cjs <baseUrl> <token> <anaId> <markFile>
// Registra o snapshot e cada presence:update da Ana, com a latência desde a última ação da Ana
// (instante gravado por ela em <markFile>). Fica conectado até receber SIGTERM.
const { readFileSync } = require('fs');
const { io } = require('socket.io-client');

const [baseUrl, token, anaId, markFile] = process.argv.slice(2);
const log = (...args) => console.log('[bob]', ...args);

const socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });

socket.on('connect_error', (error) => log(`connect_error=${error.message}`));
socket.on('presence:snapshot', ({ states }) => {
  const ana = states.find((entry) => entry.userId === anaId);
  log(`snapshot ana=${ana ? ana.state : 'ausente'}`);
  log('ready');
});
socket.on('presence:update', ({ userId, state, lastSeenAt }) => {
  if (userId !== anaId) {
    return;
  }
  const latency = Date.now() - Number(readFileSync(markFile, 'utf8'));
  const seen = state === 'offline' ? ` lastSeen=${lastSeenAt !== null}` : '';
  log(`update ana=${state}${seen} latency<3s=${latency < 3000}`);
});

process.on('SIGTERM', () => {
  socket.disconnect();
  process.exit(0);
});
```

Criar `$SCRATCH/smoke-presence-ana.cjs` (Ana: duas abas, status manual, desconexão/reconexão, REST, bloqueio e endpoints legados):

```js
// Cliente "Ana" do smoke de presença. Uso:
//   NODE_PATH=$PWD/node_modules node smoke-presence-ana.cjs <baseUrl> <anaToken> <bobToken> <bobId> <anaId> <markFile>
// Duas abas, status manual (socket e REST), desconexão/reconexão, bloqueio/desbloqueio e os
// endpoints legados. Antes de cada ação grava o instante em <markFile> (o Bob mede a latência).
const { writeFileSync } = require('fs');
const { io } = require('socket.io-client');

const [baseUrl, anaToken, bobToken, bobId, anaId, markFile] = process.argv.slice(2);
const log = (...args) => console.log('[ana]', ...args);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mark = () => writeFileSync(markFile, String(Date.now()));

function tab() {
  const socket = io(baseUrl, { auth: { token: anaToken }, transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function rest(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function main() {
  mark();
  const tab1 = await tab();
  log('tab1 connected');
  await wait(400);

  const tab2 = await tab();
  log('tab2 connected');
  await wait(400);

  const ownStatus = new Promise((resolve) => tab2.once('presence:update', resolve));
  mark();
  const ack = await tab1.emitWithAck('presence:set', { status: 'busy' });
  log(`set-busy-ack=${ack.ok ? ack.data.state : ack.error.code} tab2-own=${(await ownStatus).state}`);
  await wait(400);

  tab1.disconnect();
  log('tab1 closed (tab2 still open)');
  await wait(400);

  mark();
  tab2.disconnect();
  log('all tabs closed');
  await wait(400);

  mark();
  const tab3 = await tab();
  log('reconnected');
  await wait(400);

  const presence = await rest('GET', `/presence?userIds=${anaId}`, bobToken);
  log(`rest-presence-for-bob=${presence.body.data.items[0].state}`);
  const online = await rest('GET', '/contacts/online', bobToken);
  log(`contacts-online-for-bob=${online.body.data.map((c) => c.presence.state).join(',')}`);

  mark();
  const blocked = await rest('POST', '/blocks', anaToken, { userId: bobId });
  const hidden = await rest('GET', `/presence?userIds=${anaId}`, bobToken);
  const item = hidden.body.data.items[0];
  log(`blocked-status=${blocked.status} rest-for-bob-after-block=${item.state},${item.lastSeenAt}`);
  await wait(400);

  mark();
  const unblocked = await rest('DELETE', `/blocks/${bobId}`, anaToken);
  log(`unblocked-status=${unblocked.status}`);
  await wait(400);

  mark();
  const legacyOnline = await rest('POST', '/profile/online', anaToken);
  const legacyOffline = await rest('POST', '/profile/offline', anaToken);
  log(`legacy-online=${legacyOnline.status} legacy-offline=${legacyOffline.status}`);
  await wait(400);

  tab3.disconnect();
}

main().then(
  () => process.exit(0),
  (error) => {
    log(`FAIL ${error.message}`);
    process.exit(1);
  }
);
```

Criar `$SCRATCH/smoke-presence.sh` (orquestra: registra os usuários, Bob adiciona a Ana e os dois abrem uma conversa 1:1, sobe o Bob, roda a Ana, mede leituras de participantes no Postgres com e sem cache, confere as chaves no Redis e o offline do Bob ao sair):

```bash
#!/usr/bin/env bash
# Smoke da presença e do cache contra a app no host. Uso (da raiz do repositório):
#   bash smoke-presence.sh
# Variáveis: BASE (padrão http://localhost:3100), REDIS_CONTAINER (rtm-redis), PG_CONTAINER
# (rtm-postgres), REDIS_PASSWORD, POSTGRES_USER, POSTGRES_DB (lidas do ambiente).
set -euo pipefail

SCRATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE=${BASE:-http://localhost:3100}
API=$BASE/api
REDIS_CONTAINER=${REDIS_CONTAINER:-rtm-redis}
PG_CONTAINER=${PG_CONTAINER:-rtm-postgres}
SUFFIX=$(date +%s)
CT='Content-Type: application/json'
MARK="$SCRATCH_DIR/presence-mark"
export NODE_PATH="$PWD/node_modules"

j() { node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }
reg() {
  curl -s -X POST "$API/auth/register" -H "$CT" \
    -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"Password123!\",\"displayName\":\"$1\"}"
}
rcli() { docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning "$@"; }
scans() {
  docker exec "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT seq_scan + coalesce(idx_scan, 0) FROM pg_stat_user_tables WHERE relname = 'participants'"
}
# O pg_stat de um backend ocioso é publicado em até 10 s (PGSTAT_IDLE_INTERVAL): espera 11 s.
settled_scans() {
  sleep 11
  scans
}

ANA=$(reg "prana$SUFFIX")
BOB=$(reg "prbob$SUFFIX")
A_ID=$(echo "$ANA" | j 'd.data.user.id')
B_ID=$(echo "$BOB" | j 'd.data.user.id')
A_TOKEN=$(echo "$ANA" | j 'd.data.tokens.accessToken')
B_TOKEN=$(echo "$BOB" | j 'd.data.tokens.accessToken')

# Bob tem a Ana como contato e os dois têm uma conversa 1:1.
curl -s -o /dev/null -X POST "$API/contacts" -H "Authorization: Bearer $B_TOKEN" -H "$CT" \
  -d "{\"contactId\":\"$A_ID\"}"
CONV=$(curl -s -X POST "$API/conversations/direct" -H "Authorization: Bearer $A_TOKEN" -H "$CT" \
  -d "{\"userId\":\"$B_ID\"}" | j 'd.data.id')

date +%s%3N > "$MARK"
node "$SCRATCH_DIR/smoke-presence-bob.cjs" "$BASE" "$B_TOKEN" "$A_ID" "$MARK" > "$SCRATCH_DIR/bob.log" 2>&1 &
BOB_PID=$!
for _ in $(seq 1 50); do grep -q '\[bob\] ready' "$SCRATCH_DIR/bob.log" && break; sleep 0.2; done

node "$SCRATCH_DIR/smoke-presence-ana.cjs" "$BASE" "$A_TOKEN" "$B_TOKEN" "$B_ID" "$A_ID" "$MARK"

# Cache: 5 envios + 5 listagens leem os participantes do Postgres no máximo uma vez; apagando a
# chave antes de cada requisição (sem cache) são 10 leituras.
burst() {
  for i in 1 2 3 4 5; do
    [ "$1" = "sem-cache" ] && rcli DEL "cache:conv:participants:$CONV" > /dev/null
    curl -s -o /dev/null -X POST "$API/conversations/$CONV/messages" \
      -H "Authorization: Bearer $A_TOKEN" -H "$CT" -d "{\"text\":\"cache $i\"}"
    [ "$1" = "sem-cache" ] && rcli DEL "cache:conv:participants:$CONV" > /dev/null
    curl -s -o /dev/null "$API/conversations/$CONV/messages" -H "Authorization: Bearer $B_TOKEN"
  done
}
BEFORE=$(settled_scans)
burst com-cache
MIDDLE=$(settled_scans)
burst sem-cache
AFTER=$(settled_scans)
echo "participants-reads com-cache=$((MIDDLE - BEFORE)) sem-cache=$((AFTER - MIDDLE))"
curl -s -o /dev/null "$API/conversations" -H "Authorization: Bearer $A_TOKEN"

# Chaves no Redis (Bob ainda conectado): TTL da conexão ~120 s, status manual sem TTL, cache <= 300 s.
ttl() { rcli TTL "$1"; }
echo "ttl presence:conns:bob=$(ttl "presence:conns:$B_ID")"
echo "ttl presence:manual:ana=$(ttl "presence:manual:$A_ID") value=$(rcli GET "presence:manual:$A_ID")"
echo "ttl cache:conv:participants=$(ttl "cache:conv:participants:$CONV")"
echo "ttl cache:user:ana=$(ttl "cache:user:$A_ID")"
echo "ttl cache:blocks:ana=$(ttl "cache:blocks:$A_ID")"
echo "ttl cache:presence:audience:ana=$(ttl "cache:presence:audience:$A_ID")"

# Bob sai: vira offline com last_seen_at gravado.
kill -TERM "$BOB_PID"
wait "$BOB_PID" || true
cat "$SCRATCH_DIR/bob.log"
for _ in $(seq 1 30); do
  [ "$(rcli EXISTS "presence:conns:$B_ID")" = "0" ] && break
  sleep 0.2
done
curl -s "$API/presence?userIds=$B_ID" -H "Authorization: Bearer $A_TOKEN" \
  | j '"bob-after-exit="+d.data.items[0].state+" lastSeenAt="+(d.data.items[0].lastSeenAt!==null)'
echo "presence:conns:bob exists=$(rcli EXISTS "presence:conns:$B_ID")"
```

Criar `$SCRATCH/smoke-presence-crash.cjs` (queda de instância: Bob numa instância, Ana na outra, que é derrubada com `kill -9`):

```js
// Queda de instância (processo separado). Uso:
//   NODE_PATH=$PWD/node_modules node smoke-presence-crash.cjs <baseViva> <baseQueVaiCair>
// Bob fica na instância viva e observa a Ana, conectada na outra; ao ver "busy", imprime KILL_NOW
// (o orquestrador derruba a outra instância com kill -9) e espera a varredura da instância viva
// publicar o offline da Ana (≤ TTL 30 s + varredura 30 s).
const { io } = require('socket.io-client');

const [alive, doomed] = process.argv.slice(2);
const json = async (url, init) => (await fetch(url, init)).json();
const register = (username) =>
  json(`${alive}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'Password123!',
      displayName: username,
    }),
  });

async function main() {
  const suffix = Date.now();
  const ana = (await register(`crana${suffix}`)).data;
  const bob = (await register(`crbob${suffix}`)).data;
  await json(`${alive}/api/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bob.tokens.accessToken}` },
    body: JSON.stringify({ contactId: ana.user.id }),
  });

  const bobSocket = io(alive, { auth: { token: bob.tokens.accessToken }, transports: ['websocket'] });
  await new Promise((resolve) => bobSocket.once('presence:snapshot', resolve));
  const startedAt = Date.now();
  bobSocket.on('presence:update', ({ state }) => {
    const elapsed = Date.now() - startedAt;
    console.log(`[bob@viva] ana=${state} +${elapsed < 1000 ? '<1s' : `${Math.round(elapsed / 1000)}s`}`);
    if (state === 'busy') {
      console.log('KILL_NOW');
    }
    if (state === 'offline') {
      process.exit(0);
    }
  });

  const anaSocket = io(doomed, {
    auth: { token: ana.tokens.accessToken },
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise((resolve) => anaSocket.once('connect', resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await anaSocket.emitWithAck('presence:set', { status: 'busy' });
}

main().catch((error) => {
  console.log(`FAIL ${error.message}`);
  process.exit(1);
});
setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(1);
}, 100_000).unref();
```

- [ ] **Step 7: Rodar o smoke (da raiz do repositório)**

```bash
bash "$SCRATCH/smoke-presence.sh"
```

Leva ~1 min (três esperas de 11 s pelo `pg_stat`). Expected (os TTLs variam — conexão ≤ 120, cache ≤ 300; `-1` = sem TTL):

```text
[ana] tab1 connected
[ana] tab2 connected
[ana] set-busy-ack=busy tab2-own=busy
[ana] tab1 closed (tab2 still open)
[ana] all tabs closed
[ana] reconnected
[ana] rest-presence-for-bob=busy
[ana] contacts-online-for-bob=busy
[ana] blocked-status=201 rest-for-bob-after-block=offline,null
[ana] unblocked-status=204
[ana] legacy-online=200 legacy-offline=400
participants-reads com-cache=1 sem-cache=10
ttl presence:conns:bob=108
ttl presence:manual:ana=-1 value=available
ttl cache:conv:participants=288
ttl cache:user:ana=300
ttl cache:blocks:ana=261
ttl cache:presence:audience:ana=261
[bob] snapshot ana=offline
[bob] ready
[bob] update ana=online latency<3s=true
[bob] update ana=busy latency<3s=true
[bob] update ana=offline lastSeen=true latency<3s=true
[bob] update ana=busy latency<3s=true
[bob] update ana=offline lastSeen=false latency<3s=true
[bob] update ana=busy latency<3s=true
[bob] update ana=online latency<3s=true
[bob] update ana=offline lastSeen=true latency<3s=true
bob-after-exit=offline lastSeenAt=true
presence:conns:bob exists=0
```

Leitura: a segunda aba e o fechamento da primeira não geram aviso (várias abas = um usuário); o status manual volta como `busy` na reconexão; o bloqueio esconde a Ana (`offline` sem `lastSeen`) e o REST também; o desbloqueio devolve o estado real; os legados delegam à presença; 10 requisições leem os participantes do Postgres uma vez com cache contra 10 sem ele. Divergências e onde investigar (corrigir com TDD na task de origem, commitar e repetir):
- `ana=online` duplicado ao abrir a segunda aba, ou `offline` com a outra aba aberta → `connect`/`disconnect` (Task 8).
- `tab2-own` ausente ou `update` fora de ordem → ponte (Task 11).
- `rest-*` ou `contacts-online-*` errados → Tasks 12–13; `legacy-*` → Task 14.
- `com-cache` > 1 → `ParticipantDirectory`/invalidação (Task 6) — confira se o `bootstrap` registra os listeners (Task 15).
- TTL `-2` numa chave `cache:*` → a chave não foi gravada (Tasks 3–6, 9).
- 429 no `register` → o limiter de auth (5 req/15 min por IP) já foi consumido: `docker exec rtm-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB` (só o Redis deste projeto) e rodar de novo.

- [ ] **Step 8: Queda de instância (varredura) — segunda instância em 3101**

```bash
env $APP_ENV PORT=3101 node --import tsx src/server.ts > "$SCRATCH/rtm-app2.log" 2>&1 &
echo $! > "$SCRATCH/rtm-app2.pid"
```

Aguarde `curl -s -o /dev/null -w '%{http_code}' http://localhost:3101/api/conversations` imprimir `401`. Então:

```bash
NODE_PATH="$PWD/node_modules" node "$SCRATCH/smoke-presence-crash.cjs" http://localhost:3100 http://localhost:3101 > "$SCRATCH/crash.log" 2>&1 &
echo $! > "$SCRATCH/crash.pid"
```

Aguarde (ferramenta de espera) até `grep -q KILL_NOW "$SCRATCH/crash.log"` e derrube a segunda instância pelo PID: `kill -9 "$(cat "$SCRATCH/rtm-app2.pid")"`. Aguarde até `crash.log` conter `offline` (no máximo ~60 s). Expected:

```text
[bob@viva] ana=online +<1s
[bob@viva] ana=busy +<1s
KILL_NOW
[bob@viva] ana=offline +45s
```

(o último número varia entre ~30 s e ~60 s: TTL de 30 s + até 30 s até a próxima varredura). A emissão `online`/`busy` atravessando as instâncias prova o Redis adapter na ponte; o `offline` prova a varredura da instância viva. `kill -0 "$(cat "$SCRATCH/crash.pid")"` deve falhar (o script saiu sozinho).

- [ ] **Step 9: Encerramento gracioso**

```bash
kill -TERM "$(cat "$SCRATCH/rtm-app.pid")"
```

Aguarde (ferramenta de espera, não `sleep`) até `kill -0 "$(cat "$SCRATCH/rtm-app.pid")" 2>/dev/null` falhar. Expected: `$SCRATCH/rtm-app.log` termina com `SIGTERM recebido: encerrando o servidor` e o processo sai sozinho em poucos segundos (os timers da presença e a ponte param antes do `io.close()`). Use o PID salvo — nunca `pkill`/`pgrep -f` com padrão genérico. Os containers `rtm-*` podem ficar de pé (ou `docker compose stop postgres redis mongodb elasticsearch`); nunca `down -v`.

- [ ] **Step 10 (opcional): Demo no navegador**

Com a app de pé (repita o Step 5 se já a encerrou), abrir `http://localhost:3100/demo/` em duas janelas (uma anônima), logar com dois usuários que tenham conversa 1:1 (ex.: os do smoke, `prana<SUFFIX>@example.com` / `Password123!`) e observar o ponto da conversa mudar (verde/âmbar/vermelho/cinza) ao trocar o seletor de status e ao fechar a outra janela ("visto por último em …" no cabeçalho). Encerrar depois pelo PID. Não é critério de aceite.

- [ ] **Step 11: Atualizar `README.md`**

Cada item é uma substituição literal (trecho atual → trecho novo); os totais de testes vêm do Step 1.

1. Hero (linha 5) — trocar:

```text
Express 5 API with token auth, user profiles, contacts and chat — REST plus real-time delivery over Socket.IO with delivered/read receipts and typing indicators — today; presence, notifications and search on the way, each on the store that fits it.
```

por:

```text
Express 5 API with token auth, user profiles, contacts and chat — REST plus real-time delivery over Socket.IO with delivered/read receipts, typing indicators and presence (online/away/busy, last seen), with Redis caching on the hot paths — today; search and notifications on the way, each on the store that fits it.
```

2. Aviso (linha 23) — trocar:

```text
> **Work in progress.** Authentication, profiles, contacts/blocks and chat (1:1 and group conversations, messages in MongoDB) are implemented and tested, over REST and in real time over Socket.IO — delivered/read receipts, typing indicators and a minimal demo client at `/demo`. Presence and caching are the next milestone — see the [roadmap](#roadmap).
```

por:

```text
> **Work in progress.** Authentication, profiles, contacts/blocks, chat (1:1 and group conversations, messages in MongoDB) and presence are implemented and tested, over REST and in real time over Socket.IO — delivered/read receipts, typing indicators, online/away/busy with last seen, Redis caching with event-driven invalidation and a minimal demo client at `/demo`. Message search is the next milestone — see the [roadmap](#roadmap).
```

3. Arquitetura (bloco mermaid) — trocar:

```text
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
```

por:

```text
    API --> CHAT[chat module]
    API --> PRES[presence module]
    RT --> CHAT
    RT --> PRES
    API -.-> NOTIF[notifications]
    API -.-> SEARCH[search]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER & CHAT & PRES & RT --> RD[(Redis<br/>rate limit · Socket.IO adapter<br/>presence · cache)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>structured logs)]
    CHAT --> MG[(MongoDB<br/>messages)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES
```

4. Perfil — trocar:

```text
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Field-level updates |
```

por:

```text
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Field-level updates; `/status` is legacy — `online` · `away` · `busy` set the manual presence status (`online` → `available`), `offline` → 400 |
```

5. Perfil — trocar:

```text
| `POST` | `/online` · `/offline` | ✓ | Presence flag |
```

por:

```text
| `POST` | `/online` · `/offline` | ✓ | Legacy: `/online` sets the manual presence status to `available`; `/offline` → 400 (you go offline by disconnecting) — prefer `PUT /api/presence/status` |
```

6. Contatos — trocar:

```text
| `GET` | `/` | ✓ | List own contacts, paginated, with filters; `orderBy=lastInteraction` sorts by the latest direct message (contacts never messaged come last) |
```

por:

```text
| `GET` | `/` | ✓ | List own contacts, paginated, with filters; each item carries `presence: { state, lastSeenAt }`; `orderBy=lastInteraction` sorts by the latest direct message (contacts never messaged come last); `orderBy=presence` sorts the loaded page — online, away, busy, then offline by most recent last seen |
```

7. Contatos — trocar:

```text
| `GET` | `/favorites` | ✓ | List favorite contacts |
```

por:

```text
| `GET` | `/favorites` | ✓ | List favorite contacts |
| `GET` | `/online` | ✓ | Contacts currently connected (online, away or busy), sorted by name, each with `presence` |
```

8. Tempo real — eventos cliente → servidor — trocar:

```text
| `typing:stop` | `{ conversationId }` | Ends the indicator; `null` |
```

por:

```text
| `typing:stop` | `{ conversationId }` | Ends the indicator; `null` |
| `presence:set` | `{ status }` — `available` · `away` · `busy` | Manual presence status, kept across reconnections (same rule as `PUT /api/presence/status`); `{ state }` (the resulting effective state) |
```

9. Tempo real — eventos servidor → cliente — trocar:

```text
| `conversation:deleted` | conversation + former participants | `{ conversationId }` |
```

por:

```text
| `conversation:deleted` | conversation + former participants | `{ conversationId }` |
| `presence:update` | `user:<id>` of everyone watching the user (status changes also reach the user's other tabs) | `{ userId, state, lastSeenAt }` — `state` is `online` · `away` · `busy` · `offline`; `lastSeenAt` only when offline |
| `presence:snapshot` | the socket that just connected | `{ states: [{ userId, state, lastSeenAt }] }` — everyone the user watches (contacts and 1:1 partners, minus blocks) |
```

10. Cliente demo — trocar:

```text
and watch messages, ✓ sent / ✓✓ delivered / ✓✓ (blue) read and "typing…" live.
```

por:

```text
and watch messages, ✓ sent / ✓✓ delivered / ✓✓ (blue) read, "typing…" and presence (a dot per 1:1 conversation, last seen in the header, and a status selector) live.
```

11. Seções novas (inserir imediatamente antes de `### Rate limiting`) — trocar:

```text
### Rate limiting
```

por:

```text
### Presence — `/api/presence`

Presence is computed from the live Socket.IO connections and kept in Redis; the `presence` module is the only one that touches these keys.

- **Connections** — sorted set `presence:conns:<userId>`, one member per socket (`<nodeId>:<socketId>`, `nodeId` being a UUID per process) scored with the last heartbeat. Every instance refreshes its own sockets each 15 s (`ZADD XX`); a user is connected while any member is younger than 30 s. Members left by an instance that died without disconnecting are removed by a sweep every instance runs each 30 s (`SCAN presence:conns:*`, `COUNT 100`), which also announces the offline — a crashed instance's users go offline within about a minute. The key itself expires 120 s after the last refresh.
- **Manual status** — `presence:manual:<userId>` = `available` · `away` · `busy`, with no TTL, so it survives reconnections.
- **Effective state** — no connection → `offline`; connected → `online` when the manual status is `available`, otherwise `away`/`busy`. Several tabs/devices count as one user: online on the first connection, offline only when the last one closes, at which point `users.last_seen_at` is written and exposed as `lastSeenAt`.
- **Who is notified** — users who have the user as a contact plus the partners of their 1:1 conversations, minus anyone with a block in either direction. Blocking hides both sides immediately (`presence:update` with `offline` and no `lastSeenAt`) and every REST query answers `offline` for blocked pairs; unblocking sends the real state to both.

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `GET` | `/api/presence?userIds=<uuid>,<uuid>` | ✓ | Up to 100 ids → `{ items: [{ userId, state, lastSeenAt }] }` |
| `PUT` | `/api/presence/status` | ✓ | `{ status }` — `available` · `away` · `busy`; 204 |
| `GET` | `/api/contacts/online` | ✓ | Contacts currently connected, sorted by name, each with `presence` |

The module publishes `presence:online`, `presence:offline` and `presence:status-changed` on the EventBus. The legacy `PUT /api/profile/status` and `POST /api/profile/online` now set the manual status, `offline` answers 400 (you go offline by disconnecting), and `users.status` is no longer written for presence.

### Cache — Redis

`CacheService` (`src/shared/cache`) keeps JSON under `cache:*` with a 300 s TTL and falls back to the source of truth on any Redis failure (logged as `warn` — a request never fails because of the cache).

| Key | Holds | Read by | Invalidated by (EventBus, synchronous) |
|---|---|---|---|
| `cache:user:<id>` | public profile | conversation participants and presence `lastSeenAt` (`userService.getMultiple` / `findByIdPublic`) | `user:updated` (profile and avatar changes), `user:deleted`, and `UserService`'s own writes (e.g. last seen) |
| `cache:conv:participants:<id>` | participant ids and roles | sending and listing messages, delivery receipts, `isParticipant`, `getParticipantIds` | `chat:conversation-created` / `-updated` / `-deleted` |
| `cache:blocks:<id>` | ids blocked in either direction | `isBlockedByEither`, presence audience | `user:blocked` / `user:unblocked` (both users) |
| `cache:presence:audience:<id>` | who gets the user's presence updates | presence bridge | block/unblock, `user:contact-added` / `-removed`, a new 1:1 conversation |

Invalidation subscribers are synchronous: the request that changed the data returns only after the key was cleared, and the TTL bounds staleness if an event is ever lost. `POST /:id/read` still reads the participation row, since `last_read_at` changes on every read.

### Rate limiting
```

12. Infraestrutura compartilhada — bullet do cache — trocar:

```text
- **Logger** — structured, leveled, categorised; console output in development and an optional MongoDB sink.
```

por:

```text
- **Cache** — `CacheService`: JSON on Redis under `cache:*`, 300 s TTL, batched reads/writes and graceful degradation when Redis is unavailable.
- **Logger** — structured, leveled, categorised; console output in development and an optional MongoDB sink.
```

13. EventBus — trocar:

```text
(e.g. auth events, `user:blocked` / `user:unblocked`, `chat:message-sent`) through it;
```

por:

```text
(e.g. auth events, `user:blocked` / `user:unblocked`, `user:updated`, `user:contact-added`, `chat:message-sent`, `presence:online` / `presence:offline`) through it;
```

14. Estrutura — user — trocar:

```text
│   │                         repositories · models · routes
│   ├── chat/
```

por:

```text
│   │                         repositories · models · cache listeners · routes
│   ├── chat/
```

15. Estrutura — realtime/presence/cache — trocar:

```text
│   └── realtime/             Socket.IO server · handshake middlewares ·
│                             message/typing handlers · TypingService ·
│                             EventBus → rooms bridge
└── shared/
```

por:

```text
│   ├── realtime/             Socket.IO server · handshake middlewares ·
│   │                         message/typing handlers · TypingService ·
│   │                         EventBus → rooms bridge
│   └── presence/             PresenceService (Redis) · connection hooks,
│                             heartbeat and sweep · presence:update bridge ·
│                             REST controller · cache invalidation listeners
└── shared/
    ├── cache/                CacheService (JSON on Redis, TTL, degradation)
```

16. Estrutura — tests/support — trocar:

```text
└── support/                  in-memory fakes used by feature tests
```

por:

```text
└── support/                  in-memory fakes (chat repositories, Redis, sockets)
```

17. Roadmap — trocar:

```text
- [ ] Presence and cache — online/offline status with heartbeat, conversation and profile caching on Redis
```

por:

```text
- [x] Presence and cache — online/away/busy over multi-tab connections in Redis with heartbeat, sweep and last seen, block-aware notifications, and Redis caching of profiles, participants, blocks and audiences with event-driven invalidation
```

18. Badge — trocar `tests-2521%20Jest` pelo total do Step 1 (ex.: `tests-2776%20Jest`).

19. Testes — trocar o início do parágrafo:

```text
**Tests** — 2,521 Jest tests in 167 suites (unit under `tests/unit`; HTTP feature tests with supertest and WebSocket integration tests with socket.io-client under `tests/feature`).
```

por (com os números do Step 1):

```text
**Tests** — 2,776 Jest tests in 185 suites (unit under `tests/unit`; HTTP feature tests with supertest and WebSocket integration tests with socket.io-client under `tests/feature`; Redis is replaced by an in-memory fake, `tests/support/redis/fakeRedis.ts`, whose command semantics were checked against Redis 7).
```
- [ ] **Step 12: Atualizar `README.pt-BR.md (mesmas mudanças, em português)`**

Cada item é uma substituição literal (trecho atual → trecho novo); os totais de testes vêm do Step 1.

1. Hero (linha 5) — trocar:

```text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat — REST e entrega em tempo real via Socket.IO, com confirmações de entrega/leitura e indicador de digitação — hoje; presença, notificações e busca a caminho, cada um no banco que melhor o atende.
```

por:

```text
API Express 5 com autenticação por token, perfis de usuário, contatos e chat — REST e entrega em tempo real via Socket.IO, com confirmações de entrega/leitura, indicador de digitação e presença (online/ausente/ocupado, visto por último), com cache Redis nos caminhos quentes — hoje; busca e notificações a caminho, cada um no banco que melhor o atende.
```

2. Aviso (linha 23) — trocar:

```text
> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios e chat (conversas 1:1 e em grupo, mensagens no MongoDB) estão implementados e testados, via REST e em tempo real via Socket.IO — confirmações de entrega/leitura, indicador de digitação e um cliente demo mínimo em `/demo`. Presença e cache são o próximo marco — veja o [roadmap](#roadmap).
```

por:

```text
> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios, chat (conversas 1:1 e em grupo, mensagens no MongoDB) e presença estão implementados e testados, via REST e em tempo real via Socket.IO — confirmações de entrega/leitura, indicador de digitação, online/ausente/ocupado com visto por último, cache Redis com invalidação por evento e um cliente demo mínimo em `/demo`. A busca de mensagens é o próximo marco — veja o [roadmap](#roadmap).
```

3. Arquitetura (bloco mermaid) — trocar:

```text
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
```

por:

```text
    API --> CHAT[módulo chat]
    API --> PRES[módulo presence]
    RT --> CHAT
    RT --> PRES
    API -.-> NOTIF[notificações]
    API -.-> SEARCH[busca]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER & CHAT & PRES & RT --> RD[(Redis<br/>rate limit · adapter do Socket.IO<br/>presença · cache)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>logs estruturados)]
    CHAT --> MG[(MongoDB<br/>mensagens)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES
```

4. Perfil — trocar:

```text
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Atualizações por campo |
```

por:

```text
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Atualizações por campo; `/status` é legado — `online` · `away` · `busy` definem o status manual da presença (`online` → `available`), `offline` → 400 |
```

5. Perfil — trocar:

```text
| `POST` | `/online` · `/offline` | ✓ | Flag de presença |
```

por:

```text
| `POST` | `/online` · `/offline` | ✓ | Legado: `/online` define o status manual da presença como `available`; `/offline` → 400 (fica-se offline ao desconectar) — prefira `PUT /api/presence/status` |
```

6. Contatos — trocar:

```text
| `GET` | `/` | ✓ | Lista os próprios contatos, paginado, com filtros; `orderBy=lastInteraction` ordena pela última mensagem direta (quem nunca conversou fica no fim) |
```

por:

```text
| `GET` | `/` | ✓ | Lista os próprios contatos, paginado, com filtros; cada item traz `presence: { state, lastSeenAt }`; `orderBy=lastInteraction` ordena pela última mensagem direta (quem nunca conversou fica no fim); `orderBy=presence` ordena a página carregada — online, ausente, ocupado e depois offline pelo visto por último mais recente |
```

7. Contatos — trocar:

```text
| `GET` | `/favorites` | ✓ | Lista contatos favoritos |
```

por:

```text
| `GET` | `/favorites` | ✓ | Lista contatos favoritos |
| `GET` | `/online` | ✓ | Contatos conectados agora (online, ausente ou ocupado), ordenados por nome, cada um com `presence` |
```

8. Tempo real — eventos cliente → servidor — trocar:

```text
| `typing:stop` | `{ conversationId }` | Encerra o indicador; `null` |
```

por:

```text
| `typing:stop` | `{ conversationId }` | Encerra o indicador; `null` |
| `presence:set` | `{ status }` — `available` · `away` · `busy` | Status manual de presença, mantido entre reconexões (mesma regra do `PUT /api/presence/status`); `{ state }` (o estado efetivo resultante) |
```

9. Tempo real — eventos servidor → cliente — trocar:

```text
| `conversation:deleted` | conversa + ex-participantes | `{ conversationId }` |
```

por:

```text
| `conversation:deleted` | conversa + ex-participantes | `{ conversationId }` |
| `presence:update` | `user:<id>` de todos que observam o usuário (mudanças de status também chegam às outras abas dele) | `{ userId, state, lastSeenAt }` — `state` é `online` · `away` · `busy` · `offline`; `lastSeenAt` só quando offline |
| `presence:snapshot` | o socket que acabou de conectar | `{ states: [{ userId, state, lastSeenAt }] }` — todos que o usuário observa (contatos e parceiros 1:1, menos bloqueios) |
```

10. Cliente demo — trocar:

```text
e ver ao vivo as mensagens, ✓ enviada / ✓✓ entregue / ✓✓ (azul) lida e "digitando…".
```

por:

```text
e ver ao vivo as mensagens, ✓ enviada / ✓✓ entregue / ✓✓ (azul) lida, "digitando…" e a presença (um indicador por conversa 1:1, visto por último no cabeçalho e um seletor de status).
```

11. Seções novas (inserir imediatamente antes de `### Rate limit`) — trocar:

```text
### Rate limit
```

por:

```text
### Presença — `/api/presence`

A presença é calculada a partir das conexões Socket.IO ativas e fica no Redis; o módulo `presence` é o único que mexe nessas chaves.

- **Conexões** — sorted set `presence:conns:<userId>`, um membro por socket (`<nodeId>:<socketId>`, sendo `nodeId` um UUID por processo) com o último heartbeat como score. Cada instância renova os próprios sockets a cada 15 s (`ZADD XX`); o usuário está conectado enquanto algum membro tiver menos de 30 s. Membros deixados por uma instância que caiu sem desconectar são removidos por uma varredura que toda instância roda a cada 30 s (`SCAN presence:conns:*`, `COUNT 100`), que também anuncia o offline — os usuários de uma instância que caiu ficam offline em cerca de um minuto. A chave em si expira 120 s depois da última renovação.
- **Status manual** — `presence:manual:<userId>` = `available` · `away` · `busy`, sem TTL, então sobrevive às reconexões.
- **Estado efetivo** — sem conexão → `offline`; conectado → `online` se o status manual for `available`, senão `away`/`busy`. Várias abas/dispositivos contam como um usuário só: online na primeira conexão, offline só quando a última fecha — aí `users.last_seen_at` é gravado e exposto como `lastSeenAt`.
- **Quem é avisado** — quem tem o usuário como contato mais os parceiros das conversas 1:1 dele, menos qualquer um com bloqueio em qualquer sentido. O bloqueio esconde os dois lados na hora (`presence:update` com `offline` e sem `lastSeenAt`) e toda consulta REST responde `offline` para pares bloqueados; o desbloqueio envia o estado real aos dois.

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/api/presence?userIds=<uuid>,<uuid>` | ✓ | Até 100 ids → `{ items: [{ userId, state, lastSeenAt }] }` |
| `PUT` | `/api/presence/status` | ✓ | `{ status }` — `available` · `away` · `busy`; 204 |
| `GET` | `/api/contacts/online` | ✓ | Contatos conectados agora, ordenados por nome, cada um com `presence` |

O módulo publica `presence:online`, `presence:offline` e `presence:status-changed` no EventBus. Os legados `PUT /api/profile/status` e `POST /api/profile/online` passam a definir o status manual, `offline` responde 400 (fica-se offline ao desconectar) e `users.status` deixa de ser gravado para presença.

### Cache — Redis

O `CacheService` (`src/shared/cache`) guarda JSON em `cache:*` com TTL de 300 s e recorre à fonte da verdade em qualquer falha do Redis (log `warn` — uma requisição nunca falha por causa do cache).

| Chave | Conteúdo | Lida por | Invalidada por (EventBus, síncrono) |
|---|---|---|---|
| `cache:user:<id>` | perfil público | participantes das conversas e `lastSeenAt` da presença (`userService.getMultiple` / `findByIdPublic`) | `user:updated` (perfil e avatar), `user:deleted` e as escritas do próprio `UserService` (ex.: visto por último) |
| `cache:conv:participants:<id>` | ids e papéis dos participantes | envio e listagem de mensagens, confirmação de entrega, `isParticipant`, `getParticipantIds` | `chat:conversation-created` / `-updated` / `-deleted` |
| `cache:blocks:<id>` | ids com bloqueio em qualquer sentido | `isBlockedByEither`, audiência da presença | `user:blocked` / `user:unblocked` (os dois usuários) |
| `cache:presence:audience:<id>` | quem recebe as mudanças de presença do usuário | ponte da presença | bloqueio/desbloqueio, `user:contact-added` / `-removed`, nova conversa 1:1 |

Os subscribers de invalidação são síncronos: a requisição que mudou o dado só termina depois de a chave ser apagada, e o TTL limita a defasagem se um evento se perder. O `POST /:id/read` continua lendo a linha da participação, porque `last_read_at` muda a cada leitura.

### Rate limit
```

12. Infraestrutura compartilhada — bullet do cache — trocar:

```text
- **Logger** — estruturado, com níveis e categorias; saída no console em desenvolvimento e sink opcional no MongoDB.
```

por:

```text
- **Cache** — `CacheService`: JSON no Redis em `cache:*`, TTL de 300 s, leitura/escrita em lote e degradação graciosa quando o Redis está fora do ar.
- **Logger** — estruturado, com níveis e categorias; saída no console em desenvolvimento e sink opcional no MongoDB.
```

13. EventBus — trocar:

```text
(ex.: eventos de auth, `user:blocked` / `user:unblocked`, `chat:message-sent`) por ele;
```

por:

```text
(ex.: eventos de auth, `user:blocked` / `user:unblocked`, `user:updated`, `user:contact-added`, `chat:message-sent`, `presence:online` / `presence:offline`) por ele;
```

14. Estrutura — user — trocar:

```text
│   │                         repositories · models · rotas
│   ├── chat/
```

por:

```text
│   │                         repositories · models · listeners de cache · rotas
│   ├── chat/
```

15. Estrutura — realtime/presence/cache — trocar:

```text
│   └── realtime/             servidor Socket.IO · middlewares do handshake ·
│                             handlers de mensagem/digitação · TypingService ·
│                             ponte EventBus → rooms
└── shared/
```

por:

```text
│   ├── realtime/             servidor Socket.IO · middlewares do handshake ·
│   │                         handlers de mensagem/digitação · TypingService ·
│   │                         ponte EventBus → rooms
│   └── presence/             PresenceService (Redis) · hooks de conexão,
│                             heartbeat e varredura · ponte presence:update ·
│                             controller REST · listeners de invalidação
└── shared/
    ├── cache/                CacheService (JSON no Redis, TTL, degradação)
```

16. Estrutura — tests/support — trocar:

```text
└── support/                  fakes em memória usados pelos feature tests
```

por:

```text
└── support/                  fakes em memória (repositórios do chat, Redis, sockets)
```

17. Roadmap — trocar:

```text
- [ ] Presença e cache — status online/offline com heartbeat, cache de conversas e perfis no Redis
```

por:

```text
- [x] Presença e cache — online/ausente/ocupado sobre conexões multi-aba no Redis com heartbeat, varredura e visto por último, avisos que respeitam bloqueios, e cache Redis de perfis, participantes, bloqueios e audiências com invalidação por evento
```

18. Badge — trocar `testes-2521%20Jest` pelo total do Step 1 (ex.: `testes-2776%20Jest`).

19. Testes — trocar o início do parágrafo:

```text
**Testes** — 2.521 testes Jest em 167 suítes (unitários em `tests/unit`; testes de feature HTTP com supertest e de integração WebSocket com socket.io-client em `tests/feature`).
```

por (com os números do Step 1):

```text
**Testes** — 2.776 testes Jest em 185 suítes (unitários em `tests/unit`; testes de feature HTTP com supertest e de integração WebSocket com socket.io-client em `tests/feature`; o Redis é substituído por um fake em memória, `tests/support/redis/fakeRedis.ts`, com a semântica dos comandos conferida contra o Redis 7).
```
Conferir: `grep -n "presence\|cache:" README.md README.pt-BR.md` lista as seções novas nos dois arquivos; as tabelas e o mermaid renderizam no preview do GitHub.

- [ ] **Step 13: Atualizar o SRS local (`.github/SRS.md` — NÃO commitar; está em `.git/info/exclude`)**

Na seção da Sprint 7: título → `### 📅 Sprint 7 (Semana 7): Presença Online e Cache ✅`; tarefas:

```markdown
- [x] Implementar PresenceService com Redis (ZSET de conexões por usuário, MULTI, varredura por SCAN)
- [x] Criar listeners de conexão/desconexão (hooks do createRealtimeServer; várias abas = um usuário)
- [x] Implementar heartbeat (keepalive) — 15 s por nó (`ZADD XX`), TTL de 30 s, varredura a cada 30 s
- [x] Criar sistema de status manual (disponível, ocupado, ausente) — `presence:set` e `PUT /api/presence/status`, persistente entre reconexões
- [x] Implementar cache de conversas no Redis (participantes em `cache:conv:participants:<id>`)
- [x] Criar cache de perfis de usuário (`cache:user:<id>`, além de bloqueios e audiência)
- [x] Implementar estratégia de invalidação (listeners síncronos do EventBus + TTL de 300 s)
- [x] Criar testes de presença (unitários, integração com socket.io-client, smoke com duas instâncias; 100% de cobertura)
```

Conferir que o arquivo não aparece como staged: `git status --short .github` não deve listar `SRS.md`.

- [ ] **Step 14: Commitar a documentação**

```bash
git add README.md README.pt-BR.md
git commit -m "📝 docs: documenta a presença, o cache Redis e a API de presença"
git status --short
```

Expected: árvore limpa (exceto arquivos locais ignorados).

- [ ] **Step 15: Push e PR**

Criar `$SCRATCH/pr-body.md`:

```markdown
## Resumo
- Módulo `presence`: `PresenceService` sobre o Redis (ZSET `presence:conns:<id>` com uma entrada por socket e heartbeat de 15 s, status manual `presence:manual:<id>` sem TTL, estados em lote, varredura por `SCAN` que cobre a queda de uma instância), com eventos `presence:online` / `presence:offline` / `presence:status-changed`
- Socket.IO: hooks de conexão/desconexão (o realtime não conhece o presence), `presence:set` com ack, `presence:snapshot` ao conectar e a ponte `presence:update` para quem observa o usuário (contatos + parceiros 1:1, menos bloqueios), serializada por usuário; bloqueio esconde os dois lados na hora
- REST: `GET /api/presence`, `PUT /api/presence/status`, `GET /api/contacts/online`, `presence` em cada contato de `GET /api/contacts` e `orderBy=presence`; `PUT /api/profile/status` e `POST /api/profile/online|offline` delegam ao status manual (`offline` → 400)
- Cache: `CacheService` (JSON, TTL 300 s, degradação sem Redis) para perfis públicos, participantes das conversas, bloqueios e audiência, com invalidação síncrona pelo EventBus
- Cliente demo: seletor de status e indicadores de presença

## Requisitos
RF004 (presença online, status manual, visto por último, contatos online)

## Testes
- Unitários de todo o módulo presence, do `CacheService` e das adoções de cache (redução de leituras comprovada) — 100% de cobertura; `FakeRedis` com a semântica conferida contra o Redis 7
- Integração com `socket.io-client` (duas abas, aviso < 3 s, snapshot, status persistente, bloqueio, varredura com timers curtos), sem open handles; a suíte inteira roda sem abrir conexão com Redis algum
- Smoke na stack real (portas alternativas, app em :3100): dois clientes em processos separados, TTLs das chaves `presence:*`/`cache:*` via `redis-cli`, 1 leitura de participantes com cache contra 10 sem, e queda de uma segunda instância detectada pela varredura
```

```bash
git push -u origin feature/presence-cache
gh pr create --base main --head feature/presence-cache \
  --title "✨ Sprint 7: presença online e cache Redis" \
  --body-file "$SCRATCH/pr-body.md"
```

Se `gh pr create` falhar (ex.: GraphQL/permissão), usar a API REST:

```bash
gh api repos/GabeSilvaDev/realtime-messaging-platform/pulls \
  -f title="✨ Sprint 7: presença online e cache Redis" \
  -f head=feature/presence-cache -f base=main \
  -F body=@"$SCRATCH/pr-body.md" --jq .html_url
```

Expected: URL do PR impressa. Acompanhar o CI (`gh pr checks --watch`); o merge fica a cargo do controlador depois do CI verde e da revisão.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec:** §1 objetivo → Tasks 1–17; §2 modelo (ZSET com `<nodeId>:<socketId>`, TTL 30 s, `ZREMRANGEBYSCORE`, status manual sem TTL, estado efetivo, `last_seen_at` na última desconexão, `nodeId` UUID por processo; `connect`/`heartbeat`/`disconnect`/`setManualStatus`/`getStates`/`sweep` com `SCAN COUNT 100` a cada 30 s; heartbeat de 15 s `unref` parado no encerramento) → Tasks 7, 8, 10 e 15; §3 hooks, `server shutting down` ignorado, `presence:set`, `STATUS_CHANGED`, snapshot → Tasks 8 e 10 (decisão 5 para o conteúdo do snapshot); §4 audiência com `listWatchers`/`getDirectPartnerIds`/`listBlockedEitherIds` cacheada, ponte `presence:update`, bloqueio/desbloqueio, REST sempre offline para bloqueados → Tasks 4, 6, 9, 11 e 12; §5 REST (`GET /api/presence` ≤ 100, `PUT /api/presence/status` 204, `GET /api/contacts/online`, enriquecimento e `orderBy=presence` na página, legados delegando e `offline` → 400) → Tasks 12–14; §6 `CacheService` (get/set/del/getOrLoad, mget, prefixo, TTL 300, degradação com `warn`) e as quatro chaves com invalidação síncrona → Tasks 3–6 e 9 (decisões 7–10 para `markRead` e perfil com `bio`); §7 eventos → Task 1; §8 testes (FakeRedis, unitários, integração, redução de leituras, cobertura 100%, smoke com `redis-cli`) → Tasks 2–16 e 18; §9 docs → Task 18; §10 DoD (< 3 s medido no smoke e na integração; redução de leituras medida no Postgres; CI; PR) → Task 18.
- **Placeholders:** nenhum "TBD"/"implementar depois"; todo código de `src`, `tests`, `public` e dos scripts está completo. Os únicos valores preenchidos na execução são medidos (totais de testes, TTLs e segundos do smoke, `$SCRATCH`).
- **Consistência de tipos/nomes:** `ManualPresenceStatus`/`PresenceState`/`PresenceStateDTO`, `UserEvents.CONTACT_ADDED/REMOVED`, `CacheService`/`ICacheService`/`CacheClient`/`RedisCommand`/`RedisBatch`/`CACHE_CONSTANTS`, `USER_CACHE_KEYS`/`USER_CACHE_TTL_SECONDS`, `CHAT_CACHE_KEYS`/`CHAT_CACHE_TTL_SECONDS`, `ParticipantDirectory`/`ParticipantSummary`, `listWatcherIds`/`listContactIds`/`listBlockedEitherIds`/`findByUserAndContactIds`, `listWatchers`/`getContactsByIds`, `listDirectPartnerIds`/`getDirectPartnerIds`, `register{User,Chat,Presence}CacheListeners`, `PRESENCE_CONSTANTS`/`PRESENCE_KEYS`/`PRESENCE_CACHE_KEYS`/`effectiveState`/`toManualStatus`/`compareByPresence`, `PresenceService`/`PresenceServiceOptions`/`IPresenceService`, `createPresenceRealtime`/`PresenceRealtimeHandle`, `registerPresenceHandlers`, `registerPresenceBridge`, `PresenceController`/`presenceRoutes`, `OfflineStatusNotAllowedException`, `beforeClose` são usados nas tasks posteriores exatamente como definidos nas anteriores.
- **Validação:** todo o código foi escrito e validado numa cópia do repositório (sem `.env`, com as variáveis do CI): cada task, na ordem do plano, passou `tsc --noEmit`, `eslint src`, `prettier --check` e a suíte com 100% de cobertura; o "Rodar e ver falhar" de cada task foi conferido aplicando só os testes sobre o commit anterior (as falhas listadas são as observadas). Os trechos "substituir … por …" foram gerados a partir dos diffs validados e conferidos para reproduzir cada arquivo byte a byte. O `FakeRedis`, o `CacheService` e o `PresenceService` (a mesma suíte unitária com um cliente real no lugar do fake — todos os casos, exceto o que simula a queda via `failWith`) foram conferidos contra um Redis 7 descartável; as consultas SQL novas (`listWatcherIds`, `listContactIds`, `listBlockedEitherIds`, `findByUserAndContactIds`, `listDirectPartnerIds`, `updateLastSeen(at)`) contra um PostgreSQL 17 descartável com as migrations; a integração passou 5 vezes seguidas e sem open handles; a suíte inteira rodou com o Redis apontado para um contador de conexões (0 conexões); `npm run build` compila. O smoke das Steps 7–9 foi executado contra uma stack descartável (PostgreSQL 17, Redis 7 com senha, MongoDB 8, Elasticsearch 8.17) com a saída listada, incluindo a queda de instância (offline em ~45 s) e o SIGTERM gracioso.
