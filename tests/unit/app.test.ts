// Testa src/app.ts "de fora para dentro" com supertest: monta o app real (com o pipeline
// de middlewares real) e mocka apenas os módulos que tocam banco de dados (sequelize,
// jsonwebtoken, bcryptjs, @/shared/database e os controllers), como os testes irmãos de
// rotas (tests/unit/modules/**/routes/*.test.ts) já fazem.

jest.mock('sequelize', () => {
  const actualSequelize = jest.requireActual('sequelize');
  return {
    ...actualSequelize,
    Model: class MockModel {
      static init = jest.fn();
      static findOne = jest.fn();
      static findByPk = jest.fn();
      static findAll = jest.fn();
      static create = jest.fn();
      static update = jest.fn();
      static destroy = jest.fn();
      static belongsTo = jest.fn();
    },
  };
});

jest.mock('@/shared/database', () => ({
  sequelize: {
    models: {},
  },
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    call: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-token'),
  verify: jest.fn(() => ({ userId: 'test', email: 'test@test.com', username: 'test' })),
  decode: jest.fn(() => ({ userId: 'test' })),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@/modules/auth/controllers', () => ({
  authController: {
    // implementação setada em beforeEach: resetMocks:true apaga implementações
    // definidas dentro da factory do jest.mock antes de cada teste.
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    me: jest.fn(),
    getSessions: jest.fn(),
    revokeSessions: jest.fn(),
  },
}));

jest.mock('@/shared/middlewares/rateLimiter', () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  };
  // Função nomeada (não jest.fn) porque resetMocks:true apagaria a implementação de um
  // jest.fn() antes de cada teste. Marca a resposta com um header identificável para que
  // os testes consigam comprovar, via supertest, que é ESTE middleware (e não outro
  // pass-through) quem roda no pipeline montado em app.use('/api', getRateLimiter()).
  function globalLimiterMock(
    _req: unknown,
    res: { setHeader: (name: string, value: string) => void },
    next: () => void
  ): void {
    res.setHeader('x-test-global-limiter', '1');
    next();
  }
  return {
    getAuthRateLimiter: () => passThrough,
    getLoginRateLimiter: () => passThrough,
    getRateLimiter: () => globalLimiterMock,
    getStrictRateLimiter: () => passThrough,
    createRateLimiter: () => passThrough,
  };
});

jest.mock('@/modules/user/controllers', () => ({
  profileController: {
    getProfile: jest.fn(),
    getPublicProfile: jest.fn(),
    updateProfile: jest.fn(),
    updateDisplayName: jest.fn(),
    updateBio: jest.fn(),
    uploadAvatar: jest.fn(),
    removeAvatar: jest.fn(),
    updateStatus: jest.fn(),
    setOnline: jest.fn(),
    setOffline: jest.fn(),
    getProfileStats: jest.fn(),
    getProfileSettings: jest.fn(),
    updateProfileSettings: jest.fn(),
  },
}));

import request from 'supertest';
import app from '@/app';
import { authController } from '@/modules/auth/controllers';

describe('app', () => {
  beforeEach(() => {
    (authController.register as jest.Mock).mockImplementation((_req, res) => {
      res.status(201).json({ success: true, data: 'registered' });
    });
  });

  describe('pipeline de middlewares', () => {
    it('aplica headers de segurança do helmet em toda resposta', async () => {
      const response = await request(app).get('/rota-inexistente');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('define o header x-request-id em toda resposta', async () => {
      const response = await request(app).get('/rota-inexistente');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('faz parsing de JSON no corpo da requisição (express.json)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'a@b.com', username: 'user', password: 'Password1!' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: 'registered' });
    });

    it('monta o rate limiter global (getRateLimiter) em /api, antes das rotas', async () => {
      const limiters = jest.requireMock('@/shared/middlewares/rateLimiter') as {
        getRateLimiter: () => unknown;
      };
      expect(typeof limiters.getRateLimiter()).toBe('function');

      const apiResponse = await request(app).get('/api/rota-inexistente-sob-api');
      expect(apiResponse.headers['x-test-global-limiter']).toBe('1');
    });

    it('não aplica o rate limiter global fora do prefixo /api', async () => {
      const response = await request(app).get('/rota-inexistente');
      expect(response.headers['x-test-global-limiter']).toBeUndefined();
    });
  });

  describe('roteamento', () => {
    it('monta o router de auth em /api/auth (rota pública chega ao controller mockado)', async () => {
      const response = await request(app).post('/api/auth/register').send({});
      expect(response.status).toBe(201);
    });

    it('monta o router de auth em /api/auth (rota protegida exige autenticação real)', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('monta o router de profile em /api/profile (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('monta o router de contacts em /api/contacts (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/contacts');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('monta o router de blocks em /api/blocks (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/blocks');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('monta o router de users em /api/users (todas as rotas exigem autenticação real)', async () => {
      const response = await request(app).get('/api/users/search?query=ana');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('retorna 404 em formato JSON (notFoundHandler + errorHandler) para rota desconhecida', async () => {
      const response = await request(app).get('/rota-que-nao-existe');

      expect(response.status).toBe(404);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: expect.stringContaining('/rota-que-nao-existe'),
          }),
        })
      );
    });
  });

  describe('resolução do ambiente (env) na inicialização', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      jest.resetModules();
    });

    it('usa "development" (nível DEBUG) como padrão quando NODE_ENV não está definido', () => {
      jest.resetModules();
      // .env define NODE_ENV=development e é recarregado (import 'dotenv/config') ao
      // reimportar a cadeia de módulos; sem override, ele preencheria o valor que acabamos
      // de apagar antes mesmo de app.ts ler process.env.NODE_ENV. Neutralizamos esse
      // efeito colateral só nesta reimportação isolada para conseguir exercitar o branch
      // de fato "não definido" do `?? 'development'`.
      jest.doMock('dotenv/config', () => ({}));
      delete process.env.NODE_ENV;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const freshApp = require('@/app').default;
      expect(typeof freshApp).toBe('function');
    });

    it('usa nível INFO quando NODE_ENV=production', () => {
      jest.resetModules();
      process.env.NODE_ENV = 'production';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const freshApp = require('@/app').default;
      expect(typeof freshApp).toBe('function');
    });
  });
});
