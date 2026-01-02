# 🏗️ Arquitetura do Sistema

> Documentação detalhada dos padrões arquiteturais e decisões de design da Real-Time Messaging Platform.

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Princípios Arquiteturais](#-princípios-arquiteturais)
- [Estrutura de Camadas](#-estrutura-de-camadas)
- [Padrões de Design](#-padrões-de-design)
- [Event-Driven Architecture](#-event-driven-architecture)
- [Persistência Poliglota](#-persistência-poliglota)
- [Tratamento de Erros](#-tratamento-de-erros)
- [Logging e Observabilidade](#-logging-e-observabilidade)
- [Validação](#-validação)
- [Middleware Pipeline](#-middleware-pipeline)
- [Diagramas](#-diagramas)

---

## 🎯 Visão Geral

A arquitetura foi projetada seguindo princípios de **Clean Architecture** e **Domain-Driven Design (DDD)**, com foco em:

- **Escalabilidade horizontal** através de comunicação assíncrona
- **Baixo acoplamento** entre componentes
- **Alta coesão** dentro de cada módulo
- **Testabilidade** com 100% de cobertura de código
- **Manutenibilidade** com separação clara de responsabilidades

### Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Runtime | Node.js 22 | Event loop non-blocking para I/O intensivo |
| Linguagem | TypeScript | Type safety e melhor DX |
| HTTP Server | Express 5 | Maduro, flexível, vasto ecossistema |
| Real-time | Socket.IO | WebSocket com fallbacks automáticos |
| ORM | Sequelize | Migrations, models tipados, suporte PostgreSQL |
| Dados Relacionais | PostgreSQL | ACID, integridade referencial |
| Cache/Sessão | Redis | Sub-millisecond latency, pub/sub |
| Mensagens | MongoDB | Schema flexível para histórico |
| Busca | Elasticsearch | Full-text search otimizado |

---

## 🧱 Princípios Arquiteturais

### SOLID

| Princípio | Aplicação no Projeto |
|-----------|---------------------|
| **S**ingle Responsibility | Cada classe/módulo tem uma única razão para mudar |
| **O**pen/Closed | Extensível via eventos e middlewares |
| **L**iskov Substitution | Interfaces consistentes (ILogger, IValidator) |
| **I**nterface Segregation | Interfaces específicas por domínio |
| **D**ependency Inversion | Dependências injetadas, não instanciadas |

### Twelve-Factor App

```
✅ Codebase único em repositório Git
✅ Dependências declaradas em package.json
✅ Configuração via variáveis de ambiente
✅ Serviços anexados (PostgreSQL, Redis, MongoDB)
✅ Build/Release/Run separados
✅ Processos stateless
✅ Port binding via variável PORT
✅ Concorrência via processos (PM2)
✅ Disposability com graceful shutdown
✅ Dev/Prod parity via Docker
✅ Logs como streams (stdout/stderr)
✅ Admin processes via CLI
```

---

## 📂 Estrutura de Camadas

```
src/
├── modules/                    # 🎯 Bounded Contexts (DDD)
│   ├── auth/                   # Autenticação e autorização
│   │   ├── controllers/        # Entrada HTTP
│   │   ├── services/           # Lógica de negócio
│   │   ├── repositories/       # Acesso a dados
│   │   ├── entities/           # Modelos de domínio
│   │   ├── dtos/               # Data Transfer Objects
│   │   └── validators/         # Regras de validação
│   ├── user/                   # Gestão de usuários
│   ├── chat/                   # Sistema de mensagens
│   ├── notification/           # Notificações push/email
│   └── search/                 # Motor de busca
│
├── shared/                     # 🔧 Infraestrutura compartilhada
│   ├── config/                 # Configurações centralizadas
│   ├── constants/              # Constantes e enums
│   ├── database/               # Conexões e migrations
│   ├── errors/                 # Hierarquia de erros
│   ├── event-bus/              # Comunicação assíncrona
│   ├── interfaces/             # Contratos TypeScript
│   ├── logger/                 # Sistema de logging
│   ├── middlewares/            # Pipeline HTTP
│   ├── types/                  # Tipos TypeScript
│   ├── utils/                  # Funções utilitárias
│   └── validation/             # Schemas Zod
│
├── app.ts                      # Configuração Express
├── bootstrap.ts                # Inicialização de serviços
└── server.ts                   # Entry point
```

### Fluxo de Dependências

```
┌─────────────────────────────────────────────────────────────┐
│                        Controllers                           │
│  (Entrada HTTP, validação de request, response formatting)  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Services                             │
│      (Orquestração, regras de negócio, transações)          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Repositories                           │
│        (Abstração de dados, queries, cache)                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Data Sources                          │
│           (PostgreSQL, MongoDB, Redis, Elastic)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Padrões de Design

### Singleton Pattern

Usado para gerenciar recursos compartilhados com estado global controlado.

```typescript
// Logger - instância única thread-safe
export class Logger implements ILogger {
  private static instance: Logger | null = null;

  private constructor(options: LoggerOptions) {
    // Inicialização privada
  }

  public static getInstance(options?: LoggerOptions): Logger {
    if (Logger.instance === null) {
      if (options === undefined) {
        throw new Error('Logger must be initialized with options on first call');
      }
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  public static resetInstance(): void {
    if (Logger.instance !== null) {
      Logger.instance.stop();
      Logger.instance = null;
    }
  }
}
```

**Aplicações:**
- `Logger` - Sistema de logging centralizado
- `EventBus` - Barramento de eventos
- `DatabaseConnection` - Pool de conexões

### Factory Pattern

Criação de objetos complexos com lógica encapsulada.

```typescript
// AppError - fábricas estáticas para erros comuns
export class AppError extends Error {
  public static badRequest(message: string, details?: ErrorDetails[]): AppError {
    return new AppError(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, true, details);
  }

  public static notFound(resource: string): AppError {
    return new AppError(`${resource} not found`, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  public static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }

  public static conflict(message: string): AppError {
    return new AppError(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}
```

### Observer Pattern

Implementado através do EventBus para comunicação desacoplada.

```typescript
// Publicação de evento
await eventBus.publish('user.created', { userId: '123', email: 'user@example.com' });

// Subscrição
eventBus.subscribe('user.created', async (event) => {
  await sendWelcomeEmail(event.payload.email);
}, { priority: 10 });
```

### Strategy Pattern

Validação flexível com diferentes estratégias.

```typescript
// Validador com estratégia Zod
const validator = createValidator(userSchema);
const result = validator.validate(data);

// Estratégias de validação compostas
const strictValidator = createValidator(userSchema, { strict: true });
const lenientValidator = createValidator(userSchema, { strict: false });
```

### Decorator Pattern

Middlewares adicionam comportamento sem modificar a lógica core.

```typescript
app.use(requestId);          // Adiciona ID único
app.use(requestLogger);       // Loga requests
app.use(helmetMiddleware);    // Headers de segurança
app.use(corsMiddleware);      // Cross-Origin
app.use(rateLimiter);         // Rate limiting
```

### Chain of Responsibility

Pipeline de middlewares Express.

```typescript
// Request → Middleware1 → Middleware2 → ... → Handler → Response
app.use(requestId);
app.use(requestLogger);
app.use(errorHandler);  // Captura erros de toda a chain
```

---

## 📡 Event-Driven Architecture

### EventBus

Sistema de eventos in-memory para comunicação assíncrona entre módulos.

```typescript
interface EventBus {
  publish<K extends keyof EventMap>(
    eventName: K,
    payload: EventPayload<K>,
    options?: PublishOptions
  ): Promise<string>;

  subscribe<K extends keyof EventMap>(
    eventName: K,
    callback: EventCallback<K>,
    options?: SubscriptionOptions
  ): string;

  unsubscribe(eventName: string, subscriptionId: string): boolean;

  subscribeAll(callback: WildcardCallback): string;
}
```

### Tipos de Eventos

| Categoria | Eventos | Descrição |
|-----------|---------|-----------|
| **User** | `user.created`, `user.updated`, `user.deleted` | Ciclo de vida de usuários |
| **Auth** | `auth.login`, `auth.logout`, `auth.failed` | Autenticação |
| **Chat** | `message.sent`, `message.delivered`, `message.read` | Mensagens |
| **System** | `system.startup`, `system.shutdown`, `system.error` | Infraestrutura |

### Características

- **Priorização**: Handlers com maior prioridade executam primeiro
- **Once**: Handlers que executam apenas uma vez
- **Async**: Publicação assíncrona não-bloqueante
- **Wildcards**: Subscrição para todos os eventos
- **Métricas**: Contadores de eventos publicados/processados/erros

```typescript
// Exemplo de uso completo
const eventBus = EventBus.getInstance();

// Handler com prioridade alta
eventBus.subscribe('user.created', async (event) => {
  await auditLog.record(event);
}, { priority: 100 });

// Handler one-time
eventBus.subscribe('user.created', async (event) => {
  await analytics.trackFirstUser();
}, { once: true, priority: 50 });

// Publicação assíncrona
await eventBus.publish('user.created', userData, { async: true });

// Estatísticas
const stats = eventBus.getStats();
// { totalPublished: 150, totalProcessed: 148, totalErrors: 2, ... }
```

---

## 💾 Persistência Poliglota

### Estratégia de Dados

Cada tipo de dado usa o banco mais adequado às suas características.

```
┌─────────────────┬──────────────────┬─────────────────────────────┐
│     Dado        │      Banco       │       Justificativa         │
├─────────────────┼──────────────────┼─────────────────────────────┤
│ Usuários        │ PostgreSQL       │ ACID, relacionamentos       │
│ Configurações   │ PostgreSQL       │ Transações, constraints     │
│ Sessões         │ Redis            │ TTL nativo, sub-ms latency  │
│ Cache           │ Redis            │ Invalidação, pub/sub        │
│ Mensagens       │ MongoDB          │ Schema flexível, sharding   │
│ Anexos metadata │ MongoDB          │ Documentos variados         │
│ Busca full-text │ Elasticsearch    │ Indexação, relevância       │
│ Presença online │ Redis            │ Pub/sub, sorted sets        │
└─────────────────┴──────────────────┴─────────────────────────────┘
```

### Conexões

```typescript
// PostgreSQL via Sequelize
const sequelize = new Sequelize({
  dialect: 'postgres',
  pool: { max: 20, min: 5, acquire: 30000, idle: 10000 }
});

// MongoDB via Mongoose
const mongoose = await mongoose.connect(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000
});

// Redis via ioredis
const redis = new Redis({
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

// Elasticsearch
const elastic = new Client({
  node: process.env.ELASTICSEARCH_URL,
  maxRetries: 3
});
```

---

## ⚠️ Tratamento de Erros

### Hierarquia de Erros

```
Error (JavaScript nativo)
└── AppError (Base da aplicação)
    ├── ValidationError (Erros de validação - 400)
    ├── UnauthorizedError (Autenticação - 401)
    ├── ForbiddenError (Autorização - 403)
    ├── NotFoundError (Recurso não encontrado - 404)
    ├── ConflictError (Conflito de estado - 409)
    └── InternalError (Erros internos - 500)
```

### AppError

Classe base com informações estruturadas.

```typescript
export class AppError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails[];
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    isOperational = true,
    details?: ErrorDetails[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }
}
```

### Erro Operacional vs Programático

| Tipo | Descrição | Ação |
|------|-----------|------|
| **Operacional** | Erros esperados (validação, auth, not found) | Retorna resposta apropriada |
| **Programático** | Bugs, erros inesperados | Loga, alerta, possível restart |

```typescript
// ErrorHandler middleware
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (AppError.isAppError(err)) {
    // Erro operacional - resposta estruturada
    if (err.statusCode >= 500) {
      logger.error(`[${requestId}] ${err.message}`, err);
    } else {
      logger.warn(`[${requestId}] ${err.message}`);
    }
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Erro programático - esconde detalhes em produção
  logger.error(`[${requestId}] Unexpected: ${err.message}`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env === 'production' ? 'An unexpected error occurred' : err.message
    }
  });
}
```

---

## 📊 Logging e Observabilidade

### Sistema de Logging

Logger estruturado com suporte a múltiplos destinos.

```typescript
interface ILogger {
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, error?: Error, metadata?: LogMetadata): void;
  fatal(message: string, error?: Error, metadata?: LogMetadata): void;
  child(context: string): ILogger;
  setCategory(category: LogCategory): void;
}
```

### Níveis de Log

| Nível | Prioridade | Uso |
|-------|------------|-----|
| DEBUG | 0 | Informações detalhadas para debugging |
| INFO | 1 | Eventos normais da aplicação |
| WARN | 2 | Situações potencialmente problemáticas |
| ERROR | 3 | Erros que não interrompem a aplicação |
| FATAL | 4 | Erros críticos que podem encerrar a aplicação |

### Categorias

```typescript
enum LogCategory {
  SYSTEM = 'SYSTEM',
  HTTP = 'HTTP',
  DATABASE = 'DATABASE',
  AUTH = 'AUTH',
  BUSINESS = 'BUSINESS',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE'
}
```

### Estrutura do Log

```typescript
interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  service: string;
  environment: string;
  message: string;
  context?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}
```

### Destinos

- **Console**: Output formatado e colorido para desenvolvimento
- **MongoDB**: Persistência para análise histórica
- **Streams**: stdout/stderr para integração com sistemas externos

---

## ✅ Validação

### Zod Integration

Validação type-safe com schemas declarativos.

```typescript
// Schema definition
const userSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(100),
  age: z.number().int().positive().optional()
});

// Validação com resultado tipado
const result = validate(userSchema, data);
if (!result.success) {
  throw new ValidationError('Invalid user data', result.errors);
}
const user: User = result.data;
```

### Helpers de Validação

```typescript
// Validação síncrona com resultado
function validate<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T>;

// Validação assíncrona
async function validateAsync<T>(schema: ZodSchema<T>, data: unknown): Promise<ValidationResult<T>>;

// Validação que lança erro
function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T;

// Factory de validador reutilizável
function createValidator<T>(schema: ZodSchema<T>): Validator<T>;
```

### Formatação de Erros

Erros Zod são traduzidos para formato amigável.

```typescript
// Input
{ code: 'too_small', minimum: 8, type: 'string', path: ['password'] }

// Output
{
  field: 'password',
  message: 'Deve ter pelo menos 8 caractere(s)',
  code: 'too_small'
}
```

---

## 🔗 Middleware Pipeline

### Ordem de Execução

```
Request
    │
    ▼
┌─────────────────┐
│   requestId     │  → Gera UUID único para rastreamento
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  requestLogger  │  → Loga entrada e saída com timing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     helmet      │  → Headers de segurança
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│      cors       │  → Cross-Origin Resource Sharing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   rateLimiter   │  → Proteção contra abuso
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    bodyParser   │  → Parse JSON/URL-encoded
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     routes      │  → Handlers de rota
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    notFound     │  → 404 para rotas não encontradas
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  errorHandler   │  → Tratamento centralizado de erros
└────────┬────────┘
         │
         ▼
    Response
```

### Middlewares Customizados

#### RequestId

```typescript
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.headers['x-request-id'] as string ?? randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}
```

#### RequestLogger

```typescript
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const requestId = req.headers['x-request-id'];

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`
    });
  });

  next();
}
```

---

## 📐 Diagramas

### Arquitetura Geral

```
                                    ┌──────────────────┐
                                    │   Load Balancer  │
                                    └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
            ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
            │   Node App 1  │        │   Node App 2  │        │   Node App N  │
            │   (Express)   │        │   (Express)   │        │   (Express)   │
            └───────┬───────┘        └───────┬───────┘        └───────┬───────┘
                    │                        │                        │
                    └────────────────────────┼────────────────────────┘
                                             │
        ┌────────────────────────────────────┼────────────────────────────────────┐
        │                                    │                                    │
        ▼                                    ▼                                    ▼
┌───────────────┐                    ┌───────────────┐                    ┌───────────────┐
│  PostgreSQL   │                    │     Redis     │                    │    MongoDB    │
│   (Primary)   │                    │  (Cache/Pub)  │                    │  (Messages)   │
└───────────────┘                    └───────────────┘                    └───────────────┘
```

### Fluxo de Mensagem

```
┌──────────┐     WebSocket      ┌──────────┐     EventBus      ┌──────────┐
│  Client  │ ─────────────────▶ │  Server  │ ────────────────▶ │ Handler  │
└──────────┘                    └──────────┘                    └────┬─────┘
                                                                     │
                    ┌────────────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────────────────────────────┐
    │                                                                   │
    ▼                               ▼                               ▼
┌──────────┐                ┌───────────────┐                ┌──────────┐
│ MongoDB  │                │     Redis     │                │  Socket  │
│  (Save)  │                │  (Pub/Sub)    │                │ Broadcast│
└──────────┘                └───────────────┘                └──────────┘
```

---

## 📚 Referências

- [Clean Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design - Eric Evans](https://domainlanguage.com/ddd/)
- [12 Factor App](https://12factor.net/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

---

<div align="center">

**Desenvolvido com ❤️ por [Gabriel Silva](https://github.com/GabeSilvaDev)**

</div>
