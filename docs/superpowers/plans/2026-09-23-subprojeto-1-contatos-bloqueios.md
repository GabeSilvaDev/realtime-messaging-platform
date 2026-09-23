# Subprojeto 1 — Contatos, Bloqueios, Busca e Rate Limit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor contatos, bloqueios e busca de usuários via REST, publicar eventos de bloqueio e aplicar rate limit de autenticação (RF002.2, RF002.3, RF001.2).

**Architecture:** O `ContactService` já contém toda a lógica; este plano adiciona três controllers finos (`ContactController`, `BlockController`, `UserController`) que dependem de `IContactService`, rotas Express registradas em `app.ts`, publicação de `UserEvents.BLOCKED/UNBLOCKED` no EventBus, e evolui `createRateLimiter` para aceitar `store` injetável (MemoryStore em testes) e `skipSuccessfulRequests`.

**Tech Stack:** Node 20, TypeScript 5.9 (strict), Express 5, Zod 4, Jest 30 + ts-jest + supertest, express-rate-limit 8, rate-limit-redis 4.

**Spec:** `docs/superpowers/specs/2026-09-23-roadmap-finalizacao-design.md` — seção 5.

## Global Constraints

- Branch: `feature/user-contacts-blocks` criada a partir da `main` **depois** do merge do subprojeto 0.
- Commits: gitmoji + Conventional Commits em PT-BR (ex.: `✨ feat: adiciona ContactController`). NUNCA mencionar Claude/Anthropic/IA nem adicionar `Co-Authored-By`.
- Cobertura: 100% (linhas/branches/functions/statements) em todo arquivo novo ou alterado; threshold global de 90% (configurado no subprojeto 0) deve continuar passando.
- Prettier é verificado no CI (`npm run format:check` cobre `src/**/*.ts` e `tests/**/*.ts`): rodar `node node_modules/.bin/prettier --write <arquivos>` antes de cada commit.
- `.github/SRS.md` é documento local (não versionado): pode ser editado, mas NUNCA commitado.
- Rodar jest SEMPRE como `node node_modules/.bin/jest ...` (um hook reescreve `npx jest` e filtra a saída).
- Rotas estáticas declaradas ANTES de rotas com parâmetro (`/favorites` antes de `/:contactId`).
- Resposta de sucesso: `{ success: true, data?, message? }`. Falha de validação: HTTP 400 `{ success: false, message: 'Dados inválidos', errors: issues }` (mesmo formato do `ProfileController`).
- Não criar schemas Zod novos: usar os de `src/modules/user/validation/contact.schemas.ts` e `userIdParamSchema` de `user.schemas.ts`.
- UUIDs de teste devem ser v4 válidos (Zod 4 `z.uuid()` valida versão/variante), ex.: `11111111-1111-4111-8111-111111111111`.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/modules/user/controllers/helpers.ts` | Criar | `getAuthenticatedUserId(req)` e `sendValidationError(res, issues)` compartilhados |
| `src/modules/user/controllers/ContactController.ts` | Criar | CRUD de contatos |
| `src/modules/user/controllers/BlockController.ts` | Criar | Bloquear / desbloquear / listar bloqueados |
| `src/modules/user/controllers/UserController.ts` | Criar | Busca de usuários |
| `src/modules/user/controllers/index.ts` | Modificar | Exportar novos controllers |
| `src/modules/user/routes/contact.routes.ts` | Criar | `/api/contacts` |
| `src/modules/user/routes/block.routes.ts` | Criar | `/api/blocks` |
| `src/modules/user/routes/user.routes.ts` | Criar | `/api/users` |
| `src/modules/user/routes/index.ts` | Modificar | Exportar novas rotas |
| `src/modules/user/index.ts` | Modificar | Re-exportar controllers e rotas |
| `src/modules/user/services/ContactService.ts` | Modificar | Injetar EventBus e publicar eventos de bloqueio |
| `src/shared/interfaces/middleware.interfaces.ts` | Modificar | `store` e `skipSuccessfulRequests` em `RateLimiterOptions` |
| `src/shared/constants/middleware.constants.ts` | Modificar | Janela auth 15 min; prefixo login |
| `src/shared/middlewares/rateLimiter.ts` | Modificar | Store injetável, MemoryStore em teste, `getLoginRateLimiter` |
| `src/shared/middlewares/index.ts` | Modificar | Exportar `getLoginRateLimiter` |
| `src/modules/auth/routes/auth.routes.ts` | Modificar | Aplicar limiters |
| `src/app.ts` | Modificar | Registrar rotas novas + limiter global |
| `.github/SRS.md` | Modificar | Marcar Sprint 4 concluída |
| Testes | Criar/Modificar | Ver cada task |

---

### Task 1: Helpers de controller

**Files:**
- Create: `src/modules/user/controllers/helpers.ts`
- Test: `tests/unit/modules/user/controllers/helpers.test.ts`

**Interfaces:**
- Produces:
  - `getAuthenticatedUserId(req: Request): string` — lança `UnauthorizedError` (401) se `req.user?.id` ausente/vazio.
  - `sendValidationError(res: Response, issues: ZodError['issues']): void` — responde 400 `{ success: false, message: 'Dados inválidos', errors: issues }`.

- [ ] **Step 1: Criar branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feature/user-contacts-blocks
```

- [ ] **Step 2: Escrever teste que falha**

`tests/unit/modules/user/controllers/helpers.test.ts`:

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';
import {
  getAuthenticatedUserId,
  sendValidationError,
} from '@/modules/user/controllers/helpers';

describe('controllers/helpers', () => {
  describe('getAuthenticatedUserId', () => {
    it('deve retornar o id do usuário autenticado', () => {
      const req = { user: { id: 'user-1' } } as unknown as Request;
      expect(getAuthenticatedUserId(req)).toBe('user-1');
    });

    it('deve lançar UnauthorizedError quando não há usuário', () => {
      const req = {} as Request;
      expect(() => getAuthenticatedUserId(req)).toThrow(UnauthorizedError);
    });

    it('deve lançar UnauthorizedError quando o id é vazio', () => {
      const req = { user: { id: '' } } as unknown as Request;
      expect(() => getAuthenticatedUserId(req)).toThrow(UnauthorizedError);
    });

    it('deve usar status 401', () => {
      const req = {} as Request;
      try {
        getAuthenticatedUserId(req);
      } catch (error) {
        expect((error as UnauthorizedError).statusCode).toBe(HttpStatus.UNAUTHORIZED);
      }
      expect.assertions(1);
    });
  });

  describe('sendValidationError', () => {
    it('deve responder 400 com as issues do Zod', () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;
      const result = z.object({ name: z.string() }).safeParse({});
      if (result.success) {
        throw new Error('esperava falha de validação');
      }

      sendValidationError(res, result.error.issues);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Dados inválidos',
        errors: result.error.issues,
      });
    });
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/helpers.test.ts --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/user/controllers/helpers'`.

- [ ] **Step 4: Implementar**

`src/modules/user/controllers/helpers.ts`:

```ts
import type { Request, Response } from 'express';
import type { ZodError } from 'zod';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

export function getAuthenticatedUserId(req: Request): string {
  const user = req.user as { id: string } | undefined;
  if (user?.id === undefined || user.id === '') {
    throw UnauthorizedError.missingToken();
  }
  return user.id;
}

export function sendValidationError(res: Response, issues: ZodError['issues']): void {
  res.status(HttpStatus.BAD_REQUEST).json({
    success: false,
    message: 'Dados inválidos',
    errors: issues,
  });
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/helpers.test.ts --coverage=false`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/user/controllers/helpers.ts tests/unit/modules/user/controllers/helpers.test.ts
git commit -m "✨ feat: adiciona helpers de autenticação e validação para controllers de usuário"
```

---

### Task 2: Eventos de bloqueio no ContactService

**Files:**
- Modify: `src/modules/user/services/ContactService.ts` (imports, construtor, `blockUser`, `unblockUser`)
- Test: `tests/unit/modules/user/services/ContactService.events.test.ts` (novo arquivo, para não mexer no setup do teste existente)

**Interfaces:**
- Consumes: `eventBus` de `@/shared/event-bus`; `UserEvents` de `@/shared/types`; payloads tipados no `EventMap`: `[UserEvents.BLOCKED]: { userId; blockedUserId }`, `[UserEvents.UNBLOCKED]: { userId; unblockedUserId }`.
- Produces: `new ContactService(contacts?, users?, events?: Pick<EventBus, 'publish'>)`. Assinaturas públicas inalteradas.

- [ ] **Step 1: Escrever teste que falha**

`tests/unit/modules/user/services/ContactService.events.test.ts`:

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

  it('deve publicar user:blocked após bloquear', async () => {
    (users.findById as jest.Mock).mockResolvedValue({ id: 'target-1' });
    (contacts.block as jest.Mock).mockResolvedValue(undefined);

    await service.blockUser('user-1', 'target-1');

    expect(contacts.block).toHaveBeenCalledWith('user-1', 'target-1');
    expect(events.publish).toHaveBeenCalledWith(UserEvents.BLOCKED, {
      userId: 'user-1',
      blockedUserId: 'target-1',
    });
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

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/services/ContactService.events.test.ts --coverage=false`
Expected: FAIL — `expect(events.publish).toHaveBeenCalledWith(...)` recebe 0 chamadas.

- [ ] **Step 3: Implementar**

Em `src/modules/user/services/ContactService.ts`:

Adicionar imports no topo (após o import de `UserAttributes`):

```ts
import { eventBus, type EventBus } from '@/shared/event-bus';
import { UserEvents } from '@/shared/types';
```

Trocar o construtor:

```ts
  constructor(
    private readonly contacts: IContactRepository = contactRepository,
    private readonly users: IUserRepository = userRepository,
    private readonly events: Pick<EventBus, 'publish'> = eventBus
  ) {}
```

Trocar `blockUser` e `unblockUser`:

```ts
  async blockUser(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) {
      throw new CannotBlockSelfException();
    }

    const targetUser = await this.users.findById(targetId);
    if (!targetUser) {
      throw new UserNotFoundException();
    }

    await this.contacts.block(userId, targetId);
    await this.events.publish(UserEvents.BLOCKED, { userId, blockedUserId: targetId });
  }

  async unblockUser(userId: string, targetId: string): Promise<void> {
    const unblocked = await this.contacts.unblock(userId, targetId);
    if (!unblocked) {
      throw new ContactNotFoundException();
    }

    await this.events.publish(UserEvents.UNBLOCKED, { userId, unblockedUserId: targetId });
  }
```

Se `@/shared/event-bus` não exportar o tipo `EventBus` como named export de tipo, use `import { eventBus, EventBus } from '@/shared/event-bus';` com `import type` separado — o arquivo `src/shared/event-bus/index.ts` já exporta `{ EventBus, eventBus }`.

- [ ] **Step 4: Rodar teste novo + teste existente do ContactService**

Run: `node node_modules/.bin/jest tests/unit/modules/user/services/ContactService --coverage=false`
Expected: PASS em `ContactService.test.ts` e `ContactService.events.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/user/services/ContactService.ts tests/unit/modules/user/services/ContactService.events.test.ts
git commit -m "✨ feat: publica eventos de bloqueio e desbloqueio no ContactService"
```

---

### Task 3: ContactController + rotas `/api/contacts`

**Files:**
- Create: `src/modules/user/controllers/ContactController.ts`
- Create: `src/modules/user/routes/contact.routes.ts`
- Test: `tests/unit/modules/user/controllers/ContactController.test.ts`
- Test: `tests/unit/modules/user/routes/contact.routes.test.ts`

**Interfaces:**
- Consumes: `getAuthenticatedUserId`, `sendValidationError` (Task 1); `IContactService` (`src/modules/user/interfaces/IContactService.ts`); schemas `addContactSchema`, `contactIdParamSchema`, `listContactsSchema`, `updateContactSchema`.
- Produces: `class ContactController { list, add, listFavorites, stats, get, update, remove }` — todos `(req: Request, res: Response) => Promise<void>`; instância `contactController`; `contactRoutes: Router`.

- [ ] **Step 1: Escrever teste do controller**

`tests/unit/modules/user/controllers/ContactController.test.ts`:

```ts
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));

import type { Request, Response } from 'express';
import { ContactController } from '@/modules/user/controllers/ContactController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

function createService(): jest.Mocked<IContactService> {
  return {
    addContact: jest.fn(),
    updateContact: jest.fn(),
    removeContact: jest.fn(),
    getContact: jest.fn(),
    listContacts: jest.fn(),
    listFavorites: jest.fn(),
    setFavorite: jest.fn(),
    setNickname: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    listBlocked: jest.fn(),
    isBlocked: jest.fn(),
    isBlockedByEither: jest.fn(),
    isContact: jest.fn(),
    getStats: jest.fn(),
    searchUsers: jest.fn(),
  };
}

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: USER_ID, email: 'a@b.com', username: 'user' },
    params: {},
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

describe('ContactController', () => {
  let service: jest.Mocked<IContactService>;
  let controller: ContactController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new ContactController(service);
    res = createRes();
  });

  it('deve usar o contactService padrão quando nenhum service é injetado', () => {
    expect(new ContactController()).toBeInstanceOf(ContactController);
  });

  describe('list', () => {
    it('deve listar contatos mapeando query para ContactListOptions', async () => {
      const page = { contacts: [], total: 0, limit: 10, offset: 5, hasMore: false };
      service.listContacts.mockResolvedValue(page);

      await controller.list(
        createReq({
          query: {
            search: 'ana',
            isFavorite: 'true',
            isBlocked: 'false',
            limit: '10',
            offset: '5',
            orderBy: 'nickname',
            order: 'ASC',
          },
        }),
        res
      );

      expect(service.listContacts).toHaveBeenCalledWith(USER_ID, {
        filters: { search: 'ana', isFavorite: true, isBlocked: false },
        limit: 10,
        offset: 5,
        orderBy: 'nickname',
        order: 'ASC',
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: page });
    });

    it('deve aplicar defaults quando query é vazia', async () => {
      service.listContacts.mockResolvedValue({
        contacts: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      await controller.list(createReq(), res);

      expect(service.listContacts).toHaveBeenCalledWith(USER_ID, {
        filters: { search: undefined, isFavorite: undefined, isBlocked: undefined },
        limit: 20,
        offset: 0,
        orderBy: 'createdAt',
        order: 'DESC',
      });
    });

    it('deve responder 400 com query inválida', async () => {
      await controller.list(createReq({ query: { limit: '0' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.listContacts).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedError sem usuário autenticado', async () => {
      await expect(controller.list(createReq({ user: undefined }), res)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  describe('add', () => {
    it('deve adicionar contato e responder 201', async () => {
      const contact = { id: 'c-1' } as never;
      service.addContact.mockResolvedValue(contact);

      await controller.add(createReq({ body: { contactId: CONTACT_ID, nickname: 'Ana' } }), res);

      expect(service.addContact).toHaveBeenCalledWith(USER_ID, {
        contactId: CONTACT_ID,
        nickname: 'Ana',
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: contact,
        message: 'Contato adicionado com sucesso',
      });
    });

    it('deve responder 400 com body inválido', async () => {
      await controller.add(createReq({ body: { contactId: 'invalido' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.addContact).not.toHaveBeenCalled();
    });

    it('deve propagar exceções do service', async () => {
      service.addContact.mockRejectedValue(new Error('falhou'));

      await expect(
        controller.add(createReq({ body: { contactId: CONTACT_ID } }), res)
      ).rejects.toThrow('falhou');
    });
  });

  describe('listFavorites', () => {
    it('deve listar favoritos', async () => {
      service.listFavorites.mockResolvedValue([]);

      await controller.listFavorites(createReq(), res);

      expect(service.listFavorites).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });
  });

  describe('stats', () => {
    it('deve retornar estatísticas', async () => {
      const stats = { total: 3, favorites: 1, blocked: 1 };
      service.getStats.mockResolvedValue(stats);

      await controller.stats(createReq(), res);

      expect(service.getStats).toHaveBeenCalledWith(USER_ID);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: stats });
    });
  });

  describe('get', () => {
    it('deve retornar um contato', async () => {
      const contact = { id: 'c-1' } as never;
      service.getContact.mockResolvedValue(contact);

      await controller.get(createReq({ params: { contactId: CONTACT_ID } }), res);

      expect(service.getContact).toHaveBeenCalledWith(USER_ID, CONTACT_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: contact });
    });

    it('deve responder 400 com contactId inválido', async () => {
      await controller.get(createReq({ params: { contactId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.getContact).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('deve atualizar apelido e favorito', async () => {
      const contact = { id: 'c-1' } as never;
      service.updateContact.mockResolvedValue(contact);

      await controller.update(
        createReq({
          params: { contactId: CONTACT_ID },
          body: { nickname: 'Aninha', isFavorite: true },
        }),
        res
      );

      expect(service.updateContact).toHaveBeenCalledWith(USER_ID, CONTACT_ID, {
        nickname: 'Aninha',
        isFavorite: true,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: contact,
        message: 'Contato atualizado com sucesso',
      });
    });

    it('deve responder 400 com contactId inválido', async () => {
      await controller.update(createReq({ params: { contactId: 'x' }, body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.updateContact).not.toHaveBeenCalled();
    });

    it('deve responder 400 com body inválido', async () => {
      await controller.update(
        createReq({ params: { contactId: CONTACT_ID }, body: { isFavorite: 'sim' } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.updateContact).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deve remover e responder 204', async () => {
      service.removeContact.mockResolvedValue(undefined);

      await controller.remove(createReq({ params: { contactId: CONTACT_ID } }), res);

      expect(service.removeContact).toHaveBeenCalledWith(USER_ID, CONTACT_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 com contactId inválido', async () => {
      await controller.remove(createReq({ params: { contactId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.removeContact).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/ContactController.test.ts --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/user/controllers/ContactController'`.

- [ ] **Step 3: Implementar o controller**

`src/modules/user/controllers/ContactController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import {
  addContactSchema,
  contactIdParamSchema,
  listContactsSchema,
  updateContactSchema,
} from '../validation/contact.schemas';
import { getAuthenticatedUserId, sendValidationError } from './helpers';

export class ContactController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = listContactsSchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

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

  async add(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = addContactSchema.safeParse(req.body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const contact = await this.contacts.addContact(userId, parsed.data);

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: contact,
      message: 'Contato adicionado com sucesso',
    });
  }

  async listFavorites(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const favorites = await this.contacts.listFavorites(userId);

    res.status(HttpStatus.OK).json({ success: true, data: favorites });
  }

  async stats(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const stats = await this.contacts.getStats(userId);

    res.status(HttpStatus.OK).json({ success: true, data: stats });
  }

  async get(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = contactIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    const contact = await this.contacts.getContact(userId, params.data.contactId);

    res.status(HttpStatus.OK).json({ success: true, data: contact });
  }

  async update(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = contactIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    const body = updateContactSchema.safeParse(req.body);

    if (!body.success) {
      sendValidationError(res, body.error.issues);
      return;
    }

    const contact = await this.contacts.updateContact(userId, params.data.contactId, body.data);

    res.status(HttpStatus.OK).json({
      success: true,
      data: contact,
      message: 'Contato atualizado com sucesso',
    });
  }

  async remove(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = contactIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.contacts.removeContact(userId, params.data.contactId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const contactController = new ContactController();
```

- [ ] **Step 4: Rodar teste do controller**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/ContactController.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 5: Escrever teste das rotas**

`tests/unit/modules/user/routes/contact.routes.test.ts`:

```ts
jest.mock('@/modules/user/controllers/ContactController', () => ({
  contactController: {
    list: jest.fn(),
    add: jest.fn(),
    listFavorites: jest.fn(),
    stats: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { contactController } from '@/modules/user/controllers/ContactController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((contactRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('contact.routes', () => {
  it.each([
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/favorites'],
    ['GET', '/stats'],
    ['GET', '/:contactId'],
    ['PATCH', '/:contactId'],
    ['DELETE', '/:contactId'],
  ])('deve definir %s %s', (method, path) => {
    expect(getRoutes().map(({ method: m, path: p }) => ({ method: m, path: p }))).toContainEqual({
      method,
      path,
    });
  });

  it('deve declarar rotas estáticas antes de /:contactId', () => {
    const paths = getRoutes().map((r) => r.path);
    const firstParam = paths.indexOf('/:contactId');
    expect(paths.indexOf('/favorites')).toBeLessThan(firstParam);
    expect(paths.indexOf('/stats')).toBeLessThan(firstParam);
  });

  it('deve proteger todas as rotas com authenticate', () => {
    for (const { layer } of getRoutes()) {
      expect(layer.route!.stack[0]!.handle).toBe(authenticate);
    }
  });

  it.each([
    ['GET', '/', 'list'],
    ['POST', '/', 'add'],
    ['GET', '/favorites', 'listFavorites'],
    ['GET', '/stats', 'stats'],
    ['GET', '/:contactId', 'get'],
    ['PATCH', '/:contactId', 'update'],
    ['DELETE', '/:contactId', 'remove'],
  ] as const)('%s %s deve chamar contactController.%s', async (method, path, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path)!;
    const handle = route.layer.route!.stack[1]!.handle;
    const req = {};
    const res = {};

    await handle(req, res);

    expect(contactController[handler]).toHaveBeenCalledWith(req, res);
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/routes/contact.routes.test.ts --coverage=false`
Expected: FAIL — `Cannot find module '@/modules/user/routes/contact.routes'`.

- [ ] **Step 7: Implementar as rotas**

`src/modules/user/routes/contact.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { contactController } from '../controllers/ContactController';

const router = Router();

/**
 * @route GET /contacts
 * @description Lista contatos do usuário autenticado (paginado, com filtros)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => contactController.list(req, res))
);

/**
 * @route POST /contacts
 * @description Adiciona um contato
 * @access Private
 */
router.post(
  '/',
  authenticate,
  asyncHandler((req, res) => contactController.add(req, res))
);

/**
 * @route GET /contacts/favorites
 * @description Lista contatos favoritos
 * @access Private
 */
router.get(
  '/favorites',
  authenticate,
  asyncHandler((req, res) => contactController.listFavorites(req, res))
);

/**
 * @route GET /contacts/stats
 * @description Retorna estatísticas de contatos
 * @access Private
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler((req, res) => contactController.stats(req, res))
);

/**
 * @route GET /contacts/:contactId
 * @description Obtém um contato
 * @access Private
 */
router.get(
  '/:contactId',
  authenticate,
  asyncHandler((req, res) => contactController.get(req, res))
);

/**
 * @route PATCH /contacts/:contactId
 * @description Atualiza apelido e/ou favorito de um contato
 * @access Private
 */
router.patch(
  '/:contactId',
  authenticate,
  asyncHandler((req, res) => contactController.update(req, res))
);

/**
 * @route DELETE /contacts/:contactId
 * @description Remove um contato
 * @access Private
 */
router.delete(
  '/:contactId',
  authenticate,
  asyncHandler((req, res) => contactController.remove(req, res))
);

export { router as contactRoutes };
```

- [ ] **Step 8: Rodar testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/routes/contact.routes.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/user/controllers/ContactController.ts src/modules/user/routes/contact.routes.ts tests/unit/modules/user/controllers/ContactController.test.ts tests/unit/modules/user/routes/contact.routes.test.ts
git commit -m "✨ feat: adiciona ContactController e rotas de contatos"
```

---

### Task 4: BlockController + rotas `/api/blocks`

**Files:**
- Create: `src/modules/user/controllers/BlockController.ts`
- Create: `src/modules/user/routes/block.routes.ts`
- Test: `tests/unit/modules/user/controllers/BlockController.test.ts`
- Test: `tests/unit/modules/user/routes/block.routes.test.ts`

**Interfaces:**
- Consumes: helpers (Task 1); `IContactService.blockUser/unblockUser/listBlocked`; `blockUserSchema` (`{ userId }`); `userIdParamSchema` (`{ userId }`, de `../validation/user.schemas`).
- Produces: `class BlockController { list, block, unblock }`; `blockController`; `blockRoutes: Router`.

- [ ] **Step 1: Escrever teste do controller**

`tests/unit/modules/user/controllers/BlockController.test.ts`:

```ts
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));

import type { Request, Response } from 'express';
import { BlockController } from '@/modules/user/controllers/BlockController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

function createService(): jest.Mocked<Pick<IContactService, 'blockUser' | 'unblockUser' | 'listBlocked'>> {
  return {
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    listBlocked: jest.fn(),
  };
}

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: USER_ID, email: 'a@b.com', username: 'user' },
    params: {},
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

describe('BlockController', () => {
  let service: ReturnType<typeof createService>;
  let controller: BlockController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new BlockController(service as unknown as IContactService);
    res = createRes();
  });

  it('deve usar o contactService padrão quando nenhum service é injetado', () => {
    expect(new BlockController()).toBeInstanceOf(BlockController);
  });

  describe('list', () => {
    it('deve listar usuários bloqueados', async () => {
      service.listBlocked.mockResolvedValue([]);

      await controller.list(createReq(), res);

      expect(service.listBlocked).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });
  });

  describe('block', () => {
    it('deve bloquear e responder 201', async () => {
      service.blockUser.mockResolvedValue(undefined);

      await controller.block(createReq({ body: { userId: TARGET_ID } }), res);

      expect(service.blockUser).toHaveBeenCalledWith(USER_ID, TARGET_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Usuário bloqueado com sucesso',
      });
    });

    it('deve responder 400 com userId inválido', async () => {
      await controller.block(createReq({ body: { userId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.blockUser).not.toHaveBeenCalled();
    });

    it('deve propagar exceções do service', async () => {
      service.blockUser.mockRejectedValue(new Error('falhou'));

      await expect(
        controller.block(createReq({ body: { userId: TARGET_ID } }), res)
      ).rejects.toThrow('falhou');
    });
  });

  describe('unblock', () => {
    it('deve desbloquear e responder 204', async () => {
      service.unblockUser.mockResolvedValue(undefined);

      await controller.unblock(createReq({ params: { userId: TARGET_ID } }), res);

      expect(service.unblockUser).toHaveBeenCalledWith(USER_ID, TARGET_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 com userId inválido', async () => {
      await controller.unblock(createReq({ params: { userId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.unblockUser).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/BlockController.test.ts --coverage=false`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o controller**

`src/modules/user/controllers/BlockController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import { blockUserSchema } from '../validation/contact.schemas';
import { userIdParamSchema } from '../validation/user.schemas';
import { getAuthenticatedUserId, sendValidationError } from './helpers';

export class BlockController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async list(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const blocked = await this.contacts.listBlocked(userId);

    res.status(HttpStatus.OK).json({ success: true, data: blocked });
  }

  async block(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = blockUserSchema.safeParse(req.body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    await this.contacts.blockUser(userId, parsed.data.userId);

    res.status(HttpStatus.CREATED).json({
      success: true,
      message: 'Usuário bloqueado com sucesso',
    });
  }

  async unblock(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const params = userIdParamSchema.safeParse(req.params);

    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    await this.contacts.unblockUser(userId, params.data.userId);

    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export const blockController = new BlockController();
```

- [ ] **Step 4: Rodar teste do controller**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/BlockController.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 5: Escrever teste das rotas**

`tests/unit/modules/user/routes/block.routes.test.ts`:

```ts
jest.mock('@/modules/user/controllers/BlockController', () => ({
  blockController: {
    list: jest.fn(),
    block: jest.fn(),
    unblock: jest.fn(),
  },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { blockRoutes } from '@/modules/user/routes/block.routes';
import { blockController } from '@/modules/user/controllers/BlockController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function getRoutes(): Array<{ path: string; method: string; layer: Layer }> {
  return ((blockRoutes as Router).stack as Layer[])
    .filter((layer) => layer.route !== undefined)
    .map((layer) => ({
      path: layer.route!.path,
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      layer,
    }));
}

describe('block.routes', () => {
  it.each([
    ['GET', '/', 'list'],
    ['POST', '/', 'block'],
    ['DELETE', '/:userId', 'unblock'],
  ] as const)('%s %s deve chamar blockController.%s com authenticate', async (method, path, handler) => {
    const route = getRoutes().find((r) => r.method === method && r.path === path);
    expect(route).toBeDefined();
    expect(route!.layer.route!.stack[0]!.handle).toBe(authenticate);

    const req = {};
    const res = {};
    await route!.layer.route!.stack[1]!.handle(req, res);

    expect(blockController[handler]).toHaveBeenCalledWith(req, res);
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/routes/block.routes.test.ts --coverage=false`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 7: Implementar as rotas**

`src/modules/user/routes/block.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { blockController } from '../controllers/BlockController';

const router = Router();

/**
 * @route GET /blocks
 * @description Lista usuários bloqueados pelo usuário autenticado
 * @access Private
 */
router.get(
  '/',
  authenticate,
  asyncHandler((req, res) => blockController.list(req, res))
);

/**
 * @route POST /blocks
 * @description Bloqueia um usuário
 * @access Private
 */
router.post(
  '/',
  authenticate,
  asyncHandler((req, res) => blockController.block(req, res))
);

/**
 * @route DELETE /blocks/:userId
 * @description Desbloqueia um usuário
 * @access Private
 */
router.delete(
  '/:userId',
  authenticate,
  asyncHandler((req, res) => blockController.unblock(req, res))
);

export { router as blockRoutes };
```

- [ ] **Step 8: Rodar testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/BlockController.test.ts tests/unit/modules/user/routes/block.routes.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/user/controllers/BlockController.ts src/modules/user/routes/block.routes.ts tests/unit/modules/user/controllers/BlockController.test.ts tests/unit/modules/user/routes/block.routes.test.ts
git commit -m "✨ feat: adiciona BlockController e rotas de bloqueio"
```

---

### Task 5: UserController + rota `/api/users/search`

**Files:**
- Create: `src/modules/user/controllers/UserController.ts`
- Create: `src/modules/user/routes/user.routes.ts`
- Test: `tests/unit/modules/user/controllers/UserController.test.ts`
- Test: `tests/unit/modules/user/routes/user.routes.test.ts`

**Interfaces:**
- Consumes: helpers (Task 1); `IContactService.searchUsers(userId, query, { limit, excludeBlocked })`; `searchUsersForContactSchema` (`{ query: string; limit: number (default 20, max 50); excludeBlocked?: boolean }`).
- Produces: `class UserController { search }`; `userController`; `userRoutes: Router`.

- [ ] **Step 1: Escrever teste do controller**

`tests/unit/modules/user/controllers/UserController.test.ts`:

```ts
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));

import type { Request, Response } from 'express';
import { UserController } from '@/modules/user/controllers/UserController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: USER_ID, email: 'a@b.com', username: 'user' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('UserController', () => {
  const service = { searchUsers: jest.fn() };
  let controller: UserController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service.searchUsers.mockReset();
    controller = new UserController(service as unknown as IContactService);
    res = createRes();
  });

  it('deve usar o contactService padrão quando nenhum service é injetado', () => {
    expect(new UserController()).toBeInstanceOf(UserController);
  });

  it('deve buscar usuários excluindo bloqueados por padrão', async () => {
    const users = [{ id: 'u-2', username: 'ana' }];
    service.searchUsers.mockResolvedValue(users);

    await controller.search(createReq({ query: { query: 'ana' } }), res);

    expect(service.searchUsers).toHaveBeenCalledWith(USER_ID, 'ana', {
      limit: 20,
      excludeBlocked: true,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: users });
  });

  it('deve repassar limit e excludeBlocked=false', async () => {
    service.searchUsers.mockResolvedValue([]);

    await controller.search(
      createReq({ query: { query: 'ana', limit: '5', excludeBlocked: 'false' } }),
      res
    );

    expect(service.searchUsers).toHaveBeenCalledWith(USER_ID, 'ana', {
      limit: 5,
      excludeBlocked: false,
    });
  });

  it('deve responder 400 sem termo de busca', async () => {
    await controller.search(createReq({ query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(service.searchUsers).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/UserController.test.ts --coverage=false`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o controller**

`src/modules/user/controllers/UserController.ts`:

```ts
import type { Request, Response } from 'express';
import { HttpStatus } from '@/shared/errors';
import { contactService } from '../services/ContactService';
import type { IContactService } from '../interfaces';
import { searchUsersForContactSchema } from '../validation/contact.schemas';
import { getAuthenticatedUserId, sendValidationError } from './helpers';

export class UserController {
  private readonly contacts: IContactService;

  constructor(contacts?: IContactService) {
    this.contacts = contacts ?? contactService;
  }

  async search(req: Request, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const parsed = searchUsersForContactSchema.safeParse(req.query);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues);
      return;
    }

    const { query, limit, excludeBlocked = true } = parsed.data;
    const users = await this.contacts.searchUsers(userId, query, { limit, excludeBlocked });

    res.status(HttpStatus.OK).json({ success: true, data: users });
  }
}

export const userController = new UserController();
```

- [ ] **Step 4: Rodar teste do controller**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/UserController.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 5: Escrever teste da rota**

`tests/unit/modules/user/routes/user.routes.test.ts`:

```ts
jest.mock('@/modules/user/controllers/UserController', () => ({
  userController: { search: jest.fn() },
}));

jest.mock('@/modules/auth/middlewares', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  asyncHandler: jest.fn((fn) => fn),
}));

import type { Router } from 'express';
import { userRoutes } from '@/modules/user/routes/user.routes';
import { userController } from '@/modules/user/controllers/UserController';
import { authenticate } from '@/modules/auth/middlewares';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

describe('user.routes', () => {
  it('GET /search deve chamar userController.search com authenticate', async () => {
    const layer = ((userRoutes as Router).stack as Layer[]).find(
      (l) => l.route?.path === '/search' && l.route.methods.get === true
    );
    expect(layer).toBeDefined();
    expect(layer!.route!.stack[0]!.handle).toBe(authenticate);

    const req = {};
    const res = {};
    await layer!.route!.stack[1]!.handle(req, res);

    expect(userController.search).toHaveBeenCalledWith(req, res);
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/modules/user/routes/user.routes.test.ts --coverage=false`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 7: Implementar a rota**

`src/modules/user/routes/user.routes.ts`:

```ts
import { Router } from 'express';
import { authenticate, asyncHandler } from '@/modules/auth/middlewares';
import { userController } from '../controllers/UserController';

const router = Router();

/**
 * @route GET /users/search
 * @description Busca usuários por username/email/nome (exclui o próprio e bloqueados)
 * @access Private
 */
router.get(
  '/search',
  authenticate,
  asyncHandler((req, res) => userController.search(req, res))
);

export { router as userRoutes };
```

- [ ] **Step 8: Rodar testes da task**

Run: `node node_modules/.bin/jest tests/unit/modules/user/controllers/UserController.test.ts tests/unit/modules/user/routes/user.routes.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/user/controllers/UserController.ts src/modules/user/routes/user.routes.ts tests/unit/modules/user/controllers/UserController.test.ts tests/unit/modules/user/routes/user.routes.test.ts
git commit -m "✨ feat: adiciona UserController com busca de usuários"
```

---

### Task 6: Exports do módulo, registro em `app.ts` e feature tests HTTP

**Files:**
- Modify: `src/modules/user/controllers/index.ts`
- Modify: `src/modules/user/routes/index.ts`
- Modify: `src/modules/user/index.ts`
- Modify: `src/app.ts`
- Modify: `tests/unit/modules/user/index.test.ts` (adicionar asserts de export)
- Create: `tests/feature/modules/user/contacts.test.ts`

**Interfaces:**
- Consumes: `contactRoutes`, `blockRoutes`, `userRoutes`, controllers (Tasks 3–5).
- Produces: rotas montadas em `/api/contacts`, `/api/blocks`, `/api/users`.

- [ ] **Step 1: Atualizar exports**

`src/modules/user/controllers/index.ts`:

```ts
export {
  ProfileController,
  profileController,
  type AuthenticatedRequest,
} from './ProfileController';
export { ContactController, contactController } from './ContactController';
export { BlockController, blockController } from './BlockController';
export { UserController, userController } from './UserController';
```

`src/modules/user/routes/index.ts`:

```ts
export { profileRoutes } from './profile.routes';
export { contactRoutes } from './contact.routes';
export { blockRoutes } from './block.routes';
export { userRoutes } from './user.routes';
```

Em `src/modules/user/index.ts`, trocar as duas últimas linhas de export por:

```ts
export {
  ProfileController,
  profileController,
  ContactController,
  contactController,
  BlockController,
  blockController,
  UserController,
  userController,
} from './controllers';

export { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './routes';
```

- [ ] **Step 2: Acrescentar asserts de export**

Em `tests/unit/modules/user/index.test.ts`, dentro de `describe('module exports', ...)`, adicionar:

```ts
    it('deve exportar controllers e rotas de contatos, bloqueios e usuários', () => {
      expect(userModuleIndex.ContactController).toBeDefined();
      expect(userModuleIndex.contactController).toBeDefined();
      expect(userModuleIndex.BlockController).toBeDefined();
      expect(userModuleIndex.blockController).toBeDefined();
      expect(userModuleIndex.UserController).toBeDefined();
      expect(userModuleIndex.userController).toBeDefined();
      expect(userModuleIndex.contactRoutes).toBeDefined();
      expect(userModuleIndex.blockRoutes).toBeDefined();
      expect(userModuleIndex.userRoutes).toBeDefined();
    });
```

- [ ] **Step 3: Registrar rotas em `src/app.ts`**

Trocar o import de rotas do usuário:

```ts
import { profileRoutes, contactRoutes, blockRoutes, userRoutes } from './modules/user/routes';
```

E, logo após `app.use('/api/profile', profileRoutes);`, adicionar:

```ts
app.use('/api/contacts', contactRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/users', userRoutes);
```

- [ ] **Step 4: Escrever feature test HTTP**

`tests/feature/modules/user/contacts.test.ts`:

```ts
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

const mockContactService = {
  addContact: jest.fn(),
  updateContact: jest.fn(),
  removeContact: jest.fn(),
  getContact: jest.fn(),
  listContacts: jest.fn(),
  listFavorites: jest.fn(),
  getStats: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  listBlocked: jest.fn(),
  searchUsers: jest.fn(),
};

jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));

jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    if (req.headers.authorization === undefined) {
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
    req.user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      username: 'user',
    };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { blockRoutes } from '@/modules/user/routes/block.routes';
import { userRoutes } from '@/modules/user/routes/user.routes';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const AUTH = { Authorization: 'Bearer token' };

describe('Contacts / Blocks / Users — Feature', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/contacts', contactRoutes);
    app.use('/api/blocks', blockRoutes);
    app.use('/api/users', userRoutes);
    app.use(errorHandler);
  });

  describe('autenticação', () => {
    it.each([
      ['get', '/api/contacts'],
      ['post', '/api/contacts'],
      ['get', '/api/contacts/favorites'],
      ['get', '/api/contacts/stats'],
      ['get', `/api/contacts/${CONTACT_ID}`],
      ['patch', `/api/contacts/${CONTACT_ID}`],
      ['delete', `/api/contacts/${CONTACT_ID}`],
      ['get', '/api/blocks'],
      ['post', '/api/blocks'],
      ['delete', `/api/blocks/${CONTACT_ID}`],
      ['get', '/api/users/search?query=ana'],
    ] as const)('%s %s sem token deve retornar 401', async (method, url) => {
      const response = await request(app)[method](url);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('fluxo de contatos', () => {
    it('adicionar → listar → favoritar → listar favoritos → remover', async () => {
      const contact = { id: 'c-1', contactId: CONTACT_ID, isFavorite: false };
      mockContactService.addContact.mockResolvedValue(contact);
      mockContactService.listContacts.mockResolvedValue({
        contacts: [contact],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      mockContactService.updateContact.mockResolvedValue({ ...contact, isFavorite: true });
      mockContactService.listFavorites.mockResolvedValue([{ ...contact, isFavorite: true }]);
      mockContactService.removeContact.mockResolvedValue(undefined);

      const added = await request(app)
        .post('/api/contacts')
        .set(AUTH)
        .send({ contactId: CONTACT_ID });
      expect(added.status).toBe(HttpStatus.CREATED);
      expect(mockContactService.addContact).toHaveBeenCalledWith(USER_ID, {
        contactId: CONTACT_ID,
      });

      const listed = await request(app).get('/api/contacts').set(AUTH);
      expect(listed.status).toBe(HttpStatus.OK);
      expect(listed.body.data.total).toBe(1);

      const favorited = await request(app)
        .patch(`/api/contacts/${CONTACT_ID}`)
        .set(AUTH)
        .send({ isFavorite: true });
      expect(favorited.status).toBe(HttpStatus.OK);
      expect(favorited.body.data.isFavorite).toBe(true);

      const favorites = await request(app).get('/api/contacts/favorites').set(AUTH);
      expect(favorites.status).toBe(HttpStatus.OK);
      expect(favorites.body.data).toHaveLength(1);
      expect(mockContactService.getContact).not.toHaveBeenCalled();

      const removed = await request(app).delete(`/api/contacts/${CONTACT_ID}`).set(AUTH);
      expect(removed.status).toBe(HttpStatus.NO_CONTENT);
    });

    it('GET /api/contacts/stats não deve ser capturado por /:contactId', async () => {
      mockContactService.getStats.mockResolvedValue({ total: 0, favorites: 0, blocked: 0 });

      const response = await request(app).get('/api/contacts/stats').set(AUTH);

      expect(response.status).toBe(HttpStatus.OK);
      expect(mockContactService.getStats).toHaveBeenCalledWith(USER_ID);
      expect(mockContactService.getContact).not.toHaveBeenCalled();
    });

    it('deve retornar 400 com contactId inválido', async () => {
      const response = await request(app).get('/api/contacts/nao-e-uuid').set(AUTH);
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.success).toBe(false);
    });

    it('deve propagar 403 quando o contato está bloqueado', async () => {
      mockContactService.addContact.mockRejectedValue(
        new AppError('Este usuário está bloqueado', HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED)
      );

      const response = await request(app)
        .post('/api/contacts')
        .set(AUTH)
        .send({ contactId: CONTACT_ID });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
      expect(response.body.error.code).toBe(ErrorCode.USER_BLOCKED);
    });

    it('deve propagar 409 para contato duplicado', async () => {
      mockContactService.addContact.mockRejectedValue(
        new AppError('Duplicado', HttpStatus.CONFLICT, ErrorCode.DUPLICATE_ENTRY)
      );

      const response = await request(app)
        .post('/api/contacts')
        .set(AUTH)
        .send({ contactId: CONTACT_ID });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('bloqueios', () => {
    it('bloquear → listar → desbloquear', async () => {
      mockContactService.blockUser.mockResolvedValue(undefined);
      mockContactService.listBlocked.mockResolvedValue([{ contactId: CONTACT_ID }]);
      mockContactService.unblockUser.mockResolvedValue(undefined);

      const blocked = await request(app).post('/api/blocks').set(AUTH).send({ userId: CONTACT_ID });
      expect(blocked.status).toBe(HttpStatus.CREATED);
      expect(mockContactService.blockUser).toHaveBeenCalledWith(USER_ID, CONTACT_ID);

      const list = await request(app).get('/api/blocks').set(AUTH);
      expect(list.status).toBe(HttpStatus.OK);
      expect(list.body.data).toHaveLength(1);

      const unblocked = await request(app).delete(`/api/blocks/${CONTACT_ID}`).set(AUTH);
      expect(unblocked.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockContactService.unblockUser).toHaveBeenCalledWith(USER_ID, CONTACT_ID);
    });

    it('deve propagar 400 ao bloquear a si mesmo', async () => {
      mockContactService.blockUser.mockRejectedValue(
        new AppError('Você não pode bloquear a si mesmo', HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR)
      );

      const response = await request(app).post('/api/blocks').set(AUTH).send({ userId: USER_ID });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('busca de usuários', () => {
    it('deve buscar usuários excluindo bloqueados por padrão', async () => {
      mockContactService.searchUsers.mockResolvedValue([{ id: CONTACT_ID, username: 'ana' }]);

      const response = await request(app).get('/api/users/search?query=ana&limit=5').set(AUTH);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toHaveLength(1);
      expect(mockContactService.searchUsers).toHaveBeenCalledWith(USER_ID, 'ana', {
        limit: 5,
        excludeBlocked: true,
      });
    });

    it('deve retornar 400 sem termo de busca', async () => {
      const response = await request(app).get('/api/users/search').set(AUTH);
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
```

- [ ] **Step 5: Rodar feature test e testes do módulo**

Run: `node node_modules/.bin/jest tests/feature/modules/user tests/unit/modules/user --coverage=false`
Expected: PASS.

Nota: se `jest.requireActual` dentro do factory de `authenticate` reclamar de tipagem (`any`), tipar com `jest.requireActual<typeof import('@/shared/errors')>('@/shared/errors')`.

- [ ] **Step 6: Typecheck**

Run: `node node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: sem saída (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/modules/user/controllers/index.ts src/modules/user/routes/index.ts src/modules/user/index.ts src/app.ts tests/unit/modules/user/index.test.ts tests/feature/modules/user/contacts.test.ts
git commit -m "✨ feat: registra rotas de contatos, bloqueios e busca de usuários"
```

---

### Task 7: Rate limiter com store injetável e limiter de login

**Files:**
- Modify: `src/shared/interfaces/middleware.interfaces.ts` (`RateLimiterOptions`)
- Modify: `src/shared/constants/middleware.constants.ts`
- Modify: `src/shared/middlewares/rateLimiter.ts`
- Modify: `src/shared/middlewares/index.ts`
- Modify: `tests/unit/shared/constants/index.test.ts:147-149`
- Modify: `tests/unit/shared/middlewares/rateLimiter.test.ts` (criado no subprojeto 0 — ver Step 6)
- Create: `tests/unit/shared/middlewares/rateLimiter.store.test.ts`

**Interfaces:**
- Produces:
  - `RateLimiterOptions` ganha `store?: Store` e `skipSuccessfulRequests?: boolean`.
  - `RATE_LIMIT_AUTH_WINDOW_MS = 15 * 60 * 1000`; `RATE_LIMIT_LOGIN_KEY_PREFIX = 'rl:login:'`.
  - `getLoginRateLimiter(): RateLimitRequestHandler` (auth + `skipSuccessfulRequests: true`), exportado também como `loginRateLimiter`.
  - `createRateLimiter` escolhe store: `options.store` → `MemoryStore` se `process.env.NODE_ENV === 'test'` → `RedisStore`.

- [ ] **Step 1: Escrever teste que falha**

`tests/unit/shared/middlewares/rateLimiter.store.test.ts`:

```ts
const mockRedisStoreCtor = jest.fn();

// Função comum (não jest.fn): o jest.config usa resetMocks: true, que apagaria um mockImplementation.
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: function MockRedisStore(opts: unknown) {
    mockRedisStoreCtor(opts);
    return {
      increment: async () => ({ totalHits: 1, resetTime: new Date() }),
      decrement: async () => undefined,
      resetKey: async () => undefined,
    };
  },
}));

jest.mock('@/shared/database', () => ({
  redis: { call: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import { MemoryStore } from 'express-rate-limit';
import {
  createRateLimiter,
  getLoginRateLimiter,
} from '@/shared/middlewares/rateLimiter';
import {
  RATE_LIMIT_AUTH_MAX_REQUESTS,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_LOGIN_KEY_PREFIX,
} from '@/shared/constants';

describe('rateLimiter — seleção de store e limiter de login', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    mockRedisStoreCtor.mockClear();
  });

  it('deve expor janela de 15 minutos e prefixo de login', () => {
    expect(RATE_LIMIT_AUTH_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(RATE_LIMIT_AUTH_MAX_REQUESTS).toBe(5);
    expect(RATE_LIMIT_LOGIN_KEY_PREFIX).toBe('rl:login:');
  });

  it('deve usar MemoryStore quando NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    createRateLimiter();
    expect(mockRedisStoreCtor).not.toHaveBeenCalled();
  });

  it('deve usar RedisStore fora do ambiente de teste', () => {
    process.env.NODE_ENV = 'development';
    createRateLimiter({ keyPrefix: 'rl:x:' });
    expect(mockRedisStoreCtor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'rl:x:' })
    );
  });

  it('deve usar o store injetado', () => {
    process.env.NODE_ENV = 'development';
    createRateLimiter({ store: new MemoryStore() });
    expect(mockRedisStoreCtor).not.toHaveBeenCalled();
  });

  it('deve bloquear após max requisições com o store em memória', async () => {
    process.env.NODE_ENV = 'test';
    const app = express();
    app.get('/', createRateLimiter({ max: 2 }), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    const blocked = await request(app).get('/');

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('com skipSuccessfulRequests deve contar apenas respostas com erro', async () => {
    process.env.NODE_ENV = 'test';
    const app = express();
    let fail = false;
    app.get(
      '/',
      createRateLimiter({ max: 1, skipSuccessfulRequests: true }),
      (_req, res) => {
        res.status(fail ? 401 : 200).json({});
      }
    );

    await request(app).get('/').expect(200);
    await request(app).get('/').expect(200);
    fail = true;
    await request(app).get('/').expect(401);
    await request(app).get('/').expect(429);
  });

  it('getLoginRateLimiter deve retornar a mesma instância', () => {
    process.env.NODE_ENV = 'test';
    expect(getLoginRateLimiter()).toBe(getLoginRateLimiter());
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/unit/shared/middlewares/rateLimiter.store.test.ts --coverage=false`
Expected: FAIL — `RATE_LIMIT_LOGIN_KEY_PREFIX` indefinido / `getLoginRateLimiter` não exportado.

- [ ] **Step 3: Constantes**

Em `src/shared/constants/middleware.constants.ts`, trocar:

```ts
export const RATE_LIMIT_AUTH_WINDOW_MS = 60 * 1000;
```

por:

```ts
export const RATE_LIMIT_AUTH_WINDOW_MS = 15 * 60 * 1000;
```

e, após `RATE_LIMIT_AUTH_KEY_PREFIX`, adicionar:

```ts
export const RATE_LIMIT_LOGIN_KEY_PREFIX = 'rl:login:';
```

Verificar se `src/shared/constants/index.ts` re-exporta com `export *` de `./middleware.constants`; se exportar nomes explicitamente, adicionar `RATE_LIMIT_LOGIN_KEY_PREFIX` à lista.

Em `tests/unit/shared/constants/index.test.ts`, trocar a expectativa da linha 148:

```ts
      expect(RATE_LIMIT_AUTH_WINDOW_MS).toBe(15 * 60 * 1000);
```

- [ ] **Step 4: Interface**

Em `src/shared/interfaces/middleware.interfaces.ts`, adicionar ao topo (junto aos imports existentes):

```ts
import type { Store } from 'express-rate-limit';
```

e trocar `RateLimiterOptions` por:

```ts
export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyPrefix?: string;
  skip?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  store?: Store;
}
```

- [ ] **Step 5: Implementar no rateLimiter**

Em `src/shared/middlewares/rateLimiter.ts`:

Trocar o import de `express-rate-limit`:

```ts
import rateLimit, {
  MemoryStore,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from 'express-rate-limit';
```

Adicionar `RATE_LIMIT_LOGIN_KEY_PREFIX` na lista de imports de `'../constants'`.

Adicionar, antes de `createRateLimiter`:

```ts
function createRedisStore(keyPrefix: string): Store {
  return new RedisStore({
    sendCommand: async (...args: string[]): Promise<number | string> => {
      const [command, ...commandArgs] = args;
      if (command === undefined || command === '') {
        throw new Error('Redis command is required');
      }
      const result = await redis.call(command, ...commandArgs);
      return result as number | string;
    },
    prefix: keyPrefix,
  });
}

function resolveStore(keyPrefix: string, store?: Store): Store {
  if (store !== undefined) {
    return store;
  }
  if (process.env.NODE_ENV === 'test') {
    return new MemoryStore();
  }
  return createRedisStore(keyPrefix);
}
```

Em `createRateLimiter`, desestruturar também `skipSuccessfulRequests = false` e `store`:

```ts
  const {
    windowMs = RATE_LIMIT_DEFAULT_WINDOW_MS,
    max = RATE_LIMIT_DEFAULT_MAX_REQUESTS,
    message = 'Too many requests, please try again later',
    keyPrefix = RATE_LIMIT_DEFAULT_KEY_PREFIX,
    skip,
    keyGenerator,
    skipSuccessfulRequests = false,
    store,
  } = options;
```

Adicionar `skipSuccessfulRequests,` ao objeto `rateLimitOptions` (após `legacyHeaders: false,`) e substituir todo o bloco `store: new RedisStore({ ... }),` por:

```ts
    store: resolveStore(keyPrefix, store),
```

Após `getAuthRateLimiter`, adicionar:

```ts
let _loginRateLimiter: RateLimitRequestHandler | null = null;

export function getLoginRateLimiter(): RateLimitRequestHandler {
  _loginRateLimiter ??= createRateLimiter({
    windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
    max: RATE_LIMIT_AUTH_MAX_REQUESTS,
    keyPrefix: RATE_LIMIT_LOGIN_KEY_PREFIX,
    skipSuccessfulRequests: true,
    message: 'Too many failed login attempts, please try again later',
  });
  return _loginRateLimiter;
}
```

Trocar a mensagem de `getAuthRateLimiter` para `'Too many authentication attempts, please try again later'` e adicionar aos re-exports finais:

```ts
export { getLoginRateLimiter as loginRateLimiter };
```

Em `src/shared/middlewares/index.ts`, acrescentar `getLoginRateLimiter` ao bloco de export do `./rateLimiter`.

- [ ] **Step 6: Ajustar testes do rateLimiter do subprojeto 0**

Rodar: `node node_modules/.bin/jest tests/unit/shared/middlewares/rateLimiter --coverage=false`.
Se testes em `tests/unit/shared/middlewares/rateLimiter.test.ts` esperam que o `RedisStore` seja construído por padrão, eles falham agora porque `NODE_ENV=test` seleciona `MemoryStore`. Correção: nesses testes, em `beforeEach` fazer `process.env.NODE_ENV = 'development';` e em `afterEach` restaurar o valor original (mesmo padrão do `rateLimiter.store.test.ts`). Se esperam a mensagem antiga do auth limiter (`'...in a minute'`), atualizar para `'Too many authentication attempts, please try again later'`.

Expected após ajuste: PASS em ambos os arquivos.

- [ ] **Step 7: Rodar e medir cobertura do arquivo**

Run: `node node_modules/.bin/jest tests/unit/shared/middlewares/rateLimiter tests/unit/shared/constants --coverage --collectCoverageFrom=src/shared/middlewares/rateLimiter.ts --coverageThreshold='{}'`
Expected: PASS; `rateLimiter.ts` com 100% em todas as métricas. Se algum branch faltar (ex.: `command` vazio no `sendCommand`), adicionar em `rateLimiter.store.test.ts`:

```ts
  it('sendCommand deve rejeitar comando vazio e repassar comandos ao redis', async () => {
    process.env.NODE_ENV = 'development';
    createRateLimiter({ keyPrefix: 'rl:y:' });
    const { sendCommand } = mockRedisStoreCtor.mock.calls[0][0] as {
      sendCommand: (...args: string[]) => Promise<unknown>;
    };
    const { redis } = jest.requireMock('@/shared/database') as { redis: { call: jest.Mock } };
    redis.call.mockResolvedValue('OK');

    await expect(sendCommand()).rejects.toThrow('Redis command is required');
    await expect(sendCommand('')).rejects.toThrow('Redis command is required');
    await expect(sendCommand('GET', 'k')).resolves.toBe('OK');
    expect(redis.call).toHaveBeenCalledWith('GET', 'k');
  });
```

- [ ] **Step 8: Commit**

```bash
git add src/shared/interfaces/middleware.interfaces.ts src/shared/constants/middleware.constants.ts src/shared/constants/index.ts src/shared/middlewares/rateLimiter.ts src/shared/middlewares/index.ts tests/unit/shared/constants/index.test.ts tests/unit/shared/middlewares/rateLimiter.test.ts tests/unit/shared/middlewares/rateLimiter.store.test.ts
git commit -m "✨ feat: rate limiter com store injetável e limiter de login de 15 minutos"
```

---

### Task 8: Aplicar limiters nas rotas de auth e globalmente

**Files:**
- Modify: `src/modules/auth/routes/auth.routes.ts`
- Modify: `src/app.ts`
- Modify: `tests/feature/modules/auth/AuthController.test.ts` (mock pass-through do rate limiter)
- Modify: `tests/unit/modules/auth/routes/auth.routes.test.ts` (asserts dos limiters)
- Create: `tests/feature/modules/auth/rateLimit.test.ts`

**Interfaces:**
- Consumes: `getAuthRateLimiter`, `getLoginRateLimiter`, `getRateLimiter` (Task 7).

- [ ] **Step 1: Escrever feature test de rate limit (falha)**

`tests/feature/modules/auth/rateLimit.test.ts`:

```ts
import express, { type Application } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  changePassword: jest.fn(),
  getActiveSessions: jest.fn(),
  revokeAllSessions: jest.fn(),
  validateAccessToken: jest.fn(),
};

jest.mock('@/modules/auth/services/AuthService', () => ({
  AuthService: jest.fn(),
  authService: mockAuthService,
}));

jest.mock('@/modules/auth/services/TokenService', () => ({
  TokenService: jest.fn().mockImplementation(() => ({
    verifyAccessToken: jest.fn(),
    extractFromHeader: jest.fn(),
  })),
}));

import { authRoutes } from '@/modules/auth/routes';

describe('Rate limit de autenticação — Feature', () => {
  let app: Application;
  const credentials = { email: 'user@example.com', password: 'WrongPass123!' };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
  });

  it('6ª tentativa de login com falha deve retornar 429', async () => {
    mockAuthService.login.mockRejectedValue(
      new AppError('Credenciais inválidas', HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS)
    );

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request(app).post('/api/auth/login').send(credentials);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    }

    const blocked = await request(app).post('/api/auth/login').send(credentials);

    expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(blocked.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(blocked.headers['ratelimit-limit']).toBeDefined();
  });

  it('forgot-password deve limitar a 5 requisições', async () => {
    mockAuthService.forgotPassword.mockResolvedValue(undefined);

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' });
      expect(response.status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
    }

    const blocked = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
```

Observação: `/register`, `/forgot-password` e `/reset-password` compartilham o mesmo `authRateLimiter` (mesma chave por IP), por isso o teste de forgot-password roda num app cuja cota do `authRateLimiter` ainda não foi usada (o login usa `loginRateLimiter`, com prefixo próprio).

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node node_modules/.bin/jest tests/feature/modules/auth/rateLimit.test.ts --coverage=false`
Expected: FAIL — 6ª tentativa retorna 401, não 429.

- [ ] **Step 3: Aplicar nas rotas de auth**

Em `src/modules/auth/routes/auth.routes.ts`, adicionar import:

```ts
import { getAuthRateLimiter, getLoginRateLimiter } from '@/shared/middlewares/rateLimiter';
```

e trocar as quatro rotas públicas sensíveis:

```ts
router.post(
  '/register',
  getAuthRateLimiter(),
  asyncHandler((req, res) => authController.register(req, res))
);
```

```ts
router.post(
  '/login',
  getLoginRateLimiter(),
  asyncHandler((req, res) => authController.login(req, res))
);
```

```ts
router.post(
  '/forgot-password',
  getAuthRateLimiter(),
  asyncHandler((req, res) => authController.forgotPassword(req, res))
);
```

```ts
router.post(
  '/reset-password',
  getAuthRateLimiter(),
  asyncHandler((req, res) => authController.resetPassword(req, res))
);
```

(Importar de `@/shared/middlewares/rateLimiter` direto, não do index, para não carregar multer/upload nas rotas de auth.)

- [ ] **Step 4: Limiter global em `src/app.ts`**

Adicionar `getRateLimiter` ao import de `./shared/middlewares` e, logo após `app.use(requestLogger);`:

```ts
app.use('/api', getRateLimiter());
```

- [ ] **Step 5: Pass-through do limiter nos testes existentes de auth**

Em `tests/feature/modules/auth/AuthController.test.ts`, adicionar junto aos outros `jest.mock` (antes do `import { authRoutes } ...`):

```ts
jest.mock('@/shared/middlewares/rateLimiter', () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  };
  return {
    getAuthRateLimiter: () => passThrough,
    getLoginRateLimiter: () => passThrough,
    getRateLimiter: () => passThrough,
    getStrictRateLimiter: () => passThrough,
    createRateLimiter: () => passThrough,
  };
});
```

Em `tests/unit/modules/auth/routes/auth.routes.test.ts`, adicionar junto aos outros `jest.mock` um mock com limiters identificáveis. O factory deve ser autocontido (sem referenciar `const` de fora), porque `auth.routes` é importado na linha 1 do arquivo e chama os getters no load, antes de qualquer `const` do teste ser inicializada:

```ts
jest.mock('@/shared/middlewares/rateLimiter', () => {
  const authLimiter = function authLimiter(): void {};
  const loginLimiter = function loginLimiter(): void {};
  return {
    getAuthRateLimiter: () => authLimiter,
    getLoginRateLimiter: () => loginLimiter,
  };
});
```

e dentro de `describe('route definitions', ...)`:

```ts
    it('deve aplicar rate limiters nas rotas públicas sensíveis', () => {
      const limiters = jest.requireMock('@/shared/middlewares/rateLimiter') as {
        getAuthRateLimiter: () => unknown;
        getLoginRateLimiter: () => unknown;
      };
      const stack = (authRoutes as Router).stack as Array<{
        route?: { path: string; stack: Array<{ handle: unknown }> };
      }>;
      const firstHandler = (path: string): unknown =>
        stack.find((layer) => layer.route?.path === path)?.route?.stack[0]?.handle;

      expect(firstHandler('/login')).toBe(limiters.getLoginRateLimiter());
      expect(firstHandler('/register')).toBe(limiters.getAuthRateLimiter());
      expect(firstHandler('/forgot-password')).toBe(limiters.getAuthRateLimiter());
      expect(firstHandler('/reset-password')).toBe(limiters.getAuthRateLimiter());
    });
```

- [ ] **Step 6: Rodar testes de auth**

Run: `node node_modules/.bin/jest tests/feature/modules/auth tests/unit/modules/auth --coverage=false`
Expected: PASS (incluindo `rateLimit.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth/routes/auth.routes.ts src/app.ts tests/feature/modules/auth/AuthController.test.ts tests/feature/modules/auth/rateLimit.test.ts tests/unit/modules/auth/routes/auth.routes.test.ts
git commit -m "🔒 feat: aplica rate limit em login, registro e recuperação de senha"
```

---

### Task 9: Verificação completa, smoke test real, SRS e PR

**Files:**
- Modify: `.github/SRS.md` (Sprint 4)

- [ ] **Step 1: Suite completa + lint + build**

```bash
node node_modules/.bin/jest
npm run lint
npm run format:check
npm run build
```

Expected: todos os testes passam; threshold global 90% OK; lint sem erros (o script usa `--fix`; se alterar arquivos, incluí-los no commit); build sem erros.

- [ ] **Step 2: Conferir 100% nos arquivos novos/alterados**

```bash
node node_modules/.bin/jest --coverage --coverageReporters=text \
  --collectCoverageFrom='src/modules/user/controllers/{helpers,ContactController,BlockController,UserController}.ts' \
  --collectCoverageFrom='src/modules/user/routes/{contact,block,user}.routes.ts' \
  --collectCoverageFrom='src/modules/user/services/ContactService.ts' \
  --collectCoverageFrom='src/shared/middlewares/rateLimiter.ts' \
  --coverageThreshold='{}'
```

Expected: 100% em todas as colunas para cada arquivo listado. Faltou algo → adicionar teste no arquivo de teste correspondente da task que criou o código.

- [ ] **Step 3: Smoke test contra a stack real**

```bash
docker compose up -d
docker exec rtm-app npm run db:migrate
```

Com a app rodando (`docker compose logs -f real-time-app` mostra "listening"), executar:

```bash
BASE=http://localhost:3000/api
reg() { curl -s -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"Password123!\",\"displayName\":\"$1\"}"; }
reg smokeana >/dev/null; reg smokebob >/dev/null
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"smokeana@example.com","password":"Password123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.tokens.accessToken')
BOB=$(curl -s "$BASE/users/search?query=smokebob" -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data[0].id')
echo "bob=$BOB"
curl -s -o /dev/null -w "add=%{http_code}\n" -X POST $BASE/contacts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"contactId\":\"$BOB\"}"
curl -s -o /dev/null -w "block=%{http_code}\n" -X POST $BASE/blocks -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"userId\":\"$BOB\"}"
curl -s "$BASE/users/search?query=smokebob" -H "Authorization: Bearer $TOKEN"; echo
curl -s -o /dev/null -w "unblock=%{http_code}\n" -X DELETE $BASE/blocks/$BOB -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/users/search?query=smokebob" -H "Authorization: Bearer $TOKEN"; echo
```

Expected: `bob=<uuid>`, `add=201`, `block=201`, primeira busca com `"data":[]`, `unblock=204`, segunda busca retorna smokebob.

Se o caminho do access token no JSON de login for diferente de `data.tokens.accessToken`, ajustar o `node -pe` conforme a resposta real de `/auth/login`. Se a busca após o bloqueio ainda retornar o usuário, é bug em `UserRepository.search` com `excludeBlocked` — corrigir com TDD (teste em `tests/unit/modules/user/repositories/UserRepository.test.ts`) antes de seguir.

- [ ] **Step 4: Atualizar SRS (local, não commitar) e READMEs**

Atualizar `README.md` e `README.pt-BR.md` (seção "What exists today"/equivalente e roadmap) com os endpoints novos (`/api/contacts`, `/api/blocks`, `/api/users/search`) e o rate limit, no mesmo estilo das tabelas existentes.

Em `.github/SRS.md` (arquivo local, fora do git), na Sprint 4, marcar todas as tarefas como `[x]`, alterar o título para `### 📅 Sprint 4 (Semana 4): Módulo de Usuários ✅` e trocar `- [ ] Implementar testes completos` por `- [x] Implementar testes completos (controllers, rotas, feature tests; 100% nos arquivos novos)`.

- [ ] **Step 5: Commit e PR**

```bash
git add README.md README.pt-BR.md
git commit -m "📝 docs: documenta endpoints de contatos, bloqueios, busca e rate limit"
git push -u origin feature/user-contacts-blocks
gh pr create --base main --title "✨ Sprint 4: contatos, bloqueios, busca de usuários e rate limit" --body "$(cat <<'EOF'
## Resumo
- `ContactController`, `BlockController`, `UserController` + rotas `/api/contacts`, `/api/blocks`, `/api/users/search`
- `ContactService` publica `user:blocked` / `user:unblocked` no EventBus
- Rate limit: login 5 falhas / 15 min; register, forgot-password e reset-password 5 req / 15 min; global 100 req / 15 min em `/api`
- `createRateLimiter` aceita `store` injetável (MemoryStore em testes)

## Requisitos
RF001.2 (rate limit), RF002.2 (contatos, busca), RF002.3 (bloqueio — REST)

## Testes
- Unitários de controllers, rotas, eventos e rate limiter
- Feature tests HTTP com supertest
- Smoke test manual contra docker compose
EOF
)"
```

Expected: URL do PR impressa.
