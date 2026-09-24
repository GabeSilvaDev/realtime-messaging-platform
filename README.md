<div align="center">

# Real-Time Messaging Platform

**Backend for a real-time chat product, in Node.js and TypeScript** — Express 5 API with token auth, user profiles, contacts and chat — REST plus real-time delivery over Socket.IO with delivered/read receipts and typing indicators — today; presence, notifications and search on the way, each on the store that fits it.

[![Status](https://img.shields.io/badge/status-work%20in%20progress-f59e0b)](#roadmap)
[![CI](https://github.com/GabeSilvaDev/realtime-messaging-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/GabeSilvaDev/realtime-messaging-platform/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.17-005571?logo=elasticsearch&logoColor=white)](https://www.elastic.co)
[![Tests](https://img.shields.io/badge/tests-2521%20Jest-C21325?logo=jest&logoColor=white)](#development)
[![License](https://img.shields.io/badge/license-MIT-555)](LICENSE)

**English** · [Português (Brasil)](README.pt-BR.md)

</div>

> **Work in progress.** Authentication, profiles, contacts/blocks and chat (1:1 and group conversations, messages in MongoDB) are implemented and tested, over REST and in real time over Socket.IO — delivered/read receipts, typing indicators and a minimal demo client at `/demo`. Presence and caching are the next milestone — see the [roadmap](#roadmap).

## Architecture

```mermaid
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

Solid nodes exist today; dashed ones are planned. Each feature is a **module** (`src/modules/<name>`) with its own controllers, services, repositories, models, DTOs, validation schemas, exceptions and routes, wired through interfaces. Everything cross-cutting lives in `src/shared`.

## What exists today

### Auth module — `/api/auth`

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `POST` | `/register` | – | Creates the user, returns access + refresh tokens |
| `POST` | `/login` | – | |
| `POST` | `/refresh` | – | Rotates the refresh token |
| `POST` | `/logout` | ✓ | Revokes the current refresh token |
| `POST` | `/forgot-password` | – | Issues a reset token |
| `POST` | `/reset-password` | – | |
| `POST` | `/change-password` | ✓ | Rejects reusing the same password |
| `GET` | `/me` | ✓ | |
| `GET` | `/sessions` | ✓ | Active refresh tokens |
| `DELETE` | `/sessions` | ✓ | Revokes every session |

Access tokens expire in 15 min, refresh tokens in 7 days and are persisted per session (`refresh_tokens`). Passwords are hashed with bcrypt. Every failure is a typed exception (`InvalidCredentialsException`, `EmailAlreadyExistsException`, …) rendered by the global error handler.

### User module — `/api/profile`

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `GET` / `PUT` / `PATCH` | `/` | ✓ | Read or update the own profile |
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Field-level updates |
| `POST` / `DELETE` | `/avatar` | ✓ | Multipart upload, resized with sharp, stored locally or on S3 |
| `POST` | `/online` · `/offline` | ✓ | Presence flag |
| `GET` | `/stats` · `/settings` | ✓ | |
| `GET` | `/:userId` | – | Public profile |

### Contacts — `/api/contacts`

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `GET` | `/` | ✓ | List own contacts, paginated, with filters; `orderBy=lastInteraction` sorts by the latest direct message (contacts never messaged come last) |
| `POST` | `/` | ✓ | Add a contact |
| `GET` | `/favorites` | ✓ | List favorite contacts |
| `GET` | `/stats` | ✓ | Contact counters |
| `GET` | `/:contactId` | ✓ | Get one contact |
| `PATCH` | `/:contactId` | ✓ | Update nickname and/or favorite flag |
| `DELETE` | `/:contactId` | ✓ | Remove a contact |

A blocked user is not a contact: `GET`/`PATCH`/`DELETE /:contactId` answer 404 for them, and unblocking only happens through `DELETE /api/blocks/:userId`.

### Blocks — `/api/blocks`

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `GET` | `/` | ✓ | List blocked users |
| `POST` | `/` | ✓ | Block a user; publishes `user:blocked` on the EventBus |
| `DELETE` | `/:userId` | ✓ | Unblock a user; publishes `user:unblocked` |

### User search — `/api/users`

| Method | Endpoint | Auth | Notes |
|---|---|:---:|---|
| `GET` | `/search?query=` | ✓ | Search by username, displayName (substring, case-insensitive) or email (exact address only, case-insensitive — never substring); excludes the requester and, by default, any user blocked by either side (`excludeBlocked=false` opts out) |

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
| `POST` | `/:id/messages` | ✓ | `{ text, replyTo?, mentions?, clientMessageId? }` — text 1–10,000 characters; 403 in a 1:1 conversation where either side blocked the other; resending the same `clientMessageId` (client-generated UUID) returns the stored message instead of a duplicate (409 if that id was used in another conversation) |
| `DELETE` | `/:id/messages/:messageId` | ✓ | Author only; soft delete, idempotent |
| `POST` | `/:id/read` | ✓ | `{ messageId }` — marks every message from others up to and including `messageId` as read (and delivered), advances the caller's `last_read_at`; 204 |

Messages live only in MongoDB (`messages` collection, indexes `{ conversationId: 1, createdAt: -1, _id: -1 }` and a unique partial `{ senderId: 1, clientMessageId: 1 }` for idempotent sends); conversations and participants live in PostgreSQL. Every message carries `clientMessageId` and `status: { sentAt, deliveredTo[], readBy[] }` (entries are `{ userId, at }`; deleted messages keep their status). Leaving, removing and adding members run inside a transaction that locks the conversation row (`SELECT … FOR UPDATE`), so concurrent changes can't skip the admin promotion or overflow the 256-member limit. The module publishes `chat:conversation-created`, `chat:conversation-updated`, `chat:conversation-deleted` (when the last member leaves and the conversation is removed), `chat:message-sent` (payload carries the same `MessageDTO` returned to the REST client), `chat:message-deleted`, `chat:message-delivered` and `chat:message-read` on the EventBus. Listeners registered at bootstrap update `contacts.last_interaction_at` on every direct message and best-effort delete the conversation's messages in MongoDB on `chat:conversation-deleted`; both run off the request path (`{ async: true }` subscribers).

### Real-time — Socket.IO

Socket.IO shares the HTTP server and port (`http://localhost:3000`, path `/socket.io/`). Connect with the access token in the handshake — `io(url, { auth: { token } })` (preferred) or an `Authorization: Bearer <token>` header; a missing or invalid token fails with `connect_error` and `message: 'UNAUTHORIZED'`. During the handshake the socket joins `user:<id>` and `conversation:<id>` for each of the user's conversations, so every automatic reconnection restores the rooms; once connected, the server re-reads the user's conversations and reconciles the `conversation:*` rooms (a membership change that happened mid-handshake, when room updates couldn't reach the socket yet, is applied — a removed member doesn't keep receiving the conversation); messages sent while disconnected are fetched over REST (`GET /api/conversations/:id/messages?before=`). CORS follows the HTTP policy (`ALLOWED_ORIGINS` in production).

**Session lifetime.** The handshake validates the access token once, so the server also ends the socket when the session ends: at the token's `exp` (a per-socket timer) and immediately when the user's sessions are revoked — `POST /api/auth/change-password`, `POST /api/auth/reset-password` and `DELETE /api/auth/sessions` publish `auth:sessions-revoked` on the EventBus and every socket of that user is dropped (`disconnectSockets(true)` on `user:<id>`, across instances). The client sees `disconnect` with reason `io server disconnect`, which `socket.io-client` does **not** retry: it must reconnect with a refreshed token (`POST /api/auth/refresh`, or a new login after a revocation). JWT access tokens can't be revoked by themselves, so a client that still holds an unexpired access token can reconnect until it expires (15 min by default).

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

Two design notes worth knowing: a resend of an already-stored message by a sender who has since been blocked still returns the original message (idempotency is checked before the block check, and a resend isn't a new send); and typing renewals within the TTL aren't re-validated against the database — only the first `typing:start` for a given (socket, conversation) pair checks participation and conversation type.

**Security note — no per-socket rate limit yet.** The HTTP rate limits (below) cover `/api` only; Socket.IO events (`message:send`, `typing:*`, receipts) aren't rate-limited per socket or per user, so an authenticated client can flood them. Per-socket/per-user limits are deferred to subproject 7 (hardening) — see the [Roadmap](#roadmap). Until then, run behind a proxy/WAF that caps WebSocket message rates if the API is exposed publicly.

**Demo client** — `http://localhost:3000/demo/` is a single static page (plain JS, no build) to log in, list and open conversations, start a 1:1 chat by searching users, and watch messages, ✓ sent / ✓✓ delivered / ✓✓ (blue) read and "typing…" live. It keeps the access token in `localStorage`; it's a demo, not a production client. It's served outside production only — with `NODE_ENV=production`, `/demo` exists only if `DEMO_ENABLED=true`.

### Rate limiting

Built on `express-rate-limit` with a Redis-backed store (`rate-limit-redis`) by default; a `MemoryStore` is selected automatically when `NODE_ENV=test` (no Redis needed to run the suite), and the `store` option on `createRateLimiter` allows injecting any other store. All limits are keyed by the client's IP address (the default `express-rate-limit` key), not by account — the login limiter counts failed attempts per IP, so it can also throttle several accounts sharing the same source IP. `/auth/register`, `/forgot-password` and `/reset-password` share a single limiter instance (same key prefix), so together they share one 5-request bucket per IP within the window, not 5 requests each.

| Scope | Window | Limit | Notes |
|---|---|---|---|
| `/api` (global) | 15 min | 100 req | Fails open (`passOnStoreError`) if the store errors, so a Redis outage doesn't take the whole API down |
| `/auth/register` · `/forgot-password` · `/reset-password` | 15 min | 5 req | One shared bucket per IP across the three routes; fails closed on store errors |
| `/auth/login` | 15 min | 5 failed attempts | Successful logins aren't counted (`skipSuccessfulRequests`); fails closed on store errors |

`TRUST_PROXY` (unset by default) controls `app.set('trust proxy', …)`, which in turn controls how the client IP (and therefore the rate-limit key) is derived behind a reverse proxy. Leave it unset to keep Express's default (`false`, direct connections only); set it to `true`/`false`, a number of hops (e.g. `1`), or an Express preset/IP such as `loopback` when running behind a trusted proxy — see [Configuration](#configuration). Avoid `TRUST_PROXY=true` outside a controlled setup: it trusts any `X-Forwarded-For` header, so clients can spoof their IP and dodge the rate limit — prefer a hop count or the proxies' IPs/subnets.

### Shared infrastructure — `src/shared`

- **Databases** — connection helpers for PostgreSQL (Sequelize, with migrations and seeders), Redis (ioredis), MongoDB (Mongoose) and Elasticsearch, all started and stopped from `bootstrap.ts`.
- **EventBus** — in-process publish/subscribe with priorities, once-handlers, wildcard subscriptions and counters; modules emit domain events (e.g. auth events, `user:blocked` / `user:unblocked`, `chat:message-sent`) through it; `{ async: true }` subscribers run off the publisher's path.
- **Logger** — structured, leveled, categorised; console output in development and an optional MongoDB sink.
- **Middleware** — Helmet, CORS (shared with Socket.IO), request id, request logger, Redis-backed rate limiter (injectable store), multer upload, 404 and error handlers.
- **Validation** — Zod schemas per module plus a `validate` middleware and shared pagination schemas.
- **Errors** — `AppError` hierarchy with HTTP status and error codes, serialised consistently.
- **Storage** — `StorageService` with local-disk and S3-compatible providers, `ImageProcessorService` on top of sharp.

## Getting started

Requires Docker and Docker Compose (for the four datastores) and Node.js 22 (to run the API on the host — see [known limitation](#known-limitation-app-container) below).

```bash
git clone https://github.com/GabeSilvaDev/realtime-messaging-platform.git
cd realtime-messaging-platform
cp .env.example .env          # fill in the passwords — see Configuration

docker compose up -d postgres redis mongodb elasticsearch
npm install
```

| Service | Container | Port | Host port variable |
|---|---|---|---|
| PostgreSQL 17 | `rtm-postgres` | 5432 | `POSTGRES_HOST_PORT` |
| Redis 7 | `rtm-redis` | 6379 | `REDIS_HOST_PORT` |
| MongoDB 8 | `rtm-mongodb` | 27017 | `MONGO_HOST_PORT` |
| Elasticsearch 8.17 | `rtm-elasticsearch` | 9200 · 9300 | `ELASTIC_HOST_PORT` · `ELASTIC_TRANSPORT_HOST_PORT` |

Every container port is mapped from a `*_HOST_PORT` variable (defaults shown above); set them in `.env` if those ports are already taken on the host.

### Running the app (on the host)

<a id="known-limitation-app-container"></a>
**Known limitation:** the `rtm-app` container in `docker-compose.yml` doesn't work yet — it bind-mounts the repo (`.:/app`) but the Dockerfile never runs `npm install` inside the image, and a `sharp` build produced on the host ships glibc binaries that don't run on the container's Alpine base. Until that's fixed (tracked in the [roadmap](#roadmap)), run the app on the host against the containerised datastores above.

Migrations and seed, from the host:

```bash
set -a && source .env && set +a

DB_HOST=localhost DB_PORT=${POSTGRES_HOST_PORT:-5432} npm run db:migrate
DB_HOST=localhost DB_PORT=${POSTGRES_HOST_PORT:-5432} npm run db:seed   # optional demo users
```

Then start the app itself:

```bash
MONGO_USER_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_USER))")
MONGO_PASSWORD_ENC=$(node -e "console.log(encodeURIComponent(process.env.MONGO_PASSWORD))")

DB_HOST=localhost DB_PORT=${POSTGRES_HOST_PORT:-5432} \
REDIS_HOST=localhost REDIS_PORT=${REDIS_HOST_PORT:-6379} \
MONGODB_URL="mongodb://${MONGO_USER_ENC}:${MONGO_PASSWORD_ENC}@localhost:${MONGO_HOST_PORT:-27017}/${MONGO_DB}?authSource=admin" \
ELASTICSEARCH_URL="http://localhost:${ELASTIC_HOST_PORT:-9200}" \
PORT=${APP_HOST_PORT:-3000} npm run dev
```

The API listens on `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` by default); Socket.IO shares the same port (`/socket.io/`) and the demo client is at `http://localhost:${APP_HOST_PORT:-3000}/demo/`.

`MONGO_USER`/`MONGO_PASSWORD` are URL-encoded before building `MONGODB_URL`: a password with URI-reserved characters (`@`, `:`, `[`, `]`, …) left un-encoded breaks the connection string, and `bootstrap()` fails without ever logging why.

## Development

```bash
npm run dev            # tsx watch src/server.ts
npm run build          # tsc → dist/
npm start              # node dist/server.js
npm run lint           # eslint src --fix
npm run format         # prettier --write (src + tests)
npm run format:check   # prettier --check, as in CI
npm test               # jest --coverage --all
npm run test:watch     # jest --watch --coverage=false
npm run db:migrate         # sequelize-cli db:migrate (via tsx, paths in .sequelizerc)
npm run db:migrate:undo    # sequelize-cli db:migrate:undo
npm run db:seed             # sequelize-cli db:seed:all
```

**Tests** — 2,521 Jest tests in 167 suites (unit under `tests/unit`; HTTP feature tests with supertest and WebSocket integration tests with socket.io-client under `tests/feature`). The config module reads the database variables at import time, so they must be non-empty even for unit tests: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB`, `ELASTIC_PASSWORD` (any value works; no database is contacted). CI sets them and, on every push and pull request, runs ESLint, a Prettier check, `tsc --noEmit` and the suite. The build fails if coverage drops below the `coverageThreshold` in `jest.config.ts` — statements, branches, functions and lines all set to 90%. Coverage is collected over every file under `src/`, not only the ones a test happens to import; measured with `node node_modules/.bin/jest --coverage --all`, current coverage is 100% statements, 100% branches, 100% functions, 100% lines.

## Project structure

```
src/
├── app.ts                    Express app: middleware pipeline and route mounting
├── bootstrap.ts              connects and disconnects the four stores
├── server.ts                 entry point: HTTP server + Socket.IO, graceful shutdown
├── database/                 Sequelize migrations, seeders and factories
├── modules/
│   ├── auth/                 controllers · services (Auth, Token, Password) ·
│   │                         repositories (User, RefreshToken) · exceptions ·
│   │                         events · validation · routes
│   ├── user/                 Profile, Contact, Block and User controllers ·
│   │                         services (Profile, User, Contact, Avatar) ·
│   │                         repositories · models · routes
│   ├── chat/                 Conversation and Message controllers · services ·
│   │                         repositories (PostgreSQL + MongoDB) · models ·
│   │                         listeners · validation · routes
│   └── realtime/             Socket.IO server · handshake middlewares ·
│                             message/typing handlers · TypingService ·
│                             EventBus → rooms bridge
└── shared/
    ├── config/               env → typed config (database, upload)
    ├── database/             postgres · redis · mongo · elasticsearch clients
    ├── event-bus/            EventBus + EventHandler
    ├── logger/               Logger + Mongo log model
    ├── middlewares/          helmet · cors · requestId · requestLogger ·
    │                         rateLimiter · upload · notFound · errorHandler
    ├── services/             FileService · ImageProcessorService · StorageService
    ├── validation/           validate middleware + common schemas
    ├── errors/ interfaces/ types/ constants/ utils/
public/
└── demo/                     static demo client (HTML + plain JS), served at /demo
tests/
├── unit/                     mirrors src/
├── feature/                  supertest against the Express app
└── support/                  in-memory fakes used by feature tests
```

## Configuration

`.env.example` lists every variable. The ones that matter:

| Variable | Purpose |
|---|---|
| `PORT`, `NODE_ENV` | HTTP port (3000) and environment |
| `TRUST_PROXY` | `app.set('trust proxy', …)`; unset keeps Express's default (`false`) — see [Rate limiting](#rate-limiting); prefer a hop count or proxy IPs over `true` (IP spoofing) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins in production (HTTP and Socket.IO); any origin is allowed outside production |
| `DEMO_ENABLED` | `true` serves the demo client at `/demo` in production (it's always served outside production) |
| `REALTIME_REDIS_ADAPTER` | `false` keeps Socket.IO on the in-memory adapter (single instance); otherwise the Redis adapter is used outside `NODE_ENV=test` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL (host `postgres` inside Compose) |
| `REDIS_PASSWORD` | Redis auth |
| `MONGO_USER` / `MONGO_PASSWORD` / `MONGO_DB` | MongoDB |
| `ELASTIC_PASSWORD` | Elasticsearch |
| `STORAGE_PROVIDER` | `local` or `s3` |
| `LOCAL_STORAGE_PATH`, `PUBLIC_URL` | Local provider |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_REGION` / `AWS_S3_ENDPOINT` | S3 provider (any S3-compatible endpoint) |

## Roadmap

- [x] Project skeleton — Express 5, TypeScript, ESLint + Prettier, Jest, Docker Compose with the four stores
- [x] Shared infrastructure — connections, EventBus, logger, middleware, validation, errors, storage
- [x] Auth — register, login, refresh-token rotation, sessions, password reset and change
- [x] User profiles — profile CRUD, avatar upload, status, settings, presence flag
- [x] Contacts, blocks and user search — REST endpoints, EventBus events, rate limiting on auth routes
- [x] Chat base — 1:1 and group conversations, messages in MongoDB with cursor pagination, REST API and EventBus events
- [ ] Working `rtm-app` container — Dockerfile that runs `npm ci` and builds inside the image, with a base compatible with `sharp`'s native bindings (see [known limitation](#known-limitation-app-container))
- [x] Real-time — Socket.IO with JWT handshake and per-user/per-conversation rooms, idempotent sends, delivered/read receipts, typing indicators, Redis adapter and a demo client at /demo
- [ ] Presence and cache — online/offline status with heartbeat, conversation and profile caching on Redis
- [ ] Notifications — in-app and push delivery
- [ ] Search — message search on Elasticsearch
- [ ] Observability — metrics and tracing
- [ ] Hardening — per-socket/per-user rate limiting for Socket.IO events (deferred from the real-time subproject), security review and delivery polish

## License

[MIT](LICENSE) © [Gabriel Silva](https://github.com/GabeSilvaDev)
