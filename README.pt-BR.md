<div align="center">

# Real-Time Messaging Platform

**Backend de um produto de chat em tempo real, em Node.js e TypeScript** — API Express 5 com autenticação por token, perfis de usuário, contatos e chat — REST e entrega em tempo real via Socket.IO, com confirmações de entrega/leitura, indicador de digitação e presença (online/ausente/ocupado, visto por último), cache Redis nos caminhos quentes e busca full-text de mensagens no Elasticsearch — hoje; notificações a caminho, cada uma no banco que melhor a atende.

[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-f59e0b)](#roadmap)
[![CI](https://github.com/GabeSilvaDev/realtime-messaging-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/GabeSilvaDev/realtime-messaging-platform/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.17-005571?logo=elasticsearch&logoColor=white)](https://www.elastic.co)
[![Testes](https://img.shields.io/badge/testes-2963%20Jest-C21325?logo=jest&logoColor=white)](#desenvolvimento)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-555)](LICENSE)

[English](README.md) · **Português (Brasil)**

</div>

> **Em desenvolvimento.** Autenticação, perfis, contatos/bloqueios, chat (conversas 1:1 e em grupo, mensagens no MongoDB), presença e busca de mensagens estão implementados e testados, via REST e em tempo real via Socket.IO — confirmações de entrega/leitura, indicador de digitação, online/ausente/ocupado com visto por último, cache Redis com invalidação por evento, busca full-text sem distinção de acentos e com destaque no Elasticsearch e um cliente demo mínimo em `/demo`. Notificações, email e anexos são o próximo marco — veja o [roadmap](#roadmap).

## Arquitetura

```mermaid
flowchart LR
    C[Cliente] -->|HTTP · Bearer JWT| API[API Express 5]
    C <-->|WebSocket · JWT no handshake| RT[módulo realtime<br/>Socket.IO]
    API --> AUTH[módulo auth]
    API --> USER[módulo user]
    API --> CHAT[módulo chat]
    API --> PRES[módulo presence]
    RT --> CHAT
    RT --> PRES
    API -.-> NOTIF[notificações]
    API --> SEARCH[módulo search]
    AUTH & USER & CHAT --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER & CHAT & PRES & RT --> RD[(Redis<br/>rate limit · adapter do Socket.IO<br/>presença · cache)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>logs estruturados)]
    CHAT --> MG[(MongoDB<br/>mensagens)]
    SEARCH --> ES[(Elasticsearch<br/>índice de mensagens)]
    SEARCH --> CHAT
    AUTH & USER & CHAT & PRES --> EB{{EventBus}}
    EB --> RT
    EB --> PRES
    EB --> SEARCH

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class NOTIF planned
```

Nós sólidos existem hoje; tracejados são planejados. Cada feature é um **módulo** (`src/modules/<nome>`) com seus próprios controllers, services, repositories, models, DTOs, schemas de validação, exceções e rotas, ligados por interfaces. Tudo que é transversal vive em `src/shared`.

## O que existe hoje

### Módulo auth — `/api/auth`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `POST` | `/register` | – | Cria o usuário, retorna access + refresh tokens |
| `POST` | `/login` | – | |
| `POST` | `/refresh` | – | Rotaciona o refresh token |
| `POST` | `/logout` | ✓ | Revoga o refresh token atual |
| `POST` | `/forgot-password` | – | Emite um token de reset |
| `POST` | `/reset-password` | – | |
| `POST` | `/change-password` | ✓ | Recusa repetir a mesma senha |
| `GET` | `/me` | ✓ | |
| `GET` | `/sessions` | ✓ | Refresh tokens ativos |
| `DELETE` | `/sessions` | ✓ | Revoga todas as sessões |

Access tokens expiram em 15 min, refresh tokens em 7 dias e são persistidos por sessão (`refresh_tokens`). Senhas com bcrypt. Toda falha é uma exceção tipada (`InvalidCredentialsException`, `EmailAlreadyExistsException`, …) renderizada pelo error handler global.

### Módulo user — `/api/profile`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` / `PUT` / `PATCH` | `/` | ✓ | Lê ou atualiza o próprio perfil |
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Atualizações por campo; `/status` é legado — `online` · `away` · `busy` definem o status manual da presença (`online` → `available`), `offline` → 400 |
| `POST` / `DELETE` | `/avatar` | ✓ | Upload multipart, redimensionado com sharp, salvo local ou no S3 |
| `POST` | `/online` · `/offline` | ✓ | Legado: `/online` define o status manual da presença como `available`; `/offline` → 400 (fica-se offline ao desconectar) — prefira `PUT /api/presence/status` |
| `GET` | `/stats` · `/settings` | ✓ | |
| `GET` | `/:userId` | ✓ | Perfil público de outro usuário — `id`, `username`, `displayName`, `avatarUrl`, `bio` (sem `status`/`lastSeenAt`: use a API de presença) |

### Contatos — `/api/contacts`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/` | ✓ | Lista os próprios contatos, paginado, com filtros; cada item traz `presence: { state, lastSeenAt }` (`presence: null` com o Redis fora do ar — a listagem em si nunca depende do Redis); `orderBy=lastInteraction` ordena pela última mensagem direta (quem nunca conversou fica no fim); `orderBy=presence` ordena a página carregada — online, ausente, ocupado e depois offline pelo visto por último mais recente |
| `POST` | `/` | ✓ | Adiciona um contato |
| `GET` | `/favorites` | ✓ | Lista contatos favoritos |
| `GET` | `/online` | ✓ | Contatos conectados agora (online, ausente ou ocupado), ordenados por nome, cada um com `presence` |
| `GET` | `/stats` | ✓ | Contadores de contatos |
| `GET` | `/:contactId` | ✓ | Obtém um contato |
| `PATCH` | `/:contactId` | ✓ | Atualiza apelido e/ou flag de favorito |
| `DELETE` | `/:contactId` | ✓ | Remove um contato |

Um usuário bloqueado não é contato: `GET`/`PATCH`/`DELETE /:contactId` respondem 404 para ele, e o desbloqueio só acontece por `DELETE /api/blocks/:userId`.

O usuário exibido num contato (`contact: { id, username, displayName, avatarUrl }`), em `GET /api/blocks`, na busca de usuários e nos participantes das conversas não traz `status` nem `lastSeenAt`: o estado e o visto por último de outro usuário vêm só da presença (`presence` nos itens de contato, `GET /api/presence`, eventos `presence:*`), que esconde pares bloqueados. **Mudança incompatível:** clientes que liam `status`/`lastSeenAt` dessas respostas precisam passar a usar a presença. O próprio perfil (`GET /api/profile`) continua trazendo os dois.

### Bloqueios — `/api/blocks`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/` | ✓ | Lista usuários bloqueados |
| `POST` | `/` | ✓ | Bloqueia um usuário; publica `user:blocked` no EventBus |
| `DELETE` | `/:userId` | ✓ | Desbloqueia um usuário; publica `user:unblocked` |

### Busca de usuários — `/api/users`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/search?query=` | ✓ | Busca por username, nome de exibição (substring, case-insensitive) ou email (apenas endereço exato, case-insensitive — nunca substring); exclui quem faz a requisição e, por padrão, qualquer usuário bloqueado por um lado ou pelo outro (`excludeBlocked=false` desativa) |

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
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions?, clientMessageId? }` — texto de 1 a 10.000 caracteres; 403 em conversa 1:1 com bloqueio em qualquer sentido; reenviar o mesmo `clientMessageId` (UUID gerado pelo cliente) devolve a mensagem já gravada em vez de duplicar (409 se o id foi usado em outra conversa) |
| `DELETE` | `/:id/messages/:messageId` | ✓ | Só o autor; soft delete, idempotente |
| `POST` | `/:id/read` | ✓ | `{ messageId }` — marca como lidas (e entregues) todas as mensagens de outros autores até `messageId`, inclusive, e avança o `last_read_at` de quem pede; 204 |

As mensagens ficam só no MongoDB (coleção `messages`, índices `{ conversationId: 1, createdAt: -1, _id: -1 }` e um único parcial `{ senderId: 1, clientMessageId: 1 }` para envio idempotente); conversas e participantes ficam no PostgreSQL. Toda mensagem traz `clientMessageId` e `status: { sentAt, deliveredTo[], readBy[] }` (entradas `{ userId, at }`; mensagens apagadas mantêm o status). Sair, remover e adicionar membros rodam numa transação que trava a linha da conversa (`SELECT … FOR UPDATE`), então mudanças concorrentes não pulam a promoção de admin nem estouram o limite de 256 participantes. O módulo publica `chat:conversation-created`, `chat:conversation-updated`, `chat:conversation-deleted` (quando o último membro sai e a conversa é removida), `chat:message-sent` (o payload leva o mesmo `MessageDTO` devolvido ao cliente REST), `chat:message-deleted`, `chat:message-delivered` e `chat:message-read` no EventBus. Listeners registrados no bootstrap atualizam `contacts.last_interaction_at` a cada mensagem direta e apagam, best-effort, as mensagens da conversa no MongoDB ao receber `chat:conversation-deleted`; ambos rodam fora do caminho da requisição (subscribers `{ async: true }`).

### Tempo real — Socket.IO

O Socket.IO compartilha o servidor e a porta HTTP (`http://localhost:3000`, path `/socket.io/`). Conecte com o access token no handshake — `io(url, { auth: { token } })` (preferido) ou header `Authorization: Bearer <token>`; token ausente ou inválido falha com `connect_error` e `message: 'UNAUTHORIZED'`. No handshake o socket entra em `user:<id>` e em `conversation:<id>` de cada conversa do usuário, então toda reconexão automática restaura as rooms; já conectado, o servidor relê as conversas do usuário e reconcilia as rooms `conversation:*` (uma mudança de participação ocorrida no meio do handshake, quando os ajustes de room ainda não alcançavam o socket, é aplicada — um membro removido não continua recebendo a conversa); mensagens enviadas enquanto o cliente estava desconectado são buscadas via REST (`GET /api/conversations/:id/messages?before=`). O CORS segue a política do HTTP (`ALLOWED_ORIGINS` em produção).

**Duração da sessão.** O handshake valida o access token uma única vez, então o servidor também encerra o socket quando a sessão acaba: no `exp` do token (um timer por socket) e imediatamente quando as sessões do usuário são revogadas — `POST /api/auth/change-password`, `POST /api/auth/reset-password` e `DELETE /api/auth/sessions` publicam `auth:sessions-revoked` no EventBus e todos os sockets desse usuário caem (`disconnectSockets(true)` em `user:<id>`, entre instâncias). O cliente recebe `disconnect` com motivo `io server disconnect`, que o `socket.io-client` **não** tenta de novo: ele precisa reconectar com um token renovado (`POST /api/auth/refresh`, ou novo login após uma revogação). Access tokens JWT não são revogáveis por si, então um cliente que ainda tenha um access token válido consegue reconectar até ele expirar (15 min por padrão).

Eventos cliente → servidor (todos aceitam ack):

| Evento | Payload | Efeito / `data` do ack |
|---|---|---|
| `message:send` | `{ conversationId, text, replyTo?, mentions?, clientMessageId? }` | Mesmas regras do `POST /messages` (idempotente por `clientMessageId`); o ack traz a `MessageDTO` |
| `message:delivered` | `{ conversationId, messageId }` | Marca como entregue a quem chama (no-op para o autor); `null` |
| `message:read` | `{ conversationId, messageId }` | Igual ao `POST /:id/read`; `null` |
| `typing:start` | `{ conversationId }` | Só conversas 1:1 (grupo → 400); expira em 3 s sem novo `start`; `null` |
| `typing:stop` | `{ conversationId }` | Encerra o indicador; `null` |
| `presence:set` | `{ status }` — `available` · `away` · `busy` | Status manual de presença, mantido entre reconexões (mesma regra do `PUT /api/presence/status`); `{ state }` (o estado efetivo resultante) |

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
| `presence:update` | `user:<id>` de todos que observam o usuário (mudanças de status também chegam às outras abas dele) | `{ userId, state, lastSeenAt }` — `state` é `online` · `away` · `busy` · `offline`; `lastSeenAt` só quando offline |
| `presence:snapshot` | o socket que acabou de conectar | `{ states: [{ userId, state, lastSeenAt }] }` — todos que o usuário observa (contatos e parceiros 1:1, menos bloqueios) |

Os acks são `{ ok: true, data }` ou `{ ok: false, error: { code, message, statusCode, details? } }`, com os mesmos códigos da API REST (`VALIDATION_ERROR` 400, `NOT_FOUND` 404, `USER_BLOCKED` 403, …; falhas inesperadas → `INTERNAL_ERROR` 500). A escala horizontal usa o `@socket.io/redis-adapter` sobre duas conexões Redis duplicadas; fica ligado fora de `NODE_ENV=test`, salvo `REALTIME_REDIS_ADAPTER=false`. A ponte EventBus → Socket.IO é registrada quando o servidor sobe, e `SIGTERM`/`SIGINT` encerram sockets, conexões do adapter e bancos de forma graciosa.

Duas notas de design importantes: um reenvio de mensagem já gravada por um remetente que foi bloqueado depois ainda devolve a mensagem original (a idempotência é checada antes do bloqueio, e um reenvio não é um envio novo); e renovações de digitação dentro do TTL não são revalidadas contra o banco — só o primeiro `typing:start` de um par (socket, conversa) checa participação e tipo de conversa.

**Nota de segurança — ainda sem rate limit por socket.** Os rate limits HTTP (abaixo) cobrem só `/api`; os eventos do Socket.IO (`message:send`, `typing:*`, confirmações) não têm limite por socket nem por usuário, então um cliente autenticado consegue inundá-los. Limites por socket/usuário ficaram para o subprojeto 7 (hardening) — veja o [Roadmap](#roadmap). Até lá, se a API for exposta publicamente, rode atrás de um proxy/WAF que limite a taxa de mensagens WebSocket.

**Cliente demo** — `http://localhost:3000/demo/` é uma página estática única (JS puro, sem build) para logar, listar e abrir conversas, iniciar um 1:1 buscando usuários e ver ao vivo as mensagens, ✓ enviada / ✓✓ entregue / ✓✓ (azul) lida, "digitando…" e a presença (um indicador por conversa 1:1, visto por último no cabeçalho e um seletor de status), além de um campo de busca de mensagens no cabeçalho (os resultados mostram conversa, autor, data e o fragmento com os termos destacados; clicar abre a conversa). Guarda o access token no `localStorage`; é uma demo, não um cliente de produção. Só é servida fora de produção — com `NODE_ENV=production`, `/demo` existe apenas se `DEMO_ENABLED=true`.

### Presença — `/api/presence`

A presença é calculada a partir das conexões Socket.IO ativas e fica no Redis; o módulo `presence` é o único que mexe nessas chaves.

- **Conexões** — sorted set `presence:conns:<userId>`, um membro por socket (`<nodeId>:<socketId>`, sendo `nodeId` um UUID por processo) com o último heartbeat como score. Cada instância renova os próprios sockets a cada 15 s (`ZADD XX`); o usuário está conectado enquanto algum membro tiver menos de 30 s. Membros deixados por uma instância que caiu sem desconectar são removidos por uma varredura que toda instância roda a cada 30 s (`SCAN presence:conns:*`, `COUNT 100`), que também anuncia o offline — os usuários de uma instância que caiu ficam offline em cerca de um minuto. A chave em si expira 120 s depois da última renovação.
- **Status manual** — `presence:manual:<userId>` = `available` · `away` · `busy`, sem TTL, então sobrevive às reconexões.
- **Estado efetivo** — sem conexão → `offline`; conectado → `online` se o status manual for `available`, senão `away`/`busy`. Várias abas/dispositivos contam como um usuário só: online na primeira conexão, offline só quando a última fecha — aí `users.last_seen_at` é gravado e exposto como `lastSeenAt`.
- **Quem é avisado** — quem tem o usuário como contato mais os parceiros das conversas 1:1 dele, menos qualquer um com bloqueio em qualquer sentido. O bloqueio esconde os dois lados na hora (`presence:update` com `offline` e sem `lastSeenAt`), os endpoints da presença (`GET /api/presence`, `GET /api/contacts/online` e o `presence` de `GET /api/contacts`) respondem `offline` sem `lastSeenAt` para pares bloqueados, e nenhum outro endpoint expõe `status`/`lastSeenAt` de outro usuário; o desbloqueio envia o estado real aos dois.

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/api/presence?userIds=<uuid>,<uuid>` | ✓ | Até 100 ids → `{ items: [{ userId, state, lastSeenAt }] }` |
| `PUT` | `/api/presence/status` | ✓ | `{ status }` — `available` · `away` · `busy`; 204 |
| `GET` | `/api/contacts/online` | ✓ | Contatos conectados agora, ordenados por nome, cada um com `presence` |

`GET /api/presence` e `GET /api/contacts/online` precisam do Redis (respondem 500 enquanto ele estiver fora do ar); `GET /api/contacts` degrada para `presence: null`.

O módulo publica `presence:online`, `presence:offline` e `presence:status-changed` no EventBus. Os legados `PUT /api/profile/status` e `POST /api/profile/online` passam a definir o status manual, `offline` responde 400 (fica-se offline ao desconectar) e `users.status` deixa de ser gravado para presença.

Limitações conhecidas:

- Se os heartbeats de uma instância falharem por mais de 30 s (Redis fora do ar), os sockets dela aparecem offline até reconectarem — o heartbeat usa `ZADD XX`, que não traz de volta um membro que a varredura já removeu.
- A presença compara horários de heartbeat gravados por instâncias diferentes, então os relógios dos nós precisam estar sincronizados (NTP).
- Uma queda do Redis de mais de 120 s (a expiração da chave de conexões) pode terminar sem evento de offline nem `last_seen_at` para os usuários daquela instância: as chaves expiram antes de qualquer varredura vê-las.
- O socket é desconectado quando o access token expira; para evitar um offline breve, o cliente deve conectar o socket novo (com o token renovado) antes de fechar o antigo.

### Cache — Redis

O `CacheService` (`src/shared/cache`) guarda JSON em `cache:*` com TTL padrão de 300 s (`cache:conv:participants:<id>` usa 60 s) e recorre à fonte da verdade em qualquer falha do Redis (log `warn` — uma requisição nunca falha por causa do cache).

| Chave | Conteúdo | Lida por | Invalidada por (EventBus, síncrono) |
|---|---|---|---|
| `cache:user:<id>` | perfil público (interno: inclui `lastSeenAt`, nunca enviado a outros usuários) | participantes das conversas e `lastSeenAt` da presença (`userService.getMultiple` / `findByIdPublic`) | `user:updated` (perfil e avatar) e as escritas do próprio `UserService` — atualização, remoção, visto por último — que apagam a chave diretamente |
| `cache:conv:participants:<id>` | ids e papéis dos participantes (TTL de 60 s) | envio e listagem de mensagens, confirmação de entrega, `isParticipant`, `getParticipantIds` | `chat:conversation-created` / `-updated` / `-deleted`, e o `ConversationService` diretamente depois de sair / adicionar membros / remover membro (DEL imediato + segundo DEL 1 s depois) |
| `cache:blocks:<id>` | ids com bloqueio em qualquer sentido | `isBlockedByEither`, audiência da presença | `user:blocked` / `user:unblocked` (os dois usuários; DEL imediato + segundo DEL 1 s depois) |
| `cache:presence:audience:<id>` | quem recebe as mudanças de presença do usuário | ponte da presença | bloqueio/desbloqueio, `user:contact-added` / `-removed`, nova conversa 1:1 (DEL imediato + segundo DEL 1 s depois) |

Os subscribers de invalidação são síncronos: a requisição que mudou o dado só termina depois de a chave ser apagada, e o TTL limita a defasagem se um evento se perder. Participantes, bloqueios e audiências também recebem um segundo DEL 1 s depois (`DelayedCacheInvalidator`, timer `unref` sem aguardar): uma leitura que consultou o banco antes da mudança e terminou depois do primeiro DEL gravaria de volta o valor antigo por todo o TTL (ex.: quem acabou de ser bloqueado seguiria enviando mensagens). O `POST /:id/read` continua lendo a linha da participação, porque `last_read_at` muda a cada leitura.

### Busca — `/api/search`

Busca full-text nas mensagens das conversas das quais o usuário participa **no momento da busca**. O módulo `search` indexa as mensagens no Elasticsearch (`MessageIndexer`: subscribers `{ async: true }` de `chat:message-sent` e `chat:message-deleted`, então a indexação nunca atrasa um envio); o MongoDB continua sendo a fonte da verdade — os acertos são hidratados a partir dele, então uma mensagem apagada nesse meio-tempo nunca aparece.

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/api/search/messages` | ✓ | `q` (obrigatório, 1–200 caracteres) · `conversationId` · `senderId` · `from` / `to` (ISO 8601 com fuso, `from ≤ to`) · `limit` (1–100, padrão 20) → `{ items: [{ message, highlights, score }], total, facets: { conversations: [{ conversationId, count }] }, tookMs }` |

- **Índice** — `messages` (sobrescrito por `ELASTICSEARCH_MESSAGES_INDEX`), criado na inicialização quando não existe e nunca alterado quando existe; mapping `dynamic: strict` com `messageId`, `conversationId`, `senderId` (keywords), `content` (texto) e `createdAt` (data), `_id` = id da mensagem; mensagens apagadas saem dele. Um shard e nenhuma réplica servem a um nó de desenvolvimento — defina as réplicas em produção.
- **Acentos e plurais** — o analyzer `pt_folded` (minúsculas → remoção de acentos → stopwords do português → `-oes` vira `-ao` → stemmer leve do português) roda na indexação e na consulta, então "coração", "coracao", "CORAÇÕES" e "corações" se encontram; `content.exact` (sem stemmer) pesa o dobro, e a forma exata aparece primeiro. Lacuna conhecida: plurais irregulares como "pães" não casam com "pão".
- **Relevância e destaque** — primeiro a relevância, depois as mais recentes; até 3 fragmentos de 150 caracteres por mensagem com `<mark>…</mark>`, com o texto da mensagem escapado para HTML pelo Elasticsearch (seguro para inserir como HTML); `facets.conversations` traz as 10 conversas com mais acertos; `total` é limitado a 10.000 (padrão do Elasticsearch).
- **Autorização** — só as conversas das quais o usuário participa agora (filtro `terms`, conferido de novo na hidratação); um `conversationId` do qual ele não participa responde 404, igual a uma conversa que não existe.
- **Limites e erros** — 30 requisições por minuto por IP nesta rota; Elasticsearch fora do ar → 503 `SEARCH_UNAVAILABLE` (nada mais na API depende dele); parâmetros inválidos → 400.
- **Atualização e recuperação** — uma mensagem nova aparece na busca em cerca de 1 s (o refresh do índice). Falhas de indexação são logadas com o `messageId`; `npm run search:reindex` percorre o MongoDB em lotes de 500 (por `_id`), indexa as mensagens ativas e remove as apagadas (idempotente — é também como as mensagens anteriores à busca entram no índice), e `npm run search:reindex -- --recreate` apaga e recria o índice antes (depois de mudar o mapping ou o analyzer). Sai com código 1 se algum item falhar.

Limitações conhecidas: a busca cobre só o conteúdo das mensagens — nomes de autor e de conversa não são indexados (nomes mudam; filtre por `senderId`/`conversationId`); mensagens de uma conversa apagada ficam no índice até um reindex com `--recreate`, mas ninguém consegue recuperá-las (ninguém participa mais daquela conversa); não há paginação além de `limit` (uma consulta devolve no máximo 100 acertos).

### Rate limit

Construído sobre `express-rate-limit` com store no Redis (`rate-limit-redis`) por padrão; um `MemoryStore` é selecionado automaticamente quando `NODE_ENV=test` (a suíte roda sem precisar de Redis), e a opção `store` do `createRateLimiter` permite injetar qualquer outro store. Todos os limites são identificados pelo IP do cliente (chave padrão do `express-rate-limit`), não por conta — o limiter de login conta tentativas com falha por IP, então também pode limitar várias contas que compartilhem o mesmo IP de origem. `/auth/register`, `/forgot-password` e `/reset-password` compartilham a mesma instância de limiter (mesmo prefixo de chave), então juntas dividem um único bucket de 5 requisições por IP na janela, não 5 cada uma.

| Escopo | Janela | Limite | Observações |
|---|---|---|---|
| `/api` (global) | 15 min | 100 req | Falha aberto (`passOnStoreError`) se o store der erro, para uma falha do Redis não derrubar a API inteira |
| `/auth/register` · `/forgot-password` · `/reset-password` | 15 min | 5 req | Um único bucket por IP entre as três rotas; falha fechado se o store der erro |
| `/auth/login` | 15 min | 5 tentativas com falha | Logins bem-sucedidos não contam (`skipSuccessfulRequests`); falha fechado se o store der erro |
| `/api/search/messages` | 1 min | 30 req | Bucket próprio por IP (prefixo `rl:search:`), além do limite global |

`TRUST_PROXY` (não definida por padrão) controla o `app.set('trust proxy', …)`, que por sua vez controla como o IP do cliente (e portanto a chave do rate limit) é obtido atrás de um proxy reverso. Deixe sem definir para manter o padrão do Express (`false`, só conexões diretas); defina como `true`/`false`, um número de hops (ex.: `1`) ou um preset/IP do Express como `loopback` ao rodar atrás de um proxy confiável — veja a seção Configuração, abaixo. Evite `TRUST_PROXY=true` fora de um ambiente controlado: ele confia em qualquer header `X-Forwarded-For`, então clientes podem forjar o IP e escapar do rate limit — prefira o número de hops ou os IPs/sub-redes dos proxies.

### Infraestrutura compartilhada — `src/shared`

- **Bancos** — helpers de conexão para PostgreSQL (Sequelize, com migrations e seeders), Redis (ioredis), MongoDB (Mongoose) e Elasticsearch, todos iniciados e encerrados pelo `bootstrap.ts`.
- **EventBus** — publish/subscribe em processo com prioridades, handlers de execução única, assinaturas wildcard e contadores; os módulos emitem eventos de domínio (ex.: eventos de auth, `user:blocked` / `user:unblocked`, `user:updated`, `user:contact-added`, `chat:message-sent`, `presence:online` / `presence:offline`) por ele; subscribers `{ async: true }` rodam fora do caminho de quem publica.
- **Cache** — `CacheService`: JSON no Redis em `cache:*`, TTL padrão de 300 s (participantes usam 60 s), leitura/escrita em lote e degradação graciosa quando o Redis está fora do ar; `DelayedCacheInvalidator` apaga na hora e de novo 1 s depois contra write-backs obsoletos.
- **Logger** — estruturado, com níveis e categorias; saída no console em desenvolvimento e sink opcional no MongoDB.
- **Middlewares** — Helmet, CORS (compartilhado com o Socket.IO), request id, request logger, rate limiter com Redis (store injetável), upload via multer, handlers de 404 e de erro.
- **Validação** — schemas Zod por módulo, middleware `validate` e schemas comuns de paginação.
- **Erros** — hierarquia `AppError` com status HTTP e códigos de erro, serializada de forma consistente.
- **Storage** — `StorageService` com providers de disco local e S3-compatível, `ImageProcessorService` sobre o sharp.

## Como rodar

Requer Docker e Docker Compose (para os quatro bancos) e Node.js 22 (para rodar a API no host — veja a [limitação conhecida](#limitacao-conhecida-container-da-app) abaixo).

```bash
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform
cp .env.example .env          # preencha as senhas — veja Configuração

docker compose up -d postgres redis mongodb elasticsearch
npm install
```

| Serviço | Container | Porta | Variável de porta no host |
|---|---|---|---|
| PostgreSQL 17 | `rtm-postgres` | 5432 | `POSTGRES_HOST_PORT` |
| Redis 7 | `rtm-redis` | 6379 | `REDIS_HOST_PORT` |
| MongoDB 8 | `rtm-mongodb` | 27017 | `MONGO_HOST_PORT` |
| Elasticsearch 8.17 | `rtm-elasticsearch` | 9200 · 9300 | `ELASTIC_HOST_PORT` · `ELASTIC_TRANSPORT_HOST_PORT` |

Toda porta do container é mapeada a partir de uma variável `*_HOST_PORT` (padrões acima); defina-as no `.env` se essas portas já estiverem em uso na máquina.

### Rodando a app (no host)

<a id="limitacao-conhecida-container-da-app"></a>
**Limitação conhecida:** o container `rtm-app` do `docker-compose.yml` ainda não funciona — ele monta o repositório como bind mount (`.:/app`), mas o Dockerfile nunca roda `npm install` dentro da imagem, e um build do `sharp` feito no host gera binários glibc que não rodam na imagem base Alpine do container. Até isso ser corrigido (acompanhe no [roadmap](#roadmap)), rode a app no host contra os bancos containerizados acima.

Migrations e seed, a partir do host:

```bash
set -a && source .env && set +a

DB_HOST=localhost DB_PORT=${POSTGRES_HOST_PORT:-5432} npm run db:migrate
DB_HOST=localhost DB_PORT=${POSTGRES_HOST_PORT:-5432} npm run db:seed   # usuários de demonstração, opcional
```

Depois suba a app em si:

```bash
MONGO_USER_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_USER))")
MONGO_PASSWORD_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_PASSWORD))")

DB_HOST=localhost DB_PORT=${POSTGRES_HOST_PORT:-5432} \
REDIS_HOST=localhost REDIS_PORT=${REDIS_HOST_PORT:-6379} \
MONGODB_URL="mongodb://${MONGO_USER_ENC}:${MONGO_PASSWORD_ENC}@localhost:${MONGO_HOST_PORT:-27017}/${MONGO_DB}?authSource=admin" \
ELASTICSEARCH_URL="http://localhost:${ELASTIC_HOST_PORT:-9200}" \
PORT=${APP_HOST_PORT:-3000} npm run dev
```

A API escuta em `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` por padrão); o Socket.IO usa a mesma porta (`/socket.io/`) e o cliente demo fica em `http://localhost:${APP_HOST_PORT:-3000}/demo/`.

`MONGO_USER`/`MONGO_PASSWORD` são URL-encoded antes de montar a `MONGODB_URL`: uma senha com caracteres reservados de URI (`@`, `:`, `[`, `]`, …) sem codificar quebra a connection string, e o `bootstrap()` falha sem nunca logar o motivo.

## Desenvolvimento

```bash
npm run dev            # tsx watch src/server.ts
npm run build          # tsc → dist/
npm start              # node dist/server.js
npm run lint           # eslint src --fix
npm run format         # prettier --write (src + tests)
npm run format:check   # prettier --check, igual ao CI
npm test               # jest --coverage --all
npm run test:watch     # jest --watch --coverage=false
npm run db:migrate         # sequelize-cli db:migrate (via tsx, caminhos no .sequelizerc)
npm run db:migrate:undo    # sequelize-cli db:migrate:undo
npm run db:seed             # sequelize-cli db:seed:all
npm run search:reindex      # sincroniza o índice de mensagens do Elasticsearch com o MongoDB (-- --recreate recria)
```

**Testes** — 2.963 testes Jest em 203 suítes (unitários em `tests/unit`; testes de feature HTTP com supertest e de integração WebSocket com socket.io-client em `tests/feature`; o Redis e o Elasticsearch são substituídos por fakes em memória, `tests/support/redis/fakeRedis.ts` e `tests/support/elasticsearch/fakeSearchClient.ts`, com a semântica dos comandos e o formato das respostas conferidos contra o Redis 7 e o Elasticsearch 8.17). Os 13 testes de `tests/integration/search/elasticsearch.int.test.ts` rodam contra um Elasticsearch de verdade só quando `ELASTICSEARCH_IT_URL` está definida (ex.: `http://localhost:9200`) e são pulados nos demais casos, inclusive no CI — eles comprovam o analyzer (acentos, plurais, stemmer), o destaque escapado e as consultas exatas. O módulo de config lê as variáveis de banco no import, então elas precisam estar preenchidas mesmo para testes unitários: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB`, `ELASTIC_PASSWORD` (qualquer valor serve; nenhum banco é acessado). O CI define todas e, a cada push e pull request, roda ESLint, uma checagem do Prettier, `tsc --noEmit` e a suíte. O build falha se a cobertura cair abaixo do `coverageThreshold` em `jest.config.ts` — statements, branches, funções e linhas todos em 90%. A cobertura é medida sobre todo arquivo em `src/`, não só os que algum teste importa; medida com `node node_modules/.bin/jest --coverage --all`, a cobertura atual é 100% statements, 100% branches, 100% funções, 100% linhas.

## Estrutura do projeto

```
src/
├── app.ts                    app Express: pipeline de middlewares e montagem de rotas
├── bootstrap.ts              conecta e desconecta os quatro bancos
├── server.ts                 ponto de entrada: servidor HTTP + Socket.IO, encerramento gracioso
├── database/                 migrations, seeders e factories do Sequelize
├── modules/
│   ├── auth/                 controllers · services (Auth, Token, Password) ·
│   │                         repositories (User, RefreshToken) · exceções ·
│   │                         eventos · validação · rotas
│   ├── user/                 controllers de Profile, Contact, Block e User ·
│   │                         services (Profile, User, Contact, Avatar) ·
│   │                         repositories · models · listeners de cache · rotas
│   ├── chat/                 controllers de Conversation e Message · services ·
│   │                         repositories (PostgreSQL + MongoDB) · models ·
│   │                         listeners · validação · rotas
│   ├── realtime/             servidor Socket.IO · middlewares do handshake ·
│   │                         handlers de mensagem/digitação · TypingService ·
│   │                         ponte EventBus → rooms
│   ├── presence/             PresenceService (Redis) · hooks de conexão,
│   │                         heartbeat e varredura · ponte presence:update ·
│   │                         controller REST · listeners de invalidação
│   └── search/               SearchIndexService (índice, reindex) ·
│                             SearchService (consulta, hidratação) · listeners
│                             do MessageIndexer · controller · rotas · comando de reindex
├── scripts/                  reindexMessages.ts (npm run search:reindex)
└── shared/
    ├── cache/                CacheService (JSON no Redis, TTL, degradação)
    ├── config/               env → config tipada (database, upload)
    ├── database/             clientes postgres · redis · mongo · elasticsearch
    ├── event-bus/            EventBus + EventHandler
    ├── logger/               Logger + model de log no Mongo
    ├── middlewares/          helmet · cors · requestId · requestLogger ·
    │                         rateLimiter · upload · notFound · errorHandler
    ├── services/             FileService · ImageProcessorService · StorageService
    ├── validation/           middleware validate + schemas comuns
    ├── errors/ interfaces/ types/ constants/ utils/
public/
└── demo/                     cliente demo estático (HTML + JS puro), servido em /demo
tests/
├── unit/                     espelha src/
├── feature/                  supertest contra o app Express
├── integration/              suítes opcionais contra serviços reais (ELASTICSEARCH_IT_URL)
└── support/                  fakes em memória (repositórios do chat, Redis, Elasticsearch, sockets)
```

## Configuração

O `.env.example` lista todas as variáveis. As que importam:

| Variável | Uso |
|---|---|
| `PORT`, `NODE_ENV` | Porta HTTP (3000) e ambiente |
| `TRUST_PROXY` | `app.set('trust proxy', …)` — vale também para o IP do cliente Socket.IO (mesma regra do `req.ip`, via `proxy-addr`); sem definir mantém o padrão do Express (`false`) — veja Rate limit, acima; prefira número de hops ou IPs dos proxies a `true` (spoof de IP) |
| `ALLOWED_ORIGINS` | Origens de CORS separadas por vírgula em produção (HTTP e Socket.IO); fora de produção qualquer origem é aceita |
| `DEMO_ENABLED` | `true` serve o cliente demo em `/demo` em produção (fora de produção ele é sempre servido) |
| `REALTIME_REDIS_ADAPTER` | `false` mantém o Socket.IO no adapter em memória (uma instância); senão o Redis adapter é usado fora de `NODE_ENV=test` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL (host `postgres` dentro do Compose) |
| `REDIS_PASSWORD` | Auth do Redis |
| `MONGO_USER` / `MONGO_PASSWORD` / `MONGO_DB` | MongoDB |
| `ELASTIC_PASSWORD` | Elasticsearch |
| `ELASTICSEARCH_MESSAGES_INDEX` | Nome do índice de busca das mensagens (padrão `messages`) |
| `STORAGE_PROVIDER` | `local` ou `s3` |
| `LOCAL_STORAGE_PATH`, `PUBLIC_URL` | Provider local |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_REGION` / `AWS_S3_ENDPOINT` | Provider S3 (qualquer endpoint compatível) |

## Roadmap

- [x] Esqueleto — Express 5, TypeScript, ESLint + Prettier, Jest, Docker Compose com os quatro bancos
- [x] Infraestrutura compartilhada — conexões, EventBus, logger, middlewares, validação, erros, storage
- [x] Auth — registro, login, rotação de refresh token, sessões, reset e troca de senha
- [x] Perfis — CRUD de perfil, upload de avatar, status, configurações, flag de presença
- [x] Contatos, bloqueios e busca de usuários — rotas REST, eventos no EventBus, rate limit nas rotas de auth
- [x] Chat base — conversas 1:1 e em grupo, mensagens no MongoDB com paginação por cursor, API REST e eventos no EventBus
- [ ] Container `rtm-app` funcional — Dockerfile que roda `npm ci` e faz o build dentro da imagem, com uma base compatível com os binários nativos do `sharp` (veja a [limitação conhecida](#limitacao-conhecida-container-da-app))
- [x] Tempo real — Socket.IO com handshake JWT e rooms por usuário/conversa, envio idempotente, confirmações de entrega/leitura, indicador de digitação, Redis adapter e cliente demo em /demo
- [x] Presença e cache — online/ausente/ocupado sobre conexões multi-aba no Redis com heartbeat, varredura e visto por último, avisos que respeitam bloqueios, e cache Redis de perfis, participantes, bloqueios e audiências com invalidação por evento
- [ ] Notificações — entrega in-app e push
- [x] Busca — busca full-text de mensagens no Elasticsearch: analyzer de português sem distinção de acentos e plurais, relevância, destaque, filtros por conversa, autor e data, facetas, resultados só das conversas do usuário, indexação automática e comando de reindex
- [ ] Observabilidade — métricas e tracing
- [ ] Hardening — rate limit por socket/usuário nos eventos do Socket.IO (adiado do subprojeto de tempo real), revisão de segurança e acabamento da entrega

## Licença

[MIT](LICENSE) © [Gabriel Silva](https://github.com/GabeSilvaDev)
