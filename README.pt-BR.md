<div align="center">

# Real-Time Messaging Platform

**Backend de um produto de chat em tempo real, em Node.js e TypeScript** — API Express 5 com autenticação por token e perfis de usuário hoje; mensagens via WebSocket, presença, notificações e busca a caminho, cada um no banco que melhor o atende.

[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-f59e0b)](#roadmap)
[![CI](https://github.com/GabeSilvaDev/realtime-messaging-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/GabeSilvaDev/realtime-messaging-platform/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.17-005571?logo=elasticsearch&logoColor=white)](https://www.elastic.co)
[![Testes](https://img.shields.io/badge/testes-2062%20Jest-C21325?logo=jest&logoColor=white)](#desenvolvimento)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-555)](LICENSE)

[English](README.md) · **Português (Brasil)**

</div>

> **Em desenvolvimento.** Autenticação, perfis e a infraestrutura compartilhada (bancos, event bus, logger, validação, middlewares, armazenamento de arquivos) estão implementados e testados. As mensagens em si são o próximo marco — veja o [roadmap](#roadmap).

## Arquitetura

```mermaid
flowchart LR
    C[Cliente] -->|HTTP · Bearer JWT| API[API Express 5]
    API --> AUTH[módulo auth]
    API --> USER[módulo user]
    API -.-> CHAT[chat · WebSocket]
    API -.-> NOTIF[notificações]
    API -.-> SEARCH[busca]
    AUTH & USER --> PG[(PostgreSQL<br/>Sequelize)]
    AUTH & USER --> RD[(Redis<br/>rate limit · cache)]
    USER --> ST[(Storage<br/>local / S3)]
    API --> LOG[(MongoDB<br/>logs estruturados)]
    CHAT -.-> MG[(MongoDB<br/>mensagens)]
    SEARCH -.-> ES[(Elasticsearch)]
    AUTH & USER --> EB{{EventBus}}

    classDef planned stroke-dasharray: 5 5,opacity:0.6
    class CHAT,NOTIF,SEARCH,MG,ES planned
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
| `PUT` | `/display-name` · `/bio` · `/status` · `/settings` | ✓ | Atualizações por campo |
| `POST` / `DELETE` | `/avatar` | ✓ | Upload multipart, redimensionado com sharp, salvo local ou no S3 |
| `POST` | `/online` · `/offline` | ✓ | Flag de presença |
| `GET` | `/stats` · `/settings` | ✓ | |
| `GET` | `/:userId` | – | Perfil público |

### Contatos — `/api/contacts`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/` | ✓ | Lista os próprios contatos, paginado, com filtros |
| `POST` | `/` | ✓ | Adiciona um contato |
| `GET` | `/favorites` | ✓ | Lista contatos favoritos |
| `GET` | `/stats` | ✓ | Contadores de contatos |
| `GET` | `/:contactId` | ✓ | Obtém um contato |
| `PATCH` | `/:contactId` | ✓ | Atualiza apelido e/ou flag de favorito |
| `DELETE` | `/:contactId` | ✓ | Remove um contato |

### Bloqueios — `/api/blocks`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/` | ✓ | Lista usuários bloqueados |
| `POST` | `/` | ✓ | Bloqueia um usuário; publica `user:blocked` no EventBus |
| `DELETE` | `/:userId` | ✓ | Desbloqueia um usuário; publica `user:unblocked` |

### Busca de usuários — `/api/users`

| Método | Endpoint | Auth | Observações |
|---|---|:---:|---|
| `GET` | `/search?query=` | ✓ | Busca por username, email ou nome de exibição; exclui quem faz a requisição e usuários bloqueados |

### Rate limit

Construído sobre `express-rate-limit` com store no Redis (`rate-limit-redis`); um `MemoryStore` é injetado nos testes. Todos os limites são identificados pelo IP do cliente (chave padrão do `express-rate-limit`), não por conta — o limiter de login conta tentativas com falha por IP, então também pode limitar várias contas que compartilhem o mesmo IP de origem.

| Escopo | Janela | Limite | Observações |
|---|---|---|---|
| `/api` (global) | 15 min | 100 req | Aplicado a toda rota da API |
| `/auth/register` · `/forgot-password` · `/reset-password` | 15 min | 5 req | |
| `/auth/login` | 15 min | 5 tentativas com falha | Logins bem-sucedidos não contam (`skipSuccessfulRequests`) |

### Infraestrutura compartilhada — `src/shared`

- **Bancos** — helpers de conexão para PostgreSQL (Sequelize, com migrations e seeders), Redis (ioredis), MongoDB (Mongoose) e Elasticsearch, todos iniciados e encerrados pelo `bootstrap.ts`.
- **EventBus** — publish/subscribe em processo com prioridades, handlers de execução única, assinaturas wildcard e contadores; os módulos emitem eventos de domínio (ex.: eventos de auth, `user:blocked` / `user:unblocked`) por ele.
- **Logger** — estruturado, com níveis e categorias; saída no console em desenvolvimento e sink opcional no MongoDB.
- **Middlewares** — Helmet, CORS, request id, request logger, rate limiter com Redis (store injetável), upload via multer, handlers de 404 e de erro.
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

A API escuta em `http://localhost:${APP_HOST_PORT:-3000}/api` (`3000` por padrão).

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
```

**Testes** — 2.062 testes Jest em 122 suítes (unitários em `tests/unit`, testes de feature HTTP com supertest em `tests/feature`). O módulo de config lê as variáveis de banco no import, então elas precisam estar preenchidas mesmo para testes unitários: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB`, `ELASTIC_PASSWORD` (qualquer valor serve; nenhum banco é acessado). O CI define todas e, a cada push e pull request, roda ESLint, uma checagem do Prettier, `tsc --noEmit` e a suíte. O build falha se a cobertura cair abaixo do `coverageThreshold` em `jest.config.ts` — statements, branches, funções e linhas todos em 90%. A cobertura é medida sobre todo arquivo em `src/`, não só os que algum teste importa; medida com `node node_modules/.bin/jest --coverage --all`, a cobertura atual é 100% statements, 100% branches, 100% funções, 100% linhas.

## Estrutura do projeto

```
src/
├── app.ts                    app Express: pipeline de middlewares e montagem de rotas
├── bootstrap.ts              conecta e desconecta os quatro bancos
├── server.ts                 ponto de entrada
├── database/                 migrations, seeders e factories do Sequelize
├── modules/
│   ├── auth/                 controllers · services (Auth, Token, Password) ·
│   │                         repositories (User, RefreshToken) · exceções ·
│   │                         eventos · validação · rotas
│   └── user/                 controller de Profile · services (Profile, User,
│                             Contact, Avatar) · repositories · models · rotas
└── shared/
    ├── config/               env → config tipada (database, upload)
    ├── database/             clientes postgres · redis · mongo · elasticsearch
    ├── event-bus/            EventBus + EventHandler
    ├── logger/               Logger + model de log no Mongo
    ├── middlewares/          helmet · cors · requestId · requestLogger ·
    │                         rateLimiter · upload · notFound · errorHandler
    ├── services/             FileService · ImageProcessorService · StorageService
    ├── validation/           middleware validate + schemas comuns
    ├── errors/ interfaces/ types/ constants/ utils/
tests/
├── unit/                     espelha src/
└── feature/                  supertest contra o app Express
```

## Configuração

O `.env.example` lista todas as variáveis. As que importam:

| Variável | Uso |
|---|---|
| `PORT`, `NODE_ENV` | Porta HTTP (3000) e ambiente |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL (host `postgres` dentro do Compose) |
| `REDIS_PASSWORD` | Auth do Redis |
| `MONGO_USER` / `MONGO_PASSWORD` / `MONGO_DB` | MongoDB |
| `ELASTIC_PASSWORD` | Elasticsearch |
| `STORAGE_PROVIDER` | `local` ou `s3` |
| `LOCAL_STORAGE_PATH`, `PUBLIC_URL` | Provider local |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_REGION` / `AWS_S3_ENDPOINT` | Provider S3 (qualquer endpoint compatível) |

## Roadmap

- [x] Esqueleto — Express 5, TypeScript, ESLint + Prettier, Jest, Docker Compose com os quatro bancos
- [x] Infraestrutura compartilhada — conexões, EventBus, logger, middlewares, validação, erros, storage
- [x] Auth — registro, login, rotação de refresh token, sessões, reset e troca de senha
- [x] Perfis — CRUD de perfil, upload de avatar, status, configurações, flag de presença
- [x] Contatos, bloqueios e busca de usuários — rotas REST, eventos no EventBus, rate limit nas rotas de auth
- [ ] Container `rtm-app` funcional — Dockerfile que roda `npm ci` e faz o build dentro da imagem, com uma base compatível com os binários nativos do `sharp` (veja a [limitação conhecida](#limitacao-conhecida-container-da-app))
- [ ] Chat — conversas e mensagens via Socket.IO, histórico no MongoDB
- [ ] Presença — status online e indicador de digitação via Redis pub/sub
- [ ] Notificações — entrega in-app e push
- [ ] Busca — busca de mensagens no Elasticsearch
- [ ] Observabilidade — métricas e tracing

## Licença

[MIT](LICENSE) © [Gabriel Silva](https://github.com/GabeSilvaDev)
